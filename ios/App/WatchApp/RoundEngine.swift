import Foundation

/// The round clock, as a pure function of elapsed time.
///
/// This mirrors the web timer's design deliberately: the phase and the number on
/// screen are DERIVED from an absolute start instant, never accumulated by a
/// ticking variable. watchOS suspends and throttles far more aggressively than
/// iOS — a wrist-down gesture stops the run loop within seconds — so a timer
/// that counted its own ticks would silently lose whole rounds every time the
/// fighter dropped their arm. Deriving from `Date()` means the clock is correct
/// the instant the screen comes back, with no catch-up logic to get wrong.
enum RoundPhase: Equatable {
    case idle
    case prep(round: Int)
    case work(round: Int)
    case rest(round: Int)
    case done

    var isWork: Bool { if case .work = self { return true }; return false }

    var label: String {
        switch self {
        case .idle: return "Ready"
        case .prep: return "GET READY"
        case .work: return "WORK"
        case .rest: return "REST"
        case .done: return "DONE"
        }
    }

    var round: Int? {
        switch self {
        case .prep(let r), .work(let r), .rest(let r): return r
        case .idle, .done: return nil
        }
    }
}

struct RoundSnapshot: Equatable {
    var phase: RoundPhase
    /// Seconds left in the current phase, never negative.
    var remaining: Int
    /// 0…1 through the current phase, for the progress ring.
    var progress: Double
    var totalRounds: Int
}

struct RoundEngine {
    let config: WatchSessionConfig

    /// One round's full cycle. The final round has no rest after it, which is
    /// why `totalDuration` is not simply `rounds * cycle`.
    private var cycle: Int { config.workSec + config.restSec }

    var totalDuration: Int {
        config.prepSec + config.rounds * config.workSec + max(0, config.rounds - 1) * config.restSec
    }

    /// The state of the session `elapsed` seconds after it started.
    ///
    /// Total-ordering by elapsed seconds rather than a state machine stepping
    /// through transitions: a state machine has to be *driven*, and anything
    /// that drives it can be suspended. This can be asked for the truth at any
    /// moment, including after a two-minute gap, and answer correctly.
    func snapshot(elapsed: TimeInterval) -> RoundSnapshot {
        let t = max(0, Int(elapsed.rounded(.down)))

        if t < config.prepSec {
            return RoundSnapshot(
                phase: .prep(round: 1),
                remaining: config.prepSec - t,
                progress: fraction(t, of: config.prepSec),
                totalRounds: config.rounds
            )
        }

        var offset = t - config.prepSec

        // Walk whole rounds off the clock. Bounded by `rounds`, so a huge
        // elapsed value (app resumed hours later) terminates immediately at
        // `.done` rather than looping.
        for round in 1...config.rounds {
            if offset < config.workSec {
                return RoundSnapshot(
                    phase: .work(round: round),
                    remaining: config.workSec - offset,
                    progress: fraction(offset, of: config.workSec),
                    totalRounds: config.rounds
                )
            }
            offset -= config.workSec

            // No rest after the final round — the session is over at the bell.
            if round == config.rounds { break }

            if offset < config.restSec {
                return RoundSnapshot(
                    phase: .rest(round: round),
                    remaining: config.restSec - offset,
                    progress: fraction(offset, of: config.restSec),
                    totalRounds: config.rounds
                )
            }
            offset -= config.restSec
        }

        return RoundSnapshot(phase: .done, remaining: 0, progress: 1, totalRounds: config.rounds)
    }

    /// Absolute offsets, in seconds from session start, at which a bell fires.
    ///
    /// Precomputed rather than detected by polling. The watch schedules its
    /// haptics from this list, so a suspended run loop cannot swallow a bell —
    /// and a bell the fighter misses is the one failure mode that makes a round
    /// timer useless.
    var bellOffsets: [Int] {
        var out: [Int] = []
        var t = config.prepSec
        for round in 1...config.rounds {
            out.append(t)                    // round starts
            t += config.workSec
            out.append(t)                    // round ends
            if round == config.rounds { break }
            t += config.restSec
        }
        return out
    }

    private func fraction(_ done: Int, of total: Int) -> Double {
        guard total > 0 else { return 1 }
        return min(1, max(0, Double(done) / Double(total)))
    }
}

/// mm:ss for a countdown. Shared so the watch and the phone format identically.
func formatClock(_ seconds: Int) -> String {
    let s = max(0, seconds)
    return String(format: "%d:%02d", s / 60, s % 60)
}
