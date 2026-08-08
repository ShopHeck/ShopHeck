import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({
  replace: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => plugin,
}));

import {
  cancelTimerBellSchedule,
  nextTimerScheduleRevision,
  reconcileTimerBellSchedule,
  replaceTimerBellSchedule,
} from '../src/utils/timerBellScheduler';
import type { TimerBoundaryAlert } from '../src/utils/timerTimeline';

const event: TimerBoundaryAlert = {
  sessionId: 'session-a',
  revision: 3,
  boundaryId: 'session-a:r3:work-1-1000000',
  segmentId: 'work-1-1000000',
  atMs: 1_000_000,
  kind: 'roundEnd',
  round: 1,
  rounds: 3,
  title: 'End of round 1',
  body: 'Rest.',
  sound: 'round-end',
  terminal: false,
};

describe('timer bell native bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces the whole session schedule atomically with scoped boundaries', async () => {
    plugin.replace.mockResolvedValue({ scheduled: 1 });

    expect(await replaceTimerBellSchedule('session-a', 3, [event])).toBe(1);
    expect(plugin.replace).toHaveBeenCalledWith({
      sessionId: 'session-a',
      revision: 3,
      events: [event],
    });
  });

  it('cancels every obsolete event for a session', async () => {
    plugin.cancel.mockResolvedValue(undefined);

    await cancelTimerBellSchedule('session-a');

    expect(plugin.cancel).toHaveBeenCalledWith({ sessionId: 'session-a' });
  });

  it('fails closed for missing session identity and native errors', async () => {
    plugin.replace.mockRejectedValue(new Error('native unavailable'));
    plugin.cancel.mockRejectedValue(new Error('native unavailable'));

    expect(await replaceTimerBellSchedule('', 1, [event])).toBe(0);
    expect(await replaceTimerBellSchedule('session-a', 1, [event])).toBe(0);
    await expect(cancelTimerBellSchedule('session-a')).resolves.toBeUndefined();
  });

  it('normalizes invalid revisions before crossing the native bridge', async () => {
    plugin.replace.mockResolvedValue({ scheduled: 0 });

    await replaceTimerBellSchedule(' session-a ', Number.NaN, []);

    expect(plugin.replace).toHaveBeenCalledWith({
      sessionId: 'session-a',
      revision: 0,
      events: [],
    });
  });

  it('reconciles a running absolute snapshot and drops elapsed boundaries', async () => {
    plugin.replace.mockResolvedValue({ scheduled: 1 });

    expect(await reconcileTimerBellSchedule({
      phase: 'work',
      round: 1,
      rounds: 2,
      deadlineMs: 1_000_000,
      phaseSec: 180,
      workSec: 180,
      restSec: 60,
      isRunning: true,
    }, 'session-a', 4, 1_059_600, 500)).toBe(1);

    expect(plugin.replace).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-a',
      revision: 4,
      events: [expect.objectContaining({ kind: 'sessionComplete', atMs: 1_240_000 })],
    }));
  });

  it('atomically replaces a running session with an empty queue when paused', async () => {
    plugin.replace.mockResolvedValue({ scheduled: 0 });

    expect(await reconcileTimerBellSchedule({
      phase: 'work',
      round: 1,
      rounds: 2,
      deadlineMs: 1_000_000,
      phaseSec: 180,
      workSec: 180,
      restSec: 60,
      isRunning: false,
    }, 'session-a', 5, 900_000)).toBe(0);

    expect(plugin.replace).toHaveBeenCalledWith({
      sessionId: 'session-a',
      revision: 5,
      events: [],
    });
  });

  it('keeps only future round starts when rest is disabled', async () => {
    plugin.replace.mockResolvedValue({ scheduled: 3 });

    expect(await reconcileTimerBellSchedule({
      phase: 'work',
      round: 1,
      rounds: 3,
      deadlineMs: 1_000_000,
      phaseSec: 180,
      workSec: 180,
      restSec: 0,
      isRunning: true,
    }, 'session-a', 6, 900_000)).toBe(3);

    expect(plugin.replace).toHaveBeenCalledWith(expect.objectContaining({
      events: [
        expect.objectContaining({ kind: 'roundStart', round: 2, atMs: 1_000_000 }),
        expect.objectContaining({ kind: 'roundStart', round: 3, atMs: 1_180_000 }),
        expect.objectContaining({ kind: 'sessionComplete', round: 3, atMs: 1_360_000 }),
      ],
    }));
  });
});

describe('timer schedule revisions', () => {
  it('advances persisted revisions and repairs legacy or malformed values', () => {
    expect(nextTimerScheduleRevision(5)).toBe(6);
    expect(nextTimerScheduleRevision(undefined)).toBe(1);
    expect(nextTimerScheduleRevision(Number.NaN)).toBe(1);
    expect(nextTimerScheduleRevision(-4)).toBe(1);
  });
});
