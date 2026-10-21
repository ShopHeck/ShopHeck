import { describe, expect, it } from 'vitest';
import {
  MAX_SESSION_KCAL,
  bodyWeightLbsOn,
  estimateActiveKcal,
  parseSessionKcal,
} from '../src/utils/workoutEnergy';
import type { FightCamp, WeightEntry } from '../src/types';

function camp(extra: Partial<FightCamp> = {}): FightCamp {
  return {
    id: 'camp-1',
    weightClass: 'Lightweight',
    currentWeight: 160,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 3,
    sport: 'Boxing',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate: '2026-09-01',
    createdAt: '2026-09-01T12:00:00.000Z',
    ...extra,
  };
}

function weighIn(date: string, weight: number, campId = 'camp-1'): WeightEntry {
  return { id: `w-${date}-${campId}`, campId, date, weight, notes: '', createdAt: `${date}T08:00:00.000Z` };
}

describe('estimateActiveKcal', () => {
  it('uses net MET (MET − 1) × kg × hours', () => {
    // Skill at RPE 7: MET = 5.5 + (6/9) × 4.8 = 8.7 → 7.7 × (155 / 2.20462) kg × 1 h.
    expect(estimateActiveKcal({ sessionType: 'skill', durationMin: 60, rpe: 7, weightLbs: 155 })).toBe(541);
  });

  it('spans the session type range from RPE 1 to RPE 10', () => {
    const kg = 70;
    const lbs = kg * 2.20462;
    // Sparring: 7.8 MET at RPE 1, 12.8 MET at RPE 10.
    expect(estimateActiveKcal({ sessionType: 'sparring', durationMin: 60, rpe: 1, weightLbs: lbs })).toBe(Math.round(6.8 * kg));
    expect(estimateActiveKcal({ sessionType: 'sparring', durationMin: 60, rpe: 10, weightLbs: lbs })).toBe(Math.round(11.8 * kg));
  });

  it('scales with duration and ranks harder session types higher', () => {
    const base = { rpe: 7, weightLbs: 160 };
    const half = estimateActiveKcal({ ...base, sessionType: 'strength', durationMin: 30 })!;
    const full = estimateActiveKcal({ ...base, sessionType: 'strength', durationMin: 60 })!;
    expect(Math.abs(full - 2 * half)).toBeLessThanOrEqual(1);

    const at = (sessionType: 'sparring' | 'skill' | 'conditioning' | 'strength' | 'recovery') =>
      estimateActiveKcal({ ...base, sessionType, durationMin: 60 })!;
    expect(at('sparring')).toBeGreaterThan(at('skill'));
    expect(at('skill')).toBeGreaterThan(at('strength'));
    expect(at('strength')).toBeGreaterThan(at('recovery'));
  });

  it('clamps RPE outside 1–10', () => {
    const at = (rpe: number) => estimateActiveKcal({ sessionType: 'conditioning', durationMin: 45, rpe, weightLbs: 150 });
    expect(at(0)).toBe(at(1));
    expect(at(14)).toBe(at(10));
    expect(at(Number.NaN)).toBe(at(1));
  });

  it('caps at the per-session maximum', () => {
    expect(estimateActiveKcal({ sessionType: 'sparring', durationMin: 600, rpe: 10, weightLbs: 300 })).toBe(MAX_SESSION_KCAL);
  });

  it('returns null when it cannot estimate', () => {
    expect(estimateActiveKcal({ sessionType: 'rest', durationMin: 60, rpe: 5, weightLbs: 160 })).toBeNull();
    expect(estimateActiveKcal({ sessionType: 'skill', durationMin: 60, rpe: 5, weightLbs: null })).toBeNull();
    expect(estimateActiveKcal({ sessionType: 'skill', durationMin: 0, rpe: 5, weightLbs: 160 })).toBeNull();
    expect(estimateActiveKcal({ sessionType: 'skill', durationMin: Number.NaN, rpe: 5, weightLbs: 160 })).toBeNull();
  });
});

describe('bodyWeightLbsOn', () => {
  it('uses the latest weigh-in on or before the session date', () => {
    const entries = [weighIn('2026-09-03', 158), weighIn('2026-09-10', 156), weighIn('2026-09-20', 152)];
    expect(bodyWeightLbsOn(camp(), entries, '2026-09-15')).toBe(156);
    expect(bodyWeightLbsOn(camp(), entries, '2026-09-10')).toBe(156);
  });

  it('ignores other camps and later weigh-ins, falling back to the camp weight', () => {
    const entries = [weighIn('2026-09-05', 150, 'camp-2'), weighIn('2026-09-20', 152)];
    expect(bodyWeightLbsOn(camp(), entries, '2026-09-15')).toBe(160);
  });

  it('returns null with no usable weight', () => {
    expect(bodyWeightLbsOn(camp({ currentWeight: 0 }), [], '2026-09-15')).toBeNull();
  });
});

describe('parseSessionKcal', () => {
  it('treats blank as not tracked', () => {
    expect(parseSessionKcal('')).toBeUndefined();
    expect(parseSessionKcal('   ')).toBeUndefined();
  });

  it('accepts whole numbers in range', () => {
    expect(parseSessionKcal('1')).toBe(1);
    expect(parseSessionKcal(' 450 ')).toBe(450);
    expect(parseSessionKcal(String(MAX_SESSION_KCAL))).toBe(MAX_SESSION_KCAL);
  });

  it('rejects zero, decimals, negatives, out of range and junk', () => {
    for (const raw of ['0', '12.5', '-50', String(MAX_SESSION_KCAL + 1), 'abc', '1e3']) {
      expect(parseSessionKcal(raw)).toBe('invalid');
    }
  });
});
