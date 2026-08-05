import { useMemo, useState } from 'react';
import { Activity, TrendingDown, TrendingUp, X, Undo2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  proposeAdaptation,
  adaptationsForCamp,
  type AdaptationProposal,
} from '../utils/adaptiveCamp';
import { getWeekNumberForDate } from '../utils/campGenerator';
import type { AdaptationKind } from '../types';

/**
 * The Adaptive Camp surface: one card, only when there is something to say.
 *
 * Renders nothing at all in the common case. A card that appears every day
 * stops being read, and the proposal engine is deliberately conservative for
 * the same reason (see `utils/adaptiveCamp.ts`).
 */

const KIND_STYLE: Record<AdaptationKind, {
  icon: typeof Activity;
  accent: string;
  ring: string;
  cta: string;
}> = {
  recovery: {
    icon: Activity,
    accent: 'text-blue-400',
    ring: 'from-blue-900/40 to-dark-700 border-blue-800/50',
    cta: 'Switch to recovery',
  },
  deload: {
    icon: TrendingDown,
    accent: 'text-yellow-400',
    ring: 'from-yellow-900/30 to-dark-700 border-yellow-800/50',
    cta: 'Lighten the week',
  },
  intensify: {
    icon: TrendingUp,
    accent: 'text-green-400',
    ring: 'from-green-900/30 to-dark-700 border-green-800/50',
    cta: 'Add the load',
  },
};

const APPLIED_LABEL: Record<AdaptationKind, string> = {
  recovery: 'Recovery week applied',
  deload: 'Deload applied',
  intensify: 'Extra load applied',
};

export default function AdaptationCard() {
  const { state, dispatch } = useApp();
  const { activeCamp } = state;
  const [busy, setBusy] = useState(false);

  // The signal read walks every workout log, weigh-in and HRV entry through
  // computeReadiness, and Dashboard re-renders on any dispatch. Memoized on the
  // slices it actually reads — not on `state`, whose identity changes on every
  // dispatch and would defeat the memo entirely (the same trap computeReadiness
  // itself was memoized out of).
  const proposal: AdaptationProposal | null = useMemo(
    () => proposeAdaptation(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeCamp,
      state.workoutLogs,
      state.hrvEntries,
      state.weightEntries,
      state.completedSessions,
      state.trainingSchedule,
      state.currentUser,
      state.nutritionLogs,
      state.conditioningTests,
      state.sparringLogs,
    ],
  );

  // An adaptation already in force on the current week — shown so the fighter
  // can see the plan was changed, and undo it.
  const applied = useMemo(() => {
    if (!activeCamp) return null;
    const week = getWeekNumberForDate(activeCamp, new Date());
    return adaptationsForCamp(state, activeCamp.id).find(a => a.weekNumber === week) ?? null;
  }, [state, activeCamp]);

  if (applied) {
    const style = KIND_STYLE[applied.kind];
    return (
      <div className="mx-4">
        <div className={`bg-gradient-to-r ${style.ring} border rounded-xl p-3 flex items-center gap-3`}>
          <style.icon size={15} className={`${style.accent} flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{APPLIED_LABEL[applied.kind]}</p>
            <p className="text-xs text-gray-400 truncate">{applied.reasons.join(' · ')}</p>
          </div>
          <button
            onClick={() => dispatch({ type: 'REVERT_ADAPTATION', payload: applied.id })}
            className="text-xs text-gray-400 hover:text-white flex items-center gap-1 flex-shrink-0 p-2 -m-1"
          >
            <Undo2 size={13} /> Undo
          </button>
        </div>
      </div>
    );
  }

  if (!proposal) return null;
  if ((state.dismissedAdaptations ?? []).includes(proposal.key)) return null;

  const style = KIND_STYLE[proposal.kind];

  function accept() {
    if (!proposal) return;
    setBusy(true);
    dispatch({
      type: 'ACCEPT_ADAPTATION',
      payload: {
        campId: proposal.campId,
        weekNumber: proposal.weekNumber,
        kind: proposal.kind,
        reasons: proposal.reasons,
        signals: proposal.signals,
      },
    });
  }

  return (
    <div className="mx-4">
      <div className={`bg-gradient-to-br ${style.ring} border rounded-xl p-4`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-dark-700/60 flex items-center justify-center flex-shrink-0 mt-0.5">
            <style.icon size={16} className={style.accent} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-white">{proposal.headline}</p>
              <button
                onClick={() => dispatch({ type: 'DISMISS_ADAPTATION', payload: proposal.key })}
                aria-label="Dismiss suggestion"
                className="text-gray-450 hover:text-white flex-shrink-0 p-2 -m-2"
              >
                <X size={14} />
              </button>
            </div>
            {/* The reasons ARE the feature. A plan that changes without saying
                why is indistinguishable from a plan that is broken. */}
            <ul className="mt-1.5 space-y-0.5">
              {proposal.reasons.map(r => (
                <li key={r} className="text-xs text-gray-300 flex gap-1.5">
                  <span className={style.accent}>·</span>
                  <span className="capitalize">{r}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-450 mt-2">
              Week {proposal.weekNumber} only. Your session count doesn&apos;t change, so this
              won&apos;t affect your adherence.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={accept}
                disabled={busy}
                className="btn-primary px-3 py-2 text-xs disabled:opacity-50"
              >
                {style.cta}
              </button>
              <button
                onClick={() => dispatch({ type: 'DISMISS_ADAPTATION', payload: proposal.key })}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Keep the plan
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
