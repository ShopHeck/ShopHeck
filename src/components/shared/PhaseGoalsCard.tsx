import { ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getCurrentWeekNumber } from '../../utils/campGenerator';
import { PHASE_COLORS, phaseColor, tint } from '../../utils/designTokens';
import GlassSurface from './GlassSurface';

const INTENSITY_DOTS: Record<string, number> = {
  Low: 1, Medium: 2, High: 3, 'Very High': 4,
};

interface Props {
  accent: string;
  onOpenPlanner: () => void;
}

/**
 * This block's phase, focus, intensity and week goals.
 *
 * Both Homes carried a version of this — "Current Phase" on the fight-camp
 * side, "Week Goals" on the off-season side — each with its own phase→colour
 * record. Those two records disagreed about Foundation until one was fixed by
 * hand; both now read `PHASE_COLORS` from designTokens, which is also what the
 * weekly planner uses.
 */
export default function PhaseGoalsCard({ accent, onOpenPlanner }: Props) {
  const { state } = useApp();
  const { activeCamp, trainingSchedule } = state;
  if (!activeCamp) return null;

  const week = trainingSchedule[getCurrentWeekNumber(activeCamp) - 1];
  if (!week) return null;

  const dots = INTENSITY_DOTS[week.intensity] ?? 0;
  const color = phaseColor(week.phase);

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <p className="type-caption text-gray-450">Phase &amp; Goals</p>
        {week.phase && PHASE_COLORS[week.phase] && (
          <span
            className="badge border"
            style={{
              color,
              backgroundColor: tint(color, 0.14),
              borderColor: tint(color, 0.35),
            }}
          >
            {week.phase}
          </span>
        )}
      </div>

      <GlassSurface cornerRadius="md" className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium">{week.focus}</p>
            <div className="flex items-center gap-1 mt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: i < dots ? accent : 'var(--surface-3)' }}
                />
              ))}
              <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>
                {week.intensity}
              </span>
            </div>
          </div>
          <button
            onClick={onOpenPlanner}
            aria-label="Open the weekly planner"
            className="-m-2 p-2 flex-shrink-0"
            style={{ color: accent }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {week.weeklyGoals.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--surface-3)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              This week's goals
            </p>
            <div className="space-y-1.5">
              {week.weeklyGoals.slice(0, 3).map((goal, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: accent }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{goal}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
