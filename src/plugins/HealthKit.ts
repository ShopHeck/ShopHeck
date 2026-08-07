import { registerPlugin } from '@capacitor/core';

/**
 * Bridge to Apple Health (HealthKit). Native implementation lives in
 * `ios/App/App/HealthKitPlugin.swift`; the web stubs below make it a no-op in the
 * browser so callers never need to branch on platform for correctness.
 */
export interface HealthWeightSample {
  dateMs: number;
  kg: number;
}

export interface HealthWorkoutSample {
  dateMs: number;
  durationSec: number;
  activityType: string;
  sourceName?: string;
}

export interface HealthKitPlugin {
  /** True only on a device where HealthKit is available (iPhone, not iPad/web). */
  isAvailable(): Promise<{ available: boolean }>;
  /**
   * Prompts for permission. Pass `{ read: true }` (default) to request read+write
   * for import; write-only callers can pass `{ read: false }`.
   */
  requestAuthorization(opts?: { read?: boolean }): Promise<{ granted: boolean }>;
  /** Writes a workout. Times are epoch milliseconds; `activityType` is a normalized string. */
  saveWorkout(opts: {
    activityType: string;
    startMs: number;
    endMs: number;
    energyKcal?: number;
  }): Promise<{ saved: boolean }>;
  /** Writes a body-mass sample in kilograms at the given time (epoch ms; defaults to now). */
  saveWeight(opts: { kg: number; dateMs?: number }): Promise<{ saved: boolean }>;
  /** Body-mass samples in the window (newest first). */
  queryWeights(opts?: {
    startMs?: number;
    endMs?: number;
    limit?: number;
  }): Promise<{ samples: HealthWeightSample[] }>;
  /** Workouts in the window (newest first). */
  queryWorkouts(opts?: {
    startMs?: number;
    endMs?: number;
    limit?: number;
  }): Promise<{ samples: HealthWorkoutSample[] }>;
}

export const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit', {
  web: {
    isAvailable: async () => ({ available: false }),
    requestAuthorization: async () => ({ granted: false }),
    saveWorkout: async () => ({ saved: false }),
    saveWeight: async () => ({ saved: false }),
    queryWeights: async () => ({ samples: [] }),
    queryWorkouts: async () => ({ samples: [] }),
  },
});
