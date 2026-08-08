export type TimerTimelinePhase = 'idle' | 'prep' | 'work' | 'rest' | 'done' | string;
export type TimerSegmentKind = 'prep' | 'work' | 'rest';
export type TimerBoundaryKind = 'roundStart' | 'roundEnd' | 'sessionComplete';
export type TimerBoundarySound = 'round-start' | 'round-end';

export interface TimerTimelineInput {
  phase: TimerTimelinePhase;
  round: number;
  rounds: number;
  deadlineMs: number;
  phaseSec: number;
  workSec: number;
  restSec: number;
  isRunning: boolean;
}

export interface TimerTimelineSegment {
  id: string;
  kind: TimerSegmentKind;
  round: number;
  startMs: number;
  endMs: number;
}

export interface TimerBoundaryAlert {
  sessionId: string;
  revision: number;
  boundaryId: string;
  segmentId: string;
  atMs: number;
  kind: TimerBoundaryKind;
  round: number;
  rounds: number;
  title: string;
  body: string;
  sound: TimerBoundarySound;
  terminal: boolean;
}

const MAX_ROUNDS = 30;

function whole(value: number): number | null {
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function segment(kind: TimerSegmentKind, round: number, startMs: number, endMs: number): TimerTimelineSegment {
  return {
    id: `${kind}-${round}-${Math.round(endMs)}`,
    kind,
    round,
    startMs,
    endMs,
  };
}

export function buildTimerTimeline(input: TimerTimelineInput): TimerTimelineSegment[] {
  const phase = input.phase;
  const round = whole(input.round);
  const rounds = whole(input.rounds);
  const phaseSec = whole(input.phaseSec);
  const workSec = whole(input.workSec);
  const restSec = whole(input.restSec);
  const deadlineMs = input.deadlineMs;

  if (!['prep', 'work', 'rest'].includes(phase)
    || round === null || rounds === null || phaseSec === null || workSec === null || restSec === null
    || !Number.isFinite(deadlineMs) || deadlineMs <= 0
    || rounds < 1 || rounds > MAX_ROUNDS || round < 1 || round > rounds
    || phaseSec < 1 || workSec < 1
    || (phase === 'prep' && round !== 1)
    || (phase === 'rest' && round >= rounds)
    || restSec < 0
    || (phase === 'rest' && restSec < 1)) {
    return [];
  }

  const timeline: TimerTimelineSegment[] = [];
  const current = segment(
    phase as TimerSegmentKind,
    round,
    deadlineMs - phaseSec * 1000,
    deadlineMs,
  );
  timeline.push(current);

  if (!input.isRunning) return timeline;

  let cursor = deadlineMs;
  let nextRound = round;

  if (phase === 'prep') {
    timeline.push(segment('work', 1, cursor, cursor += workSec * 1000));
    nextRound = 1;
  } else if (phase === 'rest') {
    nextRound = round + 1;
    timeline.push(segment('work', nextRound, cursor, cursor += workSec * 1000));
  }

  while (nextRound < rounds) {
    if (restSec > 0) {
      timeline.push(segment('rest', nextRound, cursor, cursor += restSec * 1000));
    }
    nextRound += 1;
    timeline.push(segment('work', nextRound, cursor, cursor += workSec * 1000));
  }

  return timeline;
}

export function currentTimerSegment(
  timeline: ReadonlyArray<TimerTimelineSegment>,
  nowMs: number,
  paused = false,
): TimerTimelineSegment | null {
  if (timeline.length === 0 || !Number.isFinite(nowMs)) return null;
  if (paused) return timeline[0] ?? null;
  if (nowMs < timeline[0].startMs) return timeline[0];
  return timeline.find(item => nowMs >= item.startMs && nowMs < item.endMs) ?? null;
}

function boundaryCopy(
  segment: TimerTimelineSegment,
  rounds: number,
  next?: TimerTimelineSegment,
): Omit<TimerBoundaryAlert,
  'sessionId' | 'revision' | 'boundaryId' | 'segmentId' | 'atMs' | 'rounds'> {
  if (segment.kind === 'work' && next?.kind === 'work' && next.round > segment.round) {
    return {
      kind: 'roundStart',
      round: next.round,
      title: next.round === rounds ? 'Last round' : `Round ${next.round}`,
      body: `Round ${next.round} of ${rounds} — go.`,
      sound: 'round-start',
      terminal: false,
    };
  }
  if (segment.kind === 'prep' || segment.kind === 'rest') {
    const round = segment.kind === 'prep' ? 1 : segment.round + 1;
    return {
      kind: 'roundStart',
      round,
      title: round === rounds ? 'Last round' : `Round ${round}`,
      body: `Round ${round} of ${rounds} — go.`,
      sound: 'round-start',
      terminal: false,
    };
  }

  if (segment.round === rounds) {
    return {
      kind: 'sessionComplete',
      round: rounds,
      title: 'Session complete',
      body: 'Great work.',
      sound: 'round-end',
      terminal: true,
    };
  }

  return {
    kind: 'roundEnd',
    round: segment.round,
    title: `End of round ${segment.round}`,
    body: 'Rest.',
    sound: 'round-end',
    terminal: false,
  };
}

export function timerBoundaryAlerts(
  timeline: ReadonlyArray<TimerTimelineSegment>,
  nowMs: number,
  sessionId: string,
  revision: number,
  minimumLeadMs = 0,
  isRunning = true,
  configuredRounds?: number,
  maxEvents = Number.POSITIVE_INFINITY,
): TimerBoundaryAlert[] {
  const normalizedSessionId = sessionId.trim();
  if (!isRunning || !normalizedSessionId || !Number.isFinite(nowMs) || timeline.length === 0) return [];

  const safeRevision = Number.isFinite(revision) ? Math.max(0, Math.trunc(revision)) : 0;
  const lead = Number.isFinite(minimumLeadMs) ? Math.max(0, minimumLeadMs) : Number.POSITIVE_INFINITY;
  const cutoff = nowMs + lead;

  const inferredRounds = Math.max(...timeline.map(candidate => candidate.round));
  const rounds = Number.isFinite(configuredRounds)
    ? Math.max(inferredRounds, Math.trunc(configuredRounds as number))
    : inferredRounds;
  const limit = Number.isFinite(maxEvents) ? Math.max(0, Math.trunc(maxEvents)) : Number.POSITIVE_INFINITY;

  return timeline
    .map((item, index) => ({ item, next: timeline[index + 1] }))
    .filter(({ item }) => item.endMs > cutoff)
    .slice(0, limit)
    .map(({ item, next }) => {
      const copy = boundaryCopy(item, rounds, next);
      return {
        sessionId: normalizedSessionId,
        revision: safeRevision,
        boundaryId: `${normalizedSessionId}:r${safeRevision}:${item.id}`,
        segmentId: item.id,
        atMs: item.endMs,
        rounds,
        ...copy,
      };
    });
}
