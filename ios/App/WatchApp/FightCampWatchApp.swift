import SwiftUI

/// The Fight Camp watch app.
///
/// Standalone by design: it starts a session from its own defaults (or the last
/// one the phone pushed) without needing the phone present. A fighter who left
/// their phone in the changing room still gets a round timer and heart rate —
/// which is the whole reason to wear it.
@main
struct FightCampWatchApp: App {
    @StateObject private var model = TimerModel()

    var body: some Scene {
        WindowGroup {
            RoundTimerView(model: model)
                .onAppear {
                    // App Store screenshot mode: `scripts/watch-screenshots.mjs`
                    // launches with `-shot work` (etc.) so each capture is a
                    // frozen, marketing-ready scene without HealthKit prompts.
                    if let scene = ProcessInfo.processInfo.arguments
                        .dropFirst()
                        .first(where: { $0.hasPrefix("-shot") })
                        .flatMap({ arg -> String? in
                            if arg == "-shot",
                               let idx = ProcessInfo.processInfo.arguments.firstIndex(of: arg),
                               idx + 1 < ProcessInfo.processInfo.arguments.count {
                                return ProcessInfo.processInfo.arguments[idx + 1]
                            }
                            if arg.hasPrefix("-shot=" ) {
                                return String(arg.dropFirst("-shot=".count))
                            }
                            return nil
                        }) {
                        model.applyScreenshotScene(scene)
                    }
                }
        }
    }
}
