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
                    // Round comes from the ACTIVE SEGMENT, not the snapshot:
                    // the app can't push while suspended, but the segments
                    // keep advancing the phase on their own — the label must
                    // follow them or the island shows R 1/3 during round 3.
                    Text("R \(displayedRound(context.state))/\(context.state.rounds)")
                        .font(.caption.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Text("R\(displayedRound(context.state))")
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
/// the future. nil once the WHOLE schedule has elapsed — which happens when
/// the app was suspended/killed and never got to call `end` (see
/// phaseLabel's "DONE" branch and countdownText's "✓"). Falling back to the
/// last segment here would make those completion states unreachable and pin
/// the activity on a 0:00 segment forever.
private func currentSegment(_ state: TimerActivityAttributes.ContentState) -> TimerActivityAttributes.ContentState.Segment? {
    let nowMs = Date().timeIntervalSince1970 * 1000
    return state.segments.first { $0.endMs > nowMs }
}

/// The round to display. The app cannot push updates while suspended, so the
/// snapshot-level `round` goes stale mid-session; the segments keep advancing
/// on their own and this label must follow them (R 2/3 during round 2, not
/// R 1/3). Falls back to the snapshot round when nothing is on the clock.
private func displayedRound(_ state: TimerActivityAttributes.ContentState) -> Int {
    currentSegment(state)?.round ?? state.round
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

            Text("Round\n\(displayedRound(state))/\(state.rounds)")
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
