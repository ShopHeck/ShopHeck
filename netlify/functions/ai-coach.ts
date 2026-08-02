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
// Entitlement is resolved most-trusted-first:
//   1. COMP_PRO_EMAILS      — server env allowlist (founder/reviewer accounts)
//   2. stripe_subscriptions — server-authoritative (Stripe webhook writes it)
//   3. user_state.subscription — the client-synced mirror. This is what lets an
//      App Store (RevenueCat) subscriber through, because no RevenueCat→server
//      bridge exists yet. It is client-attested and therefore forgeable — an
//      accepted MVP tradeoff, because the monthly quota caps the worst-case
//      abuse at well under a dollar. Replace with a RevenueCat webhook when the
//      native app adds RevenueCat.logIn(<supabase user id>).
//
// Cost control (why this can't run away):
//   - AI_MODEL defaults to claude-haiku-4-5 ($1/M in, $5/M out). A worst-case
//     call (~2K in / 2K out) is about one cent; a Pro user exhausting the
//     default 40-call monthly quota costs $0.26–0.48 — under 6% of $7.99.
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

const json = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req: Request): Promise<Response> => {
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

  // ── Entitlement (most-trusted source first) ───────────────────────────────
  const compEmails = new Set(
    (process.env.COMP_PRO_EMAILS ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean),
  );
  let isPro = !!user.email && compEmails.has(user.email.toLowerCase());

  if (!isPro) {
    const { data: sub } = await supabase
      .from('stripe_subscriptions')
      .select('tier,status,current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    if (sub) {
      const activeStatus = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
      const unexpired = !sub.current_period_end || new Date(sub.current_period_end) > new Date();
      isPro = activeStatus && unexpired && (sub.tier === 'fighter_pro' || sub.tier === 'coach_pro');
    }
  }

  if (!isPro) {
    // Client-attested fallback for App Store subscribers — see the header note.
    const { data: st } = await supabase
      .from('user_state')
      .select('subscription')
      .eq('user_id', user.id)
      .maybeSingle();
    const mirror = st?.subscription as { tier?: string; expiresAt?: string | null } | null;
    if (mirror && (mirror.tier === 'fighter_pro' || mirror.tier === 'coach_pro')) {
      isPro = !mirror.expiresAt || new Date(mirror.expiresAt) > new Date();
    }
  }

  if (FEATURES[feature].proOnly && !isPro) {
    return json(403, 'upgrade_required', 'This analysis is part of Fighter Pro.');
  }

  // ── Monthly quota (atomic; see increment_ai_usage in supabase/schema.sql) ─
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
    return json(503, 'not_configured', 'The AI coach is not fully configured (usage table missing).');
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

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        // Mid-stream failure: the client keeps whatever streamed and shows a
        // retry message; erroring the controller aborts its reader cleanly.
        console.error('ai-coach stream error:', err);
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
    },
  });
};
