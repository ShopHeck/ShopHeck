import { describe, expect, it } from 'vitest';
import {
  campAdherence,
  scheduleAdherence,
  sessionKey,
  weekAdherence,
  weekSessionKeys,
} from '../src/utils/adherence';
import { createDefaultState } from '../src/utils/storage';
import { generateTrainingCamp } from '../src/utils/campGenerator';
import type { AppState, FightCamp, TrainingWeek } from '../src/types';

function week(weekNumber: number, days: TrainingWeek['days']): TrainingWeek {
  return {
    weekNumber,
    startDate: '2026-08-03',
    endDate: '2026-08-09',
    phase: 'Base Building',
    focus: 'Build',
    intensity: 'Medium',
    weeklyGoals: [],
    days,
  };
}

function day(
  dayOfWeek: number,
  sessionTypes: string[],
  isRestDay = false,
): TrainingWeek['days'][number] {
  return {
    dayOfWeek,
    label: `Day ${dayOfWeek}`,
    isRestDay,
    sessions: sessionTypes.map(type => ({
      type: type as TrainingWeek['days'][number]['sessions'][number]['type'],
      title: `${type} session`,
      duration: 45,
      description: '',
    })),
  };
}

describe('sessionKey', () => {
  it('matches the shape WeeklyPlanner persists', () => {
    // This is the persisted identity of a tick — changing the shape orphans
    // every existing one, so it is pinned rather than left implicit.
    expect(sessionKey('camp-1', 3, 5, 2)).toBe('camp-1-3-5-2');
  });
});

describe('weekSessionKeys', () => {
  it('numbers sessions by their index in the full day array', () => {
    const w = week(1, [day(1, ['conditioning', 'skill']), day(2, ['sparring'])]);

    expect(weekSessionKeys('camp-1', w)).toEqual([
      'camp-1-1-1-0', 'camp-1-1-1-1', 'camp-1-1-2-0',
    ]);
  });

  it('skips rest DAYS entirely', () => {
    const w = week(1, [day(1, ['conditioning']), day(2, ['conditioning'], true)]);
    expect(weekSessionKeys('camp-1', w)).toEqual(['camp-1-1-1-0']);
  });

  it("counts a 'rest'-TYPE session inside a working day", () => {
    // The key builder indexes the whole sessions array, so excluding these from
    // the denominator (as OffSeasonDashboard used to) let `done` exceed
    // `planned`.
    const w = week(1, [day(1, ['conditioning', 'rest'])]);

    expect(weekSessionKeys('camp-1', w)).toEqual(['camp-1-1-1-0', 'camp-1-1-1-1']);
  });
});

describe('weekAdherence', () => {
  const w = week(1, [day(1, ['conditioning', 'skill']), day(2, ['sparring'])]);

  it('scores ticked against planned', () => {
    const score = weekAdherence({ 'camp-1-1-1-0': true, 'camp-1-1-2-0': true }, 'camp-1', w);
    expect(score).toEqual({ done: 2, planned: 3, pct: 67 });
  });

  it('ignores a tick explicitly set false', () => {
    const score = weekAdherence({ 'camp-1-1-1-0': false }, 'camp-1', w);
    expect(score.done).toBe(0);
  });

  it('ignores ticks whose session no longer exists', () => {
    // Regression: the schedule is regenerated on every camp edit, so shrinking a
    // week leaves orphaned `true` entries. The old prefix scan counted them and
    // the dashboard could render "7/5 sessions this week".
    const score = weekAdherence(
      {
        'camp-1-1-1-0': true,
        'camp-1-1-5-0': true, // a day that no longer exists
        'camp-1-1-1-9': true, // a session index that no longer exists
      },
      'camp-1',
      w,
    );

    expect(score.done).toBe(1);
    expect(score.done).toBeLessThanOrEqual(score.planned);
  });

  it('ignores ticks belonging to another camp', () => {
    const score = weekAdherence({ 'camp-2-1-1-0': true }, 'camp-1', w);
    expect(score.done).toBe(0);
  });

  it('does not confuse camp-1 with camp-10', () => {
    const score = weekAdherence({ 'camp-10-1-1-0': true }, 'camp-1', w);
    expect(score.done).toBe(0);
  });

  it('reports null rather than 0% when nothing is planned', () => {
    // "No schedule to measure against" is not "you missed everything" — the
    // consumers that generate advice and tune weights depend on the difference.
    expect(weekAdherence({}, 'camp-1', undefined)).toEqual({ done: 0, planned: 0, pct: null });
    expect(weekAdherence({}, 'camp-1', week(1, [day(1, [], true)])).pct).toBeNull();
  });

  it('reports 0 when sessions are planned and none are ticked', () => {
    expect(weekAdherence({}, 'camp-1', w).pct).toBe(0);
  });
});

describe('scheduleAdherence', () => {
  it('sums across every week', () => {
    const schedule = [
      week(1, [day(1, ['conditioning']), day(2, ['skill'])]),
      week(2, [day(1, ['conditioning'])]),
    ];
    const score = scheduleAdherence(
      { 'camp-1-1-1-0': true, 'camp-1-2-1-0': true },
      'camp-1',
      schedule,
    );

    expect(score).toEqual({ done: 2, planned: 3, pct: 67 });
  });
});

describe('campAdherence', () => {
  function camp(id: string): FightCamp {
    return {
      id,
      fightDate: '2026-10-01',
      weightClass: 'Lightweight',
      currentWeight: 160,
      targetWeight: 155,
      rounds: 3,
      roundDuration: 3,
      sport: 'Boxing',
      experienceLevel: 'Amateur',
      campWeeks: 8,
      startDate: '2026-08-03',
      createdAt: '2026-08-03T00:00:00.000Z',
    };
  }

  it('scores a past camp by rebuilding its schedule', () => {
    // state.trainingSchedule only ever holds the ACTIVE camp's weeks, so a camp
    // comparison has to regenerate. generateTrainingCamp is deterministic, so
    // the rebuilt weeks are the ones the fighter ticked against.
    const past = camp('camp-past');
    const active = camp('camp-active');
    const state: AppState = {
      ...createDefaultState(),
      camps: [past, active],
      activeCamp: active,
      trainingSchedule: [],
    };

    const score = campAdherence(state, 'camp-past');

    expect(score.planned).toBeGreaterThan(0);
    expect(score.pct).toBe(0); // nothing ticked
  });

  it('counts ticks against the rebuilt schedule', () => {
    const past = camp('camp-past');
    const state: AppState = { ...createDefaultState(), camps: [past], activeCamp: null };

    // Tick whatever the generator actually produced for week 1.
    const schedule = generateTrainingCamp(past);
    const keys = weekSessionKeys('camp-past', schedule[0]);
    const completedSessions = Object.fromEntries(keys.slice(0, 2).map(k => [k, true]));

    const score = campAdherence({ ...state, completedSessions }, 'camp-past');

    expect(score.done).toBe(Math.min(2, keys.length));
    expect(score.planned).toBeGreaterThanOrEqual(keys.length);
  });

  it('returns null for a camp that does not exist', () => {
    const state: AppState = { ...createDefaultState() };
    expect(campAdherence(state, 'nope')).toEqual({ done: 0, planned: 0, pct: null });
  });
});
