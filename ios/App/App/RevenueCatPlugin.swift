import Capacitor
import RevenueCat
import RevenueCatUI
import SwiftUI

@objc(RevenueCatPlugin)
public class RevenueCatPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RevenueCatPlugin"
    public let jsName = "RevenueCat"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCustomerInfo",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentPaywall",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentCustomerCenter",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases",       returnType: CAPPluginReturnPromise),
    ]

    /// Maps active RevenueCat entitlements to the app's subscription tier string.
    /// Checks "Coach Pro" first (superset) so coach users don't get downgraded to fighter_pro.
    private func tierFromEntitlements(_ entitlements: EntitlementInfos) -> String {
        if entitlements["Coach Pro"]?.isActive == true { return "coach_pro" }
        if entitlements["Fight Camp Pro"]?.isActive == true { return "fighter_pro" }
        return "free"
    }

    /// Returns whether the user has an active entitlement and which tier they hold.
    @objc func getCustomerInfo(_ call: CAPPluginCall) {
        Purchases.shared.getCustomerInfo { [weak self] customerInfo, error in
            guard let self else { return }
            if let error {
                call.reject(error.localizedDescription)
                return
            }
            guard let info = customerInfo else {
                call.reject("No customer info available")
                return
            }
            let tier = self.tierFromEntitlements(info.entitlements)
            call.resolve(["isPro": tier != "free", "tier": tier])
        }
    }

    /// Presents the RevenueCat native paywall as a sheet over the Capacitor WebView.
    /// The JS promise resolves with { isPro, tier } only after the sheet is dismissed
    /// (whether via purchase, restore, or cancel) so callers get accurate post-purchase state.
    @objc func presentPaywall(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let rootVC = self.bridge?.viewController else {
                call.reject("Unable to find root view controller")
                return
            }

            // Guard against resolving twice — viewDidDisappear could fire repeatedly
            // if the view is moved between window scenes during dismissal.
            var didResolve = false
            let plugin = self

            let paywallVC = DismissAwareHostingController(
                rootView: PaywallView(displayCloseButton: true)
            )
            paywallVC.onDismiss = {
                guard !didResolve else { return }
                didResolve = true
                Purchases.shared.getCustomerInfo { customerInfo, error in
                    if let error {
                        call.reject(error.localizedDescription)
                        return
                    }
                    guard let info = customerInfo else {
                        call.resolve(["isPro": false, "tier": "free"])
                        return
                    }
                    let tier = plugin.tierFromEntitlements(info.entitlements)
                    call.resolve(["isPro": tier != "free", "tier": tier])
                }
            }
            paywallVC.modalPresentationStyle = .pageSheet
            if let sheet = paywallVC.sheetPresentationController {
                sheet.detents = [.large()]
                sheet.prefersGrabberVisible = true
            }

            rootVC.present(paywallVC, animated: true)
        }
    }

    /// Presents the RevenueCat Customer Center so users can manage or cancel subscriptions.
    @objc func presentCustomerCenter(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let rootVC = self.bridge?.viewController else {
                call.reject("Unable to find root view controller")
                return
            }

            let centerVC = UIHostingController(rootView: CustomerCenterView())
            centerVC.modalPresentationStyle = .pageSheet
            rootVC.present(centerVC, animated: true) {
                call.resolve()
            }
        }
    }

    /// Restores previous purchases. Required by Apple — must be accessible to users.
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Purchases.shared.restorePurchases { [weak self] customerInfo, error in
            guard let self else { return }
            if let error {
                call.reject(error.localizedDescription)
                return
            }
            guard let info = customerInfo else {
                call.resolve(["isPro": false, "tier": "free"])
                return
            }
            let tier = self.tierFromEntitlements(info.entitlements)
            call.resolve(["isPro": tier != "free", "tier": tier])
        }
    }
}

/// UIHostingController subclass that fires a single callback when the view disappears,
/// catching both interactive swipe-down and programmatic close-button dismissals.
private final class DismissAwareHostingController<Content: View>: UIHostingController<Content> {
    var onDismiss: (() -> Void)?

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // isBeingDismissed is true only when the controller itself is being torn
        // down (not when the view temporarily leaves the hierarchy for other reasons).
        if isBeingDismissed || self.presentingViewController == nil {
            onDismiss?()
        }
    }
}
