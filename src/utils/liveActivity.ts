import { Capacitor } from '@capacitor/core';
import { TimerLiveActivity, type TimerLiveActivitySegment } from '../plugins/TimerLiveActivity';
import { buildTimerTimeline } from './timerTimeline';

/**
 * Live Activity bridge for the round timer.
 *
 * The WKWebView timer stops ticking the moment the app is backgrounded (its
 * JS thread is suspended), so the in-app clock cannot keep the Lock Screen
 * or Dynamic Island honest on its own. Instead of pushing a ticking counter,
 * this module pushes the REMAINING SCHEDULE — absolute wall-clock segments
 * for every phase still to come — and the widget renders the countdown from
 * `Date()` itself. Explicit widget timeline entries refresh the whole activity
 * at each absolute boundary, while the app re-pushes only when that schedule is
 * mutated (pause/resume, skip, extension, reset, or foreground reconciliation).
 *
 * Everything is best-effort: a Live Activity failure must never affect the
 * timer itself — the bells and the clock are the product, the activity is
 * decoration.
 */

export interface LiveActivityTimerSnapshot {
  phase: string;
  round: number;
  rounds: number;
  /** Absolute wall-clock end of the phase in progress. */
  deadlineMs: number;
  /** Nominal duration (sec) of the phase in progress (grown by extensions). */
  phaseSec: number;
  workSec: number;
  restSec: number;
  prepSec: number;
  isRunning: boolean;
  /** Remaining seconds when paused. */
  pausedTimeLeft: number;
  presetLabel: string;
  workColorHex: string;
  restColorHex: string;
}

let supportKnown: boolean | null = null;
let started = false;

/** Cached capability probe — one round-trip to native per app run. */
export async function liveActivitySupported(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (supportKnown === null) {
    try {
      supportKnown = (await TimerLiveActivity.isSupported()).supported;
    } catch {
      supportKnown = false;
    }
  }
  return supportKnown;
}

/**
 * Build the remaining-schedule segments from a timer snapshot. Pure, so the
 * geometry is unit-testable. Current segment first; prep is only ever
 * present as the current phase (it is consumed at session start otherwise).
 */
export function buildSegments(s: LiveActivityTimerSnapshot): TimerLiveActivitySegment[] {
  return buildTimerTimeline({
    phase: s.phase,
    round: s.round,
    rounds: s.rounds,
    deadlineMs: s.deadlineMs,
    phaseSec: s.phaseSec,
    workSec: s.workSec,
    restSec: s.restSec,
    isRunning: s.isRunning,
  }).map(({ kind, round, startMs, endMs }) => ({ kind, round, startMs, endMs }));
}

/** ActivityKit serializes ContentState with the CodingKeys declared in Swift.
 * Keep this mirror in tests so the maximum supported timer remains under the
 * platform's roughly 4 KB dynamic-state budget. */
export function activityKitContentStateByteSize(snapshot: LiveActivityTimerSnapshot): number {
  const state = {
    s: buildSegments(snapshot).map(segment => ({
      k: segment.kind,
      r: segment.round,
      s: segment.startMs,
      e: segment.endMs,
    })),
    r: snapshot.round,
    n: snapshot.rounds,
    l: snapshot.presetLabel,
    p: !snapshot.isRunning,
    t: snapshot.pausedTimeLeft,
    w: snapshot.workColorHex,
    c: snapshot.restColorHex,
  };
  return new TextEncoder().encode(JSON.stringify(state)).byteLength;
}

/** Push the current timer state to the Live Activity (start or update). */
export async function syncLiveActivity(snapshot: LiveActivityTimerSnapshot, sessionId: string): Promise<void> {
  if (!(await liveActivitySupported())) return;
  try {
    const state = {
      segments: buildSegments(snapshot),
      round: snapshot.round,
      rounds: snapshot.rounds,
      presetLabel: snapshot.presetLabel,
      isPaused: !snapshot.isRunning,
      pausedRemainingSec: snapshot.pausedTimeLeft,
      workColorHex: snapshot.workColorHex,
      restColorHex: snapshot.restColorHex,
    };
    if (!started) {
      const res = await TimerLiveActivity.start({ ...state, sessionId });
      started = res.started;
      if (!started) return;
    } else {
      await TimerLiveActivity.update(state);
    }
  } catch {
    // Decoration, never the timer.
  }
}

/** Tear the activity down (session complete, reset, or orphan cleanup).
 *
 * Always reaches native end when Live Activities are supported — even if this
 * JS module never saw a start. After a process kill the module-level `started`
 * flag is false while ActivityKit may still hold a Lock Screen / Dynamic
 * Island timer; skipping the native call left that orphan up until the next
 * start() recovered it.
 */
export async function endLiveActivity(): Promise<void> {
  started = false;
  if (!Capacitor.isNativePlatform()) return;
  // Capability probe may not have run yet on a cold launch that immediately
  // tears down an orphan — still try native end; unsupported platforms no-op.
  try {
    if (supportKnown === false) return;
    await TimerLiveActivity.end();
  } catch { /* decoration */ }
}

/** True once an activity has been started in this app run. */
export function liveActivityStarted(): boolean {
  return started;
}
