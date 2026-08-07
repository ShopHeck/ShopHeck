/**
 * Map HealthKit native samples into Fight Camp weight / workout drafts.
 * Pure — no Capacitor, no React — so unit tests cover the mapping without iOS.
 */

import type { SessionType } from '../types';

export interface HealthWeightSample {
  /** Epoch ms */
  dateMs: number;
  /** Kilograms from HealthKit */
  kg: number;
}

export interface HealthWorkoutSample {
  dateMs: number;
  /** Seconds */
  durationSec: number;
  /** Normalized activity key from HealthKitPlugin (boxing, hiit, …) */
  activityType: string;
  sourceName?: string;
}

export interface MappedWeight {
  date: string; // YYYY-MM-DD local
  weight: number; // lbs
  notes: string;
}

export interface MappedWorkout {
  date: string;
  duration: number; // minutes
  sessionType: SessionType;
  title: string;
  rpe: number;
  notes: string;
  completed: true;
}

const KG_TO_LBS = 2.20462;

const ACTIVITY_MAP: Record<string, { type: SessionType; label: string }> = {
  boxing: { type: 'skill', label: 'Boxing' },
  kickboxing: { type: 'skill', label: 'Kickboxing' },
  martialarts: { type: 'skill', label: 'Martial Arts' },
  hiit: { type: 'conditioning', label: 'HIIT' },
  strength: { type: 'strength', label: 'Strength Training' },
  running: { type: 'conditioning', label: 'Running' },
  cycling: { type: 'conditioning', label: 'Cycling' },
  recovery: { type: 'recovery', label: 'Recovery' },
  jumprope: { type: 'conditioning', label: 'Jump Rope' },
  swimming: { type: 'conditioning', label: 'Swimming' },
  yoga: { type: 'recovery', label: 'Yoga' },
  other: { type: 'conditioning', label: 'Workout' },
};

function localDateYmd(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mapHealthWeights(
  samples: HealthWeightSample[],
  opts: { campStart: string; campEnd: string; existingDates: Set<string> },
): MappedWeight[] {
  const out: MappedWeight[] = [];
  const seen = new Set<string>();
  for (const s of samples) {
    if (!(s.kg > 0) || !Number.isFinite(s.dateMs)) continue;
    const date = localDateYmd(s.dateMs);
    if (date < opts.campStart || date > opts.campEnd) continue;
    if (opts.existingDates.has(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({
      date,
      weight: parseFloat((s.kg * KG_TO_LBS).toFixed(1)),
      notes: 'Imported from Apple Health',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function mapHealthWorkouts(
  samples: HealthWorkoutSample[],
  opts: {
    campStart: string;
    campEnd: string;
    /** Keys `${date}-${title}` already in the log */
    existingKeys: Set<string>;
  },
): MappedWorkout[] {
  const out: MappedWorkout[] = [];
  const seen = new Set<string>();
  for (const s of samples) {
    if (!(s.durationSec > 0) || !Number.isFinite(s.dateMs)) continue;
    const date = localDateYmd(s.dateMs);
    if (date < opts.campStart || date > opts.campEnd) continue;
    const minutes = Math.max(1, Math.round(s.durationSec / 60));
    const key = (s.activityType || 'other').toLowerCase().replace(/[^a-z]/g, '');
    const mapped = ACTIVITY_MAP[key] ?? ACTIVITY_MAP.other;
    const title = `${mapped.label}${s.sourceName ? ` (${s.sourceName})` : ''}`;
    const dedupe = `${date}-${title}`;
    if (opts.existingKeys.has(dedupe) || seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      date,
      duration: minutes,
      sessionType: mapped.type,
      title,
      rpe: 7,
      notes: 'Imported from Apple Health',
      completed: true,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
