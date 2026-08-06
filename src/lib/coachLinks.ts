import { getSupabase } from './supabase';
import type { Database } from './database.types';
import type { FightCamp, WeightEntry } from '../types';

/**
 * Phase 4 — coach ↔ fighter linking over the cloud.
 *
 * A coach generates a short invite code; a fighter redeems it (via the
 * `redeem_coach_invite` RPC) which creates a `coach_fighter_links` row. The
 * coach can then read that fighter's data through the `is_coach_of` RLS
 * policies already in the schema. All functions require a signed-in user.
 */

type CampRow = Database['public']['Tables']['camps']['Row'];

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no confusable chars (0/O, 1/I/L)

function generateCode(len = 6): string {
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export interface LinkedFighter {
  id: string;
  name: string;
  sport: string;
  weightClass: string;
  experience: string;
  gym: string | null;
  linkedAt: string;
  latestCamp: CampRow | null;
}

export interface FighterDetail {
  camps: CampRow[];
  workouts: Database['public']['Tables']['workout_logs']['Row'][];
  sparring: Database['public']['Tables']['sparring_logs']['Row'][];
  weights: Database['public']['Tables']['weight_entries']['Row'][];
}

/** Coach: mint a shareable invite code (retries once on the unlikely collision). */
export async function createInvite(coachId: string): Promise<{ code?: string; error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    const { error } = await supabase.from('coach_invites').insert({ code, coach_id: coachId });
    if (!error) return { code };
    if (error.code !== '23505') return { error: error.message }; // not a uniqueness clash
  }
  return { error: 'Could not generate a code, please try again.' };
}

/** Coach: list previously generated, still-valid invite codes. */
export async function listInvites(coachId: string): Promise<string[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('coach_invites')
    .select('code, expires_at')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });
  const now = Date.now();
  return (data ?? [])
    .filter(r => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map(r => r.code);
}

/** Fighter: redeem a coach's invite code. Returns the coach's id on success. */
export async function redeemInvite(code: string): Promise<{ coachId?: string; error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { data, error } = await supabase.rpc('redeem_coach_invite', { invite_code: code.trim().toUpperCase() });
  if (error) return { error: error.message };
  return { coachId: data as string };
}

// ── Fighter-initiated invites (the outbound viral loop) ──────────────────────
//
// The mirror of the coach flow above: the FIGHTER mints a code and shares it
// out with the app link; the invited coach installs, signs up as a coach, and
// redeems. Same link row either way. Fighter codes are SINGLE-USE (consumed
// by redeem_fighter_invite) because they grant access to the minter's data —
// so every share mints a fresh one.

/** Fighter: mint a single-use code to hand OUT to a coach (retries once on collision). */
export async function createFighterInvite(fighterId: string): Promise<{ code?: string; error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    const { error } = await supabase.from('fighter_invites').insert({ code, fighter_id: fighterId });
    if (!error) return { code };
    if (error.code !== '23505') return { error: error.message }; // not a uniqueness clash
  }
  return { error: 'Could not generate a code, please try again.' };
}

/** Coach: redeem a code a fighter shared. Returns the fighter's id on success. */
export async function redeemFighterInvite(code: string): Promise<{ fighterId?: string; error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { data, error } = await supabase.rpc('redeem_fighter_invite', { invite_code: code.trim().toUpperCase() });
  if (error) return { error: error.message };
  return { fighterId: data as string };
}

/** Fighter: is there an active coach link? Powers the linked/Unlink UI, which
 *  must reflect the server (a coach can create the link from their side via a
 *  shared fighter code — the fighter still needs the revoke button). */
export async function hasActiveCoachLink(fighterId: string): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;
  const { data } = await supabase
    .from('coach_fighter_links')
    .select('coach_id')
    .eq('fighter_id', fighterId)
    .eq('status', 'active')
    .limit(1);
  return (data ?? []).length > 0;
}

/** Fighter: drop the current coach link(s). */
export async function unlinkAllCoaches(fighterId: string): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase.from('coach_fighter_links').delete().eq('fighter_id', fighterId);
}

/** Coach: roster of linked fighters, each with their most recent camp. */
export async function listLinkedFighters(coachId: string): Promise<LinkedFighter[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data: links, error } = await supabase
    .from('coach_fighter_links')
    .select('fighter_id, created_at')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  if (error || !links || links.length === 0) return [];

  const ids = links.map(l => l.fighter_id);
  const linkedAt = new Map(links.map(l => [l.fighter_id, l.created_at]));

  const [{ data: profiles }, { data: camps }] = await Promise.all([
    supabase.from('profiles').select('*').in('id', ids),
    supabase.from('camps').select('*').in('user_id', ids).is('deleted_at', null),
  ]);

  const latestByFighter = new Map<string, CampRow>();
  for (const c of (camps ?? []) as CampRow[]) {
    const prev = latestByFighter.get(c.user_id);
    if (!prev || new Date(c.created_at).getTime() > new Date(prev.created_at).getTime()) {
      latestByFighter.set(c.user_id, c);
    }
  }

  return (profiles ?? []).map(p => ({
    id: p.id,
    name: p.name,
    sport: p.sport,
    weightClass: p.weight_class,
    experience: p.experience,
    gym: p.gym,
    linkedAt: linkedAt.get(p.id) ?? '',
    latestCamp: latestByFighter.get(p.id) ?? null,
  }));
}

// ── Coach notes over the cloud ───────────────────────────────────────────────
//
// These are deliberately NOT routed through lib/sync.ts, and that is the whole
// point of the feature rather than a shortcut.
//
// `sync.ts` pushes rows the signed-in user owns, keyed by `user_id`. A coach
// note is owned by the coach but attached to *another account's* fighter id and
// *another account's* camp id — there is no `user_id` to key it on, and the
// coach's local `coachNotes` (the `ADD_COACH_NOTE` reducer path) hang off local
// fighter records that have no cloud identity at all. Pushing those would fail
// the `coach_id = auth.uid()` RLS check or, worse, invent a camp_id.
//
// So the cloud path is direct: the coach writes here with real uuids from the
// linked-fighter view, and the fighter reads their own notes through
// `pullState`. That matches the RLS policies exactly — `coach_notes_write` is
// coach-only, `coach_notes_select` is either party.

export interface CloudCoachNote {
  id: string;
  coachId: string;
  coachName: string;
  fighterId: string;
  campId: string;
  category: string;
  content: string;
  createdAt: string;
}

/**
 * Notes on a fighter, newest first. Readable by the fighter themselves and by
 * any coach linked to them — RLS decides which, so this needs no role check.
 */
export async function listCoachNotes(fighterId: string): Promise<CloudCoachNote[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from('coach_notes')
    .select('*')
    .eq('fighter_id', fighterId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  return (data ?? []).map(n => ({
    id: n.id,
    coachId: n.coach_id,
    coachName: n.coach_name,
    fighterId: n.fighter_id,
    campId: n.camp_id,
    category: n.category,
    content: n.content,
    createdAt: n.created_at,
  }));
}

/** Coach: write a note that reaches a remote fighter. All ids are cloud uuids. */
export async function postCoachNote(note: {
  coachId: string;
  coachName: string;
  fighterId: string;
  campId: string;
  category: string;
  content: string;
}): Promise<{ error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { error } = await supabase.from('coach_notes').insert({
    coach_id: note.coachId,
    coach_name: note.coachName,
    fighter_id: note.fighterId,
    camp_id: note.campId,
    category: note.category,
    content: note.content,
  });
  return error ? { error: error.message } : {};
}

/**
 * Coach: retract a note.
 *
 * Tombstoned rather than deleted, matching every other table: the fighter's
 * device has already pulled this note into local state, and `mergeCloud` can
 * only learn about the removal from a `deleted_at` it can see. A hard delete
 * would leave the note on the fighter's phone permanently.
 */
export async function removeCoachNote(noteId: string): Promise<{ error?: string }> {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { error } = await supabase
    .from('coach_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId);
  return error ? { error: error.message } : {};
}

// ── Team overview ────────────────────────────────────────────────────────────

/**
 * One fighter's data, reduced to what the roster table scores on.
 *
 * Domain types rather than raw rows, so `utils/teamOverview.ts` can stay a pure
 * function over the same shapes the rest of the app uses — and can therefore
 * reuse `scheduleAdherence` and `computeCutProjection` instead of growing a
 * second, parallel definition of adherence and cut pace for coaches.
 */
export interface TeamFighterSnapshot {
  fighterId: string;
  name: string;
  sport: string;
  camp: FightCamp | null;
  /** Session ticks, re-keyed with the camp id prefix the scorer expects. */
  completedSessions: Record<string, boolean>;
  /** ISO dates of logged sessions in this camp, newest first. */
  workoutDates: string[];
  weights: WeightEntry[];
}

/** A cloud camp row as the app's own domain type. */
function campFromRow(c: CampRow): FightCamp {
  return {
    id: c.id,
    fightDate: c.fight_date ?? undefined,
    opponent: c.opponent ?? undefined,
    weightClass: c.weight_class as FightCamp['weightClass'],
    currentWeight: c.current_weight,
    targetWeight: c.target_weight,
    rounds: c.rounds,
    roundDuration: c.round_duration,
    sport: c.sport as FightCamp['sport'],
    experienceLevel: c.experience as FightCamp['experienceLevel'],
    campWeeks: c.camp_weeks,
    startDate: c.start_date,
    createdAt: c.created_at,
    isOffSeason: c.is_off_season ?? undefined,
    offSeasonGoal: (c.off_season_goal ?? undefined) as FightCamp['offSeasonGoal'],
  };
}

/**
 * Coach: every linked fighter's current camp, ticks, sessions and weigh-ins.
 *
 * Four queries total regardless of roster size — the naive shape here is one
 * `getFighterDetail` per fighter, which is an N+1 against a table a coach opens
 * on every visit. All four are `.in(...)` over the linked ids and all four are
 * served by the same `is_coach_of` RLS policies the detail view already uses.
 */
export async function getTeamSnapshots(coachId: string): Promise<TeamFighterSnapshot[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data: links } = await supabase
    .from('coach_fighter_links')
    .select('fighter_id')
    .eq('coach_id', coachId)
    .eq('status', 'active');
  const ids = (links ?? []).map(l => l.fighter_id);
  if (ids.length === 0) return [];

  const [{ data: profiles }, { data: camps }, { data: workouts }, { data: weights }] = await Promise.all([
    supabase.from('profiles').select('*').in('id', ids),
    supabase.from('camps').select('*').in('user_id', ids).is('deleted_at', null),
    supabase.from('workout_logs').select('*').in('user_id', ids).is('deleted_at', null),
    supabase.from('weight_entries').select('*').in('user_id', ids).is('deleted_at', null),
  ]);

  // Newest camp per fighter — the same "current camp" rule the detail view uses.
  const latestByFighter = new Map<string, CampRow>();
  for (const c of (camps ?? []) as CampRow[]) {
    const prev = latestByFighter.get(c.user_id);
    if (!prev || new Date(c.created_at).getTime() > new Date(prev.created_at).getTime()) {
      latestByFighter.set(c.user_id, c);
    }
  }

  return (profiles ?? []).map(p => {
    const row = latestByFighter.get(p.id) ?? null;
    const camp = row ? campFromRow(row) : null;

    // `completed_sessions` is stored RELATIVE to the camp (pushState strips the
    // local camp-id prefix so ticks stay portable across devices). The scorer
    // keys on `${campId}-${week}-${day}-${index}`, so the prefix goes back on
    // — here using the cloud uuid, which is this snapshot's camp id.
    const completedSessions: Record<string, boolean> = {};
    if (row) {
      const stored = (row.completed_sessions ?? {}) as Record<string, boolean>;
      for (const [rel, v] of Object.entries(stored)) completedSessions[`${row.id}-${rel}`] = v;
    }

    return {
      fighterId: p.id,
      name: p.name,
      sport: p.sport,
      camp,
      completedSessions,
      workoutDates: (workouts ?? [])
        .filter(w => w.user_id === p.id && (!row || w.camp_id === row.id))
        .map(w => w.date)
        .sort((a, b) => b.localeCompare(a)),
      weights: (weights ?? [])
        .filter(w => w.user_id === p.id && (!row || w.camp_id === row.id))
        .map(w => ({
          id: w.id,
          campId: w.camp_id,
          date: w.date,
          weight: w.weight,
          notes: w.notes ?? '',
          createdAt: w.created_at,
        })),
    };
  });
}

/** Coach: a linked fighter's full data for the detail view. */
export async function getFighterDetail(fighterId: string): Promise<FighterDetail> {
  const supabase = await getSupabase();
  if (!supabase) return { camps: [], workouts: [], sparring: [], weights: [] };
  const [camps, workouts, sparring, weights] = await Promise.all([
    // Deleted rows are tombstoned, not removed (see lib/sync.ts) — a coach
    // should see the same camp history the fighter does.
    supabase.from('camps').select('*').eq('user_id', fighterId).is('deleted_at', null),
    supabase.from('workout_logs').select('*').eq('user_id', fighterId).is('deleted_at', null),
    supabase.from('sparring_logs').select('*').eq('user_id', fighterId).is('deleted_at', null),
    supabase.from('weight_entries').select('*').eq('user_id', fighterId).is('deleted_at', null),
  ]);
  return {
    camps: (camps.data ?? []) as CampRow[],
    workouts: workouts.data ?? [],
    sparring: sparring.data ?? [],
    weights: weights.data ?? [],
  };
}
