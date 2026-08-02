import Capacitor
import StoreKit

// CAPInstancePlugin: registered by instance from AppDelegate's capacitorDidLoad,
// same as RevenueCatPlugin/HealthKitPlugin — app-target plugins are not in the
// generated packageClassList, so Capacitor never discovers them by class name.
@objc(AppReviewPlugin)
public class AppReviewPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "AppReviewPlugin"
    public let jsName = "AppReview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
    ]

    /// Asks StoreKit for the in-app rating sheet. Apple decides whether it is
    /// actually shown (system-wide cap of ~3 prompts/year per user), so callers
    /// treat this as fire-and-forget: it always resolves, shown or not — a
    /// review ask must never surface as an error at a celebration moment.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene })
                .first(where: { $0.activationState == .foregroundActive }) {
                if #available(iOS 16.0, *) {
                    AppStore.requestReview(in: scene)
                } else {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            call.resolve()
        }
    }
}
