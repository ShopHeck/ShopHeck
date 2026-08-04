// AI Coach proxy — the app's own Anthropic key, server-side.
//
// The app's three AI features (camp insights, cut coach, post-fight breakdown)
// call this endpoint instead of api.anthropic.com. Subscribers get the AI as
// part of Fighter/Coach Pro with no setup; the API key never ships to a device.
//
// Request:  POST /.netlify/functions/ai-coach
//           Authorization: Bearer <supabase access token>
//           { "feature": "insights" | "cut" | "postfight", "prompt": "<built by the app>" }
// Response: 200 streaming text/plain (the analysis, streamed as it generates,
//           with an x-ai-remaining header carrying the month's remaining quota)
//           or JSON { code, message } with:
//           401 signin_required · 403/402-style upgrade_required ·
//           429 quota_exhausted · 400 bad request · 503 not_configured
//
// Entitlement is resolved only from server-authoritative sources:
//   1. COMP_PRO_EMAILS      — server env allowlist (founder/reviewer accounts)
//   2. stripe_subscriptions — Stripe signature-verified webhook writes it
//   3. revenuecat_subscriptions — RevenueCat authenticated webhook writes it
//
// Client-synced user_state is intentionally never consulted. A device may cache
// UI access for offline use, but it cannot authorize spend from the server key.
//
// Cost control:
//   - AI_MODEL defaults to claude-haiku-4-5.
//   - Quotas are enforced atomically in Postgres (increment_ai_usage), input
//     length is capped, and max_tokens is fixed per feature.
//
// Required Netlify env vars (server only — never VITE_ prefixed):
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   AI_MODEL (default claude-haiku-4-5), AI_QUOTA_PRO (default 40),
//   AI_QUOTA_FREE (default 3), COMP_PRO_EMAILS (comma-separated)

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

type Feature = 'insights' | 'cut' | 'postfight';

// max_tokens per feature mirrors (with headroom) what the client used to pass.
// `proOnly` matches the app's gates: insights and cut sit behind Fighter Pro;
// postfight is the free tier's deliberate taster, bounded by AI_QUOTA_FREE.
const FEATURES: Record<Feature, { maxTokens: number; proOnly: boolean }> = {
  insights: { maxTokens: 3000, proOnly: true },
  cut: { maxTokens: 1024, proOnly: true },
  postfight: { maxTokens: 2048, proOnly: false },
};

const MAX_PROMPT_CHARS = 24_000;

// The prompts are built by the app from structured camp data, but the endpoint
// is reachable by hand — the system prompt keeps the org's key scoped to
// coaching output rather than a general-purpose LLM.
const SYSTEM_PROMPT =
  'You are the in-app AI coach for Fight Camp Training, a combat-sports camp ' +
  'planner. The user message contains structured training data and an output ' +
  'template assembled by the app; follow the template exactly and keep a ' +
  'direct coach voice. Only produce combat-sports coaching analysis — if the ' +
  'message asks for anything else, reply with one sentence saying you can ' +
  'only analyze fight-camp data. Safety first on weight cuts: never recommend ' +
  'dangerous dehydration, and tell the fighter to involve a coach or doctor ' +
  'when a cut looks medically risky.';

// The native iOS app runs from capacitor://localhost, so its requests are
// cross-origin and WKWebView preflights them (Authorization + JSON headers).
// Auth is a bearer token — never cookies — so a wildcard origin is safe: the
// token itself is the credential, and CORS with `*` never sends cookies.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-expose-headers': 'x-ai-remaining',
  'access-control-max-age': '86400',
};

const json = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });

export default async (req: Request): Promise<Response> => {
  // Preflights carry no auth and must succeed before the real POST can happen.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, 'method_not_allowed', 'POST only.');

  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, 'not_configured', 'The AI coach is not configured on this server yet.');
  }

  // ── Who is asking ─────────────────────────────────────────────────────────
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, 'signin_required', 'Sign in to use your included AI coach.');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) return json(401, 'signin_required', 'Sign in to use your included AI coach.');

  // ── What is being asked ───────────────────────────────────────────────────
  let feature: Feature;
  let prompt: string;
  try {
    const body = (await req.json()) as { feature?: string; prompt?: string };
    if (!body.feature || !(body.feature in FEATURES) || typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return json(400, 'bad_request', 'Expected { feature, prompt }.');
    }
    feature = body.feature as Feature;
    prompt = body.prompt;
  } catch {
    return json(400, 'bad_request', 'Invalid JSON body.');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return json(400, 'bad_request', 'Prompt too large.');
  }

  // ── Entitlement (server-authoritative sources only) ───────────────────────
  const compEmails = new Set(
    (process.env.COMP_PRO_EMAILS ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean),
  );
  let isPro = !!user.email && compEmails.has(user.email.toLowerCase());

  if (!isPro) {
    const { data: sub, error } = await supabase
      .from('stripe_subscriptions')
      .select('tier,status,current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) console.error('ai-coach Stripe entitlement read:', error.message);
    if (sub) {
      const activeStatus = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
      const unexpired = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
      isPro = activeStatus && unexpired && (sub.tier === 'fighter_pro' || sub.tier === 'coach_pro');
    }
  }

  if (!isPro) {
    const { data: rc, error } = await supabase
      .from('revenuecat_subscriptions')
      .select('tier,expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) console.error('ai-coach RevenueCat entitlement read:', error.message);
    if (rc && (rc.tier === 'fighter_pro' || rc.tier === 'coach_pro')) {
      isPro = !rc.expires_at || new Date(rc.expires_at) > new Date();
    }
  }

  if (FEATURES[feature].proOnly && !isPro) {
    return json(403, 'upgrade_required', 'This analysis is part of Fighter Pro.');
  }

  // ── Monthly quota (atomic; see increment_ai_usage in Supabase migration) ──
  const quota = isPro
    ? Number(process.env.AI_QUOTA_PRO ?? 40)
    : Number(process.env.AI_QUOTA_FREE ?? 3);
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM, UTC

  const { data: remaining, error: quotaErr } = await supabase.rpc('increment_ai_usage', {
    p_user_id: user.id,
    p_month: month,
    p_limit: quota,
  });
  if (quotaErr) {
    console.error('ai-coach quota error:', quotaErr.message);
    return json(503, 'not_configured', 'The AI coach is not fully configured (usage table or permissions missing).');
  }
  if (typeof remaining === 'number' && remaining < 0) {
    return isPro
      ? json(429, 'quota_exhausted', `You've used this month's ${quota} included analyses. Your quota resets next month.`)
      : json(403, 'upgrade_required', `You've used your free analyses for this month. Fighter Pro includes the full AI coach.`);
  }

  // ── Stream the analysis ───────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const model = process.env.AI_MODEL || 'claude-haiku-4-5';

  const stream = anthropic.messages.stream({
    model,
    max_tokens: FEATURES[feature].maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  // Give the consumed quota unit back — best-effort — when generation fails
  // before the user received anything. Once text has streamed, the unit stays
  // spent: partial output has value, and refunding after output would allow
  // induced disconnects to mint free calls.
  const refundQuota = async (): Promise<void> => {
    const { error } = await supabase.rpc('refund_ai_usage', {
      p_user_id: user.id,
      p_month: month,
    });
    if (error) console.error('ai-coach refund error:', error.message);
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentAny = false;
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            sentAny = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        console.error('ai-coach stream error:', err);
        if (!sentAny) await refundQuota();
        controller.error(err);
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-ai-remaining': String(remaining ?? ''),
      ...CORS_HEADERS,
    },
  });
};
