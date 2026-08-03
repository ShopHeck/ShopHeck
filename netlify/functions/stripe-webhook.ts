// Stripe webhook — server-authoritative web entitlements.
//
// This keeps the existing Stripe Payment Link setup intact. Stripe calls this
// endpoint when a checkout completes or a subscription changes. We verify the
// signature, resolve the Supabase user, and upsert verified entitlement state.
//
// Required Netlify environment variables:
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

  // The raw, unparsed body is required for Stripe signature verification.
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Signature verification failed: ${(err as Error).message}`, { status: 400 });
  }

  // Existing products are named exactly "Fighter Pro" and "Coach Pro". Unknown
  // products grant nothing instead of silently defaulting to Fighter Pro.
  const tierFor = (name: string | null | undefined): 'coach_pro' | 'fighter_pro' | null => {
    const normalized = name?.trim().toLowerCase();
    if (normalized === 'coach pro') return 'coach_pro';
    if (normalized === 'fighter pro') return 'fighter_pro';
    return null;
  };

  const syncSubscription = async (userId: string, subscriptionId: string): Promise<void> => {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });
    const item = sub.items?.data?.[0];
    if (!item) throw new Error(`subscription ${sub.id} has no line item`);

    const product = item.price.product as Stripe.Product | Stripe.DeletedProduct | string | undefined;
    const productName = product && typeof product === 'object' && 'name' in product ? product.name : null;
    const tier = tierFor(productName);
    if (!tier) {
      console.error('stripe-webhook ignored unknown subscription product', {
        eventId: event.id,
        subscriptionId: sub.id,
        priceId: item.price.id,
        productName,
      });
      return;
    }

    const periodEnd =
      (sub as { current_period_end?: number }).current_period_end ??
      (item as { current_period_end?: number } | undefined)?.current_period_end ??
      null;

    const { error } = await supabase.from('stripe_subscriptions').upsert(
      {
        user_id: userId,
        stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null,
        stripe_subscription_id: sub.id,
        tier,
        status: sub.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(sub.cancel_at_period_end),
      },
      { onConflict: 'user_id' },
    );
    if (error) throw new Error(`supabase entitlement upsert failed: ${error.message}`);
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

        if (!userId || !subscriptionId) {
          console.error('stripe-webhook could not attribute completed checkout', {
            eventId: event.id,
            checkoutSessionId: session.id,
            hasUserId: Boolean(userId),
            hasSubscriptionId: Boolean(subscriptionId),
          });
          break;
        }

        // Persist the account mapping on the Stripe subscription for future
        // renewal, cancellation, and expiration events.
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
          console.error('stripe-webhook could not attribute subscription event', {
            eventId: event.id,
            subscriptionId: sub.id,
            customerId,
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
