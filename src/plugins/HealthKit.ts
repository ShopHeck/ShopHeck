import { registerPlugin } from '@capacitor/core';

/**
 * Write-only bridge to Apple Health (HealthKit). Native implementation lives in
 * `ios/App/App/HealthKitPlugin.swift`; the web stubs below make it a no-op in the
 * browser so callers never need to branch on platform for correctness.
 */
export interface HealthKitPlugin {
  /** True only on a device where HealthKit is available (iPhone, not iPad/web). */
  isAvailable(): Promise<{ available: boolean }>;
  /** Prompts for write permission. `granted` reflects the prompt completing, not Apple's (hidden) write decision. */
  requestAuthorization(): Promise<{ granted: boolean }>;
  /** Writes a workout. Times are epoch milliseconds; `activityType` is a normalized string (see healthSync.ts). */
  saveWorkout(opts: {
    activityType: string;
    startMs: number;
    endMs: number;
    energyKcal?: number;
  }): Promise<{ saved: boolean }>;
  /** Writes a body-mass sample in kilograms at the given time (epoch ms; defaults to now). */
  saveWeight(opts: { kg: number; dateMs?: number }): Promise<{ saved: boolean }>;
}

export const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit', {
  web: {
    isAvailable: async () => ({ available: false }),
    requestAuthorization: async () => ({ granted: false }),
    saveWorkout: async () => ({ saved: false }),
    saveWeight: async () => ({ saved: false }),
  },
});
