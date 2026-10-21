import { parseISO, subDays } from 'date-fns';
import type { HRVEntry, HRVSource } from '../types';

/** Days of HRV used as the fighter's own baseline. */
export const HRV_BASELINE_DAYS = 28;
/** Days of HRV treated as "recent" and compared against that baseline. */
export const HRV_RECENT_DAYS = 5;
/** Minimum readings in each window before an HRV comparison means anything. */
export const HRV_MIN_READINGS = 3;
/**
 * HRV this far below baseline is a genuine suppression rather than noise.
 *
 * Shared by camp adaptation and the readiness score so the two can never
 * disagree about what "suppressed" means — one proposing a deload while the
 * other scores the same week as fully recovered.
 */
export const HRV_SUPPRESSED_PCT = -8;

export interface HRVBaselineComparison {
  /** The one source this comparison was drawn from. */
  source: HRVSource;
  /** Mean rMSSD across the recent window, ms. */
  recentMean: number;
  /** Mean rMSSD across the baseline window, ms. */
  baselineMean: number;
  /** Recent against baseline, whole percent. Negative is suppressed. */
  deltaPct: number;
  recentCount: number;
  baselineCount: number;
  /** Date of the newest reading in the recent window, yyyy-MM-dd. */
  latestDate: string;
  /**
   * Resting heart rate over the same two windows, when the source recorded
   * enough of it to compare. A positive `deltaBpm` is elevated — the direction
   * that signals accumulated strain, illness or dehydration.
   */
  restingHR: { recentMean: number; baselineMean: number; deltaBpm: number } | null;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function compareSource(
  source: HRVSource,
  entries: HRVEntry[],
  now: Date,
): HRVBaselineComparison | null {
  const recentFrom = subDays(now, HRV_RECENT_DAYS);
  const baselineFrom = subDays(now, HRV_BASELINE_DAYS);

  const recent: HRVEntry[] = [];
  const baseline: HRVEntry[] = [];
  for (const e of entries) {
    const d = parseISO(e.date);
    if (d > now) continue; // never let a future-dated entry leak in
    if (d >= recentFrom) recent.push(e);
    else if (d >= baselineFrom) baseline.push(e);
  }

  if (recent.length < HRV_MIN_READINGS || baseline.length < HRV_MIN_READINGS) return null;

  const recentMean = mean(recent.map(e => e.rmssd));
  const baselineMean = mean(baseline.map(e => e.rmssd));
  if (baselineMean <= 0) return null;

  const hr = (list: HRVEntry[]) =>
    list.map(e => e.restingHR).filter((v): v is number => typeof v === 'number' && v > 0);
  const recentHR = hr(recent);
  const baselineHR = hr(baseline);
  const restingHR = recentHR.length >= HRV_MIN_READINGS && baselineHR.length >= HRV_MIN_READINGS
    ? {
        recentMean: mean(recentHR),
        baselineMean: mean(baselineHR),
        deltaBpm: mean(recentHR) - mean(baselineHR),
      }
    : null;

  return {
    source,
    recentMean,
    baselineMean,
    deltaPct: Math.round(((recentMean - baselineMean) / baselineMean) * 100),
    recentCount: recent.length,
    baselineCount: baseline.length,
    latestDate: recent.reduce((max, e) => (e.date > max ? e.date : max), recent[0].date),
    restingHR,
  };
}

/**
 * Recent HRV against the fighter's own rolling baseline.
 *
 * Deliberately relative, never absolute: population HRV ranges span an order of
 * magnitude, so "RMSSD 45" says nothing without knowing whose body it came
 * from. The baseline window excludes the recent window so a genuinely
 * suppressed stretch cannot drag its own comparison down and hide itself.
 *
 * Computed per source, never pooled. Sources measure different physiology: a
 * Fitbit reports overnight RMSSD during sleep, a camera check measures a few
 * seated minutes after waking, and a chest strap reads beat-to-beat intervals
 * directly. Pooling them puts a source switch into the baseline — a fighter who
 * moves from overnight readings to morning ones would read as a sudden HRV
 * collapse that never happened. The source compared is the one with the newest
 * valid comparison, since that is the fighter's current measuring habit.
 *
 * `now` is the evaluation moment; entries dated after it are excluded.
 */
export function compareHRVToBaseline(
  entries: HRVEntry[],
  now: Date,
): HRVBaselineComparison | null {
  const bySource = new Map<HRVSource, HRVEntry[]>();
  for (const e of entries) {
    const list = bySource.get(e.source);
    if (list) list.push(e);
    else bySource.set(e.source, [e]);
  }

  let best: HRVBaselineComparison | null = null;
  for (const [source, list] of bySource) {
    const c = compareSource(source, list, now);
    if (!c) continue;
    const newer = !best || c.latestDate > best.latestDate;
    const tieWithMoreData = best !== null
      && c.latestDate === best.latestDate
      && c.recentCount + c.baselineCount > best.recentCount + best.baselineCount;
    if (newer || tieWithMoreData) best = c;
  }
  return best;
}

export interface BaselineProgress {
  /** Readings in the recent window, capped at what the comparison needs. */
  recent: number;
  /** Readings in the baseline window, capped likewise. */
  baseline: number;
  /** Both windows hold enough readings to compare. */
  ready: boolean;
}

/**
 * How far one source's readings are from supporting a baseline comparison —
 * what the vitals card shows while a fighter is still building one.
 */
export function baselineProgress(
  entries: HRVEntry[],
  source: HRVSource,
  now: Date,
): BaselineProgress {
  const recentFrom = subDays(now, HRV_RECENT_DAYS);
  const baselineFrom = subDays(now, HRV_BASELINE_DAYS);
  let recent = 0;
  let baseline = 0;
  for (const e of entries) {
    if (e.source !== source) continue;
    const d = parseISO(e.date);
    if (d > now) continue;
    if (d >= recentFrom) recent += 1;
    else if (d >= baselineFrom) baseline += 1;
  }
  return {
    recent: Math.min(recent, HRV_MIN_READINGS),
    baseline: Math.min(baseline, HRV_MIN_READINGS),
    ready: recent >= HRV_MIN_READINGS && baseline >= HRV_MIN_READINGS,
  };
}
