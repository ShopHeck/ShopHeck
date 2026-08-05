import { tint } from '../../utils/designTokens';

export type OrbPhase = 'idle' | 'prep' | 'work' | 'rest' | 'done';

interface Props {
  /** Seconds remaining, already formatted as mm:ss. */
  time: string;
  phase: OrbPhase;
  /** 0–1 of the current phase remaining. Drives the ring. */
  progress: number;
  /**
   * User-chosen ring colors (§3.4). These are real hex, not tokens: the same
   * two values cross the Capacitor bridge to the Live Activity and the watch
   * app, which cannot parse `var()`. The design system supplies the defaults;
   * the fighter owns the values.
   */
  workColor: string;
  restColor: string;
  /** Hero on the timer screen, mini inside timeline nodes. No other sizes. */
  size?: 'hero' | 'mini';
  /** Drives the liquid shimmer. Motion communicates running vs paused. */
  running?: boolean;
  label?: string;
}

/** §3.4 locks two size contexts and their stroke widths. Nothing in between. */
const SIZES = {
  hero: { px: 240, stroke: 6, viewBox: 240 },
  mini: { px: 96, stroke: 3, viewBox: 96 },
} as const;

const PHASE_LABELS: Record<OrbPhase, string> = {
  idle: 'READY',
  prep: 'GET READY',
  work: 'WORK',
  rest: 'REST',
  done: 'DONE',
};

/**
 * The countdown orb (§3.4, §4.1).
 *
 * The original brief called for a 3D liquid sphere, which means WebGL inside a
 * WKWebView — a heavy dependency and a real battery and thermal cost for a
 * component that is on screen for the entire length of a training session. This
 * is the CSS-only stand-in: layered radial-gradients for the specular highlight
 * and rim shading, a slow background-position drift for the liquid movement,
 * and an SVG ring overlay carrying the actual progress.
 *
 * The drift runs only while the timer runs, so the motion is state, not
 * decoration — which is what keeps it inside the "no decorative animation"
 * rule rather than being an exception to it.
 *
 * No `backdrop-filter` anywhere. §3.2 is explicit that anything on screen
 * during active timer use takes the cheap path, and this component is the
 * definition of that case.
 */
export default function TimerOrb({
  time,
  phase,
  progress,
  workColor,
  restColor,
  size = 'hero',
  running = false,
  label,
}: Props) {
  const { px, stroke, viewBox } = SIZES[size];
  const isMini = size === 'mini';

  // Prep, idle and done are transient system states rather than fighter-chosen
  // phases, so they use design tokens; work and rest use the fighter's colors.
  const color =
    phase === 'work' ? workColor
    : phase === 'rest' ? restColor
    : phase === 'prep' ? 'var(--accent-gold)'
    : phase === 'done' ? 'var(--accent-green)'
    : 'var(--text-tertiary)';

  const r = viewBox / 2 - stroke * 2;
  const circumference = 2 * Math.PI * r;

  // Idle is a resting state, not a full one. Drawing a 100%-complete ring in
  // the tertiary grey made the orb read as a heavy lit disc before the fighter
  // had started anything — louder at rest than during a round, which inverts
  // the hierarchy the whole screen is built on. At idle the ring shows track
  // only and the body drops to a whisper of tint.
  const quiet = phase === 'idle';
  const dash = quiet ? `0 ${circumference}` : `${circumference * Math.max(0, Math.min(1, progress))} ${circumference}`;

  const stateLabel = label ?? PHASE_LABELS[phase];

  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: px, height: px }}
    >
      {/* Liquid body. Three stacked radial-gradients: a specular highlight
          upper-left, a colored bloom lower-right, and a dark core that keeps
          the centre readable behind the numerals. Only the first two move. */}
      <div
        className={`absolute inset-0 rounded-full ${running ? 'orb-liquid' : ''}`}
        aria-hidden="true"
        style={{
          backgroundImage: [
            `radial-gradient(circle at 30% 25%, ${tint(color, quiet ? 0.08 : 0.42)} 0%, transparent 55%)`,
            `radial-gradient(circle at 70% 75%, ${tint(color, quiet ? 0.04 : 0.22)} 0%, transparent 60%)`,
            `radial-gradient(circle at 50% 50%, var(--surface-1) 45%, var(--bg-obsidian) 100%)`,
          ].join(', '),
          backgroundSize: '160% 160%, 160% 160%, 100% 100%',
          backgroundPosition: '30% 25%, 70% 75%, 50% 50%',
          boxShadow: `inset 0 1px 0 0 var(--glass-border-highlight), var(--shadow-2)`,
        }}
      />

      {/* Rim light — a hairline that picks up the phase color, which is what
          sells the surface as curved rather than flat. */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        aria-hidden="true"
        style={{ boxShadow: `inset 0 0 ${isMini ? 12 : 28}px ${tint(color, quiet ? 0.07 : 0.28)}` }}
      />

      {/* Progress ring */}
      <svg
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        className="absolute inset-0 w-full h-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={viewBox / 2}
          cy={viewBox / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        {/* Skipped entirely rather than drawn at zero length: a round linecap
            on a 0-length dash still paints both caps, leaving a stray dot
            parked at 12 o'clock on the idle orb. */}
        {!quiet && progress > 0 && (
          <circle
            cx={viewBox / 2}
            cy={viewBox / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={dash}
            style={{ transition: 'stroke-dasharray 250ms linear, stroke 300ms ease' }}
          />
        )}
      </svg>

      {/* Center content: mm:ss above a caption-style state label (§3.4). */}
      <div className="relative flex flex-col items-center justify-center">
        <span
          className={isMini ? 'text-lg font-extrabold tabular-nums' : 'type-metric'}
          /* At idle the ring colour is the tertiary grey, which is right for a
             dormant ring and far too dim for the clock — the number is the one
             thing on this screen that must stay readable under gym lighting. */
          style={{ color: quiet ? 'var(--text-primary)' : color }}
          role="timer"
          aria-label={`${stateLabel} — ${time} remaining`}
        >
          {time}
        </span>
        {!isMini && (
          <span className="type-caption mt-1" style={{ color: 'var(--text-secondary)' }}>
            {stateLabel}
          </span>
        )}
      </div>
    </div>
  );
}
