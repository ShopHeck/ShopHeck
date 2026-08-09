/**
 * The share-image generators — everything that paints a 1080×1920 card.
 *
 * Kept out of the React component on purpose. This module has no DOM
 * dependency beyond a canvas element, so the cards can be rendered and looked
 * at without driving the app to the moment that produces one — see
 * `scripts/share-card-preview.mjs`, which is how a layout regression gets
 * caught before it ships as a screenshot from a user.
 */
import { format, parseISO, differenceInDays } from 'date-fns';
import type { WorkoutLog, FightCamp, FighterProfile } from '../types';
import { resolveToken } from './designTokens';
import { blockHeight, fitText, LINE_HEIGHT_RATIO, type FittedText, type Measure } from './canvasText';
import { APP_SHARE_CTA, APP_SHARE_DOMAIN } from './shareLink';

/**
 * Canvas 2D cannot parse `var()`; it fails silently and paints black. Both
 * generators below therefore resolve the palette once per draw rather than
 * carrying a parallel set of hex literals, which is how an exported card ends
 * up off-brand from the screen that exported it.
 *
 * `withAlpha` exists because the canvas code needs a few translucent fills, and
 * the old code got them by concatenating an alpha suffix onto a hex string
 * ('#ea580c22') — which silently produces an invalid color the moment the base
 * is a token rather than a literal.
 */
function palette() {
  return {
    obsidian: resolveToken('var(--bg-obsidian)'),
    ambient: resolveToken('var(--bg-ambient-warm)'),
    flame: resolveToken('var(--accent-flame)'),
    crimson: resolveToken('var(--accent-crimson)'),
    green: resolveToken('var(--pace-ahead)'),
    surface1: resolveToken('var(--surface-1)'),
    surface2: resolveToken('var(--surface-2)'),
    surface3: resolveToken('var(--surface-3)'),
    white: resolveToken('var(--text-primary)'),
    secondary: resolveToken('var(--text-secondary)'),
    tertiary: resolveToken('var(--text-tertiary)'),
  };
}

type Palette = ReturnType<typeof palette>;

/** Hex or rgb() base + 0–1 alpha → an rgba() the canvas accepts. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** A shareable win that isn't a training session — belt, streak, PR, fight. */
export interface MilestoneShare {
  /** Big center line, e.g. "BLUE BELT", "14-DAY STREAK", "VICTORY". */
  title: string;
  /** Supporting line, e.g. "New rank earned" or "UD · R3 · vs J. Smith". */
  subtitle: string;
  /** Large celebratory glyph drawn above the title. */
  emoji: string;
  /** File-name stem for the exported PNG, e.g. "belt-blue". */
  slug: string;
}

// ── Card geometry ───────────────────────────────────────────────────────────
//
// A 9:16 story frame. PAD is the safe margin: every text block is fitted to
// CONTENT_W, so nothing can reach the edge no matter how long a fighter's
// name, a PR title or a gym's session label turns out to be.

const W = 1080;
const H = 1920;
const PAD = 90;
const CONTENT_W = W - PAD * 2;
const CX = W / 2;
/** Where the download-link footer begins; body layout stops above it. */
const FOOTER_TOP = 1600;
/** Bottom of the header lockup; body layout starts below it. */
const HEADER_BOTTOM = 250;

const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
/**
 * Color emoji live in their own platform font. Without naming one the canvas
 * falls back to the UI font, which has no glyph for 🥋 and paints a tofu box —
 * the orange rectangle that was showing up where the milestone glyph belongs
 * (orange because the box picked up the glow gradient still set as fillStyle).
 */
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

const SESSION_EMOJIS: Record<string, string> = {
  conditioning: '🔥',
  skill: '🥊',
  sparring: '⚡',
  strength: '💪',
  recovery: '🧘',
  rest: '😴',
};

const SESSION_LABELS: Record<string, string> = {
  conditioning: 'Conditioning',
  skill: 'Skill Work',
  sparring: 'Sparring',
  strength: 'Strength',
  recovery: 'Recovery',
  rest: 'Rest',
};

interface FontSpec {
  size: number;
  weight?: 'bold' | 'normal';
  /** Letter spacing in em, matching the design system's tracking scale. */
  tracking?: number;
  family?: string;
}

/**
 * Sets the font *and* the letter spacing, always both.
 *
 * `ctx.letterSpacing` is sticky context state. The old code set '0.15em' for
 * the brand lockup and never cleared it, so every line drawn afterwards —
 * and every width the shrink-to-fit loop measured — silently carried the
 * brand's tracking. On a 31-character headline that is ~260px of phantom
 * width, which is most of why the text left the card.
 */
function setFont(ctx: CanvasRenderingContext2D, spec: FontSpec) {
  const { size, weight = 'normal', tracking = 0, family = UI_FONT } = spec;
  ctx.font = `${weight === 'bold' ? 'bold ' : ''}${size}px ${family}`;
  ctx.letterSpacing = `${tracking}em`;
}

/** A `Measure` bound to this context and font style, for the fit helpers. */
function measurer(ctx: CanvasRenderingContext2D, spec: Omit<FontSpec, 'size'>): Measure {
  return (text, size) => {
    setFont(ctx, { ...spec, size });
    return ctx.measureText(text).width;
  };
}

/** Fits `text` to the card's safe width. Returns a block ready to draw. */
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  spec: Omit<FontSpec, 'size'>,
  bounds: { maxSize: number; minSize: number; maxLines?: number; step?: number; maxWidth?: number },
): FittedText {
  return fitText(text, measurer(ctx, spec), {
    maxWidth: bounds.maxWidth ?? CONTENT_W,
    maxSize: bounds.maxSize,
    minSize: bounds.minSize,
    maxLines: bounds.maxLines ?? 1,
    step: bounds.step ?? 4,
  });
}

/**
 * Draws a fitted block centred on the card, top-aligned at `top`, and returns
 * the y its last line ends at so the next block can stack against it. Every
 * block is laid out from a top edge rather than a baseline — with variable
 * font sizes, baseline arithmetic is what turns "one more line" into overlap.
 */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  fitted: FittedText,
  spec: Omit<FontSpec, 'size'>,
  top: number,
  color: string,
): number {
  if (!fitted.lines.length) return top;
  ctx.fillStyle = color;
  setFont(ctx, { ...spec, size: fitted.fontSize });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const lineHeight = fitted.fontSize * LINE_HEIGHT_RATIO;
  fitted.lines.forEach((line, i) => ctx.fillText(line, CX, top + i * lineHeight));
  return top + fitted.lines.length * lineHeight;
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

/** Background wash + brand accent bar, shared by both cards. */
function drawBackdrop(ctx: CanvasRenderingContext2D, c: Palette) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, c.obsidian);
  bg.addColorStop(1, c.ambient);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = c.flame;
  ctx.fillRect(0, 0, W, 10);
}

/** FIGHT CAMP lockup over the athlete's name. */
function drawHeader(ctx: CanvasRenderingContext2D, c: Palette, name: string) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillStyle = c.flame;
  setFont(ctx, { size: 52, weight: 'bold', tracking: 0.15 });
  ctx.fillText('FIGHT CAMP', CX, 96);

  // Fitted, not trusted: a name is free text and long ones used to run to the
  // edge at a fixed 40px.
  const nameFit = fit(ctx, name.toUpperCase(), { tracking: 0.08 }, { maxSize: 40, minSize: 26 });
  drawBlock(ctx, nameFit, { tracking: 0.08 }, 180, c.tertiary);
}

/**
 * The card's call to action: where to get the app.
 *
 * Drawn into the pixels as well as attached to the share payload, because the
 * two get separated. A card posted to a Story, or screenshotted and forwarded
 * on, arrives with the caption — and its link — stripped.
 */
function drawFooter(ctx: CanvasRenderingContext2D, c: Palette) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.strokeStyle = withAlpha(c.surface3, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, FOOTER_TOP + 14);
  ctx.lineTo(W - PAD, FOOTER_TOP + 14);
  ctx.stroke();

  ctx.fillStyle = c.tertiary;
  setFont(ctx, { size: 32, weight: 'bold', tracking: 0.3 });
  ctx.fillText(APP_SHARE_CTA, CX, FOOTER_TOP + 68);

  const linkSpec: FontSpec = { size: 46, weight: 'bold', tracking: 0.02 };
  setFont(ctx, linkSpec);
  const pillH = 104;
  const pillW = Math.min(CONTENT_W, ctx.measureText(APP_SHARE_DOMAIN).width + 100);
  const pillX = CX - pillW / 2;
  const pillY = FOOTER_TOP + 130;

  ctx.fillStyle = withAlpha(c.flame, 0.14);
  drawRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(c.flame, 0.42);
  ctx.lineWidth = 3;
  drawRoundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();

  ctx.fillStyle = c.flame;
  setFont(ctx, linkSpec);
  ctx.textBaseline = 'middle';
  ctx.fillText(APP_SHARE_DOMAIN, CX, pillY + pillH / 2 + 2);
  ctx.textBaseline = 'top';
}

/** Day N of a camp, 1-based and never below 1. */
export function campDay(camp: FightCamp, isoDate: string): number {
  return Math.max(1, differenceInDays(parseISO(isoDate), parseISO(camp.startDate)) + 1);
}

export function drawSessionCard(log: WorkoutLog, camp: FightCamp, user: FighterProfile): HTMLCanvasElement {
  const [canvas, ctx] = newCanvas();
  const c = palette();

  drawBackdrop(ctx, c);
  drawHeader(ctx, c, user.name);

  const logDate = parseISO(log.date);
  const dayNum = campDay(camp, log.date);
  const totalDays = camp.campWeeks * 7;
  const daysToFight = camp.fightDate
    ? Math.max(0, differenceInDays(parseISO(camp.fightDate), new Date()))
    : 0;

  // Day counter
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = c.tertiary;
  setFont(ctx, { size: 32, weight: 'bold', tracking: 0.3 });
  ctx.fillText('CAMP DAY', CX, HEADER_BOTTOM + 52);

  ctx.fillStyle = c.white;
  setFont(ctx, { size: 230, weight: 'bold' });
  ctx.fillText(String(dayNum), CX, HEADER_BOTTOM + 108);

  ctx.fillStyle = c.secondary;
  setFont(ctx, { size: 56, weight: 'bold' });
  ctx.fillText(`of ${totalDays} days`, CX, HEADER_BOTTOM + 380);

  // Progress bar
  const barY = HEADER_BOTTOM + 470;
  const barH = 18;
  const progress = Math.min(1, dayNum / totalDays);
  ctx.fillStyle = c.surface3;
  drawRoundRect(ctx, PAD, barY, CONTENT_W, barH, barH / 2);
  ctx.fill();
  ctx.fillStyle = c.flame;
  drawRoundRect(ctx, PAD, barY, Math.max(barH, CONTENT_W * progress), barH, barH / 2);
  ctx.fill();

  // Session panel
  const cardX = PAD;
  const cardY = 800;
  const cardW = CONTENT_W;
  const cardH = 520;
  ctx.fillStyle = c.surface1;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 44);
  ctx.fill();
  ctx.strokeStyle = c.surface3;
  ctx.lineWidth = 2;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 44);
  ctx.stroke();

  // Panel contents, measured first and then centred as a group — a two-line
  // session title used to be impossible (titles were chopped at 17 characters),
  // and now that it isn't, the block below it has to move down with it.
  const innerW = cardW - 100;
  const titleFit = fit(ctx, log.title, { weight: 'bold' }, {
    maxSize: 68, minSize: 44, maxLines: 2, maxWidth: innerW,
  });
  const statsFit = fit(ctx, `${log.duration} min  ·  RPE ${log.rpe}/10`, {}, {
    maxSize: 46, minSize: 34, maxWidth: innerW,
  });
  const dateFit = fit(ctx, format(logDate, 'MMMM d, yyyy').toUpperCase(), { tracking: 0.12 }, {
    maxSize: 34, minSize: 26, maxWidth: innerW,
  });

  const badgeH = 84;
  const groupH =
    badgeH + 44 + blockHeight(titleFit) + 30 + blockHeight(statsFit) + 26 + blockHeight(dateFit);
  let y = cardY + Math.max(40, (cardH - groupH) / 2);

  // Session-type badge: emoji and label drawn as two runs so the label keeps
  // the UI font instead of being handed to the emoji font's fallback chain.
  const emoji = SESSION_EMOJIS[log.sessionType] ?? '🏋️';
  const label = (SESSION_LABELS[log.sessionType] ?? log.sessionType).toUpperCase();
  const labelSpec: FontSpec = { size: 40, weight: 'bold', tracking: 0.08 };
  const emojiSpec: FontSpec = { size: 44, family: EMOJI_FONT };
  setFont(ctx, labelSpec);
  const labelW = ctx.measureText(label).width;
  setFont(ctx, emojiSpec);
  const emojiW = ctx.measureText(emoji).width;
  const runGap = 20;
  const badgeW = Math.min(innerW, labelW + emojiW + runGap + 96);
  const badgeX = CX - badgeW / 2;

  ctx.fillStyle = withAlpha(c.flame, 0.13);
  drawRoundRect(ctx, badgeX, y, badgeW, badgeH, badgeH / 2);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const runX = CX - (labelW + emojiW + runGap) / 2;
  ctx.fillStyle = c.white;
  setFont(ctx, emojiSpec);
  ctx.fillText(emoji, runX, y + badgeH / 2);
  ctx.fillStyle = c.flame;
  setFont(ctx, labelSpec);
  ctx.fillText(label, runX + emojiW + runGap, y + badgeH / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  y += badgeH + 44;

  y = drawBlock(ctx, titleFit, { weight: 'bold' }, y, c.white) + 30;
  y = drawBlock(ctx, statsFit, {}, y, c.secondary) + 26;
  drawBlock(ctx, dateFit, { tracking: 0.12 }, y, c.tertiary);

  // Fight context — off-season blocks have no fight date, and
  // format(Invalid Date) throws, which killed the share card entirely.
  const fightDate = camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d, yyyy') : null;
  const fightLabel = fightDate
    ? (camp.opponent ? `vs. ${camp.opponent}  ·  ${fightDate}` : `Fight Date: ${fightDate}`)
    : 'Off-Season Training Block';

  const fightFit = fit(ctx, fightLabel, {}, { maxSize: 42, minSize: 30, maxLines: 2 });
  const fightBottom = drawBlock(ctx, fightFit, {}, cardY + cardH + 62, c.tertiary);

  if (daysToFight > 0) {
    // Same fight-week urgency ramp the countdown card uses. Stacked against the
    // label's measured bottom, so a two-line "vs. Opponent · date" pushes the
    // countdown down instead of being drawn through by it.
    const urgency = daysToFight < 14 ? c.crimson : daysToFight < 28 ? c.flame : c.green;
    const countFit = fit(ctx, `${daysToFight} days to fight`, { weight: 'bold' }, {
      maxSize: 54, minSize: 38,
    });
    drawBlock(ctx, countFit, { weight: 'bold' }, fightBottom + 26, urgency);
  }

  drawFooter(ctx, c);
  return canvas;
}

export function drawMilestoneCard(m: MilestoneShare, user: FighterProfile): HTMLCanvasElement {
  const [canvas, ctx] = newCanvas();
  const c = palette();

  drawBackdrop(ctx, c);
  drawHeader(ctx, c, user.name);

  // Medallion: a soft glow, a disc, and the glyph. The disc is what makes a
  // platform without the emoji still look deliberate rather than broken.
  const medalY = 610;
  const medalR = 200;
  const glow = ctx.createRadialGradient(CX, medalY, 40, CX, medalY, medalR * 2.4);
  glow.addColorStop(0, withAlpha(c.flame, 0.24));
  glow.addColorStop(1, withAlpha(c.flame, 0));
  // Filled to exactly the gradient's reach: a shorter rect clips the wash
  // mid-falloff and leaves a visible horizontal seam across the card.
  ctx.fillStyle = glow;
  ctx.fillRect(0, medalY - medalR * 2.4, W, medalR * 4.8);

  ctx.beginPath();
  ctx.arc(CX, medalY, medalR, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(c.surface2, 0.92);
  ctx.fill();
  ctx.strokeStyle = withAlpha(c.flame, 0.45);
  ctx.lineWidth = 6;
  ctx.stroke();

  // Explicit fill: without it the glyph inherits whatever was last set — the
  // glow gradient — which is what tinted the missing-glyph box orange.
  ctx.fillStyle = c.white;
  setFont(ctx, { size: 210, family: EMOJI_FONT });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.emoji, CX, medalY + 8);
  ctx.textBaseline = 'top';

  // Headline / subtitle / date, measured as a group and centred in the space
  // between the medallion and the footer.
  const titleFit = fit(ctx, m.title, { weight: 'bold', tracking: 0.01 }, {
    maxSize: 116, minSize: 58, maxLines: 3, step: 6,
  });
  const subtitleFit = fit(ctx, m.subtitle, {}, { maxSize: 54, minSize: 36, maxLines: 2, step: 3 });
  const dateFit = fit(ctx, format(new Date(), 'MMMM d, yyyy').toUpperCase(), { tracking: 0.12 }, {
    maxSize: 34, minSize: 26,
  });

  const gapAfterTitle = subtitleFit.lines.length ? 38 : 0;
  const groupH =
    blockHeight(titleFit) + gapAfterTitle + blockHeight(subtitleFit) + 54 + blockHeight(dateFit);
  const regionTop = medalY + medalR + 70;
  let y = regionTop + Math.max(0, (FOOTER_TOP - 40 - regionTop - groupH) / 2);

  y = drawBlock(ctx, titleFit, { weight: 'bold', tracking: 0.01 }, y, c.white) + gapAfterTitle;
  y = drawBlock(ctx, subtitleFit, {}, y, c.secondary) + 54;
  drawBlock(ctx, dateFit, { tracking: 0.12 }, y, c.tertiary);

  drawFooter(ctx, c);
  return canvas;
}
