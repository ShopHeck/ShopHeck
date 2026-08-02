/**
 * Input guards for the numbers that drive fight-safety math.
 *
 * `min`/`max` on an `<input type="number">` are advisory: the browser only
 * enforces them during native form submission, and every form in this app
 * submits through an onClick handler. A weigh-in of 0, -40 or 99999 lbs was
 * being accepted and written straight into the cut projection, the weight
 * chart, the readiness score and the "Weight Cut Concern" alert.
 */

import { fromDisplayWeight, toDisplayWeight, type WeightUnit } from './units';

/** Plausible human bodyweight in pounds — deliberately wide, just not absurd. */
export const MIN_WEIGHT_LBS = 50;
export const MAX_WEIGHT_LBS = 700;

/** Plausible RMSSD in milliseconds. */
export const MIN_RMSSD_MS = 1;
export const MAX_RMSSD_MS = 300;

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Parses a form field to a bodyweight in lbs, or null when it isn't one. */
export function parseWeightLbs(raw: string): number | null {
  const n = parseFloat(raw);
  return inRange(n, MIN_WEIGHT_LBS, MAX_WEIGHT_LBS) ? n : null;
}

/**
 * Parses a form field typed in the user's DISPLAY unit and returns stored lbs
 * (or null when implausible). The bounds are checked on the lbs value, so a
 * kg user can't smuggle in a 500 kg weigh-in that reads fine in kg.
 */
export function parseWeightInput(raw: string, unit: WeightUnit): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  const lbs = fromDisplayWeight(n, unit);
  return inRange(lbs, MIN_WEIGHT_LBS, MAX_WEIGHT_LBS) ? lbs : null;
}

/** Parses a form field to an RMSSD reading in ms, or null when it isn't one. */
export function parseRmssdMs(raw: string): number | null {
  const n = parseFloat(raw);
  return inRange(n, MIN_RMSSD_MS, MAX_RMSSD_MS) ? n : null;
}

/** Shared copy for a rejected bodyweight, so every form says the same thing. */
export const WEIGHT_RANGE_HINT = `Enter a weight between ${MIN_WEIGHT_LBS} and ${MAX_WEIGHT_LBS} lbs.`;

/** Unit-aware variant of WEIGHT_RANGE_HINT (bounds converted for display). */
export function weightRangeHint(unit: WeightUnit): string {
  if (unit === 'lbs') return WEIGHT_RANGE_HINT;
  return `Enter a weight between ${toDisplayWeight(MIN_WEIGHT_LBS, 'kg')} and ${toDisplayWeight(MAX_WEIGHT_LBS, 'kg')} kg.`;
}
