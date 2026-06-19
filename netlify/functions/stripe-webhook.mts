// Stripe webhook — server-authoritative web entitlements.
//
// Stripe calls this endpoint when a checkout completes or a subscription
// changes. We verify the signature, resolve which Supabase user the event
// belongs to, and upsert the verified state into `public.stripe_subscriptions`
// using the service-role key (which bypasses RLS). The web client then reads
// that row as the source of truth instead of trusting its own localStorage.
//
// Endpoint (register in the Stripe Dashboard → Developers → Webhooks):
//   https://fightcamp.netlify.app/.netlify/functions/stripe-webhook
// Subscribe it to: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted.
//
// Required Netlify env vars (Site settings → Environment variables — server
// only, NOT VITE_ prefixed so they never reach the client bundle):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async (req: Request): Promise<Response> => {
  const {
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env;

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response('Webhook not configured', { status: 500 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature', { status: 400 });

  // The raw, unparsed body is required for signature verification.
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  // Map the purchased product to our tier. Products are named "Fighter Pro" /
  // "Coach Pro", so a name match is resilient to price/ID changes.
  const tierFor = (name: string | null | undefined): 'coach_pro' | 'fighter_pro' =>
    /coach/i.test(name ?? '') ? 'coach_pro' : 'fighter_pro';

  // Retrieve the subscription fresh (with the product expanded) and write the
  // verified entitlement for `userId`.
  const syncSubscription = async (userId: string, subscriptionId: string): Promise<void> => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });
    const item = sub.items?.data?.[0];
    const product = item?.price?.product as Stripe.Product | Stripe.DeletedProduct | string | undefined;
    const productName = product && typeof product === 'object' && 'name' in product ? product.name : null;
    const periodEnd =
      (sub as { current_period_end?: number }).current_period_end ??
      (item as { current_period_end?: number } | undefined)?.current_period_end ??
      null;

    const { error } = await supabase.from('stripe_subscriptions').upsert(
      {
        user_id: userId,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
        stripe_subscription_id: sub.id,
        tier: tierFor(productName),
        status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`supabase upsert failed: ${error.message}`);
  };

  // Fallback user resolution for subscription.* events: find the row we stored
  // at checkout time keyed by the Stripe customer id.
  const userIdForCustomer = async (customerId: string | null): Promise<string | null> => {
    if (!customerId) return null;
    const { data } = await supabase
      .from('stripe_subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    return (data?.user_id as string | undefined) ?? null;
  };

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        // Without the signed-in user id we can't safely attribute the purchase.
        if (!userId || !subscriptionId) break;
        // Stamp the user id onto the subscription so later events resolve even if
        // the customer lookup ever misses. Non-fatal if it fails.
        try {
          await stripe.subscriptions.update(subscriptionId, {
            metadata: { supabase_user_id: userId },
          });
        } catch {
          /* ignore — customer lookup is the fallback */
        }
        await syncSubscription(userId, subscriptionId);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
        const userId = sub.metadata?.supabase_user_id ?? (await userIdForCustomer(customerId));
        if (!userId) break;
        await syncSubscription(userId, sub.id);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries with backoff rather than dropping the event.
    console.error('stripe-webhook handler error:', err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
