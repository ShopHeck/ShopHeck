# Release ops checklist (non-code)

Code can be green while these stay broken. Each item is a **silent** failure.

## Status (2026-08-06)

| Item | Status |
|---|---|
| Supabase migrations applied | ✅ Done (operator confirmed) |
| Password-reset redirect allow-listed | ✅ Done (operator confirmed) |
| App Store assets generated locally | ✅ `npm run verify:appstore` green |
| IAP products attached to the version | ⬜ Open |
| Assets uploaded to App Store Connect | ⬜ Open |
| Watch on a real wrist | ⬜ Open |
| CI secrets shape | ⬜ Confirm each ship |

## Before every TestFlight / App Store push

1. **Supabase migrations applied** ✅
   - At minimum these were applied:
     - `20260803190000_harden_authorization.sql`
     - `20260805210000_sync_adaptations_corner_and_analyses.sql`
   - Prefer migrations over re-running full `supabase/schema.sql`.
   - If you *do* re-run `schema.sql`, the hardening block at the **end** of that
     file must run last (it is appended for this reason).

2. **Password-reset redirect allow-listed** ✅
   - `https://fightcamp.netlify.app/auth/recovery` is under
     Authentication → URL Configuration → Redirect URLs.

3. **IAP products attached to the version** ⬜
   - App Store Connect → version → In-App Purchases and Subscriptions
   - Every product must be attached, not merely “Ready to Submit”

4. **App Store assets** ✅ generate / ⬜ upload
   ```bash
   npm run screenshots
   npm run preview:video   # requires Playwright + ffmpeg
   npm run verify:appstore # must exit 0
   ```
   Then upload `ios/fastlane/screenshots/en-US/` in App Store Connect.

5. **Watch on a real wrist** ⬜ once per major release
   - See `docs/apple-watch.md` § Verifying

6. **Secrets shape** (CI preflight already checks)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `REVENUECAT_API_KEY` (`appl_…`)

## After schema changes

- Never assume production matches `schema.sql` without applying migrations.
- Spot-check with two test users: fighter cannot self-promote to coach after 24h;
  unlinked coach cannot write notes; links cannot repoint principals.
