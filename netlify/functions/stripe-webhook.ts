// Stripe webhook — server-authoritative web entitlements.
//
// Stripe calls this endpoint when a checkout completes or a subscription
// changes. We verify the signature, resolve which Supabase user the event
// belongs to, and upsert verified state into `public.stripe_subscriptions`.
//
// Required server-only env vars:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   STRIPE_FIGHTER_MONTHLY_PRICE_ID, STRIPE_FIGHTER_ANNUAL_PRICE_ID,
//   STRIPE_COACH_MONTHLY_PRICE_ID, STRIPE_COACH_ANNUAL_PRICE_ID
// Optional comma-separated additional price allowlists:
//   STRIPE_FIGHTER_PRICE_IDS, STRIPE_COACH_PRICE_IDS

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const priceSet = (csv: string | undefined, ...explicit: Array<string | undefined>): ReadonlySet<string> =>
  new Set([
    ...(csv ?? '').split(',').map(value => value.trim()).filter(Boolean),
    ...explicit.map(value => value?.trim()).filter((value): value is string => Boolean(value)),
  ]);

export default async (req: Request): Promise<Response> => {
  const {
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_FIGHTER_PRICE_IDS,
    STRIPE_COACH_PRICE_IDS,
    STRIPE_FIGHTER_MONTHLY_PRICE_ID,
    STRIPE_FIGHTER_ANNUAL_PRICE_ID,
    STRIPE_COACH_MONTHLY_PRICE_ID,
    STRIPE_COACH_ANNUAL_PRICE_ID,
  } = process.env;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Webhook not configured', { status: 500 });
  }

  const fighterPriceIds = priceSet(
    STRIPE_FIGHTER_PRICE_IDS,
    STRIPE_FIGHTER_MONTHLY_PRICE_ID,
    STRIPE_FIGHTER_ANNUAL_PRICE_ID,
  );
  const coachPriceIds = priceSet(
    STRIPE_COACH_PRICE_IDS,
    STRIPE_COACH_MONTHLY_PRICE_ID,
    STRIPE_COACH_ANNUAL_PRICE_ID,
  );
  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature', { status: 400 });

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  /** Unknown products grant nothing. Exact price ids take priority; exact names
   *  are a backwards-compatible fallback for subscriptions created before the
   *  price allowlists were deployed. */
  const tierFor = (
    priceId: string | null | undefined,
    productName: string | null | undefined,
  ): 'coach_pro' | 'fighter_pro' | null => {
    if (priceId && coachPriceIds.has(priceId)) return 'coach_pro';
    if (priceId && fighterPriceIds.has(priceId)) return 'fighter_pro';

    const normalized = productName?.trim().toLowerCase();
    if (normalized === 'coach pro') return 'coach_pro';
    if (normalized === 'fighter pro') return 'fighter_pro';
    return null;
  };

  const recordUnattributed = async (input: {
    reason: string;
    checkoutSessionId?: string | null;
    subscriptionId?: string | null;
    customerId?: string | null;
    customerEmail?: string | null;
    eventType: string;
  }): Promise<void> => {
    const { error } = await supabase.from('unattributed_stripe_events').upsert({
      event_id: event.id,
      event_type: input.eventType,
      reason: input.reason,
      checkout_session_id: input.checkoutSessionId ?? null,
      stripe_subscription_id: input.subscriptionId ?? null,
      stripe_customer_id: input.customerId ?? null,
      customer_email: input.customerEmail ?? null,
    }, { onConflict: 'event_id' });
    if (error) throw new Error(`could not record unattributed Stripe event: ${error.message}`);
  };

  const syncSubscription = async (userId: string, subscriptionId: string): Promise<boolean> => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });
    const item = sub.items?.data?.[0];
    if (!item) throw new Error(`subscription ${sub.id} has no line item`);

    const product = item.price.product as Stripe.Product | Stripe.DeletedProduct | string | undefined;
    const productName = product && typeof product === 'object' && 'name' in product ? product.name : null;
    const tier = tierFor(item.price.id, productName);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;

    if (!tier) {
      await recordUnattributed({
        reason: `unrecognized price/product: ${item.price.id} / ${productName ?? 'unnamed'}`,
        subscriptionId: sub.id,
        customerId,
        eventType: event.type,
      });
      return false;
    }

    const periodEnd =
      (sub as { current_period_end?: number }).current_period_end ??
      (item as { current_period_end?: number } | undefined)?.current_period_end ??
      null;

    const { error } = await supabase.from('stripe_subscriptions').upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        tier,
        status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`supabase entitlement upsert failed: ${error.message}`);
    return true;
  };

  const userIdForCustomer = async (customerId: string | null): Promise<string | null> => {
    if (!customerId) return null;
    const { data, error } = await supabase
      .from('stripe_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (error) throw new Error(`customer entitlement lookup failed: ${error.message}`);
    return (data?.user_id as string | undefined) ?? null;
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id ?? session.metadata?.supabase_user_id ?? null;
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

        if (!userId || !subscriptionId) {
          await recordUnattributed({
            reason: !userId ? 'missing Supabase user id' : 'missing subscription id',
            checkoutSessionId: session.id,
            subscriptionId: subscriptionId ?? null,
            customerId,
            customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
            eventType: event.type,
          });
          break;
        }

        // Server-created checkout already stamps this metadata; repeat it here
        // for legacy Payment Link returns and as an idempotent repair.
        await stripe.subscriptions.update(subscriptionId, {
          metadata: { supabase_user_id: userId },
        });
        await syncSubscription(userId, subscriptionId);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        const userId = sub.metadata?.supabase_user_id ?? (await userIdForCustomer(customerId));
        if (!userId) {
          await recordUnattributed({
            reason: 'subscription event has no Supabase user mapping',
            subscriptionId: sub.id,
            customerId,
            eventType: event.type,
          });
          break;
        }
        await syncSubscription(userId, sub.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries transient failures rather than dropping them.
    console.error('stripe-webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
