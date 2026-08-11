import type { DailyNutritionTarget, MealSlot, MealTarget } from '../../data/nutrition/types';
import { MEAL_SLOTS } from '../../data/nutrition/types';
import { atwaterCalories } from './macros';

/**
 * Splitting a day into meals.
 *
 * This module exists because the generator used to skip the step entirely: it
 * took a `Macros` that happened to hold 2000 kcal and 170 g of protein and
 * built ONE meal to cover all of it. A daily target and a meal target are
 * different quantities, so they are different types, and the only way to get
 * from one to the other is through here.
 */

export interface AllocationContext {
  /**
   * The slots this fighter actually eats. A three-meal-a-day fighter's lunch is
   * a third of the day; a six-slot fighter's lunch is a fifth. Defaults to all
   * six slots.
   */
  slots?: MealSlot[];
  /**
   * Whether the day carries a training session. Shifts carbohydrate toward the
   * pre- and post-workout slots and away from dinner. Protein and fat barely
   * move — protein is spread for synthesis, and fat is kept away from training
   * regardless of the day.
   */
  trainingDay?: boolean;
}

type Weights = Record<MealSlot, number>;

/** Protein is spread fairly evenly; the workout slots take a little less. */
const PROTEIN_WEIGHTS: Weights = {
  Breakfast: 0.20,
  'Pre-Workout': 0.08,
  Lunch: 0.24,
  'Post-Workout': 0.18,
  Dinner: 0.24,
  Snack: 0.06,
};

/** Fat stays away from the workout slots — it slows gastric emptying. */
const FAT_WEIGHTS: Weights = {
  Breakfast: 0.24,
  'Pre-Workout': 0.04,
  Lunch: 0.28,
  'Post-Workout': 0.04,
  Dinner: 0.32,
  Snack: 0.08,
};

const CARB_WEIGHTS_TRAINING: Weights = {
  Breakfast: 0.18,
  'Pre-Workout': 0.16,
  Lunch: 0.22,
  'Post-Workout': 0.20,
  Dinner: 0.18,
  Snack: 0.06,
};

const CARB_WEIGHTS_REST: Weights = {
  Breakfast: 0.22,
  'Pre-Workout': 0.08,
  Lunch: 0.26,
  'Post-Workout': 0.10,
  Dinner: 0.28,
  Snack: 0.06,
};

/** Re-scale a weight vector so the selected slots sum to 1. */
function normalize(weights: Weights, slots: MealSlot[]): Map<MealSlot, number> {
  const total = slots.reduce((sum, s) => sum + weights[s], 0);
  const out = new Map<MealSlot, number>();
  // Every slot weight is positive, so `total` is only zero when no slots were
  // selected — in which case there is nothing to divide anyway.
  if (total <= 0) return out;
  for (const s of slots) out.set(s, weights[s] / total);
  return out;
}

function dedupe(slots: MealSlot[]): MealSlot[] {
  return MEAL_SLOTS.filter(s => slots.includes(s));
}

/**
 * Divide a daily target across meal slots. The returned targets sum back to the
 * daily figures (up to floating-point noise), which is the invariant that makes
 * "build a full day" trustworthy.
 *
 * Calories are not allocated on their own weight vector. Each slot's calorie
 * figure is its share of the day's *macro-implied* energy, so a carb-heavy
 * pre-workout slot carries the calories its own macros imply rather than a
 * number pulled from a separate table that would disagree with them.
 */
export function splitDailyTarget(
  daily: DailyNutritionTarget,
  slots: MealSlot[] = MEAL_SLOTS,
  ctx: AllocationContext = {},
): MealTarget[] {
  const selected = dedupe(slots);
  if (selected.length === 0) return [];

  const protein = normalize(PROTEIN_WEIGHTS, selected);
  const carbs = normalize(ctx.trainingDay ? CARB_WEIGHTS_TRAINING : CARB_WEIGHTS_REST, selected);
  const fat = normalize(FAT_WEIGHTS, selected);

  const dailyEnergy = atwaterCalories(daily);

  return selected.map(slot => {
    const p = daily.protein * (protein.get(slot) ?? 0);
    const c = daily.carbs * (carbs.get(slot) ?? 0);
    const f = daily.fat * (fat.get(slot) ?? 0);

    // With no macros to divide by, fall back to an even calorie split rather
    // than handing every slot zero — someone tracking calories only still
    // deserves a sensible per-meal number.
    const share = dailyEnergy > 0
      ? atwaterCalories({ calories: 0, protein: p, carbs: c, fat: f }) / dailyEnergy
      : 1 / selected.length;

    return {
      slot,
      calories: daily.calories * share,
      protein: p,
      carbs: c,
      fat: f,
      share,
    };
  });
}

/**
 * The target for a single slot inside the fighter's own meal pattern.
 *
 * `ctx.slots` is what stops this collapsing back into the original bug. Asking
 * for a lunch does not mean asking for the whole day; it means asking for
 * lunch's share of it.
 */
export function mealTargetForSlot(
  daily: DailyNutritionTarget,
  slot: MealSlot,
  ctx: AllocationContext = {},
): MealTarget {
  const pattern = ctx.slots?.length ? dedupe(ctx.slots) : MEAL_SLOTS;
  // A slot outside the fighter's stated pattern still has to resolve to
  // something, so widen the pattern to include it rather than returning zeros.
  const slots = pattern.includes(slot) ? pattern : dedupe([...pattern, slot]);
  const split = splitDailyTarget(daily, slots, ctx);
  const found = split.find(t => t.slot === slot);
  /* c8 ignore next -- `slots` is guaranteed to contain `slot` by the line above */
  if (!found) throw new Error(`No allocation produced for slot ${slot}`);
  return found;
}
