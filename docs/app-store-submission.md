# Fight Camp Training — App Store Submission Checklist

End-to-end steps to take the iOS build (Capacitor wrapper of the Vite/React PWA) from this repo to a live App Store release. Bundle ID: `app.fightcamptraining`.

Prereqs: macOS with Xcode 15+, an Apple Developer Program membership ($99/yr), `bundle install` in `ios/` for Fastlane, and a configured `ios/App/App/Secrets.xcconfig` (see §0 below).

## 0. One-time secrets setup

The Release build reads `REVENUECAT_API_KEY` from a gitignored xcconfig. Without it, the app crashes immediately on launch (intentional — `AppDelegate.swift` calls `preconditionFailure` so a broken key never ships silently).

```bash
cp ios/App/App/Secrets.xcconfig.example ios/App/App/Secrets.xcconfig
# Edit ios/App/App/Secrets.xcconfig and replace the placeholder with your
# real RevenueCat "Public app-specific Apple API key" (starts with `appl_`).
```

For CI / Fastlane: instead of editing the file, export `REVENUECAT_API_KEY` and either write the xcconfig on the fly or pass it as an `xcargs` build setting in the Fastlane lane.

---

## 1. App Store Connect setup (one-time)

1. Sign in at https://appstoreconnect.apple.com.
2. **Users and Access → Integrations → App Store Connect API**: create an API key with Admin role. Save the `.p8`, Issuer ID, and Key ID for Fastlane.
3. **Certificates, Identifiers & Profiles** → register App ID `app.fightcamptraining` with capabilities: In-App Purchase, Push Notifications (if used), Associated Domains (if deep linking).
4. **My Apps → +** → New App:
   - Platform: iOS
   - Name: `Fight Camp Training`
   - Primary language: English (U.S.)
   - Bundle ID: `app.fightcamptraining`
   - SKU: `fightcamptraining-ios`
5. **In-App Purchases / Subscriptions**: create the products that match RevenueCat's offering IDs. Status must be "Ready to Submit" before the build can be reviewed.
6. **Agreements, Tax, and Banking**: Paid Apps agreement signed and active — required for IAP review.

## 2. Code signing (Fastlane Match)

From `ios/`:

```bash
bundle exec fastlane certificates
```

This runs the `match` lane and provisions the App Store distribution cert + profile for `app.fightcamptraining`. Confirm Xcode → Signing & Capabilities shows the Match-managed profile, not "Automatically manage signing".

## 3. Pre-flight checks in the repo

1. Bump marketing version in `ios/App/App.xcodeproj` (`MARKETING_VERSION`) to the public version, e.g. `1.0.0`. Build number is auto-incremented by the Fastlane lane.
2. Confirm `Info.plist` has every usage-description string the app needs. The Bluetooth plugin requires `NSBluetoothAlwaysUsageDescription`. Add `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSMotionUsageDescription`, `NSPhotoLibraryUsageDescription` only if those features are used — Apple rejects unused entries.
3. Verify `capacitor.config.ts` has no `server.url` pointing at a dev host.
4. Build the web bundle and sync native:
   ```bash
   npm run cap:sync
   ```
5. Open Xcode and run on a real device once to sanity-check launch, splash, status bar, and a RevenueCat purchase in sandbox:
   ```bash
   npm run cap:ios
   ```

## 4. App Store listing assets

Prepare in App Store Connect under the new version:

- **Screenshots** (PNG/JPEG, RGB):
  - 6.7" iPhone (1290×2796) — required
  - 6.5" iPhone (1284×2778 or 1242×2688) — required
  - iPad 12.9" (2048×2732) — only if iPad is supported
- **App icon**: 1024×1024 PNG, no alpha, no rounded corners (already in `Assets.xcassets/AppIcon.appiconset`).
- **Promotional text** (170 chars, editable post-release).
- **Description** (up to 4000 chars) — emphasize training features, not medical claims.
- **Keywords** (100 chars total, comma-separated).
- **Support URL** and **Marketing URL** (must resolve).
- **Privacy Policy URL** — required because the app uses analytics (Sentry) and IAP.
- **Category**: Primary `Health & Fitness`, Secondary `Sports`.
- **Age rating**: complete the questionnaire (likely 4+ unless content suggests otherwise).

## 5. App Privacy ("Nutrition Label")

Under App Privacy → Get Started, declare data types collected. For this app, expect at minimum:

- **Identifiers** → User ID (RevenueCat app user ID): linked to user, used for App Functionality and Purchases.
- **Purchases** → Purchase History: linked, App Functionality.
- **Diagnostics** → Crash Data, Performance Data (Sentry): not linked, App Functionality. Confirm Sentry PII scrubbing is on.
- **Usage Data** → Product Interaction (if analytics events are sent): not linked, Analytics.

## 6. Build and upload via Fastlane

For TestFlight first:

```bash
cd ios
export REVENUECAT_API_KEY=<prod_key>
bundle exec fastlane beta
```

This bumps the build number, archives, exports an `app-store` IPA, and uploads to TestFlight. Processing in App Store Connect takes 5–30 min.

## 7. TestFlight validation

1. Add internal testers (your team) — no review needed, available immediately.
2. Run the build on at least two physical devices: one iPhone with notch, one without if possible.
3. Smoke test: cold launch, sign-in, BLE pairing flow, a sandbox subscription purchase, restore purchases, sign-out.
4. Optional: external testers — requires Beta App Review (~24h).

## 8. Submit for review

When TestFlight build is solid, attach it to the App Store version:

1. App Store Connect → app → iOS App `1.0 Prepare for Submission`.
2. **Build**: select the uploaded build.
3. **App Review Information**:
   - Sign-in: provide a demo account (email + password) that bypasses any paywall, or a RevenueCat promotional offer code so reviewers can access subscription content.
   - Contact: name, phone, email of someone who can answer within 24h.
   - Notes: explain the BLE punch-tracker hardware dependency and how to test without it (mock mode, screenshots, or video link).
4. **Export Compliance**: if HTTPS is the only crypto used, answer "uses standard encryption" and "exempt".
5. **Content Rights**: confirm rights to all media.
6. **Advertising Identifier (IDFA)**: select "No" unless an ad SDK is integrated.
7. **Version Release**: choose `Manually release` for first launch so you can coordinate marketing.
8. Click **Add for Review** → **Submit for Review**.

Or, equivalently, run:

```bash
bundle exec fastlane release
```

…after the metadata above is filled in (the lane sets `submit_for_review: true, automatic_release: false`).

## 9. Post-submission

- Review SLA: typically 24–48h. Watch email + App Store Connect for "In Review" → "Pending Developer Release" or "Rejected".
- On rejection, respond in Resolution Center with specifics; if you disagree, file an appeal. Otherwise patch, bump build number, re-upload, and resubmit (metadata-only changes don't need a new binary).
- On approval, click **Release This Version**. Live on the store within ~1 hour.
- Tag the release in git: `git tag v1.0.0 && git push origin v1.0.0`.

## 10. Common rejection causes to pre-empt

- Missing privacy policy URL or mismatched App Privacy declarations.
- Subscription paywall without restore-purchases button or without linking to Terms (EULA) and Privacy Policy.
- Demo account not working / paywall blocks reviewer.
- Crash on launch on the reviewer's device — always test the archived IPA via TestFlight, not just a debug build.
- Usage-description strings missing for any permission the binary requests.
- IAP products not in "Ready to Submit" state attached to the same version.
