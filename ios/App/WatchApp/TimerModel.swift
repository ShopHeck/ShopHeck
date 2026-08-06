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

    /// Wall-clock instant the session started, adjusted for time spent paused.
    private var startedAt: Date?
    private var pausedElapsed: TimeInterval = 0
    private var ticker: Timer?
    /// Bell offsets already fired, so a re-render cannot double-ring.
    private var firedBells: Set<Int> = []

    private var engine: RoundEngine { RoundEngine(config: config) }

    init(config: WatchSessionConfig = .fallback) {
        self.config = config
        self.snapshot = RoundEngine(config: config).snapshot(elapsed: 0)

        connectivity.onStartSession = { [weak self] pushed in
            guard let self else { return }
            // The phone is the source of truth for what the session IS. If it
            // pushes a new configuration mid-session, adopting it silently
            // would leave the wrist counting a different fight to the phone.
            self.config = pushed
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

    var bpm: Int? { heartRate.bpm }

    func start() {
        guard !isRunning else { return }
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
        connectivity.send(command: .start)
    }

    func pause() {
        guard isRunning, let startedAt else { return }
        pausedElapsed = Date().timeIntervalSince(startedAt)
        isRunning = false
        ticker?.invalidate()
        ticker = nil
        connectivity.send(command: .pause)
    }

    func reset() {
        ticker?.invalidate()
        ticker = nil
        isRunning = false
        startedAt = nil
        pausedElapsed = 0
        firedBells.removeAll()
        snapshot = engine.snapshot(elapsed: 0)
        connectivity.send(command: .reset)
        Task { await heartRate.stop() }
    }

    func stop(notifyPhone: Bool = true) async {
        ticker?.invalidate()
        ticker = nil
        isRunning = false
        await heartRate.stop()
        if notifyPhone { connectivity.send(command: .reset) }
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
}
