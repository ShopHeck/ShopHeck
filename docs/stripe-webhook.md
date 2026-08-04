# Server-side Stripe entitlements (web)

Web subscriptions are verified **server-side** by a Stripe webhook, so the app
no longer trusts the client's localStorage for Pro access. (iOS uses RevenueCat;
this is the web path only.)

## How it works

1. **Checkout is tied to the account.** Web checkout requires sign-in:
   `UpgradeModal` appends `client_reference_id=<supabase user id>` (and
   `prefilled_email`) to the Stripe Payment Link, and shows the auth screen
   first when the user isn't signed in.
2. **Stripe → webhook.** On `checkout.session.completed` /
   `customer.subscription.updated` / `customer.subscription.deleted`, Stripe
   calls [`netlify/functions/stripe-webhook.ts`](../netlify/functions/stripe-webhook.ts).
   It verifies the signature, then upserts the verified entitlement into
   `public.stripe_subscriptions` using the **service-role key**.
3. **Client reads the truth.** `fetchServerSubscription()` (in
   [`src/lib/sync.ts`](../src/lib/sync.ts)) reads the user's own row (RLS lets a
   user read only their row, and nothing client-side can write it). `AppContext`
   applies it after sign-in. The checkout return URL grants nothing by itself —
   `processStripeReturn()` only signals `AppContext` to poll briefly for the
   webhook-written row so the purchase unlocks without a reload.

Source of truth precedence on web: **comp** (founder/test emails) → **server
Stripe entitlement**. There is no client-side unlock path.

### Payment Link success URL
Configure each Payment Link's confirmation redirect back to the app with
`?checkout=success` (the legacy `?tier=<tier>&stripe_session={CHECKOUT_SESSION_ID}`
form is still accepted as a success signal during rollout, but is
non-authoritative either way).

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
The webhook maps the purchased product to a tier by **exact name** (case- and
whitespace-insensitive): "Fighter Pro" → `fighter_pro`, "Coach Pro" →
`coach_pro`. Any other product name grants **nothing** (fail closed) and is
logged with the event id. Keep the Stripe products named exactly
**Fighter Pro** / **Coach Pro**, or update `tierFor` when renaming.

## Testing
- Stripe CLI: `stripe listen --forward-to https://fightcamp.netlify.app/.netlify/functions/stripe-webhook`
  then `stripe trigger checkout.session.completed`.
- Or buy through a (test-mode) Payment Link while signed in, then confirm a row
  appears in `stripe_subscriptions` and the app shows Pro after a reload.

## Notes / limitations
- **Guest checkout is blocked in the app.** `UpgradeModal` requires sign-in
  before opening a Payment Link, so every checkout carries a
  `client_reference_id`. A checkout completed without one (e.g. a link opened
  outside the app) cannot be attributed and is logged by the webhook.
- `user_state.subscription` remains a non-authoritative client mirror and is
  intentionally never pulled back down (see `mergeCloud`). Server code never
  consults it for authorization.
