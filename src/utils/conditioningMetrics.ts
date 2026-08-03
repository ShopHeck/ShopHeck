import type { ConditioningTest } from '../types';

export type MetricDirection = 'higher-is-better' | 'lower-is-better';

export interface ConditioningMetricDefinition {
  label: string;
  unit: string;
  direction: MetricDirection;
}

export const CONDITIONING_METRICS: readonly ConditioningMetricDefinition[] = [
  { label: '3-Mile Run', unit: 'minutes', direction: 'lower-is-better' },
  { label: '1-Mile Run', unit: 'minutes', direction: 'lower-is-better' },
  { label: 'Beep Test', unit: 'level', direction: 'higher-is-better' },
  { label: '400m Sprint', unit: 'seconds', direction: 'lower-is-better' },
  { label: 'Push-up Max', unit: 'reps', direction: 'higher-is-better' },
  { label: 'Pull-up Max', unit: 'reps', direction: 'higher-is-better' },
  { label: 'Burpee 1-min', unit: 'reps', direction: 'higher-is-better' },
  { label: 'Jump Rope (5min)', unit: 'misses', direction: 'lower-is-better' },
  { label: 'VO2 Max (est)', unit: 'ml/kg/min', direction: 'higher-is-better' },
] as const;

export function getConditioningMetric(testType: string): ConditioningMetricDefinition | null {
  return CONDITIONING_METRICS.find(metric => metric.label === testType) ?? null;
}

export interface ConditioningTrend {
  testType: string;
  unit: string;
  first: number;
  latest: number;
  /** Positive means athletic improvement regardless of the metric's direction. */
  improvementPct: number;
  sampleCount: number;
}

/**
 * Compare only like-for-like tests. The most recently logged metric with at
 * least two samples is used, so a run time is never compared with push-up reps.
 */
export function latestComparableTrend(tests: ConditioningTest[]): ConditioningTrend | null {
  const sorted = [...tests].sort((a, b) => a.date.localeCompare(b.date));
  const grouped = new Map<string, ConditioningTest[]>();
  for (const test of sorted) {
    const group = grouped.get(test.testType) ?? [];
    group.push(test);
    grouped.set(test.testType, group);
  }

  const candidates = [...grouped.entries()]
    .filter(([, samples]) => samples.length >= 2)
    .sort(([, a], [, b]) => b[b.length - 1].date.localeCompare(a[a.length - 1].date));

  const [testType, samples] = candidates[0] ?? [];
  if (!testType || !samples) return null;

  const first = samples[0].value;
  const latest = samples[samples.length - 1].value;
  if (!Number.isFinite(first) || !Number.isFinite(latest) || first === 0) return null;

  const metric = getConditioningMetric(testType);
  const rawPct = ((latest - first) / Math.abs(first)) * 100;
  const improvementPct = metric?.direction === 'lower-is-better' ? -rawPct : rawPct;

  return {
    testType,
    unit: samples[samples.length - 1].unit || metric?.unit || '',
    first,
    latest,
    improvementPct,
    sampleCount: samples.length,
  };
}
