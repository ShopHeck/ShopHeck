import Capacitor
import UserNotifications

/// Web Audio owns foreground timer bells. Timer-owned local notifications are
/// therefore silent while the app is active, but every unrelated notification
/// continues through Capacitor's normal local-notification handler.
private final class TimerBellForegroundRouter: NSObject, NotificationHandlerProtocol {
    weak var fallback: NotificationHandlerProtocol?

    func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        if notification.request.content.userInfo["kind"] as? String == "fightcamp.timer.boundary" {
            return []
        }
        return fallback?.willPresent(notification: notification) ?? []
    }

    func didReceive(response: UNNotificationResponse) {
        fallback?.didReceive(response: response)
    }
}

/// Owns every future round boundary at the iOS layer.
///
/// JavaScript timers and Web Audio stop when WKWebView is suspended or the app
/// process is terminated. This plugin atomically replaces the current session's
/// absolute boundary schedule with UNNotification requests, which remain owned
/// by iOS. The session/revision/boundary identifiers make every replacement
/// idempotent and let pause/reset/session replacement cancel stale bells.
@objc(TimerBellSchedulerPlugin)
public class TimerBellSchedulerPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "TimerBellSchedulerPlugin"
    public let jsName = "TimerBellScheduler"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "replace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    private let foregroundRouter = TimerBellForegroundRouter()

    public override func load() {
        // Capacitor has loaded npm plugins before `capacitorDidLoad()` registers
        // this app-target plugin, so the existing handler is the standard local-
        // notification route. Retain it for every non-timer notification.
        installForegroundRouter()
    }

    private func installForegroundRouter() {
        guard let router = bridge?.notificationRouter,
              router.localNotificationHandler !== foregroundRouter else { return }
        foregroundRouter.fallback = router.localNotificationHandler
        router.localNotificationHandler = foregroundRouter
    }

    private static let marker = "fightcamp.timer.boundary"
    private static let minimumLead: TimeInterval = 0.5
    // Keep headroom inside iOS's system-wide pending-notification limit for
    // non-timer notifications. The earliest boundaries are always preferred.
    private static let maximumEvents = 48
    private static let stateKey = "fightcamp.timer.bellSchedule"
    private static let tokenKey = "fightcamp.timer.bellScheduleToken"
    private static let replacementQueue = DispatchQueue(label: "app.fightcamptraining.timer-bell-schedule")

    @objc func replace(_ call: CAPPluginCall) {
        guard
            let sessionId = call.getString("sessionId")?.trimmingCharacters(in: .whitespacesAndNewlines),
            !sessionId.isEmpty,
            let revision = call.getInt("revision"), revision >= 0,
            let events = call.getArray("events", JSObject.self)
        else {
            call.reject("Missing or invalid sessionId, revision, or events")
            return
        }

        Self.replacementQueue.async {
            guard Self.shouldApply(sessionId: sessionId, revision: revision) else {
                call.resolve(["scheduled": 0])
                return
            }
            let token = UUID().uuidString
            Self.persistApplied(sessionId: sessionId, revision: revision, token: token)

            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { settings in
                guard Self.isCurrent(sessionId: sessionId, revision: revision, token: token) else {
                    call.resolve(["scheduled": 0])
                    return
                }
                guard settings.authorizationStatus == .authorized
                        || settings.authorizationStatus == .provisional
                        || settings.authorizationStatus == .ephemeral else {
                    call.resolve(["scheduled": 0])
                    return
                }

                center.getPendingNotificationRequests { pending in
                    guard Self.isCurrent(sessionId: sessionId, revision: revision, token: token) else {
                        call.resolve(["scheduled": 0])
                        return
                    }

                    // Timer schedules are exclusive: a replacement for a new
                    // session must also remove requests left by the old session.
                    let obsolete = pending
                        .filter(Self.isTimerBoundary)
                        .map(\.identifier)
                    center.removePendingNotificationRequests(withIdentifiers: obsolete)

                    let now = Date()
                    let valid = events.prefix(Self.maximumEvents).compactMap { event -> UNNotificationRequest? in
                        guard
                            let boundaryId = event["boundaryId"] as? String,
                            !boundaryId.isEmpty,
                            let eventSessionId = event["sessionId"] as? String,
                            eventSessionId == sessionId,
                            let eventRevision = (event["revision"] as? NSNumber)?.intValue,
                            eventRevision == revision,
                            let atMs = (event["atMs"] as? NSNumber)?.doubleValue,
                            atMs.isFinite,
                            let title = event["title"] as? String,
                            let body = event["body"] as? String,
                            let sound = event["sound"] as? String,
                            sound == "round-start" || sound == "round-end"
                        else { return nil }

                        let fireDate = Date(timeIntervalSince1970: atMs / 1000)
                        let delay = fireDate.timeIntervalSince(now)
                        guard delay.isFinite, delay > Self.minimumLead else { return nil }

                        let content = UNMutableNotificationContent()
                        content.title = title
                        content.body = body
                        content.sound = UNNotificationSound(
                            named: UNNotificationSoundName(rawValue: Self.soundFile(for: sound))
                        )
                        if #available(iOS 15.0, *) {
                            content.interruptionLevel = .timeSensitive
                        }
                        content.threadIdentifier = "fightcamp.timer.\(sessionId)"
                        content.userInfo = [
                            "kind": Self.marker,
                            "sessionId": sessionId,
                            "revision": revision,
                            "boundaryId": boundaryId,
                            "terminal": event["terminal"] as? Bool ?? false,
                        ]

                        return UNNotificationRequest(
                            identifier: Self.requestIdentifier(boundaryId),
                            content: content,
                            trigger: UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
                        )
                    }

                    guard !valid.isEmpty else {
                        call.resolve(["scheduled": 0])
                        return
                    }

                    let group = DispatchGroup()
                    let lock = NSLock()
                    var firstError: Error?
                    for request in valid {
                        group.enter()
                        center.add(request) { error in
                            if let error {
                                lock.lock()
                                if firstError == nil { firstError = error }
                                lock.unlock()
                            }
                            group.leave()
                        }
                    }
                    group.notify(queue: Self.replacementQueue) {
                        // A newer replacement may have landed while the center
                        // was adding requests. Remove only this stale revision's
                        // deterministic identifiers so it cannot ring later.
                        guard Self.isCurrent(sessionId: sessionId, revision: revision, token: token) else {
                            center.removePendingNotificationRequests(
                                withIdentifiers: valid.map(\.identifier)
                            )
                            call.resolve(["scheduled": 0])
                            return
                        }
                        if let firstError {
                            center.removePendingNotificationRequests(
                                withIdentifiers: valid.map(\.identifier)
                            )
                            call.reject("Unable to schedule timer bells", nil, firstError)
                        } else {
                            call.resolve(["scheduled": valid.count])
                        }
                    }
                }
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard
            let sessionId = call.getString("sessionId")?.trimmingCharacters(in: .whitespacesAndNewlines),
            !sessionId.isEmpty
        else {
            call.reject("Missing sessionId")
            return
        }

        Self.replacementQueue.async {
            let nextRevision = Self.nextRevision(for: sessionId)
            Self.persistApplied(sessionId: sessionId, revision: nextRevision, token: UUID().uuidString)
            let center = UNUserNotificationCenter.current()
            center.getPendingNotificationRequests { pending in
                let identifiers = pending
                    .filter { Self.isTimerBoundary($0, sessionId: sessionId) }
                    .map(\.identifier)
                center.removePendingNotificationRequests(withIdentifiers: identifiers)
                center.getDeliveredNotifications { delivered in
                    let deliveredIds = delivered
                        .map(\.request)
                        .filter { Self.isTimerBoundary($0, sessionId: sessionId) }
                        .map(\.identifier)
                    center.removeDeliveredNotifications(withIdentifiers: deliveredIds)
                    call.resolve()
                }
            }
        }
    }

    private static func isTimerBoundary(_ request: UNNotificationRequest) -> Bool {
        request.content.userInfo["kind"] as? String == marker
    }

    private static func isTimerBoundary(_ request: UNNotificationRequest, sessionId: String) -> Bool {
        isTimerBoundary(request)
            && request.content.userInfo["sessionId"] as? String == sessionId
    }

    private static func soundFile(for role: String) -> String {
        role == "round-start" ? "round-start.wav" : "round-end.wav"
    }

    /// UNNotificationRequest identifiers must be compact and deterministic.
    private static func requestIdentifier(_ boundaryId: String) -> String {
        var hash: UInt64 = 1469598103934665603
        for byte in boundaryId.utf8 {
            hash ^= UInt64(byte)
            hash &*= 1099511628211
        }
        return "fightcamp.timer.\(String(hash, radix: 16))"
    }

    private static func shouldApply(sessionId: String, revision: Int) -> Bool {
        guard let state = appliedState() else { return true }
        let appliedSessionId = state["sessionId"] as? String
        let appliedRevision = (state["revision"] as? NSNumber)?.intValue ?? 0
        if appliedSessionId != sessionId { return true }
        return revision >= appliedRevision
    }

    private static func isCurrent(sessionId: String, revision: Int, token: String) -> Bool {
        guard let state = appliedState() else { return false }
        return state["sessionId"] as? String == sessionId
            && (state["revision"] as? NSNumber)?.intValue == revision
            && UserDefaults.standard.string(forKey: tokenKey) == token
    }

    private static func nextRevision(for sessionId: String) -> Int {
        guard let state = appliedState(), state["sessionId"] as? String == sessionId else {
            return 1
        }
        return ((state["revision"] as? NSNumber)?.intValue ?? 0) + 1
    }

    private static func appliedState() -> [String: Any]? {
        UserDefaults.standard.dictionary(forKey: stateKey)
    }

    private static func persistApplied(sessionId: String, revision: Int, token: String) {
        UserDefaults.standard.set(token, forKey: tokenKey)
        UserDefaults.standard.set([
            "sessionId": sessionId,
            "revision": NSNumber(value: revision),
        ], forKey: stateKey)
    }

}
