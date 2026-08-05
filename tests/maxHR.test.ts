import { describe, it, expect } from 'vitest';
import { deriveMaxHR, estimateMaxHR, MAX_HR_FLOOR, DEFAULT_AGE } from '../src/utils/maxHR';

describe('estimateMaxHR', () => {
  it('applies the 220-age regression', () => {
    expect(estimateMaxHR(30)).toBe(190);
    expect(estimateMaxHR(22)).toBe(198);
  });

  it('floors the estimate for older fighters', () => {
    // 220 - 70 = 150, below the floor. This is the case FitnessTrackerHub got
    // wrong: an unfloored estimate pushes every reading a zone too high.
    expect(estimateMaxHR(70)).toBe(MAX_HR_FLOOR);
    expect(estimateMaxHR(60)).toBe(MAX_HR_FLOOR);
  });

  it('falls back to the default age when none is given', () => {
    expect(estimateMaxHR(undefined)).toBe(220 - DEFAULT_AGE);
    expect(estimateMaxHR()).toBe(195);
  });

  it('treats nonsense ages as absent rather than propagating them', () => {
    expect(estimateMaxHR(0)).toBe(195);
    expect(estimateMaxHR(-5)).toBe(195);
    expect(estimateMaxHR(NaN)).toBe(195);
  });
});

describe('deriveMaxHR', () => {
  it('prefers the saved override over the estimate', () => {
    expect(deriveMaxHR({ age: 30, maxHR: 201 })).toBe(201);
  });

  it('does not floor a saved override', () => {
    // A measured value is the fighter's own data; clamping it would be wrong
    // even though the same number would be floored as an estimate.
    expect(deriveMaxHR({ age: 30, maxHR: 152 })).toBe(152);
  });

  it('falls back to the estimate when no override is set', () => {
    expect(deriveMaxHR({ age: 40 })).toBe(180);
  });

  it('ignores an unusable override instead of dividing zones by zero', () => {
    expect(deriveMaxHR({ age: 30, maxHR: 0 })).toBe(190);
    expect(deriveMaxHR({ age: 30, maxHR: -1 })).toBe(190);
    expect(deriveMaxHR({ age: 30, maxHR: NaN })).toBe(190);
  });

  it('handles a missing user', () => {
    expect(deriveMaxHR(null)).toBe(195);
    expect(deriveMaxHR(undefined)).toBe(195);
  });

  it('agrees with the old RoundTimer/Settings derivation for every plausible age', () => {
    // The formula those two screens shared is the one being preserved; this
    // pins that the unification adopted the correct side of the disagreement.
    for (let age = 16; age <= 75; age++) {
      expect(deriveMaxHR({ age })).toBe(Math.max(160, 220 - age));
    }
  });
});
