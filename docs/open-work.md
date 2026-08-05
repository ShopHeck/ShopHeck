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

### Coach information architecture

The Dashboard and Fighters tabs render the identical `CoachDashboard` component,
so a coach has two tabs showing one screen.

```sh
grep -n "CoachDashboard />" src/App.tsx     # two hits, same component
```

Now more worth fixing than it was: the Team Overview triage table gives the
Dashboard tab something of its own to be, with Fighters remaining the roster and
detail view.

### Made weight hides Cut Coach instead of replacing it

`WeightTracker` drops the Cut Coach panel entirely once `proj.status === 'made'`,
so the fighter loses the feature at the moment fight-week rehydration and
refuelling advice would be most useful.

```sh
grep -n "proj.status !== 'made'" src/components/WeightTracker.tsx
```

### Palette is untinted stock Tailwind

Every `dark-*` token has equal R/G/B and `brand-*` is stock Tailwind orange.

```sh
sed -n '31,42p' tailwind.config.js
```

Deliberately low priority — a full redesign was proposed and declined (PR #82),
so this is token-level tinting only, not a new visual language.

### Adaptations and corner sessions are local-only

`campAdaptations`, `cornerSessions` and `aiAnalyses` never reach the cloud —
`pushState` enumerates the `user_state` columns it sends, and none of these are
among them. Consequences, in order of how much they matter:

- A coach sees the **unadapted** plan for a fighter who accepted a deload.
- A fighter who reinstalls loses their corner-scored fights.

Adherence is *not* affected, by design: an adaptation never changes a week's
session count, so a coach's adherence figure still matches their fighter's.

Closing this means a schema migration (a `jsonb` column on `camps`, or new
tables) plus push/pull wiring — see `src/lib/sync.ts`.

### Apple Watch target is not in the Xcode project

The watch app's Swift exists and is reviewed, but `project.pbxproj` is
unchanged and **none of the Swift has been compiled**. See
[`apple-watch.md`](./apple-watch.md) for the target setup and why it was left as
an Xcode step.

```sh
grep -c WatchApp ios/App/App.xcodeproj/project.pbxproj   # 0
```

---

## Deliberately not doing

- **Guarding `UpgradeModal`'s backdrop-dismiss.** The only state it could
  discard is the monthly/annual toggle. `AuthScreen`'s guard exists because the
  cost there was a half-typed sign-in form.
- **A full visual redesign.** Proposed as three directions in PR #82 and
  declined.
