import Capacitor
import HealthKit

/// Reads and writes workouts and body-mass samples to Apple Health.
///
/// Write path mirrors newly logged app entries (optional). Read path powers
/// one-tap import of recent weights/workouts into the active camp — the
/// historical export.xml flow in AppleHealthSync remains for bulk Mac exports.
///
/// CAPInstancePlugin: registered by instance from MainViewController's
/// capacitorDidLoad (see AppDelegate.swift).
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWeights",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts",        returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    private var shareTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let bodyMass = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(bodyMass)
        }
        return types
    }

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let bodyMass = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(bodyMass)
        }
        return types
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    /// Prompts for share + read. Apple does not reveal write grant status;
    /// `granted` means the prompt completed without error.
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        let read = call.getBool("read") ?? true
        healthStore.requestAuthorization(
            toShare: shareTypes,
            read: read ? readTypes : []
        ) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": success])
        }
    }

    private func activityType(for raw: String?) -> HKWorkoutActivityType {
        switch (raw ?? "").lowercased() {
        case "boxing":      return .boxing
        case "kickboxing":  return .kickboxing
        case "martialarts": return .martialArts
        case "hiit":        return .highIntensityIntervalTraining
        case "strength":    return .traditionalStrengthTraining
        case "running":     return .running
        case "cycling":     return .cycling
        case "recovery":    return .preparationAndRecovery
        default:            return .martialArts
        }
    }

    private func activityKey(for type: HKWorkoutActivityType) -> String {
        switch type {
        case .boxing: return "boxing"
        case .kickboxing: return "kickboxing"
        case .martialArts: return "martialArts"
        case .highIntensityIntervalTraining: return "hiit"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "strength"
        case .running: return "running"
        case .cycling: return "cycling"
        case .preparationAndRecovery, .mindAndBody: return "recovery"
        default: return "other"
        }
    }

    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }
        guard let startMs = call.getDouble("startMs"), let endMs = call.getDouble("endMs") else {
            call.reject("startMs and endMs are required")
            return
        }
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        guard end > start else {
            call.reject("endMs must be after startMs")
            return
        }

        var energy: HKQuantity?
        if let kcal = call.getDouble("energyKcal"), kcal > 0 {
            energy = HKQuantity(unit: .kilocalorie(), doubleValue: kcal)
        }

        let workout = HKWorkout(
            activityType: activityType(for: call.getString("activityType")),
            start: start,
            end: end,
            duration: end.timeIntervalSince(start),
            totalEnergyBurned: energy,
            totalDistance: nil,
            metadata: [HKMetadataKeyWasUserEntered: true]
        )

        healthStore.save(workout) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["saved": success])
        }
    }

    @objc func saveWeight(_ call: CAPPluginCall) {
        guard
            HKHealthStore.isHealthDataAvailable(),
            let bodyMassType = HKQuantityType.quantityType(forIdentifier: .bodyMass)
        else {
            call.reject("Health data is not available on this device")
            return
        }
        guard let kg = call.getDouble("kg"), kg > 0 else {
            call.reject("kg (positive) is required")
            return
        }
        let date = call.getDouble("dateMs").map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()

        let sample = HKQuantitySample(
            type: bodyMassType,
            quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
            start: date,
            end: date,
            metadata: [HKMetadataKeyWasUserEntered: true]
        )

        healthStore.save(sample) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["saved": success])
        }
    }

    /// Body-mass samples in [startMs, endMs], newest first, capped at `limit`.
    @objc func queryWeights(_ call: CAPPluginCall) {
        guard
            HKHealthStore.isHealthDataAvailable(),
            let bodyMassType = HKQuantityType.quantityType(forIdentifier: .bodyMass)
        else {
            call.resolve(["samples": []])
            return
        }
        let startMs = call.getDouble("startMs") ?? (Date().timeIntervalSince1970 * 1000 - 90 * 86_400_000)
        let endMs = call.getDouble("endMs") ?? (Date().timeIntervalSince1970 * 1000)
        let limit = call.getInt("limit") ?? 200
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(
            sampleType: bodyMassType,
            predicate: predicate,
            limit: max(1, min(limit, 500)),
            sortDescriptors: [sort]
        ) { _, samples, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let kgUnit = HKUnit.gramUnit(with: .kilo)
            let rows: [[String: Double]] = (samples as? [HKQuantitySample] ?? []).map { s in
                [
                    "dateMs": s.startDate.timeIntervalSince1970 * 1000,
                    "kg": s.quantity.doubleValue(for: kgUnit),
                ]
            }
            call.resolve(["samples": rows])
        }
        healthStore.execute(query)
    }

    /// Workouts in [startMs, endMs], newest first.
    @objc func queryWorkouts(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["samples": []])
            return
        }
        let startMs = call.getDouble("startMs") ?? (Date().timeIntervalSince1970 * 1000 - 90 * 86_400_000)
        let endMs = call.getDouble("endMs") ?? (Date().timeIntervalSince1970 * 1000)
        let limit = call.getInt("limit") ?? 200
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: max(1, min(limit, 500)),
            sortDescriptors: [sort]
        ) { [weak self] _, samples, error in
            guard let self else { return }
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let rows: [[String: Any]] = (samples as? [HKWorkout] ?? []).map { w in
                var row: [String: Any] = [
                    "dateMs": w.startDate.timeIntervalSince1970 * 1000,
                    "durationSec": w.duration,
                    "activityType": self.activityKey(for: w.workoutActivityType),
                ]
                if let src = w.sourceRevision.source.name as String? {
                    row["sourceName"] = src
                }
                return row
            }
            call.resolve(["samples": rows])
        }
        healthStore.execute(query)
    }
}
