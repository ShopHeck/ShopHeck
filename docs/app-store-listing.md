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

## Screenshots & app previews

### Required sizes

Since April 2025 Apple takes **one iPhone set and one iPad set** and derives every other device from them. This app ships an iPad build (`TARGETED_DEVICE_FAMILY = "1,2"`), so both are required.

| Asset | Display size | Exact pixels | Count |
|---|---|---|---|
| Screenshot | iPhone 6.9" | **1320 × 2868** (or 1290 × 2796) | 3–10 |
| Screenshot | iPad 13" | **2064 × 2752** (or 2048 × 2732) | 3–10 |
| App preview | iPhone 6.9" | **886 × 1920** (or 1080 × 1920) | up to 3 |
| App preview | iPad 13" | **1200 × 1600** | up to 3 |

App previews must also be **15–30 s, 30 fps, H.264 in .mp4/.mov, yuv420p, with an audio track** (App Store Connect rejects video-only files — the generator muxes a silent AAC stream).

These numbers live in one place — `scripts/lib/appstore-spec.mjs` — and both the generators and the verifier read them from there.

> **Two things go wrong if the sizes are off, and both are silent.** A screenshot whose dimensions don't exactly match its slot gets letterboxed inside a white card on the product page instead of filling it. And an iPhone set with fewer than **three** images means the App Store renders no screenshot strip under the app in search results at all — the listing shows just an icon, name, and Get button while competitors show three. Run the verifier before every upload.

### Generate everything

```bash
npm i -D playwright && npx playwright install chromium   # one-time
brew install ffmpeg                                      # one-time (previews)

npm run build
npm run preview &            # serves http://localhost:4173
npm run appstore:assets      # screenshots + previews + verification
```

`appstore:assets` runs three steps you can also run alone:

| Command | What it does |
|---|---|
| `npm run screenshots` | 7 framed store images per display size → `ios/fastlane/screenshots/en-US/` |
| `npm run preview:video` | one ~28 s app preview per display size, same folder |
| `npm run verify:appstore` | checks every file against the spec; **exits non-zero** if anything would be rejected or degraded |

`?shot=1` seeds a fully-populated demo camp with Pro unlocked (`src/utils/demoSeed.ts`) and exposes `window.__setView` / `window.__timerStartPause`, so the scripts drive the real app deterministically — no Mac, simulator, or device needed. The screenshots are composed with a marketing frame (brand lockup, headline, feature chips, device mockup) drawn entirely in CSS; edit the shot list and copy at the top of `scripts/screenshots.mjs`, and the preview scenes at the top of `scripts/app-preview.mjs`.

> Rendering on a Mac is a touch more faithful — the app asks for `Inter`, never loads it, and falls back to `system-ui`, which resolves to SF Pro on macOS/iOS and to a Liberation/DejaVu face on a Linux CI runner. Both read as the same neutral grotesque at store size, so either is fine to ship. The marketing frame's own text embeds Inter, so headlines are identical everywhere.

The **Coach Dashboard** shot needs a coach account — capture that one by hand if you want it in the set.

### Upload

> **First: make sure there's an editable version.** Screenshots and app previews belong to a specific app version, and a version that's already **Ready for Sale** has its media locked. If the live version is the only one, every upload path below fails — `fastlane` with `Could not find a version to edit`, and the App Store Connect UI by simply showing the fields greyed out.
>
> Create the next version in App Store Connect → your app → the **＋** beside "iOS App" in the sidebar → enter a version number (e.g. `1.0.1`). It opens in **Prepare for Submission**, which is editable.
>
> That version needs a build attached and has to clear review before the new screenshots appear publicly — run **iOS Build → TestFlight** for the build. There is no way to swap screenshots on a live version without a review cycle; only *promotional text* can be edited in place.

**Option A — one click (recommended).** Actions → **App Store Media** → Run workflow. Leave `publish` unchecked to just get a downloadable `appstore-media` artifact to inspect or drag in by hand; tick it to also run `fastlane media`, which replaces the screenshots on the editable version.

**Option B — from your machine.**

```bash
cd ios && bundle exec fastlane media
```

**Option C — by hand.** App Store Connect → your version → **Previews and Screenshots**, pick the **iPhone 6.9"** tab, drag in `iphone69-*.png` (and `iphone69-preview.mp4`), then repeat on the **iPad 13"** tab with the `ipad13-*` files. Order matters: the first three iPhone screenshots are what search results show.

Previews need a poster frame — App Store Connect asks you to pick one after the video finishes processing, and processing can take a few minutes before the video appears on the listing.

### Manual capture (alternative)

Run the app in the iOS Simulator (iPhone 16 Pro Max = 6.9") via `npm run cap:ios`, then File → Save Screen (⌘S) on each screen. Capture 5–7, in this order:

1. **Dashboard** — "Your entire fight camp, one screen"
2. **Round Timer (HR zones visible)** — "Pro round timer + live heart-rate zones"
3. **Weekly Planner** — "A plan periodized to your fight date"
4. **Weight tracker (cut projection)** — "Make weight with safe-cut projections"
5. **AI Insights / Progress** — "AI insights on your readiness & trends"
6. **Coach Dashboard** — "Coaches: your whole team at a glance" *(Coach Pro)*
7. *(optional)* **Game Plan or Nutrition** — "Build a game plan. Dial in nutrition."

Use a fully-populated demo camp (not empty states), enable Pro so gated screens render, and keep captions short and benefit-led. Drop the results into `ios/fastlane/screenshots/en-US/` with an `iphone69-` / `ipad13-` prefix and run `npm run verify:appstore` before uploading.

## Final pre-submit checklist

- [ ] Privacy + Support URLs resolve (they're live on `fightcamp.netlify.app` once this merges)
- [ ] `heck@kingkillers.co` inbox monitored
- [ ] Reviewer demo email added to the `VITE_COMP_PRO_EMAILS` **GitHub Actions secret**, and the build attached to the version was produced *after* that (Netlify env only covers web)
- [ ] An editable version exists in App Store Connect (Prepare for Submission — not the live one)
- [ ] `npm run verify:appstore` passes
- [ ] Screenshots uploaded for **both** required sizes (6.9" iPhone, 13" iPad), at least 3 each
- [ ] App previews uploaded and finished processing, with a poster frame chosen
- [ ] Product page checked on a device: screenshots fill their cards (no white letterbox bars), and the app shows a 3-up screenshot strip in search results
- [ ] App Privacy answers match this doc
- [ ] Build selected, Export Compliance = exempt, IDFA = No, Manual release
