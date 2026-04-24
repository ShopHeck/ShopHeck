import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Trophy, XCircle, Minus, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { triggerHaptic, HAPTIC } from '../hooks/useHaptics';
import { format } from 'date-fns';
import type { FightCamp, FightMethod, FightOutcome, FightRound, DamageLevel, FightResult } from '../types';
import { computeReadiness } from '../utils/readiness';
import { buildFightResult } from '../utils/storage';

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
  const [weighInWeight, setWeighInWeight] = useState<string>(existing?.weighInWeight?.toString() ?? '');
  const [fightNightWeight, setFightNightWeight] = useState<string>(existing?.fightNightWeight?.toString() ?? '');
  const [stylePlanFollowed, setStylePlanFollowed] = useState<1 | 2 | 3 | 4 | 5>(existing?.stylePlanFollowed ?? 3);
  const [overallNotes, setOverallNotes] = useState(existing?.overallNotes ?? '');
  const [lessons, setLessons] = useState(existing?.lessons ?? '');

  const methodOptions = useMemo(() => {
    if (outcome === 'win') return METHODS_WIN;
    if (outcome === 'loss') return METHODS_LOSS;
    if (outcome === 'draw') return METHODS_DRAW;
    return ['DQ' as FightMethod];
  }, [outcome]);

  function setRoundField<K extends keyof FightRound>(idx: number, key: K, value: FightRound[K]) {
    setRounds(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r));
  }

  function adjustTotalRounds(n: number) {
    if (n < 1) return;
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
    const readiness = computeReadiness(state);

    const base: Omit<FightResult, 'id' | 'createdAt'> = {
      campId: camp.id,
      fighterId: state.currentUser?.id ?? '',
      fightDate,
      opponent,
      outcome,
      method,
      roundStopped,
      totalRounds,
      rounds: fightedRounds,
      weighInWeight: weighInWeight ? Number(weighInWeight) : undefined,
      fightNightWeight: fightNightWeight ? Number(fightNightWeight) : undefined,
      stylePlanFollowed,
      overallNotes,
      lessons,
      readinessAtFight: readiness?.overall,
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
        <button onClick={onCancel} className="text-gray-400 hover:text-white p-1">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Step {step + 1} of 4</p>
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Result</label>
            <div className="grid grid-cols-4 gap-2">
              {([
                { v: 'win' as const, icon: Trophy, label: 'Win', color: 'bg-green-900/40 border-green-700 text-green-300' },
                { v: 'loss' as const, icon: XCircle, label: 'Loss', color: 'bg-red-900/40 border-red-700 text-red-300' },
                { v: 'draw' as const, icon: Minus, label: 'Draw', color: 'bg-yellow-900/40 border-yellow-700 text-yellow-300' },
                { v: 'no-contest' as const, icon: Minus, label: 'NC', color: 'bg-gray-800 border-gray-600 text-gray-300' },
              ]).map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setOutcome(opt.v)}
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Method</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as FightMethod)}
              className="input"
            >
              {methodOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Total Rounds</label>
              <input
                type="number"
                min={1}
                max={12}
                value={totalRounds}
                onChange={e => adjustTotalRounds(Number(e.target.value))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Stopped Round</label>
              <input
                type="number"
                min={1}
                max={totalRounds}
                placeholder="—"
                value={roundStopped ?? ''}
                onChange={e => setRoundStopped(e.target.value ? Number(e.target.value) : undefined)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Opponent</label>
            <input type="text" value={opponent} onChange={e => setOpponent(e.target.value)} className="input" />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Fight Date</label>
            <input type="date" value={fightDate} onChange={e => setFightDate(e.target.value)} className="input" />
          </div>
        </div>
      )}

      {/* Step 1 — Rounds */}
      {step === 1 && (
        <div className="mx-4 mt-6 space-y-4">
          <p className="text-xs text-gray-500">Rate each round. Used to correlate camp KPIs with in-fight performance.</p>
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
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">What worked</label>
                <input
                  type="text"
                  value={r.workedWell}
                  onChange={e => setRoundField(idx, 'workedWell', e.target.value)}
                  placeholder="Jab cross, check hook, body kick…"
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">What didn't</label>
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Weigh-in weight (lbs)</label>
            <input
              type="number"
              step="0.1"
              value={weighInWeight}
              onChange={e => setWeighInWeight(e.target.value)}
              placeholder={`${camp.targetWeight}`}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Fight-night weight (lbs)</label>
            <input
              type="number"
              step="0.1"
              value={fightNightWeight}
              onChange={e => setFightNightWeight(e.target.value)}
              placeholder="After rehydration"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Style plan followed: {stylePlanFollowed}/5
            </label>
            <input
              type="range"
              min={1}
              max={5}
              value={stylePlanFollowed}
              onChange={e => setStylePlanFollowed(Number(e.target.value) as 1|2|3|4|5)}
              className="w-full accent-brand-500"
            />
            <p className="text-xs text-gray-500 mt-1">1 = abandoned it · 5 = executed perfectly</p>
          </div>
        </div>
      )}

      {/* Step 3 — Reflection */}
      {step === 3 && (
        <div className="mx-4 mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Overall notes</label>
            <textarea
              value={overallNotes}
              onChange={e => setOverallNotes(e.target.value)}
              rows={4}
              placeholder="How did the fight feel overall? Mood, confidence, surprises…"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Lessons for next camp</label>
            <textarea
              value={lessons}
              onChange={e => setLessons(e.target.value)}
              rows={4}
              placeholder="What will you change? This feeds the AI breakdown."
              className="input"
            />
          </div>
        </div>
      )}

      {/* Nav buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-dark-800 border-t border-dark-500 p-4 safe-area-bottom z-40">
        <div className="max-w-lg mx-auto flex gap-2">
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
      <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value as DamageLevel)} className="input text-sm">
        {DAMAGE_LEVELS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
  );
}
