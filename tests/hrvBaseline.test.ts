import { describe, expect, it } from 'vitest';
import {
  baselineProgress,
  compareHRVToBaseline,
  HRV_MIN_READINGS,
} from '../src/utils/hrvBaseline';
import type { HRVEntry, HRVSource } from '../src/types';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function daysBefore(n: number): string {
  return new Date(NOW.getTime() - n * 86400000).toISOString().slice(0, 10);
}

function entry(days: number, rmssd: number, source: HRVSource = 'manual', restingHR?: number): HRVEntry {
  const date = daysBefore(days);
  return { id: `${source}-${date}-${rmssd}`, campId: 'camp-1', date, rmssd, restingHR, source, createdAt: `${date}T06:00:00.000Z` };
}

/** Readings 8–14 days out: inside the baseline window, outside the recent one. */
const BASELINE_DAYS = [8, 10, 12, 14];
/** Readings 1–3 days out: inside the recent window. */
const RECENT_DAYS = [1, 2, 3];

describe('compareHRVToBaseline', () => {
  it('measures recent HRV against the fighter’s own baseline', () => {
    const c = compareHRVToBaseline([
      ...BASELINE_DAYS.map(d => entry(d, 100)),
      ...RECENT_DAYS.map(d => entry(d, 80)),
    ], NOW);
    expect(c).not.toBeNull();
    expect(c!.deltaPct).toBe(-20);
    expect(c!.recentCount).toBe(3);
    expect(c!.baselineCount).toBe(4);
    expect(c!.latestDate).toBe(daysBefore(1));
  });

  it('needs enough readings in both windows before comparing', () => {
    const tooFewRecent = [...BASELINE_DAYS.map(d => entry(d, 100)), entry(1, 80), entry(2, 80)];
    const tooFewBaseline = [entry(8, 100), entry(10, 100), ...RECENT_DAYS.map(d => entry(d, 80))];
    expect(compareHRVToBaseline(tooFewRecent, NOW)).toBeNull();
    expect(compareHRVToBaseline(tooFewBaseline, NOW)).toBeNull();
    expect(HRV_MIN_READINGS).toBe(3);
  });

  it('never lets a future-dated entry leak in', () => {
    const future = { ...entry(0, 10), date: new Date(NOW.getTime() + 5 * 86400000).toISOString().slice(0, 10) };
    const c = compareHRVToBaseline([
      ...BASELINE_DAYS.map(d => entry(d, 100)),
      ...RECENT_DAYS.map(d => entry(d, 80)),
      future,
    ], NOW);
    expect(c!.deltaPct).toBe(-20);
  });

  it('compares within one source, so switching measuring habit is not read as an HRV collapse', () => {
    // Overnight Fitbit HRV runs higher than a seated morning camera check. A
    // fighter who stopped syncing Fitbit and started camera checks has only
    // camera readings in the recent window. Pooled, those would be compared
    // against a baseline dominated by overnight values: a ~28% "drop" that is
    // nothing but the change of method.
    const entries = [
      ...BASELINE_DAYS.map(d => entry(d, 100, 'fitbit')),
      ...[9, 11, 13].map(d => entry(d, 60, 'camera')),
      ...RECENT_DAYS.map(d => entry(d, 60, 'camera')),
    ];
    const c = compareHRVToBaseline(entries, NOW);
    expect(c!.source).toBe('camera');
    expect(c!.deltaPct).toBe(0);
  });

  it('uses the source with the newest valid comparison when several qualify', () => {
    const entries = [
      ...BASELINE_DAYS.map(d => entry(d, 100, 'fitbit')),
      ...[2, 3, 4].map(d => entry(d, 90, 'fitbit')),
      ...BASELINE_DAYS.map(d => entry(d, 60, 'camera')),
      ...RECENT_DAYS.map(d => entry(d, 66, 'camera')),
    ];
    const c = compareHRVToBaseline(entries, NOW);
    expect(c!.source).toBe('camera');
    expect(c!.deltaPct).toBe(10);
  });

  it('compares resting heart rate on the same windows when the source recorded it', () => {
    const c = compareHRVToBaseline([
      ...BASELINE_DAYS.map(d => entry(d, 60, 'camera', 50)),
      ...RECENT_DAYS.map(d => entry(d, 60, 'camera', 56)),
    ], NOW);
    expect(c!.restingHR).not.toBeNull();
    expect(c!.restingHR!.deltaBpm).toBe(6);
  });

  it('leaves resting HR out rather than comparing too few readings of it', () => {
    const c = compareHRVToBaseline([
      ...BASELINE_DAYS.map(d => entry(d, 60, 'camera', 50)),
      entry(1, 60, 'camera', 58),
      entry(2, 60, 'camera'),
      entry(3, 60, 'camera'),
    ], NOW);
    expect(c!.deltaPct).toBe(0);
    expect(c!.restingHR).toBeNull();
  });
});

describe('baselineProgress', () => {
  it('counts one source’s readings toward each window, capped at what is needed', () => {
    const entries = [
      ...[8, 9, 10, 11, 12].map(d => entry(d, 60, 'camera')),
      entry(1, 60, 'camera'),
      ...RECENT_DAYS.map(d => entry(d, 100, 'fitbit')),
    ];
    expect(baselineProgress(entries, 'camera', NOW)).toEqual({ recent: 1, baseline: 3, ready: false });
  });

  it('is ready once both windows hold enough readings', () => {
    const entries = [
      ...BASELINE_DAYS.map(d => entry(d, 60, 'camera')),
      ...RECENT_DAYS.map(d => entry(d, 60, 'camera')),
    ];
    expect(baselineProgress(entries, 'camera', NOW).ready).toBe(true);
  });
});
