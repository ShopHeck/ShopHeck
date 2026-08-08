import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  activityKitContentStateByteSize,
  buildSegments,
  type LiveActivityTimerSnapshot,
} from '../src/utils/liveActivity';
import { shouldAcceptWatchCommand } from '../src/utils/watchCommand';

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

  it('supports consecutive work rounds when a supplied plan has no rest', () => {
    vi.setSystemTime(NOW);
    const segs = buildSegments(snap({ restSec: 0, deadlineMs: NOW + 180_000 }));

    expect(segs.map(x => `${x.kind}${x.round}`)).toEqual(['work1', 'work2', 'work3']);
  });

  it('keeps the compact 30-round state within ActivityKit’s 4 KB budget', () => {
    vi.setSystemTime(NOW);
    const state = snap({
      rounds: 30,
      deadlineMs: NOW + 180_000,
      presetLabel: 'A'.repeat(20),
    });

    expect(activityKitContentStateByteSize(state)).toBeLessThan(4_096);
  });
});

/**
 * The widget's own phase lookup, mirrored.
 *
 * A Live Activity is not re-rendered on demand: the system builds one
 * rendering per schedule entry ahead of time and replays them, so each
 * rendering resolves "now" to its OWN entry date rather than to the wall clock
 * of the moment it is shown. That makes the entry schedule part of the
 * segment contract, not a widget implementation detail — keying it on segment
 * ENDS put the first rendering (the one on screen from the push until the
 * current segment finishes) a whole phase ahead of the fighter, showing REST
 * mid-round and WORK mid-rest. These mirror TimerLiveActivityWidget.swift.
 */
function widgetEntryDates(segs: ReturnType<typeof buildSegments>): number[] {
  const dates = segs.map(s => s.startMs);
  const last = segs[segs.length - 1];
  if (last) dates.push(last.endMs);
  return dates;
}

function widgetResolvedSegment(segs: ReturnType<typeof buildSegments>, nowMs: number) {
  // The +0.5ms mirrors segmentBoundaryToleranceMs.
  return segs.find(s => s.endMs > nowMs + 0.5) ?? null;
}

describe('Live Activity widget phase resolution', () => {
  const NOW = new Date('2026-08-04T12:00:00Z').getTime();

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the round that is actually live at the moment the app pushes', () => {
    vi.setSystemTime(NOW);
    // 90 seconds into a live 3-minute round 1 of a 12×3/1 boxing session.
    const segs = buildSegments(snap({
      phase: 'work', round: 1, rounds: 12,
      deadlineMs: NOW + 90_000, phaseSec: 180, workSec: 180, restSec: 60,
    }));

    const first = widgetEntryDates(segs)[0];
    const shown = widgetResolvedSegment(segs, first);

    // The regression: this resolved to the 1-minute rest segment.
    expect(shown).toMatchObject({ kind: 'work', round: 1 });
    expect(shown!.endMs - shown!.startMs).toBe(180_000);
  });

  it('shows the rest that is actually live, not the round after it', () => {
    vi.setSystemTime(NOW);
    const segs = buildSegments(snap({
      phase: 'rest', round: 1, rounds: 12,
      deadlineMs: NOW + 30_000, phaseSec: 60, workSec: 180, restSec: 60,
    }));

    const shown = widgetResolvedSegment(segs, widgetEntryDates(segs)[0]);

    expect(shown).toMatchObject({ kind: 'rest', round: 1 });
  });

  it('gives every entry the segment that entry is displayed for', () => {
    vi.setSystemTime(NOW);
    const segs = buildSegments(snap({
      phase: 'prep', round: 1, rounds: 3,
      deadlineMs: NOW + 5_000, phaseSec: 5, workSec: 180, restSec: 60,
    }));
    const entries = widgetEntryDates(segs);

    // One entry per segment, plus the trailing end-of-session entry.
    expect(entries).toHaveLength(segs.length + 1);
    segs.forEach((segment, i) => {
      expect(widgetResolvedSegment(segs, entries[i])).toBe(segment);
      // ...and it still holds a hair after the entry, and right up to its end.
      expect(widgetResolvedSegment(segs, entries[i] + 1)).toBe(segment);
      expect(widgetResolvedSegment(segs, segment.endMs - 1)).toBe(segment);
    });
  });

  it('resolves to nothing once the whole schedule has elapsed (DONE)', () => {
    vi.setSystemTime(NOW);
    const segs = buildSegments(snap({
      phase: 'work', round: 3, rounds: 3, deadlineMs: NOW + 10_000,
    }));
    const entries = widgetEntryDates(segs);

    // The trailing entry is what lets a session finishing while the app is
    // suspended reach "DONE" instead of freezing on a 0:00 segment.
    expect(widgetResolvedSegment(segs, entries[entries.length - 1])).toBeNull();
  });

  it('never resolves backwards at a boundary despite Double round-tripping', () => {
    vi.setSystemTime(NOW);
    const segs = buildSegments(snap({
      phase: 'work', round: 1, rounds: 3, deadlineMs: NOW + 180_000,
    }));

    for (let i = 0; i < segs.length - 1; i++) {
      const boundary = segs[i].endMs;
      // Exactly on the boundary, and a fraction either side of it, the segment
      // that is STARTING wins — never the one that just ended.
      expect(widgetResolvedSegment(segs, boundary)).toBe(segs[i + 1]);
      expect(widgetResolvedSegment(segs, boundary - 0.4)).toBe(segs[i + 1]);
      expect(widgetResolvedSegment(segs, boundary + 0.4)).toBe(segs[i + 1]);
    }
  });
});

describe('shouldAcceptWatchCommand — stale command rejection', () => {
  // transferUserInfo can deliver a start/pause/reset minutes late, after the
  // fighter already finished a different session. Accepting those would restart
  // or pause the wrong timer. These rules are the phone-side filter.

  const NOW = 1_700_000_000_000; // fixed epoch ms

  it('accepts a fresh command for the active session with a newer seq', () => {
    expect(shouldAcceptWatchCommand(
      { command: 'pause', sessionId: 's1', seq: 2, createdAtMs: NOW - 1_000 },
      { activeSessionId: 's1', lastSeq: 1, nowMs: NOW },
    )).toBe(true);
  });

  it('rejects a command from a different session once one is active', () => {
    expect(shouldAcceptWatchCommand(
      { command: 'start', sessionId: 'old', seq: 9, createdAtMs: NOW },
      { activeSessionId: 's1', lastSeq: 0, nowMs: NOW },
    )).toBe(false);
  });

  it('rejects a duplicate or older sequence for the same session', () => {
    expect(shouldAcceptWatchCommand(
      { command: 'pause', sessionId: 's1', seq: 3, createdAtMs: NOW },
      { activeSessionId: 's1', lastSeq: 3, nowMs: NOW },
    )).toBe(false);
    expect(shouldAcceptWatchCommand(
      { command: 'pause', sessionId: 's1', seq: 2, createdAtMs: NOW },
      { activeSessionId: 's1', lastSeq: 3, nowMs: NOW },
    )).toBe(false);
  });

  it('rejects a command older than the TTL even if seq is new', () => {
    expect(shouldAcceptWatchCommand(
      { command: 'reset', sessionId: 's1', seq: 10, createdAtMs: NOW - 60_000 },
      { activeSessionId: 's1', lastSeq: 1, nowMs: NOW, ttlMs: 30_000 },
    )).toBe(false);
  });

  it('accepts a command that establishes the first active session', () => {
    // Wrist-started sessions reach the phone before any phone-side startSession.
    expect(shouldAcceptWatchCommand(
      { command: 'start', sessionId: 'wrist-1', seq: 1, createdAtMs: NOW },
      { activeSessionId: null, lastSeq: 0, nowMs: NOW },
    )).toBe(true);
  });

  it('rejects payloads missing identity metadata (cannot prove freshness)', () => {
    expect(shouldAcceptWatchCommand(
      { command: 'start' },
      { activeSessionId: 's1', lastSeq: 0, nowMs: NOW },
    )).toBe(false);
  });
});
