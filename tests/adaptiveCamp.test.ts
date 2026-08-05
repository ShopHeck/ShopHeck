import { describe, it, expect } from 'vitest';
import {
  proposeAdaptation,
  applyAdaptations,
  readAdaptationSignals,
  hrvDeltaPct,
  adaptationKey,
} from '../src/utils/adaptiveCamp';
import { generateTrainingCamp } from '../src/utils/campGenerator';
import { weekSessionKeys } from '../src/utils/adherence';
import { createDefaultState } from '../src/utils/storage';
import type { AppState, CampAdaptation, FightCamp, HRVEntry, WorkoutLog } from '../src/types';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function camp(overrides: Partial<FightCamp> = {}): FightCamp {
  return {
    id: 'camp-1',
    weightClass: 'Lightweight',
    currentWeight: 165,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 5,
    sport: 'MMA',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    // Week 1 starts here; NOW lands mid-camp rather than in the taper.
    startDate: '2026-02-02',
    createdAt: '2026-02-02T00:00:00.000Z',
    fightDate: '2026-03-30',
    ...overrides,
  };
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBefore(n: number): string {
  return iso(new Date(NOW.getTime() - n * 86400000));
}

function hrv(date: string, rmssd: number): HRVEntry {
  return { id: `h-${date}-${rmssd}`, campId: 'camp-1', date, rmssd, source: 'manual', createdAt: `${date}T06:00:00.000Z` };
}

function workout(date: string, rpe: number): WorkoutLog {
  return {
    id: `w-${date}-${rpe}`,
    campId: 'camp-1',
    date,
    weekNumber: 4,
    dayLabel: 'Monday',
    sessionType: 'conditioning',
    title: 'Roadwork',
    duration: 45,
    rpe,
    notes: '',
    completed: true,
    createdAt: `${date}T12:00:00.000Z`,
  };
}

function stateWith(overrides: Partial<AppState> = {}): AppState {
  const c = (overrides.activeCamp as FightCamp | undefined) ?? camp();
  return {
    ...createDefaultState(),
    activeCamp: c,
    camps: [c],
    trainingSchedule: generateTrainingCamp(c),
    ...overrides,
  };
}

/** Baseline HRV readings comfortably outside the recent window. */
function baseline(rmssd: number): HRVEntry[] {
  return [8, 10, 12, 14].map(d => hrv(daysBefore(d), rmssd));
}

/** Recent HRV readings inside the 5-day window. */
function recent(rmssd: number): HRVEntry[] {
  return [1, 2, 3].map(d => hrv(daysBefore(d), rmssd));
}

/** Enough logged sessions to clear the minimum-signal gate. */
function week(rpe: number): WorkoutLog[] {
  return [1, 2, 3, 4].map(d => workout(daysBefore(d), rpe));
}

describe('hrvDeltaPct', () => {
  it('measures recent HRV against the fighter’s own baseline', () => {
    const state = stateWith({ hrvEntries: [...baseline(100), ...recent(80)] });
    expect(hrvDeltaPct(state, NOW)).toBe(-20);
  });

  it('returns null without enough readings on both sides', () => {
    expect(hrvDeltaPct(stateWith({ hrvEntries: [...baseline(100), hrv(daysBefore(1), 80)] }), NOW)).toBeNull();
    expect(hrvDeltaPct(stateWith({ hrvEntries: recent(80) }), NOW)).toBeNull();
  });

  it('ignores future-dated entries', () => {
    const future = hrv(iso(new Date(NOW.getTime() + 5 * 86400000)), 10);
    const withFuture = stateWith({ hrvEntries: [...baseline(100), ...recent(80), future] });
    expect(hrvDeltaPct(withFuture, NOW)).toBe(-20);
  });

  it('excludes the recent window from the baseline it is compared against', () => {
    // If the recent readings counted toward their own baseline, a suppressed
    // stretch would partly hide itself and the delta would understate.
    const state = stateWith({ hrvEntries: [...baseline(100), ...recent(50)] });
    expect(hrvDeltaPct(state, NOW)).toBe(-50);
  });
});

describe('proposeAdaptation — staying quiet', () => {
  it('proposes nothing without an active camp', () => {
    expect(proposeAdaptation({ ...createDefaultState() }, NOW)).toBeNull();
  });

  it('proposes nothing for an off-season plan', () => {
    const c = camp({ isOffSeason: true, fightDate: undefined });
    expect(proposeAdaptation(stateWith({ activeCamp: c, camps: [c] }), NOW)).toBeNull();
  });

  it('proposes nothing on too few logged sessions', () => {
    const state = stateWith({
      hrvEntries: [...baseline(100), ...recent(70)],
      workoutLogs: [workout(daysBefore(1), 9)],
    });
    expect(proposeAdaptation(state, NOW)).toBeNull();
  });

  it('proposes nothing during fight week', () => {
    // Rewriting the plan days out from a fight is never the right answer.
    const c = camp({ fightDate: daysBefore(-4) });
    const state = stateWith({
      activeCamp: c,
      camps: [c],
      hrvEntries: [...baseline(100), ...recent(70)],
      workoutLogs: week(9),
    });
    expect(proposeAdaptation(state, NOW)).toBeNull();
  });

  it('proposes nothing when the fighter is simply training normally', () => {
    const state = stateWith({
      hrvEntries: [...baseline(100), ...recent(101)],
      workoutLogs: week(7.5),
    });
    expect(proposeAdaptation(state, NOW)).toBeNull();
  });
});

describe('proposeAdaptation — intervening', () => {
  it('proposes a deload on suppressed HRV alone', () => {
    const state = stateWith({
      hrvEntries: [...baseline(100), ...recent(85)],
      workoutLogs: week(7.5),
    });
    const p = proposeAdaptation(state, NOW);
    expect(p?.kind).toBe('deload');
    expect(p?.reasons.join(' ')).toContain('below your baseline');
  });

  it('proposes a deload on a week of grinding RPE alone', () => {
    const state = stateWith({ workoutLogs: week(9) });
    expect(proposeAdaptation(state, NOW)?.kind).toBe('deload');
  });

  it('escalates to recovery when two signals agree', () => {
    const state = stateWith({
      hrvEntries: [...baseline(100), ...recent(85)],
      workoutLogs: week(9),
    });
    const p = proposeAdaptation(state, NOW);
    expect(p?.kind).toBe('recovery');
    expect(p?.reasons.length).toBeGreaterThan(1);
  });

  it('never proposes intensify while any warning signal is present', () => {
    // Adding load to a fighter accumulating fatigue is the one failure here
    // with a real injury cost.
    const state = stateWith({
      hrvEntries: [...baseline(100), ...recent(85)],
      workoutLogs: week(6),
    });
    expect(proposeAdaptation(state, NOW)?.kind).not.toBe('intensify');
  });

  it('keys a proposal by camp, week and kind so a dismissal sticks', () => {
    const state = stateWith({ workoutLogs: week(9) });
    const p = proposeAdaptation(state, NOW)!;
    expect(p.key).toBe(adaptationKey(p.campId, p.weekNumber, p.kind));
  });
});

describe('readAdaptationSignals', () => {
  it('reports the RPE mean over the last 7 days only', () => {
    const state = stateWith({
      workoutLogs: [...week(8), workout(daysBefore(30), 2)],
    });
    expect(readAdaptationSignals(state, NOW).avgRpe7d).toBe(8);
    expect(readAdaptationSignals(state, NOW).sessions7d).toBe(4);
  });

  it('reports nulls rather than zeros for a fighter who logs nothing', () => {
    const s = readAdaptationSignals(stateWith(), NOW);
    expect(s.avgRpe7d).toBeNull();
    expect(s.hrvDeltaPct).toBeNull();
    expect(s.sessions7d).toBe(0);
  });
});

describe('applyAdaptations — shape preservation', () => {
  function adaptation(kind: CampAdaptation['kind'], weekNumber = 4): CampAdaptation {
    return {
      id: `a-${kind}`,
      campId: 'camp-1',
      weekNumber,
      kind,
      reasons: ['test'],
      signals: {
        readiness: null, readinessConfidence: 'low', hrvDeltaPct: null,
        weekAdherencePct: null, avgRpe7d: null, sessions7d: 0,
      },
      createdAt: '2026-03-01T00:00:00.000Z',
    };
  }

  const base = generateTrainingCamp(camp());

  function keysOf(weeks: typeof base): string[] {
    return weeks.flatMap(w => weekSessionKeys('camp-1', w));
  }

  it.each(['recovery', 'deload', 'intensify'] as const)(
    'leaves every session key untouched (%s)',
    kind => {
      // The invariant the whole design rests on: adherence keys ticks on
      // `${campId}-${week}-${day}-${index}`, so changing a week's shape would
      // orphan the fighter's ticks and make a coach's adherence figure
      // disagree with their fighter's.
      const adapted = applyAdaptations(base, [adaptation(kind)]);
      expect(keysOf(adapted)).toEqual(keysOf(base));
    },
  );

  it('preserves rest days exactly', () => {
    const adapted = applyAdaptations(base, [adaptation('recovery')]);
    for (let i = 0; i < base.length; i++) {
      expect(adapted[i].days.map(d => d.isRestDay)).toEqual(base[i].days.map(d => d.isRestDay));
    }
  });

  it('only touches the week it names', () => {
    const adapted = applyAdaptations(base, [adaptation('deload', 4)]);
    for (const w of adapted) {
      if (w.weekNumber === 4) continue;
      expect(w).toEqual(base.find(b => b.weekNumber === w.weekNumber));
    }
  });

  it('returns the input untouched when there is nothing to apply', () => {
    expect(applyAdaptations(base, [])).toBe(base);
  });
});

describe('applyAdaptations — effect', () => {
  function adaptation(kind: CampAdaptation['kind']): CampAdaptation {
    return {
      id: `a-${kind}`, campId: 'camp-1', weekNumber: 4, kind, reasons: [],
      signals: {
        readiness: null, readinessConfidence: 'low', hrvDeltaPct: null,
        weekAdherencePct: null, avgRpe7d: null, sessions7d: 0,
      },
      createdAt: '2026-03-01T00:00:00.000Z',
    };
  }

  const base = generateTrainingCamp(camp());
  const week4 = base.find(w => w.weekNumber === 4)!;
  const totalDuration = (w: typeof week4) =>
    w.days.flatMap(d => d.sessions).reduce((s, x) => s + x.duration, 0);

  it('reduces total volume on a deload', () => {
    const adapted = applyAdaptations(base, [adaptation('deload')]).find(w => w.weekNumber === 4)!;
    expect(totalDuration(adapted)).toBeLessThan(totalDuration(week4));
  });

  it('increases total volume on an intensify', () => {
    const adapted = applyAdaptations(base, [adaptation('intensify')]).find(w => w.weekNumber === 4)!;
    expect(totalDuration(adapted)).toBeGreaterThan(totalDuration(week4));
  });

  it('takes live sparring out of a recovery week', () => {
    const adapted = applyAdaptations(base, [adaptation('recovery')]).find(w => w.weekNumber === 4)!;
    const sparring = adapted.days.flatMap(d => d.sessions).filter(s => s.type === 'sparring');
    expect(sparring).toHaveLength(0);
  });

  it('applies only the newest adaptation for a week, never both', () => {
    // Two stacked deloads would compound into a week with no training in it.
    const older = { ...adaptation('deload'), id: 'older', createdAt: '2026-03-01T00:00:00.000Z' };
    const newer = { ...adaptation('intensify'), id: 'newer', createdAt: '2026-03-02T00:00:00.000Z' };
    const adapted = applyAdaptations(base, [older, newer]).find(w => w.weekNumber === 4)!;
    expect(totalDuration(adapted)).toBeGreaterThan(totalDuration(week4));
  });
});
