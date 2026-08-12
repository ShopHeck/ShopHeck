import { useApp } from '../../context/AppContext';
import { useWeightUnit } from '../../hooks/useWeightUnit';
import { toDisplayWeight, formatWeight, formatWeightDelta } from '../../utils/units';
import GlassSurface from './GlassSurface';

interface Props {
  accent: string;
  onOpen: () => void;
}

/**
 * Start → current → target, as one bar.
 *
 * One component for both Homes. They shipped two: the fight-camp version drew
 * a blue gradient and framed everything as a cut, the off-season version used
 * the mode accent and handled gaining as well as losing. Only the second was
 * correct for an off-season block trying to put weight on, so that is the one
 * that survived, with the accent as a prop.
 */
export default function WeightStatusCard({ accent, onOpen }: Props) {
  const { state } = useApp();
  const unit = useWeightUnit();
  const { activeCamp, weightEntries } = state;
  if (!activeCamp) return null;

  const latest = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const start = activeCamp.currentWeight;
  const current = latest ? latest.weight : start;
  const target = activeCamp.targetWeight;
  const delta = parseFloat((current - target).toFixed(1));
  const atGoal = Math.abs(delta) < 0.05;

  // No cut configured (start === target) → the bar is trivially full rather
  // than NaN% wide from a 0/0 division.
  const pct = start !== target
    ? Math.max(0, Math.min(100, ((start - current) / (start - target)) * 100))
    : 100;

  return (
    <div className="mx-4">
      <div className="flex items-center justify-between mb-2">
        <p className="type-caption text-gray-450">Weight Status</p>
        <button
          onClick={onOpen}
          className="text-xs font-semibold -m-2 p-2"
          style={{ color: accent }}
        >
          Track
        </button>
      </div>
      <GlassSurface cornerRadius="md" className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-center flex-shrink-0">
            <div className="text-2xl font-extrabold text-white tabular-nums">
              {toDisplayWeight(current, unit)}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>current</div>
          </div>

          <div className="flex-1 px-2 min-w-0">
            {atGoal ? (
              <p className="text-center text-xs font-semibold" style={{ color: accent }}>
                At goal weight
              </p>
            ) : (
              <>
                <div
                  className="h-2 overflow-hidden"
                  style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Weight progress: ${Math.round(pct)} percent of the way from ${formatWeight(start, unit)} to ${formatWeight(target, unit)}`}
                >
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      borderRadius: 'var(--radius-full)',
                      background: accent,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-450 mt-1 tabular-nums">
                  <span>{formatWeight(start, unit)}</span>
                  <span>{formatWeight(target, unit)}</span>
                </div>
              </>
            )}
          </div>

          <div className="text-center flex-shrink-0">
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: accent }}>
              {toDisplayWeight(target, unit)}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>target</div>
          </div>
        </div>

        {!atGoal && (
          <p className="text-center text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
            {formatWeightDelta(Math.abs(delta), unit)} {delta > 0 ? 'to lose' : 'to gain'}
          </p>
        )}
      </GlassSurface>
    </div>
  );
}
