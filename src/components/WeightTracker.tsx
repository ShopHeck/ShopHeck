import { useState } from 'react';
import { Plus, TrendingDown, Scale, AlertTriangle, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { triggerHaptic, HAPTIC } from '../hooks/useHaptics';
import { writeWeightToHealth } from '../utils/healthSync';
import { maybeRequestReview } from '../utils/appReview';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { toDisplayWeight, formatWeight, formatWeightDelta } from '../utils/units';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import ConfirmDialog from './shared/ConfirmDialog';
import Modal from './shared/Modal';
import ProGate from './shared/ProGate';
import PaceStatusCard from './shared/PaceStatusCard';
import GlassMetricTile from './shared/GlassMetricTile';
import { PACE_COLORS, type PaceTier } from '../utils/designTokens';
import CutCoach from './CutCoach';
import { computeCutProjection, idealWeightAt } from '../utils/weightCut';
import { parseWeightInput, weightRangeHint } from '../utils/validation';
import { todayISO, isFutureISODate } from '../utils/dates';

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { date: string } }>;
  /** Chart values are pre-converted to the display unit; this labels them. */
  unit?: string;
}

function CustomTooltip({ active, payload, unit = 'lbs' }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark-700 border border-dark-400 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400">{payload[0].payload.date}</p>
        <p className="text-white font-bold">{payload[0].value} {unit}</p>
      </div>
    );
  }
  return null;
}

export default function WeightTracker() {
  const { state, dispatch } = useApp();
  const { activeCamp, weightEntries, currentUser } = state;
  const unit = useWeightUnit();
  /** Stored lbs → display number in the user's unit (chart/stat shorthand). */
  const d = (lbs: number) => toDisplayWeight(lbs, unit);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  if (!activeCamp) return null;

  const campEntries = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const latestEntry = campEntries[campEntries.length - 1];
  const currentW = latestEntry ? latestEntry.weight : activeCamp.currentWeight;
  const targetW = activeCamp.targetWeight;
  const startW = activeCamp.currentWeight;
  const toGo = currentW - targetW;
  const totalCut = startW - targetW;
  const cutProgress = totalCut > 0 ? Math.min(100, Math.max(0, ((startW - currentW) / totalCut) * 100)) : 100;
  /**
   * Whether this camp actually has a cut to report on. Off-season camps leave
   * both weight fields blank (they're optional there), which left every cut
   * stat reading off zeroes.
   */
  const hasCutTarget = targetW > 0 && startW > 0;

  // null when the camp has no fight date (off-season) — parseISO('') is an
  // Invalid Date and would turn every downstream stat into NaN.
  // Calendar days (not rolling 24h periods) so the countdown matches the cut
  // projection and every other screen — otherwise it under-reports by ~1 day
  // for most of the day.
  const daysUntilFight = activeCamp.fightDate
    ? differenceInCalendarDays(parseISO(activeCamp.fightDate), new Date())
    : null;

  // Cut pace projection — on pace / ahead / behind + projected weigh-in.
  const proj = computeCutProjection(activeCamp, weightEntries);
  const paceLabel = {
    ahead: 'Ahead of pace',
    'on-pace': 'On pace',
    behind: 'Behind pace',
    made: 'On weight ✓',
    'no-fight': 'Tracking',
  }[proj.status];

  // Build chart data: include camp start, all entries, target, and the ideal
  // "pace" line a steady cut would follow. Values are converted to the display
  // unit here so the axis, lines and tooltip all speak the user's unit.
  const chartData = (() => {
    const data: { date: string; weight: number; target: number; pace: number }[] = [];

    // Add a start point
    data.push({
      date: format(parseISO(activeCamp.startDate), 'MMM d'),
      weight: d(activeCamp.currentWeight),
      target: d(activeCamp.targetWeight),
      pace: d(idealWeightAt(activeCamp, parseISO(activeCamp.startDate))),
    });

    campEntries.forEach(e => {
      data.push({
        date: format(parseISO(e.date), 'MMM d'),
        weight: d(e.weight),
        target: d(activeCamp.targetWeight),
        pace: d(idealWeightAt(activeCamp, parseISO(e.date))),
      });
    });

    return data;
  })();


  const weightTrend = campEntries.length >= 2
    ? campEntries[campEntries.length - 1].weight - campEntries[campEntries.length - 2].weight
    : 0;

  // A weigh-in feeds the cut projection, the chart and the unsafe-cut alert, so
  // it has to be a real bodyweight. Typed in the display unit, stored in lbs.
  const parsedWeight = parseWeightInput(weight, unit);

  function logWeight() {
    // A weigh-in is a record of a real measurement. A future date would become
    // the "latest weight" and skew the cut projection and the unsafe-cut alert.
    if (parsedWeight === null || isFutureISODate(date)) return;
    triggerHaptic(HAPTIC.sessionComplete);
    // P0-4 earned moment: the rating ask fires only when THIS weigh-in takes
    // the cut from not-made to made — never on merely opening the tab with an
    // already-at-target camp, which would burn the 120-day throttle on a
    // routine visit.
    const wasMade = computeCutProjection(activeCamp!, weightEntries).status === 'made';
    const entry = { id: 'pending', campId: activeCamp!.id, date, weight: parsedWeight, notes, createdAt: new Date().toISOString() };
    const nowMade = computeCutProjection(activeCamp!, [...weightEntries, entry]).status === 'made';
    if (!wasMade && nowMade) void maybeRequestReview('made_weight');
    dispatch({
      type: 'LOG_WEIGHT',
      payload: {
        campId: activeCamp!.id,
        date,
        weight: parsedWeight,
        notes,
      },
    });
    void writeWeightToHealth({ date, weight: parsedWeight });
    setWeight('');
    setNotes('');
    setShowModal(false);
  }

  // Flag the hard "concern" on the RATE required, not just absolute lbs — an 8-lb
  // cut in 4 days (2 lb/day) is dangerous even though it's under 10 lbs. proj
  // .lbsPerDayNeeded is calendar-day based and collapses to the raw remaining lbs
  // on weigh-in day, which is correctly treated as urgent. The old absolute-lbs
  // trigger is kept as a fallback so nothing that used to warn stops warning.
  const cutRatePerDay = proj.trackable && proj.status !== 'made' ? proj.lbsPerDayNeeded : null;
  const isDangerousRate = cutRatePerDay !== null && cutRatePerDay >= 1.5;
  const isCritical =
    (cutRatePerDay !== null && cutRatePerDay >= 1) ||
    (daysUntilFight !== null && toGo > 10 && daysUntilFight < 14);

  // The domain has five projection states; the design system has three pace
  // tiers (§2.6). This is the one place the two are reconciled, so the header
  // chip and the pace card cannot disagree — they used to, and a fighter could
  // see a green dot next to a yellow "Behind pace" on the same screen.
  //
  // `on-pace` maps to `ahead`: the tier answers "is anything wrong", and on
  // pace means nothing is. Only a genuinely unsafe rate reaches `critical`,
  // which is what keeps crimson meaningful — most camps spend weeks merely
  // behind, and a red screen for weeks is a red screen nobody reads.
  const cutTier: PaceTier = isCritical
    ? 'critical'
    : proj.status === 'behind'
      ? 'behind'
      : 'ahead';
  const cutChipColor = PACE_COLORS[cutTier];

  return (
    <div className="space-y-4 pb-4">
      {/* Header Stats — a camp with no target weight (the off-season default,
          where both weight fields are optional) has no cut to report on. It
          used to render "0 current · ✓ lbs to cut · 100% cut done · 0 → 0 lbs",
          which reads as a completed cut that never existed. */}
      {hasCutTarget ? (
        <div className="mx-4 mt-4 grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
          {/* The weigh-in-to-weigh-in delta used to live as a badge on the cut
              progress card, which <PaceStatusCard> replaced. It belongs on the
              current-weight tile anyway — it is a property of that number.
              goodDirection="down" because on this screen losing is progress,
              which is the whole reason the tile takes that prop. */}
          <GlassMetricTile
            label="Weight"
            value={d(currentW)}
            icon={<Scale size={13} style={{ color: 'var(--accent-blue)' }} />}
            trend={
              weightTrend !== 0
                ? {
                    value: toDisplayWeight(Math.abs(weightTrend), unit).toFixed(1),
                    direction: weightTrend < 0 ? 'down' : 'up',
                  }
                : undefined
            }
            goodDirection="down"
          />
          <GlassMetricTile
            label="To cut"
            value={toGo > 0 ? d(toGo).toFixed(1) : '✓'}
            icon={<TrendingDown size={13} style={{ color: 'var(--accent-flame)' }} />}
          />
          <GlassMetricTile
            label="Done"
            value={<span style={{ color: cutChipColor }}>{Math.round(cutProgress)}%</span>}
            icon={
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: cutChipColor }}
              />
            }
          />
        </div>
      ) : (
        <div className="mx-4 mt-4 card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Scale size={22} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-black text-white">
              {latestEntry ? formatWeight(currentW, unit) : 'No weigh-ins yet'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {latestEntry
                ? `Last weigh-in ${format(parseISO(latestEntry.date), 'MMM d')} · set a goal weight in Settings to track a cut`
                : 'Log your bodyweight to start a trend. Set a goal weight in Settings to track a cut.'}
            </p>
          </div>
        </div>
      )}

      {/* Alert if critical */}
      {isCritical && (
        <div className="mx-4 bg-red-900/30 border border-red-800 rounded-xl p-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-300">Weight Cut Concern</p>
            <p className="text-xs text-red-400/80 mt-0.5">
              {isDangerousRate
                ? `Making weight would take about ${d(cutRatePerDay!).toFixed(1)} ${unit}/day — an unsafe pace. Talk to your coach before cutting further.`
                : `You have ${formatWeightDelta(toGo, unit)} to cut with ${daysUntilFight ?? 0} days until fight${cutRatePerDay !== null ? ` (~${d(cutRatePerDay).toFixed(1)} ${unit}/day)` : ''}. Consult your coach.`}
            </p>
          </div>
        </div>
      )}

      {/* Cut progress + pace, one card (§3.5).
          These were two stacked cards — a progress bar in one, the pace verdict
          and its stat pair in the other — which put the bar and the judgement
          about the bar on separate surfaces. <PaceStatusCard> is the shape the
          design system defines for exactly this pattern, and the caution tier
          is the substantive change: "behind pace" is now gold, distinct from
          the crimson that means the cut is genuinely in trouble. */}
      {hasCutTarget && (
        <div className="mx-4">
          <PaceStatusCard
            eyebrow="Weight Cut"
            tier={cutTier}
            statusLabel={paceLabel}
            progressPct={cutProgress}
            from={`Start: ${formatWeight(startW, unit)}`}
            to={`Target: ${formatWeight(targetW, unit)}`}
            headline={
              proj.trackable && proj.status !== 'made'
                ? {
                    label: 'Projected',
                    value: proj.trendEstablished ? `${d(proj.projectedWeighIn)} ${unit}` : '—',
                  }
                : undefined
            }
            stats={
              proj.trackable && proj.status !== 'made'
                ? [
                    { label: 'Need / day', value: `${d(proj.lbsPerDayNeeded)} ${unit}` },
                    {
                      label: 'Avg so far / day',
                      value: proj.trendEstablished ? `${d(proj.lbsPerDayActual)} ${unit}` : '—',
                    },
                  ]
                : undefined
            }
          />

          {proj.trackable && proj.status !== 'made' && (
            <p className="text-xs text-gray-400 mt-2.5 px-1">
              {!proj.trendEstablished
                ? 'Log weigh-ins on a few different days and your projected weigh-in weight will appear here.'
                : proj.projectedMiss > 0
                ? `At your recent rate you'll be ~${formatWeightDelta(proj.projectedMiss, unit)} over on fight day (${proj.daysRemaining} days out).`
                : proj.daysEarlyAtRate !== null && proj.daysEarlyAtRate > 0
                ? `At your recent rate you'd be on weight about ${proj.daysEarlyAtRate} day${proj.daysEarlyAtRate === 1 ? '' : 's'} before weigh-in.`
                : 'At your recent rate you make weight right on schedule.'}
            </p>
          )}
        </div>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weight Over Camp</p>
          <div role="img" aria-label={`Line chart of weigh-ins across the camp, from ${formatWeight(startW, unit)} to ${formatWeight(currentW, unit)}, against a target of ${formatWeight(targetW, unit)} and the steady-cut pace line.`} className="card p-2">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-2)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[Math.min(d(targetW) - 2, d(currentW) - 2), Math.max(d(startW) + 2, d(currentW) + 2)]}
                  tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                {/* §3.5: target line is 1px dashed flame with an inline label
                    rather than a legend; the data line is 2px in the metric's
                    own color (blue for weight) with 4px point markers.
                    Recharts passes these straight through to SVG, so token
                    references resolve — no hex needed at the call site. */}
                <ReferenceLine
                  y={d(targetW)}
                  stroke="var(--accent-flame)"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{ value: 'Target', fill: 'var(--accent-flame)', fontSize: 10 }}
                />
                {activeCamp.fightDate && (
                  <Line
                    type="monotone"
                    dataKey="pace"
                    stroke="var(--text-tertiary)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--accent-blue)"
                  strokeWidth={2.5}
                  dot={{ fill: 'var(--accent-blue)', strokeWidth: 0, r: 4 }}
                  activeDot={{ r: 6, fill: 'var(--text-primary)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AI Cut Coach — Fighter Pro */}
      {activeCamp.fightDate && proj.status !== 'made' && (
        <div className="mx-4">
          <ProGate required="fighter_pro">
            <CutCoach camp={activeCamp} user={currentUser} proj={proj} entries={weightEntries} />
          </ProGate>
        </div>
      )}

      {/* Log Weight Button */}
      <div className="mx-4">
        <button onClick={() => setShowModal(true)} className="btn-primary w-full flex items-center justify-center gap-2">
          <Plus size={18} /> Log Weight
        </button>
      </div>

      {/* History */}
      {campEntries.length > 0 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Weight Log</p>
          <div className="space-y-2">
            {[...campEntries].reverse().map((entry, i) => {
              const prev = [...campEntries].reverse()[i + 1];
              const change = prev ? entry.weight - prev.weight : null;
              return (
                <div key={entry.id} className="card flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{formatWeight(entry.weight, unit)}</p>
                    <p className="text-xs text-gray-400">{format(parseISO(entry.date), 'EEEE, MMM d')}</p>
                    {entry.notes && <p className="text-xs text-gray-450 italic mt-0.5">{entry.notes}</p>}
                  </div>
                  <div className="text-right">
                    {change !== null && (
                      <span className={`badge text-xs ${change < 0 ? 'bg-green-900/40 text-green-400' : change > 0 ? 'bg-red-900/40 text-red-400' : 'bg-dark-500 text-gray-400'}`}>
                        {change > 0 ? '+' : ''}{formatWeightDelta(change, unit)}
                      </span>
                    )}
                    {hasCutTarget && <p className="text-xs text-gray-450 mt-1">{d(entry.weight - targetW).toFixed(1)} to go</p>}
                  </div>
                  <button
                    onClick={() => setDeleteConfirmId(entry.id)}
                    aria-label={`Delete weigh-in: ${formatWeight(entry.weight, unit)} on ${format(parseISO(entry.date), 'MMM d')}`}
                    className="text-gray-450 hover:text-red-400 transition-colors -m-2 p-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log Weight Modal */}
      {showModal && (
        <Modal
          title="Log Weight"
          onClose={() => setShowModal(false)}
          footer={
            <button onClick={logWeight} disabled={parsedWeight === null || isFutureISODate(date)} className="btn-primary w-full disabled:opacity-50">
              Save Weight
            </button>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block">
                <span className="label">Date</span>
                <input className="input" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="label">Weight ({unit}) *</span>
                <input
                className="input text-2xl font-bold"
                type="number"
                step="0.1"
                placeholder={unit === 'kg' ? 'e.g. 71.9' : 'e.g. 158.5'}
                value={weight}
                onChange={e => setWeight(e.target.value)}
              />
              </label>
            </div>
            {weight && parsedWeight === null && (
              <div className="rounded-xl p-3 border bg-red-900/25 border-red-800">
                <p className="text-sm font-medium text-red-300">{weightRangeHint(unit)}</p>
              </div>
            )}
            {parsedWeight !== null && (
              <div className={`rounded-xl p-3 border ${parsedWeight <= targetW ? 'bg-green-900/30 border-green-700' : 'bg-dark-600 border-dark-400'}`}>
                <p className={`text-sm font-medium ${parsedWeight <= targetW ? 'text-green-400' : 'text-gray-300'}`}>
                  {parsedWeight <= targetW
                    ? '✓ At or below fight weight!'
                    : `${formatWeightDelta(parsedWeight - targetW, unit)} above target (${formatWeight(targetW, unit)})`
                  }
                </p>
              </div>
            )}
            <div>
              <label className="block">
                <span className="label">Notes (optional)</span>
                <textarea
                className="input resize-none"
                rows={2}
                placeholder="Morning weight, after workout, etc."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
              </label>
            </div>
          </div>
        </Modal>
      )}

      {deleteConfirmId && (
        <ConfirmDialog
          danger
          title="Delete Weight Entry?"
          message="This weight entry will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={() => { dispatch({ type: 'DELETE_WEIGHT', payload: deleteConfirmId }); setDeleteConfirmId(null); }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
}
