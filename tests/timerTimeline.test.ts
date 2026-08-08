import { describe, expect, it } from 'vitest';
import {
  buildTimerTimeline,
  currentTimerSegment,
  timerBoundaryAlerts,
  type TimerTimelineInput,
} from '../src/utils/timerTimeline';

const BASE: TimerTimelineInput = {
  phase: 'work',
  round: 1,
  rounds: 3,
  deadlineMs: 1_000_000,
  phaseSec: 180,
  workSec: 180,
  restSec: 60,
  isRunning: true,
};

describe('buildTimerTimeline', () => {
  it('builds one contiguous absolute schedule for every timer surface', () => {
    const timeline = buildTimerTimeline(BASE);

    expect(timeline.map(segment => `${segment.kind}${segment.round}`)).toEqual([
      'work1', 'rest1', 'work2', 'rest2', 'work3',
    ]);
    expect(timeline.map(segment => segment.id)).toEqual([
      'work-1-1000000',
      'rest-1-1060000',
      'work-2-1240000',
      'rest-2-1300000',
      'work-3-1480000',
    ]);
    expect(timeline[0]).toMatchObject({ startMs: 820_000, endMs: 1_000_000 });
    for (let index = 1; index < timeline.length; index += 1) {
      expect(timeline[index].startMs).toBe(timeline[index - 1].endMs);
    }
  });

  it('continues correctly from prep and mid-session rest', () => {
    expect(buildTimerTimeline({ ...BASE, phase: 'prep', phaseSec: 5 })
      .map(segment => `${segment.kind}${segment.round}`)).toEqual([
        'prep1', 'work1', 'rest1', 'work2', 'rest2', 'work3',
      ]);

    expect(buildTimerTimeline({ ...BASE, phase: 'rest', round: 2, rounds: 4, phaseSec: 60 })
      .map(segment => `${segment.kind}${segment.round}`)).toEqual([
        'rest2', 'work3', 'rest3', 'work4',
      ]);
  });

  it('supports back-to-back rounds when rest is disabled', () => {
    const timeline = buildTimerTimeline({ ...BASE, restSec: 0 });

    expect(timeline.map(segment => `${segment.kind}${segment.round}`)).toEqual([
      'work1', 'work2', 'work3',
    ]);
    expect(timeline[1].startMs).toBe(timeline[0].endMs);
  });

  it('uses an extension only for the current phase', () => {
    const timeline = buildTimerTimeline({ ...BASE, deadlineMs: 1_030_000, phaseSec: 210 });
    const works = timeline.filter(segment => segment.kind === 'work');

    expect(works.map(segment => segment.endMs - segment.startMs)).toEqual([
      210_000, 180_000, 180_000,
    ]);
  });

  it('keeps only the frozen current segment while paused', () => {
    const timeline = buildTimerTimeline({ ...BASE, isRunning: false });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      kind: 'work',
      round: 1,
      startMs: 820_000,
      endMs: 1_000_000,
    });
    expect(JSON.stringify(timeline)).not.toContain('null');
  });

  it('fails safe for states that cannot form a valid timer timeline', () => {
    expect(buildTimerTimeline({ ...BASE, phase: 'idle' })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, phase: 'done' })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, phase: 'unknown' })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, rounds: 0 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, rounds: 31 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, round: 0 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, round: 4 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, phase: 'prep', round: 2 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, phase: 'rest', round: 3 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, workSec: 0 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, phase: 'rest', restSec: 0 })).toEqual([]);
    expect(buildTimerTimeline({ ...BASE, deadlineMs: Number.NaN })).toEqual([]);
  });
});

describe('currentTimerSegment', () => {
  it('derives the exact current phase from wall clock at phase boundaries', () => {
    const timeline = buildTimerTimeline(BASE);

    expect(currentTimerSegment(timeline, 999_999)?.id).toBe('work-1-1000000');
    expect(currentTimerSegment(timeline, 1_000_000)?.id).toBe('rest-1-1060000');
    expect(currentTimerSegment(timeline, 1_060_000)?.id).toBe('work-2-1240000');
    expect(currentTimerSegment(timeline, 1_250_000)).toMatchObject({ kind: 'rest', round: 2 });
    expect(currentTimerSegment(timeline, 1_300_000)).toMatchObject({ kind: 'work', round: 3 });
    expect(currentTimerSegment(timeline, 1_480_000)).toBeNull();
  });

  it('freezes the current phase for a paused Live Activity', () => {
    const timeline = buildTimerTimeline({ ...BASE, isRunning: false });
    expect(currentTimerSegment(timeline, Number.MAX_SAFE_INTEGER, true)).toBe(timeline[0]);
  });
});

describe('timerBoundaryAlerts', () => {
  it('emits one stable, revision-scoped event per logical boundary', () => {
    const timeline = buildTimerTimeline(BASE);
    const alerts = timerBoundaryAlerts(timeline, 900_000, 'session-a', 4);

    expect(alerts.map(alert => ({
      id: alert.boundaryId,
      kind: alert.kind,
      round: alert.round,
      atMs: alert.atMs,
      sound: alert.sound,
    }))).toEqual([
      { id: 'session-a:r4:work-1-1000000', kind: 'roundEnd', round: 1, atMs: 1_000_000, sound: 'round-end' },
      { id: 'session-a:r4:rest-1-1060000', kind: 'roundStart', round: 2, atMs: 1_060_000, sound: 'round-start' },
      { id: 'session-a:r4:work-2-1240000', kind: 'roundEnd', round: 2, atMs: 1_240_000, sound: 'round-end' },
      { id: 'session-a:r4:rest-2-1300000', kind: 'roundStart', round: 3, atMs: 1_300_000, sound: 'round-start' },
      { id: 'session-a:r4:work-3-1480000', kind: 'sessionComplete', round: 3, atMs: 1_480_000, sound: 'round-end' },
    ]);
  });

  it('does not duplicate rest-end and next-round-start at the same instant', () => {
    const alerts = timerBoundaryAlerts(buildTimerTimeline(BASE), 0, 'session-a', 1);
    const restEnd = alerts.filter(alert => alert.atMs === 1_060_000);

    expect(restEnd).toHaveLength(1);
    expect(restEnd[0]).toMatchObject({ kind: 'roundStart', round: 2 });
  });

  it('emits one round-start boundary between back-to-back work segments', () => {
    const alerts = timerBoundaryAlerts(
      buildTimerTimeline({ ...BASE, restSec: 0 }), 0, 'session-a', 1,
    );

    expect(alerts.map(alert => ({ kind: alert.kind, round: alert.round, atMs: alert.atMs }))).toEqual([
      { kind: 'roundStart', round: 2, atMs: 1_000_000 },
      { kind: 'roundStart', round: 3, atMs: 1_180_000 },
      { kind: 'sessionComplete', round: 3, atMs: 1_360_000 },
    ]);
  });

  it('drops elapsed and near-immediate boundaries on relaunch instead of replaying bells', () => {
    const timeline = buildTimerTimeline(BASE);
    const alerts = timerBoundaryAlerts(timeline, 1_239_700, 'session-a', 5, 500);

    expect(alerts.map(alert => alert.kind)).toEqual(['roundStart', 'sessionComplete']);
    expect(alerts.every(alert => alert.atMs > 1_240_200)).toBe(true);
  });

  it('uses the right copy and terminal metadata', () => {
    const alerts = timerBoundaryAlerts(buildTimerTimeline(BASE), 0, 'session-a', 1);

    expect(alerts[0]).toMatchObject({ title: 'End of round 1', body: 'Rest.', terminal: false });
    expect(alerts[1]).toMatchObject({ title: 'Round 2', body: 'Round 2 of 3 — go.', terminal: false });
    expect(alerts[3]).toMatchObject({ title: 'Last round', body: 'Round 3 of 3 — go.', terminal: false });
    expect(alerts[4]).toMatchObject({ title: 'Session complete', body: 'Great work.', terminal: true });
  });

  it('cancels by derivation for pause and refuses events without stable identity', () => {
    expect(timerBoundaryAlerts(
      buildTimerTimeline({ ...BASE, isRunning: false }), 0, 'session-a', 2, 0, false,
    )).toEqual([]);
    expect(timerBoundaryAlerts(buildTimerTimeline(BASE), 0, '', 2)).toEqual([]);
  });

  it('changes identities on revision or session replacement without moving times', () => {
    const timeline = buildTimerTimeline(BASE);
    const first = timerBoundaryAlerts(timeline, 0, 'session-a', 1);
    const revised = timerBoundaryAlerts(timeline, 0, 'session-a', 2);
    const replaced = timerBoundaryAlerts(timeline, 0, 'session-b', 1);

    expect(first.map(alert => alert.atMs)).toEqual(revised.map(alert => alert.atMs));
    expect(first.map(alert => alert.boundaryId)).not.toEqual(revised.map(alert => alert.boundaryId));
    expect(first.map(alert => alert.boundaryId)).not.toEqual(replaced.map(alert => alert.boundaryId));
  });

  it('preserves configured total rounds after relaunching late in the session', () => {
    const timeline = buildTimerTimeline({ ...BASE, round: 2, rounds: 4 });
    const alerts = timerBoundaryAlerts(timeline, 900_000, 'session-a', 1, 0, true, 4);

    expect(alerts.map(alert => alert.rounds)).toEqual([4, 4, 4, 4, 4]);
    expect(alerts.at(-1)).toMatchObject({
      kind: 'sessionComplete',
      round: 4,
      title: 'Session complete',
    });
  });

  it('caps pending boundary requests without discarding the imminent ones', () => {
    const timeline = buildTimerTimeline({ ...BASE, rounds: 30 });
    const alerts = timerBoundaryAlerts(timeline, 0, 'session-a', 1, 0, true, 30, 12);

    const allAlerts = timerBoundaryAlerts(timeline, 0, 'session-a', 1, 0, true, 30);
    expect(alerts).toHaveLength(12);
    expect(alerts[0]).toMatchObject({ round: 1, kind: 'roundEnd' });
    expect(alerts.map(alert => alert.boundaryId)).toEqual(
      allAlerts.slice(0, 12).map(alert => alert.boundaryId),
    );
  });

  it('handles an empty timeline and non-finite clocks without fabricated metadata', () => {
    expect(timerBoundaryAlerts([], 0, 'session-a', 1, 0, true, 3)).toEqual([]);
    expect(timerBoundaryAlerts(buildTimerTimeline(BASE), Number.POSITIVE_INFINITY, 'session-a', 1)).toEqual([]);
    expect(currentTimerSegment(buildTimerTimeline(BASE), Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('proves the verbose 30-round wire shape would exceed ActivityKit’s budget', () => {
    const segments = buildTimerTimeline({
      ...BASE,
      rounds: 30,
      deadlineMs: 1_800_000_000_000,
    }).map(({ kind, round, startMs, endMs }) => ({
      kind, round, startMs, endMs,
    }));
    const payload = {
      segments,
      round: 1,
      rounds: 30,
      presetLabel: 'A'.repeat(20),
      isPaused: false,
      pausedRemainingSec: 0,
      workColorHex: '#00E676',
      restColorHex: '#FF2A00',
    };

    expect(new TextEncoder().encode(JSON.stringify(payload)).byteLength).toBeGreaterThanOrEqual(4_096);
  });
});
