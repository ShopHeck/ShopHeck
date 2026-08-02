import UIKit
import Capacitor
import AVFoundation
import RevenueCat

/// The storyboard instantiates this controller instead of the stock
/// CAPBridgeViewController. Capacitor only auto-registers plugins listed in the
/// generated capacitor.config.json packageClassList, which `cap sync` builds
/// from npm-installed plugin packages — plugins living in the app target itself
/// (RevenueCat, HealthKit) are never included, so they must be registered here.
/// Without this, every JS call to them rejects with "not implemented": the
/// paywall never opens, which is exactly the v1.0 build 19 2.1(b) rejection.
/// (Lives in this file rather than its own so the Xcode project file needs no
/// hand-edited source entry.)
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RevenueCatPlugin())
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(AppReviewPlugin())
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // RevenueCat key is injected per build configuration via the REVENUECAT_API_KEY
        // build setting (Debug: test key in project.pbxproj; Release: CI secret via xcargs).
        // The app crashes immediately at launch if the release build is missing a real key
        // so a broken key can never reach users silently.
        guard let revenueCatKey = Bundle.main.infoDictionary?["RevenueCatAPIKey"] as? String,
              !revenueCatKey.isEmpty else {
            preconditionFailure("[FightCamp] RevenueCatAPIKey missing from Info.plist — set REVENUECAT_API_KEY in the build settings or CI xcargs")
        }
        Purchases.configure(withAPIKey: revenueCatKey)

        // Configure the audio session so that timer bells and coaching voice duck
        // (fade) background music rather than interrupting it entirely, and music
        // resumes at full volume once the audio session becomes inactive between sounds.
        //
        // .duckOthers  — lowers other apps' volume to ~20% when we play audio
        // .mixWithOthers — lets our audio co-exist; iOS handles the fade automatically
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                options: [.duckOthers, .mixWithOthers]
            )
        } catch {
            // Non-fatal — timer still works, just no ducking behaviour
            print("[FightCamp] AVAudioSession category config failed: \(error)")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
