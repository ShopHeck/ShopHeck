import { useApp } from '../../context/AppContext';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import { getCurrentWeekNumber } from '../../utils/campGenerator';
import { weekAdherence } from '../../utils/adherence';
import { toDisplayWeight } from '../../utils/units';
import GlassMetricTile from './GlassMetricTile';
import type { HomeMode } from '../../utils/homeLayout';

interface Props {
  mode: HomeMode;
  onNavigate: (view: 'weight' | 'log' | 'planner') => void;
}

/**
 * The three numbers Home is actually for, in one row.
 *
 * This replaces four separate blocks that between them said the same things
 * more than once: a three-tile strip of lifetime totals, a "This Week" card, a
 * "Weight Status" card, and the week counter already inside the countdown
 * header. "Sessions" appeared twice meaning two different things — 34 all camp
 * in the tiles, 4 of 6 this week just below — which is worse than either number
 * alone.
 *
 * Everything here is *this week* or *right now*, because that is what a
 * fighter can still change. Lifetime totals moved to Progress, where a number
 * you cannot act on today belongs.
 */
export default function CampPulse({ mode, onNavigate }: Props) {
  const { state } = useApp();
  const unit = useWeightUnit();
  const { activeCamp, trainingSchedule, workoutLogs, weightEntries, completedSessions } = state;
  if (!activeCamp) return null;

  const weekNum = getCurrentWeekNumber(activeCamp);
  const week = trainingSchedule[weekNum - 1];

  // Shared definition (utils/adherence.ts) rather than a local count: the
  // prefix scan this replaced also counted ticks whose session no longer
  // exists, so a shrunk week could render "7/5 sessions".
  const { done, planned } = weekAdherence(completedSessions, activeCamp.id, week);

  const weekLogs = workoutLogs.filter(l => l.campId === activeCamp.id && l.weekNumber === weekNum);
  const minutes = weekLogs.reduce((sum, l) => sum + l.duration, 0);

  const latest = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const current = latest ? latest.weight : activeCamp.currentWeight;
  const delta = parseFloat((current - activeCamp.targetWeight).toFixed(1));

  // Clamped at zero in camp mode: a fighter already under target must not see a
  // negative "to cut" figure (read as a bug, and demoralising mid-cut). An
  // off-season block can legitimately be gaining, so it shows the distance in
  // either direction instead.
  const atTarget = mode === 'camp' ? delta <= 0 : Math.abs(delta) < 0.05;
  const weightValue = atTarget
    ? '✓'
    : toDisplayWeight(Math.abs(delta), unit).toFixed(1);
  const weightLabel = atTarget
    ? 'On target'
    : mode === 'camp' ? 'To cut' : delta > 0 ? 'To lose' : 'To gain';

  return (
    <div className="mx-4 grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
      {/* No icons on these three. The label row is icon-then-caption and the
          caption is clipped to one line, so an icon costs about three
          characters — enough that "This week" rendered as "THIS WE…". The
          numbers are the whole point of the row; a decorative glyph is not
          worth truncating the word that says what the number means. */}
      <GlassMetricTile
        label="This week"
        value={planned > 0
          ? <>{done}<span className="text-base font-semibold text-gray-450">/{planned}</span></>
          : done}
        valueLabel={planned > 0 ? `${done} of ${planned} sessions done` : `${done} sessions done`}
        onClick={() => onNavigate('planner')}
      />
      <GlassMetricTile
        label={weightLabel}
        value={weightValue}
        valueLabel={atTarget ? 'on target' : `${weightValue} ${unit}`}
        onClick={() => onNavigate('weight')}
      />
      <GlassMetricTile
        label="Minutes"
        value={minutes || '—'}
        valueLabel={minutes ? `${minutes} minutes trained` : 'none logged yet'}
        onClick={() => onNavigate('log')}
      />
    </div>
  );
}
