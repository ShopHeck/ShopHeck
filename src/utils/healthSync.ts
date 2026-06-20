import { Capacitor } from '@capacitor/core';
import { HealthKit } from '../plugins/HealthKit';
import type { SessionType } from '../types';

/**
 * Optional, opt-in mirroring of newly logged workouts and weigh-ins into Apple
 * Health. Write-only — the historical import flow lives in AppleHealthSync. All
 * writers here no-op off-device or when disabled, and never throw, so call sites
 * can fire-and-forget without branching.
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
      const { granted } = await HealthKit.requestAuthorization();
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
  rest: null, // rest days aren't workouts
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
