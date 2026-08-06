import { describe, expect, it } from 'vitest';
import { computeCutProjection, cutPhase } from '../src/utils/weightCut';
import type { FightCamp, WeightEntry } from '../src/types';

/**
 * The AI panel on the weight screen used to disappear the moment a fighter hit
 * their target. These cover the replacement: a made cut keeps the panel and
 * changes the question, and which question it changes to depends on how far
 * away the fight still is.
 */

const NOW = new Date('2026-08-05T12:00:00Z');

function camp(overrides: Partial<FightCamp> = {}): FightCamp {
  return {
    id: 'c1',
    fightDate: '2026-09-05',
    startDate: '2026-07-11',
    weightClass: 'Lightweight',
    currentWeight: 168,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 3,
    sport: 'Boxing',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    weeks: [],
    createdAt: '2026-07-11',
    ...overrides,
  } as FightCamp;
}

function weighIn(weight: number, date: string, officialWeighIn = false): WeightEntry {
  return { id: `w-${date}`, campId: 'c1', date, weight, officialWeighIn } as WeightEntry;
}

describe('cutPhase', () => {
  it('is a cut while the fighter is still above target', () => {
    const proj = computeCutProjection(camp(), [weighIn(162, '2026-08-04')], NOW);
    expect(proj.status).not.toBe('made');
    expect(cutPhase(proj)).toBe('cut');
  });

  it('is a hold when weight is made but no weigh-in has been recorded', () => {
    // Fight is 2026-09-05; NOW is 2026-08-05, so 31 days out.
    const proj = computeCutProjection(camp(), [weighIn(154, '2026-08-04')], NOW);
    expect(proj.status).toBe('made');
    expect(proj.weighedIn).toBe(false);
    expect(cutPhase(proj)).toBe('hold');
  });

  it('stays a hold at target inside fight week until the scale is marked', () => {
    // The case that made this worth changing. Four days out and at target is a
    // fighter HOLDING weight; the earlier "made + fight week" rule read it as a
    // completed cut and would have advised putting weight back on before the
    // official scale — advice that, followed, misses weight.
    const proj = computeCutProjection(
      camp({ fightDate: '2026-08-09' }),
      [weighIn(154.5, '2026-08-04')],
      NOW,
    );
    expect(proj.status).toBe('made');
    expect(proj.daysRemaining).toBe(4);
    expect(cutPhase(proj)).toBe('hold');
  });

  it('is a rehydration window once the fighter marks the official weigh-in', () => {
    const proj = computeCutProjection(
      camp({ fightDate: '2026-08-09' }),
      [weighIn(154.5, '2026-08-04', true)],
      NOW,
    );
    expect(proj.weighedIn).toBe(true);
    expect(cutPhase(proj)).toBe('rehydrate');
  });

  it('does not rehydrate a fighter who weighed in OVER target', () => {
    // They have hours to re-cut, not a refuel to plan.
    const proj = computeCutProjection(camp(), [weighIn(158, '2026-08-04', true)], NOW);
    expect(proj.weighedIn).toBe(true);
    expect(proj.status).not.toBe('made');
    expect(cutPhase(proj)).toBe('cut');
  });

  it('honours a weigh-in marked weeks out, rather than second-guessing the date', () => {
    // Some promotions weigh in well before fight night. The fighter told us the
    // scale happened; the calendar does not get a vote.
    const proj = computeCutProjection(camp(), [weighIn(154, '2026-08-04', true)], NOW);
    expect(proj.daysRemaining).toBe(31);
    expect(cutPhase(proj)).toBe('rehydrate');
  });

  it('reports the real days remaining on a made cut, not zero', () => {
    // The made branch used to return the zeroed default projection, which said
    // every fighter who hit their target was on weigh-in day — and would have
    // pinned the panel to rehydration advice six weeks out.
    const proj = computeCutProjection(camp(), [weighIn(150, '2026-08-04')], NOW);
    expect(proj.totalDays).toBe(56);
    expect(proj.daysElapsed).toBe(25);
    expect(proj.daysRemaining).toBe(31);
  });

  it('treats an off-season block as a cut phase rather than a refuel', () => {
    // No fight date means no weigh-in to have made, so `made` never applies and
    // the panel must not offer to plan a rehydration that has no deadline.
    const proj = computeCutProjection(camp({ fightDate: undefined }), [], NOW);
    expect(proj.status).toBe('no-fight');
    expect(cutPhase(proj)).toBe('cut');
  });
});
