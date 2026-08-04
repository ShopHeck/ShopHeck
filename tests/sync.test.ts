import { beforeEach, describe, expect, it, vi } from 'vitest';

// A chainable stand-in for the Supabase query builder that records the ORDER BY
// each table is pulled with. pullState's ordering is load-bearing (see the
// active-camp test below), and it can only be pinned at the query itself.
const mock = vi.hoisted(() => {
  const orders: { table: string; column: string; ascending: boolean | undefined }[] = [];
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        order: (column: string, opts?: { ascending?: boolean }) => {
          orders.push({ table, column, ascending: opts?.ascending });
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        // Thenable, so `await`/Promise.all resolve it like a real query.
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return q;
    },
  };
  return { orders, client };
});

vi.mock('../src/lib/supabase', () => ({ supabase: mock.client }));

import { mergeCloud, pullState, type CloudSnapshot } from '../src/lib/sync';
import { createDefaultState } from '../src/utils/storage';
import type { AppState, FightCamp, FighterProfile, GamePlan, WorkoutLog } from '../src/types';

// mergeCloud is the highest-risk pure function in the app: it is the only place
// that decides whether a record the user cannot see any more should come back,
// and whether a record they still see should disappear. Its own comments
// document the edge cases; these tests pin them.

function camp(id: string, startDate: string, extra: Partial<FightCamp> = {}): FightCamp {
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
    ...extra,
  };
}

function workout(id: string, campId: string, date = '2026-08-01'): WorkoutLog {
  return {
    id,
    campId,
    date,
    weekNumber: 1,
    dayLabel: 'Monday',
    sessionType: 'conditioning',
    title: 'Roadwork',
    duration: 45,
    rpe: 7,
    notes: '',
    completed: true,
    createdAt: `${date}T12:00:00.000Z`,
  };
}

function profile(id: string, name = 'Fighter'): FighterProfile {
  return {
    id,
    name,
    age: 27,
    sport: 'Boxing',
    weightClass: 'Lightweight',
    experienceLevel: 'Amateur',
    role: 'fighter',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function gamePlan(campId: string, styleNotes: string): GamePlan {
  return {
    campId,
    styleNotes,
    earlyRoundPlan: '',
    midRoundPlan: '',
    lateRoundPlan: '',
    keyTechniques: '',
    thingsToAvoid: '',
    cornerInstructions: '',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

/** An otherwise-empty cloud snapshot, so each test states only what it exercises. */
function snapshot(partial: Partial<CloudSnapshot> = {}): CloudSnapshot {
  return {
    profile: null,
    camps: [],
    workoutLogs: [],
    sparringLogs: [],
    conditioningTests: [],
    weightEntries: [],
    nutritionLogs: [],
    hrvEntries: [],
    fightResults: [],
    gamePlans: {},
    completedSessions: {},
    dayOverrides: {},
    gamification: null,
    dashboardPrefs: null,
    fitbitConfig: null,
    previouslySynced: new Set<string>(),
    tombstoned: new Set<string>(),
    ...partial,
  };
}

function localState(partial: Partial<AppState> = {}): AppState {
  return { ...createDefaultState(), ...partial };
}

describe('pullState — ordering', () => {
  beforeEach(() => { mock.orders.length = 0; });

  it('orders every list query, so array position is never left to Postgres', () => {
    // Without an ORDER BY, Postgres row order is unspecified — and every
    // pushState upsert rewrites its row, so results genuinely scramble as an
    // account is used. Locally this is invisible (adds prepend/append); it only
    // shows up after a cross-device restore.
    return pullState('user-1').then(() => {
      const tables = mock.orders.map(o => o.table).sort();
      expect(tables).toEqual([
        'camps', 'conditioning_tests', 'fight_results', 'hrv_entries',
        'nutrition_logs', 'sparring_logs', 'weight_entries', 'workout_logs',
      ]);
    });
  });

  it('pulls camps ASCENDING and every log table DESCENDING', () => {
    // The direction is not uniform because the local conventions are not:
    // CREATE_CAMP appends (newest LAST), every add* prepends (newest FIRST).
    // Getting camps backwards breaks `camps[camps.length - 1]`, the app-wide
    // idiom for "the current camp".
    return pullState('user-1').then(() => {
      const byTable = Object.fromEntries(mock.orders.map(o => [o.table, o]));

      expect(byTable.camps.ascending).toBe(true);

      for (const table of [
        'workout_logs', 'sparring_logs', 'conditioning_tests',
        'weight_entries', 'nutrition_logs', 'hrv_entries', 'fight_results',
      ]) {
        expect(byTable[table].ascending, `${table} must be newest-first`).toBe(false);
      }
    });
  });
});

describe('mergeCloud — restore', () => {
  it('restores records this device has never seen', () => {
    const c = camp('camp-1', '2026-06-01');
    const merged = mergeCloud(
      localState(),
      snapshot({ camps: [c], workoutLogs: [workout('w-1', 'camp-1')] }),
    );

    expect(merged.camps).toHaveLength(1);
    expect(merged.workoutLogs.map(w => w.id)).toEqual(['w-1']);
  });

  it('keeps the LOCAL copy when a record exists on both sides', () => {
    const local = localState({
      camps: [camp('camp-1', '2026-06-01')],
      workoutLogs: [{ ...workout('w-1', 'camp-1'), notes: 'local edit' }],
    });
    const merged = mergeCloud(
      local,
      snapshot({ workoutLogs: [{ ...workout('w-1', 'camp-1'), notes: 'stale cloud copy' }] }),
    );

    expect(merged.workoutLogs).toHaveLength(1);
    expect(merged.workoutLogs[0].notes).toBe('local edit');
  });

  it('adopts the cloud profile only when there is no local user', () => {
    const cloudProfile = profile('user-1', 'From Cloud');

    const fresh = mergeCloud(localState(), snapshot({ profile: cloudProfile }));
    expect(fresh.currentUser?.name).toBe('From Cloud');
    expect(fresh.fighters.map(f => f.id)).toContain('user-1');

    const existing = mergeCloud(
      localState({ currentUser: profile('user-1', 'Local Name') }),
      snapshot({ profile: cloudProfile }),
    );
    expect(existing.currentUser?.name).toBe('Local Name');
  });

  it('never pulls subscription state — entitlement is owned by the payment webhooks', () => {
    const local = localState({
      subscription: { tier: 'fighter_pro', expiresAt: null, source: 'stripe_server' },
    });
    const merged = mergeCloud(local, snapshot());

    expect(merged.subscription).toEqual({
      tier: 'fighter_pro', expiresAt: null, source: 'stripe_server',
    });
  });
});

describe('mergeCloud — deletes', () => {
  it('does not resurrect a record deleted on THIS device', () => {
    // previouslySynced means "this device had already mapped that local id to a
    // cloud row". Absent from local state now => it was deleted here.
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-06-01')] }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01')],
        workoutLogs: [workout('w-gone', 'camp-1')],
        previouslySynced: new Set(['w-gone']),
      }),
    );

    expect(merged.workoutLogs).toHaveLength(0);
  });

  it('removes a record another device tombstoned', () => {
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01')],
        workoutLogs: [workout('w-1', 'camp-1'), workout('w-2', 'camp-1')],
      }),
      snapshot({ tombstoned: new Set(['w-2']) }),
    );

    expect(merged.workoutLogs.map(w => w.id)).toEqual(['w-1']);
  });

  it('distinguishes never-seen from deleted-here for the same pull', () => {
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-06-01')] }),
      snapshot({
        workoutLogs: [workout('w-new', 'camp-1'), workout('w-deleted', 'camp-1')],
        previouslySynced: new Set(['w-deleted']),
      }),
    );

    expect(merged.workoutLogs.map(w => w.id)).toEqual(['w-new']);
  });
});

describe('mergeCloud — camp-keyed metadata', () => {
  it('drops session/day/game-plan metadata belonging to a camp that did not survive', () => {
    // camp-2 was deleted on this device, so its metadata must not be re-seeded —
    // that would undo half of deleteCamp's cascade on the next pull.
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-06-01')] }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01'), camp('camp-2', '2026-01-01')],
        previouslySynced: new Set(['camp-2']),
        completedSessions: { 'camp-1-1-1-0': true, 'camp-2-1-1-0': true },
        dayOverrides: { 'camp-1-1-1': true, 'camp-2-1-1': true },
        gamePlans: { 'camp-1': gamePlan('camp-1', 'keep'), 'camp-2': gamePlan('camp-2', 'drop') },
      }),
    );

    expect(merged.camps.map(c => c.id)).toEqual(['camp-1']);
    expect(merged.completedSessions).toEqual({ 'camp-1-1-1-0': true });
    expect(merged.dayOverrides).toEqual({ 'camp-1-1-1': true });
    expect(Object.keys(merged.gamePlans)).toEqual(['camp-1']);
  });

  it('filters LOCAL metadata too, when the camp was deleted on another device', () => {
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01'), camp('camp-2', '2026-01-01')],
        completedSessions: { 'camp-1-1-1-0': true, 'camp-2-1-1-0': true },
        gamePlans: { 'camp-2': gamePlan('camp-2', 'orphan') },
      }),
      snapshot({ tombstoned: new Set(['camp-2']) }),
    );

    expect(merged.camps.map(c => c.id)).toEqual(['camp-1']);
    expect(merged.completedSessions).toEqual({ 'camp-1-1-1-0': true });
    expect(merged.gamePlans).toEqual({});
  });

  it('prefix-matches camp ids exactly, so camp-1 metadata is not claimed by camp-10', () => {
    // generateId() ids contain hyphens of their own, so a naive split('-') would
    // mis-assign these.
    const merged = mergeCloud(
      localState({ camps: [camp('camp-10', '2026-06-01')] }),
      snapshot({ completedSessions: { 'camp-1-1-1-0': true, 'camp-10-1-1-0': true } }),
    );

    expect(merged.completedSessions).toEqual({ 'camp-10-1-1-0': true });
  });

  it('lets a local session tick win over a conflicting cloud value', () => {
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01')],
        completedSessions: { 'camp-1-1-1-0': false },
      }),
      snapshot({ completedSessions: { 'camp-1-1-1-0': true } }),
    );

    expect(merged.completedSessions['camp-1-1-1-0']).toBe(false);
  });
});

describe('mergeCloud — active camp', () => {
  it('keeps the local active camp when it still exists', () => {
    const active = camp('camp-2', '2026-06-01');
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-01-01'), active], activeCamp: active }),
      snapshot(),
    );

    expect(merged.activeCamp?.id).toBe('camp-2');
  });

  it('promotes the NEWEST camp when the active one was deleted elsewhere', () => {
    // Regression: pullState orders camps ASCENDING by start_date, because
    // CREATE_CAMP appends and `camps[camps.length - 1]` is the app-wide idiom
    // for "the current camp" (here, deleteCamp's promotion, and CoachDashboard
    // twice). Ordering the pull newest-first silently made every one of those
    // pick the OLDEST camp — a restored multi-camp account would open on a
    // finished camp and regenerate its schedule.
    const oldest = camp('camp-old', '2026-01-01');
    const newest = camp('camp-new', '2026-06-01');
    const stale = camp('camp-stale', '2025-01-01');

    const merged = mergeCloud(
      localState({ activeCamp: stale }),
      // Exactly the order pullState now returns: oldest first, newest last.
      snapshot({ camps: [oldest, newest] }),
    );

    expect(merged.camps.map(c => c.id)).toEqual(['camp-old', 'camp-new']);
    expect(merged.activeCamp?.id).toBe('camp-new');
  });

  it('clears the active camp when nothing survives', () => {
    const only = camp('camp-1', '2026-06-01');
    const merged = mergeCloud(
      localState({ camps: [only], activeCamp: only }),
      snapshot({ tombstoned: new Set(['camp-1']) }),
    );

    expect(merged.camps).toHaveLength(0);
    expect(merged.activeCamp).toBeNull();
  });
});

describe('mergeCloud — dashboardPrefs', () => {
  it('merges per key, so a fresh device does not shadow the account choice', () => {
    // Object-level local-wins would be wrong here: createDefaultState always
    // materializes dashboardPrefs, so a new device's defaults would mask the
    // synced values forever and the next push would overwrite them.
    const merged = mergeCloud(
      localState({ dashboardPrefs: { progressWidgetCollapsed: false, progressWidgetHidden: false } }),
      snapshot({
        dashboardPrefs: {
          progressWidgetCollapsed: true, progressWidgetHidden: false, weightUnit: 'kg',
        },
      }),
    );

    // weightUnit was never chosen locally (undefined), so the account's wins.
    expect(merged.dashboardPrefs?.weightUnit).toBe('kg');
  });

  it('keeps a unit the local device has explicitly chosen', () => {
    const merged = mergeCloud(
      localState({
        dashboardPrefs: {
          progressWidgetCollapsed: false, progressWidgetHidden: false, weightUnit: 'lbs',
        },
      }),
      snapshot({
        dashboardPrefs: {
          progressWidgetCollapsed: false, progressWidgetHidden: false, weightUnit: 'kg',
        },
      }),
    );

    expect(merged.dashboardPrefs?.weightUnit).toBe('lbs');
  });
});
