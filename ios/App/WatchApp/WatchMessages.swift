import Foundation

/// The wire format between the phone and the watch.
///
/// Deliberately a single file that BOTH targets compile (add it to the app
/// target and the watch target in Xcode). WatchConnectivity payloads are
/// `[String: Any]` dictionaries with no compile-time checking whatsoever, so a
/// key renamed on one side and not the other fails silently at runtime, on a
/// device, mid-session. Keeping the keys in one shared file is the only thing
/// that makes that class of bug a compile error instead.
enum WatchMessage {
    /// Key under which every payload carries its kind.
    static let kindKey = "kind"

    // ── Phone → watch ─────────────────────────────────────────────────────
    /// Start (or replace) the round session mirrored on the wrist.
    static let startSession = "startSession"
    /// The fighter ended the session on the phone.
    static let endSession = "endSession"

    // ── Watch → phone ─────────────────────────────────────────────────────
    /// A heart-rate sample from the wrist.
    static let heartRate = "heartRate"
    /// The fighter started/paused/reset from the wrist.
    static let command = "command"

    // ── Payload keys ──────────────────────────────────────────────────────
    enum Key {
        static let rounds = "rounds"
        static let workSec = "workSec"
        static let restSec = "restSec"
        static let prepSec = "prepSec"
        static let label = "label"
        static let bpm = "bpm"
        static let timestamp = "timestamp"
        static let command = "command"
        /// Shared session identity for config + commands. Without this a late
        /// transferUserInfo from a finished session is indistinguishable from
        /// a live one.
        static let sessionId = "sessionId"
        /// Monotonic per-session command counter on the watch → phone path.
        static let seq = "seq"
        /// Epoch seconds when the wrist issued the command (TimeInterval).
        static let createdAt = "createdAt"
    }

    /// Commands the wrist can issue back to the phone.
    enum Command: String {
        case start
        case pause
        case reset
    }

    /// Drop queued commands older than this. transferUserInfo can deliver
    /// minutes late; applying those would pause/reset the wrong session.
    static let commandTTL: TimeInterval = 30
}

/// A round session as the watch understands it.
///
/// Durations are seconds. The watch derives every phase boundary from these
/// plus its own start instant rather than being told about each transition:
/// WatchConnectivity is best-effort and can delay or drop a message, and a
/// bell that arrives late is worse than no bell at all.
struct WatchSessionConfig: Equatable {
    var rounds: Int
    var workSec: Int
    var restSec: Int
    var prepSec: Int
    var label: String
    /// Phone- or wrist-minted id for this session. Commands carry the same id
    /// so a late queue cannot operate on a different fight.
    var sessionId: String

    static let fallback = WatchSessionConfig(
        rounds: 12, workSec: 180, restSec: 60, prepSec: 10, label: "Round Timer",
        sessionId: ""
    )

    init(rounds: Int, workSec: Int, restSec: Int, prepSec: Int, label: String, sessionId: String = "") {
        // Clamped on construction. These values arrive from a JSON bridge and
        // drive a countdown; a zero or negative work interval would spin the
        // phase machine forever.
        self.rounds = max(1, min(rounds, 99))
        self.workSec = max(1, min(workSec, 60 * 60))
        self.restSec = max(0, min(restSec, 60 * 60))
        self.prepSec = max(0, min(prepSec, 60 * 60))
        self.label = label.isEmpty ? "Round Timer" : label
        self.sessionId = sessionId
    }

    init?(payload: [String: Any]) {
        guard
            let rounds = payload[WatchMessage.Key.rounds] as? Int,
            let workSec = payload[WatchMessage.Key.workSec] as? Int,
            let restSec = payload[WatchMessage.Key.restSec] as? Int
        else { return nil }
        self.init(
            rounds: rounds,
            workSec: workSec,
            restSec: restSec,
            prepSec: payload[WatchMessage.Key.prepSec] as? Int ?? 0,
            label: payload[WatchMessage.Key.label] as? String ?? "Round Timer",
            sessionId: payload[WatchMessage.Key.sessionId] as? String ?? ""
        )
    }

    var payload: [String: Any] {
        var out: [String: Any] = [
            WatchMessage.kindKey: WatchMessage.startSession,
            WatchMessage.Key.rounds: rounds,
            WatchMessage.Key.workSec: workSec,
            WatchMessage.Key.restSec: restSec,
            WatchMessage.Key.prepSec: prepSec,
            WatchMessage.Key.label: label,
        ]
        if !sessionId.isEmpty {
            out[WatchMessage.Key.sessionId] = sessionId
        }
        return out
    }
}
