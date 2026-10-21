import Capacitor
import UIKit

#if canImport(SmartSpectra)
import AVFoundation
import SmartSpectra
import SwiftUI
#endif

/// Camera vitals — pulse, HRV and breathing rate from the front camera, via
/// Presage's SmartSpectra SDK. Measurement runs on-device inside the SDK, which
/// contacts Presage only to authenticate the key; camera frames never reach the
/// web layer, only the numbers do.
///
/// Compiled in two shapes, so the app builds and ships either way:
///
/// - With the SmartSpectra Swift package linked, `measure` presents a native
///   capture sheet and returns the result. Linking the package requires the App
///   target's deployment target at iOS 17, the package's declared minimum — SPM
///   refuses to link a package whose platform floor is above the target's.
/// - Without it, every call reports `not_installed` and the web layer hides the
///   feature.
///
/// CAPInstancePlugin, registered by instance from MainViewController's
/// capacitorDidLoad — the same reason as WatchBridgePlugin: Capacitor only
/// auto-registers plugins from npm packages.
@objc(SmartSpectraPlugin)
public class SmartSpectraPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "SmartSpectraPlugin"
    public let jsName = "SmartSpectra"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "measure", returnType: CAPPluginReturnPromise),
    ]

    /// One capture at a time: the SDK is a shared singleton, and a second sheet
    /// would race the first over its single start/stop lifecycle. Touched only
    /// on the main actor.
    private var measuring = false

    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(SmartSpectra)
        if SmartSpectraPlugin.credentialsPresent {
            call.resolve(["supported": true, "reason": NSNull()])
        } else {
            call.resolve(["supported": false, "reason": "not_configured"])
        }
        #else
        call.resolve(["supported": false, "reason": "not_installed"])
        #endif
    }

    @objc func measure(_ call: CAPPluginCall) {
        #if canImport(SmartSpectra)
        guard SmartSpectraPlugin.credentialsPresent else {
            call.reject("Camera vitals are not configured in this build.", "UNAVAILABLE")
            return
        }
        // Checked up front so a fighter who once declined camera access is told
        // how to fix it, instead of meeting an SDK start failure that doesn't
        // say why.
        let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        if cameraStatus == .denied || cameraStatus == .restricted {
            call.reject(
                "Camera access is turned off for Fight Camp. Turn it on in Settings to run a vitals check.",
                "CAMERA_DENIED"
            )
            return
        }
        let target = min(max(call.getInt("durationSec") ?? 60, 30), 120)

        Task { @MainActor [weak self] in
            guard let self, let root = self.bridge?.viewController else {
                call.reject("No screen to present the vitals check from.", "SDK_ERROR")
                return
            }
            guard !self.measuring else {
                call.reject("A vitals check is already running.", "SDK_ERROR")
                return
            }
            // Present over whatever is already showing; presenting from a
            // controller that is itself presenting fails silently and would
            // leave this call unsettled forever.
            var presenter = root
            while let next = presenter.presentedViewController { presenter = next }

            let sdk = SmartSpectraSDK.shared
            // An OAuth plist in the bundle takes precedence over the key inside
            // the SDK; the key is set whenever present so either works alone.
            if let key = SmartSpectraPlugin.apiKey { sdk.config.apiKey = key }
            sdk.config.imageOutputEnabled = true
            sdk.config.requestedMetrics = SmartSpectraConfig.breathingMetrics + [.pulseRate, .hrv]

            self.measuring = true
            let box = HostBox()
            let view = VitalsCaptureView(targetSeconds: target) { [weak self] outcome in
                self?.measuring = false
                let settle = { SmartSpectraPlugin.settle(call, with: outcome) }
                if let host = box.controller {
                    host.dismiss(animated: true, completion: settle)
                } else {
                    settle()
                }
            }
            let host = UIHostingController(rootView: view)
            // Full screen, not a sheet: a swipe-to-dismiss would close the
            // capture without passing through the view's own cancel path.
            host.modalPresentationStyle = .fullScreen
            box.controller = host
            presenter.present(host, animated: true)
        }
        #else
        call.reject("Camera vitals are not included in this build.", "UNAVAILABLE")
        #endif
    }

    #if canImport(SmartSpectra)
    /// `SmartSpectraAPIKey` from Info.plist, substituted from the
    /// `SMARTSPECTRA_API_KEY` build setting — the same route the RevenueCat key
    /// takes. An unset build setting substitutes as an empty string.
    private static var apiKey: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SmartSpectraAPIKey") as? String else {
            return nil
        }
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        // A literal "$(…)" means the plist was copied without build-setting
        // expansion. Neither that nor an empty string is a key.
        guard !key.isEmpty, !key.hasPrefix("$(") else { return nil }
        return key
    }

    /// Presage's OAuth config. When present (and `IS_OAUTH_ENABLED`), the SDK
    /// authenticates with App Attest and ignores any API key.
    private static var hasOAuthConfig: Bool {
        Bundle.main.url(forResource: "PresageService-Info", withExtension: "plist") != nil
    }

    private static var credentialsPresent: Bool { hasOAuthConfig || apiKey != nil }

    private static func settle(_ call: CAPPluginCall, with outcome: VitalsCaptureOutcome) {
        switch outcome {
        case .measured(let r):
            var result: JSObject = [
                "pulseRate": r.pulseRate,
                "confidence": r.confidence,
                "durationSec": r.durationSec,
            ]
            if let hrv = r.hrvRmssd { result["hrvRmssd"] = hrv } else { result["hrvRmssd"] = NSNull() }
            if let br = r.breathingRate { result["breathingRate"] = br } else { result["breathingRate"] = NSNull() }
            call.resolve(result)
        case .cancelled:
            call.reject("Vitals check cancelled.", "CANCELLED")
        case .noSignal:
            call.reject("No steady pulse came through. Sit still, face the camera in even light and try again.", "NO_SIGNAL")
        case .failed(let message):
            call.reject(message, "SDK_ERROR")
        }
    }
    #endif
}

#if canImport(SmartSpectra)

/// Holds the presented controller weakly, so the capture view's completion can
/// dismiss the controller that hosts it without a retain cycle.
private final class HostBox {
    weak var controller: UIViewController?
}

private struct VitalsResult {
    let pulseRate: Double
    let hrvRmssd: Double?
    let breathingRate: Double?
    /// Mean confidence of the samples used, 0..1.
    let confidence: Double
    let durationSec: Int
}

private enum VitalsCaptureOutcome {
    case measured(VitalsResult)
    case cancelled
    case noSignal
    case failed(String)
}

/// The capture screen: camera preview, the SDK's own guidance, and a countdown
/// that only advances while the SDK reports a usable signal.
@MainActor
private struct VitalsCaptureView: View {
    let targetSeconds: Int
    let onFinish: (VitalsCaptureOutcome) -> Void

    // Explicit, because the private stored properties below would make the
    // synthesized memberwise initializer private — unreachable from the plugin.
    init(targetSeconds: Int, onFinish: @escaping (VitalsCaptureOutcome) -> Void) {
        self.targetSeconds = targetSeconds
        self.onFinish = onFinish
    }

    private let sdk = SmartSpectraSDK.shared

    @State private var pulse: [MeasurementWithConfidence] = []
    @State private var breathing: [MeasurementWithConfidence] = []
    @State private var hrv: [Hrv] = []
    @State private var validSeconds: Double = 0
    @State private var finished = false

    /// Changes whenever a new rate or HRV sample lands. Each metrics payload
    /// carries only the samples since the previous one, so this is the trigger
    /// that merges every payload exactly once — the pattern the SDK's own
    /// sample app uses.
    private var metricsUpdateToken: Int64 {
        [
            sdk.metrics?.cardio.pulseRate.last?.timestamp,
            sdk.metrics?.breathing.rate.last?.timestamp,
            sdk.metrics?.cardio.hrv.last?.timestamp,
        ]
        .compactMap { $0 }
        .max() ?? 0
    }

    private var progress: Double { min(validSeconds / Double(targetSeconds), 1) }

    private var hasStableHRV: Bool { hrv.contains { $0.stable && $0.rmssd > 0 } }

    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Spacer()
                Button("Cancel") { finish(.cancelled) }
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
            }

            Text("Morning vitals")
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)

            preview
                .frame(width: 240, height: 240)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
                .overlay(
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(Color.green, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .padding(-10)
                        .animation(.linear(duration: 0.25), value: progress)
                )
                .accessibilityLabel("Camera preview, \(Int(progress * 100)) percent measured")

            // The SDK's hint is written for end users — surfaced as-is.
            Text(sdk.validationStatus?.hint ?? "Getting ready\u{2026}")
                .font(.headline)
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)

            Text("Sit still, face the camera in even light and breathe normally. The countdown pauses whenever the signal isn't usable.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)

            Spacer()
        }
        .padding(24)
        .background(Color.black.ignoresSafeArea())
        .task { await run() }
        .task(id: metricsUpdateToken) { merge() }
    }

    @ViewBuilder private var preview: some View {
        if let image = sdk.imageOutput {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: .fill)
        } else {
            ZStack {
                Color.white.opacity(0.08)
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
    }

    private func merge() {
        guard let metrics = sdk.metrics else { return }
        if !metrics.cardio.pulseRate.isEmpty {
            pulse.appendProtoArray(contentsOf: metrics.cardio.pulseRate)
        }
        if !metrics.breathing.rate.isEmpty {
            breathing.appendProtoArray(contentsOf: metrics.breathing.rate)
        }
        if let latest = metrics.cardio.hrv.last {
            hrv.append(latest)
        }
    }

    private func run() async {
        do {
            try await sdk.start()
        } catch {
            finish(.failed(error.localizedDescription))
            return
        }

        // Collect until there is enough valid signal AND a stable HRV window,
        // or until a hard cap so a fighter in poor light is not held here
        // forever. Past the target, the capture keeps going only for HRV —
        // the reading the readiness baseline is built on.
        let tick = 0.25
        let cap = Double(targetSeconds) * 2.5
        var elapsed = 0.0
        while !finished {
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            elapsed += tick
            if case .ok? = sdk.validationStatus?.code {
                validSeconds += tick
            }
            let enoughSignal = validSeconds >= Double(targetSeconds)
            if (enoughSignal && hasStableHRV) || elapsed >= cap { break }
        }
        guard !finished else { return }
        finish(summarise())
    }

    private func summarise() -> VitalsCaptureOutcome {
        // `stable` is the SDK's own accuracy verdict — ±3 bpm for pulse, ±1
        // breath/min for breathing — so samples below it are dropped rather
        // than averaged in with the good ones.
        let stablePulse = pulse.filter { $0.stable && $0.timestamp > 0 }
        guard !stablePulse.isEmpty else { return .noSignal }
        let stableBreathing = breathing.filter { $0.stable && $0.timestamp > 0 }
        // The last stable HRV window covers the most beat-to-beat data the
        // capture produced.
        let stableHRV = hrv.last(where: { $0.stable && $0.rmssd > 0 })

        var confidences = stablePulse.map { Double($0.confidence) }
        if let h = stableHRV { confidences.append(Double(h.confidence)) }
        let meanConfidence = confidences.reduce(0, +) / Double(confidences.count)

        return .measured(VitalsResult(
            pulseRate: median(stablePulse.map { Double($0.value) }),
            hrvRmssd: stableHRV.map { $0.rmssd },
            breathingRate: stableBreathing.isEmpty ? nil : median(stableBreathing.map { Double($0.value) }),
            // The SDK reports confidence as a percentage, 0...100.
            confidence: min(max(meanConfidence / 100, 0), 1),
            durationSec: Int(validSeconds.rounded())
        ))
    }

    private func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let mid = sorted.count / 2
        return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    private func finish(_ outcome: VitalsCaptureOutcome) {
        guard !finished else { return }
        finished = true
        Task { try? await sdk.stop() }
        onFinish(outcome)
    }
}

#endif
