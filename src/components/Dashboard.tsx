import { useMemo } from 'react';
import { TrendingDown, Activity, ChevronRight, Zap, Shield, Droplets, Brain, Bluetooth, MessageSquare, Dumbbell, UtensilsCrossed, Trophy, History, Swords } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isPro } from '../utils/subscription';
import { getDaysUntilFight, getCurrentWeekNumber, getCampProgress } from '../utils/campGenerator';
import { computeReadiness } from '../utils/readiness';
import { todayISO } from '../utils/dates';
import { weekAdherence } from '../utils/adherence';
import { toDisplayWeight, formatWeight } from '../utils/units';
import { format, parseISO } from 'date-fns';
import ProgressWidget from './gamification/ProgressWidget';
import AdaptationCard from './AdaptationCard';
import { activeCornerSession } from '../utils/cornerMode';
import { fightCta } from '../utils/fightDayCta';
import GlassSurface from './shared/GlassSurface';
import ToolTile from './shared/ToolTile';
import GlassMetricTile from './shared/GlassMetricTile';
import DurationBadge from './shared/DurationBadge';
import FightCountdownCard from './shared/FightCountdownCard';
import FightReadinessGauge from './shared/FightReadinessGauge';
import { SESSION_COLORS, SESSION_ICONS } from '../utils/sessionVisuals';
import { readinessColor, tint } from '../utils/designTokens';

/**
 * Camp phases run cool→hot as the fight approaches, which is why they use the
 * accent ramp rather than the status palette — a phase is a stage, not a
 * judgement, and Peak being crimson here does not mean anything is wrong.
 */
const PHASE_COLORS: Record<string, string> = {
  'Base Building': 'var(--accent-blue)',
  'Strength & Conditioning': 'var(--accent-gold)',
  'Fight Specific': 'var(--accent-flame)',
  'Peak': 'var(--accent-crimson)',
  'Taper': 'var(--accent-green)',
};

const INTENSITY_DOTS: Record<string, number> = {
  Low: 1, Medium: 2, High: 3, 'Very High': 4,
};

import type { LogPrefill } from '../App';

interface Props {
  onNavigate: (view: string, prefill?: LogPrefill) => void;
  onShowFightBreakdown: (fightId: string) => void;
}

export default function Dashboard({ onNavigate, onShowFightBreakdown }: Props) {
  const { state } = useApp();
  const unit = state.dashboardPrefs?.weightUnit ?? 'lbs';
  const { activeCamp, trainingSchedule, workoutLogs, weightEntries, sparringLogs, coachNotes, currentUser, completedSessions, fightResults, conditioningTests, nutritionLogs } = state;

  // computeReadiness filters and sorts five collections and walks every camp
  // workout, and this component re-renders on ANY dispatch — including the
  // hourly gamification recompute and session toggles, neither of which is an
  // input to the score. Keyed on the slices it actually reads (not on `state`,
  // whose identity changes on every dispatch and would defeat the memo), plus a
  // day key so the elapsed-time terms cannot go stale on a dashboard left open
  // overnight. Must sit above the early return — hooks cannot be conditional.
  // computeReadiness returns null without an active camp, so calling it here is
  // safe. FightReadiness.tsx does the same thing for the full-page view.
  const todayKey = todayISO();
  const readiness = useMemo(
    () => computeReadiness(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeCamp, workoutLogs, sparringLogs, weightEntries, conditioningTests,
     nutritionLogs, currentUser, trainingSchedule, unit, todayKey],
  );

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

  // Clamped at zero: a fighter already under target must not see a negative
  // "to cut" figure on the dashboard (read as a bug, and demoralising mid-cut).
  const rawToGo = (latestWeight ? latestWeight.weight : activeCamp.currentWeight) - activeCamp.targetWeight;
  const weightToGo = toDisplayWeight(Math.max(0, rawToGo), unit).toFixed(1);
  const madeWeight = rawToGo <= 0;

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const todaySessions = currentWeek?.days.find(d => d.dayOfWeek === todayDayOfWeek);
  // Sorted, not just sliced. Local state is built newest-first, but a cloud
  // restore appends rows in the server's order, so array position is not
  // recency for anyone who has synced a second device.
  const recentLogs = workoutLogs
    .filter(l => l.campId === activeCamp.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  // Weekly summary stats
  const weekLogs = workoutLogs.filter(l => l.campId === activeCamp.id && l.weekNumber === currentWeekNum);
  const weekMinutes = weekLogs.reduce((sum, l) => sum + l.duration, 0);
  const weekAvgRpe = weekLogs.length > 0
    ? Math.round(weekLogs.reduce((sum, l) => sum + l.rpe, 0) / weekLogs.length * 10) / 10
    : null;
  // Shared definition (utils/adherence.ts). The old prefix scan over
  // completedSessions also counted ticks whose session no longer exists — the
  // schedule is regenerated on every camp edit, so a shrunk week left orphaned
  // `true` entries behind and this could render "7/5 sessions this week".
  const weekScore = weekAdherence(completedSessions, activeCamp.id, currentWeek);
  const weekPlanned = weekScore.planned;
  const weekDone = weekScore.done;

  const pro = isPro(state.subscription);

  const campFightResult = fightResults.find(r => r.campId === activeCamp.id);
  const hasLoggedFight = !!campFightResult;

  // The fight-day handover between these two CTAs got it wrong once and is now
  // a tested pure function — see utils/fightDayCta.ts for what broke.
  const cta = fightCta({
    fightDate: activeCamp.fightDate,
    daysUntil,
    hasResult: hasLoggedFight,
    cornerSession: activeCornerSession(state, activeCamp.id),
  });
  const showPostFightCta = cta === 'post-fight';
  const showCornerCta = cta === 'corner';

  const latestCoachNote = coachNotes
    .filter(n => n.fighterId === currentUser?.id && n.campId === activeCamp.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;

  return (
    <div className="space-y-4 pb-4">
      {/* Locked contract — §3.4. Content order, dimensions and the fight-week
          crimson state all live in the component, so this card cannot drift
          from the one the readiness screen and the spec describe. */}
      <div className="mt-4">
        <FightCountdownCard
          daysOut={daysUntil}
          dateLine={activeCamp.fightDate ? format(parseISO(activeCamp.fightDate), 'MMMM d, yyyy') : 'Fight date TBD'}
          opponent={activeCamp.opponent}
          rounds={activeCamp.rounds}
          roundMinutes={activeCamp.roundDuration}
          weightClass={activeCamp.weightClass}
          currentWeek={currentWeekNum}
          totalWeeks={activeCamp.campWeeks}
          progressPct={progress}
          state={activeCamp.fightDate ? 'populated' : 'empty'}
        />
      </div>

      <ProgressWidget onOpenProgress={() => onNavigate('achievements')} />

      {/* Corner Mode — fight week only, and only until a result exists. The
          whole value is being one tap away on the night; buried in a menu it
          would never be found with gloves already on. */}
      {showCornerCta && (
        <div className="mx-4">
          <button
            onClick={() => onNavigate('corner')}
            className="w-full flex items-center gap-3 bg-gradient-to-br from-red-900/40 to-dark-700 border border-red-800/60 rounded-2xl p-4 text-left hover:border-red-600 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-red-900/50 flex items-center justify-center flex-shrink-0">
              <Swords size={22} className="text-red-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">Corner Mode</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {daysUntil === 0 ? 'Fight day' : `${daysUntil} days out`} · game plan between rounds, score as you go
              </p>
            </div>
            <ChevronRight size={18} className="text-red-300 flex-shrink-0" />
          </button>
        </div>
      )}

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

      {/* Compact readiness variant (§3.6): the same gauge component the detail
          screen renders, at a smaller scale, with one line of truncated
          recommendation and a chevron. It links to the full screen rather than
          duplicating it — which is also why the breakdown does not appear here.
          This previously drew a rotated full circle while the detail screen drew
          the correct 270° arc, so the same score had two different shapes. */}
      {readiness && (
        <div className="mx-4">
          <GlassSurface
            as="button"
            cornerRadius="lg"
            onClick={() => onNavigate('readiness')}
            className="w-full text-left p-4"
            aria-label={`Fight readiness ${readiness.overall} out of 100, ${readiness.status}. Open the full readiness breakdown.`}
          >
            <div className="flex items-center gap-4">
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
            </div>
          </GlassSurface>
        </div>
      )}

      {/* Coach Note Banner */}
      {/* Adaptive Camp — renders nothing unless the signals genuinely warrant
          a change, so it sits above the coach note without competing with it. */}
      <AdaptationCard />

      {latestCoachNote && (
        <div className="mx-4">
          <div className="bg-gradient-to-r from-purple-900/40 to-dark-700 border border-purple-800/50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-900/60 flex items-center justify-center flex-shrink-0 mt-0.5">
              <MessageSquare size={15} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-purple-400">{latestCoachNote.coachName}</span>
                <span className="text-xs text-gray-450">·</span>
                <span className="text-xs text-gray-450">{format(parseISO(latestCoachNote.createdAt), 'MMM d')}</span>
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
              <span
                className="badge border"
                style={{
                  color: PHASE_COLORS[currentWeek.phase] ?? 'var(--text-secondary)',
                  backgroundColor: tint(PHASE_COLORS[currentWeek.phase] ?? 'var(--text-tertiary)', 0.14),
                  borderColor: tint(PHASE_COLORS[currentWeek.phase] ?? 'var(--text-tertiary)', 0.35),
                }}
              >
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

      {/* Metric tiles — locked dimensions (§3.4), solid fill rather than live
          blur (§3.2 names this grid specifically). Labels are single-line by
          contract, so the unit moves into the label and the value stays bare. */}
      <div className="mx-4 grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
        <GlassMetricTile
          label={madeWeight ? 'On target' : 'To cut'}
          value={madeWeight ? '✓' : weightToGo}
          icon={<TrendingDown size={13} style={{ color: 'var(--accent-flame)' }} />}
          onClick={() => onNavigate('weight')}
        />
        <GlassMetricTile
          label="Sessions"
          value={totalWorkouts}
          icon={<Activity size={13} style={{ color: 'var(--accent-green)' }} />}
          onClick={() => onNavigate('log')}
        />
        <GlassMetricTile
          label="Rounds"
          value={totalSparingRounds}
          icon={<Zap size={13} style={{ color: 'var(--accent-gold)' }} />}
          onClick={() => onNavigate('progress')}
        />
      </div>

      {/* This Week Summary */}
      {(weekPlanned > 0 || weekLogs.length > 0) && (
        <div className="mx-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Week</p>
            <span className="text-xs text-gray-450">Week {currentWeekNum}</span>
          </div>
          <div className="card">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-black text-white">
                  {weekDone}<span className="text-gray-450 font-medium text-sm">/{weekPlanned}</span>
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
              {todaySessions.sessions.map((session, i) => {
                // The five-way ternary chain this replaces carried its own copy
                // of the session→color mapping, one of three that had already
                // drifted from each other. SESSION_COLORS is now the only one.
                const accent = SESSION_COLORS[session.type];
                const Icon = SESSION_ICONS[session.type];
                return (
                  <GlassSurface key={i} cornerRadius="md" className="flex items-center gap-3 p-4">
                    <div
                      className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: tint(accent, 0.16),
                        borderRadius: 'var(--radius-sm)',
                        color: accent,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{session.title}</p>
                    </div>
                    <DurationBadge minutes={session.duration} sessionType={session.type} />
                    <button
                      onClick={() => onNavigate('log', {
                        sessionType: session.type === 'rest' ? 'recovery' : session.type,
                        title: session.title,
                        duration: session.duration,
                      })}
                      aria-label={`Log ${session.title}`}
                      className="text-xs font-semibold flex-shrink-0 -m-2 p-2"
                      style={{ color: 'var(--accent-flame)' }}
                    >
                      Log
                    </button>
                  </GlassSurface>
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
              <div className="flex justify-between text-xs text-gray-450 mt-1">
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
        <p className="type-caption text-gray-450 mb-2">Tools</p>
        <div className="grid grid-cols-2" style={{ gap: 'var(--space-3)' }}>
          <ToolTile icon={<Brain size={18} />} accent="var(--accent-violet)" title="AI Insights" subtitle="Coach analysis" onClick={() => onNavigate('aiinsights')} gated={!pro} />
          <ToolTile icon={<Shield size={18} />} accent="var(--accent-crimson)" title="Game Plan" subtitle="Fight strategy" onClick={() => onNavigate('gameplan')} gated={!pro} />
          <ToolTile icon={<Droplets size={18} />} accent="var(--accent-blue)" title="Nutrition" subtitle="Water & meals" onClick={() => onNavigate('nutrition')} gated={!pro} />
          <ToolTile icon={<Bluetooth size={18} />} accent="var(--accent-cyan)" title="Trackers" subtitle="HR · HRV · Recovery" onClick={() => onNavigate('trackers')} />
          <ToolTile icon={<Dumbbell size={18} />} accent="var(--accent-gold)" title="Exercise Library" subtitle="Drills & workouts" onClick={() => onNavigate('workout-library')} />
          <ToolTile icon={<UtensilsCrossed size={18} />} accent="var(--accent-green)" title="Meal Library" subtitle="Plans & generator" onClick={() => onNavigate('meal-library')} />
          <ToolTile icon={<History size={18} />} accent="var(--accent-flame)" title="Camp History" subtitle="Past camps & fights" onClick={() => onNavigate('camp-history')} />
        </div>
      </div>
    </div>
  );
}
