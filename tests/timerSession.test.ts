import { describe, expect, it } from 'vitest';
import { timerSessionMinutes, timerSessionSeconds } from '../src/utils/timerSession';

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
