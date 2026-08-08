import Foundation
import ActivityKit

/// State shared between the app and the Timer Live Activity.
///
/// Compiled into BOTH the app target (which drives the activity) and the
/// widget extension (which renders it). The app's deployment target is
/// iOS 15.0, so the type is availability-gated and every use site in the
/// app target sits behind `if #available(iOS 16.1, *)`.
///
/// The content state carries the session's REMAINING SCHEDULE as absolute
/// wall-clock segments rather than a single ticking counter: when the app is
/// backgrounded, WKWebView is suspended within seconds and can no longer push
/// updates — but the activity keeps counting because the widget derives "what
/// phase is it now" from `Date()` against these segments, and SwiftUI's
/// `Text(timerInterval:)` renders the countdown itself. The app re-syncs the
/// schedule on every phase transition it actually observes (foreground,
/// pause/resume, skip, +30s), so the two can never drift far.
@available(iOS 16.1, *)
public struct TimerActivityAttributes: ActivityAttributes, Codable, Hashable {

    public struct ContentState: Codable, Hashable {

        /// One timed slice of the session (prep countdown, a work round, or
        /// the rest after it), with absolute epoch-millisecond bounds.
        public struct Segment: Codable, Hashable {
            /// "prep", "work" or "rest" — drives the segment's color.
            public var kind: String
            /// Round number this segment belongs to (1-based).
            public var round: Int
            /// Segment start, epoch milliseconds.
            public var startMs: Double
            /// Segment end, epoch milliseconds.
            public var endMs: Double

            public init(kind: String, round: Int, startMs: Double, endMs: Double) {
                self.kind = kind
                self.round = round
                self.startMs = startMs
                self.endMs = endMs
            }

            enum CodingKeys: String, CodingKey {
                case kind = "k"
                case round = "r"
                case startMs = "s"
                case endMs = "e"
            }
        }

        /// Remaining schedule, current segment first.
        public var segments: [Segment]
        /// Round in progress (1-based).
        public var round: Int
        public var rounds: Int
        /// Preset name shown as the activity's title ("Boxing", "Custom"…).
        public var presetLabel: String
        /// Paused sessions freeze the countdown at pausedRemainingSec.
        public var isPaused: Bool
        public var pausedRemainingSec: Int
        /// Phase colors as #RRGGBB, user-configurable in the app.
        public var workColorHex: String
        public var restColorHex: String

        public init(
            segments: [Segment], round: Int, rounds: Int, presetLabel: String,
            isPaused: Bool, pausedRemainingSec: Int,
            workColorHex: String, restColorHex: String
        ) {
            self.segments = segments
            self.round = round
            self.rounds = rounds
            self.presetLabel = presetLabel
            self.isPaused = isPaused
            self.pausedRemainingSec = pausedRemainingSec
            self.workColorHex = workColorHex
            self.restColorHex = restColorHex
        }

        enum CodingKeys: String, CodingKey {
            case segments = "s"
            case round = "r"
            case rounds = "n"
            case presetLabel = "l"
            case isPaused = "p"
            case pausedRemainingSec = "t"
            case workColorHex = "w"
            case restColorHex = "c"
        }
    }

    /// Minted by the timer when the session starts; lets the app tell a stale
    /// activity from the session it belongs to.
    public var sessionId: String

    public init(sessionId: String) {
        self.sessionId = sessionId
    }
}
