import { describe, expect, it } from 'vitest';
import { FOOD_DATABASE } from '../src/data/nutrition/foods';
import { RECIPE_LIBRARY } from '../src/data/nutrition/recipes';
import { MEAL_PLANS } from '../src/data/nutrition/plans';
import { planMacros, recipeMacros } from '../src/data/nutrition';
import { MEAL_SLOTS, type MacroBand, type ServingUnit } from '../src/data/nutrition/types';
import { atwaterCalories } from '../src/utils/nutrition/macros';
import { EXERCISE_LIBRARY, TECHNIQUE_LIBRARY } from '../src/data/library';

/**
 * Content integrity.
 *
 * These are the checks that would have caught the three P0 defects at build
 * time. `npm run quality` runs vitest, and CI runs `npm run quality`, so a plan
 * whose meals stop adding up to what it advertises fails the build rather than
 * shipping.
 */

const VALID_UNITS: ServingUnit[] = [
  'g', 'ml', 'scoop', 'tbsp', 'tsp', 'cup', 'slice', 'piece',
  'small', 'medium', 'large', 'can', 'pinch',
];

const VALID_CATEGORIES = ['protein', 'carb', 'fat', 'vegetable', 'seasoning'];
const VALID_ROLES = ['primary', 'side', 'never'];
const VALID_GOALS = ['Cut', 'Maintain', 'Build'];

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

describe('food database', () => {
  it('has no duplicate ids', () => {
    expect(duplicates(FOOD_DATABASE.map(f => f.id))).toEqual([]);
  });

  it('uses only known units, categories and generator roles', () => {
    for (const food of FOOD_DATABASE) {
      expect(VALID_UNITS, `${food.id} unit`).toContain(food.serving.unit);
      expect(VALID_CATEGORIES, `${food.id} category`).toContain(food.category);
      expect(VALID_ROLES, `${food.id} generatorRole`).toContain(food.generatorRole);
    }
  });

  it('has positive serving sizes and non-negative macros', () => {
    for (const food of FOOD_DATABASE) {
      expect(food.serving.amount, `${food.id} serving amount`).toBeGreaterThan(0);
      expect(food.serving.grams, `${food.id} serving grams`).toBeGreaterThan(0);
      for (const [macro, value] of Object.entries(food.macros)) {
        expect(value, `${food.id} ${macro}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('has coherent serving bounds the generator can step through', () => {
    for (const food of FOOD_DATABASE) {
      expect(food.minServings, `${food.id} minServings`).toBeGreaterThan(0);
      expect(food.maxServings, `${food.id} maxServings`).toBeGreaterThanOrEqual(food.minServings);
      expect(food.step, `${food.id} step`).toBeGreaterThan(0);
      // A step that does not divide the range leaves the maximum unreachable,
      // so the generator would silently never portion the food to its ceiling.
      const steps = (food.maxServings - food.minServings) / food.step;
      expect(Math.abs(steps - Math.round(steps)), `${food.id} step must divide its serving range`)
        .toBeLessThan(1e-9);
    }
  });

  it('declares calories consistent with the energy its macros imply', () => {
    // Wide on purpose. Fibre yields ~2 kcal/g in reality against 4 in the
    // Atwater formula, so high-fibre vegetables read materially high. This
    // catches transposed digits and macros typed into the wrong column, which
    // is what it is for — it is not a metabolic model.
    for (const food of FOOD_DATABASE) {
      const implied = atwaterCalories(food.macros);
      const slack = Math.max(20, implied * 0.2);
      expect(
        Math.abs(food.macros.calories - implied),
        `${food.id}: ${food.macros.calories} kcal declared, ${implied.toFixed(1)} implied by macros`,
      ).toBeLessThanOrEqual(slack);
    }
  });
});

describe('recipe library', () => {
  it('has no duplicate ids', () => {
    expect(duplicates(RECIPE_LIBRARY.map(r => r.id))).toEqual([]);
  });

  it('references only foods that exist', () => {
    const known = new Set(FOOD_DATABASE.map(f => f.id));
    for (const recipe of RECIPE_LIBRARY) {
      for (const ingredient of recipe.ingredients) {
        expect(known, `${recipe.id} references unknown food ${ingredient.foodId}`)
          .toContain(ingredient.foodId);
      }
    }
  });

  it('has positive ingredient quantities', () => {
    for (const recipe of RECIPE_LIBRARY) {
      expect(recipe.ingredients.length, `${recipe.id} has no ingredients`).toBeGreaterThan(0);
      for (const ingredient of recipe.ingredients) {
        expect(ingredient.servings, `${recipe.id} → ${ingredient.foodId}`).toBeGreaterThan(0);
      }
    }
  });

  it('uses only known meal slots', () => {
    for (const recipe of RECIPE_LIBRARY) {
      expect(MEAL_SLOTS, `${recipe.id} slot`).toContain(recipe.slot);
    }
  });

  it('produces macros consistent with the energy they imply', () => {
    for (const recipe of RECIPE_LIBRARY) {
      const macros = recipeMacros(recipe);
      const implied = atwaterCalories(macros);
      const slack = Math.max(30, implied * 0.15);
      expect(
        Math.abs(macros.calories - implied),
        `${recipe.id}: ${macros.calories.toFixed(0)} kcal computed, ${implied.toFixed(0)} implied`,
      ).toBeLessThanOrEqual(slack);
    }
  });
});

describe('meal plans', () => {
  it('has no duplicate ids', () => {
    expect(duplicates(MEAL_PLANS.map(p => p.id))).toEqual([]);
  });

  it('references only recipes that exist', () => {
    const known = new Set(RECIPE_LIBRARY.map(r => r.id));
    for (const plan of MEAL_PLANS) {
      expect(plan.recipeIds.length, `${plan.id} has no meals`).toBeGreaterThan(0);
      for (const id of plan.recipeIds) {
        expect(known, `${plan.id} references unknown recipe ${id}`).toContain(id);
      }
    }
  });

  it('uses only known goals and well-formed bands', () => {
    for (const plan of MEAL_PLANS) {
      expect(VALID_GOALS, `${plan.id} goal`).toContain(plan.goal);
      for (const macro of Object.keys(plan.targetBand) as (keyof MacroBand)[]) {
        const [low, high] = plan.targetBand[macro];
        expect(low, `${plan.id} ${macro} band low`).toBeGreaterThanOrEqual(0);
        expect(high, `${plan.id} ${macro} band high`).toBeGreaterThan(low);
      }
    }
  });

  /**
   * The check that P0-3 was about. Fight Week Cut advertised 1600 kcal against
   * meals totalling 1120; nothing failed, because the total was stored rather
   * than computed. Now the total is computed and the advertised figure is a
   * band, so drifting out of it breaks the build.
   */
  it('computes totals that land inside each plan\'s target band', () => {
    const failures: string[] = [];

    for (const plan of MEAL_PLANS) {
      const total = planMacros(plan);
      for (const macro of Object.keys(plan.targetBand) as (keyof MacroBand)[]) {
        const [low, high] = plan.targetBand[macro];
        const actual = total[macro];
        if (actual < low || actual > high) {
          failures.push(
            `${plan.id} ${macro}: ${actual.toFixed(1)} outside [${low}, ${high}] ` +
            `(${actual < low ? 'under' : 'over'} by ${(actual < low ? low - actual : actual - high).toFixed(1)})`,
          );
        }
      }
    }

    expect(failures.join('\n')).toBe('');
  });
});

describe('training library ids', () => {
  // No test covered this before. The check is identical to the nutrition one
  // and the libraries are large enough for a copy-pasted id to go unnoticed.
  it('are unique within and across the exercise and technique libraries', () => {
    expect(duplicates(EXERCISE_LIBRARY.map(e => e.id))).toEqual([]);
    expect(duplicates(TECHNIQUE_LIBRARY.map(t => t.id))).toEqual([]);
    expect(duplicates([...EXERCISE_LIBRARY, ...TECHNIQUE_LIBRARY].map(i => i.id))).toEqual([]);
  });
});
