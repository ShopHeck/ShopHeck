import { describe, expect, it } from 'vitest';
import { FOOD_DATABASE, getFood } from '../src/data/nutrition/foods';
import type { DailyNutritionTarget, Food } from '../src/data/nutrition/types';
import { MEAL_SLOTS } from '../src/data/nutrition/types';
import { generateDay, generateMealForTarget } from '../src/utils/nutrition/mealGenerator';
import { mealTargetForSlot, splitDailyTarget } from '../src/utils/nutrition/mealTargets';
import { atwaterCalories, formatQuantity } from '../src/utils/nutrition/macros';

/** The defaults the generator UI ships with — the exact numbers that broke it. */
const DAILY: DailyNutritionTarget = { calories: 2000, protein: 170, carbs: 200, fat: 65 };

describe('splitting a daily target', () => {
  it('divides the day across slots rather than handing each one the whole thing', () => {
    const targets = splitDailyTarget(DAILY);
    for (const target of targets) {
      expect(target.protein).toBeLessThan(DAILY.protein);
      expect(target.calories).toBeLessThan(DAILY.calories);
    }
  });

  it('sums back to the daily target', () => {
    const targets = splitDailyTarget(DAILY);
    const sum = (key: 'calories' | 'protein' | 'carbs' | 'fat') =>
      targets.reduce((total, t) => total + t[key], 0);
    expect(sum('protein')).toBeCloseTo(DAILY.protein, 6);
    expect(sum('carbs')).toBeCloseTo(DAILY.carbs, 6);
    expect(sum('fat')).toBeCloseTo(DAILY.fat, 6);
    expect(sum('calories')).toBeCloseTo(DAILY.calories, 6);
  });

  it('gives a slot a bigger share when the fighter eats fewer meals', () => {
    const sixMeals = mealTargetForSlot(DAILY, 'Lunch');
    const threeMeals = mealTargetForSlot(DAILY, 'Lunch', { slots: ['Breakfast', 'Lunch', 'Dinner'] });
    expect(threeMeals.protein).toBeGreaterThan(sixMeals.protein);
    // Still a share of the day, never the whole day.
    expect(threeMeals.protein).toBeLessThan(DAILY.protein);
  });

  it('moves carbohydrate toward the workout slots on a training day', () => {
    const slots = [...MEAL_SLOTS];
    const rest = splitDailyTarget(DAILY, slots, { trainingDay: false });
    const training = splitDailyTarget(DAILY, slots, { trainingDay: true });
    const carbsAt = (targets: typeof rest, slot: string) =>
      targets.find(t => t.slot === slot)!.carbs;
    expect(carbsAt(training, 'Pre-Workout')).toBeGreaterThan(carbsAt(rest, 'Pre-Workout'));
    expect(carbsAt(training, 'Post-Workout')).toBeGreaterThan(carbsAt(rest, 'Post-Workout'));
    expect(carbsAt(training, 'Dinner')).toBeLessThan(carbsAt(rest, 'Dinner'));
  });

  it('returns nothing when no slots are selected', () => {
    expect(splitDailyTarget(DAILY, [])).toEqual([]);
  });
});

describe('generating one meal', () => {
  it('never portions a food beyond the bounds it declares', () => {
    // The original defect: 170 g of protein divided by Greek yogurt's 10 g per
    // 100 g produced a 17x multiplier and 1.7 kg of yogurt in one sitting.
    for (let seed = 0; seed < 40; seed++) {
      const target = mealTargetForSlot(DAILY, 'Lunch');
      const result = generateMealForTarget(target, FOOD_DATABASE, { seed });
      if (!result.ok) continue;
      for (const item of result.meal.items) {
        const food = getFood(item.foodId) as Food;
        expect(item.servings, `${food.id} servings`).toBeGreaterThanOrEqual(food.minServings);
        expect(item.servings, `${food.id} servings`).toBeLessThanOrEqual(food.maxServings);
        // Nothing edible in one meal weighs a kilogram.
        expect(food.serving.grams * item.servings, `${food.id} grams`).toBeLessThan(1000);
      }
    }
  });

  it('hits the meal target rather than the daily one', () => {
    const target = mealTargetForSlot(DAILY, 'Lunch');
    const result = generateMealForTarget(target, FOOD_DATABASE, { seed: 7 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Within 25% of the slot's share, and nowhere near the day's 170 g.
    expect(result.meal.totals.protein).toBeGreaterThan(target.protein * 0.75);
    expect(result.meal.totals.protein).toBeLessThan(target.protein * 1.25);
    expect(result.meal.totals.protein).toBeLessThan(DAILY.protein * 0.6);
  });

  it('treats calories as a target rather than an afterthought', () => {
    // Calories used to be accepted by the UI and never read by the generator.
    const target = mealTargetForSlot(DAILY, 'Dinner');
    const result = generateMealForTarget(target, FOOD_DATABASE, { seed: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const drift = Math.abs(result.meal.totals.calories - target.calories);
    expect(drift).toBeLessThanOrEqual(Math.max(40, target.calories * 0.07));
  });

  it('is deterministic for a given seed', () => {
    const target = mealTargetForSlot(DAILY, 'Breakfast');
    const a = generateMealForTarget(target, FOOD_DATABASE, { seed: 99 });
    const b = generateMealForTarget(target, FOOD_DATABASE, { seed: 99 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rejects a target no combination of real portions can reach', () => {
    const impossible = {
      slot: 'Snack' as const,
      calories: 4000,
      protein: 400,
      carbs: 10,
      fat: 5,
      share: 1,
    };
    const result = generateMealForTarget(impossible, FOOD_DATABASE, { seed: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.misses.length).toBeGreaterThan(0);
    expect(result.message).toMatch(/library/i);
    // A rejection hands back numbers, never a meal that could be logged.
    expect(result).not.toHaveProperty('meal');
  });

  it('never selects a food the library marks as generator-ineligible', () => {
    const target = mealTargetForSlot(DAILY, 'Lunch');
    for (let seed = 0; seed < 25; seed++) {
      const result = generateMealForTarget(target, FOOD_DATABASE, { seed });
      if (!result.ok) continue;
      for (const item of result.meal.items) {
        expect(getFood(item.foodId)!.generatorRole, item.foodId).not.toBe('never');
      }
    }
  });

  it('honours an excluded food while alternatives remain', () => {
    const target = mealTargetForSlot(DAILY, 'Lunch');
    for (let seed = 0; seed < 20; seed++) {
      const result = generateMealForTarget(target, FOOD_DATABASE, {
        seed,
        excludeFoodIds: ['chicken-breast'],
      });
      if (!result.ok) continue;
      expect(result.meal.items.map(i => i.foodId)).not.toContain('chicken-breast');
    }
  });

  it('reports totals that match the sum of its own items', () => {
    const target = mealTargetForSlot(DAILY, 'Dinner');
    const result = generateMealForTarget(target, FOOD_DATABASE, { seed: 12 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summed = result.meal.items.reduce((total, i) => total + i.macros.protein, 0);
    expect(result.meal.totals.protein).toBeCloseTo(summed, 6);
  });
});

describe('generating a whole day', () => {
  it('produces meals whose combined totals approximate the daily target', () => {
    const result = generateDay(DAILY, [...MEAL_SLOTS], FOOD_DATABASE, {}, { seed: 5 });
    expect(result.rejections).toEqual([]);
    expect(result.meals).toHaveLength(MEAL_SLOTS.length);
    expect(result.totals.calories).toBeGreaterThan(DAILY.calories * 0.85);
    expect(result.totals.calories).toBeLessThan(DAILY.calories * 1.15);
    expect(result.totals.protein).toBeGreaterThan(DAILY.protein * 0.8);
  });

  it('varies the protein anchor across the day', () => {
    const result = generateDay(DAILY, ['Breakfast', 'Lunch', 'Dinner'], FOOD_DATABASE, {}, { seed: 21 });
    const proteins = result.meals.flatMap(meal =>
      meal.items.filter(i => getFood(i.foodId)!.category === 'protein').map(i => i.foodId),
    );
    expect(new Set(proteins).size).toBe(proteins.length);
  });

  it('reports the slots it could not satisfy without abandoning the rest', () => {
    // 300 kcal across six slots leaves each one below any real portion.
    const starvation: DailyNutritionTarget = { calories: 300, protein: 20, carbs: 20, fat: 5 };
    const result = generateDay(starvation, [...MEAL_SLOTS], FOOD_DATABASE, {}, { seed: 2 });
    expect(result.rejections.length).toBeGreaterThan(0);
    for (const rejection of result.rejections) {
      expect(rejection.message.length).toBeGreaterThan(0);
    }
  });
});

describe('quantity formatting', () => {
  // The old formatter branched on the serving label for scoops, cups, spoons
  // and slices, then returned grams down both branches.
  const cases: Array<[string, number, string]> = [
    ['whey-protein', 1.5, '1½ scoops'],
    ['whey-protein', 1, '1 scoop'],
    ['olive-oil', 2, '2 tbsp'],
    ['olive-oil', 0.5, '½ tbsp'],
    ['broccoli', 2, '2 cups'],
    ['whole-grain-bread', 2, '2 slices'],
    ['banana', 0.5, '½ medium'],
    ['chicken-breast', 1.8, '180g'],
    ['rice-cake', 3, '3'],
  ];

  it.each(cases)('renders %s x%s in its own unit', (id, servings, expected) => {
    expect(formatQuantity(getFood(id)!, servings)).toBe(expected);
  });

  it('never renders a countable unit as a weight', () => {
    for (const food of FOOD_DATABASE) {
      if (food.serving.unit === 'g' || food.serving.unit === 'ml') continue;
      expect(formatQuantity(food, 1)).not.toMatch(/\d+g$/);
    }
  });
});

describe('macro arithmetic', () => {
  it('computes Atwater energy from macros', () => {
    expect(atwaterCalories({ calories: 0, protein: 10, carbs: 20, fat: 5 })).toBe(165);
  });
});
