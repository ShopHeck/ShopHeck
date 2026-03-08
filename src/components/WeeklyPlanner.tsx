import { useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Target, Zap, Activity, Clock, Star } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getCurrentWeekNumber } from '../utils/campGenerator';
import { format, parseISO } from 'date-fns';
import type { SessionType } from '../types';

const SESSION_CONFIG: Record<SessionType, { color: string; icon: React.FC<{ size: number; className?: string }>; label: string }> = {
  conditioning: { color: 'bg-orange-900/50 border-orange-800/50 text-orange-400', icon: ({ size, className }) => <Flame size={size} className={className} />, label: 'Conditioning' },
  skill: { color: 'bg-blue-900/50 border-blue-800/50 text-blue-400', icon: ({ size, className }) => <Target size={size} className={className} />, label: 'Skill' },
  sparring: { color: 'bg-red-900/50 border-red-800/50 text-red-400', icon: ({ size, className }) => <Zap size={size} className={className} />, label: 'Sparring' },
  strength: { color: 'bg-yellow-900/50 border-yellow-800/50 text-yellow-400', icon: ({ size, className }) => <Activity size={size} className={className} />, label: 'Strength' },
  recovery: { color: 'bg-green-900/50 border-green-800/50 text-green-400', icon: ({ size, className }) => <Clock size={size} className={className} />, label: 'Recovery' },
  rest: { color: 'bg-gray-900/50 border-gray-700/50 text-gray-500', icon: ({ size, className }) => <Star size={size} className={className} />, label: 'Rest' },
};

const PHASE_COLORS: Record<string, string> = {
  'Base Building': 'text-blue-400',
  'Strength & Conditioning': 'text-yellow-400',
  'Fight Specific': 'text-orange-400',
  'Peak': 'text-red-400',
  'Taper': 'text-green-400',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

import type { LogPrefill } from '../App';

interface Props {
  onLogSession: (prefill: LogPrefill) => void;
}

export default function WeeklyPlanner({ onLogSession }: Props) {
  const { state } = useApp();
  const { activeCamp, trainingSchedule, workoutLogs } = state;

  const currentWeekNum = activeCamp ? getCurrentWeekNumber(activeCamp) : 1;
  const [selectedWeek, setSelectedWeek] = useState(currentWeekNum);
  const [selectedDay, setSelectedDay] = useState<number | null>(new Date().getDay());

  const week = trainingSchedule[selectedWeek - 1];
  if (!week || !activeCamp) return null;

  const today = new Date();
  const todayDayOfWeek = today.getDay();

  const selectedDayData = selectedDay !== null
    ? week.days.find(d => d.dayOfWeek === selectedDay)
    : null;

  const loggedSessionIds = new Set(
    workoutLogs
      .filter(l => l.campId === activeCamp.id && l.weekNumber === selectedWeek)
      .map(l => l.title)
  );

  return (
    <div className="space-y-4 pb-4">
      {/* Week Navigator */}
      <div className="mx-4 mt-4">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => setSelectedWeek(w => Math.max(1, w - 1))}
            disabled={selectedWeek <= 1}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="text-white font-bold">Week {selectedWeek}</p>
            <p className="text-xs text-gray-500">
              {format(parseISO(week.startDate), 'MMM d')} – {format(parseISO(week.endDate), 'MMM d')}
              {selectedWeek === currentWeekNum && <span className="text-brand-400 ml-1">(This Week)</span>}
            </p>
          </div>
          <button
            onClick={() => setSelectedWeek(w => Math.min(activeCamp.campWeeks, w + 1))}
            disabled={selectedWeek >= activeCamp.campWeeks}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Phase badge */}
        <div className="bg-dark-700 border border-dark-500 rounded-xl p-3 mt-2">
          <div className="flex items-center justify-between">
            <div>
              <span className={`text-sm font-bold ${PHASE_COLORS[week.phase] || 'text-white'}`}>{week.phase}</span>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{week.focus}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`badge text-xs ${
                week.intensity === 'Very High' ? 'bg-red-900/50 text-red-400' :
                week.intensity === 'High' ? 'bg-orange-900/50 text-orange-400' :
                week.intensity === 'Medium' ? 'bg-yellow-900/50 text-yellow-400' :
                'bg-green-900/50 text-green-400'
              }`}>
                {week.intensity}
              </span>
            </div>
          </div>
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
            const dayData = week.days.find(d => d.dayOfWeek === idx);
            const isToday = idx === todayDayOfWeek && selectedWeek === currentWeekNum;
            const isSelected = selectedDay === idx;
            const hasContent = dayData && !dayData.isRestDay && dayData.sessions.length > 0;

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(isSelected ? null : idx)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-900/30'
                    : isToday
                    ? 'border-brand-700/50 bg-dark-600'
                    : 'border-dark-500 bg-dark-700 hover:border-dark-400'
                }`}
              >
                <span className={`text-xs font-medium ${isSelected ? 'text-brand-400' : isToday ? 'text-brand-300' : 'text-gray-500'}`}>
                  {label}
                </span>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  hasContent ? (isSelected ? 'bg-brand-400' : 'bg-brand-700') : 'bg-dark-500'
                }`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Detail */}
      {selectedDay !== null && selectedDayData && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-white">{FULL_DAY_LABELS[selectedDay]}</h3>
            {selectedDayData.isRestDay && <span className="badge bg-green-900/40 text-green-400">Rest Day</span>}
          </div>

          {selectedDayData.isRestDay ? (
            <div className="card text-center py-8">
              <div className="text-4xl mb-3">🛌</div>
              <p className="font-semibold text-white">Full Rest Day</p>
              <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
                Recovery is part of training. Sleep 8+ hours, hydrate, and eat well.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDayData.sessions.map((session, i) => {
                const config = SESSION_CONFIG[session.type];
                const isLogged = loggedSessionIds.has(session.title);

                return (
                  <div key={i} className={`rounded-xl border p-4 ${config.color}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                        <config.icon size={18} className={config.color.split(' ').find(c => c.startsWith('text-')) || ''} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white">{session.title}</span>
                          <span className="badge bg-black/20 text-xs">{config.label}</span>
                          {isLogged && <span className="badge bg-green-900/50 text-green-400 text-xs">Logged ✓</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-400">{session.duration} min</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 leading-relaxed">{session.description}</p>
                        {session.notes && <p className="text-xs text-gray-500 mt-1 italic">{session.notes}</p>}
                        {!isLogged && (
                          <button
                            onClick={() => onLogSession({
                              sessionType: session.type === 'rest' ? 'recovery' : session.type,
                              title: session.title,
                              duration: session.duration,
                            })}
                            className="mt-3 text-xs font-semibold text-brand-400 bg-black/30 hover:bg-black/50 border border-brand-700/50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            + Log this session
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Week Overview */}
      <div className="mx-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Week at a Glance</p>
        <div className="card">
          <div className="space-y-2">
            {week.days.sort((a, b) => {
              const order = [1, 2, 3, 4, 5, 6, 0];
              return order.indexOf(a.dayOfWeek) - order.indexOf(b.dayOfWeek);
            }).map(day => (
              <div
                key={day.dayOfWeek}
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => setSelectedDay(day.dayOfWeek)}
              >
                <span className={`text-xs w-8 font-medium ${day.dayOfWeek === todayDayOfWeek && selectedWeek === currentWeekNum ? 'text-brand-400' : 'text-gray-500'}`}>
                  {DAY_LABELS[day.dayOfWeek]}
                </span>
                {day.isRestDay ? (
                  <span className="text-xs text-gray-600 italic">Rest Day</span>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {day.sessions.map((s, i) => {
                      const config = SESSION_CONFIG[s.type];
                      return (
                        <span key={i} className={`badge text-xs border ${config.color}`}>
                          {s.duration}m
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
