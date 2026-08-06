import { describe, expect, it } from 'vitest';
import {
  timerPrefillForSession,
  timerSessionMinutes,
  timerSessionSeconds,
} from '../src/utils/timerSession';
import type { SessionType } from '../src/types';

const session = (type: SessionType, duration: number, title = 'Session', description = '') =>
  ({ type, duration, title, description });

describe('round timer session duration', () => {
  it('counts rest only between rounds', () => {
    expect(timerSessionSeconds(12, 180, 60)).toBe(47 * 60);
    expect(timerSessionMinutes(12, 180, 60)).toBe(47);
  });

  it('does not add rest after a single round', () => {
    expect(timerSessionSeconds(1, 180, 60)).toBe(180);
    expect(timerSessionMinutes(1, 180, 60)).toBe(3);
  });

  it('supports MMA-length rounds', () => {
    expect(timerSessionSeconds(3, 300, 60)).toBe(17 * 60);
  });

  it('normalizes invalid persisted values safely', () => {
    expect(timerSessionSeconds(Number.NaN, 180, 60)).toBe(0);
    expect(timerSessionSeconds(3.9, -10, 60)).toBe(120);
    expect(timerSessionMinutes(1, 15, 0)).toBe(1);
  });
});

describe('timerPrefillForSession', () => {
  const boxing = { rounds: 3, roundDuration: 3 };   // 3×3min
  const mma    = { rounds: 5, roundDuration: 5 };   // 5×5min

  it('gives sparring the fight format, not the session length', () => {
    // The whole point: a 60-minute sparring block booked for 3×3 must set the
    // clock to 3 rounds of 3 minutes, not fill an hour.
    expect(timerPrefillForSession(session('sparring', 60), boxing)).toEqual({
      rounds: 3, workSec: 180, restSec: 60, label: 'Sparring · fight format',
    });
    expect(timerPrefillForSession(session('sparring', 90), mma)).toMatchObject({
      rounds: 5, workSec: 300,
    });
  });

  it('uses the round spec the session states, over any estimate', () => {
    // The generator writes real specs into descriptions. A 50-minute block that
    // says "8x3min" is 8 rounds — deriving 13 from the block length (which is
    // what filling the whole 50 minutes gave) contradicts the session itself.
    expect(timerPrefillForSession(
      session('conditioning', 50, 'Fight Rounds Conditioning', '8x3min bag rounds with recovery.'),
      boxing,
    )).toMatchObject({ rounds: 8, workSec: 180 });

    // Typographic × and a round length that differs from the camp's.
    expect(timerPrefillForSession(
      session('skill', 60, 'Drilling', 'Work 6×5min rounds on the counter.'),
      boxing,
    )).toMatchObject({ rounds: 6, workSec: 300 });

    // A stated spec beats even sparring's fight-format default.
    expect(timerPrefillForSession(
      session('sparring', 60, 'Hard rounds', '10x3min sparring'),
      mma,
    )).toMatchObject({ rounds: 10, workSec: 180 });
  });

  it('estimates only the working share of an unstated block', () => {
    // A block is warm-up + instruction + water + work, so filling all of it
    // with rounds produced counts nobody trains (75min pad work → 19 rounds).
    // 45 min → 45×⅔ = 30 min of work / 4 min cycle → 8 rounds.
    expect(timerPrefillForSession(session('conditioning', 45), boxing)).toMatchObject({
      rounds: 8, workSec: 180, restSec: 60,
    });
    // 75 min of 3s is capped at championship distance rather than 12.5 rounds.
    expect(timerPrefillForSession(session('skill', 75), boxing)?.rounds).toBe(12);
    // 45 min → 30 min of work / 6 min cycle → 5 rounds.
    expect(timerPrefillForSession(session('skill', 45), mma)).toMatchObject({ rounds: 5 });
  });

  it('carries the session title so the timer says what it is set up for', () => {
    expect(timerPrefillForSession(session('strength', 30, 'Heavy bag'), boxing)?.label)
      .toBe('Heavy bag');
  });

  it('returns null for sessions with nothing to time', () => {
    expect(timerPrefillForSession(session('rest', 0), boxing)).toBeNull();
    expect(timerPrefillForSession(session('recovery', 45), boxing)).toBeNull();
  });

  it('never emits a round count the timer cannot hold', () => {
    // Regression: an unclamped count reached setRounds, whose adjuster stops at
    // 30 — the timer then displayed a value its own controls could not undo.
    // A stated spec is the only path that can exceed the derived cap, so it is
    // the one that has to prove the clamp.
    expect(timerPrefillForSession(
      session('conditioning', 60, 'Absurd', '99x3min rounds'), boxing,
    )?.rounds).toBe(30);
    expect(timerPrefillForSession(session('conditioning', 600), boxing)?.rounds).toBe(12);
    expect(timerPrefillForSession(session('conditioning', 1), boxing)?.rounds).toBe(1);
  });

  it('survives camps carrying nonsense round data', () => {
    const broken = { rounds: Number.NaN, roundDuration: 0 };
    expect(timerPrefillForSession(session('sparring', 30), broken)).toEqual({
      rounds: 1, workSec: 180, restSec: 60, label: 'Sparring · fight format',
    });
    expect(timerPrefillForSession(session('conditioning', Number.NaN), broken)?.rounds).toBe(1);
  });
});
