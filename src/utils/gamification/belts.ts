import { parseISO } from 'date-fns';
import type { BeltProgress, BeltTier, FightCamp, FightResult, WorkoutLog } from '../../types';

export const BELT_ORDER: BeltTier[] = ['white', 'blue', 'purple', 'brown', 'black'];

export const BELT_THRESHOLDS: Record<BeltTier, { workouts: number; wins: number }> = {
  white:  { workouts: 0,   wins: 0 },
  blue:   { workouts: 25,  wins: 1 },
  purple: { workouts: 75,  wins: 2 },
  brown:  { workouts: 150, wins: 3 },
  black:  { workouts: 300, wins: 5 },
};

export const BELT_LABELS: Record<BeltTier, string> = {
  white: 'White Belt',
  blue: 'Blue Belt',
  purple: 'Purple Belt',
  brown: 'Brown Belt',
  black: 'Black Belt',
};

export function nextTier(tier: BeltTier): BeltTier | null {
  const i = BELT_ORDER.indexOf(tier);
  return i < BELT_ORDER.length - 1 ? BELT_ORDER[i + 1] : null;
}

export function computeBelt(
  workoutLogs: WorkoutLog[],
  fightResults: FightResult[],
  camps: FightCamp[],
  prevAchievedAt: Partial<Record<BeltTier, string>> = {},
  now: Date = new Date()
): BeltProgress {
  const workoutCount = workoutLogs.length;
  const wins = fightResults.filter(r => r.outcome === 'win').length;

  // Camps with a past fight date and no win logged → half-credit toward wins.
  const campsCompletedNoWin = camps.filter(c => {
    if (!c.fightDate) return false;
    // parseISO keeps the date in LOCAL time. `new Date('YYYY-MM-DD')` parses as
    // UTC midnight, so for UTC-negative users a fight scheduled for *today* reads
    // as already past and grants win credit on the morning of the fight.
    const fightDate = parseISO(c.fightDate);
    if (fightDate >= now) return false;
    const hasWin = fightResults.some(r => r.campId === c.id && r.outcome === 'win');
    return !hasWin;
  }).length;

  const effectiveWinCredit = wins + 0.5 * campsCompletedNoWin;

  // Highest tier satisfying EITHER path.
  let current: BeltTier = 'white';
  for (const tier of BELT_ORDER) {
    const thr = BELT_THRESHOLDS[tier];
    if (workoutCount >= thr.workouts || effectiveWinCredit >= thr.wins) {
      current = tier;
    }
  }

  const next = nextTier(current);
  let progressPct = 100;
  let workoutsToNext: number | null = null;
  let winsToNext: number | null = null;

  if (next) {
    const nextThr = BELT_THRESHOLDS[next];
    workoutsToNext = Math.max(0, nextThr.workouts - workoutCount);
    winsToNext = Math.max(0, Math.ceil(nextThr.wins - effectiveWinCredit));
    const workoutPct = nextThr.workouts > 0 ? (workoutCount / nextThr.workouts) * 100 : 0;
    const winPct = nextThr.wins > 0 ? (effectiveWinCredit / nextThr.wins) * 100 : 0;
    progressPct = Math.max(0, Math.min(100, Math.max(workoutPct, winPct)));
  }

  // Preserve achievedAt for previously crossed tiers; stamp newly crossed ones.
  const achievedAt: Partial<Record<BeltTier, string>> = { ...prevAchievedAt };
  const nowIso = now.toISOString();
  const currentIdx = BELT_ORDER.indexOf(current);
  for (let i = 0; i <= currentIdx; i++) {
    const t = BELT_ORDER[i];
    if (!achievedAt[t]) achievedAt[t] = nowIso;
  }

  return {
    current,
    workoutCount,
    effectiveWinCredit,
    nextTier: next,
    progressPct,
    workoutsToNext,
    winsToNext,
    achievedAt,
  };
}
