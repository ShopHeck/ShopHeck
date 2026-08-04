import { describe, expect, it } from 'vitest';
import { nextPhaseDeadline } from '../src/utils/timerClock';

describe('timer phase deadlines', () => {
  it('anchors the next phase to the scheduled deadline, not a late callback', () => {
    const previousDeadline = 10_000;
    const callbackArrivedAt = 10_750;

    expect(nextPhaseDeadline(previousDeadline, 60, callbackArrivedAt)).toBe(70_000);
  });

  it('starts a new phase from now when no prior schedule exists', () => {
    expect(nextPhaseDeadline(0, 180, 5_000)).toBe(185_000);
  });

  it('normalizes invalid durations without moving time backward', () => {
    expect(nextPhaseDeadline(10_000, Number.NaN, 99_000)).toBe(10_000);
    expect(nextPhaseDeadline(10_000, -30, 99_000)).toBe(10_000);
  });
});
