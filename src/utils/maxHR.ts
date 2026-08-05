/**
 * One definition of a fighter's max heart rate.
 *
 * Three screens derived this independently and disagreed on the fallback:
 * `RoundTimer`/`Settings` used `Math.max(160, 220 - age)` with an age default of
 * 25, while `FitnessTrackerHub` used a bare `220 - age` with no floor and a
 * different no-user default (185 vs. 195). Every one of them feeds `getZone()`,
 * so the same heartbeat could land in different zones — and therefore earn
 * different MEP — depending on which screen the fighter happened to be looking
 * at. Only ever visible to users who never set the field in Settings, which is
 * most of them.
 */

/** Age assumed when the profile has none — mid-range for the app's audience. */
export const DEFAULT_AGE = 25;

/**
 * Floor for the age estimate.
 *
 * `220 - age` is a population regression, not a measurement, and it degrades
 * badly at the top of the age range: it puts a 55-year-old at 165, which most
 * conditioned masters fighters exceed in a hard round. Under-estimating max HR
 * pushes every reading into a higher zone and inflates MEP, so the floor is the
 * conservative direction.
 */
export const MAX_HR_FLOOR = 160;

/** The subset of a user this derivation reads. */
export interface MaxHRSource {
  age?: number;
  maxHR?: number;
}

/**
 * The user's own measured max HR when they have set one, otherwise the
 * age-based estimate with its floor applied.
 *
 * A saved `maxHR` is taken verbatim — no floor — because it is a measurement the
 * fighter entered, and clamping a real value would be wrong. Non-positive and
 * non-finite saved values fall through to the estimate rather than propagating a
 * division by zero into `getZone()`.
 */
export function deriveMaxHR(user?: MaxHRSource | null): number {
  const saved = user?.maxHR;
  if (typeof saved === 'number' && Number.isFinite(saved) && saved > 0) return saved;
  return estimateMaxHR(user?.age);
}

/** The age-based estimate alone, used where the saved override must not apply. */
export function estimateMaxHR(age?: number): number {
  const a = typeof age === 'number' && Number.isFinite(age) && age > 0 ? age : DEFAULT_AGE;
  return Math.max(MAX_HR_FLOOR, 220 - a);
}
