import { FOOD_DATABASE, requireFood } from './foods';
import { RECIPE_LIBRARY } from './recipes';
import { MEAL_PLANS } from './plans';
import type { Macros, MealPlan, Recipe, RecipeIngredient } from './types';
import {
  formatQuantity,
  macrosForServings,
  needsPluralName,
  pluralizeName,
  sumMacros,
} from '../../utils/nutrition/macros';

export * from './types';
export { FOOD_DATABASE, getFood, requireFood } from './foods';
export { RECIPE_LIBRARY } from './recipes';
export { MEAL_PLANS } from './plans';

const RECIPES_BY_ID = new Map(RECIPE_LIBRARY.map(r => [r.id, r]));
const PLANS_BY_ID = new Map(MEAL_PLANS.map(p => [p.id, p]));

export function getRecipe(id: string): Recipe | undefined {
  return RECIPES_BY_ID.get(id);
}

export function requireRecipe(id: string): Recipe {
  const recipe = RECIPES_BY_ID.get(id);
  if (!recipe) throw new Error(`Unknown recipe id: ${id}`);
  return recipe;
}

export function getMealPlan(id: string): MealPlan | undefined {
  return PLANS_BY_ID.get(id);
}

/**
 * A recipe's macros, computed from its ingredients every time.
 *
 * There is no cached counterpart to disagree with. `PresetMeal.macros` used to
 * be authored by hand alongside an ingredient list that implied something else
 * entirely — Fight Week Cut's lunch claimed 320 kcal for ingredients totalling
 * around 465.
 */
export function recipeMacros(recipe: Recipe): Macros {
  return sumMacros(recipe.ingredients.map(i => macrosForServings(requireFood(i.foodId), i.servings)));
}

/** A plan's macros: the sum of its recipes'. Likewise never stored. */
export function planMacros(plan: MealPlan): Macros {
  return sumMacros(plan.recipeIds.map(id => recipeMacros(requireRecipe(id))));
}

export function planRecipes(plan: MealPlan): Recipe[] {
  return plan.recipeIds.map(requireRecipe);
}

/** "220g Chicken Breast", "1½ scoops Whey Protein", "3 Rice Cakes", "2 Whole Eggs". */
export function formatIngredient(ingredient: RecipeIngredient): string {
  const food = requireFood(ingredient.foodId);
  const note = ingredient.note ? ` (${ingredient.note})` : '';
  // A pinch of pepper has no quantity worth printing.
  if (food.category === 'seasoning' && food.serving.unit === 'pinch') {
    return `${food.name}${note}`;
  }
  const name = needsPluralName(food, ingredient.servings) ? pluralizeName(food.name) : food.name;
  return `${formatQuantity(food, ingredient.servings)} ${name}${note}`;
}

/** Sorted unique values, for building filter chips. */
function facet<T>(items: T[], pick: (item: T) => string): string[] {
  return [...new Set(items.map(pick))].sort((a, b) => a.localeCompare(b));
}

export const MEAL_PLAN_PHASES = facet(MEAL_PLANS, p => p.phase);
export const FOOD_CATEGORIES = facet(FOOD_DATABASE, f => f.category);

/** Foods the generator may anchor on, for the "exclude a food" picker. */
export const GENERATOR_FOODS = FOOD_DATABASE.filter(f => f.generatorRole !== 'never');
