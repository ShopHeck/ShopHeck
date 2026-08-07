import { getSupabase } from './supabase';
import { generateId, loadCustomPresets, saveCustomPresets } from '../utils/storage';
import type { Database } from './database.types';
import type {
  AppState, FightCamp, FighterProfile, WorkoutLog, SparringLog, ConditioningTest,
  WeightEntry, NutritionLog, HRVEntry, FightResult, GamePlan, GamificationState,
  DashboardPrefs, FitbitConfig, MacroEntry, CampFactorWeights, FightRound,
  Sport, WeightClass, ExperienceLevel, UserRole, SessionType, OffSeasonGoal, HRVSource,
  SubscriptionState, CoachNote, CampAdaptation, CornerSession, AiAnalysis, AiAnalyses,
  CustomTimerPreset,
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

/**
 * Forget every local↔cloud id mapping. Call this whenever the local store is
 * wiped (reset, account deletion): the map doubles as this device's "I have
 * synced this record" ledger, and mergeCloud uses it to tell a locally-deleted
 * record from one it has simply never seen. Leaving a stale map behind after a
 * reset would make the next restore skip everything.
 */
export function clearIdMap(): void {
  try {
    localStorage.removeItem(IDMAP_KEY);
    // The dirty-tracking hashes describe rows this device pushed under that
    // mapping; keeping them past a wipe would make the next push think the
    // server is already up to date.
    localStorage.removeItem(HASH_KEY);
  } catch { /* noop */ }
}

// ─── Dirty tracking ─────────────────────────────────────────────────────────
//
// Every push used to upsert the entire account — every camp, every log, every
// weigh-in — because the debounce in SyncProvider fires on any state change and
// the hourly gamification recompute counts as one. A fighter mid-camp was
// re-uploading their whole history at least once an hour to change nothing.
//
// We remember a cheap content hash per row and only send rows whose hash moved.

const HASH_KEY = 'fightcamp_sync_hashes';
/** Force a full re-push occasionally, so a hash store that has drifted out of
 *  step with the server (a write we never saw, a restore from backup) heals on
 *  its own rather than silently pinning stale rows. */
const FULL_RESYNC_MS = 24 * 60 * 60 * 1000;

interface HashStore {
  /** table -> row key -> content hash */
  tables: Record<string, Record<string, string>>;
  /** Epoch ms of the last push that deliberately sent everything. */
  fullAt: number;
  /** Whose data these hashes describe; a different user invalidates them. */
  userId: string;
}

function emptyHashStore(userId: string): HashStore {
  return { tables: {}, fullAt: 0, userId };
}

function loadHashes(userId: string): HashStore {
  try {
    const raw = localStorage.getItem(HASH_KEY);
    if (!raw) return emptyHashStore(userId);
    const parsed = JSON.parse(raw) as HashStore;
    if (parsed?.userId !== userId || typeof parsed.tables !== 'object') {
      return emptyHashStore(userId);
    }
    return { tables: parsed.tables ?? {}, fullAt: parsed.fullAt ?? 0, userId };
  } catch {
    return emptyHashStore(userId);
  }
}

function saveHashes(store: HashStore): void {
  try { localStorage.setItem(HASH_KEY, JSON.stringify(store)); } catch { /* noop */ }
}

/**
 * Make the next push send everything.
 *
 * mergeCloud keeps the LOCAL copy when a row exists on both sides, so after a
 * pull the server can legitimately hold a different version of a row this
 * device already pushed. Its hash is unchanged, so dirty tracking would skip it
 * and the two would stay diverged — the unconditional push used to be what made
 * the documented local-wins merge converge. Called after every successful pull.
 */
export function forceFullResync(): void {
  try {
    const raw = localStorage.getItem(HASH_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as HashStore;
    saveHashes({ ...parsed, fullAt: 0 });
  } catch { /* noop */ }
}

/** FNV-1a over the row's JSON — fast, and collisions only cost a skipped push. */
function hashRow(row: unknown): string {
  const s = JSON.stringify(row);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Record an embedded record's id in the sync ledger.
 *
 * Adaptations and corner sessions live inside a camp's jsonb, so they never go
 * through `uuidFor` — their id IS their cloud id, stored verbatim. That left
 * them out of the id map, and the id map is not only a translation table: its
 * keys are this device's "I have synced this" ledger, which `pullState`
 * snapshots into `previouslySynced` so `mergeCloud` can tell a locally-deleted
 * record from one it has never seen.
 *
 * Without this, reverting an adaptation or discarding a corner session offline
 * and then reopening online restored it: the pull saw an id it had no record
 * of, called it new, and merged the stale cloud copy back in.
 *
 * Mapping the id to itself is not a placeholder — for an embedded record the
 * local id and the cloud id are genuinely the same string.
 */
function recordEmbedded(map: Record<string, string>, ids: Iterable<string>): void {
  for (const id of ids) map[id] = id;
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
  /** Rows actually written this time — 0 means nothing had changed. */
  pushed: number;
  /** Rows removed from the cloud because they were deleted on this device. */
  pruned: number;
  error?: string;
}

export interface PushOptions {
  /**
   * Allow deleting cloud rows that this device previously pushed and has since
   * deleted locally. Off by default, and SyncProvider only turns it on after a
   * pull has succeeded in this session — otherwise a device that failed to
   * restore (offline, transient error) could read its own empty local store as
   * "the user deleted everything" and prune the account.
   */
  prune?: boolean;
}

/**
 * Upsert the signed-in user's local state into Supabase. `userId` is the auth
 * user id; the profile row's PK must equal it to satisfy RLS.
 */
export async function pushState(
  userId: string,
  state: AppState,
  opts: PushOptions = {},
): Promise<PushResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, pushed: 0, pruned: 0, error: 'Cloud sync is not configured.' };

  const map = loadIdMap();
  const uuidFor = makeUuidFor(map);
  const now = new Date().toISOString();
  let pushed = 0;
  let pruned = 0;

  const hashes = loadHashes(userId);
  const forceFull = Date.now() - hashes.fullAt > FULL_RESYNC_MS;
  // Hashes are staged per table and only committed once that table's write has
  // actually landed, so a failed push retries the same rows next time.
  const staged: HashStore['tables'] = {};
  /**
   * `complete` must be false on any bail-out. A forced 24h resync that failed
   * partway still wrote some tables, but the failed one kept its old hashes —
   * stamping fullAt anyway would un-force the retry and leave exactly the rows
   * the resync existed to repair permanently skipped.
   */
  const commitHashes = (complete: boolean) => {
    saveHashes({
      userId,
      tables: { ...hashes.tables, ...staged },
      fullAt: forceFull && complete ? Date.now() : hashes.fullAt,
    });
  };

  /** Bail out, keeping whatever progress the successful tables already made. */
  const fail = (error: string): PushResult => {
    saveIdMap(map);
    commitHashes(false);
    return { ok: false, pushed, pruned, error };
  };

  // Only push camps that exist locally; log rows that reference a missing camp
  // are skipped so we never violate the camp_id foreign key.
  const localCamps: FightCamp[] = state.camps ?? [];
  const validCampUuids = new Set(localCamps.map(c => uuidFor(c.id)));

  const run = async <T extends keyof Database['public']['Tables']>(
    table: T,
    rows: Ins<T>[],
    onConflict = 'id',
    /**
     * Whether rows this device deleted locally should also be deleted in the
     * cloud. Never set for `profiles` or `user_state`: those are one row per
     * account that must simply follow the local value, and a stray delete there
     * would take the account's identity row with it.
     */
    prunable = false,
    /**
     * Column used for dirty-hash keys and prune `.in(...)` filters.
     *
     * Defaults to `onConflict`. Set separately when the upsert conflict target
     * is a composite natural key (e.g. nutrition_logs unique on
     * user_id,camp_id,date) but tombstones still address rows by primary `id`.
     * Without this, a composite onConflict string is not a row field, so every
     * row would hash-collide on "" and prune would call `.in('user_id,camp_id,date', …)`.
     */
    hashKey = onConflict,
  ): Promise<string | null> => {
    const key = String(table);
    const prev = hashes.tables[key] ?? {};
    const next: Record<string, string> = {};
    const dirty: Ins<T>[] = [];

    for (const row of rows) {
      // Rows are keyed by the hash column (usually the conflict target), so a
      // single-row table like user_state keys on user_id.
      const rowKey = String((row as Record<string, unknown>)[hashKey] ?? '');
      const h = hashRow(row);
      next[rowKey] = h;
      if (forceFull || prev[rowKey] !== h) dirty.push(row);
    }

    if (dirty.length > 0) {
      const { error } = await supabase!.from(table).upsert(dirty as never, { onConflict });
      if (error) return `${String(table)}: ${error.message}`;
      pushed += dirty.length;
    }

    // Anything this device pushed before and is no longer sending was deleted
    // here. Deriving the tombstones from the hash store means we only ever
    // touch rows we ourselves created — a row another device added that this
    // one has never seen is not in `prev`, so it is left alone.
    //
    // Stamped rather than deleted: the schema has carried a deleted_at column
    // on every table since the start ("so an offline delete syncing late
    // doesn't get resurrected by an older edit on another device"), but nothing
    // ever wrote it. A tombstone is also recoverable, which a DELETE is not.
    if (prunable) {
      const gone = Object.keys(prev).filter(k => k && !(k in next));
      if (gone.length > 0) {
        if (opts.prune) {
          const { error } = await supabase!
            .from(table)
            .update({ deleted_at: now } as never)
            // `hashKey` is the addressable PK/column for prune (usually `id`).
            .in(hashKey as never, gone);
          if (error) return `${String(table)} (prune): ${error.message}`;
          pruned += gone.length;
        } else {
          // Pruning is not permitted yet (no successful pull this session), so
          // keep these keys in the ledger. Dropping them would erase the only
          // record that they were ever deleted, and the row would live on in
          // the cloud forever.
          for (const k of gone) next[k] = prev[k];
        }
      }
    }

    // Recorded last so a failed write above leaves the old hashes in place and
    // the rows are retried next push.
    staged[key] = next;
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
      if (err) return fail(err);
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
      // Same relative-key treatment for the three slices that used to be
      // local-only. `campId` comes off the adaptations and corner sessions
      // because the row it is stored on already says which camp it is, and a
      // local camp id is meaningless on the device that pulls it back.
      const adaptations = (state.campAdaptations ?? [])
        .filter(a => a.campId === c.id)
        .map(({ campId: _campId, ...rest }) => rest);
      const cornerSessions = (state.cornerSessions ?? [])
        .filter(s => s.campId === c.id)
        .map(({ campId: _campId, ...rest }) => rest);
      // Dismissal keys are `${campId}:${weekNumber}:${kind}` — the prefix goes
      // for the same reason, leaving `${weekNumber}:${kind}`.
      const dismissedPrefix = `${c.id}:`;
      const dismissed = (state.dismissedAdaptations ?? [])
        .filter(k => k.startsWith(dismissedPrefix))
        .map(k => k.slice(dismissedPrefix.length));
      // Ledger them as synced, so a later revert or discard reads as a delete
      // rather than as a record the next pull has never seen.
      recordEmbedded(map, adaptations.map(a => a.id));
      recordEmbedded(map, cornerSessions.map(s => s.id));
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
        adaptations: adaptations as unknown as Ins<'camps'>['adaptations'],
        dismissed_adaptations: dismissed as unknown as Ins<'camps'>['dismissed_adaptations'],
        corner_sessions: cornerSessions as unknown as Ins<'camps'>['corner_sessions'],
      };
    });
    {
      const err = await run('camps', campRows, 'id', true);
      if (err) return fail(err);
    }

    const childOf = (campId: string) => validCampUuids.has(uuidFor(campId));

    // 3) Logs / entries.
    const err1 = await run('workout_logs', (state.workoutLogs ?? []).filter(l => childOf(l.campId)).map(l => ({
      id: uuidFor(l.id), user_id: userId, camp_id: uuidFor(l.campId),
      date: l.date, week_number: l.weekNumber, day_label: l.dayLabel,
      session_type: l.sessionType, title: l.title, duration: l.duration,
      rpe: l.rpe, notes: l.notes ?? '', completed: l.completed, mep: l.mep ?? null,
      created_at: ts(l, now),
    })), 'id', true);
    if (err1) return fail(err1);

    const err2 = await run('sparring_logs', (state.sparringLogs ?? []).filter(l => childOf(l.campId)).map(l => ({
      id: uuidFor(l.id), user_id: userId, camp_id: uuidFor(l.campId),
      date: l.date, week_number: l.weekNumber, rounds: l.rounds,
      round_duration: l.roundDuration, partner_name: l.partnerName,
      partner_level: l.partnerLevel, focus: l.focus, performance: l.performance,
      notes: l.notes ?? '', created_at: ts(l, now),
    })), 'id', true);
    if (err2) return fail(err2);

    const err3 = await run('conditioning_tests', (state.conditioningTests ?? []).filter(t => childOf(t.campId)).map(t => ({
      id: uuidFor(t.id), user_id: userId, camp_id: uuidFor(t.campId),
      date: t.date, week_number: t.weekNumber, test_type: t.testType,
      value: t.value, unit: t.unit, notes: t.notes ?? '', created_at: ts(t, now),
    })), 'id', true);
    if (err3) return fail(err3);

    const err4 = await run('weight_entries', (state.weightEntries ?? []).filter(e => childOf(e.campId)).map(e => ({
      id: uuidFor(e.id), user_id: userId, camp_id: uuidFor(e.campId),
      date: e.date, weight: e.weight, notes: e.notes ?? '',
      official_weigh_in: e.officialWeighIn ?? false, created_at: ts(e, now),
    })), 'id', true);
    if (err4) return fail(err4);

    // Conflict target is the table's natural unique key (user_id, camp_id, date),
    // not the surrogate id. Two offline devices can each mint a different local
    // id for the same day; upserting on id alone inserts two rows and trips the
    // unique constraint. Hash/prune still key on id so tombstones address the
    // row this device created.
    const err5 = await run('nutrition_logs', (state.nutritionLogs ?? []).filter(n => childOf(n.campId)).map(n => ({
      id: uuidFor(n.id), user_id: userId, camp_id: uuidFor(n.campId),
      date: n.date, water_oz: n.waterOz, meal_ratings: n.mealRatings as Ins<'nutrition_logs'>['meal_ratings'],
      macros: (n.macros ?? null) as Ins<'nutrition_logs'>['macros'], notes: n.notes ?? '', created_at: ts(n, now),
    })), 'user_id,camp_id,date', true, 'id');
    if (err5) return fail(err5);

    const err6 = await run('hrv_entries', (state.hrvEntries ?? []).filter(h => childOf(h.campId)).map(h => ({
      id: uuidFor(h.id), user_id: userId, camp_id: uuidFor(h.campId),
      date: h.date, rmssd: h.rmssd, resting_hr: h.restingHR ?? null,
      source: h.source, notes: h.notes ?? null, created_at: ts(h, now),
    })), 'id', true);
    if (err6) return fail(err6);

    const err7 = await run('fight_results', (state.fightResults ?? []).filter(r => childOf(r.campId)).map(r => ({
      id: uuidFor(r.id), user_id: userId, camp_id: uuidFor(r.campId),
      fight_date: r.fightDate, opponent: r.opponent, outcome: r.outcome,
      method: r.method, round_stopped: r.roundStopped ?? null, total_rounds: r.totalRounds,
      rounds: r.rounds as unknown as Ins<'fight_results'>['rounds'], weigh_in_weight: r.weighInWeight ?? null,
      fight_night_weight: r.fightNightWeight ?? null, style_plan_followed: r.stylePlanFollowed,
      overall_notes: r.overallNotes ?? '', lessons: r.lessons ?? '',
      readiness_at_fight: r.readinessAtFight ?? null, created_at: ts(r, now),
    })), 'id', true);
    if (err7) return fail(err7);

    // Custom timer presets live outside AppState (localStorage only) so the
    // timer screen can load them without hydrating the whole account. They still
    // need cloud backup: the table and RLS already exist, but nothing wrote them
    // until now — a reinstall or second device silently lost every preset.
    const errPresets = await run(
      'timer_presets',
      loadCustomPresets().map(p => ({
        id: uuidFor(p.id),
        user_id: userId,
        label: p.label,
        rounds: p.rounds,
        work_sec: p.workSec,
        rest_sec: p.restSec,
        created_at: p.createdAt || now,
      })),
      'id',
      true,
    );
    if (errPresets) return fail(errPresets);

    // 4) Misc per-user state (single row).
    //
    // Fitbit's OAuth access/refresh tokens are deliberately stripped before the
    // push. They are long-lived bearer credentials for a third-party account and
    // the connect flow is per-device PKCE, so syncing them buys nothing but puts
    // a re-usable credential in our database. Only the non-secret client id and
    // the last-sync marker travel; a new device re-runs the (one-tap) connect.
    // Saved AI analyses are keyed `${kind}:${subjectId}` where the subject is a
    // local camp or fight-result id, so the key is rewritten to the subject's
    // CLOUD uuid before it goes up — a raw local key would name nothing on the
    // device that pulls it. Analyses whose subject this device has never pushed
    // are skipped rather than minting a uuid for a row that does not exist:
    // both parent tables were written above, so anything still unmapped here
    // has been deleted locally.
    const analyses: AiAnalyses = {};
    for (const [key, analysis] of Object.entries(state.aiAnalyses ?? {})) {
      const sep = key.indexOf(':');
      if (sep === -1) continue;
      const kind = key.slice(0, sep);
      const subjectUuid = map[key.slice(sep + 1)];
      if (!subjectUuid) continue;
      analyses[`${kind}:${subjectUuid}`] = analysis;
    }

    const errState = await run('user_state', [{
      user_id: userId,
      ai_analyses: analyses as unknown as Ins<'user_state'>['ai_analyses'],
      gamification: (state.gamification ?? null) as Ins<'user_state'>['gamification'],
      dashboard_prefs: (state.dashboardPrefs ?? null) as Ins<'user_state'>['dashboard_prefs'],
      fitbit_config: (state.fitbitConfig
        ? { clientId: state.fitbitConfig.clientId, lastSync: state.fitbitConfig.lastSync }
        : null) as Ins<'user_state'>['fitbit_config'],
      subscription: (state.subscription ?? null) as unknown as Ins<'user_state'>['subscription'],
    }], 'user_id');
    if (errState) return fail(errState);

    saveIdMap(map);
    commitHashes(true);
    return { ok: true, pushed, pruned };
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Sync failed.');
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
  /**
   * Notes a linked coach wrote about this fighter.
   *
   * Pull-only, unlike every other collection here. The rows are written by the
   * coach's account (`coach_notes_write` is `coach_id = auth.uid()`), so a
   * fighter pushing them would be rejected by RLS — `pushState` deliberately
   * never sends this table. See lib/coachLinks.ts for the write path.
   */
  coachNotes: CoachNote[];
  gamePlans: Record<string, GamePlan>;
  completedSessions: Record<string, boolean>;
  dayOverrides: Record<string, boolean>;
  gamification: GamificationState | null;
  dashboardPrefs: DashboardPrefs | null;
  fitbitConfig: FitbitConfig | null;
  /** Accepted adaptations, re-stamped with this device's local camp ids. */
  campAdaptations: CampAdaptation[];
  /** Declined adaptation keys, re-prefixed with this device's local camp ids. */
  dismissedAdaptations: string[];
  /** Corner-scored fights, re-stamped with this device's local camp ids. */
  cornerSessions: CornerSession[];
  /** Saved AI analyses, re-keyed to this device's local subject ids. */
  aiAnalyses: AiAnalyses;
  /**
   * Local ids this device had already mapped to a cloud row before this pull.
   * A record in here that is missing from local state was deleted here, so the
   * merge must not treat the still-present cloud row as "new" and restore it.
   */
  previouslySynced: Set<string>;
  /**
   * Local ids another device has tombstoned. mergeCloud removes these from
   * local state, which is what makes a delete on one device reach the others.
   */
  tombstoned: Set<string>;
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

/**
 * Page through an entire ordered table query.
 *
 * A bare `select('*')` is capped at the server's default page size (1,000
 * rows), and PostgREST silently drops everything beyond it. A heavy Pro
 * account — daily weigh-ins, meal logs and session logs across many camps —
 * passes 1,000 rows in weight_entries and nutrition_logs well before it does
 * in the log tables, so a cross-device restore would silently lose the OLDEST
 * rows (the ones furthest down the ORDER BY) exactly for the users who pay
 * for multi-device sync. Page with `.range()` until a short page returns;
 * the ordering established at the call site is what makes the pages tile.
 *
 * Exported so Coach Pro paths (team overview / fighter detail) can use the
 * same paging contract instead of silently truncating large rosters.
 */
export const PAGE_SIZE = 1000;

type ListResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Returns the same `{ data, error }` shape the plain query builder resolves
 * to, so a paginated query slots into pullState exactly where the unpaged one
 * sat.
 */
export async function selectAll<T>(
  // Query builders from @supabase/supabase-js are thenable but not typed as
  // PromiseLike<{data,error}> — accept unknown and resolve.
  build: (from: number, to: number) => unknown,
): Promise<ListResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await Promise.resolve(build(from, from + PAGE_SIZE - 1)) as ListResult<T>;
    const { data, error } = result;
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    // A short page means we have read past the end of the table.
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

export async function pullState(userId: string): Promise<PullResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };
  // Non-null local: TypeScript cannot keep the module-level nullable import
  // narrowed inside the paging closures below (same pattern as AuthContext).
  const client = supabase;

  const map = loadIdMap();
  // Snapshot the mapping BEFORE resolving — makeLocalIdResolver mints (and
  // records) ids for rows this device has never seen, and those must not be
  // mistaken for locally-deleted records.
  const previouslySynced = new Set(Object.keys(map));
  const lid = makeLocalIdResolver(map);

  try {
    const [profileQ, campsQ, workoutsQ, sparringQ, condQ, weightQ, nutritionQ, hrvQ, fightQ, notesQ, stateQ, presetsQ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      // Tombstoned rows are fetched too, not filtered out. Filtering makes a
      // deleted row indistinguishable from one that never existed, and
      // mergeCloud only ever ADDS cloud rows to local state — so a device that
      // already held the row would keep showing it forever. They are split out
      // below and carried through as an explicit delete signal instead.
      // Ordered to match the order local state is built in. Postgres makes no
      // ordering promise without an ORDER BY, and every pushState upsert
      // rewrites the row, so unordered results genuinely scramble as an account
      // is used. mergeCloud appends these rows verbatim and several screens read
      // position, so the pull is where the invariant has to be established.
      //
      // The direction is NOT uniform, because the local conventions are not:
      //
      //   camps          CREATE_CAMP APPENDS  -> oldest first, newest LAST
      //   everything else  add* PREPEND       -> newest first, newest FIRST
      //
      // Camps must therefore be ASCENDING. `camps[camps.length - 1]` is the
      // idiom for "the current camp" in four places (mergeCloud's activeCamp
      // fallback below, deleteCamp's promotion in utils/storage.ts, and
      // CoachDashboard twice) — sorting camps newest-first would silently make
      // every one of them pick the OLDEST camp, so a multi-camp account
      // restored onto a new device would open on a finished camp and
      // regenerate the schedule for it.
      //
      // Every list query is also paginated through selectAll (see its docs):
      // without .range() each query silently caps at the server page size and
      // a heavy account loses its oldest rows on restore.
      selectAll<Row<'camps'>>(
        (from, to) => client.from('camps').select('*').eq('user_id', userId)
          .order('start_date', { ascending: true }).range(from, to),
      ),
      selectAll<Row<'workout_logs'>>(
        (from, to) => client.from('workout_logs').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).range(from, to),
      ),
      selectAll<Row<'sparring_logs'>>(
        (from, to) => client.from('sparring_logs').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).range(from, to),
      ),
      selectAll<Row<'conditioning_tests'>>(
        (from, to) => client.from('conditioning_tests').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).range(from, to),
      ),
      selectAll<Row<'weight_entries'>>(
        (from, to) => client.from('weight_entries').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).range(from, to),
      ),
      selectAll<Row<'nutrition_logs'>>(
        (from, to) => client.from('nutrition_logs').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).range(from, to),
      ),
      selectAll<Row<'hrv_entries'>>(
        (from, to) => client.from('hrv_entries').select('*').eq('user_id', userId)
          .order('date', { ascending: false }).range(from, to),
      ),
      selectAll<Row<'fight_results'>>(
        (from, to) => client.from('fight_results').select('*').eq('user_id', userId)
          .order('fight_date', { ascending: false }).range(from, to),
      ),
      // Coach notes are keyed by `fighter_id`, not `user_id` — they are written
      // by the coach's account about this fighter. Newest first, matching the
      // `add*`-prepends convention of every other list above.
      selectAll<Row<'coach_notes'>>(
        (from, to) => client.from('coach_notes').select('*').eq('fighter_id', userId)
          .order('created_at', { ascending: false }).range(from, to),
      ),
      supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
      selectAll<Row<'timer_presets'>>(
        (from, to) => client.from('timer_presets').select('*').eq('user_id', userId)
          .order('created_at', { ascending: false }).range(from, to),
      ),
    ]);

    const firstErr = [profileQ, campsQ, workoutsQ, sparringQ, condQ, weightQ, nutritionQ, hrvQ, fightQ, notesQ, stateQ, presetsQ]
      .map(q => q.error?.message).find(Boolean);
    if (firstErr) return { ok: false, error: firstErr };

    const gamePlans: Record<string, GamePlan> = {};
    const completedSessions: Record<string, boolean> = {};
    const dayOverrides: Record<string, boolean> = {};
    // Accumulated out of the camp rows below, the same way the three maps above
    // are: each is stored camp-relative and re-stamped with this device's local
    // camp id on the way in.
    const campAdaptations: CampAdaptation[] = [];
    const dismissedAdaptations: string[] = [];
    const cornerSessions: CornerSession[] = [];

    /**
     * Local ids of rows another device has tombstoned. mergeCloud removes these
     * from local state — without an explicit signal a delete made elsewhere can
     * never reach a device that already holds the row.
     */
    const tombstoned = new Set<string>();

    /** Split a table's rows into the live ones and the tombstones. */
    const live = <R extends { id: string; deleted_at?: string | null }>(rows: R[] | null): R[] => {
      const out: R[] = [];
      for (const row of rows ?? []) {
        if (row.deleted_at) tombstoned.add(lid(row.id));
        else out.push(row);
      }
      return out;
    };

    /** Cloud ids of the camps this pull actually returned, for FK checks below. */
    const knownCampUuids = new Set<string>();

    const camps: FightCamp[] = live(campsQ.data as Row<'camps'>[] | null).map((c: Row<'camps'>) => {
      knownCampUuids.add(c.id);
      const campLocalId = lid(c.id);
      const cs = c.completed_sessions as Record<string, boolean> | null;
      if (cs) for (const [rel, v] of Object.entries(cs)) completedSessions[`${campLocalId}-${rel}`] = v;
      const dov = c.day_overrides as Record<string, boolean> | null;
      if (dov) for (const [rel, v] of Object.entries(dov)) dayOverrides[`${campLocalId}-${rel}`] = v;
      const gp = c.game_plan as GamePlan | null;
      if (gp) gamePlans[campLocalId] = { ...gp, campId: campLocalId };
      for (const a of (c.adaptations ?? []) as Omit<CampAdaptation, 'campId'>[]) {
        campAdaptations.push({ ...a, campId: campLocalId });
        // Same ledger entry the top-level rows get from `lid()`.
        // `previouslySynced` was snapshotted before this loop, so an id recorded
        // here still counts as new on THIS pull — which is what makes restore
        // work — and as previously-seen on the next one, which is what makes a
        // later revert stick instead of being undone by the stale cloud copy.
        recordEmbedded(map, [a.id]);
      }
      for (const rel of (c.dismissed_adaptations ?? []) as string[]) {
        dismissedAdaptations.push(`${campLocalId}:${rel}`);
      }
      for (const s of (c.corner_sessions ?? []) as unknown as Omit<CornerSession, 'campId'>[]) {
        cornerSessions.push({ ...s, campId: campLocalId });
        recordEmbedded(map, [s.id]);
      }
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

    const fightResults: FightResult[] = live(fightQ.data as Row<'fight_results'>[] | null).map((r: Row<'fight_results'>) => ({
      id: lid(r.id), campId: lid(r.camp_id), fighterId: userId, fightDate: r.fight_date,
      opponent: r.opponent, outcome: r.outcome as FightResult['outcome'],
      method: r.method as FightResult['method'], roundStopped: r.round_stopped ?? undefined,
      totalRounds: r.total_rounds, rounds: (r.rounds ?? []) as unknown as FightRound[],
      weighInWeight: r.weigh_in_weight ?? undefined, fightNightWeight: r.fight_night_weight ?? undefined,
      stylePlanFollowed: (r.style_plan_followed ?? 3) as 1 | 2 | 3 | 4 | 5,
      overallNotes: r.overall_notes ?? '', lessons: r.lessons ?? '',
      readinessAtFight: r.readiness_at_fight ?? undefined, createdAt: r.created_at,
    }));

    // The only subjects an AI analysis may legitimately be filed against: the
    // camps and fight results this pull actually returned. Hoisted out of the
    // snapshot literal so the analysis keys below can be checked against it.
    const knownSubjectIds = new Set<string>([
      ...camps.map(c => c.id),
      ...fightResults.map(r => r.id),
    ]);

    const snapshot: CloudSnapshot = {
      profile,
      camps,
      workoutLogs: live(workoutsQ.data as Row<'workout_logs'>[] | null).map((w: Row<'workout_logs'>) => ({
        id: lid(w.id), campId: lid(w.camp_id), date: w.date, weekNumber: w.week_number,
        dayLabel: w.day_label, sessionType: w.session_type as SessionType, title: w.title,
        duration: w.duration, rpe: w.rpe, notes: w.notes ?? '', completed: w.completed,
        createdAt: w.created_at, mep: w.mep ?? undefined,
      })),
      sparringLogs: live(sparringQ.data as Row<'sparring_logs'>[] | null).map((s: Row<'sparring_logs'>) => ({
        id: lid(s.id), campId: lid(s.camp_id), date: s.date, weekNumber: s.week_number,
        rounds: s.rounds, roundDuration: s.round_duration, partnerName: s.partner_name,
        partnerLevel: s.partner_level, focus: s.focus, performance: s.performance as 1 | 2 | 3 | 4 | 5,
        notes: s.notes ?? '', createdAt: s.created_at,
      })),
      conditioningTests: live(condQ.data as Row<'conditioning_tests'>[] | null).map((t: Row<'conditioning_tests'>) => ({
        id: lid(t.id), campId: lid(t.camp_id), date: t.date, weekNumber: t.week_number,
        testType: t.test_type, value: t.value, unit: t.unit, notes: t.notes ?? '', createdAt: t.created_at,
      })),
      weightEntries: live(weightQ.data as Row<'weight_entries'>[] | null).map((e: Row<'weight_entries'>) => ({
        id: lid(e.id), campId: lid(e.camp_id), date: e.date, weight: e.weight,
        notes: e.notes ?? '', createdAt: e.created_at,
        // Undefined rather than false when unset, matching how the flag is
        // written locally — an entry that is not the official weigh-in simply
        // does not carry the key.
        officialWeighIn: e.official_weigh_in || undefined,
      })),
      nutritionLogs: live(nutritionQ.data as Row<'nutrition_logs'>[] | null).map((n: Row<'nutrition_logs'>) => ({
        id: lid(n.id), campId: lid(n.camp_id), date: n.date, waterOz: n.water_oz ?? 0,
        mealRatings: (n.meal_ratings ?? {}) as NutritionLog['mealRatings'],
        macros: (n.macros ?? undefined) as MacroEntry | undefined,
        notes: n.notes ?? '', createdAt: n.created_at,
      })),
      hrvEntries: live(hrvQ.data as Row<'hrv_entries'>[] | null).map((h: Row<'hrv_entries'>) => ({
        id: lid(h.id), campId: lid(h.camp_id), date: h.date, rmssd: h.rmssd,
        restingHR: h.resting_hr ?? undefined, source: h.source as HRVSource,
        notes: h.notes ?? undefined, createdAt: h.created_at,
      })),
      fightResults,
      // `coachId` stays the coach's cloud uuid — there is no local profile to
      // resolve it against, and `coach_name` is denormalized onto the row for
      // exactly this reason (the fighter cannot read the coach's profile row).
      // Notes whose camp this device doesn't know are dropped rather than
      // shown against a mint-new local camp id: `lid()` would happily invent
      // one, and the note would render under a camp that isn't there.
      coachNotes: live(notesQ.data as Row<'coach_notes'>[] | null)
        .filter((n: Row<'coach_notes'>) => knownCampUuids.has(n.camp_id))
        .map((n: Row<'coach_notes'>) => ({
          id: lid(n.id),
          coachId: n.coach_id,
          coachName: n.coach_name,
          fighterId: userId,
          campId: lid(n.camp_id),
          category: n.category as CoachNote['category'],
          content: n.content,
          createdAt: n.created_at,
        })),
      gamePlans,
      completedSessions,
      dayOverrides,
      gamification: (st?.gamification ?? null) as GamificationState | null,
      dashboardPrefs: (st?.dashboard_prefs ?? null) as DashboardPrefs | null,
      fitbitConfig: (st?.fitbit_config ?? null) as FitbitConfig | null,
      campAdaptations,
      dismissedAdaptations,
      cornerSessions,
      // Keys go up as `${kind}:${cloud uuid}` and come back as
      // `${kind}:${local id}`. An analysis whose subject this pull did not
      // return is dropped rather than mapped: `lid()` would mint a local id for
      // it, and the analysis would then be keyed to a camp or fight that is not
      // in the snapshot — saved output filed against nothing.
      aiAnalyses: Object.fromEntries(
        Object.entries((st?.ai_analyses ?? {}) as unknown as Record<string, AiAnalysis>)
          .flatMap(([key, analysis]): [string, AiAnalysis][] => {
            const sep = key.indexOf(':');
            if (sep === -1) return [];
            const localId = lid(key.slice(sep + 1));
            if (!knownSubjectIds.has(localId)) return [];
            return [[`${key.slice(0, sep)}:${localId}`, { ...analysis, subjectId: localId }]];
          }),
      ),
      previouslySynced,
      tombstoned,
    };

    // Timer presets are stored outside AppState. Merge cloud → localStorage
    // here (local wins on id collision, matching mergeCloud) so a second device
    // or reinstall recovers them without waiting for RoundTimer to remount.
    const cloudPresets: CustomTimerPreset[] = live(presetsQ.data as Row<'timer_presets'>[] | null).map(p => ({
      id: lid(p.id),
      label: p.label,
      rounds: p.rounds,
      workSec: p.work_sec,
      restSec: p.rest_sec,
      createdAt: p.created_at,
    }));
    const localPresets = loadCustomPresets();
    const presetIds = new Set(localPresets.map(p => p.id));
    const mergedPresets = [
      ...localPresets,
      ...cloudPresets.filter(p => !presetIds.has(p.id) && !previouslySynced.has(p.id)),
    ].filter(p => !tombstoned.has(p.id));
    saveCustomPresets(mergedPresets);
    try {
      window.dispatchEvent(new Event('fightcamp-presets-changed'));
    } catch { /* non-browser test env */ }

    saveIdMap(map);
    return { ok: true, snapshot };
  } catch (e) {
    saveIdMap(map);
    return { ok: false, error: e instanceof Error ? e.message : 'Pull failed.' };
  }
}

/**
 * Re-point pulled coach notes at the local profile id.
 *
 * `pullState` stamps `fighterId` with the auth uuid because that is the only id
 * it has. Locally the same fighter may still be identified by the id
 * `createProfile` generated during offline onboarding, and that local id is the
 * one every consumer filters on. Without a local id to adopt, the uuid is left
 * in place — it is still the correct identifier, just one nothing will match.
 */
function localizeNotes(notes: CoachNote[], localFighterId?: string): CoachNote[] {
  if (!localFighterId) return notes;
  return notes.map(n => (n.fighterId === localFighterId ? n : { ...n, fighterId: localFighterId }));
}

/**
 * Conservative union merge: cloud records fill in anything missing locally, but
 * a record present on both sides keeps the LOCAL copy (the active device wins).
 * After logout/reset the local store is empty, so this restores everything.
 * Subscription is intentionally never pulled — it's owned by RevenueCat/Stripe.
 */
export function mergeCloud(state: AppState, c: CloudSnapshot): AppState {
  // A cloud row whose local id this device already knew about, but which is no
  // longer in local state, was deleted here — restoring it would undo the
  // delete on every sign-in. Rows this device has never seen still come down,
  // which is what makes cross-device restore work.
  const deletedHere = c.previouslySynced;
  // …and a row another device tombstoned has to be removed from local state.
  // The union below only ever ADDS cloud rows, so without this a delete made on
  // one device could never reach a device that already held the record.
  const deletedElsewhere = c.tombstoned;
  const union = <T extends { id: string }>(local: T[], cloud: T[]): T[] => {
    const kept = local.filter(x => !deletedElsewhere.has(x.id));
    const ids = new Set(kept.map(x => x.id));
    return [...kept, ...cloud.filter(x => !ids.has(x.id) && !deletedHere.has(x.id))];
  };

  const camps = union(state.camps, c.camps);

  // The camp-keyed metadata maps have to be filtered by the SAME rule as the
  // camps themselves. `union` drops a deleted camp and its row-based logs, but
  // these maps are keyed by camp id (`${campId}-…` for the session/day maps,
  // the bare camp id for game plans), so merging them wholesale re-seeded
  // completed sessions and a game plan for a camp that no longer exists —
  // undoing half of deleteCamp's cascade on the next pull.
  // Prefix matching, the exact inverse of deleteCamp's cascade — generateId()
  // ids contain a hyphen of their own, so splitting the key on '-' would not be
  // safe.
  const liveCampIds = new Set(camps.map(camp => camp.id));
  const campPrefixes = camps.map(camp => `${camp.id}-`);
  // The dismissal keys use a colon separator (`${campId}:${week}:${kind}`), not
  // the hyphen the session maps use, so they need their own prefix list.
  const campKeyPrefixes = camps.map(camp => `${camp.id}:`);

  // Fight results are merged up here rather than inline below because saved AI
  // analyses are filed against either a camp or a fight, and pruning them needs
  // to know which fights survived the merge.
  const fightResults = union(state.fightResults ?? [], c.fightResults);
  const liveFightIds = new Set(fightResults.map(r => r.id));
  const forLiveCamps = (map: Record<string, boolean>): Record<string, boolean> =>
    Object.fromEntries(
      Object.entries(map).filter(([k]) => campPrefixes.some(prefix => k.startsWith(prefix))),
    );

  // The active camp can itself have been deleted on another device, in which
  // case pointing at it would leave the dashboard rendering a camp that is no
  // longer in `camps`.
  const activeStillExists =
    state.activeCamp !== null && liveCampIds.has(state.activeCamp.id);

  const currentUser = state.currentUser ?? c.profile;

  return {
    ...state,
    currentUser,
    fighters: c.profile && !state.fighters.some(f => f.id === c.profile!.id)
      ? [...state.fighters, c.profile]
      : state.fighters,
    camps,
    activeCamp: activeStillExists ? state.activeCamp : (camps[camps.length - 1] ?? null),
    workoutLogs: union(state.workoutLogs, c.workoutLogs),
    sparringLogs: union(state.sparringLogs, c.sparringLogs),
    conditioningTests: union(state.conditioningTests, c.conditioningTests),
    weightEntries: union(state.weightEntries, c.weightEntries),
    nutritionLogs: union(state.nutritionLogs, c.nutritionLogs),
    hrvEntries: union(state.hrvEntries ?? [], c.hrvEntries),
    fightResults,
    // Coach notes merge like every other collection, but only the cloud side is
    // ever written by anyone but this device: a fighter's local `coachNotes`
    // are their own local-fighter notes, and the coach's arrive here. `union`
    // already handles both directions — a note the coach retracted comes down
    // tombstoned and is dropped, and one the fighter dismissed locally is not
    // resurrected.
    //
    // `fighterId` is re-pointed at the LOCAL profile id, and this is load-bearing
    // rather than cosmetic. `pullState` can only stamp the auth uuid (it has no
    // local state to consult), but a fighter who onboarded before signing in
    // keeps their locally-generated `currentUser.id` — the line above this one
    // resolves `currentUser` local-first. Dashboard selects the note to surface
    // with `n.fighterId === currentUser.id`, so leaving the uuid on the row
    // means the note syncs down correctly and then renders nowhere.
    coachNotes: union(state.coachNotes ?? [], localizeNotes(c.coachNotes, currentUser?.id)),
    // Cloud first so local keys win on conflict. Both sides are filtered to the
    // surviving camps — the local maps too, or metadata for a camp deleted on
    // another device would outlive the camp itself.
    completedSessions: { ...forLiveCamps(c.completedSessions), ...forLiveCamps(state.completedSessions) },
    dayOverrides: { ...forLiveCamps(c.dayOverrides), ...forLiveCamps(state.dayOverrides) },
    gamePlans: Object.fromEntries(
      [...Object.entries(c.gamePlans), ...Object.entries(state.gamePlans)]
        .filter(([campId]) => liveCampIds.has(campId)),
    ),
    gamification: state.gamification ?? c.gamification ?? undefined,
    // Per-KEY merge, unlike the object-level fields around it: createDefaultState
    // always materializes a dashboardPrefs object, so object-level local-wins
    // would let a fresh device's defaults shadow the account's synced choices
    // forever (and the next push would overwrite them). A key the local
    // device has actually set wins; one it never touched fills from cloud.
    dashboardPrefs: state.dashboardPrefs || c.dashboardPrefs
      ? {
          progressWidgetCollapsed:
            state.dashboardPrefs?.progressWidgetCollapsed ?? c.dashboardPrefs?.progressWidgetCollapsed ?? false,
          progressWidgetHidden:
            state.dashboardPrefs?.progressWidgetHidden ?? c.dashboardPrefs?.progressWidgetHidden ?? false,
          weightUnit: state.dashboardPrefs?.weightUnit ?? c.dashboardPrefs?.weightUnit,
        }
      : undefined,
    fitbitConfig: state.fitbitConfig ?? c.fitbitConfig ?? undefined,
    // The three slices that used to stop at the device. Each is filtered to the
    // surviving camps for the same reason the session maps are: they are
    // camp-scoped, and merging them wholesale would re-seed an adaptation or a
    // scored fight for a camp another device deleted.
    //
    // `union` is right for adaptations and corner sessions — they are id'd
    // records, and the same delete semantics apply — but NOT for the dismissal
    // list, which is a set of keys with no ids and no tombstones. A union of
    // sets is the honest merge there: undismissing is not an action the app
    // offers, so a key on either side stays dismissed.
    campAdaptations: union(state.campAdaptations ?? [], c.campAdaptations)
      .filter(a => liveCampIds.has(a.campId)),
    cornerSessions: union(state.cornerSessions ?? [], c.cornerSessions)
      .filter(s => liveCampIds.has(s.campId)),
    dismissedAdaptations: [
      ...new Set([...(state.dismissedAdaptations ?? []), ...c.dismissedAdaptations]),
    ].filter(k => campKeyPrefixes.some(prefix => k.startsWith(prefix))),
    // Cloud first so a locally-regenerated analysis wins over the stored one.
    // Keyed on `${kind}:${subjectId}`, so filtering by the subject being live
    // needs the id back out of the key.
    aiAnalyses: Object.fromEntries(
      [...Object.entries(c.aiAnalyses), ...Object.entries(state.aiAnalyses ?? {})]
        .filter(([, a]) => liveCampIds.has(a.subjectId) || liveFightIds.has(a.subjectId)),
    ),
  };
}

// ─── Server-verified entitlement (read-only) ────────────────────────────────

/**
 * Reads the signed-in user's server-authoritative subscription from the tables
 * the payment webhooks maintain — `stripe_subscriptions` (web checkout) and
 * `revenuecat_subscriptions` (App Store). RLS lets a user read only their own
 * rows, and nothing client-side can write them. Checking both here is what
 * makes an entitlement follow the account across platforms: an App Store
 * subscriber who signs in on the web gets Pro there too.
 *
 * Returns:
 *   - `null` when Supabase is unconfigured, offline/errored, or there is no row
 *     in either table (the caller should leave the subscription unchanged).
 *   - the best ACTIVE entitlement (coach_pro outranks fighter_pro) with its
 *     source (`'stripe_server'` / `'revenuecat_server'`).
 *   - a free sentinel `{ tier: 'free', ... }` when rows exist but none is
 *     active, so the caller can downgrade a previously server-verified user.
 */
export async function fetchServerSubscription(userId: string): Promise<SubscriptionState | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;
  try {
    const [stripeQ, rcQ] = await Promise.all([
      supabase
        .from('stripe_subscriptions')
        .select('tier,status,current_period_end')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('revenuecat_subscriptions')
        .select('tier,expires_at')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    // A failed read makes that source UNKNOWN, not "no row" — with one
    // exception: the table not existing yet (schema migration not applied) is
    // a conclusive "no row", or the whole function would go dark during
    // rollout. The distinction matters below: the free sentinel (which lets
    // the caller downgrade a server-verified user) is only returned when
    // every source answered conclusively, so a transient error on one table
    // can never read as "your subscription is gone".
    const missingTable = (e: { code?: string } | null): boolean =>
      e?.code === 'PGRST205' || e?.code === '42P01';
    const stripeConclusive = !stripeQ.error || missingTable(stripeQ.error);
    const rcConclusive = !rcQ.error || missingTable(rcQ.error);
    const stripe = stripeQ.error ? null : stripeQ.data;
    const rc = rcQ.error ? null : rcQ.data;

    const candidates: SubscriptionState[] = [];

    if (stripe) {
      // Keep access through past_due (Stripe's dunning/retry grace) so a
      // transient failed charge doesn't instantly lock a paying user out. The
      // tier check is inline so TS narrows tier (typed `string`).
      const activeStatus = stripe.status === 'active' || stripe.status === 'trialing' || stripe.status === 'past_due';
      const unexpired = !stripe.current_period_end || new Date(stripe.current_period_end) > new Date();
      if (activeStatus && unexpired && (stripe.tier === 'fighter_pro' || stripe.tier === 'coach_pro')) {
        candidates.push({ tier: stripe.tier, expiresAt: stripe.current_period_end, source: 'stripe_server' });
      }
    }

    if (rc) {
      // RevenueCat rows carry no status — active is simply unexpired (a
      // canceled sub keeps its future expires_at until it actually lapses,
      // which is exactly App Store semantics).
      const unexpired = !rc.expires_at || new Date(rc.expires_at) > new Date();
      if (unexpired && (rc.tier === 'fighter_pro' || rc.tier === 'coach_pro')) {
        candidates.push({ tier: rc.tier, expiresAt: rc.expires_at, source: 'revenuecat_server' });
      }
    }

    if (candidates.length > 0) {
      // coach_pro outranks fighter_pro; within a tier, the later-expiring
      // (or non-expiring) grant wins.
      candidates.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === 'coach_pro' ? -1 : 1;
        if (!a.expiresAt || !b.expiresAt) return a.expiresAt ? 1 : -1;
        return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime();
      });
      return candidates[0];
    }
    // No active entitlement found. Downgrading is only safe when both sources
    // actually answered — and only meaningful when a row exists to be expired.
    if (!stripeConclusive || !rcConclusive) return null;
    if (!stripe && !rc) return null;
    return { tier: 'free', expiresAt: null, source: stripe ? 'stripe_server' : 'revenuecat_server' };
  } catch {
    return null;
  }
}
