import type { MacroEntry, MealEntry, MealItem, MealSource, NutritionLog } from '../../types';
import type { LoggedMealSlot } from '../../data/nutrition/types';
import { requireFood } from '../../data/nutrition/foods';
import { requireRecipe } from '../../data/nutrition';
import { macrosForServings, roundMacros, sumMacros, ZERO_MACROS } from './macros';
import type { GeneratedMeal } from './mealGenerator';

/**
 * Day-level nutrition arithmetic.
 *
 * `deriveDayTotals` is the only way to get a day's macros. There is no stored
 * field to read instead, and no writer that could overwrite one meal with
 * another — which is what happened when the generator wrote its meal's totals
 * into the day and the reducer merged the incoming log over the existing one.
 */

export function deriveDayTotals(meals: MealEntry[]): MacroEntry {
  return sumMacros(meals.map(m => m.totals));
}

export function deriveDayTotalsRounded(meals: MealEntry[]): MacroEntry {
  return roundMacros(deriveDayTotals(meals));
}

/** Totals for one slot, for the per-slot subheadings in the tracker. */
export function totalsForSlot(meals: MealEntry[], slot: LoggedMealSlot): MacroEntry {
  return sumMacros(meals.filter(m => m.mealSlot === slot).map(m => m.totals));
}

export interface NewMealEntry {
  id: string;
  date: string;
  time: string;
  mealSlot: LoggedMealSlot;
  items: MealItem[];
  source: MealSource;
  recipeId?: string;
}

/**
 * The single constructor for a meal entry.
 *
 * `totals` is computed here and nowhere else, so an entry whose totals
 * disagree with its items cannot be built.
 */
export function buildMealEntry(entry: NewMealEntry): MealEntry {
  return {
    ...entry,
    totals: sumMacros(entry.items.map(i => i.macros)),
  };
}

export function itemFromFood(
  id: string,
  foodId: string,
  servings: number,
  name?: string,
): MealItem {
  const food = requireFood(foodId);
  return {
    id,
    foodId,
    name: name ?? food.name,
    servings,
    unit: food.serving.unit,
    macros: macrosForServings(food, servings),
  };
}

/** A free-text item for something not in the library. */
export function itemFromManualEntry(id: string, name: string, macros: MacroEntry): MealItem {
  return { id, name, servings: 1, unit: 'piece', macros };
}

export function itemsFromRecipe(recipeId: string, makeId: (index: number) => string): MealItem[] {
  return requireRecipe(recipeId).ingredients
    // Seasonings carry no macros and would clutter a logged meal with rows of
    // "Salt". They stay in the recipe, which is where they mean something.
    .filter(ingredient => requireFood(ingredient.foodId).category !== 'seasoning')
    .map((ingredient, index) => itemFromFood(makeId(index), ingredient.foodId, ingredient.servings));
}

export function itemsFromGeneratedMeal(meal: GeneratedMeal, makeId: (index: number) => string): MealItem[] {
  return meal.items.map((item, index) => ({
    id: makeId(index),
    foodId: item.foodId,
    name: item.name,
    servings: item.servings,
    unit: item.unit,
    macros: item.macros,
  }));
}

/**
 * Migrate a pre-meal-entries day.
 *
 * Older documents recorded one `macros` object for the whole day with no way to
 * know which meals it covered, so it becomes a single imported entry rather
 * than being attributed to a slot it may not belong to. The legacy field is
 * dropped in the same step: leaving it would mean every totals call site
 * carries a fallback branch forever.
 */
export function migrateNutritionLog(log: NutritionLog & { macros?: MacroEntry }): NutritionLog {
  const { macros, ...rest } = log;
  if (rest.meals?.length) return { ...rest, meals: rest.meals };

  const meals: MealEntry[] = macros && hasAnyMacro(macros)
    ? [
        buildMealEntry({
          id: `${log.id}-imported`,
          date: log.date,
          time: '12:00',
          mealSlot: 'Unspecified',
          source: 'imported',
          items: [
            {
              id: `${log.id}-imported-item`,
              name: 'Logged macros',
              servings: 1,
              unit: 'piece',
              macros,
            },
          ],
        }),
      ]
    : [];

  return { ...rest, meals };
}

function hasAnyMacro(macros: MacroEntry): boolean {
  return macros.calories > 0 || macros.protein > 0 || macros.carbs > 0 || macros.fat > 0;
}

export { ZERO_MACROS };
