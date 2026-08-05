import { describe, it, expect } from 'vitest';
import {
  planSegmentForRound,
  planTextForRound,
  cornerRoundsToFightRounds,
  hasScoredRounds,
  upsertCornerRound,
  activeCornerSession,
} from '../src/utils/cornerMode';
import { createDefaultState } from '../src/utils/storage';
import type { AppState, CornerSession, GamePlan } from '../src/types';

function session(overrides: Partial<CornerSession> = {}): CornerSession {
  return {
    id: 's1',
    campId: 'camp-1',
    startedAt: '2026-03-01T20:00:00.000Z',
    totalRounds: 3,
    roundSeconds: 300,
    restSeconds: 60,
    rounds: [],
    ...overrides,
  };
}

function plan(overrides: Partial<GamePlan> = {}): GamePlan {
  return {
    campId: 'camp-1',
    styleNotes: '',
    earlyRoundPlan: 'Feel them out, work the jab.',
    midRoundPlan: 'Start sitting down on shots.',
    lateRoundPlan: 'Empty the tank.',
    keyTechniques: '',
    thingsToAvoid: '',
    cornerInstructions: 'Breathe. Hands up.',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('planSegmentForRound', () => {
  it('maps a 3-round fight to one round per segment', () => {
    expect(planSegmentForRound(1, 3)).toBe('early');
    expect(planSegmentForRound(2, 3)).toBe('mid');
    expect(planSegmentForRound(3, 3)).toBe('late');
  });

  it('splits a 5-round fight into thirds', () => {
    expect(planSegmentForRound(1, 5)).toBe('early');
    expect(planSegmentForRound(2, 5)).toBe('early');
    expect(planSegmentForRound(3, 5)).toBe('mid');
    expect(planSegmentForRound(4, 5)).toBe('mid');
    expect(planSegmentForRound(5, 5)).toBe('late');
  });

  it('handles a 12-round fight', () => {
    expect(planSegmentForRound(1, 12)).toBe('early');
    expect(planSegmentForRound(4, 12)).toBe('early');
    expect(planSegmentForRound(5, 12)).toBe('mid');
    expect(planSegmentForRound(12, 12)).toBe('late');
  });

  it('never leaves a round unsegmented', () => {
    for (let total = 1; total <= 15; total++) {
      for (let r = 1; r <= total; r++) {
        expect(['early', 'mid', 'late']).toContain(planSegmentForRound(r, total));
      }
    }
  });

  it('clamps a round outside the card', () => {
    expect(planSegmentForRound(0, 3)).toBe('early');
    expect(planSegmentForRound(99, 3)).toBe('late');
  });
});

describe('planTextForRound', () => {
  it('returns the segment text for the round', () => {
    expect(planTextForRound(plan(), 3, 3)).toEqual({ segment: 'late', text: 'Empty the tank.' });
  });

  it('returns null without a plan', () => {
    expect(planTextForRound(undefined, 1, 3)).toBeNull();
  });

  it('returns null when that segment is blank rather than showing an empty card', () => {
    expect(planTextForRound(plan({ lateRoundPlan: '   ' }), 3, 3)).toBeNull();
  });
});

describe('upsertCornerRound', () => {
  it('adds a round in order', () => {
    let s = upsertCornerRound(session(), { roundNumber: 2, selfScore: 4 });
    s = upsertCornerRound(s, { roundNumber: 1, selfScore: 3 });
    expect(s.rounds.map(r => r.roundNumber)).toEqual([1, 2]);
  });

  it('replaces a re-scored round instead of duplicating it', () => {
    let s = upsertCornerRound(session(), { roundNumber: 1, selfScore: 2 });
    s = upsertCornerRound(s, { roundNumber: 1, selfScore: 5 });
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0].selfScore).toBe(5);
  });
});

describe('activeCornerSession', () => {
  function stateWith(sessions: CornerSession[]): AppState {
    return { ...createDefaultState(), cornerSessions: sessions };
  }

  it('finds an open session for the camp', () => {
    expect(activeCornerSession(stateWith([session()]), 'camp-1')?.id).toBe('s1');
  });

  it('ignores a consumed session', () => {
    expect(activeCornerSession(stateWith([session({ consumed: true })]), 'camp-1')).toBeNull();
  });

  it('ignores another camp’s session', () => {
    expect(activeCornerSession(stateWith([session()]), 'camp-2')).toBeNull();
  });

  it('picks the newest when more than one is open', () => {
    const older = session({ id: 'old', startedAt: '2026-03-01T18:00:00.000Z' });
    const newer = session({ id: 'new', startedAt: '2026-03-01T21:00:00.000Z' });
    expect(activeCornerSession(stateWith([older, newer]), 'camp-1')?.id).toBe('new');
  });
});

describe('hasScoredRounds', () => {
  it('is false for an untouched session', () => {
    expect(hasScoredRounds(session())).toBe(false);
    expect(hasScoredRounds(session({ rounds: [{ roundNumber: 1 }] }))).toBe(false);
  });

  it('is true once anything was tapped', () => {
    expect(hasScoredRounds(session({ rounds: [{ roundNumber: 1, cardio: 2 }] }))).toBe(true);
    expect(hasScoredRounds(session({ rounds: [{ roundNumber: 1, damageTaken: 'heavy' }] }))).toBe(true);
    expect(hasScoredRounds(session({ rounds: [{ roundNumber: 1, cornerAdjustment: 'jab' }] }))).toBe(true);
  });

  it('is false for a corner note that is only whitespace', () => {
    expect(hasScoredRounds(session({ rounds: [{ roundNumber: 1, cornerAdjustment: '  ' }] }))).toBe(false);
  });

  it('is false for no session at all', () => {
    expect(hasScoredRounds(null)).toBe(false);
  });
});

describe('cornerRoundsToFightRounds', () => {
  it('carries every tapped value across', () => {
    const s = session({
      rounds: [{
        roundNumber: 1, selfScore: 4, cardio: 2, opponentPressure: 5,
        damageDealt: 'moderate', damageTaken: 'heavy', cornerAdjustment: 'Circle left',
      }],
    });
    expect(cornerRoundsToFightRounds(s)[0]).toEqual({
      roundNumber: 1,
      selfScore: 4,
      cardio: 2,
      opponentPressure: 5,
      damageDealt: 'moderate',
      damageTaken: 'heavy',
      workedWell: '',
      didntWork: '',
      cornerAdjustment: 'Circle left',
    });
  });

  it('fills a partly-scored round with neutral defaults', () => {
    // A corner has one free hand and sixty seconds. Whatever was not tapped
    // must come out indistinguishable from a round the fighter never filled in
    // — inventing scores would poison factorTuner, which learns from these.
    const s = session({ rounds: [{ roundNumber: 1, selfScore: 5 }] });
    const [r] = cornerRoundsToFightRounds(s);
    expect(r.selfScore).toBe(5);
    expect(r.cardio).toBe(3);
    expect(r.opponentPressure).toBe(3);
    expect(r.damageDealt).toBe('none');
    expect(r.damageTaken).toBe('none');
  });

  it('only emits the rounds actually fought', () => {
    // A 3-round card stopped in round 2 must not report a third round that
    // never happened — FightResultForm slices on roundStopped, and a phantom
    // round would survive into the KPIs.
    const s = session({
      totalRounds: 3,
      rounds: [{ roundNumber: 1, selfScore: 3 }, { roundNumber: 2, selfScore: 4 }],
    });
    expect(cornerRoundsToFightRounds(s).map(r => r.roundNumber)).toEqual([1, 2]);
  });

  it('fills gaps when a middle round went unscored', () => {
    const s = session({
      rounds: [{ roundNumber: 1, selfScore: 4 }, { roundNumber: 3, selfScore: 2 }],
    });
    const out = cornerRoundsToFightRounds(s);
    expect(out.map(r => r.roundNumber)).toEqual([1, 2, 3]);
    expect(out[1].selfScore).toBe(3);
  });

  it('falls back to the full card when nothing was scored at all', () => {
    expect(cornerRoundsToFightRounds(session()).map(r => r.roundNumber)).toEqual([1, 2, 3]);
  });

  it('leaves the free-text fields genuinely empty', () => {
    const s = session({ rounds: [{ roundNumber: 1, selfScore: 4 }] });
    const [r] = cornerRoundsToFightRounds(s);
    expect(r.workedWell).toBe('');
    expect(r.didntWork).toBe('');
  });
});
