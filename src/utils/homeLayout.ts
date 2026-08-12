import {
  Activity, Award, BarChart3, Bluetooth, Brain, Droplets, Dumbbell, Gauge,
  Heart, History, Layers, Scale, Shield, UtensilsCrossed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardPrefs, View } from '../types';

/**
 * The one registry of everything that can sit on Home.
 *
 * Both consumers read this array: the More screen builds its pin lists from it,
 * and each Home builds its pinned cards and tool grid from it. That is the
 * whole point — the tool grid and the list you pin from are the same data, so
 * they cannot drift the way this codebase's facts keep drifting when they get
 * restated (four copies of the session→colour map, two `PHASE_COLORS` records
 * that disagreed on Foundation, three definitions of weekly adherence).
 *
 * Adding a tool is one entry here. Adding it to a Home grid by hand is the
 * thing this file exists to make unnecessary.
 */

export type HomeMode = 'camp' | 'offseason' | 'coach';
export type HomeItemKind = 'card' | 'tool';

export type HomeItemId =
  // Cards — rendered inline on Home, full width, in pinned order.
  | 'belt-streak'
  | 'recent-activity'
  | 'weight-status'
  | 'phase-goals'
  | 'training-variety'
  // Tools — rendered as the 2-up grid beneath the cards; tapping navigates.
  | 'ai-insights'
  | 'game-plan'
  | 'nutrition'
  | 'trackers'
  | 'training-library'
  | 'meal-library'
  | 'camp-history'
  | 'achievements'
  | 'progress-charts'
  | 'fight-readiness'
  | 'apple-health';

export interface HomeItem {
  id: HomeItemId;
  kind: HomeItemKind;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** `var(--token)` reference. Tints the chip and colours the icon. */
  accent: string;
  /** Where tapping goes. Tools always have one; cards render in place. */
  view?: View;
  /** Which Homes this belongs to. A pin for another mode is filtered out. */
  modes: HomeMode[];
  /** Gated behind Fighter Pro — shows the PRO chip to everyone else. */
  pro?: boolean;
  /** On Home out of the box, for anyone who has not customised it. */
  defaultPinned?: boolean;
}

export const HOME_ITEMS: HomeItem[] = [
  // ── Cards ───────────────────────────────────────────────────────────────
  {
    id: 'belt-streak',
    kind: 'card',
    title: 'Belt & Streak',
    subtitle: 'Rank, streak and weekly challenge',
    icon: Award,
    accent: 'var(--accent-gold)',
    modes: ['camp', 'offseason'],
    defaultPinned: true,
  },
  {
    id: 'recent-activity',
    kind: 'card',
    title: 'Recent Activity',
    subtitle: 'Your last three sessions',
    icon: Activity,
    accent: 'var(--accent-green)',
    modes: ['camp', 'offseason'],
  },
  {
    id: 'weight-status',
    kind: 'card',
    title: 'Weight Status',
    subtitle: 'Start, current and target',
    icon: Scale,
    accent: 'var(--accent-blue)',
    modes: ['camp', 'offseason'],
  },
  {
    id: 'phase-goals',
    kind: 'card',
    title: 'Phase & Goals',
    subtitle: "This block's focus and week goals",
    icon: Layers,
    accent: 'var(--accent-violet)',
    modes: ['camp', 'offseason'],
  },
  {
    id: 'training-variety',
    kind: 'card',
    title: 'Session Mix',
    subtitle: "This week's work by type",
    icon: BarChart3,
    accent: 'var(--accent-cyan)',
    // Off-season only: a fight camp's mix is prescribed by the generated
    // phase, so there is nothing for the fighter to read into it.
    modes: ['offseason'],
  },

  // ── Tools ───────────────────────────────────────────────────────────────
  {
    id: 'ai-insights',
    kind: 'tool',
    title: 'AI Insights',
    subtitle: 'Coach analysis',
    icon: Brain,
    accent: 'var(--accent-violet)',
    view: 'aiinsights',
    modes: ['camp', 'offseason', 'coach'],
    pro: true,
    defaultPinned: true,
  },
  {
    id: 'game-plan',
    kind: 'tool',
    title: 'Game Plan',
    subtitle: 'Fight strategy',
    icon: Shield,
    accent: 'var(--accent-crimson)',
    view: 'gameplan',
    // Camp only — there is no opponent to plan for in an off-season block,
    // which is why the off-season tool grid never carried it either.
    modes: ['camp'],
    pro: true,
  },
  {
    id: 'nutrition',
    kind: 'tool',
    title: 'Nutrition',
    subtitle: 'Water & meals',
    icon: Droplets,
    accent: 'var(--accent-blue)',
    view: 'nutrition',
    modes: ['camp', 'offseason'],
    pro: true,
    defaultPinned: true,
  },
  {
    id: 'trackers',
    kind: 'tool',
    title: 'Trackers',
    subtitle: 'HR · HRV · Recovery',
    icon: Bluetooth,
    accent: 'var(--accent-cyan)',
    view: 'trackers',
    modes: ['camp', 'offseason'],
    defaultPinned: true,
  },
  {
    id: 'training-library',
    kind: 'tool',
    title: 'Training Library',
    subtitle: 'Exercises & techniques',
    icon: Dumbbell,
    accent: 'var(--accent-gold)',
    view: 'workout-library',
    modes: ['camp', 'offseason'],
    defaultPinned: true,
  },
  {
    id: 'meal-library',
    kind: 'tool',
    title: 'Meal Library',
    subtitle: 'Plans & generator',
    icon: UtensilsCrossed,
    accent: 'var(--accent-green)',
    view: 'meal-library',
    modes: ['camp', 'offseason'],
  },
  {
    id: 'camp-history',
    kind: 'tool',
    title: 'Camp History',
    subtitle: 'Past camps & fights',
    icon: History,
    accent: 'var(--accent-flame)',
    view: 'camp-history',
    modes: ['camp', 'offseason', 'coach'],
  },
  {
    id: 'achievements',
    kind: 'tool',
    title: 'Achievements',
    subtitle: 'Belt · streaks · PRs',
    icon: Award,
    accent: 'var(--accent-gold)',
    view: 'achievements',
    modes: ['camp', 'offseason', 'coach'],
  },
  {
    id: 'progress-charts',
    kind: 'tool',
    title: 'Progress Charts',
    subtitle: 'Trends & benchmarks',
    icon: BarChart3,
    accent: 'var(--accent-teal)',
    view: 'progress',
    modes: ['camp', 'offseason'],
  },
  {
    id: 'fight-readiness',
    kind: 'tool',
    title: 'Fight Readiness',
    subtitle: 'Full factor breakdown',
    icon: Gauge,
    accent: 'var(--accent-green)',
    view: 'readiness',
    // Camp only, because the screen behind it is: FightReadiness refuses an
    // off-season block outright ("off-season blocks don't have a countdown to
    // score against"). A tool that is pinnable into a Home where its own
    // destination declines to render is a dead end with a tile on it.
    modes: ['camp'],
  },
  {
    id: 'apple-health',
    kind: 'tool',
    title: 'Apple Health',
    subtitle: 'Sync & export',
    icon: Heart,
    accent: 'var(--accent-crimson)',
    view: 'health',
    modes: ['camp', 'offseason', 'coach'],
    pro: true,
  },
];

const BY_ID = new Map<string, HomeItem>(HOME_ITEMS.map(i => [i.id, i]));

/** Every item of a kind available in a mode, in registry order. */
export function itemsFor(kind: HomeItemKind, mode: HomeMode): HomeItem[] {
  return HOME_ITEMS.filter(i => i.kind === kind && i.modes.includes(mode));
}

/** The out-of-the-box pin set for a kind and mode. */
export function defaultPinnedIds(kind: HomeItemKind, mode: HomeMode): HomeItemId[] {
  return itemsFor(kind, mode).filter(i => i.defaultPinned).map(i => i.id);
}

/**
 * Stored ids → the items to actually render.
 *
 * Never render from the stored array directly. An id survives in `prefs` long
 * after the thing it named stops applying — a camp-only tool pinned during a
 * camp, then read on the off-season Home; an id from a build where that
 * feature still existed. This is the same shape as the orphaned
 * `completedSessions` ticks that let a shrunk week render "7/5 sessions":
 * a key that outlived its subject. Resolving through the registry every time
 * makes that unrepresentable rather than merely unlikely.
 *
 * `undefined` (never customised) falls back to the defaults; `[]` stays empty,
 * because unpinning everything is a choice and must not spring back.
 */
export function resolvePinned(
  ids: string[] | undefined,
  kind: HomeItemKind,
  mode: HomeMode,
): HomeItem[] {
  const source = ids ?? defaultPinnedIds(kind, mode);
  const seen = new Set<string>();
  return source.flatMap(id => {
    if (seen.has(id)) return [];
    seen.add(id);
    const item = BY_ID.get(id);
    if (!item || item.kind !== kind || !item.modes.includes(mode)) return [];
    return [item];
  });
}

/**
 * Real pins of this kind that the current mode simply cannot show.
 *
 * Game Plan pinned during a fight camp is still pinned when the camp ends and
 * an off-season block starts — it is just unrenderable there. Every write goes
 * through here so that reordering the off-season Home does not quietly delete
 * it: the stored array is the account's pins across both Homes, and only the
 * visible slice is what the fighter is editing.
 *
 * Ids with no registry entry at all are NOT preserved. Those are genuinely
 * dead — a feature that no longer exists — and carrying them forever would
 * make the stored list grow without bound across versions.
 */
function hiddenIds(stored: string[] | undefined, kind: HomeItemKind, mode: HomeMode): string[] {
  if (stored === undefined) return [];
  const seen = new Set<string>();
  return stored.filter(id => {
    if (seen.has(id)) return false;
    seen.add(id);
    const item = BY_ID.get(id);
    return !!item && item.kind === kind && !item.modes.includes(mode);
  });
}

/**
 * Pin or unpin, returning the next stored order.
 *
 * Resolves the current list first so a toggle made against the defaults writes
 * the defaults plus the change, rather than an array containing only the item
 * just tapped.
 */
export function togglePin(
  ids: string[] | undefined,
  id: HomeItemId,
  kind: HomeItemKind,
  mode: HomeMode,
): string[] {
  const visible = resolvePinned(ids, kind, mode).map(i => i.id);
  const next = visible.includes(id)
    ? visible.filter(x => x !== id)
    : [...visible, id];
  return [...next, ...hiddenIds(ids, kind, mode)];
}

/**
 * Write a reordered visible list back to storage.
 *
 * Pins belonging to the other Home keep their relative order but land after
 * the visible ones — they have no position the fighter can perceive from here,
 * so there is nothing to preserve beyond their existence.
 */
export function applyOrder(
  ids: string[] | undefined,
  kind: HomeItemKind,
  mode: HomeMode,
  visibleOrder: string[],
): string[] {
  return [...visibleOrder, ...hiddenIds(ids, kind, mode)];
}

/**
 * Move one entry, clamped.
 *
 * Out-of-range indices return the list untouched rather than throwing or
 * producing holes: a drag that ends outside the pinned run is a no-op, not an
 * error, and the drag handler should not have to defend against its own
 * arithmetic.
 */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;
  const clamped = Math.max(0, Math.min(list.length - 1, to));
  if (clamped === from) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

/**
 * The ids to read and to write against — stored if there are any, otherwise
 * the defaults this document should start from.
 *
 * The upgrade from the pre-pinning shape happens here, at read time, rather
 * than as a migration dispatched on boot. A boot-time write would land in the
 * same document cloud sync is merging on launch, for no benefit: nothing needs
 * to be persisted until the fighter actually changes something, and
 * `resolvePinned(undefined)` already renders the defaults.
 *
 * The one thing that cannot be inferred from the defaults is the belt/streak
 * widget's old hide flag. That was an explicit choice about exactly this card,
 * so it is honoured. Once real pins exist they are authoritative and the flag
 * is never consulted again — an older build on another device keeps honouring
 * its own copy, which is correct for an older build.
 *
 * Every caller passes this to `resolvePinned` / `togglePin` / `applyOrder`, so
 * the first toggle writes the defaults plus that change instead of silently
 * discarding the three the fighter never touched.
 */
export function effectiveIds(
  prefs: DashboardPrefs | undefined,
  kind: HomeItemKind,
  mode: HomeMode,
): string[] {
  const stored = kind === 'card' ? prefs?.pinnedCards : prefs?.pinnedTools;
  if (stored !== undefined) return stored;
  return defaultPinnedIds(kind, mode)
    .filter(id => !(id === 'belt-streak' && prefs?.progressWidgetHidden));
}
