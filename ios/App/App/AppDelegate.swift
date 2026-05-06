import UIKit
import Capacitor
import AVFoundation
import RevenueCat

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // RevenueCat — must be configured before any purchase calls.
        // TODO: Replace with your production Apple public SDK key (starts with "appl_")
        // from app.revenuecat.com → Project Settings → API Keys before App Store submission.
        // The current key is the one provided during development; verify it matches your
        // live iOS app key in the RevenueCat dashboard.
        #warning("Verify this is your production RevenueCat Apple SDK key before App Store submission")
        Purchases.configure(withAPIKey: "test_mBilIsHfjVigPCEOYsqCIXnASUg")

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
