import { useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Target, Zap, Activity, Clock, Star, CheckCircle2, Circle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCurrentWeekNumber } from '../utils/campGenerator';
import { format, parseISO, addDays } from 'date-fns';
import { triggerHaptic, HAPTIC } from '../hooks/useHaptics';
import type { SessionType } from '../types';
import type { LogPrefill } from '../App';

const SESSION_CONFIG: Record<SessionType, { color: string; doneColor: string; icon: React.FC<{ size: number; className?: string }>; label: string }> = {
  conditioning: { color: 'bg-orange-900/50 border-orange-800/50 text-orange-400', doneColor: 'bg-orange-950/30 border-orange-900/30 text-orange-600', icon: ({ size, className }) => <Flame size={size} className={className} />, label: 'Conditioning' },
  skill:        { color: 'bg-blue-900/50 border-blue-800/50 text-blue-400',   doneColor: 'bg-blue-950/30 border-blue-900/30 text-blue-600',   icon: ({ size, className }) => <Target size={size} className={className} />,   label: 'Skill' },
  sparring:     { color: 'bg-red-900/50 border-red-800/50 text-red-400',     doneColor: 'bg-red-950/30 border-red-900/30 text-red-700',       icon: ({ size, className }) => <Zap size={size} className={className} />,      label: 'Sparring' },
  strength:     { color: 'bg-yellow-900/50 border-yellow-800/50 text-yellow-400', doneColor: 'bg-yellow-950/30 border-yellow-900/30 text-yellow-700', icon: ({ size, className }) => <Activity size={size} className={className} />, label: 'Strength' },
  recovery:     { color: 'bg-green-900/50 border-green-800/50 text-green-400', doneColor: 'bg-green-950/30 border-green-900/30 text-green-700', icon: ({ size, className }) => <Clock size={size} className={className} />,    label: 'Recovery' },
  rest:         { color: 'bg-gray-900/50 border-gray-700/50 text-gray-400',   doneColor: 'bg-gray-900/30 border-gray-800/30 text-gray-700',   icon: ({ size, className }) => <Star size={size} className={className} />,      label: 'Rest' },
};

const PHASE_COLORS: Record<string, string> = {
  'Base Building': 'text-blue-400',
  'Strength & Conditioning': 'text-yellow-400',
  'Fight Specific': 'text-orange-400',
  'Peak': 'text-red-400',
  'Taper': 'text-green-400',
  // Off-season phases
  'Foundation':       'text-indigo-400',
  'Development':      'text-teal-400',
  'Performance':      'text-purple-400',
  'Active Recovery':  'text-green-400',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Props {
  onLogSession: (prefill: LogPrefill) => void;
}

export default function WeeklyPlanner({ onLogSession }: Props) {
  const { state, dispatch } = useApp();
  const { activeCamp, trainingSchedule, completedSessions, dayOverrides, workoutLogs } = state;

  const currentWeekNum = activeCamp ? getCurrentWeekNumber(activeCamp) : 1;
  const [selectedWeek, setSelectedWeek] = useState(currentWeekNum);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDay());

  const week = trainingSchedule[selectedWeek - 1];
  if (!week || !activeCamp) return null;

  const isOffSeason = !!activeCamp.isOffSeason;
  // For off-season, compute cycle and phase-within-cycle for the selected week
  const selectedCycle = isOffSeason ? Math.ceil(selectedWeek / 4) : null;
  const selectedCyclePhase = isOffSeason ? ((selectedWeek - 1) % 4) + 1 : null;

  const today = new Date();
  const todayDayOfWeek = today.getDay();

  const selectedDayData = selectedDay !== null
    ? week.days.find(d => d.dayOfWeek === selectedDay)
    : null;

  function sessionKey(dayOfWeek: number, sessionIdx: number) {
    return `${activeCamp!.id}-${selectedWeek}-${dayOfWeek}-${sessionIdx}`;
  }

  function toggleDone(dayOfWeek: number, sessionIdx: number) {
    const key = sessionKey(dayOfWeek, sessionIdx);
    const completing = !completedSessions[key];
    triggerHaptic(completing ? HAPTIC.sessionComplete : HAPTIC.tick);
    dispatch({ type: 'TOGGLE_SESSION', payload: key });
  }

  function dayOverrideKey(dayOfWeek: number) {
    return `${activeCamp!.id}-${selectedWeek}-${dayOfWeek}`;
  }

  function toggleDayRest(dayOfWeek: number) {
    dispatch({ type: 'TOGGLE_DAY_OVERRIDE', payload: dayOverrideKey(dayOfWeek) });
  }

  // Adherence for the selected week: completed non-rest sessions / total non-rest sessions
  const weekSessions = week.days.flatMap((d) =>
    d.isRestDay ? [] : d.sessions.map((_, si) => `${activeCamp.id}-${selectedWeek}-${d.dayOfWeek}-${si}`)
  );
  const completedCount = weekSessions.filter(k => completedSessions[k]).length;
  const totalCount = weekSessions.length;
  const adherencePct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4 pb-4">
      {/* Week Navigator */}
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => setSelectedWeek(w => Math.max(1, w - 1))}
            disabled={selectedWeek <= 1}
            aria-label="Previous week"
            className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-white font-bold">
              {isOffSeason ? `Off Season — Week ${selectedWeek}` : `Week ${selectedWeek}`}
            </p>
            <p className="text-xs text-gray-400">
              {format(parseISO(week.startDate), 'MMM d')} – {format(parseISO(week.endDate), 'MMM d')}
              {selectedWeek === currentWeekNum && (
                <span className={`ml-1 ${isOffSeason ? 'text-teal-400' : 'text-brand-400'}`}>(This Week)</span>
              )}
            </p>
            {isOffSeason && selectedCycle !== null && selectedCyclePhase !== null && (
              <p className="text-[11px] text-gray-450 mt-0.5">
                Cycle {selectedCycle} · Phase {selectedCyclePhase} of 4
              </p>
            )}
          </div>
          <button
            onClick={() => setSelectedWeek(w => Math.min(activeCamp.campWeeks, w + 1))}
            disabled={selectedWeek >= activeCamp.campWeeks}
            aria-label="Next week"
            className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Phase card with adherence */}
        <div className="bg-dark-700 border border-dark-500 rounded-xl p-3 mt-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <span className={`text-sm font-bold ${PHASE_COLORS[week.phase] || 'text-white'}`}>{week.phase}</span>
              <p className="text-xs text-gray-400 mt-0.5 leading-tight">{week.focus}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span className={`badge text-xs ${
                week.intensity === 'Very High' ? 'bg-red-900/50 text-red-400' :
                week.intensity === 'High'     ? 'bg-orange-900/50 text-orange-400' :
                week.intensity === 'Medium'   ? 'bg-yellow-900/50 text-yellow-400' :
                                                'bg-green-900/50 text-green-400'
              }`}>
                {week.intensity}
              </span>
              {totalCount > 0 && (
                <span className={`badge text-xs ${
                  adherencePct === 100 ? 'bg-green-900/50 text-green-400' :
                  adherencePct >= 70  ? 'bg-brand-900/50 text-brand-400' :
                                        'bg-dark-500 text-gray-400'
                }`}>
                  {completedCount}/{totalCount} done
                </span>
              )}
            </div>
          </div>

          {/* Adherence bar */}
          {totalCount > 0 && (
            <div className="mt-2.5">
              <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    adherencePct === 100 ? 'bg-green-500' :
                    adherencePct >= 70  ? 'bg-brand-500' :
                                          'bg-dark-300'
                  }`}
                  style={{ width: `${adherencePct}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-dark-500 flex flex-wrap gap-1.5">
            {week.weeklyGoals.map((goal, i) => (
              <span key={i} className="text-xs bg-dark-600 text-gray-400 px-2 py-0.5 rounded-full">
                {goal}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Day selector */}
      <div className="mx-4">
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((label, idx) => {
            // weekStart is always Monday (idx=1). Compute this day's calendar date:
            // Mon→+0, Tue→+1, ..., Sat→+5, Sun→+6
            const weekStartDate = parseISO(week.startDate);
            const dayDate = addDays(weekStartDate, idx === 0 ? 6 : idx - 1);
            const dayData = week.days.find(d => d.dayOfWeek === idx);
            const isToday = idx === todayDayOfWeek && selectedWeek === currentWeekNum;
            const isSelected = selectedDay === idx;
            const daySessions = dayData && !dayData.isRestDay
              ? dayData.sessions.map((_, si) => `${activeCamp.id}-${selectedWeek}-${idx}-${si}`)
              : [];
            const allDone = daySessions.length > 0 && daySessions.every(k => completedSessions[k]);
            const someDone = daySessions.some(k => completedSessions[k]);

            return (
              <button
                key={idx}
                onClick={() => { triggerHaptic(HAPTIC.tick); setSelectedDay(isSelected ? null : idx); }}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${
                  isSelected
                    ? (isOffSeason ? 'border-teal-500 bg-teal-900/20' : 'border-brand-500 bg-brand-900/30')
                    : isToday
                    ? (isOffSeason ? 'border-teal-700/50 bg-dark-600' : 'border-brand-700/50 bg-dark-600')
                    : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                }`}
              >
                <span className={`text-xs font-medium ${
                  isSelected ? (isOffSeason ? 'text-teal-400' : 'text-brand-400') :
                  isToday ? (isOffSeason ? 'text-teal-300' : 'text-brand-300') : 'text-gray-400'
                }`}>
                  {label}
                </span>
                <span className={`text-[10px] leading-none ${
                  isSelected ? (isOffSeason ? 'text-teal-500' : 'text-brand-500') :
                  isToday ? (isOffSeason ? 'text-teal-600' : 'text-brand-600') : 'text-gray-450'
                }`}>
                  {format(dayDate, 'd')}
                </span>
                <div className={`w-2 h-2 rounded-full ${
                  allDone ? 'bg-green-500' :
                  someDone ? 'bg-brand-600' :
                  daySessions.length > 0 ? (isSelected ? 'bg-brand-400' : 'bg-dark-300') :
                  'bg-dark-500'
                }`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Detail */}
      {selectedDay !== null && selectedDayData && (() => {
        const isRestOverride = !!dayOverrides[dayOverrideKey(selectedDay)];
        const isRest = selectedDayData.isRestDay || isRestOverride;
        return (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-white">{FULL_DAY_LABELS[selectedDay]}</h3>
            <div className="flex items-center gap-2">
              {isRest && <span className="badge bg-green-900/40 text-green-400">Rest Day</span>}
              {!selectedDayData.isRestDay && (
                <button
                  onClick={() => toggleDayRest(selectedDay)}
                  className="text-[11px] text-gray-400 hover:text-gray-300 transition-colors"
                >
                  {isRestOverride ? 'Restore training' : 'Mark as rest'}
                </button>
              )}
            </div>
          </div>

          {isRest ? (
            <div className="card text-center py-8">
              <div className="text-4xl mb-3">🛌</div>
              <p className="font-semibold text-white">{isRestOverride ? 'Rest Day (Override)' : 'Full Rest Day'}</p>
              <p className="text-sm text-gray-400 mt-2 max-w-xs mx-auto">
                Recovery is part of training. Sleep 8+ hours, hydrate, and eat well.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayData.sessions.map((session, i) => {
                const config = SESSION_CONFIG[session.type];
                const key = sessionKey(selectedDay, i);
                const isDone = !!completedSessions[key];
                const matchingLog = isDone ? workoutLogs.find(l =>
                  l.campId === activeCamp.id &&
                  l.weekNumber === selectedWeek &&
                  l.dayLabel === FULL_DAY_LABELS[selectedDay] &&
                  l.sessionType === session.type
                ) : undefined;

                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-4 transition-all duration-200 ${isDone ? config.doneColor : config.color}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Completion toggle */}
                      <button
                        onClick={() => toggleDone(selectedDay, i)}
                        className="flex-shrink-0 mt-0.5 transition-transform active:scale-90"
                        aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {isDone
                          ? <CheckCircle2 size={22} className="text-green-400" />
                          : <Circle size={22} className="text-gray-450 hover:text-gray-400 transition-colors" />
                        }
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-bold transition-all ${isDone ? 'line-through text-gray-400' : 'text-white'}`}>
                            {session.title}
                          </span>
                          <span className="badge bg-black/20 text-xs">{config.label}</span>
                          {isDone && <span className="badge bg-green-900/50 text-green-400 text-xs">Done ✓</span>}
                          {matchingLog && <span className="badge bg-dark-500 text-gray-400 text-xs">RPE {matchingLog.rpe}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-400">{session.duration} min</span>
                          {matchingLog && <span className="text-xs text-gray-400">{matchingLog.duration} min logged</span>}
                        </div>
                        {!isDone && (
                          <>
                            <p className="text-xs text-gray-400 mt-2 leading-relaxed">{session.description}</p>
                            {session.notes && <p className="text-xs text-gray-400 mt-1 italic">{session.notes}</p>}
                            <button
                              onClick={() => onLogSession({
                                sessionType: session.type === 'rest' ? 'recovery' : session.type,
                                title: session.title,
                                duration: session.duration,
                              })}
                              className={`mt-3 text-xs font-semibold bg-black/30 hover:bg-black/50 px-3 py-1.5 rounded-lg transition-all border ${
                                isOffSeason
                                  ? 'text-teal-400 border-teal-700/50'
                                  : 'text-brand-400 border-brand-700/50'
                              }`}
                            >
                              + Log this session
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* Week at a Glance */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Week at a Glance</p>
        <div className="card">
          <div className="space-y-2">
            {[...week.days].sort((a, b) => {
              const order = [1, 2, 3, 4, 5, 6, 0];
              return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
            }).map(day => {
              const daySessions = day.isRestDay ? [] : day.sessions;
              const doneCount = daySessions.filter((_, si) =>
                completedSessions[`${activeCamp.id}-${selectedWeek}-${day.dayOfWeek}-${si}`]
              ).length;

              return (
                <div
                  key={day.dayOfWeek}
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setSelectedDay(day.dayOfWeek)}
                >
                  <span className={`text-xs w-8 font-medium ${day.dayOfWeek === todayDayOfWeek && selectedWeek === currentWeekNum ? 'text-brand-400' : 'text-gray-400'}`}>
                    {DAY_LABELS[day.dayOfWeek]}
                  </span>
                  {day.isRestDay ? (
                    <span className="text-xs text-gray-450 italic">Rest Day</span>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap flex-1">
                      {day.sessions.map((s, i) => {
                        const config = SESSION_CONFIG[s.type];
                        const done = !!completedSessions[`${activeCamp.id}-${selectedWeek}-${day.dayOfWeek}-${i}`];
                        return (
                          <span key={i} className={`badge text-xs border ${done ? 'bg-green-900/30 border-green-900/30 text-green-600 line-through' : config.color}`}>
                            {s.duration}m
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {daySessions.length > 0 && (
                    <span className={`text-xs font-medium flex-shrink-0 ${doneCount === daySessions.length ? 'text-green-400' : 'text-gray-450'}`}>
                      {doneCount}/{daySessions.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
