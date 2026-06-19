# Server-side Stripe entitlements (web)

Web subscriptions are verified **server-side** by a Stripe webhook, so the app
no longer trusts the client's localStorage for Pro access. (iOS uses RevenueCat;
this is the web path only.)

## How it works

1. **Checkout is tied to the account.** When a signed-in user taps *Start Free
   Trial*, `UpgradeModal` appends `client_reference_id=<supabase user id>` (and
   `prefilled_email`) to the Stripe Payment Link.
2. **Stripe → webhook.** On `checkout.session.completed` /
   `customer.subscription.updated` / `customer.subscription.deleted`, Stripe
   calls [`netlify/functions/stripe-webhook.ts`](../netlify/functions/stripe-webhook.ts).
   It verifies the signature, then upserts the verified entitlement into
   `public.stripe_subscriptions` using the **service-role key**.
3. **Client reads the truth.** `fetchServerSubscription()` (in
   [`src/lib/sync.ts`](../src/lib/sync.ts)) reads the user's own row (RLS lets a
   user read only their row, and nothing client-side can write it). `AppContext`
   applies it after sign-in, overriding the optimistic client-side soft unlock.

Source of truth precedence on web: **comp** (founder/test emails) → **server
Stripe entitlement** → optimistic soft unlock from the checkout return.

## One-time setup

### 1. Apply the schema
Run the updated [`../supabase/schema.sql`](../supabase/schema.sql) in the
Supabase SQL Editor (it's idempotent). This adds the `stripe_subscriptions`
table + RLS. Regenerate types if needed:
```bash
npx supabase gen types typescript --project-id=edxadcgotbdipyndtoph --schema=public
```

### 2. Register the webhook in Stripe
Stripe Dashboard → **Developers → Webhooks → Add endpoint**:
- **Endpoint URL:** `https://fightcamp.netlify.app/.netlify/functions/stripe-webhook`
- **Events:** `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`
- Copy the **Signing secret** (`whsec_…`).

> Create the endpoint in the **same mode (test/live)** as your Payment Links —
> a test-mode webhook only receives test-mode events.

### 3. Set Netlify environment variables
Netlify → Site settings → **Environment variables** (server-only; do **not**
prefix with `VITE_`):

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_…` from step 2 |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (Supabase → Settings → API) |

Redeploy after setting them.

## Tier mapping
The webhook maps the purchased product to a tier by **name**: a product whose
name contains "coach" → `coach_pro`, otherwise `fighter_pro`. Keep the Stripe
products named **Fighter Pro** / **Coach Pro**.

## Testing
- Stripe CLI: `stripe listen --forward-to https://fightcamp.netlify.app/.netlify/functions/stripe-webhook`
  then `stripe trigger checkout.session.completed`.
- Or buy through a (test-mode) Payment Link while signed in, then confirm a row
  appears in `stripe_subscriptions` and the app shows Pro after a reload.

## Notes / limitations
- **Guest checkout isn't linked.** Without a signed-in user there's no
  `client_reference_id`, so the webhook can't attribute the purchase. The user
  still gets the client-side soft unlock; consider gating the upgrade flow behind
  sign-in for a fully durable entitlement.
- `user_state.subscription` remains a non-authoritative client mirror and is
  intentionally never pulled back down (see `mergeCloud`).
