import { differenceInCalendarDays, parseISO } from 'date-fns';
import type {
  LibraryPrescriptionOverride,
  LibraryResult,
  LibrarySessionEntry,
  LibraryState,
  SessionType,
} from '../types';
import {
  estimateMinutes,
  formatPrescription,
  getLibraryItem,
  isTechnique,
  type LibraryItem,
  type Prescription,
} from '../data/library';

/**
 * Stable fallback for `state.library`, which is optional.
 *
 * Shared as a module constant rather than written inline as `?? []` at each
 * call site: an inline literal is a fresh array on every render, which would
 * make every `useMemo` keyed on it recompute forever.
 */
export const EMPTY_LIBRARY: LibraryState = { favorites: [], queue: [], results: [] };

// ─── Prescriptions ───────────────────────────────────────────────────────────

/**
 * The prescription actually being trained: the library default with the user's
 * overrides applied. Overrides are sparse, so an untouched field keeps
 * following the library — including when the library entry is later revised.
 */
export function resolvePrescription(base: Prescription, override: LibraryPrescriptionOverride): Prescription {
  const merged: Prescription = { ...base };
  if (override.sets !== undefined) { merged.sets = override.sets; merged.setsMax = undefined; }
  if (override.reps !== undefined) { merged.reps = override.reps; merged.repsMax = undefined; }
  if (override.rounds !== undefined) merged.rounds = override.rounds;
  if (override.workSeconds !== undefined) merged.workSeconds = override.workSeconds;
  if (override.restSeconds !== undefined) merged.restSeconds = override.restSeconds;
  if (override.distanceMeters !== undefined) {
    merged.distanceMeters = override.distanceMeters;
    merged.distanceMetersMax = undefined;
  }
  if (override.load !== undefined) merged.load = override.load;
  if (override.targetRpe !== undefined) { merged.rpe = override.targetRpe; merged.rpeMax = undefined; }
  return merged;
}

/** True when the entry departs from the library's default prescription. */
export function isAdjusted(override: LibraryPrescriptionOverride): boolean {
  return Object.entries(override).some(([key, value]) => key !== 'notes' && value !== undefined);
}

/** The prescription string for a queued entry, overrides included. */
export function entryPrescriptionText(entry: LibrarySessionEntry): string {
  const item = getLibraryItem(entry.itemId);
  if (!item) return '';
  return formatPrescription(resolvePrescription(item.prescription, entry.override));
}

// ─── Spaced review ───────────────────────────────────────────────────────────

export type ReviewStatus = 'never' | 'fresh' | 'due' | 'overdue';

export interface ReviewInfo {
  status: ReviewStatus;
  /** Days since the last logged result, or null when never logged. */
  daysSince: number | null;
  /** The item's review interval — techniques only. */
  intervalDays: number | null;
}

/**
 * Where an item sits in its review cycle.
 *
 * Only techniques carry an interval: skills decay and need revisiting, whereas
 * a deadlift doesn't go stale in the same way. Exercises therefore report their
 * last-trained date but never come back as due.
 *
 * `overdue` is deliberately set at double the interval, so a technique that has
 * genuinely fallen off the radar ranks above one that is a day late.
 */
export function reviewInfo(item: LibraryItem, results: LibraryResult[], now = new Date()): ReviewInfo {
  const last = lastResultFor(item.id, results);
  const daysSince = last ? differenceInCalendarDays(now, parseISO(last.date)) : null;
  const intervalDays = isTechnique(item) ? item.reviewIntervalDays : null;

  if (daysSince === null) return { status: 'never', daysSince: null, intervalDays };
  if (intervalDays === null) return { status: 'fresh', daysSince, intervalDays };
  if (daysSince >= intervalDays * 2) return { status: 'overdue', daysSince, intervalDays };
  if (daysSince >= intervalDays) return { status: 'due', daysSince, intervalDays };
  return { status: 'fresh', daysSince, intervalDays };
}

/** Most recent result for an item, by the date it was trained. */
export function lastResultFor(itemId: string, results: LibraryResult[]): LibraryResult | null {
  let latest: LibraryResult | null = null;
  for (const r of results) {
    if (r.itemId !== itemId) continue;
    if (!latest || r.date > latest.date) latest = r;
  }
  return latest;
}

export function resultsFor(itemId: string, results: LibraryResult[]): LibraryResult[] {
  return results
    .filter(r => r.itemId === itemId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * Items worth revisiting, worst first — the answer to "what haven't we drilled
 * lately?". Only items with a training history are included: something never
 * logged isn't neglected, it's just new.
 */
export function dueForReview(items: LibraryItem[], results: LibraryResult[], now = new Date()): LibraryItem[] {
  return items
    .map(item => ({ item, info: reviewInfo(item, results, now) }))
    .filter(({ info }) => info.status === 'due' || info.status === 'overdue')
    .sort((a, b) => (b.info.daysSince ?? 0) - (a.info.daysSince ?? 0))
    .map(({ item }) => item);
}

// ─── Session hand-off ────────────────────────────────────────────────────────

/**
 * Which session type a library item logs as, so a queued session lands in the
 * right bucket in the existing workout logger.
 */
export function sessionTypeFor(item: LibraryItem): SessionType {
  if (isTechnique(item)) {
    return item.formats.includes('live-resistance') ? 'sparring' : 'skill';
  }
  if (item.category === 'strength') return 'strength';
  if (item.category === 'mobility') return 'recovery';
  return 'conditioning';
}

/** Total estimated minutes for a set of queued entries. */
export function queueMinutes(entries: LibrarySessionEntry[]): number {
  return entries.reduce((total, entry) => {
    const item = getLibraryItem(entry.itemId);
    if (!item) return total;
    return total + estimateMinutes(resolvePrescription(item.prescription, entry.override));
  }, 0);
}

/**
 * Turns a queued session into the prefill the workout logger expects.
 *
 * The session type is whichever type appears most across the queue — a queue of
 * four strength lifts and one stretch is a strength session. Ties break toward
 * the first item added, which is the one the fighter chose to build around.
 */
export function queueToPrefill(entries: LibrarySessionEntry[]): { sessionType: SessionType; title: string; duration: number } | null {
  const items = entries.map(e => getLibraryItem(e.itemId)).filter((i): i is LibraryItem => !!i);
  if (items.length === 0) return null;

  const counts = new Map<SessionType, number>();
  for (const item of items) {
    const type = sessionTypeFor(item);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  let sessionType = sessionTypeFor(items[0]);
  let best = counts.get(sessionType) ?? 0;
  for (const [type, count] of counts) {
    if (count > best) { sessionType = type; best = count; }
  }

  const names = items.map(i => i.name);
  const title = names.length <= 2
    ? names.join(' + ')
    : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;

  return { sessionType, title, duration: queueMinutes(entries) };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Free-text match across everything a fighter might type.
 * Tokenized AND: every word must appear somewhere in the haystack.
 * This is how people actually search a playbook (“teep kick”, “hip hinge”).
 */
export function matchesQuery(item: LibraryItem, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack: string[] = [
    item.name,
    item.instructions,
    item.tips ?? '',
    ...item.equipment,
    ...item.cues,
    ...item.commonMistakes,
    ...item.substitutions,
    ...item.progressions,
    ...item.regressions,
    ...item.contraindications,
  ];

  if (isTechnique(item)) {
    haystack.push(
      ...item.disciplines,
      ...item.focusTags,
      ...item.intents,
      item.range,
      item.position ?? '',
      ...(item.linkedTechniques ?? []),
    );
  } else {
    haystack.push(
      ...item.muscleGroups,
      ...item.sports,
      item.category,
      item.adaptation,
      ...(item.movementPatterns ?? []),
    );
  }

  const joined = haystack.join(' ').toLowerCase();
  return words.every(word => joined.includes(word));
}
