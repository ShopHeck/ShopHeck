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

- **Auth** — optional email/password + Sign in with Apple (`src/context/AuthContext.tsx`).
- **Push sync** — device → cloud, debounced + on sign-in (`src/lib/sync.ts`,
  `src/context/SyncContext.tsx`). Never mutates local state.
- **Coach linking** — invite codes (`redeem_coach_invite`) + `is_coach_of()` RLS so a
  linked coach can read a fighter's data.

## Roadmap

- **Pull / merge** (cross-device restore with last-write-wins) — needs id/key remap.
- **Coach-linking UX** — generate/enter invite codes, coach roster view.
- **Sign in with Apple (native)** — deep-link round-trip + Supabase Apple provider config.
