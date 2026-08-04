import { useState } from 'react';
import { Droplets, Minus, Trash2, UtensilsCrossed, Flame, Settings2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { todayISO } from '../utils/dates';
import { format, parseISO, subDays, differenceInDays } from 'date-fns';
import type { NutritionLog, MacroEntry } from '../types';
import Modal from './shared/Modal';

type MealRating = 'good' | 'ok' | 'poor';
type Meal = 'breakfast' | 'lunch' | 'dinner';

const DAILY_GOAL_OZ = 64;
const GLASS_OZ = 8;

const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const MEAL_COLORS: Record<MealRating, string> = {
  good: 'bg-green-700 border-green-600 text-white',
  ok: 'bg-yellow-700 border-yellow-600 text-white',
  poor: 'bg-red-800 border-red-700 text-white',
};

const MEAL_IDLE: Record<MealRating, string> = {
  good: 'bg-dark-600 border-dark-400 text-gray-400 hover:border-green-700',
  ok: 'bg-dark-600 border-dark-400 text-gray-400 hover:border-yellow-700',
  poor: 'bg-dark-600 border-dark-400 text-gray-400 hover:border-red-800',
};

function MacroBar({ label, actual, target, color }: {
  label: string; actual: number; target: number; color: string;
}) {
  const pct = target > 0 ? Math.min(130, Math.round((actual / target) * 100)) : 0;
  const barColor = pct > 115 ? '#ef4444' : pct > 100 ? '#eab308' : color;
  const unit = label === 'Calories' ? 'kcal' : 'g';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <span className="text-xs text-gray-400">
          <span style={{ color: barColor }} className="font-semibold">{actual}</span>
          {target > 0 && <span className="text-gray-450"> / {target}{unit}</span>}
        </span>
      </div>
      <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

export default function NutritionTracker() {
  const { state, dispatch } = useApp();
  const { activeCamp, nutritionLogs, currentUser, weightEntries } = state;

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showMacroEntry, setShowMacroEntry] = useState(false);
  const [showTargetEditor, setShowTargetEditor] = useState(false);
  const [macroInput, setMacroInput] = useState<MacroEntry>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [targetInput, setTargetInput] = useState<MacroEntry>({ calories: 2000, protein: 150, carbs: 200, fat: 65 });

  if (!activeCamp) {
    return (
      <div className="mx-4 mt-4 card text-center py-12">
        <Droplets size={40} className="text-gray-450 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No active fight camp</p>
        <p className="text-sm text-gray-450 mt-1">Set up a fight camp to track nutrition</p>
      </div>
    );
  }

  const campLogs = nutritionLogs.filter(n => n.campId === activeCamp.id);
  const todayLog = campLogs.find(n => n.date === selectedDate);

  const waterOz = todayLog?.waterOz ?? 0;
  const glasses = Math.floor(waterOz / GLASS_OZ);
  const waterPct = Math.min(100, Math.round((waterOz / DAILY_GOAL_OZ) * 100));
  const waterColor = waterPct >= 100 ? 'text-green-400' : waterPct >= 60 ? 'text-brand-400' : 'text-blue-400';
  const barColor = waterPct >= 100 ? 'from-green-700 to-green-500' : 'from-blue-700 to-blue-400';

  function updateLog(patch: Partial<Omit<NutritionLog, 'id' | 'createdAt' | 'campId' | 'date'>>) {
    dispatch({
      type: 'LOG_NUTRITION',
      payload: {
        campId: activeCamp!.id,
        date: selectedDate,
        waterOz: todayLog?.waterOz ?? 0,
        mealRatings: todayLog?.mealRatings ?? {},
        notes: todayLog?.notes ?? '',
        ...patch,
      },
    });
  }

  function addWater(delta: number) {
    updateLog({ waterOz: Math.max(0, waterOz + delta) });
  }

  function setMeal(meal: Meal, rating: MealRating) {
    const current = todayLog?.mealRatings ?? {};
    // Toggle off if already selected
    const next = current[meal] === rating
      ? { ...current, [meal]: undefined }
      : { ...current, [meal]: rating };
    updateLog({ mealRatings: next });
  }

  function saveNotes() {
    updateLog({ notes });
    setShowNotes(false);
  }

  function deleteLog(id: string) {
    dispatch({ type: 'DELETE_NUTRITION', payload: id });
  }

  function saveMacros() {
    updateLog({ macros: macroInput });
    setShowMacroEntry(false);
  }

  function openMacroEntry() {
    setMacroInput(todayLog?.macros ?? { calories: 0, protein: 0, carbs: 0, fat: 0 });
    setShowMacroEntry(true);
  }

  function openTargetEditor() {
    setTargetInput(currentUser?.macroTargets ?? { calories: 2000, protein: 150, carbs: 200, fat: 65 });
    setShowTargetEditor(true);
  }

  function saveTargets() {
    if (currentUser) {
      dispatch({ type: 'UPDATE_PROFILE', payload: { ...currentUser, macroTargets: targetInput } });
    }
    setShowTargetEditor(false);
  }

  function autoSuggestTargets() {
    if (!activeCamp || !currentUser) return;
    // No fight date (off-season) → Invalid Date → NaN; treat as far out (no deficit).
    const daysToFight = activeCamp.fightDate
      ? differenceInDays(parseISO(activeCamp.fightDate), new Date())
      : Infinity;
    // Macros key off what the fighter weighs NOW — latest weigh-in when one
    // exists, not the weight the camp started at.
    const latestWeighIn = weightEntries
      .filter(e => e.campId === activeCamp.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    const bodyWeightLbs = latestWeighIn?.weight ?? activeCamp.currentWeight;
    // Calorie deficit based on proximity to fight
    const deficit = daysToFight < 14 ? 500 : daysToFight < 28 ? 200 : 0;
    const maintenanceCals = Math.round(bodyWeightLbs * 15); // rough maintenance
    const calories = Math.max(1200, maintenanceCals - deficit);
    const protein = Math.round(bodyWeightLbs * 1); // 1g per lb
    const fat = Math.round((calories * 0.25) / 9);  // 25% of cals from fat
    const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
    setTargetInput({ calories, protein, carbs: Math.max(0, carbs), fat });
  }

  // Last 7 days history
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    return { date: d, log: campLogs.find(n => n.date === d) };
  });

  const mealScore = (log?: NutritionLog) => {
    if (!log) return null;
    const ratings = Object.values(log.mealRatings).filter(Boolean) as MealRating[];
    if (!ratings.length) return null;
    const score = ratings.reduce((s, r) => s + (r === 'good' ? 2 : r === 'ok' ? 1 : 0), 0);
    const max = ratings.length * 2;
    const pct = score / max;
    return pct >= 0.7 ? 'good' : pct >= 0.4 ? 'ok' : 'poor';
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tracking Date</p>
          <input
            type="date"
            aria-label="Tracking date"
            className="input w-auto text-sm py-1.5 px-3"
            value={selectedDate}
            max={todayISO()}
            onChange={e => {
              setSelectedDate(e.target.value);
              setNotes(campLogs.find(n => n.date === e.target.value)?.notes ?? '');
            }}
          />
        </div>
      </div>

      {/* Hydration */}
      <section className="mx-4">
        <div className="flex items-center gap-2 mb-2">
          <Droplets size={14} className="text-blue-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hydration</p>
        </div>
        <div className="card">
          {/* Water progress */}
          <div className="flex items-end justify-between mb-3">
            <div>
              <span className={`text-4xl font-black ${waterColor}`}>{waterOz}</span>
              <span className="text-gray-400 text-sm ml-1">/ {DAILY_GOAL_OZ} oz</span>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black ${waterColor}`}>{waterPct}%</div>
              <div className="text-xs text-gray-400">of daily goal</div>
            </div>
          </div>
          <div className="h-3 bg-dark-500 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-300`}
              style={{ width: `${waterPct}%` }}
            />
          </div>

          {/* Glass buttons */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {Array.from({ length: 8 }, (_, i) => (
              <button
                key={i}
                onClick={() => addWater(i < glasses ? -GLASS_OZ : GLASS_OZ)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all active:scale-90 ${
                  i < glasses
                    ? 'bg-blue-700 text-white'
                    : 'bg-dark-600 text-gray-450 hover:bg-dark-500'
                }`}
                title={i < glasses ? 'Remove glass' : 'Add glass'}
              >
                💧
              </button>
            ))}
          </div>

          {/* Quick-add presets */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-gray-400 flex-shrink-0">Quick add:</span>
            {[16, 32].map(oz => (
              <button
                key={oz}
                onClick={() => addWater(oz)}
                className="flex-1 py-1.5 rounded-lg bg-dark-600 border border-dark-400 text-xs text-gray-300 hover:border-brand-600 hover:text-white transition-all font-semibold"
              >
                +{oz}oz
              </button>
            ))}
            <button
              onClick={() => addWater(-8)}
              disabled={waterOz < 8}
              aria-label="Remove 8 oz of water"
              className="w-10 h-10 rounded-lg bg-dark-600 flex items-center justify-center text-gray-400 hover:text-white disabled:opacity-40 transition-all flex-shrink-0"
            >
              <Minus size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Meal Quality */}
      <section className="mx-4">
        <div className="flex items-center gap-2 mb-2">
          <UtensilsCrossed size={14} className="text-gray-400" />
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Meal Quality</p>
        </div>
        <div className="card space-y-3">
          {(['breakfast', 'lunch', 'dinner'] as Meal[]).map(meal => {
            const current = todayLog?.mealRatings[meal];
            return (
              <div key={meal} className="flex items-center justify-between">
                <span className="text-sm font-medium text-white w-24">{MEAL_LABELS[meal]}</span>
                <div className="flex gap-2">
                  {(['good', 'ok', 'poor'] as MealRating[]).map(rating => (
                    <button
                      key={rating}
                      onClick={() => setMeal(meal, rating)}
                      aria-pressed={current === rating}
                      aria-label={`${MEAL_LABELS[meal]}: ${rating}`}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all active:scale-95 ${
                        current === rating ? MEAL_COLORS[rating] : MEAL_IDLE[rating]
                      }`}
                    >
                      {rating === 'good' ? '✓ Good' : rating === 'ok' ? '~ OK' : '✗ Poor'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Macros */}
      <section className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Flame size={14} className="text-brand-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Macros</p>
          </div>
          <button onClick={openTargetEditor} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors">
            <Settings2 size={12} />
            {currentUser?.macroTargets ? 'Edit Targets' : 'Set Targets'}
          </button>
        </div>

        <div className="card space-y-3">
          {currentUser?.macroTargets ? (
            <>
              <MacroBar label="Calories" actual={todayLog?.macros?.calories ?? 0} target={currentUser.macroTargets.calories} color="#f97316" />
              <MacroBar label="Protein"  actual={todayLog?.macros?.protein  ?? 0} target={currentUser.macroTargets.protein}  color="#22c55e" />
              <MacroBar label="Carbs"    actual={todayLog?.macros?.carbs    ?? 0} target={currentUser.macroTargets.carbs}    color="#3b82f6" />
              <MacroBar label="Fat"      actual={todayLog?.macros?.fat      ?? 0} target={currentUser.macroTargets.fat}      color="#a855f7" />
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">Set targets to track your macros</p>
          )}
          <button onClick={openMacroEntry} className="w-full text-sm text-brand-400 hover:text-brand-300 font-semibold py-1 transition-colors">
            {todayLog?.macros ? 'Edit today\'s intake' : '+ Log today\'s macros'}
          </button>
        </div>
      </section>

      {/* Notes */}
      <section className="mx-4">
        {showNotes ? (
          <div className="card space-y-3">
            <label className="block">
              <span className="label">Notes</span>
              <textarea
              className="input resize-none"
              rows={3}
              placeholder="e.g. Felt dehydrated before sparring, had a cheat meal at lunch..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            </label>
            <div className="flex gap-2">
              <button onClick={saveNotes} className="btn-primary flex-1 py-2 text-sm">Save Notes</button>
              <button onClick={() => setShowNotes(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              setNotes(todayLog?.notes ?? '');
              setShowNotes(true);
            }}
            className="w-full card text-left text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            {todayLog?.notes
              ? <span className="text-gray-300">{todayLog.notes}</span>
              : '+ Add nutrition notes...'}
          </button>
        )}
      </section>

      {/* 7-day history */}
      <section className="mx-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Last 7 Days</p>
        <div className="card divide-y divide-dark-600">
          {last7.map(({ date, log }) => {
            const score = mealScore(log);
            const isToday = date === todayISO();
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                onClick={() => {
                  setSelectedDate(date);
                  setNotes(log?.notes ?? '');
                }}
                className={`w-full flex items-center justify-between py-2.5 px-1 transition-colors ${isSelected ? 'bg-dark-600 -mx-1 px-2 rounded-lg' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-16 text-left">
                    {isToday ? 'Today' : format(parseISO(date), 'EEE M/d')}
                  </span>
                  {log ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-blue-400 text-xs font-semibold">{log.waterOz}oz</span>
                      {log.macros && (
                        <>
                          <span className="text-orange-400 text-xs font-semibold">{log.macros.calories}kcal</span>
                          <span className="text-green-400 text-xs font-semibold">{log.macros.protein}g P</span>
                        </>
                      )}
                      {score && (
                        <span className={`badge text-xs ${
                          score === 'good' ? 'bg-green-900/40 text-green-400' :
                          score === 'ok' ? 'bg-yellow-900/40 text-yellow-400' :
                          'bg-red-900/40 text-red-400'
                        }`}>
                          {score === 'good' ? '✓ On track' : score === 'ok' ? '~ OK' : 'Needs work'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-450 text-xs">No data</span>
                  )}
                </div>
                {log && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteLog(log.id); }}
                    className="text-gray-450 hover:text-red-400 transition-colors p-3 -m-2"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Macro Entry Modal */}
      {showMacroEntry && (
        <Modal
          title="Today's Intake"
          onClose={() => setShowMacroEntry(false)}
          footer={
            <div className="flex gap-2">
              <button onClick={saveMacros} className="btn-primary flex-1 py-2 text-sm">Save</button>
              <button onClick={() => setShowMacroEntry(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
            </div>
          }
        >
          <div className="space-y-3">
            {([
              { key: 'calories', label: 'Calories (kcal)' },
              { key: 'protein',  label: 'Protein (g)' },
              { key: 'carbs',    label: 'Carbs (g)' },
              { key: 'fat',      label: 'Fat (g)' },
            ] as { key: keyof MacroEntry; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block">
                  <span className="label">{label}</span>
                  <input
                  type="number"
                  min={0}
                  className="input"
                  value={macroInput[key] || ''}
                  onChange={e => setMacroInput(m => ({ ...m, [key]: Number(e.target.value) }))}
                />
                </label>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Target Editor Modal */}
      {showTargetEditor && (
        <Modal
          title="Daily Macro Targets"
          onClose={() => setShowTargetEditor(false)}
          footer={
            <div className="flex gap-2">
              <button onClick={saveTargets} className="btn-primary flex-1 py-2 text-sm">Save Targets</button>
              <button onClick={() => setShowTargetEditor(false)} className="btn-secondary px-4 py-2 text-sm">Cancel</button>
            </div>
          }
        >
          <div className="space-y-3">
            <button onClick={autoSuggestTargets} className="w-full text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors text-left">
              Auto-suggest from camp data →
            </button>
            {([
              { key: 'calories', label: 'Calories (kcal)' },
              { key: 'protein',  label: 'Protein (g)' },
              { key: 'carbs',    label: 'Carbs (g)' },
              { key: 'fat',      label: 'Fat (g)' },
            ] as { key: keyof MacroEntry; label: string }[]).map(({ key, label }) => (
              <div key={key}>
                <label className="block">
                  <span className="label">{label}</span>
                  <input
                  type="number"
                  min={0}
                  className="input"
                  value={targetInput[key] || ''}
                  onChange={e => setTargetInput(t => ({ ...t, [key]: Number(e.target.value) }))}
                />
                </label>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
