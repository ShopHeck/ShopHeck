import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultState } from '../src/utils/storage';
import { computeReadiness } from '../src/utils/readiness';
import type { FightCamp, TrainingWeek, WorkoutLog, ConditioningTest } from '../src/types';

const camp: FightCamp = {
  id: 'camp-1',
  fightDate: '2026-08-08',
  weightClass: 'Lightweight',
  currentWeight: 160,
  targetWeight: 155,
  rounds: 3,
  roundDuration: 3,
  sport: 'Boxing',
  experienceLevel: 'Amateur',
  campWeeks: 1,
  startDate: '2026-08-01',
  createdAt: '2026-08-01T12:00:00.000Z',
};

const taperWeek: TrainingWeek = {
  weekNumber: 1,
  startDate: '2026-07-27',
  endDate: '2026-08-02',
  phase: 'Taper',
  focus: 'Recover and sharpen',
  intensity: 'Low',
  weeklyGoals: ['Recover'],
  days: [
    {
      dayOfWeek: 1,
      label: 'Monday',
      sessions: [{ type: 'recovery', title: 'Mobility', duration: 30, description: 'Easy work' }],
      isRestDay: false,
    },
  ],
};

function workout(rpe: number): WorkoutLog {
  return {
    id: 'workout-1',
    campId: camp.id,
    date: '2026-08-02',
    weekNumber: 1,
    dayLabel: 'Sunday',
    sessionType: 'recovery',
    title: 'Taper movement',
    duration: 30,
    rpe,
    notes: '',
    completed: true,
    createdAt: '2026-08-02T12:00:00.000Z',
  };
}

function conditioning(id: string, value: number, date: string): ConditioningTest {
  return {
    id,
    campId: camp.id,
    date,
    weekNumber: 1,
    testType: '1-Mile Run',
    value,
    unit: 'minutes',
    notes: '',
    createdAt: `${date}T12:00:00.000Z`,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('phase-aware readiness', () => {
  it('treats recovery-range RPE as correct during taper', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const state = createDefaultState();
    state.activeCamp = camp;
    state.camps = [camp];
    state.trainingSchedule = [taperWeek];
    state.workoutLogs = [workout(5)];

    const result = computeReadiness(state);
    const quality = result?.breakdown.find(item => item.label === 'Session Quality');

    expect(result?.phase).toBe('Taper');
    expect(quality?.score).toBe(quality?.max);
    expect(quality?.detail).toContain('on target for Taper');
  });

  it('does not penalize or recommend sparring when taper prescribes none', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const state = createDefaultState();
    state.activeCamp = camp;
    state.camps = [camp];
    state.trainingSchedule = [taperWeek];
    state.workoutLogs = [workout(5)];

    const result = computeReadiness(state);
    const sparring = result?.breakdown.find(item => item.label === 'Sparring');

    expect(sparring?.score).toBe(sparring?.max);
    expect(sparring?.detail).toContain('No sparring prescribed');
    expect(result?.insights.join(' ')).not.toContain('coordinate the next live-work session');
  });

  it('scores a faster repeated run as conditioning improvement', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const state = createDefaultState();
    state.activeCamp = camp;
    state.camps = [camp];
    state.trainingSchedule = [taperWeek];
    state.workoutLogs = [workout(5)];
    state.conditioningTests = [
      conditioning('test-1', 8, '2026-07-20'),
      conditioning('test-2', 7.5, '2026-08-02'),
    ];

    const result = computeReadiness(state);
    const conditioningScore = result?.breakdown.find(item => item.label === 'Conditioning');

    expect(conditioningScore?.score).toBe(conditioningScore?.max);
    expect(conditioningScore?.detail).toContain('improved');
  });
});
