import { useCallback, useEffect, useState } from 'react';
import { Swords, Play, Pause, SkipForward, X, Flag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWakeLock } from '../hooks/useWakeLock';
import { useHaptics, HAPTIC } from '../hooks/useHaptics';
import { nextPhaseDeadline } from '../utils/timerClock';
import { planTextForRound, SEGMENT_LABELS, activeCornerSession } from '../utils/cornerMode';
import ConfirmDialog from './shared/ConfirmDialog';
import type { CornerRound, DamageLevel } from '../types';

/**
 * Corner Mode — the fight night screen.
 *
 * Deliberately NOT built on `useRoundTimer`. That hook carries custom presets,
 * Live Activity, MyZone MEP, background round alerts, voice announcements and
 * heart-rate zones — every one of which belongs to a training session and none
 * of which belongs in a corner. Reusing it would have meant threading a "this
 * is a fight" flag through 40 kB of timer that already works, and risking the
 * training timer to ship this. The fight clock here is twenty lines built on the
 * same `nextPhaseDeadline` anti-drift helper the training timer uses, so the two
 * cannot disagree about what a round is.
 *
 * The screen has exactly two states, because a corner has one free hand:
 *
 * - **Round running** — round number and clock, nothing else. Nobody is reading
 *   a game plan while their fighter is in there.
 * - **Between rounds** — the game plan segment for the round coming up, and a
 *   one-tap score for the round just finished. Sixty seconds, big targets.
 */

interface Props {
  onClose: () => void;
  /** Opens the post-fight form, carrying the scored rounds across. */
  onFinish: () => void;
}

type Phase = 'ready' | 'round' | 'rest' | 'done';

const SCORE_LABELS: Record<number, string> = {
  1: 'Bad', 2: 'Poor', 3: 'Even', 4: 'Good', 5: 'Dominant',
};
const CARDIO_LABELS: Record<number, string> = {
  1: 'Gassed', 2: 'Laboured', 3: 'OK', 4: 'Strong', 5: 'Fresh',
};
const PRESSURE_LABELS: Record<number, string> = {
  1: 'None', 2: 'Light', 3: 'Even', 4: 'Heavy', 5: 'Overwhelming',
};
const DAMAGE: DamageLevel[] = ['none', 'light', 'moderate', 'heavy'];

function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A row of tap targets. Big, because this is used cage-side under stress. */
function TapRow<T extends string | number>({ label, options, value, onPick, renderLabel }: {
  label: string;
  options: readonly T[];
  value: T | undefined;
  onPick: (v: T) => void;
  renderLabel: (v: T) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {options.map(o => (
          <button
            key={String(o)}
            onClick={() => onPick(o)}
            aria-pressed={value === o}
            className={`py-3 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
              value === o
                ? 'bg-brand-600 border-brand-500 text-white'
                : 'bg-dark-700 border-dark-500 text-gray-400'
            }`}
          >
            {renderLabel(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CornerMode({ onClose, onFinish }: Props) {
  const { state, dispatch } = useApp();
  const { activeCamp } = state;
  const fireHaptic = useHaptics(true);

  const session = activeCamp ? activeCornerSession(state, activeCamp.id) : null;
  const totalRounds = session?.totalRounds ?? activeCamp?.rounds ?? 3;
  const roundSeconds = session?.roundSeconds ?? (activeCamp?.roundDuration ?? 3) * 60;
  const restSeconds = session?.restSeconds ?? 60;

  const [phase, setPhase] = useState<Phase>('ready');
  const [round, setRound] = useState(1);
  const [deadline, setDeadline] = useState(0);
  const [remaining, setRemaining] = useState(roundSeconds);
  const [running, setRunning] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // The round currently being scored — the one that just ended.
  const [draft, setDraft] = useState<CornerRound | null>(null);

  // The screen must not sleep between rounds. This is the one place in the app
  // where a locked phone loses data nobody can recover.
  useWakeLock(phase === 'round' || phase === 'rest');

  const gamePlan = activeCamp ? state.gamePlans?.[activeCamp.id] : undefined;
  // The plan shown between rounds is for the round COMING UP, not the one just
  // finished — a corner is briefing, not reviewing.
  const upcoming = Math.min(round + 1, totalRounds);
  const plan = planTextForRound(gamePlan, phase === 'rest' ? upcoming : round, totalRounds);

  const saveDraft = useCallback((next: CornerRound) => {
    setDraft(next);
    if (session) dispatch({ type: 'SCORE_CORNER_ROUND', payload: { sessionId: session.id, round: next } });
  }, [dispatch, session]);

  // ── Fight clock ───────────────────────────────────────────────────────────
  //
  // Anchored to an absolute deadline rather than counting a local variable
  // down, so a throttled interval cannot shorten a round.
  useEffect(() => {
    if (!running || deadline === 0) return;
    const tick = () => setRemaining((deadline - Date.now()) / 1000);
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [running, deadline]);

  useEffect(() => {
    if (!running || remaining > 0 || deadline === 0) return;

    if (phase === 'round') {
      fireHaptic(HAPTIC.roundEnd);
      if (round >= totalRounds) {
        setRunning(false);
        setPhase('done');
        if (session) dispatch({ type: 'COMPLETE_CORNER_SESSION', payload: session.id });
        return;
      }
      setPhase('rest');
      setDraft({ roundNumber: round });
      setDeadline(d => nextPhaseDeadline(d, restSeconds));
      return;
    }

    if (phase === 'rest') {
      fireHaptic(HAPTIC.roundStart);
      setRound(r => r + 1);
      setDraft(null);
      setPhase('round');
      setDeadline(d => nextPhaseDeadline(d, roundSeconds));
    }
    // `remaining` drives the transition; the rest are stable per phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running, phase]);

  function start() {
    if (!activeCamp) return;
    if (!session) {
      dispatch({
        type: 'START_CORNER_SESSION',
        payload: { campId: activeCamp.id, totalRounds, roundSeconds, restSeconds },
      });
    }
    fireHaptic(HAPTIC.roundStart);
    setPhase('round');
    setDeadline(nextPhaseDeadline(0, roundSeconds));
    setRunning(true);
  }

  /** Skip to the next phase — a real bell went before our clock did. */
  function skip() {
    setDeadline(Date.now());
    setRemaining(0);
  }

  /** Stoppage. The fight ended inside the round that is running. */
  function endFight() {
    setRunning(false);
    setPhase('done');
    if (session) dispatch({ type: 'COMPLETE_CORNER_SESSION', payload: session.id });
    setConfirmEnd(false);
  }

  if (!activeCamp) {
    return (
      <div className="mx-4 mt-4 card text-center py-12">
        <Swords size={40} className="text-gray-450 mx-auto mb-3" />
        <p className="text-gray-400 font-semibold">No active camp</p>
        <button onClick={onClose} className="btn-secondary mt-4 px-4 py-2 text-sm">Back</button>
      </div>
    );
  }

  // ── Round running: the clock and nothing else ─────────────────────────────
  if (phase === 'round') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-6">
        <p className="text-brand-500 text-sm font-black uppercase tracking-[0.3em]">
          Round {round} of {totalRounds}
        </p>
        <p className="text-white font-black tabular-nums leading-none my-6" style={{ fontSize: 'min(38vw, 9rem)' }}>
          {fmt(remaining)}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // Pausing has to move the deadline, or the clock jumps forward by
              // the length of the pause the moment it resumes.
              if (running) { setRunning(false); }
              else { setDeadline(Date.now() + remaining * 1000); setRunning(true); }
            }}
            className="w-16 h-16 rounded-full bg-dark-700 border border-dark-500 text-white flex items-center justify-center"
            aria-label={running ? 'Pause' : 'Resume'}
          >
            {running ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            onClick={skip}
            className="w-16 h-16 rounded-full bg-dark-700 border border-dark-500 text-gray-400 flex items-center justify-center"
            aria-label="End round now"
          >
            <SkipForward size={22} />
          </button>
          <button
            onClick={() => setConfirmEnd(true)}
            className="w-16 h-16 rounded-full bg-red-900/50 border border-red-800 text-red-300 flex items-center justify-center"
            aria-label="Fight stopped"
          >
            <Flag size={20} />
          </button>
        </div>
        {confirmEnd && (
          <ConfirmDialog
            danger
            title="Fight over?"
            message="Ends the fight here. You'll go straight to the post-fight breakdown with the rounds you scored."
            confirmLabel="Fight over"
            onConfirm={endFight}
            onCancel={() => setConfirmEnd(false)}
          />
        )}
      </div>
    );
  }

  // ── Between rounds: brief, then score ─────────────────────────────────────
  if (phase === 'rest') {
    return (
      <div className="fixed inset-0 bg-dark-800 z-50 overflow-y-auto">
        <div className="sticky top-0 bg-dark-800 border-b border-dark-600 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Between rounds</p>
            <p className="text-2xl font-black text-white tabular-nums leading-tight">{fmt(remaining)}</p>
          </div>
          <button onClick={skip} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
            Round {upcoming} <SkipForward size={14} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* The brief, first — it is why the corner is looking at the phone. */}
          {plan ? (
            <div className="bg-gradient-to-br from-brand-900/40 to-dark-700 border border-brand-800/50 rounded-xl p-4">
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-1.5">
                {SEGMENT_LABELS[plan.segment]} · game plan
              </p>
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{plan.text}</p>
            </div>
          ) : (
            <div className="card text-center py-4">
              <p className="text-sm text-gray-400">No game plan for these rounds</p>
              <p className="text-xs text-gray-450 mt-1">Build one before the next fight and it shows up here.</p>
            </div>
          )}

          {gamePlan?.cornerInstructions?.trim() && (
            <div className="card">
              <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1.5">Corner instructions</p>
              <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{gamePlan.cornerInstructions}</p>
            </div>
          )}

          {/* Then the score for the round just finished. Optional, always. */}
          <div className="card space-y-4">
            <p className="text-sm font-bold text-white">Score round {round}</p>
            <TapRow
              label="How did that round go?"
              options={[1, 2, 3, 4, 5] as const}
              value={draft?.selfScore}
              onPick={v => saveDraft({ ...(draft ?? { roundNumber: round }), selfScore: v })}
              renderLabel={v => SCORE_LABELS[v]}
            />
            <TapRow
              label="Cardio"
              options={[1, 2, 3, 4, 5] as const}
              value={draft?.cardio}
              onPick={v => saveDraft({ ...(draft ?? { roundNumber: round }), cardio: v })}
              renderLabel={v => CARDIO_LABELS[v]}
            />
            <TapRow
              label="Their pressure"
              options={[1, 2, 3, 4, 5] as const}
              value={draft?.opponentPressure}
              onPick={v => saveDraft({ ...(draft ?? { roundNumber: round }), opponentPressure: v })}
              renderLabel={v => PRESSURE_LABELS[v]}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Damage dealt</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DAMAGE.map(d => (
                    <button
                      key={d}
                      onClick={() => saveDraft({ ...(draft ?? { roundNumber: round }), damageDealt: d })}
                      aria-pressed={draft?.damageDealt === d}
                      className={`py-2.5 rounded-lg text-xs font-semibold capitalize border ${
                        draft?.damageDealt === d ? 'bg-green-900/50 border-green-700 text-green-300' : 'bg-dark-700 border-dark-500 text-gray-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Damage taken</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {DAMAGE.map(d => (
                    <button
                      key={d}
                      onClick={() => saveDraft({ ...(draft ?? { roundNumber: round }), damageTaken: d })}
                      aria-pressed={draft?.damageTaken === d}
                      className={`py-2.5 rounded-lg text-xs font-semibold capitalize border ${
                        draft?.damageTaken === d ? 'bg-red-900/50 border-red-700 text-red-300' : 'bg-dark-700 border-dark-500 text-gray-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <input
              className="input text-sm"
              placeholder="What are you telling them? (optional)"
              value={draft?.cornerAdjustment ?? ''}
              onChange={e => saveDraft({ ...(draft ?? { roundNumber: round }), cornerAdjustment: e.target.value })}
            />
          </div>

          <button onClick={() => setConfirmEnd(true)} className="w-full py-3 rounded-xl text-sm font-semibold text-red-400 border border-red-900/50">
            Fight is over
          </button>
        </div>

        {confirmEnd && (
          <ConfirmDialog
            danger
            title="Fight over?"
            message="Ends the fight here. You'll go straight to the post-fight breakdown with the rounds you scored."
            confirmLabel="Fight over"
            onConfirm={endFight}
            onCancel={() => setConfirmEnd(false)}
          />
        )}
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const scored = session?.rounds.length ?? 0;
    return (
      <div className="fixed inset-0 bg-dark-800 z-50 flex flex-col items-center justify-center p-6 text-center">
        <Swords size={40} className="text-brand-500 mb-4" />
        <p className="text-2xl font-black text-white">Fight logged</p>
        <p className="text-sm text-gray-400 mt-2 max-w-xs">
          {scored > 0
            ? `${scored} round${scored === 1 ? '' : 's'} scored from the corner. The breakdown is pre-filled — you only need the result.`
            : 'No rounds were scored. The breakdown starts blank.'}
        </p>
        <button onClick={onFinish} className="btn-primary mt-6 px-6 py-3 text-sm">
          Log the result
        </button>
        <button onClick={onClose} className="mt-3 text-sm text-gray-400 hover:text-white">
          Later
        </button>
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-dark-800 z-50 flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-dark-600">
        <p className="font-black text-white">Corner Mode</p>
        <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white p-2 -m-2">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <Swords size={44} className="text-brand-500 mb-4" />
        <p className="text-xl font-black text-white">
          {activeCamp.opponent ? `vs ${activeCamp.opponent}` : 'Fight night'}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          {totalRounds} × {Math.round(roundSeconds / 60)} min · {restSeconds}s between
        </p>
        <p className="text-xs text-gray-450 mt-5 max-w-xs leading-relaxed">
          Your game plan shows between rounds. Score each round in one tap — whatever
          you get to is carried into the post-fight breakdown.
        </p>
        <button onClick={start} className="btn-primary mt-7 px-8 py-4 text-base flex items-center gap-2">
          <Play size={18} /> Start round 1
        </button>
      </div>
    </div>
  );
}
