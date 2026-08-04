import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayISO, isFutureISODate } from '../src/utils/dates';

afterEach(() => {
  vi.useRealTimers();
});

describe('log-entry date guards', () => {
  it('formats today as a local-calendar date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 23, 30)); // Aug 3, 11:30pm local
    expect(todayISO()).toBe('2026-08-03');
  });

  it('flags only strictly future dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 12, 0));
    expect(isFutureISODate('2026-08-04')).toBe(true);
    expect(isFutureISODate('2026-08-03')).toBe(false);
    expect(isFutureISODate('2026-08-02')).toBe(false);
    expect(isFutureISODate('2025-12-31')).toBe(false);
  });
});
