import React from 'react';
import { AlertTriangle } from 'lucide-react';
import GlassSurface from './GlassSurface';

export type TileState = 'populated' | 'loading' | 'empty' | 'error';

interface BaseProps {
  /** Caption style, single line. Never wraps — §3.4. */
  label: string;
  /** Signed delta. Colored green when an improvement, crimson when not. */
  trend?: { value: string; direction: 'up' | 'down' };
  /**
   * Which direction counts as good. A weight tile trending down is progress;
   * a sessions-logged tile trending down is not. Without this the arrow color
   * would be a coin flip on half the tiles in the app.
   */
  goodDirection?: 'up' | 'down';
  icon?: React.ReactNode;
  state?: TileState;
  onClick?: () => void;
  onRetry?: () => void;
  className?: string;
}

/**
 * A value that is markup must also say what it says.
 *
 * The accessible name interpolates `value`, so a node stringifies to
 * "[object Object]" — a tile rendering "4/6" with a styled denominator was
 * announced as "Sessions: [object Object]". Splitting the props into two cases
 * makes `valueLabel` mandatory exactly when the value is not already text, so
 * the next styled tile cannot ship silently broken.
 */
type Props = BaseProps & (
  | { value?: string | number; valueLabel?: string }
  | { value: React.ReactNode; valueLabel: string }
);

/**
 * The 2-column grid tile (§3.4).
 *
 * Dimensions are locked here so no two instances drift: min-height 96px,
 * padding var(--space-4), value at tile scale (28px, not the 36–48px
 * card-level Metric Large), label clipped to one line.
 *
 * Solid fill, never live blur — this grid is the specific case §3.2 calls out,
 * and several instances sit on screens that are visible during an active timer.
 *
 * All four states ship together (§4.2). The loading skeleton reserves the
 * locked dimensions rather than collapsing, so tiles do not resize when data
 * arrives — a grid that reflows on load is the thing that reads as broken.
 */
export default function GlassMetricTile({
  label,
  value,
  valueLabel,
  trend,
  goodDirection = 'up',
  icon,
  state = 'populated',
  onClick,
  onRetry,
  className = '',
}: Props) {
  const interactive = !!onClick || (state === 'error' && !!onRetry);

  const trendColor = trend
    ? trend.direction === goodDirection
      ? 'var(--pace-ahead)'
      : 'var(--pace-critical)'
    : undefined;

  return (
    <GlassSurface
      as={interactive ? 'button' : 'div'}
      cornerRadius="md"
      onClick={state === 'error' ? onRetry : onClick}
      className={`flex flex-col justify-between text-left min-h-[96px] ${className}`}
      style={{ padding: 'var(--space-4)' }}
      aria-label={
        state === 'populated' && value !== undefined
          ? `${label}: ${valueLabel ?? String(value)}${trend ? `, ${trend.direction === 'up' ? 'up' : 'down'} ${trend.value}` : ''}`
          : state === 'error'
            ? `${label}: could not load. Tap to retry.`
            : state === 'empty'
              ? `${label}: no data yet`
              : `${label}: loading`
      }
    >
      {/* The trend delta sits on the label row, not bottom-right beside the
          value as §3.4 describes. That placement assumes the 2-column grid the
          same section specifies; these stat rows are 3-up, which leaves ~78px
          of content width — not enough for a 28px value and a delta side by
          side, and the value was being truncated to "1…". Above the value the
          delta has the whole row to itself and the value keeps full width. */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* The icon yields to the trend delta. A 3-up tile has ~80px of content
            width; icon + label + delta measures past it even at the tighter
            tile caption, and the label was truncating to "CUR…". The icon is
            the redundant one of the three — it restates the label — so it is
            the one that goes. Tiles without a delta keep it. */}
        {!(trend && state === 'populated') && icon}
        <span className="type-caption-tile text-gray-450 truncate whitespace-nowrap">
          {label}
        </span>
        {trend && state === 'populated' && (
          <span
            className="ml-auto text-xs font-semibold tabular-nums flex items-center gap-0.5 flex-shrink-0 whitespace-nowrap"
            style={{ color: trendColor }}
            aria-hidden="true"
          >
            {trend.direction === 'up' ? '▲' : '▼'}
            {trend.value}
          </span>
        )}
      </div>

      {state === 'loading' && (
        <div className="skeleton h-7 w-3/4 mt-2" aria-hidden="true" />
      )}

      {state === 'empty' && (
        <div className="type-metric-tile text-gray-450 mt-2" aria-hidden="true">
          —
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-1.5 mt-2 text-gray-450">
          <AlertTriangle size={18} style={{ color: 'var(--pace-behind)' }} aria-hidden="true" />
          <span className="type-body">Retry</span>
        </div>
      )}

      {state === 'populated' && (
        <div className="mt-2 min-w-0">
          <span className="type-metric-tile text-white block truncate">{value}</span>
        </div>
      )}
    </GlassSurface>
  );
}
