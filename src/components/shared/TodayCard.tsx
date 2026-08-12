import { useMemo } from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '../../context/AppContext';
import { computeReadiness } from '../../utils/readiness';
import { getCurrentWeekNumber } from '../../utils/campGenerator';
import { sessionKey } from '../../utils/adherence';
import { todayISO } from '../../utils/dates';
import { readinessColor } from '../../utils/designTokens';
import { timerPrefillForDay, type TimerPrefill } from '../../utils/timerSession';
import GlassSurface from './GlassSurface';
import FightReadinessGauge from './FightReadinessGauge';
import TodaySessionRow from './TodaySessionRow';
import type { LogPrefill } from '../../App';

interface Props {
  accent: string;
  onNavigate: (view: 'readiness') => void;
  onLog: (prefill: LogPrefill) => void;
  onStartTimer: (prefill: TimerPrefill) => void;
  /** Falls back to a bare timer when nothing today is round-clockable. */
  onOpenTimer: () => void;
}

/**
 * Readiness and today's work, in one card.
 *
 * These were three separate blocks: a readiness card, a big "Start today's
 * session" button whose caption named the session, and a "Today's Training"
 * list further down that named it again. A fighter with one session today read
 * its name twice, a screen apart, and the button and the list could not be
 * seen at the same time.
 *
 * Merged, the card answers one question in the order it is actually asked:
 * should I train (the score), what is it (the rows), go (the button). The
 * session is named once, and ticking it off is right beside starting it.
 */
export default function TodayCard({ accent, onNavigate, onLog, onStartTimer, onOpenTimer }: Props) {
  const { state } = useApp();
  const {
    activeCamp, trainingSchedule, workoutLogs, sparringLogs, weightEntries,
    conditioningTests, nutritionLogs, currentUser, completedSessions,
  } = state;
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';

  // computeReadiness filters and sorts five collections and walks every camp
  // workout, and this component re-renders on ANY dispatch — including the
  // hourly gamification recompute and session toggles, neither of which is an
  // input to the score. Keyed on the slices it actually reads (not on `state`,
  // whose identity changes on every dispatch and would defeat the memo), plus a
  // day key so the elapsed-time terms cannot go stale on a Home left open
  // overnight. Must sit above the early return — hooks cannot be conditional.
  const todayKey = todayISO();
  const readiness = useMemo(
    () => computeReadiness(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCamp, workoutLogs, sparringLogs, weightEntries, conditioningTests,
     nutritionLogs, currentUser, trainingSchedule, unit, todayKey],
  );

  if (!activeCamp) return null;

  const weekNum = getCurrentWeekNumber(activeCamp);
  const week = trainingSchedule[weekNum - 1];
  const today = new Date();
  const dayOfWeek = today.getDay();
  const day = week?.days.find(d => d.dayOfWeek === dayOfWeek);

  const prefill = day && !day.isRestDay ? timerPrefillForDay(day.sessions, activeCamp) : null;
  const hasWork = !!day && !day.isRestDay && day.sessions.length > 0;

  return (
    <div className="mx-4">
      <GlassSurface cornerRadius="lg" className="overflow-hidden">
        {readiness && (
          <button
            onClick={() => onNavigate('readiness')}
            className="w-full flex items-center gap-4 p-4 text-left"
            aria-label={`Fight readiness ${readiness.overall} out of 100, ${readiness.status}. Open the full readiness breakdown.`}
          >
            <FightReadinessGauge
              score={readiness.overall}
              statusLabel={readiness.status}
              compact
            />
            <div className="flex-1 min-w-0">
              <p className="type-caption text-gray-450">Fight Readiness</p>
              <p
                className="type-card-title mt-0.5 leading-tight"
                style={{ color: readinessColor(readiness.overall) }}
              >
                {readiness.status}
              </p>
              {readiness.insights[0] && (
                <p className="text-xs text-gray-400 mt-1.5 leading-snug line-clamp-2">
                  {readiness.insights[0]}
                </p>
              )}
            </div>
            <ChevronRight size={16} className="text-gray-450 flex-shrink-0" />
          </button>
        )}

        {day && (
          <div
            className="px-4 pb-4"
            style={readiness ? { borderTop: '1px solid var(--surface-3)', paddingTop: 'var(--space-4)' } : { paddingTop: 'var(--space-4)' }}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="type-caption text-gray-450">Today</p>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {format(today, 'EEEE, MMM d')}
              </span>
            </div>

            {day.isRestDay ? (
              <div className="text-center py-5">
                <div className="text-3xl mb-2" aria-hidden="true">🧘</div>
                <p className="type-card-title text-white">Rest Day</p>
                <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Recovery is training too. Sleep well, eat well.
                </p>
              </div>
            ) : (
              <>
                <div>
                  {day.sessions.map((session, i) => {
                    const key = sessionKey(activeCamp.id, weekNum, dayOfWeek, i);
                    const loggable = session.type !== 'rest' && session.duration > 0;
                    return (
                      /* An explicit token border rather than Tailwind's
                         `divide-y`: that utility sets only the width, leaving
                         border-color at its initial `currentColor` — which
                         here is the row's white text, so the separator drew as
                         a bright white rule across the card. */
                      <div
                        key={i}
                        style={i > 0 ? { borderTop: '1px solid var(--surface-3)' } : undefined}
                      >
                        <TodaySessionRow
                          bare
                          session={session}
                          done={!!completedSessions[key]}
                          logColor={accent}
                          onLog={loggable ? () => onLog({
                            sessionType: session.type === 'rest' ? 'recovery' : session.type,
                            title: session.title,
                            duration: session.duration,
                            sessionKey: key,
                          }) : undefined}
                        />
                      </div>
                    );
                  })}
                </div>

                {hasWork && (
                  <button
                    onClick={() => (prefill ? onStartTimer(prefill) : onOpenTimer())}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base min-h-[52px] mt-3"
                  >
                    <Zap size={18} className="flex-shrink-0" />
                    {/* Truncates rather than wraps. A generated session title
                        can run long ("Boxing — combination work"), and letting
                        it wrap turned the primary action into a two-line block
                        with the round format orphaned underneath. */}
                    <span className="truncate min-w-0">
                      {prefill ? `Start ${prefill.label.toLowerCase()}` : 'Open timer'}
                    </span>
                    {prefill && (
                      <span className="text-xs font-semibold opacity-80 flex-shrink-0">
                        {prefill.rounds}×{Math.round(prefill.workSec / 60)}min
                      </span>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </GlassSurface>
    </div>
  );
}
