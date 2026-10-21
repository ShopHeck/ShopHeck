import { beforeEach, describe, expect, it, vi } from 'vitest';

const health = vi.hoisted(() => ({
  requestAuthorization: vi.fn(),
  saveWorkout: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('../src/plugins/HealthKit', () => ({ HealthKit: health }));

import { writeWorkoutToHealth } from '../src/utils/healthSync';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, String(value)); }
}

const WRITE_PREF = 'fightcamp_healthkit_write';
const session = { sessionType: 'skill' as const, date: '2026-09-15', duration: 60 };

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  localStorage.setItem(WRITE_PREF, '1');
  health.requestAuthorization.mockReset().mockResolvedValue({ granted: true });
  health.saveWorkout.mockReset().mockResolvedValue({ saved: true });
});

describe('writeWorkoutToHealth', () => {
  it('saves a workout without energy and asks for nothing', async () => {
    await writeWorkoutToHealth(session);

    expect(health.requestAuthorization).not.toHaveBeenCalled();
    expect(health.saveWorkout).toHaveBeenCalledTimes(1);
    expect(health.saveWorkout.mock.calls[0][0]).not.toHaveProperty('energyKcal');
    expect(health.saveWorkout.mock.calls[0][0]).toMatchObject({ activityType: 'martialArts' });
  });

  it('requests Active Energy access, then saves the calories with the workout', async () => {
    await writeWorkoutToHealth({ ...session, energyKcal: 540 });

    expect(health.requestAuthorization).toHaveBeenCalledWith({ read: false });
    expect(health.requestAuthorization.mock.invocationCallOrder[0])
      .toBeLessThan(health.saveWorkout.mock.invocationCallOrder[0]);
    expect(health.saveWorkout).toHaveBeenCalledTimes(1);
    expect(health.saveWorkout.mock.calls[0][0]).toMatchObject({ energyKcal: 540 });
    const { startMs, endMs } = health.saveWorkout.mock.calls[0][0];
    expect(endMs - startMs).toBe(60 * 60_000);
  });

  it('still saves the workout when the calories are refused', async () => {
    health.saveWorkout.mockRejectedValueOnce(new Error('Not authorized'));

    await writeWorkoutToHealth({ ...session, energyKcal: 540 });

    expect(health.saveWorkout).toHaveBeenCalledTimes(2);
    expect(health.saveWorkout.mock.calls[1][0]).not.toHaveProperty('energyKcal');
    expect(health.saveWorkout.mock.calls[1][0]).toEqual({
      activityType: health.saveWorkout.mock.calls[0][0].activityType,
      startMs: health.saveWorkout.mock.calls[0][0].startMs,
      endMs: health.saveWorkout.mock.calls[0][0].endMs,
    });
  });

  it('saves even if the permission prompt errors', async () => {
    health.requestAuthorization.mockRejectedValueOnce(new Error('prompt failed'));

    await writeWorkoutToHealth({ ...session, energyKcal: 540 });

    expect(health.saveWorkout).toHaveBeenCalledTimes(1);
    expect(health.saveWorkout.mock.calls[0][0]).toMatchObject({ energyKcal: 540 });
  });

  it('does not retry a failed save that carried no calories', async () => {
    health.saveWorkout.mockRejectedValueOnce(new Error('boom'));

    await expect(writeWorkoutToHealth(session)).resolves.toBeUndefined();
    expect(health.saveWorkout).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when Health write is off', async () => {
    localStorage.setItem(WRITE_PREF, '0');

    await writeWorkoutToHealth({ ...session, energyKcal: 540 });

    expect(health.requestAuthorization).not.toHaveBeenCalled();
    expect(health.saveWorkout).not.toHaveBeenCalled();
  });
});
