import { describe, expect, it } from 'vitest';
import { mealPlanMatchesQuery } from '../src/utils/nutrition/mealPlanSearch';

const plan = {
  name: 'Fight Week Cut',
  description: 'Low residue, high protein.',
  phase: 'Fight Week',
};

describe('mealPlanMatchesQuery', () => {
  it('matches a padded query against the trimmed plan name', () => {
    // Falsified: `toLowerCase()` without `trim()` made "  Fight Week Cut"
    // miss, because the haystack has no leading spaces (Codex #115).
    expect(mealPlanMatchesQuery(plan, ['Chicken and Rice'], '  Fight Week Cut')).toBe(true);
  });

  it('treats whitespace-only as no filter', () => {
    expect(mealPlanMatchesQuery(plan, [], '   ')).toBe(true);
  });

  it('still rejects a name that is not on the plan', () => {
    expect(mealPlanMatchesQuery(plan, ['Chicken and Rice'], 'teep kick')).toBe(false);
  });
});
