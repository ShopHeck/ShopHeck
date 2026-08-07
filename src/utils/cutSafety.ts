/**
 * Weight-cut safety signals — pure, side-effect free.
 *
 * Needed rate (lbs/day × 7) is what the scale still demands. Observed rate is
 * what the fighter has actually been doing. Both can be aggressive; the UI
 * should warn before either becomes a medical problem.
 *
 * Thresholds are deliberately conservative and NOT medical advice. They flag
 * "talk to your coach/doctor" rather than prescribing a cut.
 */

import type { CutProjection } from './weightCut';

/** Weekly loss above this (absolute lbs) is flagged when body-weight % is mild. */
export const AGGRESSIVE_LBS_PER_WEEK = 2.0;
/** Weekly loss above this is extreme regardless of body weight. */
export const EXTREME_LBS_PER_WEEK = 3.5;
/** ~1% body weight / week is a common soft ceiling for sustainable cuts. */
export const AGGRESSIVE_PCT_BODY_PER_WEEK = 1.0;
export const EXTREME_PCT_BODY_PER_WEEK = 1.5;

export type CutSafetyLevel = 'ok' | 'aggressive' | 'extreme';

export interface CutSafety {
  level: CutSafetyLevel;
  /** Which rate triggered the flag (needed vs observed). */
  source: 'needed' | 'observed' | 'none';
  lbsPerWeek: number;
  pctBodyPerWeek: number;
  /** Short UI copy; empty when level is ok. */
  message: string;
}

function classifyWeekly(lbsPerWeek: number, bodyWeight: number): CutSafetyLevel {
  if (!(lbsPerWeek > 0) || !(bodyWeight > 0)) return 'ok';
  const pct = (lbsPerWeek / bodyWeight) * 100;
  if (lbsPerWeek >= EXTREME_LBS_PER_WEEK || pct >= EXTREME_PCT_BODY_PER_WEEK) return 'extreme';
  if (lbsPerWeek >= AGGRESSIVE_LBS_PER_WEEK || pct >= AGGRESSIVE_PCT_BODY_PER_WEEK) return 'aggressive';
  return 'ok';
}

function messageFor(level: CutSafetyLevel, lbsPerWeek: number, source: 'needed' | 'observed'): string {
  if (level === 'ok') return '';
  const rate = `${lbsPerWeek.toFixed(1)} lb/week`;
  if (level === 'extreme') {
    return source === 'needed'
      ? `Extreme pace required (${rate}). This cut may not be safe — talk to your coach before pushing harder.`
      : `You're losing weight very fast (${rate}). Slow the cut and check in with your coach or doctor.`;
  }
  return source === 'needed'
    ? `Aggressive pace required (${rate}). Prefer more time or a smaller cut when you can.`
    : `Recent loss rate is aggressive (${rate}). Watch energy, mood, and recovery.`;
}

/**
 * Worst-of needed vs observed weekly rate, using current body weight for %.
 *
 * Only applies while the cut is still in progress (`trackable` and not `made`).
 */
export function evaluateCutSafety(proj: CutProjection): CutSafety {
  if (!proj.trackable || proj.status === 'made' || proj.status === 'no-fight') {
    return { level: 'ok', source: 'none', lbsPerWeek: 0, pctBodyPerWeek: 0, message: '' };
  }

  const body = proj.currentWeight > 0 ? proj.currentWeight : proj.startWeight;
  const neededWeek = Math.max(0, proj.lbsPerDayNeeded) * 7;
  const observedWeek = Math.max(0, proj.lbsPerDayActual) * 7;

  const neededLevel = classifyWeekly(neededWeek, body);
  const observedLevel = proj.trendEstablished ? classifyWeekly(observedWeek, body) : 'ok';

  const rank = { ok: 0, aggressive: 1, extreme: 2 } as const;
  const useObserved = rank[observedLevel] > rank[neededLevel];
  const level = useObserved ? observedLevel : neededLevel;
  const source: CutSafety['source'] = level === 'ok' ? 'none' : useObserved ? 'observed' : 'needed';
  const lbsPerWeek = useObserved ? observedWeek : neededWeek;
  const pctBodyPerWeek = body > 0 ? +((lbsPerWeek / body) * 100).toFixed(2) : 0;

  return {
    level,
    source,
    lbsPerWeek: +lbsPerWeek.toFixed(2),
    pctBodyPerWeek,
    message: source === 'none' ? '' : messageFor(level, lbsPerWeek, source),
  };
}
