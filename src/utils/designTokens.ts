/**
 * The design system's TypeScript face.
 *
 * Every value here is a `var(--token)` reference, never a literal — the values
 * live in `src/styles/tokens.css` and nowhere else (§9). Custom properties
 * resolve wherever the browser accepts a color, which covers all three ways
 * this app applies one from JS: inline `style`, SVG presentation attributes
 * (`stroke`, `fill`), and Recharts props, which are passed straight through to
 * SVG. So a token stays a single source of truth even when the consumer is TS.
 *
 * THE ONE EXCEPTION is anything crossing the Capacitor bridge into native code
 * — Live Activity colors, the watch app — which needs a resolved hex because
 * UIKit cannot parse `var()`. Those are handled at their own call sites and
 * deliberately not routed through here; see `utils/liveActivity.ts`.
 *
 * The two status scales below share four colors and mean entirely different
 * things. §2.6 is explicit that they must not be collapsed into one: readiness
 * is a 5-tier score driving a partial-arc gauge, pace is a 3-tier judgement
 * driving progress bars and border tints. Same palette, different shape.
 */

// ── Fight Readiness — 5 tiers (§2.6) ────────────────────────────────────────

export type ReadinessTier =
  | 'needs-work'
  | 'building'
  | 'on-track'
  | 'fight-ready'
  | 'peak';

export const READINESS_COLORS: Record<ReadinessTier, string> = {
  'needs-work': 'var(--readiness-needs-work)',
  building: 'var(--readiness-building)',
  'on-track': 'var(--readiness-on-track)',
  'fight-ready': 'var(--readiness-fight-ready)',
  peak: 'var(--readiness-peak)',
};

export const READINESS_LABELS: Record<ReadinessTier, string> = {
  'needs-work': 'Needs Work',
  building: 'Building',
  'on-track': 'On Track',
  'fight-ready': 'Fight Ready',
  peak: 'Peak',
};

/** Inclusive lower bound of each tier, for the gauge legend. */
export const READINESS_RANGES: Record<ReadinessTier, string> = {
  'needs-work': '0–39',
  building: '40–59',
  'on-track': '60–74',
  'fight-ready': '75–89',
  peak: '90+',
};

/** The legend's display order — worst to best, matching the gauge sweep. */
export const READINESS_TIERS: ReadinessTier[] = [
  'needs-work',
  'building',
  'on-track',
  'fight-ready',
  'peak',
];

/**
 * Score → tier. The thresholds are the shipped legend, not an approximation,
 * and they live here rather than being restated in each component — the
 * previous arrangement had the same five bands written out in `readiness.ts`
 * and again in `FightReadiness.tsx`, which is how a legend drifts from the
 * score it is labelling.
 */
export function readinessTier(score: number): ReadinessTier {
  if (score >= 90) return 'peak';
  if (score >= 75) return 'fight-ready';
  if (score >= 60) return 'on-track';
  if (score >= 40) return 'building';
  return 'needs-work';
}

export function readinessColor(score: number): string {
  return READINESS_COLORS[readinessTier(score)];
}

// ── Pace status — 3 tiers (§2.6) ────────────────────────────────────────────

export type PaceTier = 'ahead' | 'behind' | 'critical';

export const PACE_COLORS: Record<PaceTier, string> = {
  ahead: 'var(--pace-ahead)',
  behind: 'var(--pace-behind)',
  critical: 'var(--pace-critical)',
};

/**
 * §2.6 supplies copy for the first two tiers and explicitly declines to invent
 * one for critical ("no confirmed copy yet — don't invent one"). Honoured: the
 * critical entry is null, and callers pass their own domain-specific wording
 * rather than getting a made-up generic string from the design system.
 */
export const PACE_COPY: Record<PaceTier, string | null> = {
  ahead: 'Ahead of pace',
  behind: 'Behind pace',
  critical: null,
};

/**
 * Ratio of achieved-to-required progress → tier.
 *
 * The caution tier is the whole point of this scale. A binary on-track/critical
 * split forced a fighter who was merely behind into the same red as one who
 * cannot make weight, which reads as an emergency roughly every camp.
 */
export function paceTier(ratio: number): PaceTier {
  if (ratio >= 1) return 'ahead';
  if (ratio >= 0.75) return 'behind';
  return 'critical';
}

// ── Difficulty (§2.6) — reuses the pace palette, same ordinal meaning ───────

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Beginner: 'var(--difficulty-beginner)',
  Intermediate: 'var(--difficulty-intermediate)',
  Advanced: 'var(--difficulty-advanced)',
};

// ── Macro nutrients (§2.6) — its own system, not status semantics ───────────

export type Macro = 'calories' | 'protein' | 'carbs' | 'fat';

export const MACRO_COLORS: Record<Macro, string> = {
  calories: 'var(--macro-calories)',
  protein: 'var(--macro-protein)',
  carbs: 'var(--macro-carbs)',
  fat: 'var(--macro-fat)',
};

// ── Session type (§2.7) ─────────────────────────────────────────────────────

/**
 * Keyed to the `SessionType` union in `src/types/index.ts` rather than to a
 * list of observed colors, so adding a session type without giving it a color
 * is a type error instead of a silent fallback to gray.
 */
export const SESSION_COLORS = {
  conditioning: 'var(--session-conditioning)',
  skill: 'var(--session-skill)',
  sparring: 'var(--session-sparring)',
  strength: 'var(--session-strength)',
  recovery: 'var(--session-recovery)',
  rest: 'var(--session-rest)',
} as const satisfies Record<import('../types').SessionType, string>;

// ── Surfaces and accents, for JS-applied styling ────────────────────────────

export const TOKENS = {
  bgObsidian: 'var(--bg-obsidian)',
  surface1: 'var(--surface-1)',
  surface2: 'var(--surface-2)',
  surface3: 'var(--surface-3)',
  flame: 'var(--accent-flame)',
  crimson: 'var(--accent-crimson)',
  violet: 'var(--accent-violet)',
  cyan: 'var(--accent-cyan)',
  gold: 'var(--accent-gold)',
  green: 'var(--accent-green)',
  blue: 'var(--accent-blue)',
  teal: 'var(--accent-teal)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textTertiary: 'var(--text-tertiary)',
} as const;

/**
 * A token reference tinted to `alpha`.
 *
 * `color-mix` is the only way to apply opacity to a `var()` color without
 * unwrapping it back into channels at the call site, which would put a literal
 * in a component and defeat the point. Supported in WKWebView from iOS 16.2;
 * the app's deployment target is above that, and the fallback behaviour on
 * anything older is the untinted color rather than a broken declaration.
 */
export function tint(token: string, alpha: number): string {
  return `color-mix(in srgb, ${token} ${Math.round(alpha * 100)}%, transparent)`;
}

/**
 * Resolves a `var(--token)` reference to its computed value.
 *
 * For the one consumer that cannot take a `var()`: Canvas 2D, which the share-
 * image generator draws into. `ctx.fillStyle = 'var(--accent-flame)'` fails
 * silently and paints black, so the alternative to this is a second hand-kept
 * palette of hex literals — exactly the drift tokens.css exists to prevent.
 *
 * Reading from `:root` rather than from an element means the value is the
 * declared one, unaffected by wherever the caller happens to sit in the tree.
 * The fallback covers server-side rendering and the moment before the
 * stylesheet has applied; it is never hit in the browser after first paint.
 */
export function resolveToken(token: string, fallback = '#FFFFFF'): string {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const name = token.trim().replace(/^var\(\s*/, '').replace(/\s*\)$/, '');
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Categorical series colors for multi-line and multi-bar charts.
 *
 * Ordered so adjacent series are maximally distinguishable rather than by any
 * semantic meaning — a chart's third line is not "the gold one because it is
 * cautionary", it is the third line. Status semantics do not apply here, which
 * is why this is its own list rather than a reuse of the pace or readiness
 * scales.
 */
export const CHART_SERIES = [
  'var(--accent-flame)',
  'var(--accent-blue)',
  'var(--accent-violet)',
  'var(--accent-green)',
  'var(--accent-gold)',
  'var(--accent-cyan)',
] as const;
