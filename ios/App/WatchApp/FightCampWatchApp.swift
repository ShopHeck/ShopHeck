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
        }
    }
}
