# Open work

**Verified against source on 2026-08-05; ops items updated 2026-08-06.** Every
item below was checked by reading the code or by an explicit operator action —
not by trusting a previous document.

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

### Run the watch app once, on a wrist

The archive now builds, signs and uploads with the watch app inside it. Two
things that does *not* establish, in order:

1. **That a build exists to install.** The `beta` lane passes
   `skip_waiting_for_build_processing: true`, so the workflow goes green the
   moment the upload transmits — not when App Store Connect finishes with it.
   Apple can reject a binary during asynchronous processing and CI never hears
   about it. Confirm the build actually appears in TestFlight first.
2. **That any of it runs.** Every line of `ios/App/WatchApp/` has been type
   checked and none of it has been executed: the bells, the phone link, the
   heart-rate stream and the clock are all reasoning rather than observation.

Then pair a watch, install it, and work through
[`apple-watch.md`](./apple-watch.md) § Verifying. Expect to find things; a
compiler agrees a `Timer` is well typed, not that it fires when the wrist drops.

### Attach the IAP products to the version

Carried over from the build-17 rejection and still the single most likely cause
of another one (Guideline 2.1(b)). A subscription that is "Ready to Submit" but
not *attached to the version* is not submitted. See
[`app-store-submission.md`](./app-store-submission.md) § 9a.

### Upload App Store assets (local set is ready)

Local generation already passes:

```sh
npm run verify:appstore   # must exit 0 — screenshots + previews present
```

Still open: upload the files under `ios/fastlane/screenshots/en-US/` in App
Store Connect (that directory is gitignored; regenerate with
`npm run appstore:assets` if missing).

---

## Closed — ops (2026-08-06, operator confirmed)

- **Supabase migrations applied** (sync columns + auth hardening).
- **Password-reset redirect allow-listed:**
  `https://fightcamp.netlify.app/auth/recovery`

Optional smoke after those two:

1. Sign in on a second device / fresh install → adaptations, corner sessions,
   AI analyses, and official weigh-in flag sync without a banner error.
2. Request password reset → link opens the app recovery screen (not bare `/`).

---

## Closed in the 2026-08-06 implementation pass (code)

- Canonical `schema.sql` ends with authorization hardening so a full re-run
  cannot undo RLS (verify: `tail supabase/schema.sql`).
- First-party `ios/App/App/PrivacyInfo.xcprivacy` bundled in the App target.
- Nutrition sync upserts on `(user_id, camp_id, date)` to avoid multi-device
  unique violations (`src/lib/sync.ts`).
- Coach Pro list/detail/team queries paginate via `selectAll` and surface errors
  instead of returning a silent empty roster (`src/lib/coachLinks.ts`).
- Custom timer presets push/pull with the rest of cloud sync.
- CocoaPods vs Bundler documented in `docs/ios-cocoapods.md`.
- App Store screenshots + preview videos generated; `npm run verify:appstore`
  green locally.

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
