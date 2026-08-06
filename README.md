# Fight Camp Training

A combat-sports training-camp planner for fighters and coaches. Generates a
periodized camp from a fight date, then tracks the work against it: sessions,
sparring, weight cut, nutrition, HRV and readiness — with a round timer, an AI
coach, and a coach-side view of a linked fighter's camp.

Local-first: everything works offline with no account. Signing in adds cloud
backup, cross-device sync and coach linking.

Ships as a web app (PWA) and a native iOS app via Capacitor.

---

## Quick start

```bash
npm install
npm run dev          # Vite dev server
npm run quality      # lint + test + security + functions typecheck + build
```

The app runs with no configuration — sync, purchases and the AI coach simply
report themselves unavailable. Copy `.env.example` to `.env` and fill in what
you need; each block documents what it turns on.

### Scripts worth knowing

| Command | What it does |
|---|---|
| `npm run quality` | The gate CI runs. Nothing merges red. |
| `npm test` | Vitest, 281 tests |
| `npm run cap:ios` | Build, sync, open Xcode |
| `npm run screenshots` | Regenerate all 14 App Store captures |
| `npm run verify:appstore` | Check the App Store asset set |

---

## Architecture

**One reducer, one store.** `src/context/AppContext.tsx` holds the whole account
document. The reducer is **pure** — side effects (persistence, sign-out, cache
wipes) live in a `dispatch` wrapper, and `tests/reducer.test.ts` pins that.
State is persisted to `localStorage` with coalesced, idle-scheduled writes.

**The schedule is generated, not stored.** `utils/campGenerator.ts` is a pure
function from a `FightCamp` to its weeks, so any camp — past or present — can be
re-derived. `utils/adaptiveCamp.ts` layers accepted adaptations on top without
changing a week's *shape*, which is what keeps session keys stable.

**Sync is push/pull with dirty tracking.** `src/lib/sync.ts` hashes each row and
sends only what moved. `mergeCloud` is a conservative union: local wins on
conflict, a row deleted here is not resurrected, a row tombstoned elsewhere is
removed. It is the highest-risk pure function in the app and has the tests to
match.

**Entitlement is server-authoritative.** Client-synced state is never consulted
for authorization. Stripe (web) and RevenueCat (iOS) webhooks write verified
rows; quota is enforced atomically in Postgres.

### Layout

```
src/
  components/     screens + shared UI
  context/        App, Auth, Sync, Timer, HeartRate providers
  hooks/          round timer, Bluetooth HR, haptics, wake lock
  lib/            supabase, sync, coach links, AI coach client
  plugins/        Capacitor plugin interfaces (native bridges)
  utils/          domain logic — camp generation, readiness, adherence, …
netlify/functions/  AI coach, Stripe + RevenueCat webhooks
ios/App/          Capacitor iOS app, Live Activity, watch app
supabase/         schema + RLS
tests/            Vitest
```

---

## Features

**Camp planning** — periodized schedule from fight date, sport and experience;
weekly planner with session ticking; off-season blocks.

**Adaptive Camp** — readiness, HRV and adherence feed a proposal to deload,
switch to recovery, or add load. Nothing changes without the fighter accepting
it, and an adaptation never changes a week's session count. See
`utils/adaptiveCamp.ts`.

**Round timer** — presets, custom presets, HR zones and MyZone points, Gym
Display takeover, Live Activity / Dynamic Island, background round alerts.

**Corner Mode** — fight night. The game plan's round segments show between
rounds; the corner scores each round in one tap; the post-fight breakdown is
pre-filled from what they captured. See `utils/cornerMode.ts`.

**Weight cut** — projection against a linear target, AI Cut Coach, lbs/kg.

**Readiness** — a weighted score whose factor weights are tuned per fighter from
their own fight results (`utils/factorTuner.ts`).

**Coach Pro** — linked fighters over the cloud, a team overview triage table,
and coach notes that reach a remote fighter's phone.

**AI coach** — camp insights, cut guidance and post-fight breakdowns, streamed
from a Netlify function on the app's own key, gated by a server-verified
subscription with a monthly quota.

---

## Documentation

| Doc | Covers |
|---|---|
| [`cloud-sync.md`](docs/cloud-sync.md) | Supabase project + accounts |
| [`ai-coach.md`](docs/ai-coach.md) | Server-side AI setup |
| [`stripe-webhook.md`](docs/stripe-webhook.md) | Web entitlements |
| [`revenuecat-webhook.md`](docs/revenuecat-webhook.md) | iOS entitlements |
| [`apple-watch.md`](docs/apple-watch.md) | Watch companion + target setup |
| [`ios-signing.md`](docs/ios-signing.md) | TestFlight signing |
| [`app-store-submission.md`](docs/app-store-submission.md) | Release checklist |
| [`app-store-listing.md`](docs/app-store-listing.md) | Listing copy |
| [`troubleshooting-signin-and-purchases.md`](docs/troubleshooting-signin-and-purchases.md) | When sign-in or IAP fails |
| [`open-work.md`](docs/open-work.md) | What is actually still open |
| [`submission-summary.md`](docs/submission-summary.md) | What changed since build 17 (dated snapshot) |
| [`audit-2026-08.md`](docs/audit-2026-08.md) | Engineering audit (historical) |
| [`ux-audit.md`](docs/ux-audit.md) | UX audit (historical) |

---

## Conventions

- **Tests are falsified before being trusted.** A regression test is confirmed
  to fail with its bug reintroduced. Several test files say so in a comment
  naming the bug.
- **Comments explain why, not what.** Most non-obvious code carries the reason
  it is shaped that way, usually including the bug that shaped it.
- **`npm run quality` is the bar.** Lint is at zero warnings; keep it there.
