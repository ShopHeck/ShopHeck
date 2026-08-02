import { supabase } from './supabase';
import type { Database } from './database.types';

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
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { data, error } = await supabase.rpc('redeem_coach_invite', { invite_code: code.trim().toUpperCase() });
  if (error) return { error: error.message };
  return { coachId: data as string };
}

// ── Fighter-initiated invites (the outbound viral loop) ──────────────────────
//
// The mirror of the coach flow above: the FIGHTER mints a code and shares it
// out with the app link; the invited coach installs, signs up as a coach, and
// redeems. Same link row either way.

/** Fighter: mint a code to hand OUT to a coach (retries once on collision). */
export async function createFighterInvite(fighterId: string): Promise<{ code?: string; error?: string }> {
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCode();
    const { error } = await supabase.from('fighter_invites').insert({ code, fighter_id: fighterId });
    if (!error) return { code };
    if (error.code !== '23505') return { error: error.message }; // not a uniqueness clash
  }
  return { error: 'Could not generate a code, please try again.' };
}

/** Fighter: newest still-valid outgoing invite codes (reused across shares). */
export async function listFighterInvites(fighterId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('fighter_invites')
    .select('code, expires_at')
    .eq('fighter_id', fighterId)
    .order('created_at', { ascending: false });
  const now = Date.now();
  return (data ?? [])
    .filter(r => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .map(r => r.code);
}

/** Coach: redeem a code a fighter shared. Returns the fighter's id on success. */
export async function redeemFighterInvite(code: string): Promise<{ fighterId?: string; error?: string }> {
  if (!supabase) return { error: 'Cloud sync is not configured.' };
  const { data, error } = await supabase.rpc('redeem_fighter_invite', { invite_code: code.trim().toUpperCase() });
  if (error) return { error: error.message };
  return { fighterId: data as string };
}

/** Fighter: drop the current coach link(s). */
export async function unlinkAllCoaches(fighterId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('coach_fighter_links').delete().eq('fighter_id', fighterId);
}

/** Coach: roster of linked fighters, each with their most recent camp. */
export async function listLinkedFighters(coachId: string): Promise<LinkedFighter[]> {
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

/** Coach: a linked fighter's full data for the detail view. */
export async function getFighterDetail(fighterId: string): Promise<FighterDetail> {
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
