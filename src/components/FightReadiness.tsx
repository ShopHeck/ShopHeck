import { useMemo, useState, useEffect } from 'react';
import { Scale, Activity, Flame, Zap, Timer, Droplets, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { computeReadiness } from '../utils/readiness';
import type { ReadinessBreakdownItem } from '../utils/readiness';

// ─── SVG Gauge ───────────────────────────────────────────────────────────────

/**
 * Semi-circular gauge from 225° (7:30) to 135° (4:30) sweeping 270° clockwise
 * through the top of the circle. Uses stroke-dasharray to fill the arc.
 *
 * Angle convention: 0° = 12 o'clock, clockwise.
 *   225° → bottom-left (start / "0")
 *   135° → bottom-right (end / "100")
 *
 * r = 70, cx = 100, cy = 100, viewBox "0 0 200 165"
 * Arc start (225°): x ≈ 50.5,  y ≈ 149.5
 * Arc end   (135°): x ≈ 149.5, y ≈ 149.5
 * Total arc length (270° of r=70): ≈ 329.9 px
 */
function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function GaugeArc({ score, color }: { score: number; color: string }) {
  const r = 70, cx = 100, cy = 100;
  const start = polarXY(cx, cy, r, 225);
  const end   = polarXY(cx, cy, r, 135); // = 225+270 mod 360

  // M start A r r 0 largeArc sweep end
  // 270° sweep → largeArc=1, clockwise → sweep=1
  const d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 1 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;

  const totalLen = 2 * Math.PI * r * (270 / 360); // ≈ 329.9
  const fillLen  = totalLen * (Math.max(0, Math.min(100, score)) / 100);

  // Tick positions for "0" and "100" labels
  const p0   = polarXY(cx, cy, r + 18, 225);
  const p100 = polarXY(cx, cy, r + 18, 135);

  return (
    <svg viewBox="0 0 200 168" className="w-full max-w-[260px] mx-auto select-none" aria-hidden="true">
      {/* Subtle outer glow ring */}
      {score > 0 && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={22}
          strokeLinecap="round"
          strokeDasharray={`${(fillLen * 0.98).toFixed(1)} ${(totalLen + 10).toFixed(1)}`}
          opacity={0.12}
        />
      )}
      {/* Background track */}
      <path d={d} fill="none" stroke="#1e293b" strokeWidth={13} strokeLinecap="round" />
      {/* Coloured fill */}
      {score > 0 && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={13}
          strokeLinecap="round"
          strokeDasharray={`${fillLen.toFixed(1)} ${(totalLen + 10).toFixed(1)}`}
        />
      )}
      {/* Score number */}
      <text
        x="100" y="100"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        style={{ fontSize: 46, fontWeight: 900, fontFamily: 'system-ui, sans-serif', letterSpacing: -2 }}
      >
        {score}
      </text>
      {/* "out of 100" sub-label */}
      <text
        x="100" y="124"
        textAnchor="middle"
        fill="#4b5563"
        style={{ fontSize: 11, fontFamily: 'system-ui, sans-serif' }}
      >
        out of 100
      </text>
      {/* Min/max tick labels */}
      <text x={p0.x}   y={p0.y}   textAnchor="middle" fill="#374151" style={{ fontSize: 9, fontFamily: 'system-ui' }}>0</text>
      <text x={p100.x} y={p100.y} textAnchor="middle" fill="#374151" style={{ fontSize: 9, fontFamily: 'system-ui' }}>100</text>
    </svg>
  );
}

// ─── Breakdown card ───────────────────────────────────────────────────────────

const ICONS = {
  scale:    Scale,
  activity: Activity,
  flame:    Flame,
  zap:      Zap,
  timer:    Timer,
  droplets: Droplets,
} as const;

function BreakdownCard({ item }: { item: ReadinessBreakdownItem }) {
  const Icon = ICONS[item.icon];
  const ratio = item.score / item.max;
  const barColor =
    ratio >= 0.75 ? '#22c55e' :
    ratio >= 0.5  ? '#eab308' :
    '#ef4444';

  return (
    <div className="card space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={13} className="text-gray-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-300 truncate">{item.label}</span>
        </div>
        <span className="text-sm font-black text-white flex-shrink-0">
          {item.score}<span className="text-xs font-normal text-gray-500">/{item.max}</span>
        </span>
      </div>

      {/* Bar */}
      <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${ratio * 100}%`, backgroundColor: barColor }}
        />
      </div>

      <p className="text-xs text-gray-500 leading-tight">{item.detail}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FightReadiness() {
  const { state } = useApp();
  const result = useMemo(() => computeReadiness(state), [state]);

  // Animate the gauge score from 0 → target on mount
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    if (!result) return;
    const target = result.overall;
    const duration = 900;
    const startTime = Date.now();

    let frame: number;
    function step() {
      const t = Math.min(1, (Date.now() - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayScore(Math.round(eased * target));
      if (t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [result?.overall]);

  if (!state.activeCamp) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
        <p className="text-gray-400 text-sm">No active fight camp. Set one up in Settings first.</p>
      </div>
    );
  }

  if (!result) return null;

  const { status, statusColor, breakdown, insights, daysUntilFight } = result;

  return (
    <div className="space-y-4 pb-6 pt-4">

      {/* Gauge card */}
      <div className="mx-4 card">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fight Readiness</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: statusColor }}>{status}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-white">{daysUntilFight}</p>
            <p className="text-xs text-gray-500 -mt-0.5">days out</p>
          </div>
        </div>

        <GaugeArc score={displayScore} color={statusColor} />

        {/* Zone legend */}
        <div className="flex items-center justify-center gap-3 mt-1 flex-wrap">
          {[
            { label: 'Needs Work', color: '#ef4444', range: '0–39' },
            { label: 'Building',   color: '#f97316', range: '40–59' },
            { label: 'On Track',   color: '#eab308', range: '60–74' },
            { label: 'Fight Ready',color: '#22c55e', range: '75–89' },
            { label: 'Peak',       color: '#10b981', range: '90+' },
          ].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: z.color }} />
              <span className="text-xs text-gray-600">{z.range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Key focus areas */}
      {insights.length > 0 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Focus Areas</p>
          <div className="card space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <AlertCircle size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-300 leading-snug">{insight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score breakdown grid */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Score Breakdown</p>
        <div className="grid grid-cols-2 gap-3">
          {breakdown.map(item => (
            <BreakdownCard key={item.label} item={item} />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-gray-700 pb-2">
        Score updates automatically as you log data
      </p>
    </div>
  );
}
