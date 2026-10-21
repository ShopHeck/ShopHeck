import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOfDay, parseISO } from 'date-fns';
import { createDefaultState } from '../src/utils/storage';
import { computeReadiness, vitalsRatio, VITALS_WEIGHT } from '../src/utils/readiness';
import { HRV_SUPPRESSED_PCT, type HRVBaselineComparison } from '../src/utils/hrvBaseline';
import type { FightCamp, TrainingWeek, WorkoutLog, ConditioningTest, HRVEntry } from '../src/types';

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

function workout(rpe: number, date = '2026-08-02', id = 'workout-1'): WorkoutLog {
  return {
    id,
    campId: camp.id,
    date,
    weekNumber: 1,
    dayLabel: 'Sunday',
    sessionType: 'recovery',
    title: 'Taper movement',
    duration: 30,
    rpe,
    notes: '',
    completed: true,
    createdAt: `${date}T12:00:00.000Z`,
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

  it('snapshots a historical asOf without letting later data leak in', () => {
    // Logging the result 12 days after the fight: the snapshot must describe
    // fight day, so entries dated after the fight cannot move the score.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    const fightDay = endOfDay(parseISO('2026-08-08'));

    const state = createDefaultState();
    state.activeCamp = camp;
    state.camps = [camp];
    state.trainingSchedule = [taperWeek];
    state.workoutLogs = [workout(5)];
    const atFight = computeReadiness(state, fightDay);

    state.workoutLogs = [workout(5), workout(9, '2026-08-15', 'workout-2')];
    const withLaterLog = computeReadiness(state, fightDay);

    expect(atFight?.phase).toBe('Taper');
    expect(withLaterLog?.overall).toBe(atFight?.overall);
    expect(withLaterLog?.breakdown).toEqual(atFight?.breakdown);
  });

  it('ignores future-dated entries on the live dashboard', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const state = createDefaultState();
    state.activeCamp = camp;
    state.camps = [camp];
    state.trainingSchedule = [taperWeek];
    state.workoutLogs = [workout(5)];
    const clean = computeReadiness(state);

    state.workoutLogs = [workout(5), workout(9, '2026-08-06', 'workout-future')];
    const withFutureLog = computeReadiness(state);

    expect(withFutureLog?.overall).toBe(clean?.overall);
    expect(withFutureLog?.breakdown).toEqual(clean?.breakdown);
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

// ─── Recovery vitals ─────────────────────────────────────────────────────────

function hrvReading(date: string, rmssd: number, restingHR?: number): HRVEntry {
  return { id: `hrv-${date}`, campId: camp.id, date, rmssd, restingHR, source: 'camera', createdAt: `${date}T06:00:00.000Z` };
}

/** 8–14 days before the 2026-08-03 clock: the baseline window. */
const HRV_BASELINE = ['2026-07-20', '2026-07-22', '2026-07-24', '2026-07-26'];
/** 0–2 days before: the recent window. */
const HRV_RECENT = ['2026-08-01', '2026-08-02', '2026-08-03'];

function vitalsState() {
  const state = createDefaultState();
  state.activeCamp = camp;
  state.camps = [camp];
  state.trainingSchedule = [taperWeek];
  state.workoutLogs = [workout(5)];
  return state;
}

function comparison(deltaPct: number, deltaBpm?: number): HRVBaselineComparison {
  return {
    source: 'camera', recentMean: 0, baselineMean: 0, deltaPct,
    recentCount: 3, baselineCount: 4, latestDate: '2026-08-03',
    restingHR: deltaBpm === undefined ? null : { recentMean: 0, baselineMean: 0, deltaBpm },
  };
}

/** The blend computeReadiness applies, written with the same arithmetic. */
function blend(base: number, ratio: number): number {
  return Math.min(100, Math.round((1 - VITALS_WEIGHT / 100) * base + VITALS_WEIGHT * ratio));
}

describe('recovery vitals', () => {
  it('leaves readiness exactly as it was until there is an HRV baseline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const without = computeReadiness(vitalsState());

    const state = vitalsState();
    state.hrvEntries = HRV_RECENT.map(d => hrvReading(d, 60, 50)); // recent only — no baseline yet

    expect(computeReadiness(state)).toEqual(without);
    expect(without?.breakdown.some(i => i.label === 'Recovery Vitals')).toBe(false);
  });

  it('blends recovered vitals in at full marks without disturbing the other factors', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const base = computeReadiness(vitalsState())!;

    const state = vitalsState();
    state.hrvEntries = [
      ...HRV_BASELINE.map(d => hrvReading(d, 60, 50)),
      ...HRV_RECENT.map(d => hrvReading(d, 60, 50)),
    ];
    const result = computeReadiness(state)!;

    expect(result.breakdown.find(i => i.label === 'Recovery Vitals')).toEqual({
      label: 'Recovery Vitals',
      score: VITALS_WEIGHT,
      max: VITALS_WEIGHT,
      detail: 'HRV at baseline · resting HR at baseline',
      icon: 'heart',
    });
    expect(result.overall).toBe(blend(base.overall, 1));
    // Every pre-existing factor, and the coverage that grades confidence, is
    // untouched — vitals are added, never substituted.
    expect(result.breakdown.slice(0, -1)).toEqual(base.breakdown);
    expect(result.dataCoverage).toBe(base.dataCoverage);
  });

  it('pulls readiness down when HRV is suppressed and resting HR is up', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T12:00:00.000Z'));
    const base = computeReadiness(vitalsState())!;

    const state = vitalsState();
    state.hrvEntries = [
      ...HRV_BASELINE.map(d => hrvReading(d, 60, 50)),
      ...HRV_RECENT.map(d => hrvReading(d, 45, 58)), // −25% HRV, +8 bpm
    ];
    const result = computeReadiness(state)!;
    const vitals = result.breakdown.find(i => i.label === 'Recovery Vitals');
    const ratio = vitalsRatio(comparison(-25, 8));

    expect(ratio).toBeCloseTo(0.2);
    expect(vitals?.score).toBe(3);
    expect(vitals?.detail).toBe('HRV 25% below baseline · resting HR up 8 bpm');
    expect(result.overall).toBe(blend(base.overall, ratio));
    expect(result.overall).toBeLessThan(base.overall);
    expect(result.insights.join(' ')).toContain('HRV is 25% below your baseline and resting heart rate is up');
  });

  it('cannot move the score more than its weight in either direction', () => {
    for (const base of [0, 40, 75, 100]) {
      for (const ratio of [0, 0.2, 0.45, 1]) {
        expect(Math.abs(blend(base, ratio) - base)).toBeLessThanOrEqual(VITALS_WEIGHT);
      }
    }
  });

  it('keeps vitals logged after a historical snapshot out of it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    // A snapshot before the recent readings existed has no baseline comparison
    // to make, so it must match a state with no vitals at all.
    const asOf = endOfDay(parseISO('2026-07-28'));
    const state = vitalsState();
    state.hrvEntries = [
      ...HRV_BASELINE.map(d => hrvReading(d, 60, 50)),
      ...HRV_RECENT.map(d => hrvReading(d, 45, 58)),
    ];
    expect(computeReadiness(state, asOf)).toEqual(computeReadiness(vitalsState(), asOf));
  });
});

describe('vitalsRatio', () => {
  it('bands HRV on the same suppression line camp adaptation uses', () => {
    expect(vitalsRatio(comparison(5))).toBe(1);
    expect(vitalsRatio(comparison(-3))).toBe(1);
    expect(vitalsRatio(comparison(-4))).toBe(0.75);
    // Adaptation proposes a deload at HRV_SUPPRESSED_PCT; readiness must read
    // that same week as markedly below full marks, not as recovered.
    expect(vitalsRatio(comparison(HRV_SUPPRESSED_PCT))).toBe(0.45);
    expect(vitalsRatio(comparison(-16))).toBe(0.2);
  });

  it('folds resting HR in at 30% when the source recorded it', () => {
    expect(vitalsRatio(comparison(0, 2))).toBe(1);
    expect(vitalsRatio(comparison(0, 5))).toBeCloseTo(0.7 + 0.3 * 0.45);
    expect(vitalsRatio(comparison(-25, 8))).toBeCloseTo(0.2);
  });
});
