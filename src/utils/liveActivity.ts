import { Capacitor } from '@capacitor/core';
import { TimerLiveActivity, type TimerLiveActivitySegment } from '../plugins/TimerLiveActivity';

/**
 * Live Activity bridge for the round timer.
 *
 * The WKWebView timer stops ticking the moment the app is backgrounded (its
 * JS thread is suspended), so the in-app clock cannot keep the Lock Screen
 * or Dynamic Island honest on its own. Instead of pushing a ticking counter,
 * this module pushes the REMAINING SCHEDULE — absolute wall-clock segments
 * for every phase still to come — and the widget renders the countdown from
 * `Date()` itself. The app re-pushes on every transition it observes
 * (phase change, pause/resume, skip, +30s) and once more when backgrounding,
 * so the activity can lag the real session by at most one transition.
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
  const segments: TimerLiveActivitySegment[] = [];

  // Current segment: anchored on the live deadline so the widget's countdown
  // matches the app's clock exactly.
  const currentEnd = s.deadlineMs;
  const currentStart = Math.min(currentEnd - 1, currentEnd - s.phaseSec * 1000);
  const currentKind = s.phase === 'work' || s.phase === 'rest' || s.phase === 'prep' ? s.phase : 'work';
  segments.push({ kind: currentKind, round: s.round, startMs: currentStart, endMs: currentEnd });

  let at = currentEnd;
  let round = s.round;

  // Walk the rest of the session from the current phase.
  let next: string =
    currentKind === 'prep' ? 'work' :
    currentKind === 'work' ? 'rest' :
    'work';
  if (currentKind === 'prep') round = 1;
  // Mid-rest: the rest we are IN follows round s.round, so the work it leads
  // into is round s.round + 1. (When currentKind is 'work' the loop enters
  // its rest branch first, where the increment belongs.)
  if (currentKind === 'rest') round = s.round + 1;

  // Bounded: at most two segments per remaining round. Rest follows the round
  // it comes after, so the round counter advances in the REST branch — the
  // work segment after a rest belongs to the next round.
  for (let i = 0; i < s.rounds * 2 + 2; i++) {
    if (next === 'rest') {
      if (round >= s.rounds) break; // no rest after the final round
      const end = at + s.restSec * 1000;
      segments.push({ kind: 'rest', round, startMs: at, endMs: end });
      at = end;
      next = 'work';
      round += 1;
    } else {
      // work
      const end = at + s.workSec * 1000;
      segments.push({ kind: 'work', round, startMs: at, endMs: end });
      at = end;
      if (round >= s.rounds) break; // session ends with the final work round
      next = 'rest';
    }
  }

  // A paused session carries no future wall clock — keep only the frozen
  // current segment; the widget renders the stored remainder as plain text.
  if (!s.isRunning) return [segments[0]];
  return segments;
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

/** Tear the activity down (session complete, reset, or app-foregrounded). */
export async function endLiveActivity(): Promise<void> {
  if (!started) return;
  started = false;
  try {
    await TimerLiveActivity.end();
  } catch { /* noop */ }
}

/** True once an activity has been started in this app run. */
export function liveActivityStarted(): boolean {
  return started;
}
