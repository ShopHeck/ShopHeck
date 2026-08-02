# AI Coach — server-side setup

The app's three AI features — **AI Insights** (camp analysis), **AI Cut Coach**
(weigh-in guidance), and the **AI Post-Fight Breakdown** — run through our own
serverless endpoint, `netlify/functions/ai-coach`, using the app's Anthropic
API key. Subscribers get the AI as part of Fighter/Coach Pro with zero setup;
nobody pastes an API key into the app anymore.

## How a request flows

1. The app builds the prompt locally from camp data (unchanged from before) and
   POSTs it to `/.netlify/functions/ai-coach` with the user's Supabase access
   token and a `feature` tag (`insights` | `cut` | `postfight`).
2. The function verifies the token, resolves entitlement, atomically consumes
   one unit of the month's quota (`increment_ai_usage` in Postgres), and
   streams the model's text straight back to the app.
3. Typed error codes route the UI: `signin_required` shows a sign-in button,
   `upgrade_required` opens the paywall, `quota_exhausted` explains the reset.

Feature gating mirrors the app: `insights` and `cut` require Pro; `postfight`
is the free tier's taster, bounded by the free quota.

## Setup checklist

1. **Apply the schema addition.** `supabase/schema.sql` now contains the
   `ai_usage` table and the `increment_ai_usage` function (bottom of the file).
   Run that section in the Supabase SQL editor (the whole file is idempotent —
   re-running it is safe).
2. **Set Netlify env vars** (Site settings → Environment variables, server-only,
   no `VITE_` prefix):
   | Var | Required | Default | Notes |
   |---|---|---|---|
   | `ANTHROPIC_API_KEY` | ✅ | — | console.anthropic.com → API keys |
   | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | already set for the Stripe webhook |
   | `AI_MODEL` | — | `claude-haiku-4-5` | see model choice below |
   | `AI_QUOTA_PRO` | — | `40` | included analyses / user / month |
   | `AI_QUOTA_FREE` | — | `3` | free-tier taster / user / month |
   | `COMP_PRO_EMAILS` | — | — | server-side comp allowlist |
3. **Deploy.** Nothing else — the iOS build reaches the endpoint via
   `VITE_FUNCTIONS_BASE` (defaults to the production site URL).

Users must be **signed in** to use the AI (the quota is per account). Signed-out
users get an in-context sign-in prompt — which doubles as an account-creation
nudge the app previously never made.

## Model choice & cost math

Default model: **`claude-haiku-4-5`** — $1 per million input tokens, $5 per
million output. The three features are short structured coaching summaries
(~300–1,200 words) over a few KB of numeric data; that is squarely
summarization-tier work, and the fastest/cheapest current Claude model handles
it well. The previous client-side code hardcoded an Opus-tier model at $5/$25 —
about 5× the cost for no visible benefit on this task shape.

Per-call cost at Haiku 4.5 rates:

| Scenario | Input | Output | Cost |
|---|---|---|---|
| Typical call | ~1.5K tokens | ~1K tokens | ~$0.0065 |
| Worst case (caps) | ~2K tokens | ~2–3K tokens | ~$0.012–0.017 |

Monthly ceilings with the default quotas:

| User | Quota | Worst-case cost / month |
|---|---|---|
| Pro ($7.99/mo) | 40 | **$0.48–0.68** (≈ 6–8% of revenue; typical usage is pennies) |
| Free (taster) | 3 | **$0.04–0.05** |

If coaching quality ever feels thin, set `AI_MODEL=claude-sonnet-5` ($3/$15;
intro $2/$10 through 2026-08-31) — roughly 3× Haiku's cost, still well under a
dollar per heavy Pro user per month. No app release needed; it's an env var.

Runaway protection: quotas are enforced atomically in Postgres, prompt length
is capped server-side, `max_tokens` is fixed per feature, and the endpoint
carries a scoped system prompt so the key can't be borrowed as a general LLM.

## Entitlement trust levels (and the RevenueCat gap)

The function resolves Pro in this order:

1. `COMP_PRO_EMAILS` (server env) — founder/reviewer accounts.
2. `stripe_subscriptions` — server-authoritative (the Stripe webhook writes it).
3. `user_state.subscription` — the client-synced mirror. **This is what admits
   App Store (RevenueCat) subscribers**, because no RevenueCat→server bridge
   exists yet. It is client-attested and technically forgeable; the monthly
   quota caps the worst-case abuse at well under $1/user/month, which we accept
   for now rather than lock paying iOS users out.

**Follow-up to close the gap properly:** have the native app call RevenueCat
`logIn(<supabase user id>)` on sign-in, add a RevenueCat webhook function that
upserts verified entitlements (mirroring `stripe-webhook.ts`), and then drop
source 3. Tracked as the remaining piece of audit item R1/P0-5.

## Related client pieces

- `src/lib/aiCoach.ts` — streaming client + typed `AiCoachError`.
- `AIInsights.tsx`, `CutCoach.tsx`, `PostFightInsights.tsx` — call the proxy;
  all BYO-API-key UI is gone (as are the onboarding key step and the Settings
  key row; `src/utils/apiKey.ts` was deleted).
- Reading `ai_usage` client-side (RLS allows selecting your own row) is the
  hook for a future "N analyses left this month" indicator.
