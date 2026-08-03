// Authenticated Stripe Checkout creation for web subscriptions.
//
// The browser never chooses a price id or writes entitlement metadata. It sends
// only the plan/billing choice; this function validates the Supabase bearer
// token, selects an allowlisted server-side price, and creates an attributable
// subscription Checkout Session.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

type Tier = 'fighter' | 'coach';
type Billing = 'monthly' | 'annual';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS_HEADERS },
  });

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { code: 'method_not_allowed', message: 'POST only.' });

  const {
    STRIPE_SECRET_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_FIGHTER_MONTHLY_PRICE_ID,
    STRIPE_FIGHTER_ANNUAL_PRICE_ID,
    STRIPE_COACH_MONTHLY_PRICE_ID,
    STRIPE_COACH_ANNUAL_PRICE_ID,
    APP_URL,
  } = process.env;

  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { code: 'not_configured', message: 'Web subscriptions are not configured.' });
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return json(401, { code: 'signin_required', message: 'Sign in before subscribing.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error: authError } = await supabase.auth.getUser(token);
  const user = data.user;
  if (authError || !user?.id || !user.email) {
    return json(401, { code: 'signin_required', message: 'Your session expired. Sign in and try again.' });
  }

  let tier: Tier;
  let billing: Billing;
  try {
    const body = (await req.json()) as { tier?: string; billing?: string };
    if ((body.tier !== 'fighter' && body.tier !== 'coach') ||
        (body.billing !== 'monthly' && body.billing !== 'annual')) {
      return json(400, { code: 'bad_request', message: 'Choose a valid plan and billing period.' });
    }
    tier = body.tier;
    billing = body.billing;
  } catch {
    return json(400, { code: 'bad_request', message: 'Invalid JSON request.' });
  }

  const prices: Record<Tier, Record<Billing, string | undefined>> = {
    fighter: {
      monthly: STRIPE_FIGHTER_MONTHLY_PRICE_ID,
      annual: STRIPE_FIGHTER_ANNUAL_PRICE_ID,
    },
    coach: {
      monthly: STRIPE_COACH_MONTHLY_PRICE_ID,
      annual: STRIPE_COACH_ANNUAL_PRICE_ID,
    },
  };
  const price = prices[tier][billing]?.trim();
  if (!price) {
    return json(503, { code: 'not_configured', message: 'That subscription option is not configured yet.' });
  }

  const appUrl = (APP_URL || 'https://fightcamp.netlify.app').replace(/\/$/, '');
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      allow_promotion_codes: true,
      success_url: `${appUrl}/?checkout=success`,
      cancel_url: `${appUrl}/?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        requested_tier: tier,
        requested_billing: billing,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
        },
      },
    });

    if (!checkout.url) {
      return json(503, { code: 'checkout_unavailable', message: 'Stripe did not return a checkout URL.' });
    }
    return json(200, { url: checkout.url });
  } catch (error) {
    console.error('create-checkout error:', error);
    return json(503, { code: 'checkout_unavailable', message: 'Checkout is unavailable right now. Try again shortly.' });
  }
};
