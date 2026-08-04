/**
 * Build the next phase deadline from the schedule, not from the callback time.
 *
 * setInterval callbacks can arrive late under rendering or OS pressure. Adding
 * the next duration to Date.now() would permanently add that delay at every
 * round transition. Anchoring to the prior deadline preserves the fight clock;
 * passing 0 starts/resumes from the supplied current time.
 */
export function nextPhaseDeadline(
  previousDeadlineMs: number,
  durationSeconds: number,
  nowMs: number = Date.now(),
): number {
  const durationMs = Math.max(
    0,
    Number.isFinite(durationSeconds) ? durationSeconds * 1000 : 0,
  );
  const scheduledBase =
    Number.isFinite(previousDeadlineMs) && previousDeadlineMs > 0
      ? previousDeadlineMs
      : nowMs;
  return scheduledBase + durationMs;
}
