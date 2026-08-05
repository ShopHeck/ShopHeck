import GlassSurface from './GlassSurface';
import { tint } from '../../utils/designTokens';

interface Props {
  /** e.g. "Build Strength" — what this block is for. */
  goalLabel: string;
  /** e.g. "Boxing · Lightweight". */
  subtitle: string;
  currentWeek: number;
  totalWeeks: number;
  cycle: number;
  phase?: string;
  /** `var(--token)` reference for the phase chip. */
  phaseColor?: string;
}

/**
 * The off-season Home header.
 *
 * Deliberately the same shape as <FightCountdownCard>: same min-height, padding
 * and radius, and the same content order — eyebrow, headline metric, secondary
 * line, right-aligned stat block, progress bar. A fighter moving between a camp
 * and the block after it should not feel like they changed apps, which is what
 * the previous hand-rolled gradient card did.
 *
 * What differs is the tone, and that difference is the point. Fight camp counts
 * down in flame; off-season counts *up* in teal. There is no deadline here, so
 * nothing turns crimson and nothing glows — the absence of urgency is the
 * information.
 */
export default function OffSeasonHeroCard({
  goalLabel,
  subtitle,
  currentWeek,
  totalWeeks,
  cycle,
  phase,
  phaseColor,
}: Props) {
  const pct = totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / totalWeeks) * 100)) : 0;

  return (
    <GlassSurface
      cornerRadius="lg"
      elevated
      className="mx-auto min-h-[168px] flex flex-col justify-between"
      style={{ width: 'calc(100% - var(--space-8))', padding: 'var(--space-6)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="type-caption" style={{ color: 'var(--accent-teal)' }}>
            Off Season
          </p>
          <h2 className="type-hero text-white mt-1 truncate">{goalLabel}</h2>
          <p className="type-body mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-extrabold text-white tabular-nums leading-none">
            W{currentWeek}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            of {totalWeeks}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--accent-teal)' }}>
            Cycle {cycle}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {phase && (
          <span
            className="badge border flex-shrink-0"
            style={{
              color: phaseColor ?? 'var(--accent-teal)',
              backgroundColor: tint(phaseColor ?? 'var(--accent-teal)', 0.14),
              borderColor: tint(phaseColor ?? 'var(--accent-teal)', 0.35),
            }}
          >
            {phase}
          </span>
        )}
        <div
          className="flex-1 h-2 overflow-hidden"
          style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Block progress: week ${currentWeek} of ${totalWeeks}, ${pct} percent complete`}
        >
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-teal))',
            }}
          />
        </div>
        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {pct}%
        </span>
      </div>
    </GlassSurface>
  );
}
