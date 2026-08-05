import Capacitor
import RevenueCat
import RevenueCatUI
import SwiftUI

/// Validates and applies the RevenueCat API key at launch.
///
/// The SDK accepts any non-empty string and only discovers a bad key on its
/// first network call, where the backend answers 401 and the SDK reports
/// `ErrorCode.invalidCredentialsError` (11) — "There was a credentials issue.
/// Check the underlying error for more details." RevenueCatUI surfaces that
/// verbatim on the paywall, so a user trying to start a free trial sees a bare
/// "Error 11" and nothing anywhere points at the real cause.
///
/// Public SDK keys are platform-scoped and prefixed, so the common mistakes are
/// catchable before `configure` is ever called: the Google key in an iOS build,
/// a secret (`sk_`) key from the dashboard's API page, or the Test Store key —
/// which only works in debug builds and is exactly the key this repo keeps in
/// its Debug configuration.
///
/// (Lives in this file rather than its own so the Xcode project file needs no
/// hand-edited source entry — same reason MainViewController sits in AppDelegate.)
enum RevenueCatConfig {

    /// Non-nil when the key was rejected. Purchases is left unconfigured then,
    /// so every plugin entry point must check this first: touching
    /// `Purchases.shared` before `configure` traps.
    private(set) static var configurationError: String?

    /// The key's prefix (`appl_`, `test_`, …) or "none". Safe to surface in the
    /// app's diagnostics screen — it identifies the *kind* of key without
    /// revealing it.
    private(set) static var keyPrefix: String = "none"

    static var isConfigured: Bool { configurationError == nil }

    /// Reads `RevenueCatAPIKey` from Info.plist (substituted from the
    /// `REVENUECAT_API_KEY` build setting) and configures the SDK if it holds a
    /// usable Apple key.
    static func configure() {
        let key = (Bundle.main.infoDictionary?["RevenueCatAPIKey"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        keyPrefix = prefix(of: key)

        if let problem = validate(key) {
            configurationError = problem
            NSLog("[FightCamp] RevenueCat not configured — %@", problem)
            return
        }

        configurationError = nil
        Purchases.configure(withAPIKey: key)
    }

    /// Returns a human-readable problem with the key, or nil when it looks
    /// usable. Pure, so the same rules can be mirrored in the CI preflight.
    static func validate(_ key: String) -> String? {
        if key.isEmpty {
            return "no RevenueCat API key is baked into this build (REVENUECAT_API_KEY was empty at archive time)."
        }
        if key.hasPrefix("appl_") {
            return nil
        }
        if key.hasPrefix("test_") {
            #if DEBUG
            return nil
            #else
            return "this build carries a RevenueCat Test Store key (test_…). The Test Store only works in debug builds — a release build needs the public Apple SDK key, which starts with appl_."
            #endif
        }
        if key.hasPrefix("goog_") {
            return "this build carries the Google Play RevenueCat key (goog_…). iOS needs the Apple key, which starts with appl_."
        }
        if key.hasPrefix("amzn_") {
            return "this build carries the Amazon RevenueCat key (amzn_…). iOS needs the Apple key, which starts with appl_."
        }
        if key.hasPrefix("rcb_") || key.hasPrefix("strp_") {
            return "this build carries a RevenueCat Web Billing key. iOS needs the Apple SDK key, which starts with appl_."
        }
        if key.hasPrefix("sk_") {
            return "this build carries a RevenueCat *secret* key (sk_…). Secret keys are server-side only — the app needs the public Apple SDK key, which starts with appl_."
        }
        if key.lowercased().contains("replace") || key.contains("XXXX") {
            return "the RevenueCat API key is still the placeholder from Secrets.xcconfig.example."
        }
        return "the RevenueCat API key doesn't look like an Apple SDK key (expected it to start with appl_)."
    }

    private static func prefix(of key: String) -> String {
        guard !key.isEmpty else { return "none" }
        for known in ["appl_", "test_", "goog_", "amzn_", "rcb_", "strp_", "sk_"] where key.hasPrefix(known) {
            return known
        }
        return "unrecognised"
    }
}

/// Turns a RevenueCat SDK error into something a user can act on. The SDK's own
/// `localizedDescription` for the most common failure is "There was a
/// credentials issue. Check the underlying error for more details.", which tells
/// the person holding the phone nothing at all.
private func describeRevenueCatError(_ error: Error) -> String {
    let nsError = error as NSError
    switch nsError.code {
    case ErrorCode.invalidCredentialsError.rawValue:
        return "The App Store connection for this build isn't set up correctly (RevenueCat rejected its API key). This is a build configuration problem, not something you can fix on this device."
    case ErrorCode.configurationError.rawValue:
        return "In-app purchases aren't configured for this build yet. Please try again after the next update."
    case ErrorCode.networkError.rawValue:
        return "Couldn't reach the App Store — check your connection and try again."
    default:
        return nsError.localizedDescription
    }
}

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
        CAPPluginMethod(name: "purchasePackage",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPackages",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logIn",                  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logOut",                 returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiagnostics",         returnType: CAPPluginReturnPromise),
    ]

    /// Rejects the call when the SDK was never configured (bad API key). Every
    /// entry point must run this before touching `Purchases.shared`, which traps
    /// rather than throwing when unconfigured.
    private func requireConfigured(_ call: CAPPluginCall) -> Bool {
        guard let problem = RevenueCatConfig.configurationError else { return true }
        call.reject(problem)
        return false
    }

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
        guard requireConfigured(call) else { return }
        Purchases.shared.getCustomerInfo(fetchPolicy: .cachedOrFetched) { [weak self] customerInfo, error in
            guard let self else { return }
            if let error, customerInfo == nil {
                call.reject(describeRevenueCatError(error))
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
        guard requireConfigured(call) else { return }

        // Load the offering *before* presenting anything. PaywallView fetches it
        // itself, but when that fetch fails it renders a loading skeleton and
        // throws its own UIAlert reading "Error 11: There was a credentials
        // issue" over the top — a dead end the app can neither catch nor
        // explain. Resolving the offering up front means a broken configuration
        // rejects back to JS, which renders it as ordinary in-app copy.
        Purchases.shared.getOfferings { [weak self] offerings, error in
            guard let self else { return }

            if let error {
                call.reject(describeRevenueCatError(error))
                return
            }
            guard let offering = offerings?.current else {
                call.reject("No subscription options are available right now. If this keeps happening, make sure a current offering is set in RevenueCat and its products are approved in App Store Connect.")
                return
            }

            self.present(offering: offering, for: call)
        }
    }

    private func present(offering: Offering, for call: CAPPluginCall) {
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
                rootView: PaywallView(offering: offering, displayCloseButton: true)
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

    /// The packages available in the current offering, so the app's OWN
    /// upgrade screen can offer a direct purchase instead of opening the
    /// RevenueCat paywall as a second decision screen. Resolves with
    /// identifier + localized price string per package; empty when no
    /// offering is configured.
    @objc func getPackages(_ call: CAPPluginCall) {
        guard requireConfigured(call) else { return }
        Purchases.shared.getOfferings { offerings, error in
            if let error {
                call.reject(describeRevenueCatError(error))
                return
            }
            guard let packages = offerings?.current?.availablePackages else {
                call.resolve(["packages": [[String: Any]]()])
                return
            }
            let out: [[String: Any]] = packages.map { p in
                [
                    "identifier": p.identifier,
                    "productIdentifier": p.storeProduct.productIdentifier,
                    "packageType": String(describing: p.packageType),
                    "localizedPrice": p.localizedPriceString,
                    "productTitle": p.storeProduct.localizedTitle,
                ]
            }
            call.resolve(["packages": out])
        }
    }

    /// Purchases a specific package by identifier (from getPackages), going
    /// straight to StoreKit's payment sheet — no RevenueCat paywall in
    /// between. This is what lets the app's custom upgrade modal own the
    /// entire purchase decision on native instead of stacking a second
    /// full-screen paywall on top of it.
    @objc func purchasePackage(_ call: CAPPluginCall) {
        guard requireConfigured(call) else { return }
        guard let identifier = call.getString("packageId"), !identifier.isEmpty else {
            call.reject("packageId is required")
            return
        }
        Purchases.shared.getOfferings { [weak self] offerings, error in
            guard let self else { return }
            if let error {
                call.reject(describeRevenueCatError(error))
                return
            }
            guard let packages = offerings?.current?.availablePackages,
                  let package = packages.first(where: { $0.identifier == identifier })
            else {
                call.reject("That subscription option is no longer available. Close this screen and try again.")
                return
            }
            Purchases.shared.purchase(package: package) { transaction, customerInfo, purchaseError, cancelled in
                if let purchaseError {
                    // A user changing their mind is not an error — report it as
                    // a normal non-purchase result, not a red failure notice.
                    // purchaseError is PublicError (NSError); compare its code
                    // the same way describeRevenueCatError does.
                    let nsError = purchaseError as NSError
                    if cancelled || nsError.code == ErrorCode.purchaseCancelledError.rawValue {
                        call.resolve(["isPro": false, "tier": "free", "cancelled": true])
                        return
                    }
                    call.reject(describeRevenueCatError(purchaseError))
                    return
                }
                _ = transaction
                guard let info = customerInfo else {
                    call.resolve(["isPro": false, "tier": "free", "cancelled": false])
                    return
                }
                let tier = self.tierFromEntitlements(info.entitlements)
                call.resolve(["isPro": tier != "free", "tier": tier, "cancelled": false])
            }
        }
    }

    /// Presents the RevenueCat Customer Center so users can manage or cancel subscriptions.
    @objc func presentCustomerCenter(_ call: CAPPluginCall) {
        guard requireConfigured(call) else { return }
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

    /// Ties the RevenueCat subscriber to the signed-in Supabase account. From then
    /// on, webhook events carry the Supabase user id (directly or as an alias), which
    /// is what lets the server record App Store entitlements as verified. Resolves
    /// with the identified account's entitlements so a subscription bought on another
    /// device under the same account can be applied immediately.
    @objc func logIn(_ call: CAPPluginCall) {
        guard requireConfigured(call) else { return }
        guard let appUserId = call.getString("appUserId"), !appUserId.isEmpty else {
            call.reject("appUserId is required")
            return
        }
        Purchases.shared.logIn(appUserId) { [weak self] customerInfo, _, error in
            guard let self else { return }
            if let error, customerInfo == nil {
                call.reject(describeRevenueCatError(error))
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

    /// Detaches the signed-in account from this device's RevenueCat subscriber.
    /// Guarded so it's a no-op while anonymous: the SDK errors on anonymous logOut,
    /// and each logOut mints a fresh anonymous subscriber — calling it on every
    /// signed-out launch would litter the RevenueCat dashboard with orphans.
    @objc func logOut(_ call: CAPPluginCall) {
        // Detaching an account we never attached is trivially satisfied, so an
        // unconfigured SDK resolves rather than rejecting on sign-out.
        guard RevenueCatConfig.isConfigured else {
            call.resolve()
            return
        }
        guard !Purchases.shared.isAnonymous else {
            call.resolve()
            return
        }
        Purchases.shared.logOut { _, _ in
            // The goal (no account attached) holds even if the SDK reports an
            // error, so this never rejects.
            call.resolve()
        }
    }

    /// Reports what this build's purchase stack actually looks like: whether the
    /// SDK configured, what kind of API key it was given, and whether an offering
    /// can be fetched right now. Feeds Settings → Diagnostics so a TestFlight
    /// build can be triaged from the device, without Xcode or a console log.
    ///
    /// Deliberately never rejects — a diagnostics screen that fails to load is
    /// the one thing worse than no diagnostics screen.
    @objc func getDiagnostics(_ call: CAPPluginCall) {
        var result: [String: Any] = [
            "configured": RevenueCatConfig.isConfigured,
            "keyPrefix": RevenueCatConfig.keyPrefix,
            "configurationError": RevenueCatConfig.configurationError ?? "",
        ]

        guard RevenueCatConfig.isConfigured else {
            result["offeringsStatus"] = "not checked — the SDK never configured"
            call.resolve(result)
            return
        }

        result["appUserId"] = Purchases.shared.appUserID
        result["anonymous"] = Purchases.shared.isAnonymous

        Purchases.shared.getOfferings { offerings, error in
            if let error {
                result["offeringsStatus"] = "failed — \(describeRevenueCatError(error))"
            } else if let current = offerings?.current {
                result["offeringsStatus"] = "ok — offering \"\(current.identifier)\" with \(current.availablePackages.count) package(s)"
            } else {
                result["offeringsStatus"] = "no current offering is set in RevenueCat"
            }
            call.resolve(result)
        }
    }

    /// Restores previous purchases. Required by Apple — must be accessible to users.
    @objc func restorePurchases(_ call: CAPPluginCall) {
        guard requireConfigured(call) else { return }
        Purchases.shared.restorePurchases { [weak self] customerInfo, error in
            guard let self else { return }
            if let error {
                call.reject(describeRevenueCatError(error))
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
