import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, UtensilsCrossed, Sparkles, BookOpen } from 'lucide-react';
import { MEAL_PLANS, FOOD_ITEMS, type MealPlan, type MealGoal, type Macros, type FoodItem } from '../data/mealLibrary';
import { useApp } from '../context/AppContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MacroPill({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${color}`}>
      {label} {Math.round(value)}{unit}
    </span>
  );
}

function MacroBar({ label, value, max, color, unit = 'g' }: { label: string; value: number; max: number; color: string; unit?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold">{Math.round(value)}{unit}</span>
      </div>
      <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const GOAL_COLORS: Record<MealGoal, string> = {
  Cut:      'bg-red-900/40 text-red-300',
  Maintain: 'bg-brand-900/40 text-brand-300',
  Build:    'bg-purple-900/40 text-purple-300',
};

// ─── Meal Plan Card ───────────────────────────────────────────────────────────

function MealPlanCard({ plan }: { plan: MealPlan }) {
  const [open, setOpen] = useState(false);
  const [expandedMeal, setExpandedMeal] = useState<number | null>(null);
  const t = plan.totalMacros;

  return (
    <div className="card p-0 overflow-hidden">
      <button
        className="w-full p-4 text-left flex items-start justify-between gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${GOAL_COLORS[plan.goal]}`}>
              {plan.goal}
            </span>
            <span className="text-[10px] font-semibold text-gray-500">{plan.phase}</span>
          </div>
          <p className="text-sm font-semibold text-white">{plan.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            <MacroPill label="Cal" value={t.calories} unit="" color="bg-orange-900/40 text-orange-300" />
            <MacroPill label="P" value={t.protein} unit="g" color="bg-green-900/40 text-green-300" />
            <MacroPill label="C" value={t.carbs} unit="g" color="bg-blue-900/40 text-blue-300" />
            <MacroPill label="F" value={t.fat} unit="g" color="bg-purple-900/40 text-purple-300" />
          </div>
        </div>
        <div className="text-gray-500 flex-shrink-0 mt-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-dark-600">
          {plan.meals.map((meal, i) => (
            <div key={i} className="border-b border-dark-700 last:border-0">
              <button
                className="w-full px-4 py-3 text-left flex items-center justify-between gap-2"
                onClick={() => setExpandedMeal(expandedMeal === i ? null : i)}
              >
                <div>
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{meal.time}</span>
                  <p className="text-sm font-medium text-white">{meal.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{meal.macros.calories} kcal</span>
                  {expandedMeal === i ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                </div>
              </button>

              {expandedMeal === i && (
                <div className="px-4 pb-3 space-y-2">
                  <p className="text-xs text-gray-400">{meal.description}</p>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Ingredients</p>
                    <ul className="space-y-0.5">
                      {meal.ingredients.map((ing, j) => (
                        <li key={j} className="text-xs text-gray-300 flex items-start gap-1.5">
                          <span className="text-gray-600 mt-0.5">·</span>{ing}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <MacroPill label="Cal" value={meal.macros.calories} unit="" color="bg-orange-900/40 text-orange-300" />
                    <MacroPill label="P" value={meal.macros.protein} unit="g" color="bg-green-900/40 text-green-300" />
                    <MacroPill label="C" value={meal.macros.carbs} unit="g" color="bg-blue-900/40 text-blue-300" />
                    <MacroPill label="F" value={meal.macros.fat} unit="g" color="bg-purple-900/40 text-purple-300" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Macro Generator ──────────────────────────────────────────────────────────

interface GeneratedIngredient {
  name: string;
  quantity: string;
  servingLabel: string;
}

interface GeneratedMeal {
  ingredients: GeneratedIngredient[];
  totalMacros: Macros;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMeal(targets: Macros): GeneratedMeal {
  const proteins   = FOOD_ITEMS.filter(f => f.category === 'protein');
  const carbs      = FOOD_ITEMS.filter(f => f.category === 'carb');
  const fats       = FOOD_ITEMS.filter(f => f.category === 'fat');
  const vegetables = FOOD_ITEMS.filter(f => f.category === 'vegetable');

  // Pick one source from each macro category randomly
  const proteinFood = pickRandom(proteins);
  const carbFood    = pickRandom(carbs);
  const fatFood     = pickRandom(fats);
  const veg1        = pickRandom(vegetables);
  const veg2        = pickRandom(vegetables.filter(v => v.id !== veg1.id));

  // Scale each food to fill its share of the macro targets
  // Protein food scaled to cover the protein target
  const proteinMultiplier = targets.protein > 0
    ? Math.max(0.5, targets.protein / Math.max(1, proteinFood.macros.protein))
    : 1;

  // Carb food scaled to cover the carb target (minus protein food's carbs)
  const carbFromProtein = proteinFood.macros.carbs * proteinMultiplier;
  const carbRemaining = Math.max(0, targets.carbs - carbFromProtein);
  const carbMultiplier = carbRemaining > 0
    ? Math.max(0.5, carbRemaining / Math.max(1, carbFood.macros.carbs))
    : 0.5;

  // Fat food scaled to cover the fat target (minus fat already provided)
  const fatFromProtein = proteinFood.macros.fat * proteinMultiplier;
  const fatFromCarb    = carbFood.macros.fat    * carbMultiplier;
  const fatRemaining   = Math.max(0, targets.fat - fatFromProtein - fatFromCarb);
  const fatMultiplier  = fatRemaining > 0
    ? Math.max(0.5, fatRemaining / Math.max(1, fatFood.macros.fat))
    : 0.5;

  // Format quantity as a human-readable amount based on the multiplier and serving size
  function formatQty(food: FoodItem, mult: number): string {
    const grams = Math.round(food.gramsPerServing * mult);
    // If the serving label is already in common units, show adjusted amount
    if (food.servingLabel.includes('scoop') || food.servingLabel.includes('tbsp')
        || food.servingLabel.includes('cup') || food.servingLabel.includes('slice')
        || food.servingLabel.includes('medium') || food.servingLabel.includes('ml')
        || food.servingLabel.includes('cake')) {
      // Show grams
      return `${grams}g`;
    }
    return `${grams}g`;
  }

  const ingredients: GeneratedIngredient[] = [
    {
      name: proteinFood.name,
      quantity: formatQty(proteinFood, proteinMultiplier),
      servingLabel: proteinFood.servingLabel,
    },
    {
      name: carbFood.name,
      quantity: formatQty(carbFood, carbMultiplier),
      servingLabel: carbFood.servingLabel,
    },
    {
      name: fatFood.name,
      quantity: formatQty(fatFood, fatMultiplier),
      servingLabel: fatFood.servingLabel,
    },
    { name: veg1.name, quantity: '1 serving', servingLabel: veg1.servingLabel },
    { name: veg2.name, quantity: '1 serving', servingLabel: veg2.servingLabel },
  ];

  // Calculate actual total macros
  function scaleMacros(food: FoodItem, mult: number): Macros {
    return {
      calories: food.macros.calories * mult,
      protein:  food.macros.protein  * mult,
      carbs:    food.macros.carbs    * mult,
      fat:      food.macros.fat      * mult,
    };
  }

  const parts: Macros[] = [
    scaleMacros(proteinFood, proteinMultiplier),
    scaleMacros(carbFood,    carbMultiplier),
    scaleMacros(fatFood,     fatMultiplier),
    veg1.macros,
    veg2.macros,
  ];

  const totalMacros: Macros = parts.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein:  acc.protein  + m.protein,
      carbs:    acc.carbs    + m.carbs,
      fat:      acc.fat      + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return { ingredients, totalMacros };
}

function MacroGenerator() {
  const { dispatch, state } = useApp();

  const macroTargets = state.currentUser?.macroTargets;
  const [calories, setCalories] = useState(String(macroTargets?.calories ?? 2000));
  const [protein,  setProtein]  = useState(String(macroTargets?.protein  ?? 170));
  const [carbs,    setCarbs]    = useState(String(macroTargets?.carbs    ?? 200));
  const [fat,      setFat]      = useState(String(macroTargets?.fat      ?? 65));

  const [result,  setResult]  = useState<GeneratedMeal | null>(null);
  const [saved,   setSaved]   = useState(false);
  const [mealTime, setMealTime] = useState('Lunch');

  const MEAL_TIMES = ['Breakfast', 'Pre-Workout', 'Lunch', 'Post-Workout', 'Dinner', 'Snack'];

  function handleGenerate() {
    const targets: Macros = {
      calories: Math.max(0, Number(calories) || 0),
      protein:  Math.max(0, Number(protein)  || 0),
      carbs:    Math.max(0, Number(carbs)    || 0),
      fat:      Math.max(0, Number(fat)      || 0),
    };
    setResult(generateMeal(targets));
    setSaved(false);
  }

  function handleSave() {
    if (!result || !state.activeCamp) return;
    // Local calendar date — toISOString() is UTC and files an evening save
    // under tomorrow for users west of UTC (every other screen uses local).
    const today = format(new Date(), 'yyyy-MM-dd');
    // The reducer replaces the day's log wholesale, so carry today's existing
    // water/meals/notes through — otherwise saving macros silently wipes them.
    const existing = state.nutritionLogs.find(
      n => n.campId === state.activeCamp!.id && n.date === today,
    );
    dispatch({
      type: 'LOG_NUTRITION',
      payload: {
        campId: state.activeCamp.id,
        date: today,
        waterOz: existing?.waterOz ?? 0,
        mealRatings: existing?.mealRatings ?? {},
        notes: existing?.notes || `Generated for ${mealTime}`,
        macros: {
          calories: Math.round(result.totalMacros.calories),
          protein:  Math.round(result.totalMacros.protein),
          carbs:    Math.round(result.totalMacros.carbs),
          fat:      Math.round(result.totalMacros.fat),
        },
      },
    });
    setSaved(true);
  }

  const t = result?.totalMacros;
  const inputCal = Number(calories) || 0;

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Your Target Macros</p>

        {[
          { label: 'Calories',   value: calories,  set: setCalories, unit: 'kcal', color: 'text-orange-400' },
          { label: 'Protein',    value: protein,   set: setProtein,  unit: 'g',    color: 'text-green-400'  },
          { label: 'Carbs',      value: carbs,     set: setCarbs,    unit: 'g',    color: 'text-blue-400'   },
          { label: 'Fat',        value: fat,        set: setFat,      unit: 'g',    color: 'text-purple-400' },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-white w-20">{row.label}</label>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="number"
                inputMode="numeric"
                className="input text-sm text-right flex-1"
                value={row.value}
                onChange={e => row.set(e.target.value)}
                min={0}
              />
              <span className={`text-xs font-semibold w-8 ${row.color}`}>{row.unit}</span>
            </div>
          </div>
        ))}

        <button
          onClick={handleGenerate}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <Sparkles size={16} />
          Generate Meal
        </button>
      </div>

      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">Generated Meal</p>
            <button onClick={handleGenerate} className="text-xs text-brand-400 font-semibold">Regenerate</button>
          </div>

          {/* Meal timing selector */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {MEAL_TIMES.map(t => (
              <button
                key={t}
                onClick={() => setMealTime(t)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                  mealTime === t
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-dark-600 border-dark-400 text-gray-400 hover:border-dark-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Ingredients</p>
            <div className="space-y-1.5">
              {result.ingredients.map((ing, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{ing.name}</span>
                  <span className="text-sm font-semibold text-white">{ing.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {t && (
            <div className="space-y-2 pt-1 border-t border-dark-600">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Estimated Macros</p>
              <MacroBar label="Calories" value={t.calories} max={Number(calories) || 2000} color="bg-orange-500" unit="kcal" />
              <MacroBar label="Protein"  value={t.protein}  max={Number(protein)  || 200} color="bg-green-500" />
              <MacroBar label="Carbs"    value={t.carbs}    max={Number(carbs)    || 300} color="bg-blue-500"  />
              <MacroBar label="Fat"      value={t.fat}      max={Number(fat)      || 100} color="bg-purple-500" />
              <div className="flex justify-between text-xs mt-1 pt-1 border-t border-dark-700">
                <span className="text-gray-400">Total Calories</span>
                <span className={`font-bold ${Math.round(t.calories) > inputCal * 1.15 ? 'text-red-400' : 'text-orange-400'}`}>
                  {Math.round(t.calories)} kcal
                  {inputCal > 0 && ` / ${inputCal}`}
                </span>
              </div>
            </div>
          )}

          {state.activeCamp ? (
            <button
              onClick={handleSave}
              disabled={saved}
              className={`w-full py-2 rounded-xl text-sm font-semibold transition-all ${
                saved
                  ? 'bg-green-900/40 text-green-300 cursor-default'
                  : 'bg-dark-600 border border-dark-400 text-gray-300 hover:border-brand-600 hover:text-white'
              }`}
            >
              {saved ? '✓ Saved to Nutrition Log' : 'Save Macros to Today\'s Log'}
            </button>
          ) : (
            <p className="text-xs text-gray-500 text-center">Set up a fight camp to save macros to your log.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'plans' | 'generator';

const GOALS: (MealGoal | 'all')[] = ['all', 'Cut', 'Maintain', 'Build'];

export default function MealLibrary() {
  const [tab,  setTab]  = useState<Tab>('plans');
  const [goal, setGoal] = useState<MealGoal | 'all'>('all');

  const filteredPlans = useMemo(() => (
    goal === 'all' ? MEAL_PLANS : MEAL_PLANS.filter(p => p.goal === goal)
  ), [goal]);

  return (
    <div className="pb-4">
      {/* Tab bar */}
      <div className="mx-4 mt-4 flex gap-1 bg-dark-700 rounded-xl p-1">
        {([['plans', 'Meal Plans', BookOpen], ['generator', 'Macro Generator', Sparkles]] as const).map(
          ([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === value
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ),
        )}
      </div>

      {tab === 'plans' && (
        <>
          {/* Goal filter */}
          <div className="mx-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {GOALS.map(g => (
              <button
                key={g}
                onClick={() => setGoal(g)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  goal === g
                    ? g === 'Cut'      ? 'bg-red-600 border-red-500 text-white'
                    : g === 'Build'    ? 'bg-purple-600 border-purple-500 text-white'
                    : g === 'Maintain' ? 'bg-brand-600 border-brand-500 text-white'
                    :                   'bg-brand-600 border-brand-500 text-white'
                    : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
                }`}
              >
                {g === 'all' ? 'All Plans' : g}
              </button>
            ))}
          </div>

          <div className="mx-4 mt-3 mb-2">
            <p className="text-xs text-gray-500">{filteredPlans.length} plan{filteredPlans.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="mx-4 space-y-2">
            {filteredPlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center">
                  <UtensilsCrossed size={22} className="text-gray-500" />
                </div>
                <p className="text-sm text-gray-400">No plans found.</p>
              </div>
            ) : (
              filteredPlans.map(plan => <MealPlanCard key={plan.id} plan={plan} />)
            )}
          </div>
        </>
      )}

      {tab === 'generator' && (
        <div className="mx-4 mt-4">
          <MacroGenerator />
        </div>
      )}
    </div>
  );
}
