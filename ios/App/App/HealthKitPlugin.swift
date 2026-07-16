import Capacitor
import HealthKit

/// Writes workouts and body-mass samples to Apple Health.
///
/// Read access is intentionally NOT requested here — the app imports historical
/// Health data via the manual export.xml flow (`AppleHealthSync`). This plugin is
/// write-only ("share"), so a user can opt in to mirroring newly logged workouts
/// and weigh-ins into Apple Health without granting read access.
///
/// CAPInstancePlugin: registered by instance from MainViewController's
/// capacitorDidLoad (see AppDelegate.swift). Capacitor does NOT discover
/// app-target plugins automatically — conforming to CAPBridgedPlugin alone is
/// not enough, because only classes in the generated packageClassList (built
/// from npm plugin packages) are auto-registered.
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight",           returnType: CAPPluginReturnPromise),
    ]

    private let healthStore = HKHealthStore()

    /// The sample types this plugin writes (workouts + body mass).
    private var shareTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        if let bodyMass = HKQuantityType.quantityType(forIdentifier: .bodyMass) {
            types.insert(bodyMass)
        }
        return types
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    /// Prompts for write ("share") permission. Note: Apple deliberately never
    /// reveals whether write access was actually granted (privacy) — `success`
    /// only means the prompt completed without error. Saves to a denied type fail
    /// silently, which is acceptable for an optional mirror.
    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.resolve(["granted": false])
            return
        }
        healthStore.requestAuthorization(toShare: shareTypes, read: []) { success, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": success])
        }
    }

    /// Maps the app's normalized activity string to a HealthKit activity type.
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

        // The simple initializer is deprecated on iOS 17 but remains functional on
        // iOS 15+; HKWorkoutBuilder is the modern alternative if we later need
        // per-sample data. WasUserEntered marks these as manual entries.
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
}
