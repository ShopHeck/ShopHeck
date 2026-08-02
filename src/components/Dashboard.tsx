import { Flame, Target, TrendingDown, Activity, Clock, ChevronRight, Zap, Shield, Droplets, Brain, Bluetooth, MessageSquare, Dumbbell, UtensilsCrossed, Trophy, History } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPro } from '../utils/subscription';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { computeReadiness } from '../utils/readiness';
import { toDisplayWeight, formatWeight } from '../utils/units';
import { format, parseISO } from 'date-fns';
import ProgressWidget from './gamification/ProgressWidget';

const PHASE_COLORS: Record<string, string> = {
  'Base Building': 'bg-blue-900/40 text-blue-400 border-blue-800',
  'Strength & Conditioning': 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  'Fight Specific': 'bg-orange-900/40 text-orange-400 border-orange-800',
  'Peak': 'bg-red-900/40 text-red-400 border-red-800',
  'Taper': 'bg-green-900/40 text-green-400 border-green-800',
};

const INTENSITY_DOTS: Record<string, number> = {
  Low: 1, Medium: 2, High: 3, 'Very High': 4,
};

/** Small tier chip on gated tool tiles, so a paywall is never a surprise tap. */
function ProChip() {
  return (
    <span className="ml-auto flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-brand-900/50 border border-brand-800/60 text-brand-400">
      PRO
    </span>
  );
}

import type { LogPrefill } from '../App';

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
  onShowFightBreakdown: (fightId: string) => void;
}

export default function Dashboard({ onNavigate, onShowFightBreakdown }: Props) {
  const { state } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const { activeCamp, trainingSchedule, workoutLogs, weightEntries, sparringLogs, coachNotes, currentUser, completedSessions, fightResults } = state;

  if (!activeCamp) return null;

  const daysUntil = getDaysUntilFight(activeCamp.fightDate);
  const currentWeekNum = getCurrentWeekNumber(activeCamp);
  const progress = getCampProgress(activeCamp);
  const currentWeek = trainingSchedule[currentWeekNum - 1];

  const totalWorkouts = workoutLogs.filter(l => l.campId === activeCamp.id).length;
  const totalSparingRounds = sparringLogs
    .filter(l => l.campId === activeCamp.id)
    .reduce((sum, l) => sum + l.rounds, 0);

  const latestWeight = weightEntries
    .filter(e => e.campId === activeCamp.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const weightToGo = toDisplayWeight(
    (latestWeight ? latestWeight.weight : activeCamp.currentWeight) - activeCamp.targetWeight,
    unit,
  ).toFixed(1);

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const todaySessions = currentWeek?.days.find(d => d.dayOfWeek === todayDayOfWeek);
  const recentLogs = workoutLogs.filter(l => l.campId === activeCamp.id).slice(0, 3);

  // Weekly summary stats
  const weekLogs = workoutLogs.filter(l => l.campId === activeCamp.id && l.weekNumber === currentWeekNum);
  const weekMinutes = weekLogs.reduce((sum, l) => sum + l.duration, 0);
  const weekAvgRpe = weekLogs.length > 0
    ? Math.round(weekLogs.reduce((sum, l) => sum + l.rpe, 0) / weekLogs.length * 10) / 10
    : null;
  const weekPlanned = currentWeek?.days.reduce((sum, d) => sum + (!d.isRestDay ? d.sessions.length : 0), 0) ?? 0;
  const weekDone = Object.keys(completedSessions).filter(
    k => k.startsWith(`${activeCamp.id}-${currentWeekNum}-`) && completedSessions[k]
  ).length;

  const readiness = computeReadiness(state);
  const pro = isPro(state.subscription);

  // Post-fight CTA: fight date has passed and no FightResult exists for this camp.
  const campFightResult = fightResults.find(r => r.campId === activeCamp.id);
  const showPostFightCta = !!activeCamp.fightDate
    && parseISO(activeCamp.fightDate) < new Date()
    && !campFightResult;
  const hasLoggedFight = !!campFightResult;

  const latestCoachNote = coachNotes
    .filter(n => n.fighterId === currentUser?.id && n.campId === activeCamp.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  return (
    <div className="space-y-4 pb-4">
      {/* Fight Countdown Card */}
      <div className="mx-4 mt-4 relative overflow-hidden bg-gradient-to-br from-brand-900/60 to-dark-700 rounded-2xl border border-brand-800/50 p-5">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-600/10 rounded-full -translate-y-8 translate-x-8" />
        <div className="relative">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-brand-400 text-xs font-semibold uppercase tracking-widest">Fight Night</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-5xl font-black text-white">{daysUntil}</span>
                <span className="text-gray-400 font-medium">days out</span>
              </div>
              <p className="text-gray-400 text-sm mt-1">
                {activeCamp.fightDate ? format(parseISO(activeCamp.fightDate), 'MMMM d, yyyy') : 'Fight date TBD'}
                {activeCamp.opponent && <span className="text-gray-400"> · vs {activeCamp.opponent}</span>}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-white">{activeCamp.rounds}R</div>
              <div className="text-xs text-gray-400">{activeCamp.roundDuration}min rounds</div>
              <div className="text-xs text-brand-400 mt-1">{activeCamp.weightClass}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Week {currentWeekNum} of {activeCamp.campWeeks}</span>
              <span>{progress}% complete</span>
            </div>
            <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-700 to-brand-500 rounded-full transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <ProgressWidget onOpenProgress={() => onNavigate('achievements')} />

      {/* Post-fight CTA — shows after fight date until a result is logged. */}
      {showPostFightCta && (
        <div className="mx-4">
          <button
            onClick={() => onNavigate('fight-log')}
            className="w-full flex items-center gap-3 bg-gradient-to-br from-purple-900/40 to-dark-700 border border-purple-800 rounded-2xl p-4 text-left hover:border-purple-600 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-900/50 flex items-center justify-center flex-shrink-0">
              <Trophy size={22} className="text-purple-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">Log your fight result</p>
              <p className="text-xs text-gray-400 mt-0.5">Round-by-round breakdown · tunes your next camp</p>
            </div>
            <ChevronRight size={18} className="text-purple-300 flex-shrink-0" />
          </button>
        </div>
      )}

      {/* View-breakdown shortcut once a result has been logged. */}
      {hasLoggedFight && campFightResult && (
        <div className="mx-4">
          <button
            onClick={() => onShowFightBreakdown(campFightResult.id)}
            className="w-full flex items-center gap-3 bg-dark-700 border border-dark-500 rounded-2xl p-4 text-left hover:border-brand-700 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-900/40 flex items-center justify-center flex-shrink-0">
              <History size={20} className="text-brand-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">View Fight Breakdown</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {campFightResult.outcome.toUpperCase()} · {campFightResult.method}
              </p>
            </div>
            <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
          </button>
        </div>
      )}

      {/* Readiness Card */}
      {readiness && (
        <div className="mx-4">
          <button
            onClick={() => onNavigate('readiness')}
            className="card w-full text-left hover:border-dark-300 transition-colors group"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fight Readiness</p>
              <ChevronRight size={15} className="text-gray-500 group-hover:text-gray-400 transition-colors" />
            </div>
            <div className="flex items-center gap-4">
              {/* Score ring */}
              <div className="relative flex-shrink-0 w-16 h-16">
                <svg viewBox="0 0 40 40" className="w-full h-full -rotate-[126deg]">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#1e293b" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 16 * 0.75} ${2 * Math.PI * 16}`} />
                  <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" strokeLinecap="round"
                    stroke={readiness.statusColor}
                    strokeDasharray={`${2 * Math.PI * 16 * 0.75 * (readiness.overall / 100)} ${2 * Math.PI * 16}`} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-black text-white">{readiness.overall}</span>
                </div>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-base font-black text-white leading-tight" style={{ color: readiness.statusColor }}>
                  {readiness.status}
                </p>
                <div className="mt-1.5 h-1.5 bg-dark-500 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${readiness.overall}%`, backgroundColor: readiness.statusColor }}
                  />
                </div>
                {readiness.insights[0] && (
                  <p className="text-xs text-gray-400 mt-1.5 leading-snug line-clamp-2">
                    {readiness.insights[0]}
                  </p>
                )}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Coach Note Banner */}
      {latestCoachNote && (
        <div className="mx-4">
          <div className="bg-gradient-to-r from-purple-900/40 to-dark-700 border border-purple-800/50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-900/60 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageSquare size={15} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-purple-400">{latestCoachNote.coachName}</span>
                <span className="text-xs text-gray-500">·</span>
                <span className="text-xs text-gray-500">{format(parseISO(latestCoachNote.createdAt), 'MMM d')}</span>
                <span className="badge text-xs bg-dark-600 text-gray-400 ml-auto capitalize">{latestCoachNote.category}</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{latestCoachNote.content}</p>
            </div>
          </div>
        </div>
      )}

      {/* Current Phase */}
      {currentWeek && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Current Phase</p>
            {currentWeek.phase && (
              <span className={`badge border ${PHASE_COLORS[currentWeek.phase] || 'bg-dark-600 text-gray-400 border-dark-400'}`}>
                {currentWeek.phase}
              </span>
            )}
          </div>
          <div className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-sm text-white font-medium">{currentWeek.focus}</p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full ${i < (INTENSITY_DOTS[currentWeek.intensity] || 0) ? 'bg-brand-500' : 'bg-dark-400'}`}
                      />
                    ))}
                    <span className="text-xs text-gray-400 ml-1">{currentWeek.intensity}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => onNavigate('planner')}
                aria-label="Open the weekly planner"
                className="text-brand-500 hover:text-brand-400 transition-colors -m-2 p-2"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-dark-500">
              <p className="text-xs text-gray-400 mb-2">This week's goals</p>
              <div className="space-y-1">
                {currentWeek.weeklyGoals.slice(0, 3).map((goal, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-600 flex-shrink-0" />
                    <span className="text-xs text-gray-300">{goal}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="mx-4 grid grid-cols-3 gap-3">
        <button onClick={() => onNavigate('weight')} className="stat-card hover:border-brand-700 transition-colors text-left">
          <TrendingDown size={16} className="text-brand-500" />
          <div className="text-xl font-black text-white">{weightToGo}</div>
          <div className="text-xs text-gray-400">{unit} to cut</div>
        </button>
        <button onClick={() => onNavigate('log')} className="stat-card hover:border-brand-700 transition-colors text-left">
          <Activity size={16} className="text-green-500" />
          <div className="text-xl font-black text-white">{totalWorkouts}</div>
          <div className="text-xs text-gray-400">sessions logged</div>
        </button>
        <button onClick={() => onNavigate('progress')} className="stat-card hover:border-brand-700 transition-colors text-left">
          <Zap size={16} className="text-yellow-500" />
          <div className="text-xl font-black text-white">{totalSparingRounds}</div>
          <div className="text-xs text-gray-400">sparring rounds</div>
        </button>
      </div>

      {/* This Week Summary */}
      {(weekPlanned > 0 || weekLogs.length > 0) && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Week</p>
            <span className="text-xs text-gray-500">Week {currentWeekNum}</span>
          </div>
          <div className="card">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-black text-white">
                  {weekDone}<span className="text-gray-500 font-medium text-sm">/{weekPlanned}</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">sessions</div>
              </div>
              <div>
                <div className="text-lg font-black text-white">{weekMinutes || '—'}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">minutes</div>
              </div>
              <div>
                <div className="text-lg font-black text-white">{weekAvgRpe ?? '—'}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">avg RPE</div>
              </div>
            </div>
            {weekPlanned > 0 && (
              <div className="mt-3">
                <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      weekDone >= weekPlanned ? 'bg-green-500' :
                      weekDone / weekPlanned >= 0.7 ? 'bg-brand-500' : 'bg-dark-300'
                    }`}
                    style={{ width: `${Math.min(100, Math.round((weekDone / weekPlanned) * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Today's Schedule */}
      {todaySessions && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Training</p>
            <span className="text-xs text-gray-400">{format(today, 'EEEE, MMM d')}</span>
          </div>

          {todaySessions.isRestDay ? (
            <div className="card text-center py-6">
              <div className="text-3xl mb-2">🧘</div>
              <p className="text-white font-semibold">Rest Day</p>
              <p className="text-sm text-gray-400 mt-1">Recovery is training too. Sleep well, eat well.</p>
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
                    <p className="text-xs text-gray-400">{session.duration} min</p>
                  </div>
                  <button
                    onClick={() => onNavigate('log', {
                      sessionType: session.type === 'rest' ? 'recovery' : session.type,
                      title: session.title,
                      duration: session.duration,
                    })}
                    className="text-xs text-brand-500 font-semibold hover:text-brand-400 transition-colors flex-shrink-0"
                  >
                    Log
                  </button>
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Activity</p>
            <button onClick={() => onNavigate('log')} className="text-xs text-brand-500 font-semibold">See all</button>
          </div>
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div key={log.id} className="card flex items-center gap-3">
                <div className="w-8 h-8 bg-dark-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Activity size={14} className="text-brand-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{log.title}</p>
                  <p className="text-xs text-gray-400">{format(parseISO(log.date), 'MMM d')} · {log.duration}min · RPE {log.rpe}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight Summary */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weight Status</p>
          <button onClick={() => onNavigate('weight')} className="text-xs text-brand-500 font-semibold">Track</button>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-2xl font-black text-white">
                {toDisplayWeight(latestWeight ? latestWeight.weight : activeCamp.currentWeight, unit)}
              </div>
              <div className="text-xs text-gray-400">current</div>
            </div>
            <div className="flex-1 px-4">
              <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                {(() => {
                  const current = latestWeight ? latestWeight.weight : activeCamp.currentWeight;
                  const totalCut = activeCamp.currentWeight - activeCamp.targetWeight;
                  // No cut configured (start == target) → the bar is trivially full,
                  // not NaN% wide from a 0/0 division.
                  const pct = totalCut > 0
                    ? Math.max(0, Math.min(100, ((activeCamp.currentWeight - current) / totalCut) * 100))
                    : 100;
                  return (
                    <div className="h-full bg-gradient-to-r from-blue-700 to-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  );
                })()}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{formatWeight(activeCamp.currentWeight, unit)}</span>
                <span>{formatWeight(activeCamp.targetWeight, unit)}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-brand-400">{toDisplayWeight(activeCamp.targetWeight, unit)}</div>
              <div className="text-xs text-gray-400">target</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Tools */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tools</p>
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
              <p className="text-xs text-gray-400">Coach analysis</p>
            </div>
            {!pro && <ProChip />}
          </button>
          <button
            onClick={() => onNavigate('gameplan')}
            className="card flex items-center gap-3 hover:border-red-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <Shield size={18} className="text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Game Plan</p>
              <p className="text-xs text-gray-400">Fight strategy</p>
            </div>
            {!pro && <ProChip />}
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
              <p className="text-xs text-gray-400">Water & meals</p>
            </div>
            {!pro && <ProChip />}
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
              <p className="text-xs text-gray-400">HR · HRV · Recovery</p>
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
              <p className="text-xs text-gray-400">Drills & workouts</p>
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
              <p className="text-xs text-gray-400">Plans & generator</p>
            </div>
          </button>
          <button
            onClick={() => onNavigate('camp-history')}
            className="card flex items-center gap-3 hover:border-brand-800 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <History size={18} className="text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Camp History</p>
              <p className="text-xs text-gray-400">Past camps & fights</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
