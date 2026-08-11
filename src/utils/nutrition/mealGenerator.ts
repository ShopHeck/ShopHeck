import type {
  DailyNutritionTarget,
  Food,
  Macros,
  MealSlot,
  MealTarget,
  ServingUnit,
} from '../../data/nutrition/types';
import { formatGrams, formatQuantity, macrosForServings, sumMacros } from './macros';
import { splitDailyTarget, type AllocationContext } from './mealTargets';

/**
 * Meal generation.
 *
 * The old implementation divided a macro target by one food's content and
 * multiplied the serving by the result, unbounded — 170 g of protein against
 * Greek yogurt's 10 g per 100 g produced 1.7 kg of yogurt, and calories were
 * never an input at all. This one searches instead: it samples food
 * combinations, solves each one's servings inside the bounds the food itself
 * declares, and scores the result against all four macros including calories.
 *
 * Two properties follow from bounding the search rather than solving in closed
 * form. Every result is physically plausible, because no serving vector outside
 * the bounds is ever considered. And an impossible target *fails* — there is no
 * multiplier to run away with — so the generator can say so instead of emitting
 * something absurd.
 */

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat';

const MACRO_KEYS: MacroKey[] = ['calories', 'protein', 'carbs', 'fat'];

const MACRO_LABELS: Record<MacroKey, string> = {
  calories: 'calories',
  protein: 'protein',
  carbs: 'carbohydrate',
  fat: 'fat',
};

const MACRO_UNITS: Record<MacroKey, string> = {
  calories: ' kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
};

/** How much each macro pulls on the search. Protein leads; fighters cut on it. */
const COST_WEIGHTS: Record<MacroKey, number> = {
  calories: 1.0,
  protein: 1.1,
  carbs: 0.8,
  fat: 0.8,
};

/**
 * Absolute slack, in each macro's own unit.
 *
 * A purely relative tolerance is unusable at the small end: 10% of a snack's
 * 8 g fat is 0.8 g, which no combination of real portions will ever hit. A
 * result passes on the relative OR the absolute test, whichever is kinder.
 */
export const ABSOLUTE_TOLERANCE: Record<MacroKey, number> = {
  calories: 40,
  protein: 6,
  carbs: 8,
  fat: 5,
};

export const RELATIVE_TOLERANCE: Record<MacroKey, number> = {
  calories: 0.07,
  protein: 0.10,
  carbs: 0.10,
  fat: 0.10,
};

export interface GeneratedItem {
  foodId: string;
  name: string;
  servings: number;
  unit: ServingUnit;
  /** "1½ scoops", "180g" — rendered in the food's own unit. */
  quantityLabel: string;
  /** "45g" — mass, for foods measured in scoops and spoons. */
  gramsLabel: string;
  macros: Macros;
}

export interface GeneratedMeal {
  slot: MealSlot;
  target: MealTarget;
  items: GeneratedItem[];
  totals: Macros;
  /** The seed that produced this meal, so a result can be reproduced. */
  seed: number;
}

export interface MacroMiss {
  macro: MacroKey;
  target: number;
  achieved: number;
  /** Signed relative error. Positive means the meal overshoots the target. */
  relativeError: number;
}

export type GenerateMealResult =
  | { ok: true; meal: GeneratedMeal }
  | {
      ok: false;
      misses: MacroMiss[];
      message: string;
      /**
       * Totals of the closest combination found. Enough for the UI to explain
       * the rejection, and deliberately NOT a meal — a rejected target must not
       * be one click away from being logged.
       */
      closest: Macros;
      seed: number;
    };

export interface GeneratorOptions {
  seed?: number;
  /** Food combinations to try. More is slower and slightly better. */
  candidates?: number;
  /** Foods the fighter has excluded, plus anything already used today. */
  excludeFoodIds?: string[];
  /** Include vegetables in generated meals. */
  includeVegetables?: boolean;
}

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

/**
 * mulberry32. Small, fast, and — the part that matters here — deterministic,
 * so a generated meal is a pure function of its seed and the library. Tests
 * assert on exact output; "Regenerate" just advances the seed.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * The serving counts a food may take: zero, or anything from its minimum to its
 * maximum in its own step. Zero is included so the search can drop a food
 * outright rather than being forced to wedge a minimum portion of oil into a
 * target that has no room for it — but there is no value between zero and the
 * minimum, so a food that IS present is always present in a real portion.
 */
function servingOptions(food: Food): number[] {
  const steps = Math.max(0, Math.round((food.maxServings - food.minServings) / food.step));
  const values = [0];
  for (let i = 0; i <= steps; i++) {
    values.push(Number((food.minServings + i * food.step).toFixed(4)));
  }
  return values;
}

function relativeError(actual: number, target: number, macro: MacroKey): number {
  const denom = Math.max(target, ABSOLUTE_TOLERANCE[macro]);
  return (actual - target) / denom;
}

function cost(totals: Macros, target: MealTarget): number {
  return MACRO_KEYS.reduce(
    (sum, macro) => sum + COST_WEIGHTS[macro] * Math.abs(relativeError(totals[macro], target[macro], macro)),
    0,
  );
}

function totalsFor(foods: Food[], servings: number[]): Macros {
  return sumMacros(foods.map((food, i) => macrosForServings(food, servings[i])));
}

/**
 * Coordinate descent over the serving vector: sweep the foods, and for each one
 * take its best serving count with the others held fixed. Repeat until a full
 * sweep changes nothing.
 *
 * The option sets are small (a few dozen values per food) and the cost function
 * is separable enough that this converges in two or three sweeps. It can settle
 * in a local minimum, which is what sampling many combinations is for.
 */
function solveServings(foods: Food[], target: MealTarget): { servings: number[]; cost: number } {
  const options = foods.map(servingOptions);

  // Start each food at the portion that alone would satisfy the macro it leads
  // on. A good starting point mostly removes the local-minimum problem before
  // the sweeps begin.
  const servings = foods.map((food, i) => {
    const lead: MacroKey =
      food.category === 'protein' ? 'protein' : food.category === 'carb' ? 'carbs' : 'fat';
    const per = food.macros[lead];
    const ideal = per > 0 ? target[lead] / per : food.minServings;
    return options[i].reduce((best, v) => (Math.abs(v - ideal) < Math.abs(best - ideal) ? v : best), options[i][0]);
  });

  let current = cost(totalsFor(foods, servings), target);

  for (let sweep = 0; sweep < 8; sweep++) {
    let improved = false;
    for (let i = 0; i < foods.length; i++) {
      const original = servings[i];
      let bestValue = original;
      let bestCost = current;
      for (const value of options[i]) {
        if (value === original) continue;
        servings[i] = value;
        const c = cost(totalsFor(foods, servings), target);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          bestValue = value;
        }
      }
      servings[i] = bestValue;
      if (bestValue !== original) {
        current = bestCost;
        improved = true;
      }
    }
    if (!improved) break;
  }

  return { servings, cost: current };
}

function withinTolerance(totals: Macros, target: MealTarget): MacroMiss[] {
  const misses: MacroMiss[] = [];
  for (const macro of MACRO_KEYS) {
    const achieved = totals[macro];
    const wanted = target[macro];
    const absolute = Math.abs(achieved - wanted);
    if (absolute <= ABSOLUTE_TOLERANCE[macro]) continue;
    const relative = wanted > 0 ? absolute / wanted : Infinity;
    if (relative <= RELATIVE_TOLERANCE[macro]) continue;
    misses.push({
      macro,
      target: wanted,
      achieved,
      relativeError: relativeError(achieved, wanted, macro),
    });
  }
  return misses;
}

function describeRejection(misses: MacroMiss[], slot: MealSlot): string {
  const worst = [...misses].sort((a, b) => Math.abs(b.relativeError) - Math.abs(a.relativeError))[0];
  const label = MACRO_LABELS[worst.macro];
  const unit = MACRO_UNITS[worst.macro];
  const want = Math.round(worst.target);
  const got = Math.round(worst.achieved);
  return worst.relativeError > 0
    ? `Nothing in the library portions down to ${want}${unit} of ${label} for a ${slot.toLowerCase()} — the smallest plausible meal reaches ${got}${unit}. Try a larger target or a different slot.`
    : `Nothing in the library reaches ${want}${unit} of ${label} in a single ${slot.toLowerCase()} — the largest plausible meal gets to ${got}${unit}. Try splitting it across more meals.`;
}

function buildItems(foods: Food[], servings: number[]): GeneratedItem[] {
  return foods
    .map((food, i) => ({ food, servings: servings[i] }))
    .filter(({ servings: s }) => s > 0)
    .map(({ food, servings: s }) => ({
      foodId: food.id,
      name: food.name,
      servings: s,
      unit: food.serving.unit,
      quantityLabel: formatQuantity(food, s),
      gramsLabel: formatGrams(food, s),
      macros: macrosForServings(food, s),
    }));
}

/**
 * Sample one candidate combination: an anchor from each macro category, plus
 * vegetables. Excluded foods are dropped only while enough alternatives remain,
 * so "regenerate without chicken" never empties a category.
 */
function sampleCombination(rng: () => number, pool: FoodPool, options: GeneratorOptions): Food[] {
  const excluded = new Set(options.excludeFoodIds ?? []);
  const usable = (foods: Food[]) => {
    const kept = foods.filter(f => !excluded.has(f.id));
    return kept.length > 0 ? kept : foods;
  };

  const foods = [pick(rng, usable(pool.proteins)), pick(rng, usable(pool.carbs)), pick(rng, usable(pool.fats))];

  if (options.includeVegetables !== false && pool.vegetables.length > 0) {
    const veg1 = pick(rng, usable(pool.vegetables));
    foods.push(veg1);
    const rest = pool.vegetables.filter(v => v.id !== veg1.id);
    if (rest.length > 0 && rng() < 0.6) foods.push(pick(rng, usable(rest)));
  }

  return foods;
}

interface FoodPool {
  proteins: Food[];
  carbs: Food[];
  fats: Food[];
  vegetables: Food[];
}

function buildPool(foods: Food[]): FoodPool {
  const usable = foods.filter(f => f.generatorRole !== 'never');
  const anchor = (category: Food['category']) =>
    usable.filter(f => f.category === category && f.generatorRole === 'primary');
  return {
    proteins: anchor('protein'),
    carbs: anchor('carb'),
    fats: anchor('fat'),
    vegetables: usable.filter(f => f.category === 'vegetable'),
  };
}

/**
 * Build one meal for one slot's target.
 *
 * Takes a `MealTarget`, never a `DailyNutritionTarget` — the types are distinct
 * precisely so this entry point cannot be handed a whole day again.
 */
export function generateMealForTarget(
  target: MealTarget,
  foods: Food[],
  options: GeneratorOptions = {},
): GenerateMealResult {
  const seed = options.seed ?? randomSeed();
  const rng = mulberry32(seed);
  const pool = buildPool(foods);

  if (pool.proteins.length === 0 || pool.carbs.length === 0 || pool.fats.length === 0) {
    return {
      ok: false,
      misses: [],
      message: 'The food library is missing a usable protein, carbohydrate or fat source.',
      closest: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      seed,
    };
  }

  const candidates = options.candidates ?? 40;
  let best: { foods: Food[]; servings: number[]; cost: number; totals: Macros } | null = null;

  for (let i = 0; i < candidates; i++) {
    const combination = sampleCombination(rng, pool, options);
    const solved = solveServings(combination, target);
    if (!best || solved.cost < best.cost) {
      best = {
        foods: combination,
        servings: solved.servings,
        cost: solved.cost,
        totals: totalsFor(combination, solved.servings),
      };
    }
  }

  /* c8 ignore next -- `candidates` is at least 1, so a best always exists */
  if (!best) throw new Error('Generator produced no candidates');

  const misses = withinTolerance(best.totals, target);
  if (misses.length > 0) {
    return {
      ok: false,
      misses,
      message: describeRejection(misses, target.slot),
      closest: best.totals,
      seed,
    };
  }

  const items = buildItems(best.foods, best.servings);
  return {
    ok: true,
    meal: { slot: target.slot, target, items, totals: sumMacros(items.map(i => i.macros)), seed },
  };
}

// ─── Whole-day generation ─────────────────────────────────────────────────────

export interface DayGenerationResult {
  meals: GeneratedMeal[];
  rejections: Array<{ slot: MealSlot; message: string; misses: MacroMiss[] }>;
  /** Totals of the meals that succeeded — not of the day that was asked for. */
  totals: Macros;
  seed: number;
}

/**
 * Build every meal in a day.
 *
 * Each slot is generated against its own share of the daily target, and foods
 * already used are discouraged in later slots so a day is not chicken and rice
 * six times. Slots that cannot be satisfied are reported rather than filled
 * with something implausible; the rest of the day still generates.
 */
export function generateDay(
  daily: DailyNutritionTarget,
  slots: MealSlot[],
  foods: Food[],
  ctx: AllocationContext = {},
  options: GeneratorOptions = {},
): DayGenerationResult {
  const seed = options.seed ?? randomSeed();
  const targets = splitDailyTarget(daily, slots, ctx);

  const meals: GeneratedMeal[] = [];
  const rejections: DayGenerationResult['rejections'] = [];
  const used = new Set(options.excludeFoodIds ?? []);

  targets.forEach((target, index) => {
    const result = generateMealForTarget(target, foods, {
      ...options,
      // Derived rather than shared, so one seed reproduces the whole day but
      // each slot still searches its own combinations.
      seed: (seed + index * 0x9e3779b1) >>> 0,
      excludeFoodIds: [...used],
    });

    if (result.ok) {
      meals.push(result.meal);
      // Only the macro anchors are worth varying; repeating broccoli is fine.
      result.meal.items
        .filter(item => foods.find(f => f.id === item.foodId)?.category !== 'vegetable')
        .forEach(item => used.add(item.foodId));
    } else {
      rejections.push({ slot: target.slot, message: result.message, misses: result.misses });
    }
  });

  return { meals, rejections, totals: sumMacros(meals.map(m => m.totals)), seed };
}
