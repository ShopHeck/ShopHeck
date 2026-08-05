import { SESSION_COLORS } from '../../utils/designTokens';
import type { SessionType } from '../../types';

interface Props {
  /** Minutes. Rendered as "45m" — the row it sits in carries the name. */
  minutes: number;
  sessionType: SessionType;
  className?: string;
}

/**
 * The session-type duration pill (§3.5).
 *
 * Solid color at full opacity, not tinted glass. These sit in a scanning list
 * on the Weekly Planner and have to read at a glance, which a translucent chip
 * over an unpredictable backdrop does not reliably do — this is the one place
 * the design system deliberately steps outside the glass material.
 *
 * The color carries the session type and nothing else does, so the type name is
 * in the accessible label; color alone would leave the mapping unavailable to
 * anyone who cannot see it.
 */
export default function DurationBadge({ minutes, sessionType, className = '' }: Props) {
  // Five of the six session tokens are saturated accents bright enough to carry
  // dark text. `rest` is the exception: its token is --text-tertiary, a 40%
  // white that would composite against the obsidian page rather than covering
  // it, leaving a washed-out pill with unreadable dark text on top. Rest gets
  // an opaque surface and light text instead — the same pill, and the only
  // session type that is deliberately quiet anyway.
  const isRest = sessionType === 'rest';

  return (
    <span
      className={`inline-flex items-center justify-center font-semibold tabular-nums ${className}`}
      style={{
        backgroundColor: isRest ? 'var(--surface-3)' : SESSION_COLORS[sessionType],
        color: isRest ? 'var(--text-secondary)' : 'var(--bg-obsidian)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 10px',
        fontSize: '0.6875rem',
        letterSpacing: '0.4px',
      }}
      aria-label={`${sessionType}, ${minutes} minutes`}
    >
      {minutes}m
    </span>
  );
}
