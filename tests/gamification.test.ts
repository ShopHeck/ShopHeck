import { describe, expect, it } from 'vitest';
import { computeStreak } from '../src/utils/gamification/streak';
import { computeBelt, BELT_THRESHOLDS } from '../src/utils/gamification/belts';
import { computePRs } from '../src/utils/gamification/personalRecords';
import {
  getWeekKey,
  rotateChallenges,
  recomputeChallengeProgress,
} from '../src/utils/gamification/challenges';
import { createDefaultState } from '../src/utils/storage';
import type { AppState, FightCamp, FightResult, WorkoutLog } from '../src/types';

function workout(date: string, extra: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: `w-${date}-${extra.id ?? ''}`,
    campId: 'camp-1',
    date,
    weekNumber: 1,
    dayLabel: 'Monday',
    sessionType: 'conditioning',
    title: 'Session',
    duration: 45,
    rpe: 7,
    notes: '',
    completed: true,
    // Local midnight, not `${date}T00:00:00Z` — the modules deliberately parse
    // local to avoid mis-bucketing days for non-UTC users.
    createdAt: new Date(`${date}T12:00:00`).toISOString(),
    ...extra,
  };
}

function camp(id: string, fightDate?: string): FightCamp {
  return {
    id,
    fightDate,
    weightClass: 'Lightweight',
    currentWeight: 160,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 3,
    sport: 'Boxing',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function fight(campId: string, outcome: FightResult['outcome']): FightResult {
  return {
    id: `f-${campId}-${outcome}`,
    campId,
    fighterId: 'me',
    fightDate: '2026-03-01',
    opponent: 'X',
    outcome,
    method: 'decision',
    totalRounds: 3,
    rounds: [],
    stylePlanFollowed: 3,
    overallNotes: '',
    lessons: '',
    createdAt: '2026-03-01T00:00:00.000Z',
  };
}

describe('computeStreak', () => {
  it('counts consecutive logged days back from the last log', () => {
    const logs = [workout('2026-08-01'), workout('2026-08-02'), workout('2026-08-03')];
    const streak = computeStreak(logs, new Date('2026-08-03T18:00:00'));

    expect(streak.current).toBe(3);
    expect(streak.best).toBe(3);
    expect(streak.expired).toBe(false);
  });

  it('breaks the run on a missed day but keeps the best', () => {
    const logs = [
      workout('2026-08-01'), workout('2026-08-02'), workout('2026-08-03'),
      // gap on the 4th
      workout('2026-08-05'),
    ];
    const streak = computeStreak(logs, new Date('2026-08-05T18:00:00'));

    expect(streak.current).toBe(1);
    expect(streak.best).toBe(3);
  });

  it('counts one day once, however many sessions it holds', () => {
    const logs = [
      workout('2026-08-03', { id: 'a' }),
      workout('2026-08-03', { id: 'b' }),
      workout('2026-08-03', { id: 'c' }),
    ];
    expect(computeStreak(logs, new Date('2026-08-03T20:00:00')).current).toBe(1);
  });

  it('survives the 48h grace window and flags at-risk', () => {
    // A Saturday-night session checked Monday morning (~35h later) still holds.
    const logs = [workout('2026-08-01'), workout('2026-08-02')];
    const streak = computeStreak(logs, new Date('2026-08-03T23:00:00'));

    expect(streak.expired).toBe(false);
    expect(streak.atRisk).toBe(true);
    expect(streak.current).toBe(2);
  });

  it('is not at risk inside the first 24h', () => {
    const streak = computeStreak([workout('2026-08-02')], new Date('2026-08-02T20:00:00'));
    expect(streak.atRisk).toBe(false);
  });

  it('expires past 48h, keeping best and the last-workout stamp', () => {
    const logs = [workout('2026-08-01'), workout('2026-08-02')];
    const streak = computeStreak(logs, new Date('2026-08-05T12:00:00'));

    expect(streak.expired).toBe(true);
    expect(streak.current).toBe(0);
    expect(streak.best).toBe(2);
    expect(streak.lastWorkoutDate).toBe('2026-08-02');
  });

  it('returns an empty streak with no logs', () => {
    const streak = computeStreak([], new Date('2026-08-05T12:00:00'));
    expect(streak).toMatchObject({ current: 0, best: 0, lastWorkoutDate: null, expired: false });
  });
});

describe('computeBelt', () => {
  const now = new Date('2026-08-05T12:00:00');

  it('starts at white with nothing logged', () => {
    const belt = computeBelt([], [], [], {}, now);
    expect(belt.current).toBe('white');
    expect(belt.nextTier).toBe('blue');
    expect(belt.workoutsToNext).toBe(BELT_THRESHOLDS.blue.workouts);
  });

  it('promotes on the workout path', () => {
    const logs = Array.from({ length: 25 }, (_, i) => workout('2026-08-01', { id: `w${i}` }));
    expect(computeBelt(logs, [], [], {}, now).current).toBe('blue');
  });

  it('promotes on the wins path alone', () => {
    // Either path qualifies — one win reaches blue with zero workouts.
    const belt = computeBelt([], [fight('camp-1', 'win')], [], {}, now);
    expect(belt.current).toBe('blue');
  });

  it('gives half credit for a completed camp with no win', () => {
    const belt = computeBelt([], [], [camp('camp-1', '2026-07-01')], {}, now);
    expect(belt.effectiveWinCredit).toBe(0.5);
  });

  it('does not credit a camp whose fight date has not passed', () => {
    const belt = computeBelt([], [], [camp('camp-1', '2026-09-01')], {}, now);
    expect(belt.effectiveWinCredit).toBe(0);
  });

  it('does not credit a camp that already has a win (no double count)', () => {
    const belt = computeBelt([], [fight('camp-1', 'win')], [camp('camp-1', '2026-07-01')], {}, now);
    expect(belt.effectiveWinCredit).toBe(1);
  });

  it('preserves an existing achievedAt and stamps newly crossed tiers', () => {
    const logs = Array.from({ length: 25 }, (_, i) => workout('2026-08-01', { id: `w${i}` }));
    const belt = computeBelt(logs, [], [], { white: '2020-01-01T00:00:00.000Z' }, now);

    expect(belt.achievedAt.white).toBe('2020-01-01T00:00:00.000Z');
    expect(belt.achievedAt.blue).toBe(now.toISOString());
  });

  it('caps progress at 100 and reports no next tier at black', () => {
    const logs = Array.from({ length: 400 }, (_, i) => workout('2026-08-01', { id: `w${i}` }));
    const belt = computeBelt(logs, [], [], {}, now);

    expect(belt.current).toBe('black');
    expect(belt.nextTier).toBeNull();
    expect(belt.progressPct).toBe(100);
  });
});

describe('computePRs', () => {
  function stateWith(logs: WorkoutLog[]): AppState {
    return { ...createDefaultState(), workoutLogs: logs };
  }

  it('sets first-ever records without celebrating them', () => {
    const { records, newlyBroken } = computePRs(
      stateWith([workout('2026-08-01', { duration: 60, rpe: 8 })]), {},
    );

    expect(records.longest_workout?.value).toBe(60);
    expect(records.highest_rpe?.value).toBe(8);
    // A first record is a baseline, not an achievement.
    expect(newlyBroken).toHaveLength(0);
  });

  it('celebrates a beaten record and carries the previous value', () => {
    const prev = computePRs(stateWith([workout('2026-08-01', { duration: 60 })]), {}).records;
    const { records, newlyBroken } = computePRs(
      stateWith([workout('2026-08-01', { duration: 60 }), workout('2026-08-02', { duration: 90, id: 'b' })]),
      prev,
    );

    expect(records.longest_workout?.value).toBe(90);
    expect(records.longest_workout?.previousValue).toBe(60);
    expect(newlyBroken.map(r => r.type)).toContain('longest_workout');
  });

  it('lowers a stale record when the source log is deleted', () => {
    // Records are rebuilt from current logs each run, so an edited or deleted
    // log must not leave an unreachable PR standing.
    const prev = computePRs(
      stateWith([workout('2026-08-01', { duration: 90 }), workout('2026-08-02', { duration: 30, id: 'b' })]), {},
    ).records;
    expect(prev.longest_workout?.value).toBe(90);

    const { records } = computePRs(stateWith([workout('2026-08-02', { duration: 30, id: 'b' })]), prev);
    expect(records.longest_workout?.value).toBe(30);
  });

  it('keeps the original timestamp when the top value is unchanged', () => {
    const logs = [workout('2026-08-01', { duration: 60 })];
    const prev = computePRs(stateWith(logs), {}).records;
    const { records, newlyBroken } = computePRs(stateWith(logs), prev);

    expect(records.longest_workout?.achievedAt).toBe(prev.longest_workout?.achievedAt);
    expect(newlyBroken).toHaveLength(0);
  });

  it('tracks weekly MEP and workout-count records', () => {
    const { records } = computePRs(
      stateWith([
        workout('2026-08-03', { mep: 300, id: 'a' }),
        workout('2026-08-04', { mep: 400, id: 'b' }),
      ]), {},
    );

    expect(records.highest_weekly_mep?.value).toBe(700);
    expect(records.most_workouts_week?.value).toBe(2);
  });
});

describe('weekly challenges', () => {
  it('buckets a week to its local Monday', () => {
    // Sunday belongs to the week that started the previous Monday.
    expect(getWeekKey(new Date('2026-08-05T12:00:00'))).toBe('2026-08-03');
    expect(getWeekKey(new Date('2026-08-03T00:30:00'))).toBe('2026-08-03');
    expect(getWeekKey(new Date('2026-08-09T23:30:00'))).toBe('2026-08-03');
    expect(getWeekKey(new Date('2026-08-10T00:30:00'))).toBe('2026-08-10');
  });

  it('rotates in three fresh challenges for a new week', () => {
    const fresh = rotateChallenges('2026-08-03', [], 'user-1');

    expect(fresh).toHaveLength(3);
    expect(fresh.every(c => c.weekKey === '2026-08-03')).toBe(true);
    expect(fresh.every(c => c.progress === 0 && !c.completed)).toBe(true);
    expect(new Set(fresh.map(c => c.templateId)).size).toBe(3);
  });

  it('is deterministic per week and user, and differs between users', () => {
    const a1 = rotateChallenges('2026-08-03', [], 'user-1').map(c => c.templateId);
    const a2 = rotateChallenges('2026-08-03', [], 'user-1').map(c => c.templateId);
    const b = rotateChallenges('2026-08-03', [], 'user-2').map(c => c.templateId);

    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
    // Pinned so a change to the hash or the template list is a visible
    // decision — the two scoring tests below rely on this seed producing a
    // `workouts` challenge.
    expect(a1).toEqual(['sparring_3', 'mep_900', 'workouts_6']);
  });

  it('does not re-roll when the current week is already present', () => {
    const first = rotateChallenges('2026-08-03', [], 'user-1');
    expect(rotateChallenges('2026-08-03', first, 'user-1')).toBe(first);
  });

  it('keeps prior weeks as history behind the fresh ones', () => {
    const week1 = rotateChallenges('2026-08-03', [], 'user-1');
    const week2 = rotateChallenges('2026-08-10', week1, 'user-1');

    expect(week2.slice(0, 3).every(c => c.weekKey === '2026-08-10')).toBe(true);
    expect(week2.some(c => c.weekKey === '2026-08-03')).toBe(true);
  });

  it('scores progress from the active week only', () => {
    const challenges = rotateChallenges('2026-08-03', [], 'user-1');
    const state: AppState = {
      ...createDefaultState(),
      workoutLogs: [
        workout('2026-08-03', { id: 'a' }),
        workout('2026-08-04', { id: 'b' }),
        // Previous week — must not count toward this week's target.
        workout('2026-07-30', { id: 'c' }),
      ],
    };

    const { challenges: scored } = recomputeChallengeProgress(challenges, state, '2026-08-03');
    const workoutChallenge = scored.find(c => c.metric === 'workouts');

    expect(workoutChallenge).toBeDefined();
    expect(workoutChallenge!.progress).toBe(2);
  });

  it('reports a challenge as newly completed exactly once', () => {
    const challenges = rotateChallenges('2026-08-03', [], 'user-1')
      .map(c => (c.metric === 'workouts' ? { ...c, target: 2 } : c));
    const state: AppState = {
      ...createDefaultState(),
      workoutLogs: [workout('2026-08-03', { id: 'a' }), workout('2026-08-04', { id: 'b' })],
    };

    const first = recomputeChallengeProgress(challenges, state, '2026-08-03');
    const second = recomputeChallengeProgress(first.challenges, state, '2026-08-03');

    expect(first.newlyCompleted.map(c => c.metric)).toContain('workouts');
    // Re-running must not award the XP a second time.
    expect(second.newlyCompleted).toHaveLength(0);
  });

  it('freezes past-week challenges rather than rescoring them', () => {
    const week1 = rotateChallenges('2026-08-03', [], 'user-1');
    const week2 = rotateChallenges('2026-08-10', week1, 'user-1');
    const state: AppState = {
      ...createDefaultState(),
      workoutLogs: [workout('2026-08-10', { id: 'a' })],
    };

    const { challenges: scored } = recomputeChallengeProgress(week2, state, '2026-08-10');
    const past = scored.filter(c => c.weekKey === '2026-08-03');

    expect(past.every(c => c.progress === 0)).toBe(true);
  });
});
