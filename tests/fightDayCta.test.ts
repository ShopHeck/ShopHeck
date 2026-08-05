import { describe, it, expect } from 'vitest';
import { fightCta } from '../src/utils/fightDayCta';

const FIGHT_DATE = '2026-08-05';

function at(iso: string) { return new Date(iso); }

function input(overrides: Partial<Parameters<typeof fightCta>[0]> = {}) {
  return {
    fightDate: FIGHT_DATE,
    daysUntil: 0,
    hasResult: false,
    cornerSession: null,
    ...overrides,
  };
}

describe('fightCta — the fight-day boundary', () => {
  it('offers Corner Mode on the MORNING of fight day', () => {
    // The regression. `parseISO('2026-08-05')` is local midnight, so the old
    // `parseISO(fightDate) < new Date()` was already true at 9am on fight day —
    // which showed the post-fight CTA before the fight had happened and, with
    // Corner Mode gated behind it, made Corner Mode unreachable on the one day
    // it exists for.
    expect(fightCta(input(), at('2026-08-05T09:00:00'))).toBe('corner');
  });

  it('still offers Corner Mode late on fight night', () => {
    expect(fightCta(input(), at('2026-08-05T23:30:00'))).toBe('corner');
  });

  it('switches to post-fight the next morning', () => {
    expect(fightCta(input({ daysUntil: 0 }), at('2026-08-06T08:00:00'))).toBe('post-fight');
  });

  it('switches to post-fight as soon as the corner ends the fight', () => {
    // Fought at 2pm, wants to log at 6pm — being told to come back tomorrow
    // would be absurd.
    const session = { completedAt: '2026-08-05T14:40:00.000Z' };
    expect(fightCta(input({ cornerSession: session }), at('2026-08-05T18:00:00'))).toBe('post-fight');
  });

  it('does not switch early for a corner session that is merely open', () => {
    const session = { completedAt: undefined };
    expect(fightCta(input({ cornerSession: session }), at('2026-08-05T14:00:00'))).toBe('corner');
  });
});

describe('fightCta — the corner window', () => {
  it('offers Corner Mode inside fight week', () => {
    expect(fightCta(input({ daysUntil: 7 }), at('2026-07-29T12:00:00'))).toBe('corner');
  });

  it('offers nothing before fight week', () => {
    expect(fightCta(input({ daysUntil: 8 }), at('2026-07-28T12:00:00'))).toBe('none');
  });
});

describe('fightCta — nothing to offer', () => {
  it('offers nothing without a fight date', () => {
    expect(fightCta(input({ fightDate: undefined }), at('2026-08-05T09:00:00'))).toBe('none');
  });

  it('offers nothing once the result is logged', () => {
    expect(fightCta(input({ hasResult: true }), at('2026-08-06T09:00:00'))).toBe('none');
    expect(fightCta(input({ hasResult: true }), at('2026-08-05T09:00:00'))).toBe('none');
  });

  it('never returns both CTAs — the two are mutually exclusive by construction', () => {
    // Walk the whole handover hour by hour across three days and assert a
    // single answer each time.
    for (let h = 0; h < 72; h++) {
      const now = new Date(Date.parse('2026-08-04T00:00:00') + h * 3600_000);
      const result = fightCta(input({ daysUntil: h < 24 ? 1 : 0 }), now);
      expect(['corner', 'post-fight', 'none']).toContain(result);
    }
  });
});
