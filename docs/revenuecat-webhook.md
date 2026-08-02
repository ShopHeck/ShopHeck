# Server-side App Store entitlements (RevenueCat webhook)

App Store subscriptions are now verified **server-side**, mirroring what
[`stripe-webhook.md`](./stripe-webhook.md) does for the web: a RevenueCat
webhook writes verified entitlements into Supabase, and server code + the web
app trust that row instead of the client-synced mirror. This is the bridge that
lets an iOS subscriber get Pro **on the web too**, and it closes the
"client-attested iOS entitlement" gap in the AI proxy
([`docs/ai-coach.md`](./ai-coach.md), trust level 3).

## How it works

1. **The device identifies itself.** On sign-in (and on every launch with a
   session), the native app calls `RevenueCat.logIn(<supabase user id>)`
   (`AppContext` → `identifyNativeSubscriber` →
   [`RevenueCatPlugin.swift`](../ios/App/App/RevenueCatPlugin.swift)). RevenueCat
   aliases the device's anonymous subscriber to the Supabase uuid, so purchases
   — past and future — belong to an attributable subscriber. On sign-out the
   app calls `logOut()` (a guarded no-op when already anonymous).
2. **RevenueCat → webhook.** On every subscription event (purchase, renewal,
   cancellation, expiration, billing issue…), RevenueCat calls
   [`netlify/functions/revenuecat-webhook.ts`](../netlify/functions/revenuecat-webhook.ts).
   It checks the shared-secret `Authorization` header, finds a Supabase uuid
   among the subscriber's ids (`app_user_id` or its aliases), maps the
   entitlement (`Coach Pro` → `coach_pro`, `Fight Camp Pro` → `fighter_pro`),
   and upserts into `public.revenuecat_subscriptions` with the service-role
   key. Events for purely-anonymous subscribers (pre-`logIn` builds) are
   acknowledged and skipped.
3. **Everything reads the truth.** `fetchServerSubscription()`
   ([`src/lib/sync.ts`](../src/lib/sync.ts)) now reads **both**
   `stripe_subscriptions` and `revenuecat_subscriptions` and applies the best
   active entitlement (`coach_pro` outranks `fighter_pro`); the AI proxy checks
   the same table before falling back to the client mirror.

"Active" needs no status column: every RevenueCat event carries the
entitlement's current `expiration_at_ms`, so a row is active iff `expires_at`
is null or in the future. A canceled subscription keeps access until it lapses
(App Store semantics), and an expired one goes inactive even if the final
event never arrives.

## One-time setup

### 1. Apply the schema
Run the updated [`../supabase/schema.sql`](../supabase/schema.sql) in the
Supabase SQL Editor (idempotent). This adds `revenuecat_subscriptions` + RLS
(owner read-only; only the service role writes).

### 2. Register the webhook in RevenueCat
RevenueCat dashboard → your project → **Integrations → Webhooks → Add**:
- **Webhook URL:** `https://fightcamp.netlify.app/.netlify/functions/revenuecat-webhook`
- **Authorization header:** a long random secret (e.g. `openssl rand -hex 32`).
  Store the exact same value in Netlify as `REVENUECAT_WEBHOOK_SECRET` — the
  function compares the header verbatim (a `Bearer ` prefix is tolerated).
- **Environment:** leave "All environments" on. Sandbox (TestFlight) events are
  recorded with `environment = 'SANDBOX'` and expire within minutes-to-hours on
  their own (Apple's accelerated sandbox clock), so they're harmless and make
  end-to-end testing possible.

### 3. Set Netlify environment variables
Netlify → Site settings → **Environment variables** (server-only; no `VITE_`
prefix):

| Variable | Value |
|---|---|
| `REVENUECAT_WEBHOOK_SECRET` | the Authorization header value from step 2 |
| `SUPABASE_URL` | already set for the Stripe webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | already set for the Stripe webhook |

Redeploy after setting them.

## Attribution: why `logIn` matters

Until now the iOS app never called `Purchases.logIn`, so every subscriber was
anonymous (`$RCAnonymousID:…`) and no event could be tied to an account. With
the `logIn` call shipping in the same release:

- Purchases made **while signed in** carry the Supabase uuid as `app_user_id`.
- Purchases made **before signing in** (or on older builds) get attributed the
  moment the same device signs in — RevenueCat aliases the ids and subsequent
  events list the uuid in `aliases`, which the webhook also accepts.
- Users who **never sign in** on a post-`logIn` build stay anonymous; they keep
  working via the on-device RevenueCat SDK check, and the AI proxy's
  client-mirror fallback (trust level 4 in `docs/ai-coach.md`) covers them
  until sign-in. That fallback is scheduled for removal once logIn-enabled
  builds are the oldest supported version.

## Event handling details

- **All entitlement-bearing events** upsert tier + expiry; out-of-order
  redelivery is guarded by `event_timestamp_ms` (an older event never
  overwrites newer state; identical timestamps re-apply idempotently).
- **`TEST`** (dashboard "send test event") → acknowledged, no write.
- **`TRANSFER`** carries no entitlement ids and is deliberately not mirrored —
  the destination account's next real event (or the device SDK) corrects the
  row. Rare enough not to special-case.
- Deliberate skips return **200** so RevenueCat doesn't retry forever; only
  transient DB failures return 5xx (RevenueCat retries with backoff).

## Testing

1. TestFlight build signed in as a test account → buy the 7-day trial in the
   RevenueCat paywall (sandbox).
2. RevenueCat dashboard → Webhooks → check the delivery log shows `200`.
3. Confirm the row: `select * from revenuecat_subscriptions;` — `tier`,
   `expires_at` in the near future (sandbox clock), `environment = 'SANDBOX'`.
4. Sign in with the same account **on the web** — Pro features unlock after
   the entitlement fetch (reload if needed).
