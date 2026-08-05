import { beforeEach, describe, expect, it, vi } from 'vitest';

// A chainable stand-in for the Supabase query builder that records the ORDER BY
// and the .range() pages each table is pulled with. pullState's ordering is
// load-bearing (see the active-camp test below), and it can only be pinned at
// the query itself. Rows can be seeded per table to exercise pagination:
// selectAll pages PAGE_SIZE (1,000) rows at a time, so a seed of >1,000 rows
// must force a second request for the tail.
const mock = vi.hoisted(() => {
  const orders: { table: string; column: string; ascending: boolean | undefined }[] = [];
  const ranges: { table: string; from: number; to: number }[] = [];
  const rowsByTable: Record<string, unknown[]> = {};
  const client = {
    from(table: string) {
      // Range state is per builder instance, so each query pages independently.
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        order: (column: string, opts?: { ascending?: boolean }) => {
          orders.push({ table, column, ascending: opts?.ascending });
          return q;
        },
        range: (f: number, t: number) => {
          from = f;
          to = t;
          ranges.push({ table, from: f, to: t });
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        // Thenable, so `await`/Promise.all resolve it like a real query.
        // Serves the seeded rows sliced by the last .range() call — exactly
        // what PostgREST does with Range/from/to.
        then: (resolve: (v: unknown) => unknown) => {
          const all = rowsByTable[table] ?? [];
          const page = all.slice(from, to + 1);
          return Promise.resolve({ data: page, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { orders, ranges, rowsByTable, client };
});

vi.mock('../src/lib/supabase', () => ({ supabase: mock.client }));

import { mergeCloud, pullState, type CloudSnapshot } from '../src/lib/sync';
import { createDefaultState } from '../src/utils/storage';
import type {
  AiAnalysis, AiAnalysisKind, AppState, CampAdaptation, CornerSession, FightCamp,
  FighterProfile, FightResult, GamePlan, WorkoutLog,
} from '../src/types';

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
    coachNotes: [],
    gamePlans: {},
    completedSessions: {},
    dayOverrides: {},
    gamification: null,
    dashboardPrefs: null,
    fitbitConfig: null,
    campAdaptations: [],
    dismissedAdaptations: [],
    cornerSessions: [],
    aiAnalyses: {},
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
        'camps', 'coach_notes', 'conditioning_tests', 'fight_results', 'hrv_entries',
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
        // Coach notes are keyed by fighter_id rather than user_id, but they
        // are still a prepend-convention list and must come back newest-first.
        'coach_notes',
      ]) {
        expect(byTable[table].ascending, `${table} must be newest-first`).toBe(false);
      }
    });
  });
});

describe('pullState — pagination', () => {
  beforeEach(() => {
    mock.ranges.length = 0;
    for (const k of Object.keys(mock.rowsByTable)) delete mock.rowsByTable[k];
  });

  it('requests every list table with an explicit first page', () => {
    // Without .range(), PostgREST caps each query at its default page size and
    // silently drops everything past it — see selectAll's docs in sync.ts.
    return pullState('user-1').then(() => {
      const tables = mock.ranges.map(r => r.table).sort();
      expect(tables).toEqual([
        'camps', 'coach_notes', 'conditioning_tests', 'fight_results', 'hrv_entries',
        'nutrition_logs', 'sparring_logs', 'weight_entries', 'workout_logs',
      ]);
      for (const r of mock.ranges) {
        expect(r.from).toBe(0);
        expect(r.to).toBe(999);
      }
    });
  });

  it('fetches rows past the first 1,000 instead of silently truncating them', () => {
    // Regression: a heavy account (daily weigh-ins across many camps) passes
    // the server page size in weight_entries, and an unpaged select would lose
    // every row past #1,000 — the OLDEST rows, furthest down the ORDER BY.
    // Seed 1,004 rows; the pull must issue a second page and surface all 1,004.
    const rows = Array.from({ length: 1004 }, (_, i) => ({
      id: `uuid-w-${i}`,
      camp_id: 'uuid-camp-1',
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      weight: 160 - i * 0.01,
      notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
    }));
    mock.rowsByTable.weight_entries = rows;
    // The resolver mints local ids via makeLocalIdResolver, which needs a
    // stable camp uuid to map; the camp row anchors it.
    mock.rowsByTable.camps = [{
      id: 'uuid-camp-1', user_id: 'user-1', fight_date: null, opponent: null,
      weight_class: 'Lightweight', current_weight: 160, target_weight: 155,
      rounds: 3, round_duration: 3, sport: 'Boxing', experience: 'Amateur',
      camp_weeks: 8, start_date: '2026-01-01', is_off_season: false,
      off_season_goal: null, game_plan: null, completed_sessions: null,
      day_overrides: null, created_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
    }];

    return pullState('user-1').then(res => {
      expect(res.ok).toBe(true);
      const weightPages = mock.ranges.filter(r => r.table === 'weight_entries');
      expect(weightPages.length).toBe(2);
      expect(weightPages[1]).toEqual({ table: 'weight_entries', from: 1000, to: 1999 });
      // All 1,004 rows survive the pull — the four past the page boundary
      // included. Truncation here was the bug this test pins.
      expect(res.snapshot?.weightEntries).toHaveLength(1004);
    });
  });

  it('stops paging once a short page returns', () => {
    // A 3-row table must be a single request, not an infinite page loop.
    mock.rowsByTable.workout_logs = Array.from({ length: 3 }, (_, i) => ({
      id: `uuid-l-${i}`, camp_id: 'uuid-camp-x', date: '2026-02-01',
      week_number: 1, day_label: 'Monday', session_type: 'conditioning',
      title: 'Roadwork', duration: 45, rpe: 7, notes: '', completed: true,
      mep: null, created_at: '2026-02-01T00:00:00.000Z', deleted_at: null,
    }));

    return pullState('user-1').then(res => {
      expect(res.ok).toBe(true);
      const logPages = mock.ranges.filter(r => r.table === 'workout_logs');
      expect(logPages.length).toBe(1);
      expect(res.snapshot?.workoutLogs).toHaveLength(3);
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

describe('mergeCloud — coach notes', () => {
  function note(id: string, fighterId: string, campId = 'camp-1') {
    return {
      id,
      coachId: 'coach-uuid',
      coachName: 'Coach Vega',
      fighterId,
      campId,
      category: 'technique' as const,
      content: 'Keep the jab working.',
      createdAt: '2026-08-01T12:00:00.000Z',
    };
  }

  it('restores a note the coach wrote on their own device', () => {
    const merged = mergeCloud(
      localState({ currentUser: profile('local-1') }),
      snapshot({ coachNotes: [note('n1', 'auth-uuid')] }),
    );
    expect(merged.coachNotes.map(n => n.id)).toEqual(['n1']);
  });

  it('re-points fighterId at the LOCAL profile id', () => {
    // pullState can only stamp the auth uuid. A fighter who onboarded offline
    // keeps their generated local id, and Dashboard selects the note to show
    // with `n.fighterId === currentUser.id` — leaving the uuid on the row syncs
    // the note down correctly and then renders it nowhere.
    const merged = mergeCloud(
      localState({ currentUser: profile('local-1') }),
      snapshot({ coachNotes: [note('n1', 'auth-uuid')] }),
    );
    expect(merged.coachNotes[0].fighterId).toBe('local-1');
  });

  it('leaves fighterId alone when there is no local profile to adopt', () => {
    const merged = mergeCloud(
      localState({ currentUser: null }),
      snapshot({ coachNotes: [note('n1', 'auth-uuid')] }),
    );
    expect(merged.coachNotes[0].fighterId).toBe('auth-uuid');
  });

  it('removes a note the coach retracted', () => {
    const merged = mergeCloud(
      localState({ currentUser: profile('local-1'), coachNotes: [note('n1', 'local-1')] }),
      snapshot({ tombstoned: new Set(['n1']) }),
    );
    expect(merged.coachNotes).toHaveLength(0);
  });

  it('does not resurrect a note this device already dismissed', () => {
    const merged = mergeCloud(
      localState({ currentUser: profile('local-1') }),
      snapshot({
        coachNotes: [note('n1', 'auth-uuid')],
        previouslySynced: new Set(['n1']),
      }),
    );
    expect(merged.coachNotes).toHaveLength(0);
  });

  it('keeps the local copy when a note exists on both sides', () => {
    const local = { ...note('n1', 'local-1'), content: 'local edit' };
    const merged = mergeCloud(
      localState({ currentUser: profile('local-1'), coachNotes: [local] }),
      snapshot({ coachNotes: [note('n1', 'auth-uuid')] }),
    );
    expect(merged.coachNotes).toHaveLength(1);
    expect(merged.coachNotes[0].content).toBe('local edit');
  });
});

// ── The three slices that used to stop at the device ────────────────────────
//
// campAdaptations, cornerSessions and aiAnalyses were local-only: a coach saw
// the unadapted plan for a fighter who had accepted a deload, and a reinstall
// lost every corner-scored fight. They now travel, and they carry local ids —
// which is exactly what makes the merge worth pinning.

function adaptation(id: string, campId: string, weekNumber = 3): CampAdaptation {
  return {
    id,
    campId,
    weekNumber,
    kind: 'deload',
    reasons: ['HRV suppressed'],
    signals: {
      readiness: 52,
      readinessConfidence: 'medium',
      hrvDeltaPct: -12,
      weekAdherencePct: 80,
      avgRpe7d: 8.1,
      sessions7d: 5,
    },
    createdAt: '2026-08-01T12:00:00.000Z',
  };
}

function cornerSession(id: string, campId: string): CornerSession {
  return {
    id,
    campId,
    startedAt: '2026-08-01T20:00:00.000Z',
    totalRounds: 3,
    roundSeconds: 180,
    restSeconds: 60,
    rounds: [],
  };
}

function fightResult(id: string, campId: string): FightResult {
  return {
    id,
    campId,
    fighterId: 'fighter-1',
    fightDate: '2026-08-02',
    opponent: 'Opponent',
    outcome: 'win',
    method: 'decision',
    totalRounds: 3,
    rounds: [],
    stylePlanFollowed: 3,
    overallNotes: '',
    lessons: '',
    createdAt: '2026-08-02T22:00:00.000Z',
  };
}

function analysis(subjectId: string, kind: AiAnalysisKind = 'insights'): AiAnalysis {
  return { kind, subjectId, content: 'text', generatedAt: '2026-08-01T12:00:00.000Z' };
}

describe('mergeCloud — adaptations, corner sessions and analyses', () => {
  it('restores a corner session and an adaptation this device has never seen', () => {
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-06-01')] }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01')],
        campAdaptations: [adaptation('a-1', 'camp-1')],
        cornerSessions: [cornerSession('s-1', 'camp-1')],
      }),
    );

    expect(merged.campAdaptations?.map(a => a.id)).toEqual(['a-1']);
    expect(merged.cornerSessions?.map(s => s.id)).toEqual(['s-1']);
  });

  it('does not resurrect an adaptation reverted on this device', () => {
    // revertAdaptation removed it locally; the id is in previouslySynced, so the
    // still-present cloud row is a stale copy rather than a new record.
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-06-01')], campAdaptations: [] }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01')],
        campAdaptations: [adaptation('a-1', 'camp-1')],
        previouslySynced: new Set(['a-1']),
      }),
    );

    expect(merged.campAdaptations).toEqual([]);
  });

  it('drops records belonging to a camp that did not survive the merge', () => {
    const merged = mergeCloud(
      localState({ camps: [camp('camp-1', '2026-06-01')] }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01'), camp('camp-2', '2026-01-01')],
        previouslySynced: new Set(['camp-2']),
        campAdaptations: [adaptation('a-1', 'camp-1'), adaptation('a-2', 'camp-2')],
        cornerSessions: [cornerSession('s-1', 'camp-1'), cornerSession('s-2', 'camp-2')],
        dismissedAdaptations: ['camp-1:4:recovery', 'camp-2:4:recovery'],
      }),
    );

    expect(merged.campAdaptations?.map(a => a.id)).toEqual(['a-1']);
    expect(merged.cornerSessions?.map(s => s.id)).toEqual(['s-1']);
    expect(merged.dismissedAdaptations).toEqual(['camp-1:4:recovery']);
  });

  it('unions the dismissal list rather than letting one side win', () => {
    // Dismissals have no ids and no tombstones, and undismissing is not an
    // action the app offers — so a key on either side stays dismissed.
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01')],
        dismissedAdaptations: ['camp-1:2:deload'],
      }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01')],
        dismissedAdaptations: ['camp-1:5:intensify', 'camp-1:2:deload'],
      }),
    );

    expect(merged.dismissedAdaptations?.sort()).toEqual([
      'camp-1:2:deload',
      'camp-1:5:intensify',
    ]);
  });

  it('keeps a locally-regenerated analysis over the stored one', () => {
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01')],
        aiAnalyses: { 'insights:camp-1': { ...analysis('camp-1'), content: 'fresh' } },
      }),
      snapshot({
        camps: [camp('camp-1', '2026-06-01')],
        aiAnalyses: { 'insights:camp-1': { ...analysis('camp-1'), content: 'stale' } },
      }),
    );

    expect(merged.aiAnalyses?.['insights:camp-1'].content).toBe('fresh');
  });

  it('drops an analysis whose subject no longer exists', () => {
    // Saved output filed against a camp that was deleted elsewhere would render
    // nowhere and re-upload forever.
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01'), camp('camp-2', '2026-01-01')],
        aiAnalyses: {
          'insights:camp-1': analysis('camp-1'),
          'insights:camp-2': analysis('camp-2'),
        },
      }),
      snapshot({ tombstoned: new Set(['camp-2']) }),
    );

    expect(Object.keys(merged.aiAnalyses ?? {})).toEqual(['insights:camp-1']);
  });

  it('keeps a post-fight analysis, which hangs off a fight and not a camp', () => {
    const merged = mergeCloud(
      localState({
        camps: [camp('camp-1', '2026-06-01')],
        fightResults: [fightResult('f-1', 'camp-1')],
        aiAnalyses: { 'post-fight:f-1': analysis('f-1', 'post-fight') },
      }),
      snapshot({ camps: [camp('camp-1', '2026-06-01')] }),
    );

    expect(Object.keys(merged.aiAnalyses ?? {})).toEqual(['post-fight:f-1']);
  });
});
