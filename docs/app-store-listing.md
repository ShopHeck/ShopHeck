# App Store Listing — Fight Camp Training

Paste-ready copy + assets for the App Store Connect listing. Character limits noted.

## URLs (paste into App Store Connect → App Information / Version)

| Field | Value |
|---|---|
| **Privacy Policy URL** (required) | `https://fightcamp.netlify.app/privacy.html` |
| **Support URL** (required) | `https://fightcamp.netlify.app/support.html` |
| **Marketing URL** (optional) | `https://fightcamp.netlify.app` |

> The support page lists `heck@kingkillers.co` — make sure that inbox is monitored before you go live (Apple and users may use it).

## Name & subtitle

- **App Name** (≤30): `Fight Camp Training`
- **Subtitle** (≤30): `Camp planner, timer & tracker`

## Promotional text (≤170, editable anytime without review)

```
Now with a pro round timer, live heart-rate zones, AI camp insights, and Apple Health sync. Plan your camp, make weight, and step in ready.
```

## Keywords (≤100, comma-separated — no spaces after commas; don't repeat words already in the name/subtitle)

```
boxing,mma,muay thai,bjj,kickboxing,wrestling,sparring,weight cut,hiit,coach,interval,hrv
```

## Description (≤4000)

```
Fight Camp Training is the all-in-one app for combat-sports athletes and coaches — built to plan a camp, run your sessions, make weight, and walk in ready.

Tell it your fight date, weight class, and experience, and it builds a periodized week-by-week plan that ramps your training and tapers into fight night. Log your work, track your cut, and see exactly where you stand.

TRAIN
• Pro round timer with custom rounds, work/rest, warning bells, and prep countdown
• Live heart-rate zones from any Bluetooth chest strap (Polar, Garmin, and more)
• Log workouts, sparring, and conditioning tests with RPE
• Gym Display mode for the big screen

MAKE WEIGHT
• Weight tracker with safe-cut pace projections toward your target
• Nutrition and water logging during camp

PLAN & IMPROVE
• Auto-generated weekly training plan around your fight date
• Game Plan builder for your opponent
• Progress charts and benchmarks
• AI Insights that read your camp data and flag what to adjust (bring your own Anthropic API key)

COACHES
• Coach dashboard to follow every linked fighter
• Per-fighter notes and team overview

SYNC
• Optional account with cloud backup and cross-device sync
• Sign in with Apple
• Save logged workouts and weigh-ins to Apple Health

FREE TO START
Fight Camp Training is free to use. Fighter Pro and Coach Pro subscriptions unlock advanced features (gym display, AI insights, game plans, nutrition, unlimited camps, and the coach tools) with a 7-day free trial. Subscriptions renew automatically through your Apple ID; manage or cancel anytime in Settings.

Fight Camp Training is a training and planning tool for informational purposes only and is not a substitute for professional medical or fitness advice. Train smart and consult a professional before starting any new program.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://fightcamp.netlify.app/privacy.html
```

> **Required (Guideline 3.1.2(c)).** The two links above must stay in the Description because the app sells auto-renewable subscriptions. If you use Apple's standard EULA, the `apple.com/.../stdeula/` link satisfies the Terms of Use requirement; if you use a custom EULA, paste it into the **App Store Connect → App Information → License Agreement** field instead. Also confirm the **Privacy Policy URL** field in App Store Connect is set to `https://fightcamp.netlify.app/privacy.html`.

## Category & rating

- **Primary category:** Health & Fitness
- **Secondary category:** Sports
- **Age rating:** 4+ (no objectionable content)

## App Privacy ("nutrition label") — declare these data types

Only data tied to a signed-in account leaves the device; local-only use collects nothing.

| Data type | Collected? | Linked to user? | Purpose |
|---|---|---|---|
| Contact Info → Email Address | Yes (account sign-up) | Linked | App Functionality |
| Identifiers → User ID | Yes (Supabase/RevenueCat) | Linked | App Functionality, Purchases |
| Health & Fitness → Fitness | Yes (only if synced via account) | Linked | App Functionality |
| Name | Yes (fighter profile, if synced) | Linked | App Functionality |
| Purchases → Purchase History | Yes | Linked | App Functionality |
| Diagnostics → Crash + Performance Data (Sentry) | Yes | Not Linked | App Functionality |

> IDFA / tracking: **No** (no ad-tracking SDK). Note: the *web* build can show AdSense to free users, but the iOS build does not — keep the iOS App Privacy label free of advertising data.

## App Review notes (paste into "App Review Information → Notes")

```
Demo account (full Pro, no purchase needed): we comp this reviewer account to Coach Pro via an internal allowlist, so you can access every paid feature without making a purchase.
  Email: <add a reviewer email you've added to VITE_COMP_PRO_EMAILS>
  Password: <password>

Notes:
- The Bluetooth heart-rate monitor is optional hardware; the app is fully functional without it.
- "Sync to Apple Health" (Settings) is opt-in and only writes workouts/weigh-ins you log.
- Subscriptions are auto-renewable with a 7-day free trial; Restore Purchases is on the upgrade screen.
```

> To enable the reviewer account: the allowlist is baked into the JS bundle **at build time**, so the email must be present in the environment of whichever build the reviewer uses. For the **iOS binary** that means the `VITE_COMP_PRO_EMAILS` **GitHub Actions secret** (used by `.github/workflows/ios.yml`) — set it, then ship a new TestFlight build and attach *that* build to the version. Netlify's `VITE_COMP_PRO_EMAILS` env var only covers the web app. Once baked in, the account gets Coach Pro on sign-in (the comp grant outranks RevenueCat).

## Screenshots — shot list

### Automated capture (recommended)

A Playwright script renders the real app at every App Store size and saves correctly-sized PNGs — no Mac or device needed:

```bash
npm i -D playwright && npx playwright install chromium   # one-time
npm run build
npm run preview &                                        # serves http://localhost:4173
npm run screenshots                                      # -> ios/fastlane/screenshots/en-US/
```

`?shot=1` seeds a demo camp + Pro (`src/utils/demoSeed.ts`); the script navigates each screen via `window.__setView` and captures 6.9", 6.7", and iPad 13". Re-run any release; upload in App Store Connect (or `fastlane deliver`). Edit the screen list/captions in `scripts/screenshots.mjs`. The **Coach Dashboard** shot needs a coach account — capture that one manually if you want it.

### Manual capture (alternative)

Apple now accepts a single iPhone size that scales: capture at **6.9" (1320×2868)** or **6.7" (1290×2796)**. Add **iPad 13" (2064×2752)** only if you ship iPad. Easiest capture path: run the app in the iOS Simulator (iPhone 16 Pro Max = 6.9", or 15 Pro Max = 6.7") via `npm run cap:ios`, then File → Save Screen (⌘S) on each screen.

Capture 5–7, in this order, with a short caption banner on each:

1. **Dashboard** — "Your entire fight camp, one screen"
2. **Round Timer (HR zones visible)** — "Pro round timer + live heart-rate zones"
3. **Weekly Planner** — "A plan periodized to your fight date"
4. **Weight tracker (cut projection)** — "Make weight with safe-cut projections"
5. **AI Insights / Progress** — "AI insights on your readiness & trends"
6. **Coach Dashboard** — "Coaches: your whole team at a glance" *(Coach Pro)*
7. *(optional)* **Game Plan or Nutrition** — "Build a game plan. Dial in nutrition."

Tips: use a fully-populated demo camp (not empty states), enable Pro (comp account) so gated screens render, and keep captions short and benefit-led.

## Final pre-submit checklist

- [ ] Privacy + Support URLs resolve (they're live on `fightcamp.netlify.app` once this merges)
- [ ] `heck@kingkillers.co` inbox monitored
- [ ] Reviewer demo email added to the `VITE_COMP_PRO_EMAILS` **GitHub Actions secret**, and the build attached to the version was produced *after* that (Netlify env only covers web)
- [ ] Screenshots uploaded for the required size(s)
- [ ] App Privacy answers match this doc
- [ ] Build selected, Export Compliance = exempt, IDFA = No, Manual release
