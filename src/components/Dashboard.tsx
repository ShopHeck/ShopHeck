import { Flame, Target, TrendingDown, Activity, Clock, ChevronRight, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { format, parseISO } from 'date-fns';

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

import type { LogPrefill } from '../App';

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const { state } = useApp();
  const { activeCamp, trainingSchedule, workoutLogs, weightEntries, sparringLogs } = state;

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

  const weightToGo = latestWeight
    ? (latestWeight.weight - activeCamp.targetWeight).toFixed(1)
    : (activeCamp.currentWeight - activeCamp.targetWeight).toFixed(1);

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const todaySessions = currentWeek?.days.find(d => d.dayOfWeek === todayDayOfWeek);
  const recentLogs = workoutLogs.filter(l => l.campId === activeCamp.id).slice(0, 3);

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
                {format(parseISO(activeCamp.fightDate), 'MMMM d, yyyy')}
                {activeCamp.opponent && <span className="text-gray-500"> · vs {activeCamp.opponent}</span>}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-white">{activeCamp.rounds}R</div>
              <div className="text-xs text-gray-500">{activeCamp.roundDuration}min rounds</div>
              <div className="text-xs text-brand-400 mt-1">{activeCamp.weightClass}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
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

      {/* Current Phase */}
      {currentWeek && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Current Phase</p>
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
                    <span className="text-xs text-gray-500 ml-1">{currentWeek.intensity}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => onNavigate('planner')} className="text-brand-500 hover:text-brand-400 transition-colors">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-dark-500">
              <p className="text-xs text-gray-500 mb-2">This week's goals</p>
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
          <div className="text-xs text-gray-500">lbs to cut</div>
        </button>
        <button onClick={() => onNavigate('log')} className="stat-card hover:border-brand-700 transition-colors text-left">
          <Activity size={16} className="text-green-500" />
          <div className="text-xl font-black text-white">{totalWorkouts}</div>
          <div className="text-xs text-gray-500">sessions logged</div>
        </button>
        <button onClick={() => onNavigate('progress')} className="stat-card hover:border-brand-700 transition-colors text-left">
          <Zap size={16} className="text-yellow-500" />
          <div className="text-xl font-black text-white">{totalSparingRounds}</div>
          <div className="text-xs text-gray-500">sparring rounds</div>
        </button>
      </div>

      {/* Today's Schedule */}
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
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Activity</p>
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
                  <p className="text-xs text-gray-500">{format(parseISO(log.date), 'MMM d')} · {log.duration}min · RPE {log.rpe}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weight Summary */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Weight Status</p>
          <button onClick={() => onNavigate('weight')} className="text-xs text-brand-500 font-semibold">Track</button>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="text-2xl font-black text-white">
                {latestWeight ? latestWeight.weight : activeCamp.currentWeight}
              </div>
              <div className="text-xs text-gray-500">current</div>
            </div>
            <div className="flex-1 px-4">
              <div className="h-2 bg-dark-500 rounded-full overflow-hidden">
                {(() => {
                  const current = latestWeight ? latestWeight.weight : activeCamp.currentWeight;
                  const pct = Math.max(0, Math.min(100, ((activeCamp.currentWeight - current) / (activeCamp.currentWeight - activeCamp.targetWeight)) * 100));
                  return (
                    <div className="h-full bg-gradient-to-r from-blue-700 to-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                  );
                })()}
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>{activeCamp.currentWeight} lbs</span>
                <span>{activeCamp.targetWeight} lbs</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-black text-brand-400">{activeCamp.targetWeight}</div>
              <div className="text-xs text-gray-500">target</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
