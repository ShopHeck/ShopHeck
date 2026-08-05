import SwiftUI

/// The wrist face: phase, clock, round, heart rate.
///
/// Sized for a glance mid-round with gloves on, so the countdown dominates and
/// everything else is secondary. No scrolling, no navigation — a fighter is not
/// going to swipe through a watch app between combinations.
struct RoundTimerView: View {
    @ObservedObject var model: TimerModel

    private var phaseColor: Color {
        switch model.snapshot.phase {
        case .work: return .green
        case .rest: return .red
        case .prep: return .yellow
        case .done: return .green
        case .idle: return .gray
        }
    }

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 4) {
                Text(model.snapshot.phase.label)
                    .font(.system(size: 13, weight: .black))
                    .foregroundStyle(phaseColor)
                if let round = model.snapshot.phase.round {
                    Text("\(round)/\(model.snapshot.totalRounds)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            }

            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.25), lineWidth: 6)
                // Depletes through the phase — the one glance that says "how
                // much longer" without reading digits.
                Circle()
                    .trim(from: 0, to: 1 - model.snapshot.progress)
                    .stroke(phaseColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                Text(formatClock(model.snapshot.remaining))
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .padding(.horizontal, 4)

            HStack(spacing: 10) {
                if let bpm = model.bpm {
                    Label("\(bpm)", systemImage: "heart.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.red)
                } else {
                    // Named rather than blank: a fighter who sees nothing
                    // assumes the feature is broken, not that the sensor has
                    // not produced its first sample yet.
                    Label("—", systemImage: "heart")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.secondary)
                }

                Button {
                    model.isRunning ? model.pause() : model.start()
                } label: {
                    Image(systemName: model.isRunning ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .bold))
                }
                .buttonStyle(.borderedProminent)
                .tint(model.isRunning ? .orange : .green)

                Button {
                    model.reset()
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 13, weight: .bold))
                }
                .buttonStyle(.bordered)
            }
            .padding(.top, 2)
        }
        .padding(.horizontal, 6)
    }
}
