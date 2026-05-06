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

    /// Retains the dismiss coordinator for the lifetime of the presented sheet.
    private static var coordinatorKey = 0

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

            // Guard against resolving twice: once for interactive swipe-down via the
            // presentation controller delegate, and once for button-driven dismiss.
            var didResolve = false
            let plugin = self

            func resolveAfterDismiss() {
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

            let paywallVC = UIHostingController(rootView: PaywallView(dismissRequestedHandler: {
                // User tapped the paywall's own close/done button.
                rootVC.dismiss(animated: true) {
                    resolveAfterDismiss()
                }
            }))
            paywallVC.modalPresentationStyle = .pageSheet
            if let sheet = paywallVC.sheetPresentationController {
                sheet.detents = [.large()]
                sheet.prefersGrabberVisible = true
            }

            // Present first so presentationController is non-nil, then wire the delegate
            // to catch interactive swipe-down dismissal.
            rootVC.present(paywallVC, animated: true) {
                let coordinator = DismissCoordinator(onDismiss: resolveAfterDismiss)
                paywallVC.presentationController?.delegate = coordinator
                // Retain coordinator until the sheet is deallocated.
                objc_setAssociatedObject(
                    paywallVC,
                    &RevenueCatPlugin.coordinatorKey,
                    coordinator,
                    .OBJC_ASSOCIATION_RETAIN_NONATOMIC
                )
            }
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

/// Catches interactive swipe-down sheet dismissal and forwards it to the resolve closure.
private final class DismissCoordinator: NSObject, UIAdaptivePresentationControllerDelegate {
    private let onDismiss: () -> Void
    init(onDismiss: @escaping () -> Void) { self.onDismiss = onDismiss }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        onDismiss()
    }
}
