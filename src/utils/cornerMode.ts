import type { AppState, CornerRound, CornerSession, FightRound, GamePlan } from '../types';

/**
 * Corner Mode — the fight itself.
 *
 * `GamePlan` already stored `earlyRoundPlan`, `midRoundPlan`, `lateRoundPlan`
 * and `cornerInstructions`, and none of them were ever shown at the only moment
 * they matter. This module decides which segment a given round belongs to, and
 * converts what the corner tapped into the shape the post-fight form expects.
 *
 * Everything here is pure. The timer and the screen live in
 * `components/CornerMode.tsx`; keeping the round maths out of the component is
 * what makes it testable without driving a clock.
 */

export type PlanSegment = 'early' | 'mid' | 'late';

/**
 * Which third of the fight a round belongs to.
 *
 * Thirds rather than fixed round numbers, because "late" means something
 * different in a 3-round amateur bout and a 12-round title fight. The boundaries
 * round so that a 3-rounder maps cleanly to one round per segment, which is the
 * most common case in this app's audience.
 */
export function planSegmentForRound(roundNumber: number, totalRounds: number): PlanSegment {
  if (totalRounds <= 1) return 'early';
  const clamped = Math.min(Math.max(1, roundNumber), totalRounds);
  const third = totalRounds / 3;
  if (clamped <= Math.ceil(third)) return 'early';
  if (clamped <= Math.ceil(third * 2)) return 'mid';
  return 'late';
}

export const SEGMENT_LABELS: Record<PlanSegment, string> = {
  early: 'Early rounds',
  mid: 'Middle rounds',
  late: 'Late rounds',
};

/** The game plan text for a round, or null when the plan has nothing to say. */
export function planTextForRound(
  plan: GamePlan | undefined,
  roundNumber: number,
  totalRounds: number,
): { segment: PlanSegment; text: string } | null {
  if (!plan) return null;
  const segment = planSegmentForRound(roundNumber, totalRounds);
  const text = segment === 'early' ? plan.earlyRoundPlan
    : segment === 'mid' ? plan.midRoundPlan
    : plan.lateRoundPlan;
  const trimmed = (text ?? '').trim();
  return trimmed ? { segment, text: trimmed } : null;
}

// ─── Session helpers ─────────────────────────────────────────────────────────

/** The camp's live (started, not yet consumed) corner session, if any. */
export function activeCornerSession(state: AppState, campId: string): CornerSession | null {
  const sessions = (state.cornerSessions ?? []).filter(s => s.campId === campId && !s.consumed);
  if (sessions.length === 0) return null;
  // Newest wins — a fighter who started Corner Mode twice means the second one.
  return sessions.reduce((best, s) => (s.startedAt > best.startedAt ? s : best));
}

/** Merge a scored round into a session, replacing any earlier score for it. */
export function upsertCornerRound(session: CornerSession, round: CornerRound): CornerSession {
  const others = session.rounds.filter(r => r.roundNumber !== round.roundNumber);
  return {
    ...session,
    rounds: [...others, round].sort((a, b) => a.roundNumber - b.roundNumber),
  };
}

// ─── Handoff to the post-fight form ──────────────────────────────────────────

/**
 * Neutral defaults for anything the corner did not get to tap.
 *
 * 3 across the board is the same midpoint `FightResultForm` starts an empty
 * round on, so an unscored round is indistinguishable from one the fighter
 * never filled in — which is exactly right. Inventing a score for a round
 * nobody assessed would poison `factorTuner`, which learns readiness weights
 * from these numbers.
 */
const NEUTRAL = 3 as const;

export function cornerRoundsToFightRounds(session: CornerSession): FightRound[] {
  const scored = new Map(session.rounds.map(r => [r.roundNumber, r]));
  // Rounds actually fought — the last round anyone scored, or the full card
  // when the corner tapped nothing at all.
  const fought = session.rounds.length > 0
    ? Math.max(...session.rounds.map(r => r.roundNumber))
    : session.totalRounds;

  return Array.from({ length: fought }, (_, i) => {
    const n = i + 1;
    const r = scored.get(n);
    return {
      roundNumber: n,
      selfScore: r?.selfScore ?? NEUTRAL,
      opponentPressure: r?.opponentPressure ?? NEUTRAL,
      cardio: r?.cardio ?? NEUTRAL,
      damageDealt: r?.damageDealt ?? 'none',
      damageTaken: r?.damageTaken ?? 'none',
      // Free text is genuinely absent rather than defaulted — the corner had no
      // time to type, and an empty string is the honest record of that.
      workedWell: '',
      didntWork: '',
      cornerAdjustment: r?.cornerAdjustment,
    };
  });
}

/** True when a session carries anything worth prefilling the form with. */
export function hasScoredRounds(session: CornerSession | null): boolean {
  if (!session) return false;
  return session.rounds.some(r =>
    r.selfScore !== undefined
    || r.opponentPressure !== undefined
    || r.cardio !== undefined
    || r.damageDealt !== undefined
    || r.damageTaken !== undefined
    || (r.cornerAdjustment ?? '').trim() !== '',
  );
}
