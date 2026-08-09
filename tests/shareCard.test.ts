import { describe, expect, it } from 'vitest';
import { blockHeight, fitText, truncateToWidth, wrapText, type Measure } from '../src/utils/canvasText';
import { APP_SHARE_URL, buildShareMessage } from '../src/utils/shareLink';

/**
 * Stand-in for `ctx.measureText`: a monospace face at half the em width. The
 * ratio is arbitrary — what these tests pin down is the invariant the canvas
 * cannot enforce for itself, that no line the layout hands back is wider than
 * the width it was given.
 */
const measure: Measure = (text, fontSize) => text.length * fontSize * 0.5;

/** The share card's safe content width (1080px frame, 90px margins). */
const CARD_W = 900;

const widest = (lines: string[], fontSize: number) =>
  lines.reduce((max, line) => Math.max(max, measure(line, fontSize)), 0);

describe('wrapText', () => {
  it('breaks at word boundaries and keeps every line inside the width', () => {
    const lines = wrapText('NEW PR: MOST WORKOUTS IN A WEEK', measure, 116, CARD_W);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('NEW PR: MOST WORKOUTS IN A WEEK');
    expect(widest(lines, 116)).toBeLessThanOrEqual(CARD_W);
  });

  it('splits a single word that is wider than a whole line', () => {
    const lines = wrapText('Supercalifragilisticexpialidocious', measure, 100, 400);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Supercalifragilisticexpialidocious');
    expect(widest(lines, 100)).toBeLessThanOrEqual(400);
  });

  it('returns nothing for blank text', () => {
    expect(wrapText('   ', measure, 40, CARD_W)).toEqual([]);
  });
});

describe('truncateToWidth', () => {
  it('leaves text that already fits alone', () => {
    expect(truncateToWidth('Heavy Bag', measure, 40, CARD_W)).toBe('Heavy Bag');
  });

  it('clips with an ellipsis and still fits', () => {
    const clipped = truncateToWidth('Heavy Bag Intervals And Pad Rounds', measure, 60, 300);
    expect(clipped.endsWith('…')).toBe(true);
    expect(measure(clipped, 60)).toBeLessThanOrEqual(300);
  });
});

describe('fitText', () => {
  it('keeps a short headline at full size on one line', () => {
    const fitted = fitText('BLUE BELT', measure, { maxWidth: CARD_W, maxSize: 116, minSize: 58 });
    expect(fitted.lines).toEqual(['BLUE BELT']);
    expect(fitted.fontSize).toBe(116);
    expect(fitted.truncated).toBe(false);
  });

  it('wraps the PR headline that used to run off both edges of the card', () => {
    // The shipped bug: a single-line shrink loop bottomed out at its floor size
    // and drew a 30-character headline straight through the card's margins.
    const fitted = fitText('NEW PR: MOST WORKOUTS IN A WEEK', measure, {
      maxWidth: CARD_W, maxSize: 116, minSize: 58, maxLines: 3, step: 6,
    });
    expect(fitted.lines.length).toBeLessThanOrEqual(3);
    expect(fitted.truncated).toBe(false);
    expect(fitted.lines.join(' ')).toBe('NEW PR: MOST WORKOUTS IN A WEEK');
    expect(widest(fitted.lines, fitted.fontSize)).toBeLessThanOrEqual(CARD_W);
  });

  it('spends its line budget on type size, not on fitting one line', () => {
    // A headline is the card's loudest element: two lines at 120px beats one
    // line at 60px, so the budget is filled at the largest size that fits it.
    const roomy = fitText('SEVEN FIGHT WEEK', measure, {
      maxWidth: CARD_W, maxSize: 120, minSize: 40, maxLines: 2,
    });
    expect(roomy.lines).toHaveLength(2);
    expect(roomy.fontSize).toBe(120);
    expect(widest(roomy.lines, roomy.fontSize)).toBeLessThanOrEqual(CARD_W);

    // With only one line to spend, the same headline shrinks instead.
    const tight = fitText('SEVEN FIGHT WEEK', measure, {
      maxWidth: CARD_W, maxSize: 120, minSize: 40, maxLines: 1,
    });
    expect(tight.lines).toHaveLength(1);
    expect(tight.fontSize).toBeLessThan(120);
    expect(tight.truncated).toBe(false);
  });

  it('measures the floor size before giving up on it', () => {
    // The milestone headline steps 116 → 58 by 6, which strides straight past
    // the floor: a plain `size -= step` last measured 62px and then clipped.
    const seen = new Set<number>();
    const spy: Measure = (text, fontSize) => {
      seen.add(fontSize);
      return measure(text, fontSize);
    };
    // Long enough that no size fits, so the search runs the whole ladder down.
    fitText(
      'Fifteen rounds of southpaw counter sparring with the visiting camp plus conditioning intervals and a long cool down',
      spy,
      { maxWidth: CARD_W, maxSize: 116, minSize: 58, maxLines: 3, step: 6 },
    );
    expect(seen.has(58)).toBe(true);
    // …and never below it.
    expect(Math.min(...seen)).toBe(58);
  });

  it('uses the floor size rather than clipping one step above it', () => {
    // Wraps to four lines at 62px but three at 58px — the size the old loop
    // never reached.
    const fitted = fitText(
      'SPARRING ROUNDS COMPLETED TODAY AND HARD CONDITIONING WORK DONE ALSO STRENGTH BLOCK FINISHED',
      measure,
      { maxWidth: CARD_W, maxSize: 116, minSize: 58, maxLines: 3, step: 6 },
    );
    expect(fitted.fontSize).toBe(58);
    expect(fitted.lines).toHaveLength(3);
    expect(fitted.truncated).toBe(false);
    expect(widest(fitted.lines, fitted.fontSize)).toBeLessThanOrEqual(CARD_W);
  });

  it('clips to the line budget rather than overflowing at the floor size', () => {
    const fitted = fitText(
      'Fifteen rounds of southpaw counter sparring with the visiting camp plus conditioning intervals and a long cool down',
      measure,
      { maxWidth: CARD_W, maxSize: 68, minSize: 44, maxLines: 2 },
    );
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.truncated).toBe(true);
    expect(fitted.lines[1].endsWith('…')).toBe(true);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(44);
    expect(widest(fitted.lines, fitted.fontSize)).toBeLessThanOrEqual(CARD_W);
  });

  it('never returns an over-wide line, whatever the input', () => {
    const inputs = [
      'VICTORY',
      '14-DAY STREAK',
      'NEW PR: MOST SPARRING ROUNDS IN A SINGLE WEEK OF CAMP',
      'ААААААААААААААААААААААААААААААААААААААААААААААААААА',
      'https://fightcamp.netlify.app/some/very/long/path/that/never/breaks',
    ];
    for (const input of inputs) {
      const fitted = fitText(input, measure, {
        maxWidth: CARD_W, maxSize: 116, minSize: 58, maxLines: 3, step: 6,
      });
      expect(widest(fitted.lines, fitted.fontSize)).toBeLessThanOrEqual(CARD_W);
    }
  });

  it('reports no lines for an empty subtitle so callers can close the gap', () => {
    const fitted = fitText('', measure, { maxWidth: CARD_W, maxSize: 54, minSize: 36 });
    expect(fitted.lines).toEqual([]);
    expect(blockHeight(fitted)).toBe(0);
  });
});

describe('buildShareMessage', () => {
  it('sends the app link along with the win', () => {
    const message = buildShareMessage('BLUE BELT', 'New rank earned');
    expect(message).toContain('BLUE BELT');
    expect(message).toContain('New rank earned');
    expect(message).toContain(APP_SHARE_URL);
    // Blank line between the achievement and the invitation, so targets that
    // render a link preview don't run the two together.
    expect(message).toMatch(/\n\n/);
  });

  it('still carries the link when there is no detail line', () => {
    const message = buildShareMessage('VICTORY');
    expect(message.startsWith('VICTORY')).toBe(true);
    expect(message).toContain(APP_SHARE_URL);
  });

  it('is just the invitation when there is nothing to say', () => {
    expect(buildShareMessage('', '')).toBe(
      `Tracked with Fight Camp — get the app: ${APP_SHARE_URL}`,
    );
  });
});
