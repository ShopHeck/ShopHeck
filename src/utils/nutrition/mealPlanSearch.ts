import type { MealPlan } from '../../data/nutrition/types';

/**
 * Meal-plan free-text match. The query is trimmed before `includes` so a
 * pasted "  Fight Week Cut" still hits — the nonempty guard used to pass
 * while the raw string still carried leading spaces (Codex #115).
 */
export function mealPlanMatchesQuery(
  plan: Pick<MealPlan, 'name' | 'description' | 'phase'>,
  recipeNames: string[],
  query: string,
): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const hay = [plan.name, plan.description, plan.phase, ...recipeNames].join(' ').toLowerCase();
  return hay.includes(q);
}
