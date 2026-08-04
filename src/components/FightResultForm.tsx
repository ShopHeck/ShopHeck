import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trophy, XCircle, Minus, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { triggerHaptic, HAPTIC } from '../hooks/useHaptics';
import { endOfDay, format, isValid, parseISO } from 'date-fns';
import { todayISO } from '../utils/dates';
import type { FightCamp, FightMethod, FightOutcome, FightRound, DamageLevel, FightResult } from '../types';
import { computeReadiness } from '../utils/readiness';
import { buildFightResult } from '../utils/storage';
import { toDisplayWeight, fromDisplayWeight } from '../utils/units';

interface Props {
  camp: FightCamp;
  /** When editing an existing result, passed in to pre-fill. */
  existingId?: string;
  onDone: (resultId: string) => void;
  onCancel: () => void;
}

const METHODS_WIN: FightMethod[] = ['KO', 'TKO', 'Submission', 'Unanimous Decision', 'Split Decision', 'Majority Decision', 'DQ'];
const METHODS_LOSS: FightMethod[] = ['KO', 'TKO', 'Submission', 'Unanimous Decision', 'Split Decision', 'Majority Decision', 'DQ'];
const METHODS_DRAW: FightMethod[] = ['Unanimous Decision', 'Split Decision', 'Majority Decision', 'Technical Decision'];

const DAMAGE_LEVELS: DamageLevel[] = ['none', 'light', 'moderate', 'heavy'];

function methodsFor(outcome: FightOutcome): FightMethod[] {
  if (outcome === 'win') return METHODS_WIN;
  if (outcome === 'loss') return METHODS_LOSS;
  if (outcome === 'draw') return METHODS_DRAW;
  return ['DQ' as FightMethod];
}

function emptyRound(n: number): FightRound {
  return {
    roundNumber: n,
    selfScore: 3,
    opponentPressure: 3,
    cardio: 3,
    damageDealt: 'light',
    damageTaken: 'light',
    workedWell: '',
    didntWork: '',
    cornerAdjustment: '',
  };
}

export default function FightResultForm({ camp, existingId, onDone, onCancel }: Props) {
  const { state, dispatch } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const existing = state.fightResults.find(r => r.id === existingId);

  const [step, setStep] = useState(0);
  const [outcome, setOutcome] = useState<FightOutcome>(existing?.outcome ?? 'win');
  const [method, setMethod] = useState<FightMethod>(existing?.method ?? 'Unanimous Decision');
  const [roundStopped, setRoundStopped] = useState<number | undefined>(existing?.roundStopped);
  const [totalRounds, setTotalRounds] = useState(existing?.totalRounds ?? camp.rounds);
  const [opponent, setOpponent] = useState(existing?.opponent ?? camp.opponent ?? '');
  const [fightDate, setFightDate] = useState(existing?.fightDate ?? camp.fightDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [rounds, setRounds] = useState<FightRound[]>(
    existing?.rounds ?? Array.from({ length: camp.rounds }, (_, i) => emptyRound(i + 1)),
  );
  const [weighInWeight, setWeighInWeight] = useState<string>(existing?.weighInWeight != null ? String(toDisplayWeight(existing.weighInWeight, unit)) : '');
  const [fightNightWeight, setFightNightWeight] = useState<string>(existing?.fightNightWeight != null ? String(toDisplayWeight(existing.fightNightWeight, unit)) : '');
  const [stylePlanFollowed, setStylePlanFollowed] = useState<1 | 2 | 3 | 4 | 5>(existing?.stylePlanFollowed ?? 3);
  const [overallNotes, setOverallNotes] = useState(existing?.overallNotes ?? '');
  const [lessons, setLessons] = useState(existing?.lessons ?? '');

  const methodOptions = useMemo(() => methodsFor(outcome), [outcome]);

  // Changing the outcome can invalidate the chosen method (a draw has no KO).
  // The select would display the first option while state kept the stale
  // value, so "KO" could be saved on a draw — snap method along with outcome.
  function selectOutcome(o: FightOutcome) {
    setOutcome(o);
    const opts = methodsFor(o);
    setMethod(m => (opts.includes(m) ? m : opts[0]));
  }

  function setRoundField<K extends keyof FightRound>(idx: number, key: K, value: FightRound[K]) {
    setRounds(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  }

  function adjustTotalRounds(raw: number) {
    // Number('') is NaN, and NaN < 1 is false — without the finite check a
    // cleared input would slice the rounds array to [] and destroy every
    // round-by-round note the user has typed.
    if (!Number.isFinite(raw) || raw < 1) return;
    const n = Math.min(15, Math.round(raw));
    setTotalRounds(n);
    setRounds(prev => {
      if (prev.length === n) return prev;
      if (prev.length < n) return [...prev, ...Array.from({ length: n - prev.length }, (_, i) => emptyRound(prev.length + i + 1))];
      return prev.slice(0, n);
    });
  }

  function submit() {
    const effectiveRoundCount = roundStopped ?? totalRounds;
    const fightedRounds = rounds.slice(0, effectiveRoundCount);
    // Snapshot readiness as of the fight itself, not the moment the form is
    // filled in — a result logged days later must not describe today's shape.
    // The whole fight day counts (endOfDay), and a missing/invalid/future date
    // falls back to now.
    const fightMoment = parseISO(fightDate);
    const asOf = isValid(fightMoment) && fightMoment <= new Date()
      ? endOfDay(fightMoment)
      : new Date();
    const readiness = existing ? null : computeReadiness(state, asOf);

    const base: Omit<FightResult, 'id' | 'createdAt'> = {
      // Edits keep the fight on its original camp. The form always receives
      // the ACTIVE camp, so editing an old fight from Camp History would
      // otherwise silently re-parent it and corrupt every KPI join.
      campId: existing?.campId ?? camp.id,
      fighterId: state.currentUser?.id ?? '',
      fightDate,
      opponent,
      outcome,
      method,
      roundStopped,
      totalRounds,
      rounds: fightedRounds,
      weighInWeight: weighInWeight ? fromDisplayWeight(Number(weighInWeight), unit) : undefined,
      fightNightWeight: fightNightWeight ? fromDisplayWeight(Number(fightNightWeight), unit) : undefined,
      stylePlanFollowed,
      overallNotes,
      lessons,
      // Keep the original snapshot on edit — recomputing here would replace
      // fight-time readiness with today's, weeks later.
      readinessAtFight: existing ? existing.readinessAtFight : readiness?.overall,
    };

    triggerHaptic(HAPTIC.sessionComplete);

    if (existing) {
      const updated: FightResult = { ...existing, ...base };
      dispatch({ type: 'UPDATE_FIGHT_RESULT', payload: updated });
      onDone(updated.id);
    } else {
      const fresh = buildFightResult(base);
      dispatch({ type: 'LOG_FIGHT_RESULT', payload: fresh });
      onDone(fresh.id);
    }
  }

  // ── Step views ────────────────────────────────────────────────────────────
  const stepLabels = ['Outcome', 'Rounds', 'Weigh-In', 'Reflection'];

  return (
    <div className="pb-24">
      {/* Progress header */}
      <div className="mx-4 mt-4 flex items-center gap-2">
        <button onClick={onCancel} aria-label="Cancel and go back" className="text-gray-400 hover:text-white p-2 -m-1">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Step {step + 1} of 4</p>
          <p className="text-white font-bold">{stepLabels[step]}</p>
        </div>
      </div>
      <div className="mx-4 mt-3 flex gap-1">
        {stepLabels.map((_, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-dark-500'}`} />
        ))}
      </div>

      {/* Step 0 — Outcome */}
      {step === 0 && (
        <div className="mx-4 mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Result</label>
            <div role="group" aria-label="Result" className="grid grid-cols-4 gap-2">
              {([
                { v: 'win' as const, icon: Trophy, label: 'Win', color: 'bg-green-900/40 border-green-700 text-green-300' },
                { v: 'loss' as const, icon: XCircle, label: 'Loss', color: 'bg-red-900/40 border-red-700 text-red-300' },
                { v: 'draw' as const, icon: Minus, label: 'Draw', color: 'bg-yellow-900/40 border-yellow-700 text-yellow-300' },
                { v: 'no-contest' as const, icon: Minus, label: 'NC', color: 'bg-gray-800 border-gray-600 text-gray-300' },
              ]).map(opt => (
                <button
                  key={opt.v}
                  onClick={() => selectOutcome(opt.v)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-bold ${
                    outcome === opt.v ? opt.color : 'bg-dark-700 border-dark-500 text-gray-400'
                  }`}
                >
                  <opt.icon size={18} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Method</span>
              <select
              value={method}
              onChange={e => setMethod(e.target.value as FightMethod)}
              className="input"
            >
              {methodOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Total Rounds</span>
                <input
                type="number"
                min={1}
                max={12}
                value={totalRounds}
                onChange={e => adjustTotalRounds(Number(e.target.value))}
                className="input"
              />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Stopped Round</span>
                <input
                type="number"
                min={1}
                max={totalRounds}
                placeholder="—"
                value={roundStopped ?? ''}
                onChange={e => setRoundStopped(e.target.value ? Number(e.target.value) : undefined)}
                className="input"
              />
              </label>
            </div>
          </div>

          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Opponent</span>
              <input type="text" value={opponent} onChange={e => setOpponent(e.target.value)} className="input" />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Fight Date</span>
              <input type="date" value={fightDate} max={todayISO()} onChange={e => setFightDate(e.target.value)} className="input" />
            </label>
          </div>
        </div>
      )}

      {/* Step 1 — Rounds */}
      {step === 1 && (
        <div className="mx-4 mt-6 space-y-4">
          <p className="text-xs text-gray-400">Rate each round. Used to correlate camp KPIs with in-fight performance.</p>
          {rounds.slice(0, roundStopped ?? totalRounds).map((r, idx) => (
            <div key={idx} className="card space-y-3">
              <p className="text-white font-bold">Round {r.roundNumber}</p>

              <RatingRow label="Self score" value={r.selfScore} onChange={v => setRoundField(idx, 'selfScore', v as 1|2|3|4|5)} />
              <RatingRow label="Opp pressure" value={r.opponentPressure} onChange={v => setRoundField(idx, 'opponentPressure', v as 1|2|3|4|5)} />
              <RatingRow label="Cardio" value={r.cardio} onChange={v => setRoundField(idx, 'cardio', v as 1|2|3|4|5)} />

              <div className="grid grid-cols-2 gap-2">
                <DamageSelect label="Dealt" value={r.damageDealt} onChange={v => setRoundField(idx, 'damageDealt', v)} />
                <DamageSelect label="Taken" value={r.damageTaken} onChange={v => setRoundField(idx, 'damageTaken', v)} />
              </div>

              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">What worked</label>
                <input
                  type="text"
                  value={r.workedWell}
                  onChange={e => setRoundField(idx, 'workedWell', e.target.value)}
                  placeholder="Jab cross, check hook, body kick…"
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">What didn't</label>
                <input
                  type="text"
                  value={r.didntWork}
                  onChange={e => setRoundField(idx, 'didntWork', e.target.value)}
                  placeholder="Got caught with left hook, slow on takedown defense…"
                  className="input text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Step 2 — Weigh-in */}
      {step === 2 && (
        <div className="mx-4 mt-6 space-y-4">
          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Weigh-in weight ({unit})</span>
              <input
              type="number"
              step="0.1"
              value={weighInWeight}
              onChange={e => setWeighInWeight(e.target.value)}
              placeholder={`${toDisplayWeight(camp.targetWeight, unit)}`}
              className="input"
            />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Fight-night weight ({unit})</span>
              <input
              type="number"
              step="0.1"
              value={fightNightWeight}
              onChange={e => setFightNightWeight(e.target.value)}
              placeholder="After rehydration"
              className="input"
            />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Style plan followed: {stylePlanFollowed}/5
            </span>
              <input
              type="range"
              min={1}
              max={5}
              value={stylePlanFollowed}
              onChange={e => setStylePlanFollowed(Number(e.target.value) as 1|2|3|4|5)}
              className="w-full accent-brand-500"
            />
            </label>
            <p className="text-xs text-gray-400 mt-1">1 = abandoned it · 5 = executed perfectly</p>
          </div>
        </div>
      )}

      {/* Step 3 — Reflection */}
      {step === 3 && (
        <div className="mx-4 mt-6 space-y-4">
          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Overall notes</span>
              <textarea
              value={overallNotes}
              onChange={e => setOverallNotes(e.target.value)}
              rows={4}
              placeholder="How did the fight feel overall? Mood, confidence, surprises…"
              className="input"
            />
            </label>
          </div>
          <div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Lessons for next camp</span>
              <textarea
              value={lessons}
              onChange={e => setLessons(e.target.value)}
              rows={4}
              placeholder="What will you change? This feeds the AI breakdown."
              className="input"
            />
            </label>
          </div>
        </div>
      )}

      {/* Nav buttons — inline so the app's BottomNav doesn't cover them. */}
      <div className="mx-4 mt-6 flex gap-2">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className="btn-secondary flex items-center gap-1 px-4">
            <ChevronLeft size={16} /> Back
          </button>
        )}
        {step < 3 ? (
          <button onClick={() => setStep(step + 1)} className="btn-primary flex-1 flex items-center justify-center gap-1">
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button onClick={submit} className="btn-primary flex-1 flex items-center justify-center gap-1">
            <Check size={16} /> Save Fight Result
          </button>
        )}
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-white font-semibold">{value}/5</span>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`py-1.5 rounded-lg text-xs font-bold ${
              value === n ? 'bg-brand-600 text-white' : 'bg-dark-700 text-gray-400'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function DamageSelect({ label, value, onChange }: { label: string; value: DamageLevel; onChange: (v: DamageLevel) => void }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value as DamageLevel)} className="input text-sm">
        {DAMAGE_LEVELS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  );
}
