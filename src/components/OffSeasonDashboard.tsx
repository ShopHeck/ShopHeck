import { useApp } from '../context/AppContext';
import { getCurrentWeekNumber, getCurrentOffSeasonCycle } from '../utils/campGenerator';
import { phaseColor } from '../utils/designTokens';
import OffSeasonHeroCard from './shared/OffSeasonHeroCard';
import TodayCard from './shared/TodayCard';
import CampPulse from './shared/CampPulse';
import HomeCards from './shared/HomeCards';
import PinnedTools from './shared/PinnedTools';
import type { TimerPrefill } from '../utils/timerSession';
import type { LogPrefill } from '../App';
import type { View } from '../types';

const ACCENT = 'var(--accent-teal)';

const GOAL_LABELS: Record<string, string> = {
  'base-building': 'Base Building',
  'strength': 'Build Strength',
  'maintain': 'Maintain & Sharpen',
  'recovery': 'Active Recovery',
};

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
  onStartTimer: (prefill: TimerPrefill) => void;
}

/**
 * The off-season Home.
 *
 * Same shape as the fight-camp Home, minus the countdown and the fight-night
 * alerts — moving between a camp and the block after it should not feel like
 * changing apps.
 *
 * No readiness gauge, deliberately. `computeReadiness` does return a score for
 * an off-season block, which makes showing it look free — but `FightReadiness`
 * refuses off-season camps outright, because without a fight date the number
 * counts down to the end of the block rather than to being ready for anything.
 * A tappable score whose own breakdown says "start a fight camp to see it" is
 * worse than no score, so `showReadiness` is off here until the metric is
 * defined for a block rather than for a bout.
 *
 * The standalone "Training Streak" card is gone — `ProgressWidget` directly
 * above it already showed the same streak, about a hundred pixels apart.
 */
export default function OffSeasonDashboard({ onNavigate, onStartTimer }: Props) {
  const { state } = useApp();
  const { activeCamp, trainingSchedule, currentUser } = state;

  if (!activeCamp) return null;

  const weekNum = getCurrentWeekNumber(activeCamp);
  const week = trainingSchedule[weekNum - 1];

  return (
    <div className="space-y-4 pb-4">
      <div className="mt-4">
        <OffSeasonHeroCard
          goalLabel={GOAL_LABELS[activeCamp.offSeasonGoal ?? 'maintain'] ?? 'Off Season'}
          subtitle={[currentUser?.sport, currentUser?.weightClass].filter(Boolean).join(' · ')}
          currentWeek={weekNum}
          totalWeeks={activeCamp.campWeeks}
          cycle={getCurrentOffSeasonCycle(activeCamp) ?? 1}
          phase={week?.phase}
          phaseColor={week?.phase ? phaseColor(week.phase) : undefined}
        />
      </div>

      <TodayCard
        accent={ACCENT}
        showReadiness={false}
        onNavigate={v => onNavigate(v)}
        onLog={prefill => onNavigate('log', prefill)}
        onStartTimer={onStartTimer}
        onOpenTimer={() => onNavigate('timer')}
      />

      <CampPulse mode="offseason" onNavigate={v => onNavigate(v)} />

      <HomeCards mode="offseason" accent={ACCENT} onNavigate={(v: View) => onNavigate(v)} />
      <PinnedTools mode="offseason" accent={ACCENT} onNavigate={(v: View) => onNavigate(v)} />
    </div>
  );
}
