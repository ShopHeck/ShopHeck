import { Activity, Brain, Bluetooth, ChevronRight, Clock, Dumbbell, Droplets, Flame, Target, UtensilsCrossed, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPro } from '../utils/subscription';
import { getCurrentWeekNumber, getCurrentOffSeasonCycle } from '../utils/campGenerator';
import { format, parseISO } from 'date-fns';
import type { LogPrefill } from '../App';
import ProgressWidget from './gamification/ProgressWidget';

const GOAL_LABELS: Record<string, string> = {
  'base-building': 'Base Building',
  'strength': 'Build Strength',
  'maintain': 'Maintain & Sharpen',
  'recovery': 'Active Recovery',
};

const PHASE_COLORS: Record<string, string> = {
  Foundation:        'bg-indigo-900/40 text-indigo-400 border-indigo-800',
  Development:       'bg-teal-900/40 text-teal-400 border-teal-800',
  Performance:       'bg-purple-900/40 text-purple-400 border-purple-800',
  'Active Recovery': 'bg-green-900/40 text-green-400 border-green-800',
};

const SESSION_TYPE_COLORS: Record<string, string> = {
  conditioning: 'bg-orange-500',
  skill:        'bg-blue-500',
  sparring:     'bg-red-500',
  strength:     'bg-yellow-500',
  recovery:     'bg-green-500',
  rest:         'bg-gray-600',
};

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
}

export default function OffSeasonDashboard({ onNavigate }: Props) {
  const { state } = useApp();
  const { activeCamp, trainingSchedule, workoutLogs, weightEntries, completedSessions, currentUser, gamification } = state;

  if (!activeCamp) return null;

  const currentWeekNum = getCurrentWeekNumber(activeCamp);
  const cycle = getCurrentOffSeasonCycle(activeCamp);
  const currentWeek = trainingSchedule[currentWeekNum - 1];
  const goalLabel = GOAL_LABELS[activeCamp.offSeasonGoal ?? 'maintain'] ?? 'Off Season';
  const pro = isPro(state.subscription);
  // Same chip as the fight-camp dashboard: a gated tile announces its tier
  // instead of ambushing the tap with a paywall.
  const proChip = (
    <span className="ml-auto flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-brand-900/50 border border-brand-800/60 text-brand-400">
      PRO
    </span>
  );

  // Week stats
  const weekLogs = workoutLogs.filter(l => l.campId === activeCamp.id && l.weekNumber === currentWeekNum);
  const weekMinutes = weekLogs.reduce((sum, l) => sum + l.duration, 0);
  const weekAvgRpe = weekLogs.length > 0
    ? Math.round(weekLogs.reduce((sum, l) => sum + l.rpe, 0) / weekLogs.length * 10) / 10
    : null;
  const weekPlanned = currentWeek?.days.reduce((sum, d) => sum + (!d.isRestDay ? d.sessions.filter(s => s.type !== 'rest').length : 0), 0) ?? 0;
  const weekDone = Object.keys(completedSessions).filter(
    k => k.startsWith(`${activeCamp.id}-${currentWeekNum}-`) && completedSessions[k]
  ).length;

  // Training variety (current week logs by type)
  const typeCounts = weekLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.sessionType] = (acc[l.sessionType] ?? 0) + 1;
    return acc;
  }, {});
  const totalTyped = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  // Today's schedule
  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const todaySessions = currentWeek?.days.find(d => d.dayOfWeek === todayDayOfWeek);

  // Streak — central source of truth via gamification slice
  const streak = gamification?.streak ?? { current: 0, best: 0, atRisk: false, expired: false };

  // Weight
  const latestWeight = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  const currentW = latestWeight ? latestWeight.weight : activeCamp.currentWeight;
  const targetW = activeCamp.targetWeight;
  const weightDiff = parseFloat((currentW - targetW).toFixed(1));

  // Recent logs
  const recentLogs = workoutLogs.filter(l => l.campId === activeCamp.id).slice(0, 3);

  return (
    <div className="space-y-4 pb-4">
      {/* Off Season Header Card */}
      <div className="mx-4 mt-4 relative overflow-hidden bg-gradient-to-br from-teal-900/50 to-dark-700 rounded-2xl border border-teal-800/50 p-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-600/10 rounded-full -translate-y-8 translate-x-8" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest">Off Season</p>
              <h2 className="text-2xl font-black text-white mt-1">{goalLabel}</h2>
              <p className="text-gray-400 text-sm mt-1">{currentUser?.sport} · {currentUser?.weightClass}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-white">W{currentWeekNum}</div>
              <div className="text-xs text-gray-500">of {activeCamp.campWeeks}</div>
              <div className="text-xs text-teal-400 mt-1">Cycle {cycle}</div>
            </div>
          </div>
          {/* Phase badge + progress */}
          <div className="mt-4 flex items-center gap-3">
            {currentWeek?.phase && (
              <span className={`badge border text-xs ${PHASE_COLORS[currentWeek.phase] ?? 'bg-dark-600 text-gray-400 border-dark-400'}`}>
                {currentWeek.phase}
              </span>
            )}
            <div className="flex-1 h-1.5 bg-teal-900/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, Math.round((currentWeekNum / activeCamp.campWeeks) * 100))}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {Math.round((currentWeekNum / activeCamp.campWeeks) * 100)}%
            </span>
          </div>
        </div>
      </div>

      <ProgressWidget onOpenProgress={() => onNavigate('achievements')} />

      {/* Streak Card */}
      <div className="mx-4">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <Flame size={22} className="text-orange-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Training Streak</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-black text-white">{streak.current}</span>
              <span className="text-sm text-gray-400">day{streak.current !== 1 ? 's' : ''} in a row</span>
            </div>
          </div>
          {streak.best > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-600">Best</p>
              <p className="text-lg font-black text-teal-400">{streak.best}</p>
            </div>
          )}
        </div>
      </div>

      {/* This Week Summary */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">This Week</p>
          <span className="text-xs text-gray-600">Week {currentWeekNum}</span>
        </div>
        <div className="card">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg font-black text-white">
                {weekDone}<span className="text-gray-600 font-medium text-sm">/{weekPlanned}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">sessions</div>
            </div>
            <div>
              <div className="text-lg font-black text-white">{weekMinutes || '—'}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">minutes</div>
            </div>
            <div>
              <div className="text-lg font-black text-white">{weekAvgRpe ?? '—'}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">avg RPE</div>
            </div>
          </div>
          {weekPlanned > 0 && (
            <div className="mt-3">
              <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    weekDone >= weekPlanned ? 'bg-teal-500' :
                    weekDone / weekPlanned >= 0.7 ? 'bg-teal-600' : 'bg-dark-300'
                  }`}
                  style={{ width: `${Math.min(100, Math.round((weekDone / weekPlanned) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Training Variety */}
      {totalTyped > 0 && (
        <div className="mx-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">This Week's Sessions</p>
          <div className="card">
            {/* Stacked bar */}
            <div className="h-2 rounded-full overflow-hidden flex gap-px mb-3">
              {(Object.entries(typeCounts) as [string, number][]).map(([type, count]) => (
                <div
                  key={type}
                  className={`h-full ${SESSION_TYPE_COLORS[type] ?? 'bg-gray-500'} transition-all`}
                  style={{ width: `${Math.round((count / totalTyped) * 100)}%` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(Object.entries(typeCounts) as [string, number][]).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${SESSION_TYPE_COLORS[type] ?? 'bg-gray-500'}`} />
                  <span className="text-xs text-gray-400 capitalize">{type} <span className="text-gray-600">×{count}</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Week Goals */}
      {currentWeek?.weeklyGoals && currentWeek.weeklyGoals.length > 0 && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Week Goals</p>
            <button onClick={() => onNavigate('planner')} className="text-teal-500 hover:text-teal-400 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="card space-y-1.5">
            {currentWeek.weeklyGoals.slice(0, 3).map((goal, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-600 flex-shrink-0" />
                <span className="text-xs text-gray-300">{goal}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Training */}
      {todaySessions && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Today's Training</p>
            <span className="text-xs text-gray-500">{format(today, 'EEEE, MMM d')}</span>
          </div>

          {todaySessions.isRestDay ? (
            <div className="card text-center py-6">
              <div className="text-3xl mb-2">🧘</div>
              <p className="text-white font-semibold">Rest Day</p>
              <p className="text-sm text-gray-500 mt-1">Recovery is training too. Sleep well, eat well.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todaySessions.sessions.map((session, i) => (
                <div key={i} className="card flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    session.type === 'conditioning' ? 'bg-orange-900/40' :
                    session.type === 'sparring' ? 'bg-red-900/40' :
                    session.type === 'skill' ? 'bg-blue-900/40' :
                    session.type === 'strength' ? 'bg-yellow-900/40' :
                    'bg-green-900/40'
                  }`}>
                    {session.type === 'conditioning' ? <Flame size={18} className="text-orange-400" /> :
                     session.type === 'sparring' ? <Zap size={18} className="text-red-400" /> :
                     session.type === 'skill' ? <Target size={18} className="text-blue-400" /> :
                     session.type === 'strength' ? <Activity size={18} className="text-yellow-400" /> :
                     <Clock size={18} className="text-green-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{session.title}</p>
                    <p className="text-xs text-gray-500">{session.duration} min</p>
                  </div>
                  {session.type !== 'rest' && session.duration > 0 && (
                    <button
                      onClick={() => onNavigate('log', {
                        sessionType: session.type === 'rest' ? 'recovery' : session.type,
                        title: session.title,
                        duration: session.duration,
                      })}
                      className="text-xs text-teal-500 font-semibold hover:text-teal-400 transition-colors flex-shrink-0"
                    >
                      Log
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      {recentLogs.length > 0 && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Activity</p>
            <button onClick={() => onNavigate('log')} className="text-xs text-teal-500 font-semibold">See all</button>
          </div>
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div key={log.id} className="card flex items-center gap-3">
                <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Activity size={14} className="text-teal-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{log.title}</p>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(log.date), 'MMM d')} · {log.duration}min · RPE {log.rpe}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight Status */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Weight Status</p>
          <button onClick={() => onNavigate('weight')} className="text-xs text-teal-500 font-semibold">Track</button>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-2xl font-black text-white">{currentW}</div>
              <div className="text-xs text-gray-500">current</div>
            </div>
            <div className="flex-1 px-4">
              {currentW !== targetW ? (
                <>
                  <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-700 to-teal-500 rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100,
                          activeCamp.currentWeight !== targetW
                            ? ((activeCamp.currentWeight - currentW) / (activeCamp.currentWeight - targetW)) * 100
                            : 0
                        ))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>{activeCamp.currentWeight} lbs</span>
                    <span>{targetW} lbs</span>
                  </div>
                </>
              ) : (
                <p className="text-center text-xs text-teal-400 font-semibold">At goal weight</p>
              )}
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-teal-400">{targetW}</div>
              <div className="text-xs text-gray-500">goal</div>
            </div>
          </div>
          {currentW !== targetW && (
            <p className="text-center text-xs text-gray-500 mt-2">
              {Math.abs(weightDiff)} lbs {weightDiff > 0 ? 'to lose' : 'to gain'} to reach goal
            </p>
          )}
        </div>
      </div>

      {/* Quick Tools */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tools</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('aiinsights')}
            className="card flex items-center gap-3 hover:border-purple-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-900/30 flex items-center justify-center flex-shrink-0">
              <Brain size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AI Insights</p>
              <p className="text-xs text-gray-500">Coach analysis</p>
            </div>
            {!pro && proChip}
          </button>
          <button
            onClick={() => onNavigate('log')}
            className="card flex items-center gap-3 hover:border-teal-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-900/30 flex items-center justify-center flex-shrink-0">
              <Activity size={18} className="text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Log Session</p>
              <p className="text-xs text-gray-500">Record your work</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('nutrition')}
            className="card flex items-center gap-3 hover:border-blue-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Droplets size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Nutrition</p>
              <p className="text-xs text-gray-500">Water & meals</p>
            </div>
            {!pro && proChip}
          </button>
          <button
            onClick={() => onNavigate('trackers')}
            className="card flex items-center gap-3 hover:border-teal-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-900/30 flex items-center justify-center flex-shrink-0">
              <Bluetooth size={18} className="text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Trackers</p>
              <p className="text-xs text-gray-500">HR · HRV · Recovery</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('workout-library')}
            className="card flex items-center gap-3 hover:border-yellow-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
              <Dumbbell size={18} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Exercise Library</p>
              <p className="text-xs text-gray-500">Drills & workouts</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('meal-library')}
            className="card flex items-center gap-3 hover:border-green-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <UtensilsCrossed size={18} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Meal Library</p>
              <p className="text-xs text-gray-500">Plans & generator</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
