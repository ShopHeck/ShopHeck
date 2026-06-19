import { supabase } from './supabase';
import { generateId } from '../utils/storage';
import type { Database } from './database.types';
import type {
  AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest,
  WeightEntry, NutritionLog, HRVEntry, FightResult, GamePlan, GamificationState,
  DashboardPrefs, FitbitConfig, MacroEntry, CampFactorWeights, FightRound,
  Sport, WeightClass, ExperienceLevel, UserRole, SessionType, OffSeasonGoal, HRVSource,
  SubscriptionState,
} from '../types';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

/**
 * Phase 3a — push-only cloud sync (device → Supabase).
 *
 * This deliberately only WRITES to the cloud; it never mutates local state, so
 * it cannot corrupt the local-first store. It exists to (a) back up the signed-in
 * fighter's data and (b) populate the rows a linked coach reads via RLS.
 * Pull / last-write-wins merge is a separate, later phase.
 *
 * Local records use short non-UUID ids; Supabase PKs are uuid. We keep a stable
 * localId -> uuid map in localStorage so repeated pushes upsert the same rows and
 * foreign keys (camp_id) stay consistent. Local data is never rewritten.
 */

type Ins<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];

const IDMAP_KEY = 'fightcamp_sync_idmap';

function loadIdMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(IDMAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveIdMap(map: Record<string, string>): void {
  try { localStorage.setItem(IDMAP_KEY, JSON.stringify(map)); } catch { /* noop */ }
}

/** Stable uuid for a local id, minted once and persisted. */
function makeUuidFor(map: Record<string, string>) {
  return (localId: string): string => {
    let uuid = map[localId];
    if (!uuid) {
      uuid = crypto.randomUUID();
      map[localId] = uuid;
    }
    return uuid;
  };
}

/** Best-effort timestamp for last-write-wins on the server side. */
function ts(record: { createdAt?: string }, fallback: string): string {
  return record.createdAt ?? fallback;
}

export interface PushResult {
  ok: boolean;
  pushed: number;
  error?: string;
}

/**
 * Upsert the signed-in user's local state into Supabase. `userId` is the auth
 * user id; the profile row's PK must equal it to satisfy RLS.
 */
export async function pushState(userId: string, state: AppState): Promise<PushResult> {
  if (!supabase) return { ok: false, pushed: 0, error: 'Cloud sync is not configured.' };

  const map = loadIdMap();
  const uuidFor = makeUuidFor(map);
  const now = new Date().toISOString();
  let pushed = 0;

  // Only push camps that exist locally; log rows that reference a missing camp
  // are skipped so we never violate the camp_id foreign key.
  const localCamps: FightCamp[] = state.camps ?? [];
  const validCampUuids = new Set(localCamps.map(c => uuidFor(c.id)));

  const run = async <T extends keyof Database['public']['Tables']>(
    table: T,
    rows: Ins<T>[],
    onConflict = 'id',
  ): Promise<string | null> => {
    if (rows.length === 0) return null;
    const { error } = await supabase!.from(table).upsert(rows as never, { onConflict });
    if (error) return `${String(table)}: ${error.message}`;
    pushed += rows.length;
    return null;
  };

  try {
    // 1) Profile (id MUST be the auth user id for RLS).
    const me = state.currentUser;
    if (me) {
      const row: Ins<'profiles'> = {
        id: userId,
        name: me.name,
        age: me.age,
        sport: me.sport,
        weight_class: me.weightClass,
        experience: me.experienceLevel,
        role: me.role,
        gym: me.gym ?? null,
        record: me.record ?? null,
        avatar_url: me.avatar ?? null,
        macro_targets: (me.macroTargets ?? null) as unknown as Ins<'profiles'>['macro_targets'],
        max_hr: me.maxHR ?? null,
        mep_target: me.mepTarget ?? null,
        factor_weights: (me.factorWeights ?? null) as unknown as Ins<'profiles'>['factor_weights'],
      };
      const err = await run('profiles', [row]);
      if (err) return { ok: false, pushed, error: err };
    }

    // 2) Camps (parents of every log) — push before children.
    const campRows: Ins<'camps'>[] = localCamps.map(c => {
      const prefix = `${c.id}-`;
      // Store camp-scoped keys RELATIVE to the camp (strip the local camp-id
      // prefix) so they stay portable when a different device assigns a new
      // local id to the same camp on pull.
      const completed: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(state.completedSessions ?? {})) {
        if (k.startsWith(prefix)) completed[k.slice(prefix.length)] = v;
      }
      const overrides: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(state.dayOverrides ?? {})) {
        if (k.startsWith(prefix)) overrides[k.slice(prefix.length)] = v;
      }
      return {
        id: uuidFor(c.id),
        user_id: userId,
        fight_date: c.fightDate ?? null,
        opponent: c.opponent ?? null,
        weight_class: c.weightClass,
        current_weight: c.currentWeight,
        target_weight: c.targetWeight,
        rounds: c.rounds,
        round_duration: c.roundDuration,
        sport: c.sport,
        experience: c.experienceLevel,
        camp_weeks: c.campWeeks,
        start_date: c.startDate,
        is_off_season: c.isOffSeason ?? false,
        off_season_goal: c.offSeasonGoal ?? null,
        game_plan: (state.gamePlans?.[c.id] ?? null) as unknown as Ins<'camps'>['game_plan'],
        completed_sessions: completed as Ins<'camps'>['completed_sessions'],
        day_overrides: overrides as Ins<'camps'>['day_overrides'],
      };
    });
    {
      const err = await run('camps', campRows);
      if (err) return { ok: false, pushed, error: err };
    }

    const childOf = (campId: string) => validCampUuids.has(uuidFor(campId));

    // 3) Logs / entries.
    const err1 = await run('workout_logs', (state.workoutLogs ?? []).filter(l => childOf(l.campId)).map(l => ({
      id: uuidFor(l.id), user_id: userId, camp_id: uuidFor(l.campId),
      date: l.date, week_number: l.weekNumber, day_label: l.dayLabel,
      session_type: l.sessionType, title: l.title, duration: l.duration,
      rpe: l.rpe, notes: l.notes ?? '', completed: l.completed, mep: l.mep ?? null,
      created_at: ts(l, now),
    })));
    if (err1) return { ok: false, pushed, error: err1 };

    const err2 = await run('sparring_logs', (state.sparringLogs ?? []).filter(l => childOf(l.campId)).map(l => ({
      id: uuidFor(l.id), user_id: userId, camp_id: uuidFor(l.campId),
      date: l.date, week_number: l.weekNumber, rounds: l.rounds,
      round_duration: l.roundDuration, partner_name: l.partnerName,
      partner_level: l.partnerLevel, focus: l.focus, performance: l.performance,
      notes: l.notes ?? '', created_at: ts(l, now),
    })));
    if (err2) return { ok: false, pushed, error: err2 };

    const err3 = await run('conditioning_tests', (state.conditioningTests ?? []).filter(t => childOf(t.campId)).map(t => ({
      id: uuidFor(t.id), user_id: userId, camp_id: uuidFor(t.campId),
      date: t.date, week_number: t.weekNumber, test_type: t.testType,
      value: t.value, unit: t.unit, notes: t.notes ?? '', created_at: ts(t, now),
    })));
    if (err3) return { ok: false, pushed, error: err3 };

    const err4 = await run('weight_entries', (state.weightEntries ?? []).filter(e => childOf(e.campId)).map(e => ({
      id: uuidFor(e.id), user_id: userId, camp_id: uuidFor(e.campId),
      date: e.date, weight: e.weight, notes: e.notes ?? '', created_at: ts(e, now),
    })));
    if (err4) return { ok: false, pushed, error: err4 };

    const err5 = await run('nutrition_logs', (state.nutritionLogs ?? []).filter(n => childOf(n.campId)).map(n => ({
      id: uuidFor(n.id), user_id: userId, camp_id: uuidFor(n.campId),
      date: n.date, water_oz: n.waterOz, meal_ratings: n.mealRatings as Ins<'nutrition_logs'>['meal_ratings'],
      macros: (n.macros ?? null) as Ins<'nutrition_logs'>['macros'], notes: n.notes ?? '', created_at: ts(n, now),
    })));
    if (err5) return { ok: false, pushed, error: err5 };

    const err6 = await run('hrv_entries', (state.hrvEntries ?? []).filter(h => childOf(h.campId)).map(h => ({
      id: uuidFor(h.id), user_id: userId, camp_id: uuidFor(h.campId),
      date: h.date, rmssd: h.rmssd, resting_hr: h.restingHR ?? null,
      source: h.source, notes: h.notes ?? null, created_at: ts(h, now),
    })));
    if (err6) return { ok: false, pushed, error: err6 };

    const err7 = await run('fight_results', (state.fightResults ?? []).filter(r => childOf(r.campId)).map(r => ({
      id: uuidFor(r.id), user_id: userId, camp_id: uuidFor(r.campId),
      fight_date: r.fightDate, opponent: r.opponent, outcome: r.outcome,
      method: r.method, round_stopped: r.roundStopped ?? null, total_rounds: r.totalRounds,
      rounds: r.rounds as unknown as Ins<'fight_results'>['rounds'], weigh_in_weight: r.weighInWeight ?? null,
      fight_night_weight: r.fightNightWeight ?? null, style_plan_followed: r.stylePlanFollowed,
      overall_notes: r.overallNotes ?? '', lessons: r.lessons ?? '',
      readiness_at_fight: r.readinessAtFight ?? null, created_at: ts(r, now),
    })));
    if (err7) return { ok: false, pushed, error: err7 };

    // 4) Misc per-user state (single row).
    const errState = await run('user_state', [{
      user_id: userId,
      gamification: (state.gamification ?? null) as Ins<'user_state'>['gamification'],
      dashboard_prefs: (state.dashboardPrefs ?? null) as Ins<'user_state'>['dashboard_prefs'],
      fitbit_config: (state.fitbitConfig ?? null) as Ins<'user_state'>['fitbit_config'],
      subscription: (state.subscription ?? null) as unknown as Ins<'user_state'>['subscription'],
    }], 'user_id');
    if (errState) return { ok: false, pushed, error: errState };

    saveIdMap(map);
    return { ok: true, pushed };
  } catch (e) {
    saveIdMap(map);
    return { ok: false, pushed, error: e instanceof Error ? e.message : 'Sync failed.' };
  }
}

// ─── Pull (cloud → device) ──────────────────────────────────────────────────

/** A local-shaped snapshot of the signed-in user's cloud data. */
export interface CloudSnapshot {
  profile: FighterProfile | null;
  camps: FightCamp[];
  workoutLogs: WorkoutLog[];
  sparringLogs: SparringLog[];
  conditioningTests: ConditioningTest[];
  weightEntries: WeightEntry[];
  nutritionLogs: NutritionLog[];
  hrvEntries: HRVEntry[];
  fightResults: FightResult[];
  gamePlans: Record<string, GamePlan>;
  completedSessions: Record<string, boolean>;
  dayOverrides: Record<string, boolean>;
  gamification: GamificationState | null;
  dashboardPrefs: DashboardPrefs | null;
  fitbitConfig: FitbitConfig | null;
}

export interface PullResult {
  ok: boolean;
  snapshot?: CloudSnapshot;
  error?: string;
}

/** Resolves cloud uuids back to stable local ids, minting+persisting new ones. */
function makeLocalIdResolver(map: Record<string, string>) {
  const inverse: Record<string, string> = {};
  for (const [lid, uid] of Object.entries(map)) inverse[uid] = lid;
  return (uuid: string): string => {
    let lid = inverse[uuid];
    if (!lid) {
      lid = generateId();
      inverse[uuid] = lid;
      map[lid] = uuid;
    }
    return lid;
  };
}

export async function pullState(userId: string): Promise<PullResult> {
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };

  const map = loadIdMap();
  const lid = makeLocalIdResolver(map);

  try {
    const [profileQ, campsQ, workoutsQ, sparringQ, condQ, weightQ, nutritionQ, hrvQ, fightQ, stateQ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('camps').select('*').eq('user_id', userId),
      supabase.from('workout_logs').select('*').eq('user_id', userId),
      supabase.from('sparring_logs').select('*').eq('user_id', userId),
      supabase.from('conditioning_tests').select('*').eq('user_id', userId),
      supabase.from('weight_entries').select('*').eq('user_id', userId),
      supabase.from('nutrition_logs').select('*').eq('user_id', userId),
      supabase.from('hrv_entries').select('*').eq('user_id', userId),
      supabase.from('fight_results').select('*').eq('user_id', userId),
      supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const firstErr = [profileQ, campsQ, workoutsQ, sparringQ, condQ, weightQ, nutritionQ, hrvQ, fightQ, stateQ]
      .map(q => q.error?.message).find(Boolean);
    if (firstErr) return { ok: false, error: firstErr };

    const gamePlans: Record<string, GamePlan> = {};
    const completedSessions: Record<string, boolean> = {};
    const dayOverrides: Record<string, boolean> = {};

    const camps: FightCamp[] = (campsQ.data ?? []).map((c: Row<'camps'>) => {
      const campLocalId = lid(c.id);
      const cs = c.completed_sessions as Record<string, boolean> | null;
      if (cs) for (const [rel, v] of Object.entries(cs)) completedSessions[`${campLocalId}-${rel}`] = v;
      const dov = c.day_overrides as Record<string, boolean> | null;
      if (dov) for (const [rel, v] of Object.entries(dov)) dayOverrides[`${campLocalId}-${rel}`] = v;
      const gp = c.game_plan as GamePlan | null;
      if (gp) gamePlans[campLocalId] = { ...gp, campId: campLocalId };
      return {
        id: campLocalId,
        fightDate: c.fight_date ?? undefined,
        opponent: c.opponent ?? undefined,
        weightClass: c.weight_class as WeightClass,
        currentWeight: c.current_weight,
        targetWeight: c.target_weight,
        rounds: c.rounds,
        roundDuration: c.round_duration,
        sport: c.sport as Sport,
        experienceLevel: c.experience as ExperienceLevel,
        campWeeks: c.camp_weeks,
        startDate: c.start_date,
        createdAt: c.created_at,
        isOffSeason: c.is_off_season ?? undefined,
        offSeasonGoal: (c.off_season_goal ?? undefined) as OffSeasonGoal | undefined,
      };
    });

    const p = profileQ.data as Row<'profiles'> | null;
    const profile: FighterProfile | null = p ? {
      id: userId,
      name: p.name,
      age: p.age,
      sport: p.sport as Sport,
      weightClass: p.weight_class as WeightClass,
      experienceLevel: p.experience as ExperienceLevel,
      role: p.role as UserRole,
      gym: p.gym ?? undefined,
      record: p.record ?? undefined,
      avatar: p.avatar_url ?? undefined,
      createdAt: p.created_at,
      macroTargets: (p.macro_targets ?? undefined) as MacroEntry | undefined,
      maxHR: p.max_hr ?? undefined,
      mepTarget: p.mep_target ?? undefined,
      factorWeights: (p.factor_weights ?? undefined) as CampFactorWeights | undefined,
    } : null;

    const st = stateQ.data as Row<'user_state'> | null;

    const snapshot: CloudSnapshot = {
      profile,
      camps,
      workoutLogs: (workoutsQ.data ?? []).map((w: Row<'workout_logs'>) => ({
        id: lid(w.id), campId: lid(w.camp_id), date: w.date, weekNumber: w.week_number,
        dayLabel: w.day_label, sessionType: w.session_type as SessionType, title: w.title,
        duration: w.duration, rpe: w.rpe, notes: w.notes ?? '', completed: w.completed,
        createdAt: w.created_at, mep: w.mep ?? undefined,
      })),
      sparringLogs: (sparringQ.data ?? []).map((s: Row<'sparring_logs'>) => ({
        id: lid(s.id), campId: lid(s.camp_id), date: s.date, weekNumber: s.week_number,
        rounds: s.rounds, roundDuration: s.round_duration, partnerName: s.partner_name,
        partnerLevel: s.partner_level, focus: s.focus, performance: s.performance as 1 | 2 | 3 | 4 | 5,
        notes: s.notes ?? '', createdAt: s.created_at,
      })),
      conditioningTests: (condQ.data ?? []).map((t: Row<'conditioning_tests'>) => ({
        id: lid(t.id), campId: lid(t.camp_id), date: t.date, weekNumber: t.week_number,
        testType: t.test_type, value: t.value, unit: t.unit, notes: t.notes ?? '', createdAt: t.created_at,
      })),
      weightEntries: (weightQ.data ?? []).map((e: Row<'weight_entries'>) => ({
        id: lid(e.id), campId: lid(e.camp_id), date: e.date, weight: e.weight,
        notes: e.notes ?? '', createdAt: e.created_at,
      })),
      nutritionLogs: (nutritionQ.data ?? []).map((n: Row<'nutrition_logs'>) => ({
        id: lid(n.id), campId: lid(n.camp_id), date: n.date, waterOz: n.water_oz ?? 0,
        mealRatings: (n.meal_ratings ?? {}) as NutritionLog['mealRatings'],
        macros: (n.macros ?? undefined) as MacroEntry | undefined,
        notes: n.notes ?? '', createdAt: n.created_at,
      })),
      hrvEntries: (hrvQ.data ?? []).map((h: Row<'hrv_entries'>) => ({
        id: lid(h.id), campId: lid(h.camp_id), date: h.date, rmssd: h.rmssd,
        restingHR: h.resting_hr ?? undefined, source: h.source as HRVSource,
        notes: h.notes ?? undefined, createdAt: h.created_at,
      })),
      fightResults: (fightQ.data ?? []).map((r: Row<'fight_results'>) => ({
        id: lid(r.id), campId: lid(r.camp_id), fighterId: userId, fightDate: r.fight_date,
        opponent: r.opponent, outcome: r.outcome as FightResult['outcome'],
        method: r.method as FightResult['method'], roundStopped: r.round_stopped ?? undefined,
        totalRounds: r.total_rounds, rounds: (r.rounds ?? []) as unknown as FightRound[],
        weighInWeight: r.weigh_in_weight ?? undefined, fightNightWeight: r.fight_night_weight ?? undefined,
        stylePlanFollowed: (r.style_plan_followed ?? 3) as 1 | 2 | 3 | 4 | 5,
        overallNotes: r.overall_notes ?? '', lessons: r.lessons ?? '',
        readinessAtFight: r.readiness_at_fight ?? undefined, createdAt: r.created_at,
      })),
      gamePlans,
      completedSessions,
      dayOverrides,
      gamification: (st?.gamification ?? null) as GamificationState | null,
      dashboardPrefs: (st?.dashboard_prefs ?? null) as DashboardPrefs | null,
      fitbitConfig: (st?.fitbit_config ?? null) as FitbitConfig | null,
    };

    saveIdMap(map);
    return { ok: true, snapshot };
  } catch (e) {
    saveIdMap(map);
    return { ok: false, error: e instanceof Error ? e.message : 'Pull failed.' };
  }
}

/**
 * Conservative union merge: cloud records fill in anything missing locally, but
 * a record present on both sides keeps the LOCAL copy (the active device wins).
 * After logout/reset the local store is empty, so this restores everything.
 * Subscription is intentionally never pulled — it's owned by RevenueCat/Stripe.
 */
export function mergeCloud(state: AppState, c: CloudSnapshot): AppState {
  const union = <T extends { id: string }>(local: T[], cloud: T[]): T[] => {
    const ids = new Set(local.map(x => x.id));
    return [...local, ...cloud.filter(x => !ids.has(x.id))];
  };

  const camps = union(state.camps, c.camps);
  return {
    ...state,
    currentUser: state.currentUser ?? c.profile,
    fighters: c.profile && !state.fighters.some(f => f.id === c.profile!.id)
      ? [...state.fighters, c.profile]
      : state.fighters,
    camps,
    activeCamp: state.activeCamp ?? (camps[camps.length - 1] ?? null),
    workoutLogs: union(state.workoutLogs, c.workoutLogs),
    sparringLogs: union(state.sparringLogs, c.sparringLogs),
    conditioningTests: union(state.conditioningTests, c.conditioningTests),
    weightEntries: union(state.weightEntries, c.weightEntries),
    nutritionLogs: union(state.nutritionLogs, c.nutritionLogs),
    hrvEntries: union(state.hrvEntries ?? [], c.hrvEntries),
    fightResults: union(state.fightResults ?? [], c.fightResults),
    // Cloud first so local keys win on conflict.
    completedSessions: { ...c.completedSessions, ...state.completedSessions },
    dayOverrides: { ...c.dayOverrides, ...state.dayOverrides },
    gamePlans: { ...c.gamePlans, ...state.gamePlans },
    gamification: state.gamification ?? c.gamification ?? undefined,
    dashboardPrefs: state.dashboardPrefs ?? c.dashboardPrefs ?? undefined,
    fitbitConfig: state.fitbitConfig ?? c.fitbitConfig ?? undefined,
  };
}

// ─── Server-verified Stripe entitlement (read-only) ─────────────────────────

/**
 * Reads the signed-in user's server-authoritative subscription from the
 * `stripe_subscriptions` table the Stripe webhook maintains. RLS lets a user
 * read only their own row, and nothing client-side can write it.
 *
 * Returns:
 *   - `null` when Supabase is unconfigured, offline/errored, or there is no row
 *     (the caller should leave the current subscription unchanged).
 *   - an ACTIVE entitlement `{ tier, expiresAt, source: 'stripe_server' }` when
 *     the subscription is live (trialing / active / in grace) and unexpired.
 *   - a free sentinel `{ tier: 'free', ... }` when a row exists but is no longer
 *     active, so the caller can downgrade a previously server-verified user.
 */
export async function fetchServerSubscription(userId: string): Promise<SubscriptionState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('stripe_subscriptions')
      .select('tier,status,current_period_end')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;

    // Keep access through past_due (Stripe's dunning/retry grace) so a transient
    // failed charge doesn't instantly lock a paying user out. The tier check is
    // inline so TS narrows data.tier (typed `string`) to SubscriptionTier.
    const activeStatus = data.status === 'active' || data.status === 'trialing' || data.status === 'past_due';
    const unexpired = !data.current_period_end || new Date(data.current_period_end) > new Date();

    if (activeStatus && unexpired && (data.tier === 'fighter_pro' || data.tier === 'coach_pro')) {
      return { tier: data.tier, expiresAt: data.current_period_end, source: 'stripe_server' };
    }
    return { tier: 'free', expiresAt: null, source: 'stripe_server' };
  } catch {
    return null;
  }
}
