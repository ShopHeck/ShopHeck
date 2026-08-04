import { describe, expect, it } from 'vitest';
import type { ConditioningTest } from '../src/types';
import { latestComparableTrend } from '../src/utils/conditioningMetrics';

function test(
  id: string,
  testType: string,
  value: number,
  date: string,
  unit: string,
): ConditioningTest {
  return {
    id,
    campId: 'camp',
    date,
    weekNumber: 1,
    testType,
    value,
    unit,
    notes: '',
    createdAt: `${date}T12:00:00.000Z`,
  };
}

describe('conditioning trends', () => {
  it('treats a lower run time as improvement', () => {
    const trend = latestComparableTrend([
      test('1', '1-Mile Run', 8, '2026-07-01', 'minutes'),
      test('2', '1-Mile Run', 7.5, '2026-07-15', 'minutes'),
    ]);

    expect(trend?.improvementPct).toBeCloseTo(6.25);
  });

  it('treats more repetitions as improvement', () => {
    const trend = latestComparableTrend([
      test('1', 'Push-up Max', 40, '2026-07-01', 'reps'),
      test('2', 'Push-up Max', 50, '2026-07-15', 'reps'),
    ]);

    expect(trend?.improvementPct).toBeCloseTo(25);
  });

  it('never compares different test types', () => {
    const trend = latestComparableTrend([
      test('1', '1-Mile Run', 8, '2026-07-01', 'minutes'),
      test('2', 'Push-up Max', 50, '2026-07-15', 'reps'),
    ]);

    expect(trend).toBeNull();
  });

  it('uses the most recently repeated metric', () => {
    const trend = latestComparableTrend([
      test('1', 'Push-up Max', 40, '2026-07-01', 'reps'),
      test('2', 'Push-up Max', 45, '2026-07-08', 'reps'),
      test('3', '400m Sprint', 80, '2026-07-10', 'seconds'),
      test('4', '400m Sprint', 76, '2026-07-20', 'seconds'),
    ]);

    expect(trend?.testType).toBe('400m Sprint');
    expect(trend?.improvementPct).toBeCloseTo(5);
  });
});
