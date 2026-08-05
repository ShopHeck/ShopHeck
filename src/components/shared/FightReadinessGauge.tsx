import {
  READINESS_COLORS,
  READINESS_LABELS,
  READINESS_RANGES,
  READINESS_TIERS,
  readinessTier,
} from '../../utils/designTokens';

/**
 * Angle convention: 0° = 12 o'clock, clockwise.
 *   225° → bottom-left  (the "0" end)
 *   135° → bottom-right (the "100" end)
 * 270° of sweep through the top, open at the bottom.
 */
function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const SWEEP_DEG = 270;
const START_DEG = 225;

interface ArcProps {
  score: number;
  color: string;
  /** Stroke width scales with the gauge, so the compact variant stays legible. */
  strokeWidth: number;
  showEndLabels: boolean;
  showCenterText: boolean;
  /** Scales the centre type down and drops the "out of 100" caption. */
  compact?: boolean;
}

function GaugeArc({ score, color, strokeWidth, showEndLabels, showCenterText, compact }: ArcProps) {
  const r = 70;
  const cx = 100;
  const cy = 100;
  const start = polarXY(cx, cy, r, START_DEG);
  const end = polarXY(cx, cy, r, (START_DEG + SWEEP_DEG) % 360);

  // 270° sweep → largeArc=1, clockwise → sweep=1
  const d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 1 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;

  const totalLen = 2 * Math.PI * r * (SWEEP_DEG / 360);
  const fillLen = totalLen * (Math.max(0, Math.min(100, score)) / 100);

  const p0 = polarXY(cx, cy, r + 18, START_DEG);
  const p100 = polarXY(cx, cy, r + 18, (START_DEG + SWEEP_DEG) % 360);

  return (
    <svg viewBox="0 0 200 168" className="w-full h-full select-none" aria-hidden="true">
      {/* Outer bloom — the arc's own color at low alpha, so the gauge reads as
          lit rather than drawn. Skipped at zero, where there is nothing lit. */}
      {score > 0 && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth + 9}
          strokeLinecap="round"
          strokeDasharray={`${(fillLen * 0.98).toFixed(1)} ${(totalLen + 10).toFixed(1)}`}
          opacity={0.14}
        />
      )}

      <path
        d={d}
        fill="none"
        stroke="var(--surface-3)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {score > 0 && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${fillLen.toFixed(1)} ${(totalLen + 10).toFixed(1)}`}
          style={{ transition: 'stroke-dasharray 0.6s ease-out, stroke 0.3s ease' }}
        />
      )}

      {showCenterText && (
        <>
          <text
            x="100"
            y={compact ? 104 : 98}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text-primary)"
            style={{
              fontSize: compact ? 62 : 46,
              fontWeight: 800,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: -2,
            }}
          >
            {score}
          </text>
          {!compact && (
            <text
              x="100"
              y="124"
              textAnchor="middle"
              fill="var(--text-tertiary)"
              style={{ fontSize: 11, fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              out of 100
            </text>
          )}
        </>
      )}

      {showEndLabels && (
        <>
          <text
            x={p0.x}
            y={p0.y}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            style={{ fontSize: 9, fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            0
          </text>
          <text
            x={p100.x}
            y={p100.y}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            style={{ fontSize: 9, fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            100
          </text>
        </>
      )}
    </svg>
  );
}

interface Props {
  score: number;
  /** Domain status string, e.g. "Fight Ready". Falls back to the tier label. */
  statusLabel?: string;
  daysOut?: number;
  /** Compact Home variant: smaller arc, no legend, no end labels. */
  compact?: boolean;
  /** Legend below the arc. Full variant only. */
  showLegend?: boolean;
}

/**
 * The Fight Readiness gauge (§3.6).
 *
 * A partial arc, ~270° and open at the bottom — not a full ring. Both the
 * compact Home card and the full detail screen render this one component, which
 * is the point: they previously drew two different shapes for the same number
 * (Home used a rotated full circle, the detail screen the correct arc), so a
 * fighter checking readiness in two places saw two different gauges.
 *
 * The arc is a single color — the current tier's — rather than a gradient
 * across all five. A gradient would imply the score has passed through every
 * band, which is not what the number means.
 */
export default function FightReadinessGauge({
  score,
  statusLabel,
  daysOut,
  compact = false,
  showLegend = true,
}: Props) {
  const tier = readinessTier(score);
  const color = READINESS_COLORS[tier];
  const label = statusLabel ?? READINESS_LABELS[tier];

  // The compact variant is a bare arc: the Home card supplies its own heading
  // and status line around it, and rendering the header here too produced the
  // title and the tier label twice, one above the other.
  const arc = (
    /* The arc is decorative (aria-hidden) and its score lives in SVG <text>,
       which assistive tech does not reach — the wrapper carries the accessible
       name so the number is actually announced. */
    <div
      role="img"
      aria-label={`Fight readiness ${Math.round(score)} out of 100. ${label}.`}
      className={compact ? 'w-20 flex-shrink-0 aspect-[200/168]' : 'w-full max-w-[260px] mx-auto aspect-[200/168]'}
    >
      <GaugeArc
        score={Math.round(score)}
        color={color}
        strokeWidth={compact ? 16 : 13}
        showEndLabels={!compact}
        /* The score is the whole point of the card. Suppressing it in compact
           left the Home gauge as a coloured arc with no number on it. */
        showCenterText
        compact={compact}
      />
    </div>
  );

  if (compact) return arc;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-caption text-gray-450">Fight Readiness</p>
          <p className="text-sm font-bold mt-0.5 truncate" style={{ color }}>
            {label}
          </p>
        </div>
        {daysOut !== undefined && (
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-extrabold text-white tabular-nums leading-none">{daysOut}</p>
            <p className="text-xs text-gray-450 mt-0.5">days out</p>
          </div>
        )}
      </div>

      {arc}

      {!compact && showLegend && (
        <div className="flex items-center justify-center gap-x-3 gap-y-1 mt-1 flex-wrap">
          {READINESS_TIERS.map(t => (
            <div key={t} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                aria-hidden="true"
                style={{ backgroundColor: READINESS_COLORS[t] }}
              />
              <span className="text-xs text-gray-450">
                {READINESS_LABELS[t]}{' '}
                <span className="text-gray-450/70 tabular-nums">{READINESS_RANGES[t]}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
