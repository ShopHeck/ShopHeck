# Apple Watch companion

A standalone watchOS round timer with haptic bells and on-wrist heart rate.

**Why it exists:** every heart-rate feature in the app — zones, MyZone points,
the timer's HR ring, the recovery score — required a Bluetooth chest strap. Most
fighters do not own one. A lot of them own a watch. This is the same data
through a different pipe, so the whole HR half of the app lights up for them.

> **Build status.** The Swift in `ios/App/WatchApp/` and
> `ios/App/App/WatchBridgePlugin.swift` has **not been compiled**. It was written
> against the WatchConnectivity / HealthKit / SwiftUI APIs but there is no Swift
> toolchain in the environment it was authored in, and the Xcode target it needs
> does not exist yet (see *Adding the target* below). Treat it as reviewed source
> awaiting its first build, not as shipped code. The TypeScript side **is**
> verified — it typechecks, lints, and falls back cleanly everywhere the bridge
> is absent.

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

`WatchMessages.swift` must be a member of **both** targets. WatchConnectivity
payloads are untyped `[String: Any]` dictionaries, so a key renamed on one side
and not the other fails silently at runtime, on a device, mid-session. One
shared file is the only thing that turns that into a compile error.

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

## Adding the target

This has **not** been done — `ios/App/App.xcodeproj/project.pbxproj` is
unchanged. It is deliberately left as an Xcode step rather than hand-written:
a watchOS app is a full second app bundle with its own Info.plist,
`WKCompanionAppBundleIdentifier`, and an *Embed Watch Content* build phase, and
a malformed pbxproj breaks the iOS build — and therefore the TestFlight
pipeline — for everyone.

1. **File → New → Target → watchOS → App.**
   - Product name: `FightCampWatch`
   - Bundle id: `app.fightcamptraining.watchkitapp`
     (it **must** be the host id plus a suffix, or the pairing is rejected)
   - Interface: SwiftUI · Language: Swift
   - Uncheck "Include Notification Scene"
2. **Delete the generated `ContentView.swift` and `…App.swift`**, then add the
   files from `ios/App/WatchApp/` to the new target.
3. **Add `WatchMessages.swift` to the App target too** (File Inspector → Target
   Membership → tick both).
4. **Watch target capabilities:** add HealthKit, and tick *Background Modes →
   Workout processing*.
5. **Watch `Info.plist`:** add `NSHealthShareUsageDescription` —
   *"Fight Camp reads your heart rate during a round session to show live
   training zones."*
6. **App target `Info.plist`:** no change. WatchConnectivity needs no
   entitlement or usage string.
7. **Signing:** the watch app needs its own App ID and provisioning profile.
   `ios/fastlane/Fastfile` already special-cases the `TimerLiveActivity`
   extension for signing and version syncing — the watch app and its extension
   need the same treatment (`sync_extension_versions` anchors versions to the
   host app; `verify_embedded_bundles` will flag the new bundle until it is
   listed).

### Verifying

- Run the watch scheme on a paired device (the Simulator has no heart-rate
  sensor, so HR will stay `—` there; the timer and bells work).
- Start a session on the phone → the wrist should adopt the same rounds/work/rest
  within a few seconds of the watch app next being foregrounded.
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
