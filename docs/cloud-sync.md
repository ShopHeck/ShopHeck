# Cloud Sync & Accounts (Supabase)

Fight Camp is **local-first**: everything works offline with no account. Signing
in is optional and adds cloud backup, cross-device sync, and coach access.

## Project

- **Supabase project:** `Fight Camp` (`<project-ref>`, region `us-east-1`)
- **Schema:** see [`../supabase/schema.sql`](../supabase/schema.sql) — profiles,
  camps, all logs/entries, coach-linking, RLS, and the signup trigger.
- **Generated types:** [`../src/lib/database.types.ts`](../src/lib/database.types.ts)
  (regenerate with `npx supabase gen types typescript --project-id=<project-ref> --schema=public`).

## Required environment variables

These activate accounts/sync. The anon key is a **publishable** client key and is
safe to expose. The app stays fully local-first when they're absent.

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable anon key from Supabase → Settings → API>
```

Set them in **three** places:

| Where the app runs | Configure env in |
|---|---|
| Live website (Netlify) | Netlify → Site configuration → Environment variables |
| iPhone / TestFlight | GitHub → Settings → Secrets and variables → Actions |
| Local dev (`npm run dev`) | `.env.local` in the project root (copy from `.env.example`) |

> **Build-time, not runtime.** Vite bakes `VITE_*` vars in at build time, so after
> adding/changing them you must run a **fresh build** (on Netlify: *Trigger deploy →
> Clear cache and deploy site*). A cached redeploy will not pick them up.

## What's implemented

- **Auth** — optional email/password, password reset, and Sign in with Apple.
  Native iOS uses the real Apple sheet with a nonce (hashed for Apple, raw for
  Supabase); web uses the OAuth redirect (`src/context/AuthContext.tsx`).
- **Push sync** — device → cloud, debounced + on sign-in (`src/lib/sync.ts`,
  `src/context/SyncContext.tsx`). Never mutates local state. Per-row FNV-1a
  hashes mean only changed rows are sent, with a forced full resync every 24h so
  a drifted hash store heals itself.
- **Pull / merge** — `pullState` + `mergeCloud`. A conservative union: local wins
  on conflict, a row this device deleted is not resurrected
  (`previouslySynced`), and a row tombstoned elsewhere *is* removed. Every list
  query is explicitly ordered and paginated. This is the highest-risk pure
  function in the app; `tests/sync.test.ts` pins its documented edge cases.
- **Coach linking** — invite codes in both directions (`redeem_coach_invite` for
  coach-minted codes, `redeem_fighter_invite` for fighter-minted ones shared out
  via the invite-your-coach loop) + `is_coach_of()` RLS so a linked coach can
  read a fighter's data.
- **Coach roster + notes** — a team overview triage table and a linked-fighter
  detail view (`src/lib/coachLinks.ts`). Coach notes are written directly by the
  coach and pulled by the fighter, deliberately outside `pushState`: a note is
  owned by the coach but keyed to another account's `fighter_id` and `camp_id`,
  so there is no `user_id` to push it under. That matches the `coach_notes` RLS
  exactly — coach writes, either party reads.

## Not synced, on purpose

`pushState` enumerates the `user_state` columns it sends, so these stay on the
device:

| Slice | Why |
|---|---|
| `subscription` | Entitlement is server-authoritative — read from the Stripe/RevenueCat tables, never from client-synced state |
| Fitbit OAuth tokens | Long-lived third-party credentials; the connect flow is per-device PKCE, so syncing them buys nothing and puts a reusable credential in our database |
| `aiAnalyses` | Large text blobs, cheap to regenerate |
| `campAdaptations`, `cornerSessions` | See [`open-work.md`](./open-work.md) — worth syncing eventually, needs a migration |
