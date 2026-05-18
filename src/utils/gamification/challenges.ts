import type { AppState, ChallengeMetric, WeeklyChallenge } from '../../types';

interface ChallengeTemplate {
  id: string;
  title: string;
  metric: ChallengeMetric;
  target: number;
  xpReward: number;
}

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  { id: 'workouts_4',  title: 'Log 4 workouts this week',      metric: 'workouts',          target: 4,   xpReward: 50 },
  { id: 'workouts_6',  title: 'Log 6 workouts this week',      metric: 'workouts',          target: 6,   xpReward: 80 },
  { id: 'sparring_2',  title: 'Spar 2 sessions this week',     metric: 'sparring_sessions', target: 2,   xpReward: 60 },
  { id: 'sparring_3',  title: 'Spar 3 sessions this week',     metric: 'sparring_sessions', target: 3,   xpReward: 90 },
  { id: 'mep_600',     title: 'Hit 600 MEP this week',         metric: 'weekly_mep',        target: 600, xpReward: 70 },
  { id: 'mep_900',     title: 'Hit 900 MEP this week',         metric: 'weekly_mep',        target: 900, xpReward: 110 },
  { id: 'minutes_300', title: 'Train 300 minutes this week',   metric: 'workout_minutes',   target: 300, xpReward: 70 },
  { id: 'high_rpe_3',  title: 'Log 3 sessions at RPE 8+',      metric: 'high_rpe_sessions', target: 3,   xpReward: 80 },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the YYYY-MM-DD of the Monday (local) for the week containing d. */
export function getWeekKey(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0=Sun..6=Sat. Shift so Monday=0.
  const dayShift = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - dayShift);
  // Build the key from local parts — toISOString() would shift the date back
  // by a day for users east of UTC, mis-bucketing logs into the wrong week.
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekRange(weekKey: string): { start: Date; end: Date } {
  const start = new Date(weekKey + 'T00:00:00');
  const end = new Date(start.getTime() + 7 * MS_PER_DAY);
  return { start, end };
}

/** Cheap deterministic 32-bit hash from a string. */
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function pickThree(seed: string): ChallengeTemplate[] {
  const pool = [...CHALLENGE_TEMPLATES];
  const picked: ChallengeTemplate[] = [];
  let h = hash(seed);
  while (picked.length < 3 && pool.length > 0) {
    const idx = h % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
    h = hash(seed + ':' + picked.length);
  }
  return picked;
}

/**
 * Rotate challenges if the week key has changed. Old (completed or stale)
 * challenges from prior weeks are kept in history so the achievement
 * "weekly_clean_sweep" can still detect a past completed week.
 */
export function rotateChallenges(
  currentWeekKey: string,
  prevChallenges: WeeklyChallenge[],
  seedSuffix: string
): WeeklyChallenge[] {
  const hasCurrent = prevChallenges.some(c => c.weekKey === currentWeekKey);
  if (hasCurrent) return prevChallenges;

  const picked = pickThree(currentWeekKey + ':' + seedSuffix);
  const fresh: WeeklyChallenge[] = picked.map(t => ({
    id: `${currentWeekKey}-${t.id}`,
    weekKey: currentWeekKey,
    templateId: t.id,
    title: t.title,
    metric: t.metric,
    target: t.target,
    progress: 0,
    completed: false,
    xpReward: t.xpReward,
  }));

  // Keep prior weeks for history; cap at last 8 weeks to avoid unbounded growth.
  const past = prevChallenges
    .filter(c => c.weekKey !== currentWeekKey)
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey))
    .slice(0, 24); // ~8 weeks * 3 challenges

  return [...fresh, ...past];
}

/** Recompute progress for the active-week challenges from raw state. */
export function recomputeChallengeProgress(
  challenges: WeeklyChallenge[],
  state: AppState,
  currentWeekKey: string
): { challenges: WeeklyChallenge[]; newlyCompleted: WeeklyChallenge[] } {
  const range = weekRange(currentWeekKey);
  const inWeek = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  };

  const weekWorkouts = state.workoutLogs.filter(l => inWeek(l.date));
  const weekSparring = state.sparringLogs.filter(l => inWeek(l.date));
  const weekMep = weekWorkouts.reduce((sum, l) => sum + (l.mep ?? 0), 0);
  const weekMinutes = weekWorkouts.reduce((sum, l) => sum + l.duration, 0);
  const highRpeCount = weekWorkouts.filter(l => l.rpe >= 8).length;

  function metricValue(m: ChallengeMetric): number {
    switch (m) {
      case 'workouts':          return weekWorkouts.length;
      case 'sparring_sessions': return weekSparring.length;
      case 'weekly_mep':        return weekMep;
      case 'workout_minutes':   return weekMinutes;
      case 'high_rpe_sessions': return highRpeCount;
    }
  }

  const newlyCompleted: WeeklyChallenge[] = [];

  const updated = challenges.map(c => {
    if (c.weekKey !== currentWeekKey) return c; // freeze past weeks
    const progress = metricValue(c.metric);
    const wasComplete = c.completed;
    const completed = wasComplete || progress >= c.target;
    const next = { ...c, progress, completed };
    if (!wasComplete && completed) newlyCompleted.push(next);
    return next;
  });

  return { challenges: updated, newlyCompleted };
}
