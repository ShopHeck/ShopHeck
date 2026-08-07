import Foundation
import SwiftUI
import WatchKit

/// Drives the wrist timer: owns the session start instant, fires the bells, and
/// keeps the phone in step.
///
/// The published snapshot is recomputed from `Date()` on every tick rather than
/// advanced, so a suspended run loop costs nothing but a stale-looking screen
/// for as long as it is actually suspended.
@MainActor
final class TimerModel: ObservableObject {
    @Published private(set) var snapshot: RoundSnapshot
    @Published private(set) var isRunning = false
    @Published var config: WatchSessionConfig {
        didSet { if !isRunning { snapshot = engine.snapshot(elapsed: 0) } }
    }

    let heartRate = WorkoutHeartRate()
    let connectivity = WatchConnectivityClient()

    /// When set (App Store screenshot mode only), the live sensor is ignored so
    /// marketing captures show a believable BPM without HealthKit authorization.
    private var shotBpm: Int?

    /// Wall-clock instant the session started, adjusted for time spent paused.
    private var startedAt: Date?
    private var pausedElapsed: TimeInterval = 0
    private var ticker: Timer?
    /// Bell offsets already fired, so a re-render cannot double-ring.
    private var firedBells: Set<Int> = []
    /// Shared with the phone so late transferUserInfo cannot hit another fight.
    private var sessionId: String
    /// Monotonic command counter for this sessionId.
    private var commandSeq = 0

    private var engine: RoundEngine { RoundEngine(config: config) }

    init(config: WatchSessionConfig = .fallback) {
        self.config = config
        self.sessionId = config.sessionId.isEmpty ? UUID().uuidString : config.sessionId
        self.snapshot = RoundEngine(config: config).snapshot(elapsed: 0)

        connectivity.onStartSession = { [weak self] pushed in
            guard let self else { return }
            // The phone is the source of truth for what the session IS. If it
            // pushes a new configuration mid-session, adopting it silently
            // would leave the wrist counting a different fight to the phone.
            self.config = pushed
            if !pushed.sessionId.isEmpty {
                self.sessionId = pushed.sessionId
                self.commandSeq = 0
            }
            if !self.isRunning { self.snapshot = RoundEngine(config: pushed).snapshot(elapsed: 0) }
        }
        connectivity.onEndSession = { [weak self] in
            Task { await self?.stop(notifyPhone: false) }
        }
        heartRate.onSample = { [weak self] bpm, at in
            self?.connectivity.sendHeartRate(bpm: bpm, at: at)
        }
        connectivity.activate()
    }

    var bpm: Int? { shotBpm ?? heartRate.bpm }

    func start() {
        guard !isRunning else { return }
        // A brand-new press after reset gets a fresh identity so a queued
        // command from the previous session cannot collide with this one.
        if startedAt == nil && pausedElapsed == 0 && commandSeq == 0 && config.sessionId.isEmpty {
            sessionId = UUID().uuidString
        }
        startedAt = Date().addingTimeInterval(-pausedElapsed)
        isRunning = true
        startTicking()
        // The HKWorkoutSession started here is also what earns the background
        // runtime: it keeps the app alive through a wrist-down and makes watchOS
        // return to the workout on a wrist-raise instead of dimming away after a
        // couple of seconds.
        //
        // Deliberately not WKExtendedRuntimeSession. That is the mechanism for
        // apps with no workout to run — it needs one of the self-care /
        // mindfulness / physical-therapy / alarm background modes, and this
        // bundle declares workout-processing (see WatchApp/Info.plist), so
        // starting one here would fail at runtime even if it were wanted.
        Task { await heartRate.start() }
        sendCommand(.start)
    }

    func pause() {
        guard isRunning, let startedAt else { return }
        pausedElapsed = Date().timeIntervalSince(startedAt)
        isRunning = false
        ticker?.invalidate()
        ticker = nil
        sendCommand(.pause)
    }

    func reset() {
        ticker?.invalidate()
        ticker = nil
        isRunning = false
        startedAt = nil
        pausedElapsed = 0
        firedBells.removeAll()
        snapshot = engine.snapshot(elapsed: 0)
        sendCommand(.reset)
        // Next start is a new session identity.
        sessionId = UUID().uuidString
        commandSeq = 0
        Task { await heartRate.stop() }
    }

    func stop(notifyPhone: Bool = true) async {
        ticker?.invalidate()
        ticker = nil
        isRunning = false
        await heartRate.stop()
        if notifyPhone { sendCommand(.reset) }
        sessionId = UUID().uuidString
        commandSeq = 0
    }

    private func sendCommand(_ command: WatchMessage.Command) {
        commandSeq += 1
        connectivity.send(command: command, sessionId: sessionId, seq: commandSeq)
    }

    private func startTicking() {
        ticker?.invalidate()
        // 250 ms rather than 1 s: at a one-second cadence the displayed number
        // can sit up to a second behind the real clock, and a bell can land
        // visibly after the digit it belongs to.
        let timer = Timer(timeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    private func tick() {
        guard isRunning, let startedAt else { return }
        let elapsed = Date().timeIntervalSince(startedAt)
        let next = engine.snapshot(elapsed: elapsed)

        fireBellsPassed(upTo: elapsed)

        if next.phase == .done, snapshot.phase != .done {
            WKInterfaceDevice.current().play(.success)
            Task { await stop() }
        }
        snapshot = next
    }

    /// Ring every bell whose offset has passed and that has not rung yet.
    ///
    /// Written as "which bells are now behind us" rather than "did a transition
    /// just happen", because the run loop can be suspended across a transition
    /// entirely. A fighter whose wrist was down through the end of a round
    /// still gets the bell the moment the watch wakes — late, but rung.
    private func fireBellsPassed(upTo elapsed: TimeInterval) {
        for offset in engine.bellOffsets where Double(offset) <= elapsed && !firedBells.contains(offset) {
            firedBells.insert(offset)
            // Only ring for a bell we are actually close to. A session resumed
            // from a long suspension would otherwise machine-gun every bell it
            // missed, which is worse than silence.
            if elapsed - Double(offset) < 3 {
                WKInterfaceDevice.current().play(.notification)
            }
        }
    }

    // MARK: - App Store screenshot scenes
    //
    // Launch with `-shot work` (etc.) so scripts/watch-screenshots.mjs can
    // capture frozen, marketing-ready states without HealthKit prompts or a
    // running phone session. Production launches never pass -shot.

    /// Freeze the face on a named scene for App Store captures.
    func applyScreenshotScene(_ name: String) {
        ticker?.invalidate()
        ticker = nil
        isRunning = false
        startedAt = nil
        pausedElapsed = 0
        firedBells.removeAll()
        config = WatchSessionConfig(
            rounds: 12, workSec: 180, restSec: 60, prepSec: 10,
            label: "Boxing", sessionId: "shot"
        )
        switch name.lowercased() {
        case "idle", "ready":
            snapshot = engine.snapshot(elapsed: 0)
            isRunning = false
            shotBpm = nil
        case "prep":
            snapshot = RoundSnapshot(
                phase: .prep(round: 1), remaining: 7, progress: 0.3, totalRounds: 12
            )
            isRunning = true
            shotBpm = 92
        case "work", "round":
            snapshot = RoundSnapshot(
                phase: .work(round: 3), remaining: 97, progress: 0.46, totalRounds: 12
            )
            isRunning = true
            shotBpm = 148
        case "rest":
            snapshot = RoundSnapshot(
                phase: .rest(round: 3), remaining: 28, progress: 0.53, totalRounds: 12
            )
            isRunning = true
            shotBpm = 126
        case "done", "complete":
            snapshot = RoundSnapshot(
                phase: .done, remaining: 0, progress: 1, totalRounds: 12
            )
            isRunning = false
            shotBpm = 118
        default:
            snapshot = engine.snapshot(elapsed: 0)
            shotBpm = nil
        }
        objectWillChange.send()
    }
}
