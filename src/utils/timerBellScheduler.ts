import { Capacitor } from '@capacitor/core';
import { TimerBellScheduler } from '../plugins/TimerBellScheduler';
import {
  buildTimerTimeline,
  timerBoundaryAlerts,
  type TimerBoundaryAlert,
  type TimerTimelineInput,
} from './timerTimeline';

// iOS's pending request limit is shared app-wide. Keep room for non-timer alerts.
const IOS_PENDING_REQUEST_BUDGET = 48;

export function nextTimerScheduleRevision(previous?: number): number {
  if (!Number.isFinite(previous) || (previous as number) < 0) return 1;
  return Math.trunc(previous as number) + 1;
}

export async function replaceTimerBellSchedule(
  sessionId: string,
  revision: number,
  events: TimerBoundaryAlert[],
): Promise<number> {
  const normalized = sessionId.trim();
  if (!normalized || !Capacitor.isNativePlatform()) return 0;
  const safeRevision = Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : 0;
  try {
    const result = await TimerBellScheduler.replace({
      sessionId: normalized,
      revision: safeRevision,
      events,
    });
    return result.scheduled;
  } catch {
    return 0;
  }
}

/**
 * Derive and atomically replace the native queue from the same absolute
 * timeline consumed by ActivityKit. A paused snapshot deliberately replaces
 * the queue with no events, which cancels obsolete bells without racing a
 * separate cancel call.
 */
export async function reconcileTimerBellSchedule(
  snapshot: TimerTimelineInput,
  sessionId: string,
  revision: number,
  nowMs = Date.now(),
  minimumLeadMs = 750,
): Promise<number> {
  const timeline = buildTimerTimeline(snapshot);
  const events = timerBoundaryAlerts(
    timeline,
    nowMs,
    sessionId,
    revision,
    minimumLeadMs,
    snapshot.isRunning,
    snapshot.rounds,
    IOS_PENDING_REQUEST_BUDGET,
  );
  return replaceTimerBellSchedule(sessionId, revision, events);
}

export async function cancelTimerBellSchedule(sessionId: string): Promise<void> {
  const normalized = sessionId.trim();
  if (!normalized || !Capacitor.isNativePlatform()) return;
  try {
    await TimerBellScheduler.cancel({ sessionId: normalized });
  } catch {
    // Native bells are best-effort; the foreground timer remains usable.
  }
}
