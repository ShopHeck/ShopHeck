import type {
  AppState,
  BeltTier,
  CelebrationEvent,
  GamificationState,
  PersonalRecord,
  WeeklyChallenge,
} from '../../types';
import { computeBelt, BELT_LABELS, BELT_ORDER } from './belts';
import { computeStreak } from './streak';
import { evaluateAchievements, getAchievementDef } from './achievements';
import { rotateChallenges, recomputeChallengeProgress, getWeekKey } from './challenges';
import { computePRs, PR_LABELS, PR_UNITS } from './personalRecords';

export { BELT_LABELS, BELT_ORDER, BELT_THRESHOLDS } from './belts';
export { ACHIEVEMENTS, getAchievementDef } from './achievements';
export { CHALLENGE_TEMPLATES, getWeekKey } from './challenges';
export { PR_LABELS, PR_UNITS } from './personalRecords';

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

export function defaultGamificationState(): GamificationState {
  return {
    belt: {
      current: 'white',
      workoutCount: 0,
      effectiveWinCredit: 0,
      nextTier: 'blue',
      progressPct: 0,
      workoutsToNext: 25,
      winsToNext: 1,
      achievedAt: { white: new Date().toISOString() },
    },
    streak: {
      current: 0,
      best: 0,
      lastWorkoutDate: null,
      lastWorkoutAt: null,
      atRisk: false,
      expired: false,
    },
    achievements: [],
    challenges: [],
    personalRecords: {},
    totalXp: 0,
    pendingCelebrations: [],
    lastEvaluatedAt: null,
  };
}

function makeCelebration(
  kind: CelebrationEvent['kind'],
  id: string,
  title: string,
  subtitle: string,
  icon: string
): CelebrationEvent {
  return { id, kind, title, subtitle, icon, ts: new Date().toISOString() };
}

function beltCelebrations(
  prevAchieved: Partial<Record<BeltTier, string>>,
  nextAchieved: Partial<Record<BeltTier, string>>
): CelebrationEvent[] {
  const out: CelebrationEvent[] = [];
  for (const tier of BELT_ORDER) {
    if (tier === 'white') continue;
    if (!prevAchieved[tier] && nextAchieved[tier]) {
      out.push(
        makeCelebration(
          'belt',
          `belt-${tier}`,
          `${BELT_LABELS[tier]} unlocked!`,
          'New rank earned. Keep grinding.',
          'Award'
        )
      );
    }
  }
  return out;
}

function streakCelebrations(prevBest: number, newBest: number, currentStreak: number): CelebrationEvent[] {
  const out: CelebrationEvent[] = [];
  for (const ms of STREAK_MILESTONES) {
    if (prevBest < ms && newBest >= ms) {
      out.push(
        makeCelebration(
          'streak_milestone',
          `streak-${ms}`,
          `${ms}-day streak!`,
          currentStreak >= ms ? 'You\'re on fire — keep showing up.' : 'Personal best set.',
          'Flame'
        )
      );
    }
  }
  return out;
}

function prCelebrations(newlyBroken: PersonalRecord[]): CelebrationEvent[] {
  return newlyBroken.map(r =>
    makeCelebration(
      'pr',
      `pr-${r.type}-${r.achievedAt}`,
      `New PR: ${PR_LABELS[r.type]}`,
      `${r.value} ${PR_UNITS[r.type]} (was ${r.previousValue ?? 0})`,
      'TrendingUp'
    )
  );
}

function challengeCelebrations(completed: WeeklyChallenge[]): CelebrationEvent[] {
  return completed.map(c =>
    makeCelebration(
      'challenge_complete',
      `challenge-${c.id}`,
      'Challenge complete!',
      `${c.title} · +${c.xpReward} XP`,
      'CheckCircle2'
    )
  );
}

/**
 * Recompute the entire gamification slice from raw state. Idempotent —
 * safe to call on every dispatch and on app boot.
 */
export function applyGamificationUpdates(state: AppState, _triggeredBy: string): AppState {
  const prev = state.gamification ?? defaultGamificationState();
  const now = new Date();

  // 1. Streak
  const streak = computeStreak(state.workoutLogs, now);

  // 2. Belt
  const belt = computeBelt(state.workoutLogs, state.fightResults, state.camps, prev.belt.achievedAt, now);

  // 3. PRs
  const { records: personalRecords, newlyBroken } = computePRs(state, prev.personalRecords);

  // 4. Challenges (rotate if week changed; recompute progress)
  const weekKey = getWeekKey(now);
  const seed = state.currentUser?.id ?? 'anon';
  const rotated = rotateChallenges(weekKey, prev.challenges, seed);
  const { challenges, newlyCompleted } = recomputeChallengeProgress(rotated, state, weekKey);

  // 5. XP from newly completed challenges
  const xpEarned = newlyCompleted.reduce((sum, c) => sum + c.xpReward, 0);
  const totalXp = prev.totalXp + xpEarned;

  // 6. Build interim state so achievement checks can see fresh streak/PRs/challenges.
  const interim: AppState = {
    ...state,
    gamification: {
      ...prev,
      belt,
      streak,
      personalRecords,
      challenges,
      totalXp,
    },
  };

  const { unlocked, newlyUnlocked } = evaluateAchievements(interim, prev.achievements);

  // 7. Collect celebrations.
  const fresh: CelebrationEvent[] = [
    ...beltCelebrations(prev.belt.achievedAt, belt.achievedAt),
    ...streakCelebrations(prev.streak.best, streak.best, streak.current),
    ...prCelebrations(newlyBroken),
    ...challengeCelebrations(newlyCompleted),
    ...newlyUnlocked.map(a => {
      const def = getAchievementDef(a.id);
      return makeCelebration(
        'achievement',
        `achievement-${a.id}`,
        def?.name ?? 'Achievement unlocked',
        def?.description ?? '',
        def?.icon ?? 'Award'
      );
    }),
  ];

  // Cap queue size to avoid runaway growth across imports/bulk inserts.
  const pendingCelebrations = [...prev.pendingCelebrations, ...fresh].slice(-20);

  return {
    ...state,
    gamification: {
      belt,
      streak,
      achievements: unlocked,
      challenges,
      personalRecords,
      totalXp,
      pendingCelebrations,
      lastEvaluatedAt: now.toISOString(),
    },
  };
}

export function dismissCelebration(state: AppState, id: string): AppState {
  if (!state.gamification) return state;
  return {
    ...state,
    gamification: {
      ...state.gamification,
      pendingCelebrations: state.gamification.pendingCelebrations.filter(c => c.id !== id),
    },
  };
}
