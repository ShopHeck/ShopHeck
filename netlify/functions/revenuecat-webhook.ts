// RevenueCat webhook — server-authoritative App Store entitlements.
//
// RevenueCat calls this endpoint on every subscription lifecycle event
// (purchase, renewal, cancellation, expiration, billing issue…). We check the
// shared-secret Authorization header, resolve which Supabase user the event
// belongs to, and upsert the entitlement into `public.revenuecat_subscriptions`
// with the service-role key (bypasses RLS). That row — not the client-synced
// `user_state.subscription` mirror — is what server code (ai-coach) and the web
// app trust for App Store subscribers.
//
// Attribution requires the native app to have called
// `Purchases.shared.logIn(<supabase user id>)` (see RevenueCatPlugin.swift):
// events then carry the Supabase uuid as app_user_id, or at least list it in
// `aliases` when the purchase predates the login. Events whose ids are all
// anonymous (`$RCAnonymousID:…`) are acknowledged and skipped — there is no
// account to attach them to, and returning an error would only make RevenueCat
// retry an event that can never succeed.
//
// Endpoint (register in the RevenueCat dashboard → Project → Integrations →
// Webhooks — see docs/revenuecat-webhook.md):
//   https://fightcamp.netlify.app/.netlify/functions/revenuecat-webhook
//
// Required Netlify env vars (server only, never VITE_ prefixed):
//   REVENUECAT_WEBHOOK_SECRET — must equal the webhook's Authorization header
//     value configured in the RevenueCat dashboard ("Bearer …" prefix optional)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// The subset of RevenueCat's event payload we consume.
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
interface RcEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  environment?: string;            // PRODUCTION | SANDBOX
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Entitlement identifiers as configured in RevenueCat (they match
// RevenueCatPlugin.swift's tierFromEntitlements). Coach Pro is checked first —
// it's the superset tier when a product grants both.
const tierFor = (entitlementIds: string[]): 'coach_pro' | 'fighter_pro' | null => {
  if (entitlementIds.includes('Coach Pro')) return 'coach_pro';
  if (entitlementIds.includes('Fight Camp Pro')) return 'fighter_pro';
  return null;
};

// Constant-time comparison via digests so differing lengths don't throw and
// the compare doesn't leak position information.
const secretMatches = (provided: string, secret: string): boolean => {
  const norm = (s: string) => s.replace(/^Bearer\s+/i, '').trim();
  const a = createHash('sha256').update(norm(provided)).digest();
  const b = createHash('sha256').update(norm(secret)).digest();
  return timingSafeEqual(a, b);
};

// 2xx tells RevenueCat the event is handled; anything else is retried with
// backoff. Deliberate skips must therefore be 200s, and only genuinely
// transient failures (DB down) may 5xx.
const ok = (note: string): Response =>
  new Response(JSON.stringify({ received: true, note }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  const { REVENUECAT_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!REVENUECAT_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Webhook not configured', { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (!auth || !secretMatches(auth, REVENUECAT_WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: RcEvent;
  try {
    const body = (await req.json()) as { event?: RcEvent };
    if (!body.event || typeof body.event !== 'object') {
      return new Response('Missing event', { status: 400 });
    }
    event = body.event;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Dashboard "send test event" button.
  if (event.type === 'TEST') return ok('test event');

  // TRANSFER moves entitlements between subscribers and carries no
  // entitlement_ids; the destination user's next real event (or the client
  // SDK) carries the truth. Skipping keeps this handler single-shaped.
  if (event.type === 'TRANSFER') return ok('transfer events are not mirrored');

  // Which Supabase account? Any id RevenueCat knows for this subscriber that
  // looks like a Supabase uuid — app_user_id once logIn ships, or an alias
  // when the purchase happened while still anonymous.
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  const userId = candidates.find(id => !!id && UUID_RE.test(id));
  if (!userId) return ok('no Supabase user id among subscriber aliases');

  const tier = tierFor(event.entitlement_ids ?? []);
  if (!tier) return ok(`no known entitlement on ${event.type ?? 'event'}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const eventAt = event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : null;

  try {
    // Webhooks are retried and can arrive out of order; an older event must
    // not overwrite a newer state (e.g. RENEWAL landing after EXPIRATION).
    // Equal timestamps re-apply — the upsert is idempotent, so redelivery of
    // the same event is harmless.
    if (eventAt) {
      const { data: existing, error: readErr } = await supabase
        .from('revenuecat_subscriptions')
        .select('last_event_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (readErr) throw new Error(`read failed: ${readErr.message}`);
      if (existing?.last_event_at && new Date(eventAt) < new Date(existing.last_event_at)) {
        return ok('stale event (newer state already recorded)');
      }
    }

    const { error } = await supabase.from('revenuecat_subscriptions').upsert(
      {
        user_id: userId,
        rc_app_user_id: event.app_user_id ?? null,
        tier,
        product_id: event.product_id ?? null,
        environment: event.environment ?? null,
        expires_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
        last_event_type: event.type ?? null,
        last_event_at: eventAt,
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  } catch (err) {
    // 5xx → RevenueCat retries with backoff rather than dropping the event.
    console.error('revenuecat-webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return ok('entitlement recorded');
};
