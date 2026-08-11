import { describe, expect, it } from 'vitest';
import {
  addMealEntry,
  createDefaultState,
  deleteMealEntry,
  updateMealEntry,
  upsertNutritionLog,
} from '../src/utils/storage';
import {
  buildMealEntry,
  deriveDayTotals,
  itemFromFood,
  itemFromManualEntry,
  itemsFromRecipe,
  migrateNutritionLog,
} from '../src/utils/nutrition/nutritionDay';
import type { AppState, MacroEntry, MealEntry, NutritionLog } from '../src/types';
import type { LoggedMealSlot } from '../src/data/nutrition/types';

const CAMP = 'camp-1';
const DATE = '2026-08-11';

function meal(id: string, slot: LoggedMealSlot, macros: MacroEntry): MealEntry {
  return buildMealEntry({
    id,
    date: DATE,
    time: '12:00',
    mealSlot: slot,
    source: 'manual',
    items: [itemFromManualEntry(`${id}-item`, id, macros)],
  });
}

const BREAKFAST = meal('breakfast', 'Breakfast', { calories: 500, protein: 40, carbs: 50, fat: 15 });
const LUNCH = meal('lunch', 'Lunch', { calories: 700, protein: 55, carbs: 70, fat: 20 });

function dayIn(state: AppState): NutritionLog {
  const log = state.nutritionLogs.find(n => n.campId === CAMP && n.date === DATE);
  if (!log) throw new Error('no nutrition log for the day');
  return log;
}

describe('logging meals', () => {
  /**
   * The P0. The generator's save handler wrote its meal's totals into the
   * day-level `macros` field, and the reducer merged the incoming log over the
   * existing one, so saving a generated lunch replaced breakfast outright.
   */
  it('adds a second meal without replacing the first', () => {
    let state = createDefaultState();
    state = addMealEntry(state, { campId: CAMP, entry: BREAKFAST });
    state = addMealEntry(state, { campId: CAMP, entry: LUNCH });

    const day = dayIn(state);
    expect(day.meals).toHaveLength(2);
    expect(day.meals.map(m => m.id)).toEqual(['breakfast', 'lunch']);
    expect(deriveDayTotals(day.meals)).toEqual({
      calories: 1200, protein: 95, carbs: 120, fat: 35,
    });
  });

  it('keeps two generated meals in the same slot as two meals', () => {
    let state = createDefaultState();
    const first = meal('gen-1', 'Lunch', { calories: 600, protein: 45, carbs: 60, fat: 18 });
    const second = meal('gen-2', 'Lunch', { calories: 550, protein: 42, carbs: 55, fat: 16 });
    state = addMealEntry(state, { campId: CAMP, entry: first });
    state = addMealEntry(state, { campId: CAMP, entry: second });

    expect(dayIn(state).meals).toHaveLength(2);
    expect(deriveDayTotals(dayIn(state).meals).calories).toBe(1150);
  });

  it('creates the day when the first meal lands on a date with no log', () => {
    const state = addMealEntry(createDefaultState(), { campId: CAMP, entry: BREAKFAST });
    const day = dayIn(state);
    expect(day.waterOz).toBe(0);
    expect(day.notes).toBe('');
    expect(day.meals).toHaveLength(1);
  });

  it('leaves water, ratings and notes untouched when a meal is added', () => {
    let state = createDefaultState();
    state = upsertNutritionLog(state, {
      campId: CAMP, date: DATE, waterOz: 48,
      mealRatings: { breakfast: 'good' }, notes: 'felt sharp',
    });
    state = addMealEntry(state, { campId: CAMP, entry: BREAKFAST });

    const day = dayIn(state);
    expect(day.waterOz).toBe(48);
    expect(day.mealRatings.breakfast).toBe('good');
    expect(day.notes).toBe('felt sharp');
    expect(day.meals).toHaveLength(1);
  });

  it('leaves logged meals untouched when water or notes are patched', () => {
    let state = createDefaultState();
    state = addMealEntry(state, { campId: CAMP, entry: BREAKFAST });
    state = addMealEntry(state, { campId: CAMP, entry: LUNCH });
    state = upsertNutritionLog(state, {
      campId: CAMP, date: DATE, waterOz: 64, mealRatings: {}, notes: 'updated',
    });

    const day = dayIn(state);
    expect(day.meals).toHaveLength(2);
    expect(day.waterOz).toBe(64);
    expect(day.notes).toBe('updated');
  });

  it('updates one meal in place without disturbing the others', () => {
    let state = createDefaultState();
    state = addMealEntry(state, { campId: CAMP, entry: BREAKFAST });
    state = addMealEntry(state, { campId: CAMP, entry: LUNCH });

    const corrected = meal('lunch', 'Lunch', { calories: 400, protein: 30, carbs: 40, fat: 10 });
    state = updateMealEntry(state, { campId: CAMP, entry: corrected });

    const day = dayIn(state);
    expect(day.meals).toHaveLength(2);
    expect(deriveDayTotals(day.meals).calories).toBe(900);
    expect(day.meals.find(m => m.id === 'breakfast')!.totals.calories).toBe(500);
  });

  it('deletes one meal and leaves the day standing', () => {
    let state = createDefaultState();
    state = addMealEntry(state, { campId: CAMP, entry: BREAKFAST });
    state = addMealEntry(state, { campId: CAMP, entry: LUNCH });
    state = deleteMealEntry(state, { campId: CAMP, date: DATE, entryId: 'lunch' });

    const day = dayIn(state);
    expect(day.meals.map(m => m.id)).toEqual(['breakfast']);
    expect(deriveDayTotals(day.meals).calories).toBe(500);
  });

  it('keeps days independent', () => {
    let state = createDefaultState();
    state = addMealEntry(state, { campId: CAMP, entry: BREAKFAST });
    state = addMealEntry(state, {
      campId: CAMP,
      entry: { ...LUNCH, date: '2026-08-12' },
    });
    expect(state.nutritionLogs).toHaveLength(2);
    expect(dayIn(state).meals).toHaveLength(1);
  });
});

describe('meal entry construction', () => {
  it('derives totals from its items', () => {
    const entry = buildMealEntry({
      id: 'e', date: DATE, time: '08:00', mealSlot: 'Breakfast', source: 'manual',
      items: [
        itemFromFood('a', 'chicken-breast', 2),
        itemFromFood('b', 'white-rice-cooked', 1.5),
      ],
    });
    expect(entry.totals.calories).toBeCloseTo(165 * 2 + 130 * 1.5, 6);
    expect(entry.totals.protein).toBeCloseTo(31 * 2 + 2.7 * 1.5, 6);
  });

  it('snapshots macros so later library edits cannot rewrite history', () => {
    const item = itemFromFood('a', 'chicken-breast', 2);
    // A plain value, not a getter or a reference into the food database.
    expect(item.macros).toEqual({ calories: 330, protein: 62, carbs: 0, fat: 7.2 });
    expect(item.foodId).toBe('chicken-breast');
    expect(item.name).toBe('Chicken Breast');
  });

  it('drops seasonings when a recipe becomes a logged meal', () => {
    const items = itemsFromRecipe('fw-lunch', i => `i-${i}`);
    expect(items.length).toBeGreaterThan(0);
    expect(items.map(i => i.foodId)).not.toContain('salt');
    expect(items.map(i => i.foodId)).toContain('chicken-breast');
  });
});

describe('migrating a pre-meal-entries day', () => {
  const legacy = {
    id: 'log-1', campId: CAMP, date: DATE, waterOz: 32,
    mealRatings: {}, notes: 'old', createdAt: '2026-08-11T00:00:00.000Z',
    macros: { calories: 1800, protein: 150, carbs: 180, fat: 60 },
  } as NutritionLog & { macros?: MacroEntry };

  it('turns a day-level macro figure into one imported entry', () => {
    const migrated = migrateNutritionLog(legacy);
    expect(migrated.meals).toHaveLength(1);
    expect(migrated.meals[0].source).toBe('imported');
    expect(migrated.meals[0].totals).toEqual(legacy.macros);
    expect(deriveDayTotals(migrated.meals)).toEqual(legacy.macros);
  });

  it('does not invent a meal slot it cannot know', () => {
    expect(migrateNutritionLog(legacy).meals[0].mealSlot).toBe('Unspecified');
  });

  it('drops the legacy field so no totals path needs a fallback', () => {
    expect(migrateNutritionLog(legacy)).not.toHaveProperty('macros');
  });

  it('preserves water, ratings and notes', () => {
    const migrated = migrateNutritionLog(legacy);
    expect(migrated.waterOz).toBe(32);
    expect(migrated.notes).toBe('old');
  });

  it('produces no meal for a day that recorded no macros', () => {
    const empty = { ...legacy, macros: { calories: 0, protein: 0, carbs: 0, fat: 0 } };
    expect(migrateNutritionLog(empty).meals).toEqual([]);
    expect(migrateNutritionLog({ ...legacy, macros: undefined }).meals).toEqual([]);
  });

  it('leaves an already-migrated day alone', () => {
    const current: NutritionLog = { ...legacy, macros: undefined, meals: [BREAKFAST] };
    const migrated = migrateNutritionLog(current);
    expect(migrated.meals).toEqual([BREAKFAST]);
  });

  it('is idempotent', () => {
    const once = migrateNutritionLog(legacy);
    expect(migrateNutritionLog(once)).toEqual(once);
  });
});
