import { Activity, Brain, Bluetooth, ChevronRight, Dumbbell, Droplets, Flame, UtensilsCrossed } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPro } from '../utils/subscription';
import { toDisplayWeight, formatWeight, formatWeightDelta } from '../utils/units';
import { getCurrentWeekNumber, getCurrentOffSeasonCycle } from '../utils/campGenerator';
import { sessionKey, weekAdherence } from '../utils/adherence';
import { format, parseISO } from 'date-fns';
import type { LogPrefill } from '../App';
import type { SessionType } from '../types';
import ProgressWidget from './gamification/ProgressWidget';
import GlassSurface from './shared/GlassSurface';
import GlassMetricTile from './shared/GlassMetricTile';
import TodaySessionRow from './shared/TodaySessionRow';
import OffSeasonHeroCard from './shared/OffSeasonHeroCard';
import ToolTile from './shared/ToolTile';
import { SESSION_COLORS, SESSION_ICONS, SESSION_LABELS } from '../utils/sessionVisuals';
import { PACE_COLORS, paceTier, tint } from '../utils/designTokens';

const GOAL_LABELS: Record<string, string> = {
  'base-building': 'Base Building',
  'strength': 'Build Strength',
  'maintain': 'Maintain & Sharpen',
  'recovery': 'Active Recovery',
};

/**
 * Off-season phases, matching the values WeeklyPlanner already uses for the
 * same four names — they were two separate records that had drifted apart on
 * Foundation (indigo here, blue there).
 */
const PHASE_COLORS: Record<string, string> = {
  Foundation:        'var(--accent-blue)',
  Development:       'var(--accent-cyan)',
  Performance:       'var(--accent-violet)',
  'Active Recovery': 'var(--accent-green)',
};

/*
 * The session→colour mapping is NOT redeclared here. This file used to carry a
 * fourth copy of it (a `SESSION_TYPE_COLORS` record of Tailwind classes), on
 * top of the ones in Dashboard, WeeklyPlanner and the training log. It now
 * reads SESSION_COLORS from utils/sessionVisuals like everything else.
 */

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
}

export default function OffSeasonDashboard({ onNavigate }: Props) {
  const { state } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const { activeCamp, trainingSchedule, workoutLogs, weightEntries, completedSessions, currentUser, gamification } = state;

  if (!activeCamp) return null;

  const currentWeekNum = getCurrentWeekNumber(activeCamp);
  const cycle = getCurrentOffSeasonCycle(activeCamp);
  const currentWeek = trainingSchedule[currentWeekNum - 1];
  const goalLabel = GOAL_LABELS[activeCamp.offSeasonGoal ?? 'maintain'] ?? 'Off Season';
  const pro = isPro(state.subscription);
  // Week stats
  const weekLogs = workoutLogs.filter(l => l.campId === activeCamp.id && l.weekNumber === currentWeekNum);
  const weekMinutes = weekLogs.reduce((sum, l) => sum + l.duration, 0);
  const weekAvgRpe = weekLogs.length > 0
    ? Math.round(weekLogs.reduce((sum, l) => sum + l.rpe, 0) / weekLogs.length * 10) / 10
    : null;
  // Shared definition (utils/adherence.ts). This previously excluded
  // `type === 'rest'` sessions from the denominator while the key builder still
  // numbered them, so `done` could exceed `planned` on top of the stale-tick
  // problem described in Dashboard.tsx.
  const weekScore = weekAdherence(completedSessions, activeCamp.id, currentWeek);
  const weekPlanned = weekScore.planned;
  const weekDone = weekScore.done;

  // Training variety (current week logs by type)
  const typeCounts = weekLogs.reduce<Partial<Record<SessionType, number>>>((acc, l) => {
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
  // Sorted, not just sliced — see the matching note in Dashboard.tsx.
  const recentLogs = workoutLogs
    .filter(l => l.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <div className="space-y-4 pb-4">
      {/* Same layout contract as the fight-camp dashboard's countdown card, so
          moving between a camp and the block after it does not feel like
          changing apps. This was a hand-rolled gradient card — the exact
          pattern <FightCountdownCard> replaced on the other Home. */}
      <div className="mt-4">
        <OffSeasonHeroCard
          goalLabel={goalLabel}
          subtitle={[currentUser?.sport, currentUser?.weightClass].filter(Boolean).join(' · ')}
          currentWeek={currentWeekNum}
          totalWeeks={activeCamp.campWeeks}
          cycle={cycle ?? 1}
          phase={currentWeek?.phase}
          phaseColor={currentWeek?.phase ? PHASE_COLORS[currentWeek.phase] : undefined}
        />
      </div>

      <ProgressWidget onOpenProgress={() => onNavigate('achievements')} />

      {/* Streak Card */}
      <div className="mx-4">
        <GlassSurface cornerRadius="md" className="flex items-center gap-4 p-4">
          <div
            className="w-12 h-12 flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: tint('var(--accent-flame)', 0.16),
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent-flame)',
            }}
          >
            <Flame size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="type-caption text-gray-450">Training Streak</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-extrabold text-white tabular-nums">{streak.current}</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                day{streak.current !== 1 ? 's' : ''} in a row
              </span>
            </div>
          </div>
          {streak.best > 0 && (
            <div className="text-right flex-shrink-0">
              <p className="type-caption text-gray-450">Best</p>
              <p className="text-lg font-extrabold tabular-nums" style={{ color: 'var(--accent-teal)' }}>
                {streak.best}
              </p>
            </div>
          )}
        </GlassSurface>
      </div>

      {/* This Week Summary */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="type-caption text-gray-450">This Week</p>
          <span className="text-xs text-gray-450">Week {currentWeekNum}</span>
        </div>
        <div className="grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
          <GlassMetricTile
            label="Sessions"
            value={<>{weekDone}<span className="text-base font-semibold text-gray-450">/{weekPlanned}</span></>}
          />
          <GlassMetricTile label="Minutes" value={weekMinutes || '—'} />
          <GlassMetricTile label="Avg RPE" value={weekAvgRpe ?? '—'} />
        </div>
        {weekPlanned > 0 && (
          <div
            className="mt-3 h-1.5 overflow-hidden"
            style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
            role="progressbar"
            aria-valuenow={weekDone}
            aria-valuemin={0}
            aria-valuemax={weekPlanned}
            aria-label={`Week adherence: ${weekDone} of ${weekPlanned} sessions done`}
          >
            {/* Adherence is a pace judgement, so it takes the pace scale rather
                than the mode's teal — "am I keeping up" means the same thing
                here as it does on the weight screen. */}
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.round((weekDone / weekPlanned) * 100))}%`,
                borderRadius: 'var(--radius-full)',
                background: PACE_COLORS[paceTier(weekDone / weekPlanned)],
              }}
            />
          </div>
        )}
      </div>

      {/* Training Variety */}
      {totalTyped > 0 && (
        <div className="mx-4">
          <p className="type-caption text-gray-450 mb-2">This Week's Sessions</p>
          <GlassSurface cornerRadius="md" className="p-4">
            {/* Stacked bar */}
            <div
              className="h-2 overflow-hidden flex gap-px mb-3"
              style={{ borderRadius: 'var(--radius-full)' }}
            >
              {(Object.entries(typeCounts) as [SessionType, number][]).map(([type, count]) => (
                <div
                  key={type}
                  className="h-full transition-all"
                  style={{
                    width: `${Math.round((count / totalTyped) * 100)}%`,
                    backgroundColor: SESSION_COLORS[type] ?? 'var(--text-tertiary)',
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(Object.entries(typeCounts) as [SessionType, number][]).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: SESSION_COLORS[type] ?? 'var(--text-tertiary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {SESSION_LABELS[type] ?? type} <span className="text-gray-450 tabular-nums">×{count}</span>
                  </span>
                </div>
              ))}
            </div>
          </GlassSurface>
        </div>
      )}

      {/* Week Goals */}
      {currentWeek?.weeklyGoals && currentWeek.weeklyGoals.length > 0 && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="type-caption text-gray-450">Week Goals</p>
            <button
              onClick={() => onNavigate('planner')}
              aria-label="Open the weekly planner"
              className="-m-2 p-2"
              style={{ color: 'var(--accent-teal)' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <GlassSurface cornerRadius="md" className="p-4 space-y-1.5">
            {currentWeek.weeklyGoals.slice(0, 3).map((goal, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-teal)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{goal}</span>
              </div>
            ))}
          </GlassSurface>
        </div>
      )}

      {/* Today's Training */}
      {todaySessions && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="type-caption text-gray-450">Today's Training</p>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {format(today, 'EEEE, MMM d')}
            </span>
          </div>

          {todaySessions.isRestDay ? (
            <GlassSurface cornerRadius="md" className="text-center py-6 px-4">
              <div className="text-3xl mb-2" aria-hidden="true">🧘</div>
              <p className="type-card-title text-white">Rest Day</p>
              <p className="type-body mt-1" style={{ color: 'var(--text-secondary)' }}>
                Recovery is training too. Sleep well, eat well.
              </p>
            </GlassSurface>
          ) : (
            <div className="space-y-2">
              {todaySessions.sessions.map((session, i) => {
                const key = sessionKey(activeCamp.id, currentWeekNum, todayDayOfWeek, i);
                const loggable = session.type !== 'rest' && session.duration > 0;
                return (
                  <TodaySessionRow
                    key={i}
                    session={session}
                    done={!!completedSessions[key]}
                    logColor="var(--accent-teal)"
                    onLog={loggable ? () => onNavigate('log', {
                      sessionType: session.type === 'rest' ? 'recovery' : session.type,
                      title: session.title,
                      duration: session.duration,
                      sessionKey: key,
                    }) : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      {recentLogs.length > 0 && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="type-caption text-gray-450">Recent Activity</p>
            <button
              onClick={() => onNavigate('log')}
              className="text-xs font-semibold -m-2 p-2"
              style={{ color: 'var(--accent-teal)' }}
            >
              See all
            </button>
          </div>
          <div className="space-y-2">
            {recentLogs.map(log => {
              const accent = SESSION_COLORS[log.sessionType] ?? 'var(--accent-teal)';
              const Icon = SESSION_ICONS[log.sessionType] ?? Activity;
              return (
                <GlassSurface key={log.id} cornerRadius="md" className="flex items-center gap-3 p-4">
                  <div
                    className="w-8 h-8 flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: tint(accent, 0.16),
                      borderRadius: 'var(--radius-sm)',
                      color: accent,
                    }}
                  >
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{log.title}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {format(parseISO(log.date), 'MMM d')} · {log.duration}min · RPE {log.rpe}
                    </p>
                  </div>
                </GlassSurface>
              );
            })}
          </div>
        </div>
      )}

      {/* Weight Status */}
      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="type-caption text-gray-450">Weight Status</p>
          <button
            onClick={() => onNavigate('weight')}
            className="text-xs font-semibold -m-2 p-2"
            style={{ color: 'var(--accent-teal)' }}
          >
            Track
          </button>
        </div>
        <GlassSurface cornerRadius="md" className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-center flex-shrink-0">
              <div className="text-2xl font-extrabold text-white tabular-nums">
                {toDisplayWeight(currentW, unit)}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>current</div>
            </div>
            <div className="flex-1 px-2 min-w-0">
              {currentW !== targetW ? (
                <>
                  <div
                    className="h-2 overflow-hidden"
                    style={{ background: 'var(--surface-3)', borderRadius: 'var(--radius-full)' }}
                  >
                    <div
                      className="h-full"
                      style={{
                        borderRadius: 'var(--radius-full)',
                        background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-teal))',
                        width: `${Math.max(0, Math.min(100,
                          activeCamp.currentWeight !== targetW
                            ? ((activeCamp.currentWeight - currentW) / (activeCamp.currentWeight - targetW)) * 100
                            : 0
                        ))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-450 mt-1 tabular-nums">
                    <span>{formatWeight(activeCamp.currentWeight, unit)}</span>
                    <span>{formatWeight(targetW, unit)}</span>
                  </div>
                </>
              ) : (
                <p className="text-center text-xs font-semibold" style={{ color: 'var(--accent-teal)' }}>
                  At goal weight
                </p>
              )}
            </div>
            <div className="text-center flex-shrink-0">
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{ color: 'var(--accent-teal)' }}
              >
                {toDisplayWeight(targetW, unit)}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>goal</div>
            </div>
          </div>
          {currentW !== targetW && (
            <p className="text-center text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
              {formatWeightDelta(weightDiff, unit)} {weightDiff > 0 ? 'to lose' : 'to gain'} to reach goal
            </p>
          )}
        </GlassSurface>
      </div>

      {/* Quick Tools */}
      <div className="mx-4">
        <p className="type-caption text-gray-450 mb-2">Tools</p>
        <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
          <ToolTile
            icon={<Brain size={18} />}
            accent="var(--accent-violet)"
            title="AI Insights"
            subtitle="Coach analysis"
            onClick={() => onNavigate('aiinsights')}
            gated={!pro}
          />
          <ToolTile
            icon={<Activity size={18} />}
            accent="var(--accent-teal)"
            title="Log Session"
            subtitle="Record your work"
            onClick={() => onNavigate('log')}
          />
          <ToolTile
            icon={<Droplets size={18} />}
            accent="var(--accent-blue)"
            title="Nutrition"
            subtitle="Water & meals"
            onClick={() => onNavigate('nutrition')}
            gated={!pro}
          />
          <ToolTile
            icon={<Bluetooth size={18} />}
            accent="var(--accent-cyan)"
            title="Trackers"
            subtitle="HR · HRV · Recovery"
            onClick={() => onNavigate('trackers')}
          />
          <ToolTile
            icon={<Dumbbell size={18} />}
            accent="var(--accent-gold)"
            title="Exercise Library"
            subtitle="Drills & workouts"
            onClick={() => onNavigate('workout-library')}
          />
          <ToolTile
            icon={<UtensilsCrossed size={18} />}
            accent="var(--accent-green)"
            title="Meal Library"
            subtitle="Plans & generator"
            onClick={() => onNavigate('meal-library')}
          />
        </div>
      </div>
    </div>
  );
}
