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
