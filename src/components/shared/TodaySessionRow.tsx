import { CheckCircle2 } from 'lucide-react';
import GlassSurface from './GlassSurface';
import DurationBadge from './DurationBadge';
import { SESSION_COLORS, SESSION_ICONS } from '../../utils/sessionVisuals';
import { tint } from '../../utils/designTokens';
import type { TrainingSession } from '../../types';

interface Props {
  session: TrainingSession;
  /** Ticked complete — either in the planner or by logging it. */
  done: boolean;
  /** Colour of the Log affordance; each dashboard uses its own accent. */
  logColor: string;
  /** Omit to render the row without a Log action (rest slots, zero duration). */
  onLog?: () => void;
  /**
   * Drop the row's own glass surface.
   *
   * Set when the rows are stacked inside a surface of their own — the Today
   * card holds readiness and the day's work in one card, and glass nested in
   * glass reads as a rendering mistake rather than as depth (§3.3: one live
   * layer per visual group).
   */
  bare?: boolean;
}

/**
 * One row of a dashboard's "Today's Training" card.
 *
 * Shared rather than written per-dashboard: the fight-camp and off-season
 * dashboards previously carried byte-identical copies of this row, which is how
 * the session→colour mapping drifted into three versions before
 * `SESSION_COLORS` consolidated it.
 *
 * A completed session keeps its name — the fighter still wants to see what they
 * did — but loses its call to action entirely: the Log button and duration pill
 * are replaced by a green COMPLETED badge, so the card only ever offers work
 * that is still outstanding.
 */
export default function TodaySessionRow({ session, done, logColor, onLog, bare }: Props) {
  const accent = done ? 'var(--accent-green)' : SESSION_COLORS[session.type];
  const Icon = SESSION_ICONS[session.type];

  const content = (
    <>
      <div
        className="w-10 h-10 flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: tint(accent, 0.16),
          borderRadius: 'var(--radius-sm)',
          color: accent,
        }}
      >
        {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${done ? 'text-gray-400' : 'text-white'}`}>
          {session.title}
        </p>
      </div>

      {done ? (
        <span
          className="text-[10px] font-bold tracking-wider px-2 py-1 rounded-full flex-shrink-0"
          style={{ backgroundColor: tint('var(--accent-green)', 0.16), color: 'var(--accent-green)' }}
        >
          COMPLETED
        </span>
      ) : (
        <>
          <DurationBadge minutes={session.duration} sessionType={session.type} />
          {onLog && (
            <button
              onClick={onLog}
              aria-label={`Log ${session.title}`}
              className="text-xs font-semibold flex-shrink-0 -m-2 p-2"
              style={{ color: logColor }}
            >
              Log
            </button>
          )}
        </>
      )}
    </>
  );

  // Branching on the wrapper rather than building one inline: a component
  // defined during render is a new type on every render, so React unmounts and
  // remounts the whole row — which would drop a Log button mid-press.
  return bare ? (
    <div className="flex items-center gap-3 py-2">{content}</div>
  ) : (
    <GlassSurface cornerRadius="md" className="flex items-center gap-3 p-4">{content}</GlassSurface>
  );
}
