import { Capacitor } from '@capacitor/core';
import { HealthKit } from '../plugins/HealthKit';
import type { SessionType } from '../types';
import {
  mapHealthWeights,
  mapHealthWorkouts,
  type MappedWeight,
  type MappedWorkout,
} from './healthImport';

/**
 * Optional, opt-in mirroring of newly logged workouts and weigh-ins into Apple
 * Health, plus one-tap native import of recent samples. Write-only and read
 * paths both no-op off-device; writers never throw so call sites can fire-and-
 * forget. Historical export.xml import still lives in AppleHealthSync.
 */

const PREF_KEY = 'fightcamp_healthkit_write';
const LBS_TO_KG = 0.453592;

/** True when the user has opted in AND this is a native iOS build. */
export function isHealthWriteEnabled(): boolean {
  return Capacitor.isNativePlatform() && localStorage.getItem(PREF_KEY) === '1';
}

/**
 * Toggle Health write-back. Enabling first checks availability and prompts for
 * HealthKit write permission; returns the resulting enabled state (false if
 * unavailable or the prompt errored/was dismissed without completing).
 */
export async function setHealthWriteEnabled(on: boolean): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (on) {
    try {
      const { available } = await HealthKit.isAvailable();
      if (!available) return false;
      const { granted } = await HealthKit.requestAuthorization({ read: false });
      if (!granted) { localStorage.setItem(PREF_KEY, '0'); return false; }
    } catch {
      localStorage.setItem(PREF_KEY, '0');
      return false;
    }
  }
  localStorage.setItem(PREF_KEY, on ? '1' : '0');
  return on;
}

/** Normalized HealthKit activity string per app session type (mapped in HealthKitPlugin.swift). */
const ACTIVITY_BY_SESSION: Record<SessionType, string | null> = {
  sparring: 'martialArts',
  skill: 'martialArts',
  conditioning: 'hiit',
  strength: 'strength',
  recovery: 'recovery',
  rest: null,
};

/** Noon (local) on a YYYY-MM-DD date + duration, clamped so we never write a future end time. */
function clampedWindow(date: string, durationMin: number): { startMs: number; endMs: number } {
  const durMs = Math.max(1, Math.round(durationMin)) * 60_000;
  const noon = new Date(`${date}T12:00:00`).getTime();
  const endMs = Math.min(noon + durMs, Date.now());
  return { startMs: endMs - durMs, endMs };
}

/** Fire-and-forget: mirror a just-logged workout (duration in minutes) into Apple Health. */
export async function writeWorkoutToHealth(w: { sessionType: SessionType; date: string; duration: number }): Promise<void> {
  if (!isHealthWriteEnabled()) return;
  const activityType = ACTIVITY_BY_SESSION[w.sessionType];
  if (!activityType || !(w.duration > 0)) return;
  const { startMs, endMs } = clampedWindow(w.date, w.duration);
  try {
    await HealthKit.saveWorkout({ activityType, startMs, endMs });
  } catch {
    /* best-effort */
  }
}

/** Fire-and-forget: mirror a just-logged weigh-in (stored in lbs) into Apple Health as kg. */
export async function writeWeightToHealth(e: { date: string; weight: number }): Promise<void> {
  if (!isHealthWriteEnabled()) return;
  if (!(e.weight > 0)) return;
  const dateMs = Math.min(new Date(`${e.date}T12:00:00`).getTime(), Date.now());
  try {
    await HealthKit.saveWeight({ kg: +(e.weight * LBS_TO_KG).toFixed(2), dateMs });
  } catch {
    /* best-effort */
  }
}

export interface NativeHealthImportResult {
  available: boolean;
  granted: boolean;
  weights: MappedWeight[];
  workouts: MappedWorkout[];
  error?: string;
}

/**
 * One-tap native import: request read permission, pull weights/workouts in the
 * camp window, map + de-dupe against existing local rows. Does not dispatch —
 * the caller applies LOG_WEIGHT / LOG_WORKOUT after the user confirms.
 */
export async function previewNativeHealthImport(opts: {
  campStart: string;
  campEnd: string;
  existingWeightDates: Set<string>;
  existingWorkoutKeys: Set<string>;
}): Promise<NativeHealthImportResult> {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, granted: false, weights: [], workouts: [] };
  }
  try {
    const { available } = await HealthKit.isAvailable();
    if (!available) {
      return { available: false, granted: false, weights: [], workouts: [] };
    }
    const { granted } = await HealthKit.requestAuthorization({ read: true });
    if (!granted) {
      return { available: true, granted: false, weights: [], workouts: [] };
    }

    const startMs = new Date(`${opts.campStart}T00:00:00`).getTime();
    const endMs = Math.min(
      new Date(`${opts.campEnd}T23:59:59`).getTime(),
      Date.now(),
    );

    const [wRes, woRes] = await Promise.all([
      HealthKit.queryWeights({ startMs, endMs, limit: 300 }),
      HealthKit.queryWorkouts({ startMs, endMs, limit: 300 }),
    ]);

    return {
      available: true,
      granted: true,
      weights: mapHealthWeights(wRes.samples ?? [], {
        campStart: opts.campStart,
        campEnd: opts.campEnd,
        existingDates: opts.existingWeightDates,
      }),
      workouts: mapHealthWorkouts(woRes.samples ?? [], {
        campStart: opts.campStart,
        campEnd: opts.campEnd,
        existingKeys: opts.existingWorkoutKeys,
      }),
    };
  } catch (err) {
    return {
      available: true,
      granted: false,
      weights: [],
      workouts: [],
      error: err instanceof Error ? err.message : 'Health import failed',
    };
  }
}
