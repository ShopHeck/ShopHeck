import { useMemo, useState, useEffect } from 'react';
import { Scale, Activity, Flame, Zap, Timer, Droplets, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { computeReadiness } from '../utils/readiness';
import type { ReadinessBreakdownItem } from '../utils/readiness';
import GlassSurface from './shared/GlassSurface';
import FightReadinessGauge from './shared/FightReadinessGauge';
import { PACE_COLORS, paceTier } from '../utils/designTokens';

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
  // A sub-score bar is scored against the 3-tier PACE scale, not the 5-tier
  // readiness scale above it (§3.6). They are different questions: the gauge
  // asks "how ready is this fighter", each bar asks "is this one input keeping
  // up". Running the 5-tier scale down here would put five colors on a 20-point
  // sub-score and make a 14/20 look like a different kind of thing to a 15/20.
  const barColor = PACE_COLORS[paceTier(ratio)];

  return (
    <GlassSurface cornerRadius="md" className="p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={13} className="text-gray-450 flex-shrink-0" />
          <span className="text-xs font-semibold text-gray-300 truncate">{item.label}</span>
        </div>
        <span className="text-sm font-extrabold text-white flex-shrink-0 tabular-nums">
          {item.score}<span className="text-xs font-normal text-gray-450">/{item.max}</span>
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden"
        style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${ratio * 100}%`, backgroundColor: barColor, borderRadius: 'var(--radius-full)' }}
        />
      </div>

      <p className="text-xs text-gray-400 leading-tight">{item.detail}</p>
    </GlassSurface>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FightReadiness() {
  const { state } = useApp();
  const result = useMemo(() => computeReadiness(state), [state]);

  // Animate the gauge score from 0 → target on mount
  const [displayScore, setDisplayScore] = useState(0);
  // The animation's only input is the score itself. Depending on `result` (a
  // fresh object on every state change) would restart the 900 ms sweep on any
  // unrelated dispatch, so the primitive is extracted and used as the dep.
  const overall = result?.overall ?? null;
  useEffect(() => {
    if (overall === null) return;
    const target = overall;
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
  }, [overall]);

  if (!state.activeCamp) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
        <p className="text-gray-400 text-sm">No active camp yet — start one from the dashboard to see your readiness score.</p>
      </div>
    );
  }

  // Nothing real to score against: off-season blocks (and camps without a
  // fight date) get the block's end substituted inside computeReadiness so
  // the math stays finite — meaning `result` is never null here, and the
  // "fight readiness" number it produces is a countdown to nothing. Gate on
  // the actual condition instead of the result.
  if (state.activeCamp.isOffSeason || !state.activeCamp.fightDate) {
    return (
      <div className="mx-4 mt-10 card text-center py-12">
        <p className="text-gray-400 font-semibold">Readiness needs a fight to aim at</p>
        <p className="text-sm text-gray-450 mt-1 max-w-xs mx-auto">
          The readiness score weighs your training, cut and recovery against a fight date.
          Start a fight camp to see it — off-season blocks don't have a countdown to score against.
        </p>
      </div>
    );
  }

  if (!result) return null;

  // statusColor is deliberately not read: the gauge derives its own color from
  // the score via the shared tier table, so the readiness engine and the design
  // system cannot disagree about what "On Track" looks like.
  const { status, breakdown, insights, daysUntilFight } = result;

  return (
    <div className="space-y-4 pb-6 pt-4">

      {/* Gauge card. The legend, tier thresholds and arc geometry all live in
          <FightReadinessGauge>, which the Home card also renders — the two used
          to draw different shapes for the same score, and the legend's five
          bands were written out here a second time in raw hex. */}
      <GlassSurface cornerRadius="lg" elevated className="mx-4 p-4">
        <FightReadinessGauge
          score={displayScore}
          statusLabel={status}
          daysOut={daysUntilFight}
        />
      </GlassSurface>

      {/* Focus Areas — generated guidance, so the row template is what's locked
          here, not the text (§3.6). Caution-colored marker, not flame: these
          are things to fix, which is the same signal "behind pace" carries. */}
      {insights.length > 0 && (
        <div className="mx-4">
          <p className="type-caption text-gray-450 mb-2">Focus Areas</p>
          <GlassSurface cornerRadius="md" className="p-4 space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <AlertCircle
                  size={14}
                  className="flex-shrink-0 mt-0.5"
                  style={{ color: 'var(--pace-behind)' }}
                  aria-hidden="true"
                />
                <p className="text-sm text-gray-300 leading-snug">{insight}</p>
              </div>
            ))}
          </GlassSurface>
        </div>
      )}

      {/* Score breakdown grid (§3.6). Categories come from the readiness
          engine, so the grid renders whatever it returns rather than six
          hardcoded slots. */}
      <div className="mx-4">
        <p className="type-caption text-gray-450 mb-2">Score Breakdown</p>
        <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
          {breakdown.map(item => (
            <BreakdownCard key={item.label} item={item} />
          ))}
        </div>
      </div>

      <p className="text-center text-xs pb-2" style={{ color: 'var(--text-tertiary)' }}>
        Score updates automatically as you log data
      </p>
    </div>
  );
}
