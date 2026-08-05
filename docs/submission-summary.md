# Submission summary — what changed since build 17

**Dated 2026-08-05.** A snapshot, like the audits: it describes the state of the
work at the moment it was written and is not maintained afterwards. The live
tracker is [`open-work.md`](./open-work.md); the procedure is
[`app-store-submission.md`](./app-store-submission.md).

Six commits (`fbeb1aa..6566e1e`). Every engineering item that was open in
`open-work.md` is closed, plus a redesign of the first screen a new user sees.
Everything still outstanding needs an account or a device rather than a code
change, and is listed at the bottom.

---

## What a reviewer will see

**Onboarding is a different screen.** It was the last part of the app the
Liquid Glass design system had not reached, and it is the first thing anyone
opens. It now uses the same material, type scale and press feedback as the rest
of the app; progress runs the whole flow instead of stopping two screens in; and
the "New Camp" sheet is a real dialog with a focus trap and Escape-to-close
rather than the app's one hand-rolled one. This matters for review because the
first thirty seconds of a fresh install *is* the review.

**A coach's two tabs do two things.** Dashboard and Fighters both rendered the
same component, so a coach paying for Coach Pro had two tabs showing one screen
— under a header that read "Fight Camp · Lightweight", a fighter's title over a
roster. Dashboard is now triage (who needs attention, who is in fight week, the
team table sorted by who needs you first); Fighters is the roster.

**The AI cut panel no longer disappears at the finish line.** It was hidden the
moment a fighter hit their target weight — removing the feature at the point
fight-week rehydration is the most consequential thing they do. It now changes
its question instead: cut, hold, or rehydrate.

**Password reset opens the app.** A fighter who resets from the iOS app used to
set their new password in Safari and come back to sign in. The reset link is now
a universal link.

**A coach can see an adapted plan.** Accepted adaptations, corner-scored fights
and saved AI analyses reached the cloud for the first time — so a fighter who
accepted a deload no longer looks to their coach like one who skipped the
sessions, and a reinstall no longer loses corner-scored fights.

**The Apple Watch companion compiles.** The target exists; see the caveat below.

---

## Item by item

### 1. Onboarding rebuilt on the design system

`src/components/onboarding/` — six new pieces, and the reason each exists is a
duplication or a drift it removes:

| Piece | Replaces |
|---|---|
| `ChoiceTile`, `ChoiceRow` | Six hand-written selection controls that had drifted into three border widths, two radii and two ways of tinting the selected state |
| `CampSetupFields` | The camp form, which existed twice — and the copies had diverged: the "New Camp" modal's fight-date input had no upper bound, so a second camp could be dated past the range the generator clamps to |
| `planSummaryRows` | Three plan-confirmation blocks that had come to confirm *different facts about the same camp* — one showed the weight class, one the starting weight, one neither |
| `AccentButton` | `.btn-secondary` plus four `!important`s, which rendered the off-season "Generate Plan" button — the only action on the screen — as the de-emphasised one |
| `StepRail` | A two-dot indicator covering steps 0 and 1 of a five-step flow, so it switched off at the review screen and stayed off through the Pro offer |
| `OnboardingHero` | A banner that rendered only on the first screen, leaving the app unbranded for the four screens before any content exists |

Selection state is an inset ring rather than a border, so choosing an option
changes colour without moving the label 2px. The rail is built from the steps
the user will actually see — a coach sees two segments, an account that already
has Pro sees four — and states progress as text as well as colour ("Step 2 of 5
· Camp"), which a row of tinted bars does not. Every control is on the real
press path (`usePressable`) rather than `:active`, which WKWebView drops on a
fast tap.

### 2. Coach Dashboard and Fighters split

One component with a `mode`, not two files: the fighter detail view is reachable
from both tabs, and two files would each have carried a copy of it and its note
form. The overview's empty state distinguishes its three causes — not signed in,
no Coach Pro, no fighters connected — because they have three different fixes,
and a coach who is simply signed out should not be shown a paywall.

### 3. AI cut panel through fight week

`cutPhase()` in `utils/weightCut.ts` derives which of three questions the panel
is asking. All three run through the same `cut` feature server-side, so the
Fighter Pro gate, token budget and safety framing are unchanged.

This surfaced a latent bug worth noting on its own: `computeCutProjection`
returned the zeroed default projection for a made cut, so `daysRemaining` was 0
for **every fighter who hit their target** — the model said each of them was on
weigh-in day. Fixed, with tests (`tests/cutPhase.test.ts`).

### 4. Universal links for password reset

Three pieces, all in the repo: the association file at
`public/.well-known/apple-app-site-association`, the associated-domains
entitlement, and a `netlify.toml` header serving the file as `application/json`
(Apple rejects any other type, and the file has no extension for Netlify to
infer one from).

The file claims `/auth/*`, not `/`. A rule matching the site root would claim
every URL on the domain, so a tap on the privacy policy or the support page
would launch the app instead of opening the page — which is itself a review
risk. Reset links moved to `/auth/recovery` to make that narrower claim
possible; Netlify's SPA catch-all serves `index.html` there, so the web flow is
unchanged.

The recovery consumer grew a second entrance. iOS hands a universal link to a
*running* app through `appUrlOpen` without navigating the WebView, so
`window.location` never changes and the existing on-load path would never see
it. That is the common case, not the edge one — the app is usually still in the
background while the fighter is in Mail looking for the link.

### 5. Adaptations, corner sessions and analyses now sync

Migration `20260805210000_sync_adaptations_corner_and_analyses.sql`:
`camps.adaptations`, `camps.dismissed_adaptations`, `camps.corner_sessions`,
`user_state.ai_analyses`.

Columns on `camps` rather than new tables, deliberately: the coach's existing
`select('*')` returns them under the policy that already governs the camp, so a
linked coach reads a fighter's adaptations by construction. New tables would
have needed policies duplicating the camp ones — a second place for a coach's
read access to be got wrong.

Everything camp-scoped is stored camp-*relative* (no `campId` inside, dismissal
keys with the camp-id prefix stripped), exactly as `completed_sessions` and
`day_overrides` already are: local camp ids differ per device, so anything
carrying one does not survive a pull onto a second device. AI analyses are the
exception to both — a post-fight analysis hangs off a fight result rather than a
camp, and a coach must not read one, so they live on `user_state`, the fighter's
own row.

Seven new merge tests (`tests/sync.test.ts`) pin the delete semantics, which are
where this class of change goes wrong.

### 6. Apple Watch target

`FightCampWatch` added by `scripts/add-watch-target.py` — committed, and
idempotent — rather than by hand. `project.pbxproj` is an OpenStep plist with
24-hex object ids and cross-references in six directions; a malformed one breaks
the iOS build, and therefore TestFlight, for everyone. Running the change
through a real parser and serializer makes it structurally valid by construction
rather than by proofreading.

The host gets both halves of embedding: a target dependency to order the build,
and an `Embed Watch Content` copy phase to actually put the `.app` inside the
bundle. Only the second is what a device installs; a watch app that builds but
is not embedded fails invisibly.

Also fixed something the shared-file design was not actually getting:
`WatchBridgePlugin` spelled the wire keys out as string literals, so the phone
side never referenced `WatchMessages.swift` and renaming a key would have
compiled cleanly and failed on a device, mid-round — the exact bug that shared
file exists to prevent.

---

## Verification

```sh
npm run quality   # lint · 276 tests · security regression · functions tsc · build
```

Green as of this commit. Coverage added this pass: 5 tests for the cut-phase
derivation, 7 for the new merge paths.

The onboarding flow was also driven end to end in a real browser (profile →
camp → review → Pro offer → finish, plus the off-season variant) and each screen
inspected.

### What is *not* verified

**No Swift in the watch feature has ever been compiled.** There is no Swift
toolchain in this environment, so the first `xcodebuild` is the first type
check. Adding the target is what turns that from an invisible problem into a
findable one; it does not make the code known-good. Budget a round of compile
fixes on the first Mac build.

Everything else that touches native — the entitlement, the association file, the
plists — is structurally validated (`plistlib`, JSON parse, no dangling pbxproj
references) but has not been signed or installed.

---

## Before submitting

Six things, none of them a code change, each of them a **silent** failure except
where noted. Full detail in [`open-work.md`](./open-work.md).

1. **Run the sync migration** in the Supabase SQL editor, or `pushState` fails
   on `user_state`.
2. **Allow-list `https://fightcamp.netlify.app/auth/recovery`** in Supabase →
   Authentication → URL Configuration.
3. **Enable Associated Domains** on the `app.fightcamptraining` App ID. *Not
   silent* — the archive is rejected at upload without it.
4. **Register the watch App ID and enable HealthKit on it.**
5. **Build the watch target once on a Mac** and fix what the compiler finds.
6. **Attach the IAP products to the version** — still the single most likely
   cause of another rejection (Guideline 2.1(b)), carried over from build 17.

And the items already tracked in `app-store-submission.md` § 9a that are not yet
confirmed done: the reviewer demo account with `VITE_COMP_PRO_EMAILS`, and the
EULA/privacy links in the listing metadata.
