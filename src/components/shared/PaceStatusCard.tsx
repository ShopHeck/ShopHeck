import GlassSurface from './GlassSurface';
import { PACE_COLORS, PACE_COPY, tint, type PaceTier } from '../../utils/designTokens';
import type { TileState } from './GlassMetricTile';

interface StatPair {
  label: string;
  value: string;
}

interface Props {
  /** Caption above the bar, e.g. "WEIGHT CUT". */
  eyebrow: string;
  tier: PaceTier;
  /**
   * Status wording. Required for the critical tier, which the design system
   * deliberately has no copy for (§2.6: "no confirmed copy yet — don't invent
   * one") — the domain knows whether critical means "cut is off pace" or
   * "cannot make weight", and the design system does not.
   */
  statusLabel?: string;
  /** 0–100. */
  progressPct: number;
  /** Endpoint labels under the bar, e.g. start and target weight. */
  from?: string;
  to?: string;
  /**
   * A single projected value, top-right.
   *
   * An addition to §3.5's shape rather than something it specifies. The weight
   * screen's projected weigh-in is the most consequential derived number on it
   * — the whole reason a fighter opens the screen six weeks out — and the
   * spec'd stat pair is already spoken for by Need/day and Avg-so-far. Folding
   * it into the pair would have meant dropping one of those; leaving it out
   * entirely would have been a regression dressed up as spec compliance.
   */
  headline?: { label: string; value: string };
  /** Two values side by side, e.g. "Need/day" vs "Avg so far/day". */
  stats?: [StatPair, StatPair];
  state?: TileState;
  onRetry?: () => void;
  className?: string;
}

/**
 * Progress bar + caution-tier status + stat pair (§3.5).
 *
 * The caution tier is why this component exists. A binary on-track/critical
 * split painted a fighter who is merely behind the same crimson as one who
 * cannot make weight, so the red stopped meaning anything — every camp spends
 * weeks in it. Gold at caution, crimson reserved for actually critical.
 *
 * Border and glow follow the tier, and there is deliberately no special border
 * at on-track: a card that glows when nothing is wrong trains people to ignore
 * the glow.
 */
export default function PaceStatusCard({
  eyebrow,
  tier,
  statusLabel,
  progressPct,
  from,
  to,
  stats,
  headline,
  state = 'populated',
  onRetry,
  className = '',
}: Props) {
  const color = PACE_COLORS[tier];
  const copy = statusLabel ?? PACE_COPY[tier] ?? 'Off pace';
  const pct = Math.max(0, Math.min(100, progressPct));

  if (state !== 'populated') {
    return (
      <GlassSurface cornerRadius="lg" className={className} style={{ padding: 'var(--space-5)' }}>
        <p className="type-caption text-gray-450">{eyebrow}</p>
        {state === 'loading' && (
          <>
            <div className="skeleton h-5 w-32 mt-3" aria-hidden="true" />
            <div className="skeleton h-2 w-full mt-3" aria-hidden="true" />
          </>
        )}
        {state === 'empty' && (
          <p className="type-body text-gray-450 mt-2">Not enough data yet</p>
        )}
        {state === 'error' && (
          <button
            onClick={onRetry}
            className="type-body mt-2 font-semibold"
            style={{ color: 'var(--accent-flame)' }}
          >
            Couldn't load — retry
          </button>
        )}
      </GlassSurface>
    );
  }

  return (
    <GlassSurface
      cornerRadius="lg"
      elevated
      className={className}
      style={{
        padding: 'var(--space-5)',
        // On-track gets no tier treatment at all — see the note above.
        ...(tier === 'ahead'
          ? null
          : {
              boxShadow: `inset 0 0 0 1px ${tint(color, 0.45)}, var(--shadow-2)`,
            }),
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-caption text-gray-450">{eyebrow}</p>
          <p className="type-card-title mt-0.5" style={{ color }}>
            {copy}
          </p>
        </div>
        {headline && (
          <div className="text-right flex-shrink-0">
            <p className="type-caption text-gray-450">{headline.label}</p>
            <p className="text-lg font-extrabold text-white tabular-nums mt-0.5">{headline.value}</p>
          </div>
        )}
      </div>

      <div
        className="mt-3 h-2 overflow-hidden"
        style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${eyebrow}: ${Math.round(pct)}% complete, ${copy}`}
      >
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color, borderRadius: 'var(--radius-full)' }}
        />
      </div>

      {(from || to) && (
        <div className="flex justify-between mt-1.5">
          <span className="text-xs text-gray-450 tabular-nums">{from}</span>
          <span className="text-xs text-gray-450 tabular-nums">{to}</span>
        </div>
      )}

      {/* Mini-layout, not two more cards — §3.5 is explicit that the stat pair
          sits inside this card rather than spawning its own surfaces. */}
      {stats && (
        <div
          className="grid grid-cols-2 gap-3 mt-4 pt-4"
          style={{ borderTop: '1px solid var(--surface-3)' }}
        >
          {stats.map(s => (
            <div key={s.label}>
              <p className="type-caption text-gray-450">{s.label}</p>
              <p className="text-lg font-extrabold text-white tabular-nums mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}
    </GlassSurface>
  );
}
