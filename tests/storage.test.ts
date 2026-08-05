import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultState,
  deleteCamp,
  loadState,
  saveState,
} from '../src/utils/storage';
import { defaultGamificationState } from '../src/utils/gamification';
import type { AppState, FightCamp } from '../src/types';

const STORAGE_KEY = 'fightcamp_app';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

// loadState/saveState read the global directly rather than taking an injectable
// store, so the global is what has to be replaced.
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

function camp(id: string, startDate: string): FightCamp {
  return {
    id,
    weightClass: 'Lightweight',
    currentWeight: 160,
    targetWeight: 155,
    rounds: 3,
    roundDuration: 3,
    sport: 'Boxing',
    experienceLevel: 'Amateur',
    campWeeks: 8,
    startDate,
    createdAt: `${startDate}T12:00:00.000Z`,
  };
}

/** A state carrying one row in every camp-scoped collection, for both camps. */
function twoCampState(): AppState {
  const a = camp('camp-1', '2026-01-01');
  const b = camp('camp-2', '2026-06-01');
  const row = (campId: string, id: string) => ({ id, campId, date: '2026-06-02' });

  return {
    ...createDefaultState(),
    camps: [a, b],
    activeCamp: b,
    workoutLogs: [
      { ...row('camp-1', 'w-1'), weekNumber: 1, dayLabel: 'Mon', sessionType: 'conditioning',
        title: 'Run', duration: 30, rpe: 6, notes: '', completed: true, createdAt: 'x' },
      { ...row('camp-2', 'w-2'), weekNumber: 1, dayLabel: 'Mon', sessionType: 'conditioning',
        title: 'Run', duration: 30, rpe: 6, notes: '', completed: true, createdAt: 'x' },
    ],
    sparringLogs: [
      { ...row('camp-1', 's-1'), weekNumber: 1, rounds: 3, roundDuration: 3, partnerName: 'A',
        partnerLevel: 'Similar', focus: '', performance: 3, notes: '', createdAt: 'x' },
    ],
    conditioningTests: [
      { ...row('camp-1', 'c-1'), weekNumber: 1, testType: 'Beep', value: 10, unit: 'lvl',
        notes: '', createdAt: 'x' },
    ],
    weightEntries: [{ ...row('camp-1', 'e-1'), weight: 160, notes: '', createdAt: 'x' }],
    nutritionLogs: [{ ...row('camp-1', 'n-1'), waterOz: 64, mealRatings: {}, createdAt: 'x' }],
    hrvEntries: [{ ...row('camp-1', 'h-1'), rmssd: 60, source: 'manual', createdAt: 'x' }],
    fightResults: [
      { ...row('camp-1', 'f-1'), fighterId: 'me', fightDate: '2026-06-02', opponent: 'X',
        outcome: 'win', method: 'decision', totalRounds: 3, rounds: [], stylePlanFollowed: 3,
        overallNotes: '', lessons: '', createdAt: 'x' },
    ],
    gamePlans: {
      'camp-1': { campId: 'camp-1', styleNotes: 'a', earlyRoundPlan: '', midRoundPlan: '',
        lateRoundPlan: '', keyTechniques: '', thingsToAvoid: '', cornerInstructions: '',
        updatedAt: 'x' },
      'camp-2': { campId: 'camp-2', styleNotes: 'b', earlyRoundPlan: '', midRoundPlan: '',
        lateRoundPlan: '', keyTechniques: '', thingsToAvoid: '', cornerInstructions: '',
        updatedAt: 'x' },
    },
    completedSessions: { 'camp-1-1-1-0': true, 'camp-2-1-1-0': true },
    dayOverrides: { 'camp-1-1-1': true, 'camp-2-1-1': true },
  } as AppState;
}

describe('deleteCamp — cascade', () => {
  it('removes the camp and every row scoped to it', () => {
    const next = deleteCamp(twoCampState(), 'camp-1');

    expect(next.camps.map(c => c.id)).toEqual(['camp-2']);
    // Rows belonging to a camp the fighter can no longer see used to survive and
    // keep feeding streaks, achievements and cloud pushes.
    expect(next.workoutLogs.map(r => r.id)).toEqual(['w-2']);
    expect(next.sparringLogs).toHaveLength(0);
    expect(next.conditioningTests).toHaveLength(0);
    expect(next.weightEntries).toHaveLength(0);
    expect(next.nutritionLogs).toHaveLength(0);
    expect(next.hrvEntries).toHaveLength(0);
    expect(next.fightResults).toHaveLength(0);
  });

  it('drops the camp-keyed maps and game plan', () => {
    const next = deleteCamp(twoCampState(), 'camp-1');

    expect(next.completedSessions).toEqual({ 'camp-2-1-1-0': true });
    expect(next.dayOverrides).toEqual({ 'camp-2-1-1': true });
    expect(Object.keys(next.gamePlans)).toEqual(['camp-2']);
  });

  it('matches camp-key prefixes exactly, so camp-1 does not take camp-10 with it', () => {
    const state = {
      ...createDefaultState(),
      camps: [camp('camp-1', '2026-01-01'), camp('camp-10', '2026-06-01')],
      completedSessions: { 'camp-1-1-1-0': true, 'camp-10-1-1-0': true },
      dayOverrides: { 'camp-1-1-1': true, 'camp-10-1-1': true },
    } as AppState;

    const next = deleteCamp(state, 'camp-1');

    expect(next.completedSessions).toEqual({ 'camp-10-1-1-0': true });
    expect(next.dayOverrides).toEqual({ 'camp-10-1-1': true });
  });

  it('promotes the newest remaining camp when the active one is deleted', () => {
    // camps[camps.length - 1] is the app-wide "current camp" idiom, and
    // CREATE_CAMP appends — so the last entry is the newest.
    const next = deleteCamp(twoCampState(), 'camp-2');

    expect(next.activeCamp?.id).toBe('camp-1');
  });

  it('leaves the active camp alone when a different camp is deleted', () => {
    const next = deleteCamp(twoCampState(), 'camp-1');
    expect(next.activeCamp?.id).toBe('camp-2');
  });

  it('clears the active camp when the last one is deleted', () => {
    const single = { ...createDefaultState(), camps: [camp('camp-1', '2026-01-01')],
      activeCamp: camp('camp-1', '2026-01-01') } as AppState;

    expect(deleteCamp(single, 'camp-1').activeCamp).toBeNull();
  });
});

describe('loadState — upgrade path', () => {
  // createDefaultState() stamps gamification.belt.achievedAt.white with
  // new Date(), so the two calls in `expect(loadState()).toEqual(
  // createDefaultState())` disagree by a millisecond whenever they land either
  // side of a tick — the suite then fails on a one-digit diff in a timestamp
  // neither case is about. Freeze the clock so these compare the document's
  // shape, which is what they are checking.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns defaults with no stored document', () => {
    expect(loadState()).toEqual(createDefaultState());
  });

  it('returns defaults rather than throwing on a corrupt document', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    expect(loadState()).toEqual(createDefaultState());
  });

  it('back-fills nested gamification keys added after the document was written', () => {
    // Regression: a top-level spread replaces the whole slice, so a document
    // predating `challenges` kept its old shape and ProgressWidget threw on
    // `gam.challenges.filter(...)`.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      gamification: {
        belt: defaultGamificationState().belt,
        streak: defaultGamificationState().streak,
        achievements: [],
        // challenges, personalRecords, totalXp, pendingCelebrations all absent.
      },
    }));

    const loaded = loadState();

    expect(Array.isArray(loaded.gamification?.challenges)).toBe(true);
    expect(loaded.gamification?.personalRecords).toEqual({});
    expect(loaded.gamification?.totalXp).toBe(0);
    expect(Array.isArray(loaded.gamification?.pendingCelebrations)).toBe(true);
  });

  it('back-fills dashboardPrefs and subscription keys', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      dashboardPrefs: { progressWidgetCollapsed: true },
      subscription: { tier: 'fighter_pro' },
    }));

    const loaded = loadState();

    expect(loaded.dashboardPrefs?.progressWidgetCollapsed).toBe(true);
    expect(loaded.dashboardPrefs?.progressWidgetHidden).toBe(false);
    expect(loaded.subscription.tier).toBe('fighter_pro');
    expect(loaded.subscription.source).toBeDefined();
  });

  it('leaves weightUnit undefined when it was never chosen', () => {
    // "Never chosen" is meaningful state: it is what lets mergeCloud restore the
    // account's synced unit on a fresh device. Defaulting it here would stamp an
    // explicit choice the user never made.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      dashboardPrefs: { progressWidgetCollapsed: false, progressWidgetHidden: false },
    }));

    expect(loadState().dashboardPrefs?.weightUnit).toBeUndefined();
  });

  it('preserves a stored weightUnit', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      dashboardPrefs: { progressWidgetCollapsed: false, progressWidgetHidden: false, weightUnit: 'kg' },
    }));

    expect(loadState().dashboardPrefs?.weightUnit).toBe('kg');
  });

  it('round-trips a saved state', () => {
    const state = twoCampState();
    saveState(state);

    const loaded = loadState();

    expect(loaded.camps.map(c => c.id)).toEqual(['camp-1', 'camp-2']);
    expect(loaded.activeCamp?.id).toBe('camp-2');
    expect(loaded.workoutLogs).toHaveLength(2);
  });
});
