import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CalendarDays, Check, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { FOOD_DATABASE } from '../data/nutrition/foods';
import { MEAL_SLOTS, type DailyNutritionTarget, type MealSlot } from '../data/nutrition/types';
import {
  generateDay,
  generateMealForTarget,
  type GeneratedMeal,
  type MacroMiss,
} from '../utils/nutrition/mealGenerator';
import { mealTargetForSlot } from '../utils/nutrition/mealTargets';
import { buildMealEntry, itemsFromGeneratedMeal } from '../utils/nutrition/nutritionDay';
import { generateId } from '../utils/storage';
import { MACRO_COLORS, tint, type Macro } from '../utils/designTokens';
import type { MacroEntry } from '../types';

/**
 * The macro generator.
 *
 * The targets entered here are a DAY's targets, which is what the previous
 * version got wrong: it handed all 2000 kcal and 170 g of protein to a single
 * meal. The mode switch makes the distinction explicit, and either path routes
 * the daily figures through `mealTargetForSlot` / `generateDay` before any food
 * is chosen.
 */

type Mode = 'meal' | 'day';

function MacroBar({ label, value, target, macro, unit = 'g' }: {
  label: string; value: number; target: number; macro: Macro; unit?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold tabular-nums">
          {Math.round(value)}{unit}
          <span className="text-gray-450"> / {Math.round(target)}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden" style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}>
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: MACRO_COLORS[macro], borderRadius: 'var(--radius-full)' }}
        />
      </div>
    </div>
  );
}

function MealCard({ meal, onSave, saved }: {
  meal: GeneratedMeal; onSave: () => void; saved: boolean;
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{meal.slot}</p>
          <p className="text-sm font-bold text-white">{Math.round(meal.totals.calories)} kcal</p>
        </div>
        <span className="text-[10px] text-gray-450 tabular-nums">
          {Math.round(meal.target.share * 100)}% of the day
        </span>
      </div>

      <div className="space-y-1.5">
        {meal.items.map(item => (
          <div key={item.foodId} className="flex items-center justify-between gap-2">
            <span className="text-sm text-gray-300">{item.name}</span>
            <span className="text-sm font-semibold text-white tabular-nums flex-shrink-0">
              {item.quantityLabel}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-2 pt-1 border-t border-dark-600">
        <MacroBar label="Calories" value={meal.totals.calories} target={meal.target.calories} macro="calories" unit=" kcal" />
        <MacroBar label="Protein" value={meal.totals.protein} target={meal.target.protein} macro="protein" />
        <MacroBar label="Carbs" value={meal.totals.carbs} target={meal.target.carbs} macro="carbs" />
        <MacroBar label="Fat" value={meal.totals.fat} target={meal.target.fat} macro="fat" />
      </div>

      <button
        onClick={onSave}
        disabled={saved}
        className={`w-full py-2 rounded-xl text-sm font-semibold transition-all ${
          saved
            ? 'bg-green-900/40 text-green-300 cursor-default'
            : 'bg-dark-600 border border-dark-400 text-gray-300 hover:border-brand-600 hover:text-white'
        }`}
      >
        {saved ? <><Check size={13} className="inline mr-1" />Added to today</> : `Add this ${meal.slot.toLowerCase()} to today`}
      </button>
    </div>
  );
}

function Rejection({ slot, message }: { slot: string; message: string }) {
  return (
    <div
      className="card flex gap-2.5 items-start"
      style={{ borderColor: tint(MACRO_COLORS.fat, 0.4) }}
    >
      <AlertTriangle size={15} className="text-orange-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-white">{slot} could not be built</p>
        <p className="text-xs text-gray-400 mt-0.5">{message}</p>
      </div>
    </div>
  );
}

export default function MacroGenerator() {
  const { dispatch, state } = useApp();
  const saved = state.currentUser?.macroTargets;

  const [mode, setMode] = useState<Mode>('meal');
  const [calories, setCalories] = useState(String(saved?.calories ?? 2000));
  const [protein, setProtein] = useState(String(saved?.protein ?? 170));
  const [carbs, setCarbs] = useState(String(saved?.carbs ?? 200));
  const [fat, setFat] = useState(String(saved?.fat ?? 65));
  const [slot, setSlot] = useState<MealSlot>('Lunch');
  const [pattern, setPattern] = useState<MealSlot[]>([...MEAL_SLOTS]);
  const [trainingDay, setTrainingDay] = useState(true);

  const [meals, setMeals] = useState<GeneratedMeal[] | null>(null);
  const [rejections, setRejections] = useState<Array<{ slot: string; message: string; misses: MacroMiss[] }>>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const daily: DailyNutritionTarget = useMemo(() => ({
    calories: Math.max(0, Number(calories) || 0),
    protein: Math.max(0, Number(protein) || 0),
    carbs: Math.max(0, Number(carbs) || 0),
    fat: Math.max(0, Number(fat) || 0),
  }), [calories, protein, carbs, fat]);

  function handleGenerate() {
    setSavedIds([]);
    if (mode === 'day') {
      const result = generateDay(daily, pattern, FOOD_DATABASE, { trainingDay });
      setMeals(result.meals);
      setRejections(result.rejections);
      return;
    }
    // One meal: the slot's share of the day, never the day itself.
    const target = mealTargetForSlot(daily, slot, { slots: pattern, trainingDay });
    const result = generateMealForTarget(target, FOOD_DATABASE);
    if (result.ok) {
      setMeals([result.meal]);
      setRejections([]);
    } else {
      setMeals([]);
      setRejections([{ slot, message: result.message, misses: result.misses }]);
    }
  }

  function handleSave(meal: GeneratedMeal) {
    if (!state.activeCamp) return;
    const now = new Date();
    // Local calendar date — toISOString() is UTC and files an evening save
    // under tomorrow for users west of UTC.
    const date = format(now, 'yyyy-MM-dd');
    const entryId = generateId();
    dispatch({
      type: 'ADD_MEAL_ENTRY',
      payload: {
        campId: state.activeCamp.id,
        entry: buildMealEntry({
          id: entryId,
          date,
          time: format(now, 'HH:mm'),
          mealSlot: meal.slot,
          source: 'generated',
          items: itemsFromGeneratedMeal(meal, i => `${entryId}-${i}`),
        }),
      },
    });
    setSavedIds(ids => [...ids, meal.slot + meal.seed]);
  }

  const dayTotals: MacroEntry | null = meals && meals.length > 1
    ? meals.reduce(
        (acc, m) => ({
          calories: acc.calories + m.totals.calories,
          protein: acc.protein + m.totals.protein,
          carbs: acc.carbs + m.totals.carbs,
          fat: acc.fat + m.totals.fat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      )
    : null;

  const MACRO_ROWS = [
    { label: 'Calories', value: calories, set: setCalories, unit: 'kcal' },
    { label: 'Protein', value: protein, set: setProtein, unit: 'g' },
    { label: 'Carbs', value: carbs, set: setCarbs, unit: 'g' },
    { label: 'Fat', value: fat, set: setFat, unit: 'g' },
  ];

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        {/* Mode — the distinction the old generator collapsed. */}
        <div className="flex gap-1 bg-dark-700 rounded-xl p-1">
          {([['meal', 'Build one meal', UtensilsCrossed], ['day', 'Build a full day', CalendarDays]] as const).map(
            ([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => { setMode(value); setMeals(null); setRejections([]); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  mode === value ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ),
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Daily Targets</p>
          <p className="text-[11px] text-gray-450 mt-0.5">
            {mode === 'meal'
              ? `A ${slot.toLowerCase()} takes its share of these, not all of them.`
              : 'Split across the meals you eat.'}
          </p>
        </div>

        {MACRO_ROWS.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-white w-20" htmlFor={`macro-${row.label}`}>{row.label}</label>
            <div className="flex items-center gap-2 flex-1">
              <input
                id={`macro-${row.label}`}
                type="number"
                inputMode="numeric"
                className="input text-sm text-right flex-1"
                value={row.value}
                onChange={e => row.set(e.target.value)}
                min={0}
              />
              <span className="text-xs font-semibold text-gray-400 w-8">{row.unit}</span>
            </div>
          </div>
        ))}

        {/* Which meals the fighter eats — this is what sets each slot's share. */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            Meals you eat in a day
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MEAL_SLOTS.map(s => {
              const on = pattern.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => setPattern(p => (on ? p.filter(x => x !== s) : [...p, s]))}
                  aria-pressed={on}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                    on ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-600 border-dark-400 text-gray-400 hover:border-dark-300'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {mode === 'meal' && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Building</p>
            <div className="flex flex-wrap gap-1.5">
              {(pattern.length ? pattern : MEAL_SLOTS).map(s => (
                <button
                  key={s}
                  onClick={() => setSlot(s)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                    slot === s ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-600 border-dark-400 text-gray-400 hover:border-dark-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-white">Training day</span>
          <input
            type="checkbox"
            className="w-4 h-4 accent-brand-600"
            checked={trainingDay}
            onChange={e => setTrainingDay(e.target.checked)}
          />
        </label>

        <button
          onClick={handleGenerate}
          disabled={pattern.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Sparkles size={16} />
          {mode === 'meal' ? `Generate ${slot}` : 'Generate Day'}
        </button>
        {pattern.length === 0 && (
          <p className="text-xs text-gray-450 text-center">Pick at least one meal slot.</p>
        )}
      </div>

      {meals !== null && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">
              {mode === 'meal' ? 'Generated Meal' : 'Generated Day'}
            </p>
            <button onClick={handleGenerate} className="text-xs text-brand-400 font-semibold">Regenerate</button>
          </div>

          {dayTotals && (
            <div className="card space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Day Total</p>
              <MacroBar label="Calories" value={dayTotals.calories} target={daily.calories} macro="calories" unit=" kcal" />
              <MacroBar label="Protein" value={dayTotals.protein} target={daily.protein} macro="protein" />
              <MacroBar label="Carbs" value={dayTotals.carbs} target={daily.carbs} macro="carbs" />
              <MacroBar label="Fat" value={dayTotals.fat} target={daily.fat} macro="fat" />
            </div>
          )}

          {rejections.map(r => <Rejection key={r.slot} slot={r.slot} message={r.message} />)}

          {state.activeCamp ? (
            meals.map(meal => (
              <MealCard
                key={meal.slot + meal.seed}
                meal={meal}
                saved={savedIds.includes(meal.slot + meal.seed)}
                onSave={() => handleSave(meal)}
              />
            ))
          ) : (
            <>
              {meals.map(meal => (
                <MealCard key={meal.slot + meal.seed} meal={meal} saved onSave={() => {}} />
              ))}
              <p className="text-xs text-gray-400 text-center">Set up a fight camp to save meals to your log.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
