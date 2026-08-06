# Open work

**Verified against source on 2026-08-05.** Every item below was checked by
reading the code, not by trusting a previous document.

## Why this file exists

`docs/audit-2026-08.md` and `docs/ux-audit.md` each carried a "what's still
open" list, and those lists went stale **five separate times** — each time
claiming as broken something that had already been fixed:

| Claimed open | Actually fixed in |
|---|---|
| Weekly adherence has three definitions | the engineering audit's own follow-up pass |
| Preset delete is hover-only, presets tappable mid-session | before either audit was refreshed |
| `@fontsource/inter` is never imported | the engineering audit's own pass |
| Double paywall on iOS | `2c95bcd` — `UpgradeModal` drives StoreKit directly via `RevenueCat.purchasePackage`, falling back to the full paywall only when packages can't be resolved |
| Session-complete screen is bare | a summary card (rounds / clock / MEP) now renders there |

The pattern is that a *finding* and a *tracker* were the same document. An audit
is a dated snapshot and should stay one; this file is the tracker. **The audits
are now historical records — do not read their "still open" sections.**

When you close something here, delete the entry. When you add one, say how to
verify it in one command.

---

## Open

Nothing in `src/` or `ios/` is known-open. The five engineering items that stood
here on 2026-08-05 are closed — see
[`docs/submission-summary.md`](./submission-summary.md) for what each turned
into.

What is left is not code. Every item below needs an account, a dashboard or a
device, and **each one is a silent failure**: the build compiles, ships and
launches, and the feature is simply dead. They are listed in the order a
submission hits them.

### Apply the sync migration in Supabase

Adaptations, corner sessions, saved AI analyses and the official-weigh-in flag
now push to columns that do not exist until the migration runs. `pushState` will
fail on `user_state` and `weight_entries`, and the sync banner will show an
error.

```sh
# Supabase Dashboard → SQL Editor → run:
cat supabase/migrations/20260805210000_sync_adaptations_corner_and_analyses.sql
```

Idempotent (`add column if not exists`), so re-running it is safe.

### Allow-list the password-reset redirect

Supabase silently falls back to the project Site URL for any `redirectTo` it
does not recognise, so an un-listed URL does not error — it sends the fighter to
`/`, where nothing claims the link and the app never opens.

Add `https://fightcamp.netlify.app/auth/recovery` under **Authentication → URL
Configuration → Redirect URLs**.

### Enable Associated Domains on the App ID

Required by the universal-link entitlement added in `App.entitlements`. Without
it the entitlement fails to sign and the archive is rejected at upload — the one
item here that is *not* silent.

Developer Portal → Identifiers → `app.fightcamptraining` → **Associated
Domains**.

```sh
grep -n associated-domains ios/App/App/App.entitlements   # 1 hit
```

### Register the watch App ID and enable HealthKit on it

`register_app_identifier` in the Fastfile creates
`app.fightcamptraining.watchkitapp` on first archive, but it creates the
identifier only — it does not set capabilities. Without HealthKit enabled there,
the watch entitlement fails to sign.

See [`apple-watch.md`](./apple-watch.md) § Remaining setup.

### Compile the watch app once

The `FightCampWatch` target now exists and compiles the Swift in
`ios/App/WatchApp/`, but **no Swift in this feature has ever been type checked** —
there is no Swift toolchain in the environment it was authored in. The first
`xcodebuild` is the first compile. Expect to fix errors on that run; the target
existing is what makes them findable rather than invisible.

```sh
grep -c FightCampWatch ios/App/App.xcodeproj/project.pbxproj   # >0 — target present
```

### Attach the IAP products to the version

Carried over from the build-17 rejection and still the single most likely cause
of another one (Guideline 2.1(b)). A subscription that is "Ready to Submit" but
not *attached to the version* is not submitted. See
[`app-store-submission.md`](./app-store-submission.md) § 9a.

---

## Deliberately not doing

- **Guarding `UpgradeModal`'s backdrop-dismiss.** The only state it could
  discard is the monthly/annual toggle. `AuthScreen`'s guard exists because the
  cost there was a half-typed sign-in form.
- **A full visual redesign.** Proposed as three directions in PR #82 and
  declined. (The Liquid Glass work that has since landed is the *existing*
  design system being applied consistently, which is a different thing.)
- **A watch complication, and the game plan on the wrist.** Real gaps, listed in
  [`apple-watch.md`](./apple-watch.md) § Known gaps — but follow-up features
  rather than unfinished work.
