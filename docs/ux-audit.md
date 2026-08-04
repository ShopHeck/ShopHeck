# Frontend Design & UX Audit — Subscription Conversion

**Scope:** every screen in `src/` (all 30 components, shared chrome, contexts, gating utilities), the paywall stack (RevenueCat / Stripe / ProGate / UpgradeModal), onboarding, gamification, coach flows, and sync — audited against one question: *what would make more users subscribe because the subscription is worth more to them?*

**Method:** full source read with four parallel deep passes (timer/trackers, weight/nutrition/planner, analysis/fight screens, coach/sync/gamification). Every claim below carries a `file:line` reference. Headline bugs were re-verified by hand.

---

## Executive summary

The app underneath is genuinely good: the camp generator, the least-squares cut projection (`src/utils/weightCut.ts`), the readiness engine (`src/utils/readiness.ts`), and the post-fight factor tuner (`src/utils/factorTuner.ts`) form a fight-to-fight learning loop no mainstream competitor has. The subscription problem is not a lack of value — it's that **the paid tier's promises don't survive contact with the product, the free tier gives away the value-dense features while charging for data entry, and the moments of peak user motivation carry zero conversion or sharing hooks.**

Five findings dominate everything else:

1. **The paywall sells things that are broken or don't exist.** Gym Display — feature #1 on the Fighter Pro card — does nothing on iPhone (`RoundTimer.tsx:232`: `requestFullscreen()` doesn't exist in iOS WKWebView for non-video elements; the synchronous TypeError isn't caught by `.catch()`, so `isFullscreen` never flips). "Timer session history" (`UpgradeModal.tsx:17`) has no implementation anywhere. "8 saved custom timer presets" (`UpgradeModal.tsx:14`) is actually free-2 / pro-unlimited (`RoundTimer.tsx:239,333`). Coach Pro's "Team analytics overview" (`UpgradeModal.tsx:29`) doesn't exist, and its headline "Coach dashboard & fighter notes" can't work: `coach_notes` is never synced (`src/lib/sync.ts` has no read/write path for it), so a coach's note can never reach a fighter's device.

2. **All three AI features require the subscriber to bring their own Anthropic API key** (`AIInsights.tsx:169`, `CutCoach.tsx:78`, `PostFightInsights.tsx:124`, key stored in localStorage via `src/utils/apiKey.ts`, called with `dangerouslyAllowBrowser: true`). A $7.99/mo subscriber taps "AI Insights", and is asked to go create a developer account at console.anthropic.com. This is the single largest gap between what the paywall sells ("AI Insights & coach analysis", `UpgradeModal.tsx:18`) and what the product delivers — and it neutralizes the most marketable feature category of 2026. Meanwhile the *third* AI feature (PostFightInsights) is completely ungated, undercutting the paid two.

3. **The freemium split is backwards.** Free: all 6 progress charts, the readiness gauge, the full 12-plan meal library *and* macro generator, the fight-result wizard, the full post-fight AI breakdown, unlimited logging, the share-card generator. Paid: the nutrition *data-entry* screen, a game-plan *form*, Apple Health import that requires a desktop computer (`AppleHealthSync.tsx:280-288`). The content that demonstrates value is free; the CRUD around it is paid. And the app's most Pro-shaped feature — Camp Comparison — is unreachable *and* invisible for free users (1-camp cap `App.tsx:150` + entry point buried in Settings `Settings.tsx:641`), so the strongest reason to pay is never even seen.

4. **Every peak-motivation moment is empty.** Session complete → "Session complete!" and nothing (`RoundTimer.tsx:440-449`). Belt promotion → 4-second toast, no share, no review ask, no upsell (`CelebrationToast.tsx`). 100% adherence week → a green bar (`WeeklyPlanner.tsx:82-87`). Fight result saved → straight to a dense stats page. Made weight → the AI Cut Coach upsell literally *disappears* (`WeightTracker.tsx:345` renders the gate only while `proj.status !== 'made'`). The one moment that *does* get a prompt is the worst one: an App Store review ask at the end of onboarding, before any value, pointing at a placeholder URL (`Onboarding.tsx:19-20`, `id000000000`).

5. **Onboarding sells nothing.** The flow asks for an Anthropic API key (`Onboarding.tsx:751-813`) but never mentions Pro, the trial, or what the subscription does — the highest-intent moment in the funnel (right after "Camp Generated!") has no offer. Coaches are forced through the fighter form (age/weight class/experience required, `Onboarding.tsx:461-511`) and never see a coach-specific pitch.

**The one-sentence strategy:** make the paywall true, move the AI server-side so the subscription includes it, put the paywall on the *analysis* layer (AI + camp-to-camp learning + coach loop) instead of the data-entry layer, and attach conversion/share/review hooks to the moments the app already celebrates.

---

## Part 1 — What's blocking conversion today

### 1.1 Broken promises at the point of sale (P0 — trust + App Review risk)

| # | Claim at paywall | Reality | Evidence |
|---|---|---|---|
| 1 | "Gym Display — fullscreen big-screen mode" (top-billed, `UpgradeModal.tsx:13`) | Broken on iPhone. `document.documentElement.requestFullscreen()` is undefined in iOS WKWebView for non-video elements; the call throws synchronously, `.catch()` never runs, `fullscreenchange` never fires, `isFullscreen` stays false. Paying user taps, nothing happens. | `RoundTimer.tsx:230-236,242` |
| 2 | "8 saved custom timer presets" | Free = 2, Pro = unlimited. "8" appears nowhere in code. | `UpgradeModal.tsx:14` vs `RoundTimer.tsx:239,333` |
| 3 | "Timer session history" | No implementation exists anywhere in the codebase. | `UpgradeModal.tsx:17` |
| 4 | "AI Insights & coach analysis" | Requires subscriber's own Anthropic API key; never disclosed on the paywall. | `UpgradeModal.tsx:18` vs `AIInsights.tsx:169,237-272` |
| 5 | "Coach dashboard & fighter notes" | Notes are local-only; `coach_notes` never syncs, and the cloud fighter detail view has no notes UI at all. A coach's note cannot reach a fighter. | `UpgradeModal.tsx:28`, `CoachDashboard.tsx:115-228` (no notes in cloud branch), `sync.ts` (no coach_notes path), `supabase/schema.sql:259-276` (table exists) |
| 6 | "Team analytics overview" | Does not exist. | `UpgradeModal.tsx:29` |
| 7 | "Unlimited linked fighters" (implies a free cap) | No cap exists anywhere; free coaches link unlimited fighters. | `UpgradeModal.tsx:29`, `coachLinks.ts` (no limit) |
| 8 | "7-day free trial · cancel anytime" on every page gate and both paywall cards | True only on iOS/RevenueCat. The web path is a bare Stripe Payment Link with no trial mechanism in code. | `ProGate.tsx:73`, `UpgradeModal.tsx:168,209` vs `:94-107` |

Items 1–6 are also **App Review exposure** (Guideline 2.3.1 — accurate metadata/feature claims for a paid product). Fix the copy or fix the features before optimizing anything else; a funnel that converts into refunds and 1-star reviews is worse than a weak funnel.

Two entitlement-integrity issues sit in the same bucket:

- `RoundTimer.tsx:238` hand-rolls `isPro` as `tier !== 'free'`, ignoring `expiresAt` — an expired Stripe soft-unlock keeps timer Pro features forever, while the canonical `isPro()` (`subscription.ts:54`) is used everywhere else. One entitlement check, one import.
- App Store purchases never reach other platforms: there is no RevenueCat→server bridge, `sync.ts:660` deliberately never pulls `subscription`, and the web `RevenueCat` stub returns `free` (`plugins/RevenueCat.ts:14-17`). (Web Stripe → iOS *does* work after sign-in via `fetchServerSubscription`.) A subscriber who bought on iPhone and opens the web app sees ads and paywalls on the product they pay for.

### 1.2 The paywall itself (UpgradeModal + gates)

- **Weakest-features-first ordering.** The Fighter Pro card shows `FIGHTER_PRO_FEATURES.slice(0, 5)` — all five are timer minutiae (Gym Display, presets, warning bell, reaction prompts, the nonexistent history). AI, Nutrition, Game Plan, Apple Health, and Unlimited camps are collapsed into "+ 5 more features" (`UpgradeModal.tsx:171-177`).
- **Coaches are shown the wrong product.** Tapping "Unlock Coach Pro" on the coach dashboard opens the generic modal with Fighter Pro ($7.99) first (`CoachDashboard.tsx:526` → `UpgradeModal.tsx:163`). A coach can plausibly buy the tier that won't unlock what they tapped.
- **Double paywall on iOS.** The custom modal's "Start Free Trial" opens a *second* paywall (RevenueCat's sheet, `UpgradeModal.tsx:87`). Two decision screens per purchase.
- **Backdrop tap dismisses the paywall** silently mid-decision (`UpgradeModal.tsx:128`), and the auth modal does the same to a half-typed form (`AuthScreen.tsx:53`).
- **Signed-out web checkout is orphaned.** `client_reference_id` is only attached if a user exists (`UpgradeModal.tsx:101`); a signed-out buyer's webhook entitlement can never find an account, and nothing in the modal says "sign in first".
- **No lock affordances upstream.** Dashboard/off-season "Tools" tiles for AI Insights, Game Plan, and Nutrition look identical to free tiles (`Dashboard.tsx:460-531`, `OffSeasonDashboard.tsx:363-398`) — the paywall is always an ambush, never an invitation. Meanwhile genuinely premium-feeling free features (live HR zones, MEP, background round bells, voice announcements, custom bell) carry no "included free" framing that would make Pro feel like the next step on a ladder.
- **Free users hit a paywall from inside "free" flows with no warning** — e.g. the iPhone Bluetooth fallback text routes users to Apple Health, which is paid (`FitnessTrackerHub.tsx:310,368` → `App.tsx:242`).
- `ProGate`'s dimmed-preview mode (used once, for CutCoach at `WeightTracker.tsx:347`) is the best-converting pattern in the app; the four full-page gates (`App.tsx:238-242`) sell a text description instead of showing the feature.

### 1.3 Onboarding & first-run (activation)

- **The Anthropic API key step** (`Onboarding.tsx:751-813`) is a conversion killer positioned at peak intent: >99% of fighters don't know what an API key is, it's asked *before any data exists* for the AI to analyze, and it frames the app's flagship as "bring your own infrastructure". Nothing on this step mentions Pro.
- **Review ask at first run** (`Onboarding.tsx:892-907`): asks for an App Store review before the user has done anything, via `window.open` to a placeholder URL (`id000000000`, `Onboarding.tsx:19-20`). Dead link, wrong moment, wrong API (should be native `SKStoreReviewController` at an earned moment).
- **Fight date must be ≥42 days out** (`Onboarding.tsx:74`, `minDate = addDays(new Date(), 42)`). A fighter with a bout in 4 weeks — exactly the person who downloads a fight-camp app — cannot create a camp for it. (Settings' edit modal uses 7 days, `Settings.tsx:184` — inconsistent.)
- **Coach onboarding is fighter-shaped**: age, weight class, experience required (`Onboarding.tsx:461-511`); role is then permanently uneditable (`Settings.tsx:975-1035` has no role field; only remedy is a full reset).
- **No trial/Pro moment anywhere in the flow.** The natural slot exists: the "Camp Generated!" success screen (step 2) is the emotional peak, and step 3 is currently the API-key ask.
- Units: **lbs is hardcoded everywhere** (~14 render sites in WeightTracker alone, plus validator, prompts, dashboard). Muay Thai/BJJ/boxing outside the US weigh in kg; there is no unit preference in the codebase. This silently shrinks the addressable market of a combat-sports app.

### 1.4 Retention plumbing (what keeps trials from converting)

- **Notifications:** exactly two static daily reminders (7pm log nudge, 8am weigh-in, `notifications.ts:68-84`). The streak system computes `atRisk` (`gamification/streak.ts`) but never notifies; nothing fires for "trial converts in 2 days", missed weigh-ins, week recaps, or fight-week.
- **Gamification is a closed loop.** Belts, streaks, XP, 17 achievements, weekly challenges — zero connection to the paywall, sharing, reviews, or notifications (`grep ProGate|ShareCard` in `src/components/gamification/` → 0 hits). XP is a bare number with no level or meaning (`ProgressScreen.tsx:38-40`).
- **Sharing is an anti-loop.** A full-screen share modal force-opens after *every* workout log (`WorkoutLogger.tsx:125`) — the over-prompt pattern — while the actually shareable moments (belt, PR, fight win, streak) have no card at all. The card's only attribution is unlinked gray text reading `fightcamp.app` (`ShareCard.tsx:172`) — **a domain the app doesn't own** (real domain: fightcamp.netlify.app). The stats-card variant has no watermark at all (`ProgressCharts.tsx:39-143`). No referral, no deep link, no App Store link, no QR.
- **Sync/account asks happen only at cold start** (`Onboarding.tsx:353`) and in Settings. No "back up your 12-session streak" prompt at earned moments. Sign-up has no password reset (`AuthScreen.tsx`), and email confirmation dead-ends outside the app (`AuthContext.tsx:58-62`, no `emailRedirectTo`).
- **AI output is never persisted** — `insights` lives in `useState` only (`AIInsights.tsx:151`, `PostFightInsights.tsx`); navigating away destroys the analysis the user just paid (Anthropic) for, and every re-read is another API call.

### 1.5 Data-loss and correctness bugs that nuke trust (P0)

Users don't subscribe to apps that lose their data. Four verified cases — all four since fixed and verified in code (Aug 2026):

1. ~~**Saving generated macros wipes the day's nutrition log.**~~ **Resolved:** `MealLibrary.handleSave` now carries the day's existing water/meals/notes through and stamps a local-calendar date.
2. ~~**Clearing the Total Rounds field deletes all round-by-round notes.**~~ **Resolved:** `adjustTotalRounds` guards with `Number.isFinite` before slicing.
3. ~~**Editing an old fight re-parents it onto the current camp.**~~ **Resolved:** `submit()` keeps `existing?.campId`, so edits stay on their original camp.
4. ~~**Back-dated workouts are stamped with today's week number.**~~ **Resolved:** all three loggers stamp `getWeekNumberForDate(camp, parseISO(date))` — the week the session happened in.

Related trust issues — all resolved (Aug 2026): ~~outcome/method desync saves "KO" on a draw~~ (`selectOutcome` snaps the method when the outcome invalidates it); ~~readiness is snapshotted at data-entry time, not fight time~~ (`computeReadiness` takes an `asOf` moment; new results snapshot as of the fight date, and entries dated after the evaluation moment are excluded); ~~weigh-ins accept future dates~~ (every log-entry date picker is capped at today via `utils/dates`, and submits reject future dates — weigh-ins, workouts, sparring, conditioning tests, fight dates); ~~duplicate same-day weigh-ins chart as two points~~ (`addWeightEntry` corrects the same-day entry in place).

### 1.6 Revenue integrity (quick flags)

- ~~Client-side entitlement is trivially forgeable: any URL with `?tier=coach_pro&stripe_session=x` writes a 30-day unlock (`subscription.ts:84-108`; the comment acknowledges it). The server-verified path exists (`fetchServerSubscription`) — tighten the soft unlock's role now that it does.~~ **Resolved (Aug 2026):** `processStripeReturn` no longer grants anything; entitlements come only from the signature-verified webhook rows.
- The founder comp email ships in the client bundle (`subscription.ts:37`).
- Subscribers' Anthropic keys sit in plaintext localStorage and are used with `dangerouslyAllowBrowser: true` from a WebView (`apiKey.ts`, `AIInsights.tsx:169`) — one more reason BYO-key has to go.
- `?shot` screenshot harness (demo state, `window.__setView`, `__openUpgrade`, forced iOS paywall footer) ships in production (`App.tsx:93-99`, `AppContext.tsx:270`, `UpgradeModal.tsx:63-65`).

---

## Part 2 — Upgrades that generate subscriber value (ranked)

### R1. Ship the AI as a service — the single biggest lever

Replace all three BYO-key features with server-proxied calls (a `netlify/functions/ai-insights.ts` beside the existing `stripe-webhook.ts`, or a Supabase Edge Function — both infra pieces already exist in this repo). The app authenticates with the Supabase session; the function verifies the `subscriptions` row server-side, applies a monthly budget, and streams the response.

- **Fighter Pro includes it**: e.g. 20 analyses/month (camp insights, cut coach, post-fight) — generous enough to feel unlimited, capped enough to bound cost. At ~1–2k output tokens per analysis on a fast model, the per-subscriber cost is cents against $7.99.
- **Free tier gets a taster**: one full AI camp analysis per camp (or the post-fight breakdown once), watermarked with what Pro adds. Today `PostFightInsights` is accidentally 100% free (`FightBreakdown.tsx:239`, no gate) while the near-identical `AIInsights` is paid — invert that accident into a deliberate free sample.
- **Persist outputs** to app state/Supabase so analyses survive navigation and become an artifact ("your camp reports").
- **Delete the API-key UI everywhere** (onboarding step 3, Settings row, three in-feature forms) or demote it to a hidden power-user fallback. The model string is currently hardcoded three times (`claude-opus-4-6` in `AIInsights.tsx:173`, `PostFightInsights.tsx:128`, `CutCoach.tsx:81`) — centralize it server-side where it can be upgraded without an app release.

This converts the paywall's weakest line into its strongest: "Your AI corner: camp analysis, cut guidance, post-fight breakdown — included."

### R2. Make the fight-to-fight learning loop the Pro anchor

The factor tuner (`factorTuner.ts` — post-fight nudges with human-readable rationale, ±20% drift caps) plus Camp Comparison is the app's moat, and it's currently invisible: buried behind Settings → "Integrations" (`Settings.tsx:641`), dead on free (1-camp cap makes comparison structurally impossible, `CampComparison.tsx:64` needs ≥2 camps), and unmentioned by the paywall.

- Re-frame "Unlimited fight camps" as **"Your next camp learns from this fight"**: after a fight result is saved, show the proposed weight changes (already computed, `FightBreakdown.tsx:203-235`) as the emotional payoff, and gate **Apply to Next Camp + Camp Comparison** behind Fighter Pro with a visible preview.
- Give Camp History a real entry point (Dashboard card once ≥1 camp is complete; it currently only lives in Settings).
- Fix the disabled-row dead end ("Log fight result →" rendered inside a `disabled` button, `CampComparison.tsx:91-118`).

### R3. Weekly "Fight Ready Report" (new feature, retention ritual)

Every Sunday: local push → in-app report card. Free: the numbers (adherence, volume, cut pace, readiness delta — all already computed in `ProgressCharts`/`readiness`/`weightCut`). Pro: the AI paragraph on top ("what to change next week") via R1. This creates a weekly moment where Pro's value is visible *in contrast* with free, and a recurring reason to reopen the app. Fight-camp users have a built-in deadline — a countdown-aware report ("3 weeks out: sharpen, don't grind") writes itself from data already on hand.

### R4. Turn every gate into a preview, every milestone into a hook

- Replace the four full-page walls (`App.tsx:238-242`) with the dimmed/blurred-preview pattern already built for CutCoach: nutrition renders with sample data under a scrim; Game Plan shows a filled-in sample plan; AI shows a real (canned) report. Add small PRO badges to gated dashboard tiles so taps are informed, and ambient counters ("2/2 free presets used").
- **Session-complete screen** (`RoundTimer.tsx:440-449`): add "Log details", "Run again", MEP/HR summary — and for free users one contextual Pro line (e.g. Gym Display, once fixed).
- **Belt promotions / PRs / fight wins**: add Share to the celebration toast and `ProgressScreen`, and trigger the *native* review prompt (`SKStoreReviewController.requestReview`) on belt-up and made-weight — replacing the onboarding review ask and its dead placeholder URL.
- **Made weight** is currently the moment the Cut Coach upsell vanishes (`WeightTracker.tsx:345`); replace with fight-week mode: rehydration guidance, fight-day checklist (Pro AI content).
- **100% adherence week** (`WeeklyPlanner.tsx:82-87`): celebrate it; it's the single strongest predictor of a user worth upselling.

### R5. Onboarding that sells (without dark patterns)

1. Cut the API-key step entirely (superseded by R1). Cut the review ask.
2. After "Camp Generated!", insert one honest offer screen: what free includes (plan, timer, logging, weight) → what Pro adds (AI corner, nutrition, game plan, camps that learn) → "Start 7-day free trial" / "Continue free". One screen, skippable, at peak intent. This is the industry-standard slot for fitness-app trial starts and the app currently shows nothing there.
3. Lower the 42-day minimum fight date to ~7 days with a "short-notice camp" template (the generator already handles 6-week camps; short-notice is a real and desperate persona).
4. Coach path: skip fighter fields, pitch Coach Pro with a roster preview, and end on "Invite your first fighter" (code + share sheet) instead of the fighter integrations step.

### R6. Make Coach Pro real (it's the higher-ARPU tier)

The $19.99 tier currently cannot deliver its two headline claims (§1.1 #5–6). In order:
1. **Sync `coach_notes`** (schema + RLS already exist, `schema.sql:259-276,482-499`) and add the notes UI to the cloud fighter view (`CoachDashboard.tsx:115-228`) — this makes "fighter notes" true and creates the coach→fighter touchpoint that retains *fighters* too (a coach note lands on the fighter's dashboard, `Dashboard.tsx:211-228`, which is already built and waiting for data).
2. **A minimal Team Overview** to make the analytics claim true: one table — fighter, days-out, adherence %, readiness, cut status, red flags (all queryable from data the coach can already SELECT). One screen replaces a coach's Sunday spreadsheet; that's $19.99/mo of value on its own.
3. **Fighter-side "Invite your coach"** (`CoachConnect` is currently coach-initiated only) — every invited coach is a potential Coach Pro sub *and* brings their other fighters; this is the app's only realistic viral loop and it's one share-sheet away.
4. Coach-variant paywall (Coach Pro card first), fix "0 fighters in system" (`CoachDashboard.tsx:87,505` counts only local state), remove the legacy same-device linking UI (`Settings.tsx:430-475`) and demo-era local fighter list (`CoachDashboard.tsx:606-663`), fix the fighter-side link state that resets every launch (`CoachConnect.tsx:23` — never re-fetched, coach identity discarded at `:49-58`).

### R7. Growth loop: shareable wins with a working link

- Share cards for **belt promotions, PRs, streak milestones, and fight results** (the current card only does day-counts; combat-sports wins are the most shareable artifact in fitness).
- Stop force-opening the share modal after every log (`WorkoutLogger.tsx:125`); make it an explicit button plus milestone auto-offers.
- Fix attribution: the watermark says `fightcamp.app` (`ShareCard.tsx:172`), a domain the app doesn't own; the stats card has none (`ProgressCharts.tsx:39-143`). Use the real domain + App Store short-link/QR once the listing ID exists (`Onboarding.tsx:19-20` TODO).
- Later: referral unlock ("give a month, get a month") once server entitlements (R1's function) exist to grant it.

### R8. Units + reachability of the market

Add a lbs/kg preference (profile + format helper); metric users currently meet hardcoded lbs at ~every weight surface while the meal library is already metric (`mealLibrary.ts` grams/ml) — the app is half-metric today. This is a small change that unlocks the majority of the global combat-sports market and removes a first-session churn trigger for non-US users.

### R9. Notification upgrades (all local, no backend)

- Streak-at-risk push (state already computed, never notified).
- Weekly report push (R3), fight-week countdown mode, missed-weigh-in follow-up.
- Trial-awareness: day-5 "here's what you've used" note (RevenueCat provides trial state on-device).
Respect a per-category settings screen — the current single "Training reminders" toggle (`Settings.tsx:866-884`) will not survive more notification types.

### R10. Pricing surface (small, later)

$7.99/$59.99 is sane. Two experiments once value ships: a one-time **"Camp Pass"** (single camp, e.g. $14.99) for commitment-averse fighters with a clear upgrade-credit path to annual; and surfacing the annual toggle *after* trial start rather than as the default decision. Neither matters until R1–R6 make the tier worth its price.

---

## Part 3 — Design-quality findings (systemic)

### Navigation & structure
- **No back button anywhere**: `Header` supports `showBack`/`onBack` (`Header.tsx:11-13`) but `App.tsx:162-167` never passes them. Ten of the twenty views (Nutrition, AI, Game Plan, Libraries, Readiness, Trackers, Achievements, Camp History, Fight Breakdown, Health) are not in the 6-slot BottomNav; their only exit is the Home tab. Fight Breakdown's hardcoded back target dumps Dashboard-arrivals onto a Settings-buried screen (`App.tsx:267`).
- **Blank-screen dead ends**: `WeightTracker.tsx:49`, `WorkoutLogger.tsx:91`, `WeeklyPlanner.tsx:48`, `OffSeasonDashboard.tsx:39` all `return null` without an active camp; `fight-log`/`fight-breakdown` render nothing when preconditions fail (`App.tsx:252,264`). Each needs an empty state with a CTA.
- **Coach IA**: two of four coach tabs render the identical component (`App.tsx:226,271`); the Progress tab is a permanent empty state for coaches (`ProgressCharts.tsx:151-164`).
- Settings is a 1,177-line junk drawer where "Integrations" contains Camp History, Achievements, and the AI key (`Settings.tsx:636-799`); features filed under Integrations are effectively hidden.

### Consistency
- Three different max-HR derivations for the same user (`RoundTimer.tsx:123`, `FitnessTrackerHub.tsx:82`, `Settings.tsx:77`); three unsynchronized Bluetooth connections (each screen instantiates `useBluetoothHR` locally) — connect in one screen, "not connected" in the next; three different definitions of weekly adherence (`OffSeasonDashboard.tsx:52-55` — where done can exceed planned, "6/4 sessions" — vs `ProgressCharts.tsx:230-242` vs `campKpis.ts:51-54`).
- Delete confirmations: present for camps/workouts/weights, absent for HRV entries (`FitnessTrackerHub.tsx:563`) and whole nutrition days (`NutritionTracker.tsx:416-422`); `FightBreakdown.tsx:71-75` uses browser `confirm()` inside the native app.
- iOS-hostile affordances: preset delete is hover-only (`RoundTimer.tsx:326`, invisible on touch); tapping any preset silently kills a running session (`RoundTimer.tsx:293`) while steppers below are correctly disabled.

### Accessibility (worst offenders)
- **No modal semantics anywhere**: zero `role="dialog"`/`aria-modal`/focus-trap/Escape in the codebase (`Modal.tsx`, `UpgradeModal.tsx`, hand-rolled confirms). The paywall itself is inaccessible.
- **Readiness score is screen-reader-invisible**: gauge SVG is `aria-hidden` and the number lives only in SVG text (`FightReadiness.tsx:44,71-79`). Its zone legend renders color+range but drops the defined labels (`:197-206`).
- Toggle groups app-wide (outcome, ratings, meal quality, session type, experience) convey state by color only — no `aria-pressed`/`role="radio"`.
- Contrast: `text-gray-600` (#4b5563) on `#1a1a1a` ≈ 2.6:1 used for real copy; `text-gray-500` ≈ 4.1:1 is the default secondary text. Both fail WCAG AA at their sizes across dozens of sites.
- Touch targets: 16px preset-delete, 28px swatches, 22-26px header edit/delete icons, 40px steppers — all under the 44pt HIG floor.
- The round-transition flash (45%-opacity full-screen, `index.css:99-106`) has no `prefers-reduced-motion` guard (zero matches in repo) and can't be disabled — photosensitivity risk on a screen users stare at.
- Nested interactive elements: `<button>` inside `<button>` (`NutritionTracker.tsx:380-423`), button inside `role="button"` (`ProgressWidget.tsx:40-65`).
- Form labels not associated (`FightResultForm.tsx:239-257,386-394` — no `htmlFor`/`id`); charts have no text alternatives (all 6 in ProgressCharts + CampComparison).

### Visual system
- Tokens are stock Tailwind orange + pure untinted grays (`tailwind.config.js`) — functional, but flat and category-generic ("combat sports → orange flames"). Low priority next to everything above; if touched: tint the neutrals toward the brand hue, and actually load Inter (`@fontsource/inter` is installed but only the screenshot scripts use it — `index.css:20` falls through to system-ui, per `docs/app-store-listing.md:151`).
- The `page` ProGate, dashboards, and tools grids lean on identical icon-card grids; the tools grid specifically hides Pro-ness (see §R4).

### Copy
- "Clapper" (`RoundTimer.tsx:635`), raw enum leaks (`no-data` in the KPI grid `FightBreakdown.tsx:159`; camelCase factor keys as labels `:214-224`), "vs Unknown (Similar)" auto-fill (`WorkoutLogger.tsx:137`), "185.0 to go" on off-season rows with no target (`WeightTracker.tsx:381`), three names for conditioning tests, contradictory coach empty-states (`CoachDashboard.tsx:551` vs `:670`), raw Supabase/Anthropic error strings shown verbatim (`AuthContext.tsx:53+`, `CutCoach.tsx:90`), "Powered by Claude Opus · Adaptive thinking" describing a parameter the code never sets (`AIInsights.tsx:230`).

---

## Part 4 — Prioritized plan

**P0 — Truth & trust (do first; days, not weeks)**
1. Rewrite both paywall feature lists to match reality; disclose or (better) remove BYO-key; fix/remove web "7-day free trial" claim.
2. Fix Gym Display on iPhone: drop the Fullscreen API for a CSS takeover state (component already renders off a boolean); add landscape + user colors + HR/MEP while in there.
3. Fix the four data-loss bugs (§1.5) and the expired-entitlement check (`RoundTimer.tsx:238`).
4. Fix the review-ask placeholder URL; move review asks to earned moments via the native API.
5. Unify entitlements: single `isPro()` everywhere; bridge RevenueCat → Supabase (webhook) so paid is paid on every surface.

**P1 — Value ships (the subscription's new spine; 2–6 weeks)**
6. Server-side AI (R1) + persist analyses + free taster + gate PostFightInsights deliberately.
7. Onboarding offer screen + kill API-key step + 7-day fight-date floor (R5).
8. Preview-style gates + PRO badges + milestone hooks (R4).
9. Fight-to-fight loop as Pro anchor: gate Apply-to-Next-Camp + Camp Comparison with preview; surface Camp History (R2).
10. Coach Pro made real: coach_notes sync + cloud notes UI + minimal Team Overview + invite-your-coach (R6).

**P2 — Retention & growth (parallel where possible)**
11. Weekly Fight Ready Report + streak-at-risk + trial-day-5 notifications (R3, R9).
12. Share cards for wins/belts/PRs with real links; de-spam the post-workout modal (R7).
13. kg/lbs preference (R8).

**P3 — Craft debt (ongoing checklist)**
14. Modal semantics + focus traps; `aria-pressed` on toggle groups; 44pt targets; contrast pass (gray-500/600 → 400/300 on dark surfaces); `prefers-reduced-motion` for the flash; back-button wiring + empty states for all null-returns; one Bluetooth context + one max-HR source; consistent delete confirms; copy sweep (§3).

---

*Compiled from a full-source audit. Every finding is code-verified at the cited `file:line`; the five headline claims (Gym Display fullscreen failure, nutrition-log wipe, NaN round deletion, ungated PostFightInsights, paywall feature drift) were independently re-verified before publication.*
