# Frontend Design & UX Audit — Subscription Conversion

**Original scope (Aug 2026):** every screen in `src/`, the paywall stack, onboarding, gamification, coach flows, and sync — audited against one question: *what would make more users subscribe because the subscription is worth more to them?*

**This refresh (Aug 2026, later):** the original audit sat behind roughly 25 merged PRs by the time this pass ran. Every claim below was re-verified against current source — not against commit messages, not against the original doc's own text. About three-quarters of the original findings are resolved; this document keeps only what's still true, with fresh `file:line` evidence, and a prioritized plan for what's left.

**Not retired**, because real gaps remain: Coach Pro still can't deliver its own headline notes-sync claim, the paywall still shows coaches the wrong tier first and doubles up on iOS, and several craft-consistency bugs (three unsynchronized Bluetooth connections, three definitions of weekly adherence, two missing delete confirmations) are untouched.

---

## What's resolved

Grouped by the original section. Each line was independently re-verified, not assumed from the commit that claimed to fix it.

**Paywall truth (was §1.1):** Gym Display now runs a CSS takeover with fullscreen as a best-effort extra rather than the gate (`RoundTimer.tsx:241-256`, `GymDisplay.tsx:52-53`). Preset-count and timer-history claims were removed rather than fixed — the paywall no longer promises either (`UpgradeModal.tsx:22-32`). AI Insights, Cut Coach, and Post-Fight Insights all now stream from a server-side Netlify function on the app's own key, gated by a server-verified subscription with a monthly quota (`src/lib/aiCoach.ts:56` → `netlify/functions/ai-coach.ts:181-189`); `src/utils/apiKey.ts` no longer exists and `dangerouslyAllowBrowser` has zero matches in `src/`. "Team analytics overview" and "unlimited linked fighters" were dropped from the Coach Pro card rather than built. The trial disclosure is now conditioned on platform (`ProGate.tsx:87-90`, `UpgradeModal.tsx:199,239`). `RoundTimer.tsx` now imports the canonical `isPro()` with its `expiresAt` check instead of hand-rolling one (`RoundTimer.tsx:11,258`). A real RevenueCat→Supabase webhook now writes `revenuecat_subscriptions`, and `fetchServerSubscription()` reads both that table and Stripe's, so an App Store purchase now reaches the web app after sign-in (`netlify/functions/revenuecat-webhook.ts`, `AppContext.tsx:400-419`) — this resolves the finding by a different mechanism than the one originally proposed, so a reader citing the old `sync.ts`/`plugins/RevenueCat.ts` line numbers would be misled into thinking the bridge is still missing.

**Paywall UX (was §1.2):** the Fighter Pro card now leads with AI Insights, Nutrition, Game Plan, and camp comparison — the value-dense features — with Gym Display pushed to fifth (`UpgradeModal.tsx:22-32`); the weakest-first ordering is gone even though the same `.slice(0, 5)` mechanic remains. A signed-out web checkout now shows "Sign in before subscribing..." and opens the auth sheet before any purchase attempt (`UpgradeModal.tsx:114-116`). Dashboard and off-season tool tiles for AI/Nutrition/Game Plan now carry a `ProChip` badge for non-Pro users, so the paywall is an informed tap rather than an ambush (`Dashboard.tsx:486,499,512`; `OffSeasonDashboard.tsx` — same pattern under a differently-cased binding). `ProGate`'s dimmed-preview pattern, previously used once, now backs three feature areas plus a fourth compact "PRO" badge variant (`RoundTimer.tsx:367,521,677`, `FightBreakdown.tsx:324`, `WeightTracker.tsx:368`) — and the remaining four full-page gates (`App.tsx:287-291`) now sell real bullet lists and trial terms instead of a bare sentence.

**Onboarding (was §1.3):** the Anthropic API-key step is gone from the flow entirely (`Onboarding.tsx`, full file — no key input exists). The review-ask placeholder URL and `window.open` are gone; review requests now run through a native plugin fired at earned moments (belt-up, made-weight) instead of first launch (`src/utils/appReview.ts:18-29`, `WeightTracker.tsx:145`). The fight-date floor is now 7 days everywhere, matching Settings (`Onboarding.tsx:74`, `Settings.tsx:150`). A dedicated Pro-offer screen now sits between camp generation and finish, exactly the slot the original audit asked for (`Onboarding.tsx:761-835`). A real lbs/kg preference exists and is threaded through Settings, WeightTracker, and the AI prompt builder (`src/utils/units.ts`, `src/hooks/useWeightUnit.ts`).

**Retention (was §1.4):** a streak-at-risk push now fires from live streak state, alongside a new weekly recap (`src/utils/notifications.ts:120-167`). Sharing is an explicit per-log button, not a force-open (`WorkoutLogger.tsx:174-180`); the watermark uses the real domain (`fightcamp.netlify.app`, `ShareCard.tsx:31`) and belt/streak/PR/fight-result cards exist alongside session cards (`ShareCard.tsx:7-9`, `CelebrationToast.tsx`, `FightBreakdown.tsx:161-162`).

**Data-loss and revenue integrity (§1.5, most of §1.6):** all four data-loss bugs and the forgeable-entitlement issue were already marked resolved in the prior version of this doc and remain so.

**Copy (was part of §3):** "Clapper" is now an internal function name only, never rendered (`useRoundTimer.ts:209` vs zero hits in any component). The raw `no-data` enum is mapped to an em dash in the KPI grid (`FightBreakdown.tsx:55`). "vs Unknown (Similar)" is gone — an unnamed partner now renders as "Similar-level partner" everywhere it's shown, including AI prompts (`WorkoutLogger.tsx:271`, `CoachDashboard.tsx:197,481`, `AIInsights.tsx:93`). "N to go" on off-season rows is now gated behind `hasCutTarget` (`WeightTracker.tsx:402`). The "Powered by Claude Opus · Adaptive thinking" line is gone along with the client-side AI calls it was describing. Sign-in and sign-up errors now go through `friendlyAuthError()` instead of surfacing raw Supabase text (`AuthContext.tsx:116,126,158`).

**Navigation and accessibility (was most of §3):** resolved by two follow-on PRs after this audit — a view-history stack with a working back button on every off-tab-bar view, `gray-450` replacing the AA-failing `gray-500` across 121 sites, dialog semantics (focus trap, Escape, stacking) on every overlay including the paywall, accessible names on the readiness gauge and all charts, `aria-pressed` on every toggle group, and 44pt targets with labels. No-camp empty states (`WeightTracker`, `WorkoutLogger`, `WeeklyPlanner`, `OffSeasonDashboard`) already routed through a shared `NoCampState` component before this audit's navigation fix landed, which is a case worth flagging on its own: the original doc's specific claim ("four screens `return null`") was already stale when it was written down, not just stale by the time of this refresh.

---

## What's still open

### Paywall UX

- **Coaches are still shown the wrong tier first.** `CoachDashboard`'s "Unlock Coach Pro" button opens the same modal with no tier hint (`CoachDashboard.tsx:528,676`); `UpgradeModal` always renders the Fighter Pro card before Coach Pro regardless of entry point. A coach can still plausibly buy the tier that doesn't unlock what they tapped.
- **Double paywall on iOS, unchanged.** The custom modal's native purchase path calls `RevenueCat.presentPaywall()` directly (`UpgradeModal.tsx:102`) — a second full decision screen after the one the app just showed.
- **Backdrop tap still dismisses silently.** Both `UpgradeModal` (`:155`) and `AuthScreen` close on any backdrop click with no confirmation, discarding tier selection or a half-typed form. Low severity, but the dialog-semantics work that added focus traps and Escape to these same components didn't touch this.
- **Free users still walk into a paywall with no warning.** The iOS Bluetooth-unavailable message links straight to "Apple Health Import," which is a Pro-gated view (`FitnessTrackerHub.tsx:310` → `App.tsx:291`), with no signal beforehand that the link leads to a paywall.

### Coach Pro's own claims still aren't true

The misleading paywall copy was removed rather than the underlying gap closed — worth stating plainly, since "claim removed" reads like progress but isn't the same as "feature built":

- `coach_notes` still never syncs. The table and RLS policies exist (`supabase/schema.sql:261-277`), but `src/lib/sync.ts` has zero references to it, and the cloud/linked-fighter branch of `CoachDashboard.tsx` (`:117-230`) has no notes UI at all — only the local-only reducer path (`:331-430`) does. A coach's note still cannot reach a remote fighter.
- No team/roster overview exists anywhere — no fighter/days-out/adherence/readiness table, in `CoachDashboard.tsx` or elsewhere.
- The one piece of R6 that did ship is real and worth keeping: fighter-side "Invite your coach" is a complete, working loop (`CoachConnect.tsx:88-233`).

### Design consistency

- **Three Bluetooth HR connections, still unsynchronized.** `useBluetoothHR()` is still called independently in `RoundTimer.tsx:134`, `Settings.tsx:50`, and `FitnessTrackerHub.tsx:83`, each with its own local state — no shared context, no module-level connection. Connecting in one screen still shows "not connected" in another.
- **Max-HR derivation is unified in value, not formula.** All three sites now correctly prefer the user's saved `currentUser.maxHR` (an improvement — a value set in Settings now actually applies everywhere), but the *fallback formula when unset* still differs: `RoundTimer`/`Settings` use `Math.max(160, 220 - age)`, while `FitnessTrackerHub.tsx:82` uses `220 - age` with no floor and a different bare default (185 vs. 195). Only visible for users who've never set the field.
- **Weekly adherence still has three independent definitions** — `campKpis.ts:54` clamps at 100%, `ProgressCharts.tsx`'s calculation and `OffSeasonDashboard.tsx:63-64`'s raw `weekDone`/`weekPlanned` ratio don't share that clamp or a common source.
- **Two of the four delete confirmations the original audit flagged are still missing.** `FightBreakdown.tsx` now uses the shared `ConfirmDialog` (`:151`), but HRV entries (`FitnessTrackerHub.tsx:567`) and whole nutrition days (`NutritionTracker.tsx:419`) still delete on a single tap with no confirmation of any kind.
- **Preset delete is still hover-only**, invisible on touch (`RoundTimer.tsx:351`, `hidden group-hover:flex`), and **tapping a preset while a session is running still isn't guarded** — no `disabled` state ties the preset buttons to `isRunning` (`RoundTimer.tsx:319-326`).
- **Coach IA**: the Dashboard and Fighters tabs still render the identical `CoachDashboard` component (`App.tsx:273,322`) — unchanged. The Progress tab's coach empty state is no longer a bare dead end, though; it now explains itself and redirects to Fighters (`ProgressCharts.tsx:158-167`).

### Visual system

- Color tokens are still stock, untinted Tailwind orange plus pure neutral grays (`tailwind.config.js:20-40` — every `dark-*` value has equal R/G/B). The one addition, `gray-450`, is a contrast fix, not a brand-tinting pass.
- `@fontsource/inter` is still installed (`package.json:47`) and still never imported anywhere in `src/` — confirmed by a repo-wide search, not by re-reading the same line the original audit cited. `index.css:20` still falls through to system-ui.

### Retention and craft debt

- No password-reset flow exists in `AuthScreen.tsx`, and `signUp` still has no `emailRedirectTo` (`AuthContext.tsx`) — confirmation links can still dead-end outside the app.
- AI analysis output is still `useState`-only in both `AIInsights.tsx:154` and `PostFightInsights.tsx:111` — navigating away still destroys an analysis the subscription just paid to generate, even though the BYO-key problem around it is fully fixed.
- Notification settings are still one "Training reminders" toggle (`Settings.tsx:815-828`) covering every notification type that's been added since, including the new streak-risk and weekly-recap pushes — the granularity gap the original audit predicted has now actually arrived.
- The Round Timer's session-complete screen is still just "Session complete!" and a restart button (`RoundTimer.tsx:465-467`) — no session summary, no contextual Pro line.
- Made weight still makes Cut Coach disappear outright rather than switching to fight-week content (`WeightTracker.tsx:366-370`) — though the moment is no longer silent: it now triggers a native review request (`WeightTracker.tsx:145`), which the original audit separately asked for and got, just not paired with the fight-week replacement it also asked for.

---

## Phase 2 — prioritized plan

**P0 — Paywall trust, the last mile (days)**
1. Pass an explicit tier hint from `CoachDashboard`'s upgrade entry point so a coach sees Coach Pro first.
2. Replace the second RevenueCat paywall sheet with a direct purchase call, or fold the two decision points into one.
3. Guard backdrop-dismiss on `UpgradeModal`/`AuthScreen` behind a confirm when the user has unsaved input (tier selected, form partially filled).
4. Add a "Pro feature" label to the Apple Health link in the Bluetooth fallback message before the tap, not after.

**P1 — Make Coach Pro's own claims true (1–3 weeks)**
5. Sync `coach_notes` through `sync.ts` and build the notes UI in the cloud fighter view — schema and RLS already exist; this is wiring plus one screen.
6. Build the minimal Team Overview table (fighter, days-out, adherence, readiness, red flags) — every field is already queryable.

**P2 — Consistency and craft (parallel, well-scoped)**
7. Lift `useBluetoothHR` to a shared context so one connection serves every screen.
8. Unify the max-HR fallback formula and the adherence calculation into single shared utilities.
9. Add `ConfirmDialog` to the HRV-entry and nutrition-day delete actions.
10. Fix the preset UI: an always-visible (not hover-only) delete affordance, and disable preset selection while a session is running.
11. Split "Training reminders" into per-category toggles now that there are four distinct notification types riding on one switch.
12. Persist AI analysis output to app state so it survives navigation.
13. Add a password-reset flow and `emailRedirectTo` to the signup call.

**P3 — Visual identity (do last, or alongside a deliberate redesign)**
14. Load `@fontsource/inter` (it's already a dependency) or drop it from `package.json` if system-ui is the actual intended fallback.
15. Tint the neutral palette toward the brand hue if a visual refresh is ever prioritized — the user has already reviewed and declined a full redesign proposal (three directions, PR #82), so this is deliberately last and small: token-level tinting only, not a new visual language.

---

*This refresh re-verified every claim in the prior version against current source, independent of commit messages and independent of the prior document's own text. Where a fix used a different mechanism than originally proposed (the RevenueCat bridge) or removed a claim rather than building the feature (Coach Pro's team-analytics and notes promises), that distinction is called out explicitly rather than scored as a plain pass.*
