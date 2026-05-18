import type { Achievement, AppState } from '../../types';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Lucide icon component name. */
  icon: string;
  category: 'workout' | 'streak' | 'sparring' | 'fight' | 'special';
  check: (state: AppState) => boolean;
}

function maxLogHour(state: AppState): { min: number; max: number } {
  if (state.workoutLogs.length === 0) return { min: 24, max: -1 };
  let min = 24;
  let max = -1;
  for (const log of state.workoutLogs) {
    const h = new Date(log.createdAt).getHours();
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { min, max };
}

function maxWeeklyMep(state: AppState): number {
  const weekTotals = new Map<string, number>();
  for (const log of state.workoutLogs) {
    if (!log.mep) continue;
    const key = isoWeekKey(new Date(log.date));
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + log.mep);
  }
  let max = 0;
  for (const v of weekTotals.values()) if (v > max) max = v;
  return max;
}

function isoWeekKey(d: Date): string {
  // Year + ISO week number, used only as a grouping key here.
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function hasLongGap(state: AppState, minDays: number): boolean {
  if (state.workoutLogs.length < 2) return false;
  const sorted = [...state.workoutLogs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const msMin = minDays * 86400000;
  for (let i = 1; i < sorted.length; i++) {
    const gap = new Date(sorted[i].createdAt).getTime() - new Date(sorted[i - 1].createdAt).getTime();
    if (gap >= msMin) return true;
  }
  return false;
}

function anyWeeklyCleanSweep(state: AppState): boolean {
  const byWeek = new Map<string, { total: number; completed: number }>();
  for (const ch of state.gamification?.challenges ?? []) {
    const slot = byWeek.get(ch.weekKey) ?? { total: 0, completed: 0 };
    slot.total++;
    if (ch.completed) slot.completed++;
    byWeek.set(ch.weekKey, slot);
  }
  for (const v of byWeek.values()) {
    if (v.total >= 3 && v.completed >= v.total) return true;
  }
  return false;
}

function anyBrokenPR(state: AppState): boolean {
  const records = state.gamification?.personalRecords ?? {};
  return Object.values(records).some(r => r && r.previousValue != null);
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_workout',
    name: 'First Round',
    description: 'Log your first workout',
    icon: 'Dumbbell',
    category: 'workout',
    check: s => s.workoutLogs.length >= 1,
  },
  {
    id: 'ten_workouts',
    name: 'Warmed Up',
    description: 'Log 10 workouts',
    icon: 'Activity',
    category: 'workout',
    check: s => s.workoutLogs.length >= 10,
  },
  {
    id: 'fifty_workouts',
    name: 'Grinder',
    description: 'Log 50 workouts',
    icon: 'Hammer',
    category: 'workout',
    check: s => s.workoutLogs.length >= 50,
  },
  {
    id: 'hundred_workouts',
    name: 'Centurion',
    description: 'Log 100 workouts',
    icon: 'Trophy',
    category: 'workout',
    check: s => s.workoutLogs.length >= 100,
  },
  {
    id: 'streak_3',
    name: 'On a Roll',
    description: '3-day workout streak',
    icon: 'Flame',
    category: 'streak',
    check: s => (s.gamification?.streak.best ?? 0) >= 3,
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: '7-day workout streak',
    icon: 'Flame',
    category: 'streak',
    check: s => (s.gamification?.streak.best ?? 0) >= 7,
  },
  {
    id: 'streak_30',
    name: 'Iron Discipline',
    description: '30-day workout streak',
    icon: 'Flame',
    category: 'streak',
    check: s => (s.gamification?.streak.best ?? 0) >= 30,
  },
  {
    id: 'first_spar',
    name: 'Stepped In',
    description: 'Log your first sparring session',
    icon: 'Swords',
    category: 'sparring',
    check: s => s.sparringLogs.length >= 1,
  },
  {
    id: 'spar_25',
    name: 'Sparring Vet',
    description: 'Log 25 sparring sessions',
    icon: 'Swords',
    category: 'sparring',
    check: s => s.sparringLogs.length >= 25,
  },
  {
    id: 'first_win',
    name: 'And New!',
    description: 'Log your first fight win',
    icon: 'Crown',
    category: 'fight',
    check: s => s.fightResults.some(r => r.outcome === 'win'),
  },
  {
    id: 'three_wins',
    name: 'Hat Trick',
    description: 'Log 3 fight wins',
    icon: 'Crown',
    category: 'fight',
    check: s => s.fightResults.filter(r => r.outcome === 'win').length >= 3,
  },
  {
    id: 'early_bird',
    name: 'Dawn Patrol',
    description: 'Log a workout before 6 AM',
    icon: 'Sunrise',
    category: 'special',
    check: s => maxLogHour(s).min < 6,
  },
  {
    id: 'night_owl',
    name: 'Late Knight',
    description: 'Log a workout after 10 PM',
    icon: 'Moon',
    category: 'special',
    check: s => maxLogHour(s).max >= 22,
  },
  {
    id: 'comeback',
    name: 'The Comeback',
    description: 'Return to training after a 14+ day gap',
    icon: 'RotateCcw',
    category: 'special',
    check: s => hasLongGap(s, 14),
  },
  {
    id: 'pr_breaker',
    name: 'Record Setter',
    description: 'Break a personal record',
    icon: 'TrendingUp',
    category: 'special',
    check: anyBrokenPR,
  },
  {
    id: 'weekly_clean_sweep',
    name: 'Clean Sweep',
    description: 'Complete all weekly challenges in one week',
    icon: 'CheckCircle2',
    category: 'special',
    check: anyWeeklyCleanSweep,
  },
  {
    id: 'mep_800',
    name: 'MEP Machine',
    description: 'Hit 800 MEP in a single week',
    icon: 'Zap',
    category: 'workout',
    check: s => maxWeeklyMep(s) >= 800,
  },
];

export function evaluateAchievements(
  state: AppState,
  alreadyUnlocked: Achievement[]
): { unlocked: Achievement[]; newlyUnlocked: Achievement[] } {
  const unlockedIds = new Set(alreadyUnlocked.map(a => a.id));
  const newlyUnlocked: Achievement[] = [];
  const nowIso = new Date().toISOString();

  for (const def of ACHIEVEMENTS) {
    if (unlockedIds.has(def.id)) continue;
    if (def.check(state)) {
      newlyUnlocked.push({ id: def.id, unlockedAt: nowIso });
    }
  }

  return {
    unlocked: [...alreadyUnlocked, ...newlyUnlocked],
    newlyUnlocked,
  };
}

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}
