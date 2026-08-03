// RevenueCat webhook — server-authoritative App Store entitlements.
//
// RevenueCat calls this endpoint on every subscription lifecycle event. We
// check the shared-secret Authorization header, resolve which Supabase user the
// event belongs to, and upsert the entitlement using the service-role key.
//
// Required Netlify env vars (server only, never VITE_ prefixed):
//   REVENUECAT_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

interface RcEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  environment?: string;            // PRODUCTION | SANDBOX
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  transferred_from?: string[];
  transferred_to?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tierFor = (entitlementIds: string[]): 'coach_pro' | 'fighter_pro' | null => {
  if (entitlementIds.includes('Coach Pro')) return 'coach_pro';
  if (entitlementIds.includes('Fight Camp Pro')) return 'fighter_pro';
  return null;
};

const secretMatches = (provided: string, secret: string): boolean => {
  const norm = (s: string) => s.replace(/^Bearer\s+/i, '').trim();
  const a = createHash('sha256').update(norm(provided)).digest();
  const b = createHash('sha256').update(norm(secret)).digest();
  return timingSafeEqual(a, b);
};

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

  if (event.type === 'TEST') return ok('test event');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // TRANSFER is the only event RevenueCat guarantees for moving an entitlement
  // between subscriber identities. Move the latest mirrored source grant to the
  // destination, then remove every source row so the former account cannot keep
  // server-side access. Redelivery is safe: once sources are gone the already-
  // moved destination row is left intact.
  if (event.type === 'TRANSFER') {
    const fromIds = (event.transferred_from ?? []).filter(id => UUID_RE.test(id));
    const toId = (event.transferred_to ?? []).find(id => UUID_RE.test(id));
    if (!toId) return ok('transfer has no Supabase destination id');

    try {
      let source: {
        tier: string;
        product_id: string | null;
        environment: string | null;
        expires_at: string | null;
        last_event_at: string | null;
      } | null = null;

      if (fromIds.length > 0) {
        const { data, error } = await supabase
          .from('revenuecat_subscriptions')
          .select('tier,product_id,environment,expires_at,last_event_at')
          .in('user_id', fromIds)
          .order('last_event_at', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(`transfer source lookup failed: ${error.message}`);
        source = data;
      }

      if (source && (source.tier === 'fighter_pro' || source.tier === 'coach_pro')) {
        const { error } = await supabase.rpc('record_revenuecat_event', {
          p_user_id: toId,
          p_rc_app_user_id: toId,
          p_tier: source.tier,
          p_product_id: source.product_id,
          p_environment: event.environment ?? source.environment,
          p_expires_at: source.expires_at,
          p_event_type: 'TRANSFER',
          p_event_at: event.event_timestamp_ms
            ? new Date(event.event_timestamp_ms).toISOString()
            : source.last_event_at ?? new Date().toISOString(),
        });
        if (error) throw new Error(`transfer destination write failed: ${error.message}`);
      }

      if (fromIds.length > 0) {
        const { error } = await supabase
          .from('revenuecat_subscriptions')
          .delete()
          .in('user_id', fromIds);
        if (error) throw new Error(`transfer source revoke failed: ${error.message}`);
      }

      return ok(source ? 'entitlement transferred' : 'source grant absent; destination left unchanged');
    } catch (err) {
      console.error('revenuecat transfer error:', err);
      return new Response('Handler error', { status: 500 });
    }
  }

  // Which Supabase account? Any id RevenueCat knows for this subscriber that
  // looks like a Supabase uuid — app_user_id once logIn ships, or an alias.
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  const userId = candidates.find(id => !!id && UUID_RE.test(id));
  if (!userId) return ok('no Supabase user id among subscriber aliases');

  const tier = tierFor(event.entitlement_ids ?? []);
  if (!tier) return ok(`no known entitlement on ${event.type ?? 'event'}`);

  let outcome: unknown;
  try {
    const { data, error } = await supabase.rpc('record_revenuecat_event', {
      p_user_id: userId,
      p_rc_app_user_id: event.app_user_id ?? null,
      p_tier: tier,
      p_product_id: event.product_id ?? null,
      p_environment: event.environment ?? null,
      p_expires_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
      p_event_type: event.type ?? null,
      p_event_at: event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : null,
    });
    if (error) throw new Error(`record_revenuecat_event failed: ${error.message}`);
    outcome = data;
  } catch (err) {
    // 5xx → RevenueCat retries with backoff rather than dropping the event.
    console.error('revenuecat-webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return ok(outcome === 'recorded' ? 'entitlement recorded' : 'skipped (stale, or sandbox under a production row)');
};
