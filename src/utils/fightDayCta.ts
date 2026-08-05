import { endOfDay, parseISO } from 'date-fns';
import type { CornerSession } from '../types';

/**
 * Which fight-night call to action the dashboard should show.
 *
 * Extracted from `Dashboard.tsx` because the fight-day handover is fiddlier
 * than it looks and got it wrong once already: `parseISO('2026-08-05')` is local
 * MIDNIGHT, so `parseISO(fightDate) < new Date()` is already true at 9am ON
 * fight day. That showed the post-fight CTA before the fight, and — once Corner
 * Mode was gated behind it — made Corner Mode unreachable on the single day it
 * exists for. Caught in review on PR #91; pinned by tests here so the boundary
 * cannot drift back.
 */
export type FightCta = 'corner' | 'post-fight' | 'none';

export interface FightCtaInput {
  fightDate: string | undefined;
  /** Days until the fight, already clamped at 0 by getDaysUntilFight. */
  daysUntil: number;
  /** True once a FightResult exists for this camp. */
  hasResult: boolean;
  /** The camp's open corner session, if any. */
  cornerSession: Pick<CornerSession, 'completedAt'> | null;
  /** Days before the fight that Corner Mode becomes offerable. */
  cornerWindowDays?: number;
}

export function fightCta(
  { fightDate, daysUntil, hasResult, cornerSession, cornerWindowDays = 7 }: FightCtaInput,
  now: Date = new Date(),
): FightCta {
  // Nothing to offer without a scheduled fight, and nothing left to prompt for
  // once the result is recorded.
  if (!fightDate || hasResult) return 'none';

  // The fight DAY belongs to Corner Mode. Post-fight takes over once that day is
  // genuinely over, or as soon as the corner marks the fight finished — so a
  // fighter who fought at 2pm and wants to log it at 6pm is not told to come
  // back tomorrow.
  const fightDayOver = endOfDay(parseISO(fightDate)) < now;
  if (fightDayOver || cornerSession?.completedAt) return 'post-fight';

  return daysUntil <= cornerWindowDays ? 'corner' : 'none';
}
