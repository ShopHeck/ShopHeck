import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, UtensilsCrossed, Sparkles, BookOpen, Search, X } from 'lucide-react';
import { MEAL_PLANS, MEAL_PLAN_PHASES, formatIngredient, planMacros, planRecipes, recipeMacros, type MealGoal, type MealPlan } from '../data/nutrition';
import { MACRO_COLORS, tint, type Macro } from '../utils/designTokens';
import MacroGenerator from './MacroGenerator';

function MacroPill({ label, value, unit, macro }: { label: string; value: number; unit: string; macro: Macro }) {
  const color = MACRO_COLORS[macro];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
      style={{ backgroundColor: tint(color, 0.16), color }}
    >
      {label} {Math.round(value)}{unit}
    </span>
  );
}

const GOAL_COLORS: Record<MealGoal, string> = {
  Cut:      'bg-red-900/40 text-red-300',
  Maintain: 'bg-brand-900/40 text-brand-300',
  Build:    'bg-purple-900/40 text-purple-300',
};

const GOAL_ACCENT: Record<MealGoal, string> = {
  Cut:      'border-l-red-500',
  Maintain: 'border-l-brand-500',
  Build:    'border-l-purple-500',
};

function MealPlanCard({ plan }: { plan: MealPlan }) {
  const [open, setOpen] = useState(false);
  const [expandedMeal, setExpandedMeal] = useState<number | null>(null);
  const t = useMemo(() => planMacros(plan), [plan]);
  const meals = useMemo(() => planRecipes(plan), [plan]);

  return (
    <div className={`card p-0 overflow-hidden border-l-4 ${GOAL_ACCENT[plan.goal]}`}>
      <button
        className="w-full p-4 text-left flex items-start justify-between gap-3"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${GOAL_COLORS[plan.goal]}`}>
              {plan.goal}
            </span>
            <span className="text-[10px] font-semibold text-gray-400">{plan.phase}</span>
          </div>
          <p className="text-sm font-semibold text-white">{plan.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            <MacroPill label="Cal" value={t.calories} unit="" macro="calories" />
            <MacroPill label="P" value={t.protein} unit="g" macro="protein" />
            <MacroPill label="C" value={t.carbs} unit="g" macro="carbs" />
            <MacroPill label="F" value={t.fat} unit="g" macro="fat" />
          </div>
        </div>
        <div className="text-gray-400 flex-shrink-0 mt-1">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-dark-600">
          {meals.map((meal, i) => {
            const m = recipeMacros(meal);
            return (
              <div key={meal.id} className="border-b border-dark-700 last:border-0">
                <button
                  className="w-full px-4 py-3 text-left flex items-center justify-between gap-2"
                  onClick={() => setExpandedMeal(expandedMeal === i ? null : i)}
                >
                  <div>
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{meal.slot}</span>
                    <p className="text-sm font-medium text-white">{meal.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{Math.round(m.calories)} kcal</span>
                    {expandedMeal === i ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                  </div>
                </button>

                {expandedMeal === i && (
                  <div className="px-4 pb-3 space-y-2">
                    <p className="text-xs text-gray-400">{meal.description}</p>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Ingredients</p>
                      <ul className="space-y-0.5">
                        {meal.ingredients.map(ing => (
                          <li key={ing.foodId + ing.servings} className="text-xs text-gray-300 flex items-start gap-1.5">
                            <span className="text-gray-450 mt-0.5">·</span>{formatIngredient(ing)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <MacroPill label="Cal" value={m.calories} unit="" macro="calories" />
                      <MacroPill label="P" value={m.protein} unit="g" macro="protein" />
                      <MacroPill label="C" value={m.carbs} unit="g" macro="carbs" />
                      <MacroPill label="F" value={m.fat} unit="g" macro="fat" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Tab = 'plans' | 'generator';

const GOALS: (MealGoal | 'all')[] = ['all', 'Cut', 'Maintain', 'Build'];

export default function MealLibrary() {
  const [tab, setTab] = useState<Tab>('plans');
  const [goal, setGoal] = useState<MealGoal | 'all'>('all');
  const [phase, setPhase] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredPlans = useMemo(() => {
    return MEAL_PLANS.filter(p => {
      if (goal !== 'all' && p.goal !== goal) return false;
      if (phase !== 'all' && p.phase !== phase) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = [
          p.name,
          p.description,
          p.phase,
          ...planRecipes(p).map(r => r.name),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [goal, phase, search]);

  return (
    <div className="pb-4">
      <div className="mx-4 mt-4 flex gap-1 bg-dark-700 rounded-xl p-1">
        {([['plans', 'Meal Plans', BookOpen], ['generator', 'Macro Generator', Sparkles]] as const).map(
          ([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === value ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white'
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
          <div className="mx-4 mt-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9 text-sm"
                aria-label="Search meal plans"
                placeholder="Search plans, recipes, phase…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mx-4 mt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {GOALS.map(g => (
              <button
                key={g}
                onClick={() => setGoal(g)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  goal === g
                    ? g === 'Cut'      ? 'bg-red-600 border-red-500 text-white'
                    : g === 'Build'    ? 'bg-purple-600 border-purple-500 text-white'
                    :                   'bg-brand-600 border-brand-500 text-white'
                    : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
                }`}
              >
                {g === 'all' ? 'All Goals' : g}
              </button>
            ))}
          </div>

          <div className="mx-4 mt-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setPhase('all')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                phase === 'all' ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
              }`}
            >
              All Phases
            </button>
            {MEAL_PLAN_PHASES.map(p => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  phase === p ? 'bg-brand-600 border-brand-500 text-white' : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mx-4 mt-3 mb-2 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {filteredPlans.length} plan{filteredPlans.length !== 1 ? 's' : ''}
            </p>
            {(search || goal !== 'all' || phase !== 'all') && (
              <button
                onClick={() => { setSearch(''); setGoal('all'); setPhase('all'); }}
                className="text-xs text-gray-400 hover:text-white font-semibold flex items-center gap-1"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>

          <div className="mx-4 space-y-2">
            {filteredPlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center">
                  <UtensilsCrossed size={22} className="text-gray-400" />
                </div>
                <p className="text-sm text-gray-400">No plans match. Try a different search or clear filters.</p>
                <button
                  onClick={() => { setSearch(''); setGoal('all'); setPhase('all'); }}
                  className="text-xs text-brand-400 font-semibold"
                >
                  Clear filters
                </button>
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
