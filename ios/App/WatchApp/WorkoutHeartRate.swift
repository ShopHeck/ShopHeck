import Foundation
import HealthKit

/// Live heart rate from the wrist, via an `HKWorkoutSession`.
///
/// A workout session is not optional decoration here — it is the only way to get
/// continuous heart rate on watchOS. Outside a running workout the sensor
/// samples sporadically (minutes apart, opportunistically), which is useless for
/// training zones. Starting a session also earns the app background runtime, so
/// the timer and the HR stream survive a wrist-down.
///
/// This is what lets the app drop its Bluetooth chest-strap requirement: the
/// existing `useBluetoothHR` path stays for fighters who own a strap and want
/// its accuracy, but a fighter with only an Apple Watch now gets zones and MEP
/// too — previously the entire HR half of the app was dark for them.
@MainActor
final class WorkoutHeartRate: NSObject, ObservableObject {
    @Published private(set) var bpm: Int?
    @Published private(set) var isRunning = false
    @Published private(set) var authorizationDenied = false

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    /// Called for every new sample, so the phone can be kept in step.
    var onSample: ((Int, Date) -> Void)?

    private var heartRateType: HKQuantityType? {
        HKQuantityType.quantityType(forIdentifier: .heartRate)
    }

    func start() async {
        guard HKHealthStore.isHealthDataAvailable(), !isRunning else { return }

        // Read-only. The watch app deliberately does not request share
        // permission: the phone app already owns writing workouts to Health
        // (see HealthKitPlugin), and asking twice for the same capability from
        // two places is how a user ends up denying both.
        var readTypes: Set<HKObjectType> = []
        if let heartRateType { readTypes.insert(heartRateType) }
        readTypes.insert(HKObjectType.activitySummaryType())

        do {
            try await healthStore.requestAuthorization(toShare: [], read: readTypes)
        } catch {
            authorizationDenied = true
            return
        }

        let configuration = HKWorkoutConfiguration()
        // Boxing is the closest built-in activity type; it drives the watch's
        // own calorie model and shows the right glyph in the Activity app.
        configuration.activityType = .boxing
        configuration.locationType = .indoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self

            let start = Date()
            session.startActivity(with: start)
            try await builder.beginCollection(at: start)

            self.session = session
            self.builder = builder
            self.isRunning = true
        } catch {
            // A failed session is not fatal — the round timer still runs, just
            // without heart rate. Surfacing it as "denied" would be wrong; the
            // UI simply shows no BPM.
            self.session = nil
            self.builder = nil
            self.isRunning = false
        }
    }

    func stop() async {
        guard let session, let builder else { return }
        let end = Date()
        session.end()
        try? await builder.endCollection(at: end)
        // The workout is deliberately NOT saved to Health here. The phone app
        // writes the session (with the fighter's own RPE, title and notes) when
        // they log it — saving from both sides would put every session in
        // Health twice.
        builder.discardWorkout()
        self.session = nil
        self.builder = nil
        self.isRunning = false
        self.bpm = nil
    }
}

extension WorkoutHeartRate: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        if toState == .ended {
            Task { @MainActor in self.isRunning = false }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            self.isRunning = false
            self.bpm = nil
        }
    }
}

extension WorkoutHeartRate: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        guard
            let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate),
            collectedTypes.contains(heartRateType),
            let statistics = workoutBuilder.statistics(for: heartRateType),
            let quantity = statistics.mostRecentQuantity()
        else { return }

        let unit = HKUnit.count().unitDivided(by: .minute())
        let value = Int(quantity.doubleValue(for: unit).rounded())
        let at = statistics.mostRecentQuantityDateInterval()?.end ?? Date()

        Task { @MainActor in
            // A zero or absurd reading is a sensor dropout, not a heart rate.
            // Letting it through would drop the fighter to Zone 0 mid-round.
            guard value > 20, value < 260 else { return }
            self.bpm = value
            self.onSample?(value, at)
        }
    }
}
