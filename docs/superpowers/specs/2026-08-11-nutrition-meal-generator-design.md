# Nutrition & Meal Generator Rebuild

**Date:** 2026-08-11
**Status:** Approved

Three P0 defects share one root cause: the nutrition feature stores numbers that
should be derived, and derives nothing. This rebuild makes every total a
function of its parts and makes the broken states unrepresentable rather than
merely avoided.

## The defects

**P0-1 — The generator treats a daily target as one meal.**
`generateMeal()` scales a single protein food to cover the *entire* protein
target: `targets.protein / proteinFood.macros.protein`. With the default 170 g
protein and Greek yogurt at 10 g per 100 g, that is a 17× multiplier — 1.7 kg of
yogurt in one sitting. Calories are accepted by the UI and never used to
construct anything; they are only compared against the result afterward. The
quantity formatter branches on the serving unit and then returns grams in both
branches, so a scoop, tablespoon or slice is rendered as a weight.

**P0-2 — Saving a generated meal replaces the day's macros.**
The save handler writes the generated meal's totals into the day-level `macros`
field, and `upsertNutritionLog` merges `{...existing, ...log}`. Logging
breakfast then saving a generated lunch replaces breakfast. Saving a second
generated meal replaces the first. The handler already carries water, ratings
and notes forward with a comment about this exact hazard; macros are the one
field it overwrites.

**P0-3 — Plan totals are not derived from their meals.**
`MealPlan.totalMacros` duplicates data computable from `meals`. Fight Week Cut
advertises 1600 kcal / 190 P / 80 C / 50 F; its six meals sum to 1120 / 187 /
53 / 20. Slow Cut is likewise inconsistent.

## What P0-3 hides

Deriving plan totals from meal macros is not enough, because the meal macros are
themselves unmoored. Fight Week Cut's lunch is authored at 320 kcal, but its
ingredients — 220 g chicken breast, 2 cups broccoli, 1 tsp olive oil — compute
to roughly 465. Ingredient lists and nutritional intent were authored
independently and never reconciled at any level.

So computing totals from ingredients makes the library self-consistent and
simultaneously makes it unfit for purpose: a "1600 kcal fight-week cut" would
compute to well over 2000.

**Resolution:** keep the intent as a checkable constraint, and re-portion the
ingredients to satisfy it.

```ts
interface MealPlan {
  id: string; name: string; goal: MealGoal; phase: string; description: string;
  /**
   * The plan's design intent. NOT a cached sum — CI asserts the computed total
   * lands inside this band. It cannot drift out of sync the way `totalMacros`
   * did, because nothing ever writes it from the meals.
   */
  targetBand: MacroBand;
  recipeIds: string[];
}
```

Displayed totals are always computed. Ingredient quantities across all 71 meals
are re-portioned so each plan's computed total lands inside a band centred on
its **original stated numbers** — Fight Week Cut returns to ~1600 kcal by having
correct portions, not by storing the claim.

Band tolerances: ±5% calories, ±8% protein, ±10% carbs, ±12% fat, each with an
absolute floor (±25 kcal, ±8 g P, ±10 g C, ±5 g F) so small targets stay
authorable.

## Architecture

### Data layer — `src/data/nutrition/`

Replaces `src/data/mealLibrary.ts`.

| File | Contents |
|---|---|
| `types.ts` | `Food`, `ServingUnit`, `Recipe`, `RecipeIngredient`, `MealPlan`, `DailyNutritionTarget`, `MealTarget`, `MacroBand` |
| `foods.ts` | `FOOD_DATABASE` — ~120 macro-bearing foods + ~25 seasonings |
| `recipes.ts` | `RECIPE_LIBRARY` — 71 recipes, ingredients as `{foodId, servings}` |
| `plans.ts` | `MEAL_PLANS` — 12 plans as `recipeIds` + `targetBand` |
| `index.ts` | `recipeMacros()`, `planMacros()`, lookup maps, filter facets |

Serving constraints are what make kilogram portions structurally impossible:

```ts
interface Food {
  id: string; name: string;
  category: 'protein' | 'carb' | 'fat' | 'vegetable' | 'seasoning';
  serving: { amount: number; unit: ServingUnit; grams: number };
  macros: Macros;          // per ONE serving
  minServings: number;     // generator floor
  maxServings: number;     // generator ceiling
  step: number;            // 1 for scoops/eggs, 0.5 for tbsp, 0.1 for weighed
  generatorRole?: 'primary' | 'side' | 'never';
}
```

`formatQuantity(food, servings)` renders in the food's own unit — `1½ scoops`,
`2 tbsp`, `180 g`, `1 medium banana`. The dead-branch formatter is deleted.

Seasonings (salt, herbs, hot sauce) are modelled as a category with negligible
macros, excluded from generator selection but valid in recipes, so recipe text
stays human.

### Generator engine — `src/utils/nutrition/`

Pure and testable, extracted out of the component.

**`mealTargets.ts`** — `splitDailyTarget(daily, slots, ctx)`. Slot weights
(Breakfast .25, Lunch .30, Dinner .30, Snack .10, Pre-Workout .10,
Post-Workout .15) normalized across only the *selected* slots, then shifted by
training context: a training day moves carbohydrate toward Pre/Post and away
from Dinner. Returns `MealTarget[]`.

**`mealGenerator.ts`** — best-of-N search over a seeded RNG:

1. Sample a food combination (1 protein, 1 carb, 1 fat, 1–2 vegetables)
   respecting `generatorRole`.
2. Solve serving counts by bounded coordinate descent over each food's
   `[min, max]` in `step` increments, minimizing weighted macro distance with
   **calories as a first-class term**.
3. Repeat over N≈40 combinations, keep the best.
4. If the best still exceeds tolerance (±10% macros, ±7% kcal), return a
   **rejection** naming the unreachable macro rather than emitting a monster.

Regeneration re-seeds. Bounded servings mean every result is plausible by
construction, not by luck.

### Day model

```ts
interface MealItem {
  id: string;
  foodId?: string;   // absent for manual free-text entry
  name: string;      // denormalized: removing a food must not erase history
  servings: number; unit: ServingUnit;
  macros: Macros;    // SNAPSHOT at log time — editing the food DB must not
                     // retroactively rewrite what someone ate in March
}

interface MealEntry {
  id: string; date: string; time: string;
  mealSlot: MealSlot; items: MealItem[]; totals: Macros;
  source: 'manual' | 'recipe' | 'generated' | 'imported';
  recipeId?: string;
}

interface NutritionDay {
  id: string; campId: string; date: string;
  waterOz: number; mealRatings: MealRatings;
  meals: MealEntry[]; notes: string; createdAt: string;
}
```

`MealEntry.totals` is derived from `items` by one constructor at write time. Day
totals are `deriveDayTotals(meals)` and never stored. The day-level `macros`
field is **deleted from the type**, so the P0-2 overwrite becomes
unrepresentable.

Reducer gains `ADD_MEAL_ENTRY`, `UPDATE_MEAL_ENTRY`, `DELETE_MEAL_ENTRY`. Water,
ratings and notes stay independently patchable through the existing
`LOG_NUTRITION`.

### Migration

`loadState()` maps a legacy day-level `macros` into one `MealEntry`
(`source: 'imported'`, slot `Unspecified`, single item "Logged macros"), then
drops the field. No dual read path survives.

`sync.ts` reads and writes a new `meals` jsonb column, still upserting on
`(user_id, camp_id, date)`. A migration file adds the column and backfills from
`macros`; applying it to the live database is the operator's call, not the
build's.

### UI

`MacroGenerator` moves to its own component (MealLibrary.tsx is already 504
lines) and gains a **Build one meal / Build a full day** toggle, a slot picker
feeding the allocator, and a rejection state.

`NutritionTracker` gains a per-slot meal list with add / edit / delete. Macro
bars read derived totals; "log today's macros" becomes "add a meal".

### CI integrity checks

`tests/nutritionLibrary.test.ts`, picked up by the existing `npm run quality`.

| Check | Threshold |
|---|---|
| Plan computed total inside its `targetBand` | exact |
| Food kcal vs Atwater 4/4/9 | ±max(20 kcal, 20%) |
| Duplicate IDs across foods, recipes, plans, exercises, techniques | exact |
| Ingredient unit valid, quantity > 0, `min ≤ max`, `step` divides range | exact |
| Every `foodId` / `recipeId` reference resolves; enums valid | exact |

The Atwater tolerance is wide because dietary fibre contributes 4 kcal/g in the
formula but ~2 in reality, so high-fibre vegetables read up to 20% off.
Tightening it would require a `fibre` field on ~145 foods; the check is there to
catch transposed digits, not to model metabolism.

The exercise and technique libraries have no duplicate-ID test today. They are
folded into the same file because the check is identical and the gap is real.

## Build order

1. Types + engine + engine tests (no UI, fully testable)
2. Food database
3. Recipes + re-portioning until every plan band passes
4. Day model + reducer + storage migration + sync + SQL migration
5. UI
6. Integrity tests + full quality gate

Step 3 is the bulk of the work and the only part requiring nutrition judgement
rather than mechanics.
