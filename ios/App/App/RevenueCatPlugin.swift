import Capacitor
import RevenueCat
import RevenueCatUI
import SwiftUI

// CAPInstancePlugin: registered by instance from MainViewController's
// capacitorDidLoad (see AppDelegate.swift) — app-target plugins are not in the
// generated packageClassList, so Capacitor never discovers them by class name.
@objc(RevenueCatPlugin)
public class RevenueCatPlugin: CAPInstancePlugin, CAPBridgedPlugin {
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
    /// Serves the SDK's cache when the network is flaky — entitlement checks must
    /// not fail (and must never look like a purchase failure) on a transient error.
    @objc func getCustomerInfo(_ call: CAPPluginCall) {
        Purchases.shared.getCustomerInfo(fetchPolicy: .cachedOrFetched) { [weak self] customerInfo, error in
            guard let self else { return }
            if let error, customerInfo == nil {
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
                // Never reject once the paywall session is over: any purchase already
                // completed (or didn't happen) inside the sheet, so a transient error
                // fetching customer info here must not surface as "purchase failed".
                // A completed purchase updates the SDK's cache, so .cachedOrFetched
                // returns the correct entitlements even if the network then flakes.
                Purchases.shared.getCustomerInfo(fetchPolicy: .cachedOrFetched) { customerInfo, _ in
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

            // Present from the top-most controller: if something else (e.g. the
            // customer center) is already on screen, presenting from the root
            // silently fails and the JS promise would never settle.
            var topVC: UIViewController = rootVC
            while let presented = topVC.presentedViewController { topVC = presented }
            topVC.present(paywallVC, animated: true)
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
            var topVC: UIViewController = rootVC
            while let presented = topVC.presentedViewController { topVC = presented }
            topVC.present(centerVC, animated: true) {
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
