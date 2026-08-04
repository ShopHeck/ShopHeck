import WidgetKit
import SwiftUI

/// The round-timer Live Activity — Lock Screen banner + Dynamic Island.
///
/// The widget renders the countdown ITSELF via `Text(timerInterval:)`,
/// derived from the absolute wall-clock segments the app pushed. When the
/// app is backgrounded its JS thread is suspended and can no longer tick,
/// but this view keeps counting against `Date()` — that is the whole point
/// of the Live Activity. The app re-pushes segments on every transition it
/// observes, so what the island shows can lag the app by at most one
/// phase change.
struct TimerLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerActivityAttributes.self) { context in
            LockScreenTimerView(state: context.state)
                .activityBackgroundTint(Color(red: 0.04, green: 0.04, blue: 0.04))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(phaseLabel(context.state))
                            .font(.caption2.weight(.heavy))
                            .foregroundStyle(phaseColor(context.state))
                        Text(context.state.presetLabel)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    countdownText(context.state)
                        .font(.system(size: 34, weight: .black, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(phaseColor(context.state))
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("R \(context.state.round)/\(context.state.rounds)")
                        .font(.caption.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Text("R\(context.state.round)")
                    .font(.caption2.weight(.heavy))
                    .foregroundStyle(phaseColor(context.state))
            } compactTrailing: {
                countdownText(context.state)
                    .font(.caption.weight(.heavy))
                    .monospacedDigit()
                    .foregroundStyle(phaseColor(context.state))
            } minimal: {
                countdownText(context.state)
                    .font(.caption2.weight(.heavy))
                    .monospacedDigit()
                    .foregroundStyle(phaseColor(context.state))
            }
        }
    }
}

// ─── Shared rendering ──────────────────────────────────────────────────────

/// The segment currently on the clock: the first one whose end is still in
/// the future. When every segment has elapsed (the app died before it could
/// end the activity) the last segment renders with a "Done" label.
private func currentSegment(_ state: TimerActivityAttributes.ContentState) -> TimerActivityAttributes.ContentState.Segment? {
    let nowMs = Date().timeIntervalSince1970 * 1000
    return state.segments.first { $0.endMs > nowMs } ?? state.segments.last
}

private func phaseLabel(_ state: TimerActivityAttributes.ContentState) -> String {
    if state.isPaused { return "PAUSED" }
    guard let seg = currentSegment(state) else { return "DONE" }
    switch seg.kind {
    case "prep": return "GET READY"
    case "rest": return "REST"
    default:     return "WORK"
    }
}

private func phaseColor(_ state: TimerActivityAttributes.ContentState) -> Color {
    if state.isPaused { return .yellow }
    guard let seg = currentSegment(state) else { return .green }
    switch seg.kind {
    case "prep": return .yellow
    case "rest": return hexColor(state.restColorHex)
    default:     return hexColor(state.workColorHex)
    }
}

/// The live countdown. SwiftUI's timerInterval text counts down against the
/// wall clock on its own — no updates from the app required. A paused
/// session renders the frozen remainder as plain text instead.
private func countdownText(_ state: TimerActivityAttributes.ContentState) -> Text {
    if state.isPaused {
        return Text(formatSeconds(state.pausedRemainingSec))
    }
    guard let seg = currentSegment(state) else {
        return Text("✓")
    }
    let start = Date(timeIntervalSince1970: seg.startMs / 1000)
    let end = Date(timeIntervalSince1970: seg.endMs / 1000)
    return Text(timerInterval: start...end, countsDown: true)
}

private func formatSeconds(_ s: Int) -> String {
    let clamped = max(0, s)
    return String(format: "%d:%02d", clamped / 60, clamped % 60)
}

/// #RRGGBB → Color. Falls back to sensible defaults so a malformed hex can
/// never blank the activity.
private func hexColor(_ hex: String) -> Color {
    var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return .orange }
    return Color(
        red: Double((v >> 16) & 0xFF) / 255,
        green: Double((v >> 8) & 0xFF) / 255,
        blue: Double(v & 0xFF) / 255
    )
}

// ─── Lock Screen banner ────────────────────────────────────────────────────

private struct LockScreenTimerView: View {
    let state: TimerActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(phaseLabel(state))
                    .font(.footnote.weight(.heavy))
                    .foregroundStyle(phaseColor(state))
                Text(state.presetLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            countdownText(state)
                .font(.system(size: 40, weight: .black, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(phaseColor(state))

            Spacer()

            Text("Round\n\(state.round)/\(state.rounds)")
                .font(.caption.weight(.bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

@main
struct TimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        TimerLiveActivityWidget()
    }
}
