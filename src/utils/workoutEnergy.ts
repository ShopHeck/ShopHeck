/**
 * Active calories for a logged session: parsing what the fighter typed, and an
 * opt-in estimate for fighters without a watch or tracker.
 *
 * Pure — no React, no Capacitor — so the numbers are unit-tested directly.
 */

import type { FightCamp, SessionType, WeightEntry } from '../types';
import { LBS_PER_KG } from './units';

/** Upper bound for one session. Anything above is a typo, not a workout. */
export const MAX_SESSION_KCAL = 5000;

/**
 * MET range per session type, easy → all-out, from the Compendium of Physical
 * Activities. RPE 1–10 interpolates across the range.
 */
const MET_RANGE: Record<Exclude<SessionType, 'rest'>, [number, number]> = {
  sparring:     [7.8, 12.8], // boxing, sparring → boxing, in ring
  skill:        [5.5, 10.3], // boxing, punching bag → martial arts, moderate pace
  conditioning: [4.3, 9.8],  // circuit training, moderate → running, 6 mph
  strength:     [3.5, 6.0],  // resistance training, multiple exercises → vigorous
  recovery:     [2.3, 2.5],  // stretching, mild → yoga, Hatha
};

/**
 * Active (net) kcal for a session, or null when it cannot be estimated.
 *
 * MET counts resting metabolism as 1, while Apple Health's Active Energy
 * excludes it, so the estimate uses MET − 1: kcal = (MET − 1) × kg × hours.
 */
export function estimateActiveKcal(o: {
  sessionType: SessionType;
  durationMin: number;
  rpe: number;
  weightLbs: number | null;
}): number | null {
  if (o.sessionType === 'rest') return null;
  if (!(o.durationMin > 0) || !(o.weightLbs && o.weightLbs > 0)) return null;
  const [lo, hi] = MET_RANGE[o.sessionType];
  const rpe = Math.min(10, Math.max(1, Number.isFinite(o.rpe) ? o.rpe : 1));
  const met = lo + ((rpe - 1) / 9) * (hi - lo);
  const kcal = (met - 1) * (o.weightLbs / LBS_PER_KG) * (o.durationMin / 60);
  return Math.min(MAX_SESSION_KCAL, Math.round(kcal));
}

/**
 * The fighter's weight (lbs) on `date`: the camp's latest weigh-in on or before
 * it, else the camp's starting weight. A later weigh-in never applies to an
 * earlier session.
 */
export function bodyWeightLbsOn(camp: FightCamp, entries: WeightEntry[], date: string): number | null {
  let latest: WeightEntry | null = null;
  for (const e of entries) {
    if (e.campId !== camp.id || !(e.weight > 0) || e.date > date) continue;
    if (!latest || e.date > latest.date) latest = e;
  }
  if (latest) return latest.weight;
  return camp.currentWeight > 0 ? camp.currentWeight : null;
}

/**
 * What the fighter typed: '' is "not tracked" (undefined), a whole number in
 * 1..MAX_SESSION_KCAL is the value, anything else is 'invalid'.
 */
export function parseSessionKcal(raw: string): number | undefined | 'invalid' {
  const s = raw.trim();
  if (s === '') return undefined;
  if (!/^\d+$/.test(s)) return 'invalid';
  const n = Number(s);
  return n >= 1 && n <= MAX_SESSION_KCAL ? n : 'invalid';
}
