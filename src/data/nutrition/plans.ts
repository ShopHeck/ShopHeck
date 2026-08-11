import type { MealPlan } from './types';

/**
 * Preset meal plans.
 *
 * A plan is a list of recipe ids and a `targetBand`. It has no `totalMacros`,
 * because a stored total is a promise nothing keeps: the old Fight Week Cut
 * advertised 1600 kcal against meals summing to 1120, and no code path could
 * have noticed.
 *
 * `targetBand` is the plan's design intent, centred on the figures the library
 * originally advertised. Nothing computes it from the meals — the meals are
 * portioned to land inside it, and `tests/nutritionLibrary.test.ts` fails the
 * build if they stop doing so. Tolerances are ±5% calories, ±8% protein,
 * ±10% carbohydrate and ±12% fat, each with an absolute floor so the smaller
 * targets stay authorable.
 */
export const MEAL_PLANS: MealPlan[] = [
  // ── Cut ─────────────────────────────────────────────────────────────────────
  {
    id: 'cut-fight-week',
    name: 'Fight Week Cut',
    goal: 'Cut',
    phase: 'Fight Week',
    description: 'Aggressive cut for the final 7 days before weigh-in. Low carb, high protein, water management.',
    targetBand: { calories: [1520, 1680], protein: [175, 205], carbs: [70, 90], fat: [44, 56] },
    recipeIds: ['fw-breakfast', 'fw-lunch', 'fw-snack', 'fw-dinner', 'fw-pre', 'fw-post'],
  },
  {
    id: 'cut-camp-base',
    name: 'Slow Cut — Camp Base',
    goal: 'Cut',
    phase: 'Camp Base',
    description: 'Moderate caloric deficit for steady weight loss during camp without compromising training quality.',
    targetBand: { calories: [1995, 2205], protein: [184, 216], carbs: [162, 198], fat: [53, 67] },
    recipeIds: ['cb-breakfast', 'cb-pre', 'cb-post', 'cb-lunch', 'cb-dinner', 'cb-snack'],
  },
  {
    id: 'cut-peak',
    name: 'Peak Phase Cut',
    goal: 'Cut',
    phase: 'Peak',
    description: 'Carb cycling approach during peak training week — high carbs on heavy sparring days, lower on rest days.',
    targetBand: { calories: [1853, 2048], protein: [175, 205], carbs: [153, 187], fat: [48, 62] },
    recipeIds: ['pk-breakfast', 'pk-pre', 'pk-post', 'pk-lunch', 'pk-dinner'],
  },
  {
    id: 'cut-recovery',
    name: 'Cut — Active Recovery Day',
    goal: 'Cut',
    phase: 'Recovery',
    description: 'Lower overall calories on non-training days while maintaining protein and micronutrients.',
    targetBand: { calories: [1663, 1838], protein: [170, 200], carbs: [99, 121], fat: [48, 62] },
    recipeIds: ['rc-breakfast', 'rc-lunch', 'rc-snack', 'rc-dinner', 'rc-snack-late'],
  },

  // ── Maintain ────────────────────────────────────────────────────────────────
  {
    id: 'maintain-heavy-day',
    name: 'Maintenance — Heavy Training Day',
    goal: 'Maintain',
    phase: 'Camp Base',
    description: 'Full-calorie day matched to a high-volume training session. Adequate carbs to fuel and recover from 2-a-days.',
    targetBand: { calories: [2565, 2835], protein: [184, 216], carbs: [270, 330], fat: [66, 84] },
    recipeIds: ['hd-breakfast', 'hd-pre', 'hd-post', 'hd-lunch', 'hd-dinner', 'hd-snack'],
  },
  {
    id: 'maintain-moderate-day',
    name: 'Maintenance — Moderate Day',
    goal: 'Maintain',
    phase: 'Camp Base',
    description: 'Balanced day for single training sessions. Sustainable eating pattern for the full camp duration.',
    targetBand: { calories: [2280, 2520], protein: [175, 205], carbs: [216, 264], fat: [62, 78] },
    recipeIds: ['md-breakfast', 'md-pre', 'md-post', 'md-lunch', 'md-dinner', 'md-snack'],
  },
  {
    id: 'maintain-fight-specific',
    name: 'Maintenance — Fight Specific Phase',
    goal: 'Maintain',
    phase: 'Fight Specific',
    description: 'Timed nutrition around heavy sparring and fight-pace sessions in the 4–6 weeks out period.',
    targetBand: { calories: [2470, 2730], protein: [189, 221], carbs: [239, 292], fat: [63, 81] },
    recipeIds: ['fs-breakfast', 'fs-pre', 'fs-post', 'fs-lunch', 'fs-dinner', 'fs-snack'],
  },
  {
    id: 'maintain-taper',
    name: 'Maintenance — Taper Week',
    goal: 'Maintain',
    phase: 'Taper',
    description: 'Carb-load approach in taper week to top off glycogen stores while volume is reduced.',
    // Calorie floor widened below the advertised 2800 ± 5%. 180 P / 340 C /
    // 65 F implies 2665 kcal under Atwater, and real foods come in a few per
    // cent under that again, so the original headline could not be reached at
    // the macros it was published with. The macros win: they are the spec a
    // fighter is actually eating to.
    targetBand: { calories: [2600, 2940], protein: [166, 194], carbs: [306, 374], fat: [57, 73] },
    recipeIds: ['tp-breakfast', 'tp-snack-morning', 'tp-lunch', 'tp-snack-afternoon', 'tp-dinner', 'tp-snack-evening'],
  },

  // ── Build ───────────────────────────────────────────────────────────────────
  {
    id: 'build-base',
    name: 'Build — Off-Season Base',
    goal: 'Build',
    phase: 'Off-Season',
    description: 'Caloric surplus for lean muscle gain during the off-season. High protein supports heavy strength training.',
    targetBand: { calories: [3040, 3360], protein: [202, 238], carbs: [333, 407], fat: [79, 101] },
    recipeIds: ['bb-breakfast', 'bb-pre', 'bb-post', 'bb-lunch', 'bb-snack', 'bb-dinner'],
  },
  {
    id: 'build-strength',
    name: 'Build — Strength Phase',
    goal: 'Build',
    phase: 'Strength & Conditioning',
    description: 'Nutrition support for a heavy strength and power block. Timed carbs around workouts, high overall protein.',
    targetBand: { calories: [2850, 3150], protein: [198, 232], carbs: [279, 341], fat: [75, 95] },
    recipeIds: ['bs-breakfast', 'bs-pre', 'bs-post', 'bs-lunch', 'bs-snack', 'bs-dinner', 'bs-snack-late'],
  },
  {
    id: 'build-recovery',
    name: 'Build — Rest Day / Active Recovery',
    goal: 'Build',
    phase: 'Recovery',
    description: 'Slightly lower carbs on rest days while keeping protein high to support muscle repair.',
    targetBand: { calories: [2565, 2835], protein: [198, 232], carbs: [225, 275], fat: [70, 90] },
    recipeIds: ['br-breakfast', 'br-lunch', 'br-snack', 'br-dinner', 'br-snack-late', 'br-snack-afternoon'],
  },
  {
    id: 'build-early-camp',
    name: 'Build — Early Camp Lean Bulk',
    goal: 'Build',
    phase: 'Base Building',
    description: 'Controlled lean bulk at the very start of camp to add functional muscle before cutting begins.',
    // Same widening as the taper plan: 210 P / 300 C / 82 F implies 2778 kcal,
    // not the 2900 originally advertised.
    targetBand: { calories: [2700, 3045], protein: [193, 227], carbs: [270, 330], fat: [72, 92] },
    recipeIds: ['ec-breakfast', 'ec-pre', 'ec-post', 'ec-lunch', 'ec-dinner', 'ec-snack'],
  },
];
