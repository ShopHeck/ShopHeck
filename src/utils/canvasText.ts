/**
 * Text layout for the canvas-drawn share images.
 *
 * Canvas 2D gives you none of what the browser does for free with DOM text:
 * no line breaking, no shrink-to-fit, no ellipsis. `fillText` with a string
 * wider than the bitmap simply paints past the edge — which is how "NEW PR:
 * MOST WORKOUTS IN A WEEK" ended up running off both sides of the milestone
 * card. A single-line shrink loop is not a fix either: below a readable floor
 * it has to give up, and what it gives up on is the overflow.
 *
 * So the rule these helpers enforce is that a returned line is never wider
 * than `maxWidth`. Text wraps first, shrinks if the wrap needs too many lines,
 * and is clipped with an ellipsis only when even the floor size can't fit the
 * line budget.
 *
 * Measurement is injected rather than read off a context, so the layout is
 * testable without a canvas; ShareCard passes a closure over `measureText`.
 */

/** Width `text` would occupy if drawn at `fontSize`. */
export type Measure = (text: string, fontSize: number) => number;

export interface FitOptions {
  /** Hard limit. No line in the result is wider than this. */
  maxWidth: number;
  /** Preferred size, stepped down until the block fits its line budget. */
  maxSize: number;
  /** Readability floor — past it the text is clipped rather than shrunk. */
  minSize: number;
  /** How many lines the block may occupy. Default 1. */
  maxLines?: number;
  /** Shrink increment in px. Default 4. */
  step?: number;
}

export interface FittedText {
  /** Ready to draw, one entry per line. Empty for blank input. */
  lines: string[];
  fontSize: number;
  /** True when the text did not fit and was clipped with an ellipsis. */
  truncated: boolean;
}

const ELLIPSIS = '…';

/**
 * Splits a word that is too long for a line of its own at the character level.
 * `Array.from` rather than indexing, so an emoji or accented glyph is not torn
 * in half at a surrogate pair boundary.
 */
function breakWord(word: string, measure: Measure, fontSize: number, maxWidth: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const ch of Array.from(word)) {
    if (piece && measure(piece + ch, fontSize) > maxWidth) {
      pieces.push(piece);
      piece = ch;
    } else {
      piece += ch;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

/** Greedy word wrap at a fixed size. Every line fits `maxWidth`. */
export function wrapText(
  text: string,
  measure: Measure,
  fontSize: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line) {
      lines.push(line);
      line = '';
    }
  };

  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    flush();
    if (measure(word, fontSize) <= maxWidth) {
      line = word;
      continue;
    }
    // Longer than a whole line on its own (an unspaced title, a pasted URL):
    // break it rather than let it overhang.
    for (const piece of breakWord(word, measure, fontSize, maxWidth)) {
      flush();
      line = piece;
    }
  }
  flush();
  return lines;
}

/** `text` clipped to fit `maxWidth`, with an ellipsis when anything was cut. */
export function truncateToWidth(
  text: string,
  measure: Measure,
  fontSize: number,
  maxWidth: number,
): string {
  if (measure(text, fontSize) <= maxWidth) return text;
  let kept = '';
  for (const ch of Array.from(text)) {
    if (measure(kept + ch + ELLIPSIS, fontSize) > maxWidth) break;
    kept += ch;
  }
  return kept.trimEnd() + ELLIPSIS;
}

/**
 * Largest size at which `text` wraps into at most `maxLines` lines of
 * `maxWidth`, falling back to a clipped block at the floor size.
 */
export function fitText(text: string, measure: Measure, opts: FitOptions): FittedText {
  const { maxWidth, minSize, maxLines = 1, step = 4 } = opts;
  const maxSize = Math.max(opts.maxSize, minSize);
  const trimmed = text.trim();
  if (!trimmed) return { lines: [], fontSize: maxSize, truncated: false };

  let lines: string[] = [];
  let fontSize = maxSize;
  for (let size = maxSize; size >= minSize; size -= step) {
    fontSize = size;
    lines = wrapText(trimmed, measure, size, maxWidth);
    if (lines.length <= maxLines) return { lines, fontSize: size, truncated: false };
  }

  // Even at the floor the wrap overruns its budget. Keep the budget and clip:
  // a card with a predictable footprint beats one whose headline shoves the
  // rest of the layout off the bottom edge.
  const kept = lines.slice(0, maxLines);
  const overflow = lines.slice(maxLines).join(' ');
  const last = kept.length ? kept[kept.length - 1] : '';
  kept[Math.max(0, kept.length - 1)] = truncateToWidth(
    overflow ? `${last} ${overflow}` : last,
    measure,
    fontSize,
    maxWidth,
  );
  return { lines: kept, fontSize, truncated: true };
}

/** Height of a fitted block, for laying blocks out against each other. */
export const LINE_HEIGHT_RATIO = 1.16;

export function blockHeight(fit: FittedText): number {
  return fit.lines.length * fit.fontSize * LINE_HEIGHT_RATIO;
}
