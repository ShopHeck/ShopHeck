import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildSegments, type LiveActivityTimerSnapshot } from '../src/utils/liveActivity';

// The Live Activity keeps counting while the app is suspended because the
// widget renders these segments against Date(). Getting the segment geometry
// wrong would show the wrong phase or a wrong countdown on the Lock Screen,
// so the geometry is pinned here.

function snap(partial: Partial<LiveActivityTimerSnapshot> = {}): LiveActivityTimerSnapshot {
  return {
    phase: 'work',
    round: 1,
    rounds: 3,
    deadlineMs: 0,
    phaseSec: 180,
    workSec: 180,
    restSec: 60,
    prepSec: 5,
    isRunning: true,
    pausedTimeLeft: 0,
    presetLabel: 'Boxing',
    workColorHex: '#22c55e',
    restColorHex: '#ef4444',
    ...partial,
  };
}

describe('buildSegments — Live Activity schedule geometry', () => {
  const NOW = new Date('2026-08-04T12:00:00Z').getTime();

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts with the current phase, anchored on the live deadline', () => {
    vi.setSystemTime(NOW);
    // 90 seconds left of a 180s work round.
    const s = snap({ phase: 'work', round: 1, deadlineMs: NOW + 90_000, phaseSec: 180 });
    const segs = buildSegments(s);

    expect(segs[0]).toEqual({
      kind: 'work', round: 1,
      startMs: NOW + 90_000 - 180_000,
      endMs: NOW + 90_000,
    });
  });

  it('lays out rest/work alternation and ends on the final work round', () => {
    vi.setSystemTime(NOW);
    const s = snap({ phase: 'work', round: 1, deadlineMs: NOW + 180_000 });
    const segs = buildSegments(s);

    // 3 rounds → work, rest, work, rest, work — no rest after the last round.
    expect(segs.map(x => x.kind)).toEqual(['work', 'rest', 'work', 'rest', 'work']);
    expect(segs.map(x => x.round)).toEqual([1, 1, 2, 2, 3]);
    // Contiguous: each segment starts where the previous ended.
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startMs).toBe(segs[i - 1].endMs);
    }
    // Total remaining time = 3×work + 2×rest.
    const total = segs[segs.length - 1].endMs - segs[0].startMs;
    expect(total).toBe((3 * 180 + 2 * 60) * 1000);
  });

  it('continues mid-session from a rest phase with the right round numbers', () => {
    vi.setSystemTime(NOW);
    // Resting after round 2 of 4: remaining is rest, work(3), rest, work(4).
    const s = snap({ phase: 'rest', round: 2, rounds: 4, deadlineMs: NOW + 30_000, phaseSec: 60 });
    const segs = buildSegments(s);

    expect(segs.map(x => `${x.kind}${x.round}`)).toEqual(['rest2', 'work3', 'rest3', 'work4']);
  });

  it('from prep, schedules round 1 first and then alternates', () => {
    vi.setSystemTime(NOW);
    const s = snap({ phase: 'prep', round: 1, deadlineMs: NOW + 5_000, phaseSec: 5 });
    const segs = buildSegments(s);

    expect(segs[0].kind).toBe('prep');
    expect(segs[1]).toMatchObject({ kind: 'work', round: 1 });
    expect(segs.length).toBe(1 + 3 + 2); // prep + 3 work + 2 rest
  });

  it('a paused session carries only the frozen current segment', () => {
    vi.setSystemTime(NOW);
    const s = snap({ phase: 'work', round: 2, isRunning: false, pausedTimeLeft: 45, deadlineMs: NOW + 45_000 });
    const segs = buildSegments(s);

    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ kind: 'work', round: 2 });
  });

  it('an extended phase (+30s) lengthens only the current segment', () => {
    vi.setSystemTime(NOW);
    const s = snap({ phase: 'work', round: 1, deadlineMs: NOW + 200_000, phaseSec: 210 });
    const segs = buildSegments(s);

    // Current segment spans the full (extended) 210s.
    expect(segs[0].endMs - segs[0].startMs).toBe(210_000);
    // Subsequent work rounds stay at the base duration.
    const nextWork = segs.find(x => x.kind === 'work' && x.round === 2);
    expect(nextWork!.endMs - nextWork!.startMs).toBe(180_000);
  });
});
