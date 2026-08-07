import Foundation
import WatchConnectivity

/// The watch's half of the phone link.
///
/// Two directions, with deliberately different delivery guarantees:
///
/// - **Heart rate → phone** uses `sendMessage` when the phone is reachable and
///   is otherwise DROPPED, not queued. A heart rate is only interesting while
///   it is current; `transferUserInfo` would faithfully deliver a backlog of
///   stale BPM values minutes later and paint a zone the fighter was in during
///   a round that already finished.
/// - **Commands → phone** use `transferUserInfo`, which is queued and
///   guaranteed. "The fighter pressed start" must not be lost because the phone
///   was in a pocket at that instant. Each command carries sessionId + seq +
///   createdAt so the phone can drop a late delivery from a finished session.
@MainActor
final class WatchConnectivityClient: NSObject, ObservableObject {
    @Published private(set) var phoneReachable = false
    /// The most recent session the phone pushed, if any.
    @Published private(set) var pushedConfig: WatchSessionConfig?

    /// Fired when the phone starts a session, so the watch can follow along.
    var onStartSession: ((WatchSessionConfig) -> Void)?
    var onEndSession: (() -> Void)?

    private var session: WCSession? {
        WCSession.isSupported() ? WCSession.default : nil
    }

    func activate() {
        guard let session else { return }
        session.delegate = self
        session.activate()
    }

    func sendHeartRate(bpm: Int, at date: Date) {
        guard let session, session.isReachable else { return }
        session.sendMessage(
            [
                WatchMessage.kindKey: WatchMessage.heartRate,
                WatchMessage.Key.bpm: bpm,
                WatchMessage.Key.timestamp: date.timeIntervalSince1970,
            ],
            replyHandler: nil,
            // Silently ignored: a dropped sample is replaced by the next one a
            // second later, and there is nothing useful to tell the fighter.
            errorHandler: { _ in }
        )
    }

    func send(command: WatchMessage.Command, sessionId: String, seq: Int) {
        guard let session else { return }
        session.transferUserInfo([
            WatchMessage.kindKey: WatchMessage.command,
            WatchMessage.Key.command: command.rawValue,
            WatchMessage.Key.sessionId: sessionId,
            WatchMessage.Key.seq: seq,
            WatchMessage.Key.createdAt: Date().timeIntervalSince1970,
        ])
    }

    private func handle(_ payload: [String: Any]) {
        guard let kind = payload[WatchMessage.kindKey] as? String else { return }
        switch kind {
        case WatchMessage.startSession:
            guard let config = WatchSessionConfig(payload: payload) else { return }
            pushedConfig = config
            onStartSession?(config)
        case WatchMessage.endSession:
            onEndSession?()
        default:
            break
        }
    }
}

extension WatchConnectivityClient: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        Task { @MainActor in self.phoneReachable = reachable }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in self.phoneReachable = reachable }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.handle(message) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        Task { @MainActor in self.handle(userInfo) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in self.handle(applicationContext) }
    }
}
