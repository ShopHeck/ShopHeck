import type { SessionType, TrainingSession, FightCamp } from '../types';

/** Timer settings a planned session hands to the round timer. */
export interface TimerPrefill {
  rounds: number;
  workSec: number;
  restSec: number;
  /** Shown on the timer so it is obvious what the numbers came from. */
  label: string;
}

/** The timer's own bounds (see the Rounds adjuster in RoundTimer). */
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 30;

/** Fallback round length when a camp carries a nonsense value. */
const DEFAULT_ROUND_MIN = 3;
const DEFAULT_REST_SEC = 60;

/**
 * Share of a planned block that is actually rounds on the clock.
 *
 * A session's `duration` is the whole block — warm-up, instruction, water,
 * cool-down — so filling all of it with rounds produces counts nobody trains:
 * a 75-minute pad session came out as 19 unbroken rounds. Calibrated against
 * the generator's own programming, which puts "8x3min bag rounds" inside a
 * 50-minute conditioning block: 8 rounds × 4-minute cycle = 32 of 50 minutes.
 */
const WORKING_SHARE = 2 / 3;

/**
 * Ceiling for a *derived* count. Championship distance, and the app's own
 * Boxing preset. Sparring is exempt: it takes the camp's real round count,
 * which is a fact about the bout rather than an estimate.
 */
const MAX_DERIVED_ROUNDS = 12;

/**
 * Round specs the camp generator writes into session descriptions, e.g.
 * "8x3min bag rounds" or "6×5min". When a session says what it is, that beats
 * any estimate derived from its length.
 */
const ROUND_SPEC = /(\d{1,2})\s*[x×]\s*(\d{1,2})\s*min/i;

function parseRoundSpec(description: string | undefined): { rounds: number; workSec: number } | null {
  const m = description ? ROUND_SPEC.exec(description) : null;
  if (!m) return null;
  const rounds = Number(m[1]);
  const minutes = Number(m[2]);
  if (!rounds || !minutes) return null;
  return { rounds, workSec: Math.round(minutes * 60) };
}

/** Session types worth putting a round clock on. */
const TIMEABLE: ReadonlySet<SessionType> = new Set<SessionType>([
  'sparring', 'skill', 'conditioning', 'strength',
]);

const clampRounds = (n: number): number =>
  Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, Math.floor(n)));

/**
 * Timer settings for a session on the plan, or null when the session isn't
 * something you run a round clock against (rest and recovery).
 *
 * Three sources, most authoritative first:
 *
 * 1. **What the session says.** The generator writes real specs into its
 *    descriptions ("8x3min bag rounds"); a stated spec is used verbatim.
 * 2. **Sparring** rehearses the bout, so with nothing stated it inherits the
 *    *fight's* format — the camp's own round count and length. Sparring five
 *    threes when you are booked for three fives is the mistake this removes.
 * 3. **Everything else** is estimated: rounds of the camp's round length
 *    filling the working share of the block (see `WORKING_SHARE`).
 *
 * Every input is normalized: `duration` and the camp's round fields are user
 * data that persist across schema changes, and a NaN reaching `setRounds`
 * renders a timer that counts to nothing.
 */
export function timerPrefillForSession(
  session: Pick<TrainingSession, 'type' | 'title' | 'duration'> & { description?: string },
  camp: Pick<FightCamp, 'rounds' | 'roundDuration'>,
): TimerPrefill | null {
  if (!TIMEABLE.has(session.type)) return null;

  const roundMin = Number.isFinite(camp.roundDuration) && camp.roundDuration > 0
    ? camp.roundDuration
    : DEFAULT_ROUND_MIN;
  const restSec = DEFAULT_REST_SEC;
  const isSparring = session.type === 'sparring';
  const label = isSparring ? 'Sparring · fight format' : session.title;

  const stated = parseRoundSpec(session.description);
  if (stated) {
    return { rounds: clampRounds(stated.rounds), workSec: stated.workSec, restSec, label };
  }

  const workSec = Math.round(roundMin * 60);

  if (isSparring) {
    const rounds = Number.isFinite(camp.rounds) && camp.rounds > 0 ? camp.rounds : MIN_ROUNDS;
    return { rounds: clampRounds(rounds), workSec, restSec, label };
  }

  const planned = Number.isFinite(session.duration) && session.duration > 0
    ? session.duration
    : roundMin;
  const working = planned * WORKING_SHARE * 60;
  const rounds = Math.min(
    MAX_DERIVED_ROUNDS,
    clampRounds(Math.round(working / (workSec + restSec)) || MIN_ROUNDS),
  );
  return { rounds, workSec, restSec, label };
}

/**
 * Total elapsed training time for a completed round session.
 *
 * Rest happens only BETWEEN rounds, so N rounds contain N work intervals and
 * N-1 rest intervals. Inputs are normalized defensively because custom timer
 * settings are persisted and may outlive validation changes.
 */
export function timerSessionSeconds(
  rounds: number,
  workSeconds: number,
  restSeconds: number,
): number {
  const safeRounds = Math.max(0, Math.floor(Number.isFinite(rounds) ? rounds : 0));
  const safeWork = Math.max(0, Number.isFinite(workSeconds) ? workSeconds : 0);
  const safeRest = Math.max(0, Number.isFinite(restSeconds) ? restSeconds : 0);

  if (safeRounds === 0) return 0;
  return safeRounds * safeWork + Math.max(0, safeRounds - 1) * safeRest;
}

/** Workout logs and HealthKit store whole minutes; any completed session is at least one minute. */
export function timerSessionMinutes(
  rounds: number,
  workSeconds: number,
  restSeconds: number,
): number {
  const seconds = timerSessionSeconds(rounds, workSeconds, restSeconds);
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0;
}
