import { supabase } from './supabase';
import type { Database } from './database.types';
import type { AppState, FightCamp } from '../types';

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
      const completed: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(state.completedSessions ?? {})) {
        if (k.startsWith(prefix)) completed[k] = v;
      }
      const overrides: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(state.dayOverrides ?? {})) {
        if (k.startsWith(prefix)) overrides[k] = v;
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
