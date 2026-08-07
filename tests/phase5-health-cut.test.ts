import { describe, expect, it } from 'vitest';
import { evaluateCutSafety, AGGRESSIVE_LBS_PER_WEEK } from '../src/utils/cutSafety';
import type { CutProjection } from '../src/utils/weightCut';
import { mapHealthWeights, mapHealthWorkouts } from '../src/utils/healthImport';

function proj(partial: Partial<CutProjection>): CutProjection {
  return {
    trackable: true,
    status: 'behind',
    startWeight: 160,
    targetWeight: 145,
    currentWeight: 155,
    toGo: 10,
    totalDays: 42,
    daysElapsed: 14,
    daysRemaining: 28,
    idealToday: 155,
    paceDelta: 0,
    lbsPerDayNeeded: 10 / 28,
    lbsPerDayActual: 0,
    projectedWeighIn: 155,
    projectedMiss: 10,
    daysEarlyAtRate: null,
    trendEstablished: false,
    weighedIn: false,
    ...partial,
  };
}

describe('evaluateCutSafety', () => {
  it('is ok for a moderate needed rate', () => {
    const s = evaluateCutSafety(proj({ lbsPerDayNeeded: 1.5 / 7, lbsPerDayActual: 0 }));
    expect(s.level).toBe('ok');
    expect(s.message).toBe('');
  });

  it('flags aggressive needed weekly rate', () => {
    const s = evaluateCutSafety(proj({
      lbsPerDayNeeded: (AGGRESSIVE_LBS_PER_WEEK + 0.2) / 7,
      currentWeight: 160,
    }));
    expect(s.level).toBe('aggressive');
    expect(s.source).toBe('needed');
    expect(s.message).toMatch(/Aggressive/i);
  });

  it('flags extreme observed rate over needed', () => {
    const s = evaluateCutSafety(proj({
      lbsPerDayNeeded: 1 / 7,
      lbsPerDayActual: 4 / 7,
      trendEstablished: true,
      currentWeight: 160,
    }));
    expect(s.level).toBe('extreme');
    expect(s.source).toBe('observed');
  });

  it('skips made / untrackable cuts', () => {
    expect(evaluateCutSafety(proj({ status: 'made' })).level).toBe('ok');
    expect(evaluateCutSafety(proj({ trackable: false, status: 'no-fight' })).level).toBe('ok');
  });
});

describe('mapHealthWeights / mapHealthWorkouts', () => {
  it('converts kg to lbs and filters to camp window', () => {
    const noon = new Date('2026-03-15T12:00:00').getTime();
    const mapped = mapHealthWeights(
      [
        { dateMs: noon, kg: 70 },
        { dateMs: new Date('2026-01-01T12:00:00').getTime(), kg: 72 }, // outside
      ],
      {
        campStart: '2026-03-01',
        campEnd: '2026-04-01',
        existingDates: new Set(),
      },
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0].date).toBe('2026-03-15');
    expect(mapped[0].weight).toBeCloseTo(154.3, 0);
  });

  it('skips existing dates and maps workout activity types', () => {
    const noon = new Date('2026-03-15T12:00:00').getTime();
    const weights = mapHealthWeights(
      [{ dateMs: noon, kg: 70 }],
      { campStart: '2026-03-01', campEnd: '2026-04-01', existingDates: new Set(['2026-03-15']) },
    );
    expect(weights).toHaveLength(0);

    const workouts = mapHealthWorkouts(
      [
        { dateMs: noon, durationSec: 3600, activityType: 'boxing', sourceName: 'Apple Watch' },
        { dateMs: noon, durationSec: 1800, activityType: 'hiit' },
      ],
      { campStart: '2026-03-01', campEnd: '2026-04-01', existingKeys: new Set() },
    );
    expect(workouts).toHaveLength(2);
    expect(workouts[0]).toMatchObject({
      sessionType: 'skill',
      duration: 60,
      title: 'Boxing (Apple Watch)',
      completed: true,
    });
    expect(workouts[1]).toMatchObject({ sessionType: 'conditioning', duration: 30 });
  });
});
