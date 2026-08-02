// Weight-unit preference (audit R8).
//
// Everything is STORED in lbs — existing data, camp targets, weight-class
// definitions, the cut math in weightCut.ts, and HealthKit writes all predate
// this preference and stay untouched. The preference is purely a display and
// input conversion layer at the UI edge: metric users see and type kg, and
// the value crosses fromDisplayWeight() exactly once on the way in.

export type WeightUnit = 'lbs' | 'kg';

export const LBS_PER_KG = 2.20462;

/** Stored lbs → the number to SHOW (kg rounded to 1 decimal). */
export function toDisplayWeight(lbs: number, unit: WeightUnit): number {
  if (unit === 'lbs') return Math.round(lbs * 10) / 10;
  return Math.round((lbs / LBS_PER_KG) * 10) / 10;
}

/** A number the user TYPED in their unit → stored lbs (2 decimals — enough
 *  that a kg value round-trips back to the same 1-decimal display). */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  if (unit === 'lbs') return value;
  return Math.round(value * LBS_PER_KG * 100) / 100;
}

/** Stored lbs → "155 lbs" / "70.3 kg". `decimals` caps fraction digits for
 *  lbs (kg always shows one decimal unless it's whole). */
export function formatWeight(lbs: number, unit: WeightUnit): string {
  const v = toDisplayWeight(lbs, unit);
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${text} ${unit}`;
}

/** Delta formatting for "to go" / gained-lost strings: always signed unit text,
 *  e.g. "4.5 lbs" / "2.0 kg" (sign handling stays with the caller's copy). */
export function formatWeightDelta(lbsDelta: number, unit: WeightUnit): string {
  const v = Math.abs(toDisplayWeight(lbsDelta, unit));
  const text = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${text} ${unit}`;
}
