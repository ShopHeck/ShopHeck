import type { ReactNode } from 'react';
import GlassSurface from './GlassSurface';
import type { TileState } from './GlassMetricTile';

interface Props {
  daysOut: number;
  /** Formatted fight date, or a "TBD" string. */
  dateLine: string;
  opponent?: string;
  /** Right-aligned fight-format block. */
  rounds: number;
  roundMinutes: number;
  weightClass: string;
  currentWeek: number;
  totalWeeks: number;
  progressPct: number;
  state?: TileState;
  onRetry?: () => void;
}

/** §3.4: the numeral goes crimson and the card takes Level 3 elevation. */
const CRIMSON_THRESHOLD_DAYS = 7;

/**
 * The Home countdown module (§3.4).
 *
 * Dimensions locked so no two instances drift: min-height 168px, padding
 * var(--space-6), radius lg, width calc(100% - var(--space-8)) centered.
 *
 * Content order is fixed and deliberately does NOT include a sparkline or a
 * CTA button. Both appeared in earlier revisions of the spec and neither exists
 * on the real card — a fighter opening the app wants the number and the format,
 * not a chart of it and somewhere else to go.
 *
 * Inside fight week the numeral turns crimson and the card takes the accent
 * glow. That is the only state change; the layout does not move, because a card
 * that reflows in the last week is a card a fighter has to re-read.
 */
export default function FightCountdownCard({
  daysOut,
  dateLine,
  opponent,
  rounds,
  roundMinutes,
  weightClass,
  currentWeek,
  totalWeeks,
  progressPct,
  state = 'populated',
  onRetry,
}: Props) {
  const critical = daysOut <= CRIMSON_THRESHOLD_DAYS;
  const pct = Math.max(0, Math.min(100, progressPct));

  const shell = (children: ReactNode) => (
    <GlassSurface
      cornerRadius="lg"
      elevated
      accentGlow={critical && state === 'populated' ? 'rgb(var(--accent-crimson-rgb) / 0.4)' : undefined}
      className="mx-auto min-h-[168px] flex flex-col justify-between"
      style={{
        width: 'calc(100% - var(--space-8))',
        padding: 'var(--space-6)',
      }}
    >
      {children}
    </GlassSurface>
  );

  if (state === 'loading') {
    return shell(
      <div aria-label="Fight countdown loading">
        <div className="skeleton h-3 w-24" aria-hidden="true" />
        <div className="skeleton h-12 w-40 mt-3" aria-hidden="true" />
        <div className="skeleton h-3 w-52 mt-3" aria-hidden="true" />
        <div className="skeleton h-2 w-full mt-6" aria-hidden="true" />
      </div>,
    );
  }

  if (state === 'empty') {
    return shell(
      <div>
        <p className="type-caption text-gray-450">Fight Night</p>
        <p className="type-body text-gray-450 mt-3">No fight date set yet.</p>
      </div>,
    );
  }

  if (state === 'error') {
    return shell(
      <div>
        <p className="type-caption text-gray-450">Fight Night</p>
        <button
          onClick={onRetry}
          className="type-body mt-3 font-semibold"
          style={{ color: 'var(--accent-flame)' }}
        >
          Couldn't load your camp — retry
        </button>
      </div>,
    );
  }

  return shell(
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="type-caption" style={{ color: 'var(--accent-flame)' }}>
            Fight Night
          </p>

          <div className="flex items-baseline gap-2 mt-1">
            <span
              className="type-metric"
              style={{ color: critical ? 'var(--accent-crimson)' : 'var(--text-primary)' }}
            >
              {daysOut}
            </span>
            <span className="type-body font-medium" style={{ color: 'var(--text-secondary)' }}>
              days out
            </span>
          </div>

          <p className="type-body mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
            {dateLine}
            {opponent && ` · vs ${opponent}`}
          </p>
        </div>

        {/* Fight format — right-aligned secondary stat block. */}
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-extrabold text-white tabular-nums leading-none">
            {rounds}R
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {roundMinutes}min rounds
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--accent-flame)' }}>
            {weightClass}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
          <span>
            Week {currentWeek} of {totalWeeks}
          </span>
          <span className="tabular-nums">{pct}% complete</span>
        </div>
        <div
          className="h-2 overflow-hidden"
          style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Camp progress: week ${currentWeek} of ${totalWeeks}, ${pct} percent complete`}
        >
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(90deg, var(--accent-crimson), var(--accent-flame))',
            }}
          />
        </div>
      </div>
    </>,
  );
}
