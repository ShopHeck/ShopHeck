/**
 * The nutrition library's shape.
 *
 * Everything here is authored data or a description of authored data. Nothing
 * in this module stores a value that can be computed from another: a recipe has
 * ingredients and no macros, a plan has recipes and no total. That is the whole
 * point — the old `MealPlan.totalMacros` claimed 1600 kcal for a plan whose
 * meals summed to 1120, and nothing could ever have caught it.
 *
 * The one apparent exception is `MealPlan.targetBand`, which is not a cached
 * sum but a *constraint*: the plan's design intent, asserted against the
 * computed total in CI. Nothing writes it from the meals, so it cannot drift.
 */

export interface Macros {
  calories: number;
  protein: number; // grams
  carbs: number;   // grams
  fat: number;     // grams
}

/**
 * Serving units, kept as a closed set so the quantity formatter can never be
 * handed something it does not know how to render. The old formatter branched
 * on `servingLabel.includes('scoop')` and then returned grams in both branches,
 * printing "45g" for a scoop of whey.
 */
export type ServingUnit =
  | 'g'
  | 'ml'
  | 'scoop'
  | 'tbsp'
  | 'tsp'
  | 'cup'
  | 'slice'
  | 'piece'
  | 'small'
  | 'medium'
  | 'large'
  | 'can'
  | 'pinch';

export type FoodCategory = 'protein' | 'carb' | 'fat' | 'vegetable' | 'seasoning';

/**
 * How the generator may use a food.
 *
 *  - `primary` — can anchor its category (chicken breast, rice, olive oil)
 *  - `side`    — only ever an accompaniment, never scaled to hit a target
 *  - `never`   — recipe-only (seasonings, supplements, compound items)
 */
export type GeneratorRole = 'primary' | 'side' | 'never';

export interface Serving {
  amount: number;
  unit: ServingUnit;
  /** Mass of one serving. Lets the UI show grams alongside "1½ scoops". */
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  serving: Serving;
  /** Macros for exactly ONE serving. */
  macros: Macros;
  /**
   * Serving bounds the generator may not leave. These are what make a
   * kilogram of Greek yogurt structurally impossible rather than merely
   * unlikely: the old generator divided the whole daily protein target by one
   * food's protein content and multiplied, with no ceiling at all.
   */
  minServings: number;
  maxServings: number;
  /**
   * Granularity of a plausible portion. Whole scoops and whole eggs step by 1;
   * spoons by 0.5; anything weighed on a scale by 0.1 of a serving.
   */
  step: number;
  generatorRole: GeneratorRole;
}

export interface RecipeIngredient {
  foodId: string;
  servings: number;
  /** Overrides the food's name in the rendered ingredient list, e.g. "shredded". */
  note?: string;
}

/** The six real slots. Recipes, plans and targets all use this set. */
export type MealSlot =
  | 'Breakfast'
  | 'Lunch'
  | 'Dinner'
  | 'Snack'
  | 'Pre-Workout'
  | 'Post-Workout';

export const MEAL_SLOTS: MealSlot[] = [
  'Breakfast',
  'Pre-Workout',
  'Lunch',
  'Post-Workout',
  'Dinner',
  'Snack',
];

/**
 * What a *logged* entry may carry. Migrated day-level macros from before meal
 * entries existed have no knowable slot, and inventing one would be a lie in
 * the user's own history.
 */
export type LoggedMealSlot = MealSlot | 'Unspecified';

export type MealGoal = 'Cut' | 'Maintain' | 'Build';

export interface Recipe {
  id: string;
  name: string;
  slot: MealSlot;
  description: string;
  ingredients: RecipeIngredient[];
}

/** Inclusive `[low, high]` bounds for each macro. */
export interface MacroBand {
  calories: [number, number];
  protein: [number, number];
  carbs: [number, number];
  fat: [number, number];
}

export interface MealPlan {
  id: string;
  name: string;
  goal: MealGoal;
  phase: string;
  description: string;
  /**
   * The plan's design intent, asserted against the computed total in CI.
   *
   * NOT a cached sum. `totalMacros` was one, and it drifted 480 kcal from
   * reality without anything noticing. Nothing writes this from the meals; the
   * meals are portioned to satisfy it.
   */
  targetBand: MacroBand;
  recipeIds: string[];
}

/**
 * A whole day's worth of macros.
 *
 * Deliberately a different type from `MealTarget` despite the identical fields.
 * The P0 defect was handing a day's numbers to a function that built one meal,
 * and the type system had nothing to say about it. Now it does.
 */
export interface DailyNutritionTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One slot's share of a `DailyNutritionTarget`. */
export interface MealTarget {
  slot: MealSlot;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Fraction of the day this slot carries, for display ("30% of today"). */
  share: number;
}
