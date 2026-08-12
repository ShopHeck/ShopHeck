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
 * Two things changed beyond the restructure. It now carries the readiness
 * gauge: `computeReadiness` never needed a *fight*, only an active camp, and
 * an off-season block is one, so the score was simply never being shown to the
 * people training without a bout booked. And the standalone "Training Streak"
 * card is gone — `ProgressWidget` directly above it already showed the same
 * streak, about a hundred pixels apart.
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
