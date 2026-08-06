# Apple Watch companion

A standalone watchOS round timer with haptic bells and on-wrist heart rate.

**Why it exists:** every heart-rate feature in the app — zones, MyZone points,
the timer's HR ring, the recovery score — required a Bluetooth chest strap. Most
fighters do not own one. A lot of them own a watch. This is the same data
through a different pipe, so the whole HR half of the app lights up for them.

> **Build status.** This target now **compiles and archives**. Getting there
> took three rounds, each one uncovering the next because the previous failure
> had been masking it:
>
> 1. **Signing.** The watch App ID had no HealthKit capability, so its profile
>    was cut without the entitlement and the archive refused to sign. Fixed in
>    the Fastfile — see [`ios-signing.md`](./ios-signing.md).
> 2. **Compiling.** With signing clean, the Swift here was type checked for the
>    first time ever. Exactly one error: `WKExtendedRuntimeSession.shared`, which
>    is not a member of that type. Deleted — the `HKWorkoutSession` started on
>    the next line already provides the runtime it reached for, and the call was
>    `invalidate()`, which would have *ended* a session rather than kept the
>    screen alive. Everything else type checked first time.
> 3. **Uploading.** `build_app` then went green (212s) and Apple rejected the
>    upload: a bundle carrying the HealthKit entitlement must ship
>    `NSHealthUpdateUsageDescription` even when it only reads. Added.
>
> What is still unproven is *running*. Nothing here has executed on a wrist —
> the compiler has checked the types and Apple has accepted the bundle, neither
> of which says the timer keeps time or the bells ring. See *Verifying* below.
>
> The Developer Portal side — the watch App ID and the HealthKit capability on
> it — is provisioned by the pipeline rather than by hand; see *Signing setup*
> below for what it does and why the first archive failed without it.

---

## What's here

| File | Target | Role |
|---|---|---|
| `WatchApp/FightCampWatchApp.swift` | watch | App entry |
| `WatchApp/RoundTimerView.swift` | watch | The wrist face |
| `WatchApp/TimerModel.swift` | watch | Session state, bells, phone sync |
| `WatchApp/RoundEngine.swift` | watch | Pure phase maths |
| `WatchApp/WorkoutHeartRate.swift` | watch | `HKWorkoutSession` HR stream |
| `WatchApp/WatchConnectivityClient.swift` | watch | Watch half of the link |
| `WatchApp/WatchMessages.swift` | **both** | The wire contract |
| `App/WatchBridgePlugin.swift` | app | Phone half of the link |
| `src/plugins/WatchBridge.ts` | web | Capacitor plugin interface |
| `src/hooks/useWatchHeartRate.ts` | web | Watch samples → HR state |

`WatchMessages.swift` is a member of **both** targets. WatchConnectivity
payloads are untyped `[String: Any]` dictionaries, so a key renamed on one side
and not the other fails silently at runtime, on a device, mid-session. One
shared file is the only thing that turns that into a compile error.

Shared membership is necessary but was not sufficient: `WatchBridgePlugin.swift`
used to spell the keys out as string literals (`"kind"`, `"bpm"`), so the phone
side never referenced the shared constants and renaming one would still have
compiled. It now builds its payload through `WatchSessionConfig` and reads
through `WatchMessage.Key`, which is what makes the shared file do its job — and
gets the config clamping for free. The JS event names (`heartRate`,
`watchCommand`) stay literals on purpose: those are the plugin's contract with
`src/plugins/WatchBridge.ts`, not part of the phone↔watch wire format.

---

## Design decisions worth keeping

**The watch derives its own clock.** The phone sends the session *configuration*
once (`rounds`, `workSec`, `restSec`, `prepSec`) and never streams transitions.
WatchConnectivity is best-effort — a per-transition push would drop bells
whenever the link was busy, and a bell that never rings makes a round timer
useless. `RoundEngine.snapshot(elapsed:)` is a total function of elapsed
seconds, so the watch can be asked for the truth at any moment, including after
a two-minute suspension, and answer correctly.

**Bells are fired by "which are behind us", not "did a transition happen".**
watchOS suspends the run loop on a wrist-down within seconds. A transition-based
bell would simply be missed. `fireBellsPassed(upTo:)` rings anything whose offset
has passed and that has not rung — with a 3-second recency guard, so a session
resumed from a long suspension does not machine-gun every bell it missed.

**Heart rate needs a workout session.** Outside a running `HKWorkoutSession` the
watch samples heart rate opportunistically, minutes apart. The session is what
makes it continuous, and it earns the background runtime the timer needs too.

**HR is dropped, not queued.** `sendMessage` when reachable, nothing otherwise.
`transferUserInfo` would faithfully deliver a backlog of stale BPM minutes later
and paint a zone from a round that already finished. Commands (start/pause/reset)
*do* use `transferUserInfo`, because losing "the fighter pressed start" is not
acceptable.

**The strap wins when both are live.** A chest strap reads the electrical signal
directly; a wrist optical sensor is well known to lag and drop out under the
impact and grip tension of striking. A fighter who bothered to put a strap on
gets the strap's numbers. See `HeartRateContext`.

**Watch HRV is reported as `null`.** RMSSD needs beat-to-beat RR intervals; the
bridge carries averaged BPM only. Showing the strap's stale HRV beside a watch
heart rate would attribute one sensor's data to another.

---

## The target

`FightCampWatch` is in `ios/App/App.xcodeproj`, added by
[`scripts/add-watch-target.py`](../scripts/add-watch-target.py) rather than by
hand. `project.pbxproj` is an OpenStep plist with 24-hex object ids and
cross-references in six directions, and a malformed one breaks the iOS build —
and the TestFlight pipeline — for everyone. The script runs the change through a
real parser and serializer, so the result is structurally valid by construction
instead of by proofreading. It is idempotent, and it is committed so the target
can be rebuilt identically rather than from memory.

| Setting | Value | Why |
|---|---|---|
| `PRODUCT_BUNDLE_IDENTIFIER` | `app.fightcamptraining.watchkitapp` | Must be the host id plus a suffix. A mismatch is not a build error — it is a watch app that silently never installs. |
| `SDKROOT` | `watchos` | |
| `TARGETED_DEVICE_FAMILY` | `4` | Apple Watch. The phone targets are `1,2`. |
| `WATCHOS_DEPLOYMENT_TARGET` | `9.0` | Floor for the SwiftUI and `HKWorkoutSession` APIs used here. |
| `SKIP_INSTALL` | `YES` | The watch app ships inside the host archive, not as a product of its own. |
| `INFOPLIST_FILE` | `WatchApp/Info.plist` | Checked in rather than generated: `WKBackgroundModes` is an array with no `INFOPLIST_KEY_` equivalent, and the companion bundle id has to be exact. |
| `CODE_SIGN_ENTITLEMENTS` | `WatchApp/FightCampWatch.entitlements` | HealthKit only. WatchConnectivity needs no entitlement. |

Also wired:

- **`Embed Watch Content`** on the App target — a copy-files phase into
  `$(CONTENTS_FOLDER_PATH)/Watch`, plus a target dependency. Both are required:
  the dependency orders the build, the copy phase is what actually puts the
  `.app` inside the host bundle. A watch app that builds but is not embedded
  ships an iOS app with no watch app in it, and the failure is invisible until a
  device tries to install it.
- **`WatchMessages.swift` in both targets' Sources phases** (see above).
- **`Assets.xcassets`** with an `AppIcon` — a watchOS app without one fails App
  Store validation, so the catalog is a build input rather than a nicety.
- **A shared `FightCampWatch` scheme**, so `xcodebuild -scheme FightCampWatch`
  and the Xcode run destination work without Xcode autocreating an unshared one.
- **`SIGNED_BUNDLES` in `ios/fastlane/Fastfile`** — the watch app is a separately
  signed bundle with its own App ID and profile, none of it inherited from the
  host. Missing this is what failed the archive when the Live Activity extension
  was added, with an error that reads like an app-level signing fault.
  `sync_extension_versions` needed no change: it already pins every non-App
  target to the app's versions, which a watch bundle needs too — Apple rejects an
  upload whose embedded bundle version differs from its host's.

## Signing setup

Handled by the pipeline, not by hand — but worth knowing about, because the
first attempt failed on exactly this and the error named none of it:

```
Provisioning profile "match AppStore app.fightcamptraining.watchkitapp"
doesn't include the com.apple.developer.healthkit and
com.apple.developer.healthkit.access entitlements.
```

`FightCampWatch.entitlements` asks for HealthKit, but an entitlement is only
half of the arrangement. The other half is the **HealthKit capability on the
App ID**, and Apple writes an App ID's capabilities into a provisioning profile
at the moment the profile is cut — so a profile issued before the capability
existed never gains it. Registering the identifier is not enough; the watch
App ID was created and its first profile cut in the same run, both before
anything had enabled HealthKit on it.

`sync_app_capabilities` in `ios/fastlane/Fastfile` now reads each signed
target's entitlements straight out of the Xcode project and enables whatever
capabilities they imply, and `sync_match_profiles` re-issues any stored profile
that turns out not to carry them. Both run on every archive, so adding an
entitlement to a target is a single edit — see *Entitlements and capabilities*
in [`docs/ios-signing.md`](./ios-signing.md).

### Verifying

- Run the `FightCampWatch` scheme on a paired device (the Simulator has no
  heart-rate sensor, so HR stays `—` there; the timer and bells work).
- Start a session on the phone → the wrist should adopt the same
  rounds/work/rest within a few seconds of the watch app next being foregrounded.
- Start a session on the wrist with the phone in a pocket → the phone's
  Settings → *Bluetooth & Devices* should show **Apple Watch · Streaming**.
- Connect a chest strap while the watch is streaming → the phone should switch to
  the strap and the watch row should read *"Standing by"*.

---

## Known gaps

- **The watch does not display the game plan.** Corner Mode is phone-only. A
  wrist brief between rounds is the obvious follow-up.
- **No complication.** A "start today's session" complication would remove the
  last reason to take the phone out at all.
- **The watch cannot start a camp session that logs to a specific planned
  slot.** A wrist-started session sends a `start` command, but the phone still
  owns which planned session it counts as.
- **Background runtime rides on the workout session.** `HKWorkoutSession` is
  what keeps the timer counting with the wrist down, so a fighter who declines
  the Health prompt — or is on a watch with no Health data available — gets a
  timer that can be suspended mid-round, not just a missing BPM. There is no
  fallback: `WKExtendedRuntimeSession` needs a background mode this bundle does
  not declare and does not combine with a workout session. Fixing it properly
  means deciding whether an HR-less session should declare a different mode.
