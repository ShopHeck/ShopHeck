import Capacitor
import ActivityKit
import UIKit

/// Live Activities for the round timer (iOS 16.1+).
///
/// The WKWebView timer cannot tick while the app is backgrounded — its
/// JavaScript execution is suspended within seconds. This plugin bridges the
/// timer's REMAINING SCHEDULE (absolute wall-clock segments) to an ActivityKit
/// Live Activity the moment the app leaves the foreground. The activity then
/// renders the phase and countdown from `Date()` on its own, so the round
/// clock keeps running on the Lock Screen and in the Dynamic Island with
/// zero further involvement from the app.
///
/// The app re-pushes the schedule whenever it observes a transition while
/// foregrounded (phase change, pause/resume, skip, +30s), and pushes the
/// final state when backgrounding, so the schedule the activity renders can
/// never be more than one transition stale — and transitions only happen on
/// the JS thread anyway.
///
/// On iOS < 16.1 every method resolves with supported=false and the web layer
/// falls back to the existing local-notification round alerts.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "TimerLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    /// The single timer activity. A round-timer app has exactly one live
    /// session at a time; minting one per JS call would stack duplicates.
    private var currentActivity: Any? // Activity<TimerActivityAttributes> on 16.1+

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve([
                "supported": ActivityAuthorizationInfo().areActivitiesEnabled,
            ])
        } else {
            call.resolve(["supported": false])
        }
    }

    /// JS payload → ContentState. All numbers arrive as JSON numbers; a
    /// malformed payload rejects rather than rendering garbage.
    @available(iOS 16.1, *)
    private func contentState(from call: CAPPluginCall) throws -> TimerActivityAttributes.ContentState {
        guard
            let segments = call.getArray("segments", JSObject.self),
            let round = call.getInt("round"),
            let rounds = call.getInt("rounds")
        else {
            throw NSError(domain: "LiveActivityPlugin", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "Missing segments/round/rounds",
            ])
        }
        let presetLabel = call.getString("presetLabel") ?? "Timer"
        let isPaused = call.getBool("isPaused", false)
        let pausedRemainingSec = call.getInt("pausedRemainingSec") ?? 0
        let workColor = call.getString("workColorHex") ?? "#22c55e"
        let restColor = call.getString("restColorHex") ?? "#ef4444"

        let parsed: [TimerActivityAttributes.ContentState.Segment] = try segments.map { s in
            guard
                let kind = s["kind"] as? String,
                let r = (s["round"] as? NSNumber)?.intValue,
                let start = (s["startMs"] as? NSNumber)?.doubleValue,
                let end = (s["endMs"] as? NSNumber)?.doubleValue
            else {
                throw NSError(domain: "LiveActivityPlugin", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "Malformed segment",
                ])
            }
            return .init(kind: kind, round: r, startMs: start, endMs: end)
        }

        return .init(
            segments: parsed, round: round, rounds: rounds, presetLabel: presetLabel,
            isPaused: isPaused, pausedRemainingSec: pausedRemainingSec,
            workColorHex: workColor, restColorHex: restColor
        )
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else {
            call.resolve(["started": false])
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false])
            return
        }

        let sessionId = call.getString("sessionId") ?? UUID().uuidString
        let state: TimerActivityAttributes.ContentState
        do {
            state = try contentState(from: call)
        } catch {
            call.reject(error.localizedDescription)
            return
        }

        // Recover activities that survived a process restart: `currentActivity`
        // is an in-memory handle, so after a relaunch the system may still hold
        // an activity this plugin no longer knows about. Requesting a new one
        // then would stack a second Lock Screen/Dynamic Island timer.
        //
        // Same session → adopt the existing activity and update it in place.
        // A different (stale) session → end it first, then request fresh.
        for existing in Activity<TimerActivityAttributes>.activities {
            if existing.attributes.sessionId == sessionId {
                currentActivity = existing
                Task {
                    // update(using:) is the 16.1 API; the ActivityContent-based
                    // overload needs 16.2.
                    await existing.update(using: state)
                }
                call.resolve(["started": true])
                return
            }
            Task {
                await existing.end(using: nil)
            }
        }
        currentActivity = nil

        let activity = try? Activity<TimerActivityAttributes>.request(
            attributes: TimerActivityAttributes(sessionId: sessionId),
            content: .init(state: state, staleDate: nil)
            // Deliberately NOT the pushType: overload — that one is 16.2+.
            // Local-only updates are all this timer needs.
        )
        if let activity {
            currentActivity = activity
            call.resolve(["started": true])
        } else {
            call.resolve(["started": false])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), let activity = currentActivity as? Activity<TimerActivityAttributes> else {
            call.resolve(["updated": false])
            return
        }
        do {
            let state = try contentState(from: call)
            Task {
                // update(using:) is the 16.1 API; the ActivityContent-based
                // overload needs 16.2.
                await activity.update(using: state)
            }
            call.resolve(["updated": true])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        endCurrentActivity()
        call.resolve(["ended": true])
    }

    private func endCurrentActivity() {
        guard #available(iOS 16.2, *), let activity = currentActivity as? Activity<TimerActivityAttributes> else {
            return
        }
        currentActivity = nil
        Task {
            // end(using:) is the 16.1 API; end(_:dismissalPolicy:) needs 16.2.
            await activity.end(using: nil)
        }
    }
}
