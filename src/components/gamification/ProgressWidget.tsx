import { ChevronDown, ChevronUp, Flame, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { BELT_LABELS, defaultGamificationState } from '../../utils/gamification';
import BeltBadge from './BeltBadge';

interface Props {
  onOpenProgress: () => void;
}

export default function ProgressWidget({ onOpenProgress }: Props) {
  const { state, dispatch } = useApp();
  const prefs = state.dashboardPrefs ?? { progressWidgetCollapsed: false, progressWidgetHidden: false };
  const gam = state.gamification ?? defaultGamificationState();

  if (prefs.progressWidgetHidden) return null;

  const { belt, streak } = gam;
  const activeChallenge = gam.challenges
    .filter(c => !c.completed)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))[0];

  const flameColor = streak.atRisk
    ? 'text-red-400 animate-pulse'
    : streak.current > 0
    ? 'text-orange-400'
    : 'text-gray-400';

  function toggleCollapsed(e: React.MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'SET_DASHBOARD_PREF', payload: { progressWidgetCollapsed: !prefs.progressWidgetCollapsed } });
  }
  function hide(e: React.MouseEvent) {
    e.stopPropagation();
    dispatch({ type: 'SET_DASHBOARD_PREF', payload: { progressWidgetHidden: true } });
  }

  if (prefs.progressWidgetCollapsed) {
    return (
      <div className="mx-4">
        {/* Two real buttons side by side. This was a role="button" div with a
            second button nested inside it, which is invalid: assistive tech
            announces the outer control and cannot reach the inner one. */}
        <div className="w-full flex items-center gap-3 min-h-[44px] bg-dark-700/60 border border-dark-500 rounded-xl px-3 py-2 hover:border-dark-300 transition-colors">
          <button
            onClick={onOpenProgress}
            aria-label={`Open progress. ${BELT_LABELS[belt.current]}, ${streak.current} day streak.`}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <BeltBadge tier={belt.current} size="sm" />
            <span className="text-xs text-gray-400 truncate flex-1">{BELT_LABELS[belt.current]}</span>
            <span className="flex items-center gap-1">
              <Flame size={12} className={flameColor} />
              <span className="text-xs font-semibold text-white">{streak.current}</span>
            </span>
          </button>
          <button
            onClick={toggleCollapsed}
            className="p-3 -m-2 text-gray-400 hover:text-gray-300 transition-colors"
            aria-label="Expand progress widget"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4">
      <div className="bg-gradient-to-br from-dark-700 to-dark-800 border border-dark-500 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Your Progress</p>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleCollapsed}
              className="p-3 -m-2 text-gray-400 hover:text-gray-300 transition-colors"
              aria-label="Collapse progress widget"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={hide}
              className="p-3 -m-2 text-gray-400 hover:text-gray-300 transition-colors"
              aria-label="Hide progress widget"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <button onClick={onOpenProgress} className="w-full text-left">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0">
              <BeltBadge tier={belt.current} size="lg" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{BELT_LABELS[belt.current]}</p>
              {belt.nextTier ? (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {belt.workoutsToNext} workouts or {belt.winsToNext} win{belt.winsToNext === 1 ? '' : 's'} to {BELT_LABELS[belt.nextTier]}
                </p>
              ) : (
                <p className="text-[11px] text-gray-400 mt-0.5">Highest rank achieved.</p>
              )}
            </div>
          </div>

          {belt.nextTier && (
            <div className="mt-3 h-1 bg-dark-500 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-700 to-brand-500 transition-all duration-500"
                style={{ width: `${belt.progressPct}%` }}
              />
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Flame size={16} className={flameColor} />
              <div>
                <div className="text-base font-black text-white leading-tight">
                  {streak.current}
                  <span className="text-[10px] text-gray-400 font-medium ml-1">day{streak.current === 1 ? '' : 's'}</span>
                </div>
                <div className="text-[10px] text-gray-400">
                  {streak.atRisk ? 'Streak at risk!' : streak.expired ? 'Streak ended' : streak.best > streak.current ? `Best ${streak.best}` : 'Current streak'}
                </div>
              </div>
            </div>
            {activeChallenge && (
              <div className="min-w-0">
                <div className="text-[10px] text-gray-400 truncate">{activeChallenge.title}</div>
                <div className="mt-1 h-1 bg-dark-500 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all"
                    style={{ width: `${Math.min(100, (activeChallenge.progress / activeChallenge.target) * 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {Math.min(activeChallenge.progress, activeChallenge.target)}/{activeChallenge.target}
                </div>
              </div>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
