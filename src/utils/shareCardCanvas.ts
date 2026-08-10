/**
 * The share-image generators — everything that paints a 1080×1920 card.
 *
 * Kept out of the React component on purpose. This module has no DOM
 * dependency beyond a canvas element, so the cards can be rendered and looked
 * at without driving the app to the moment that produces one — see
 * `scripts/share-card-preview.mjs`, which is how a layout regression gets
 * caught before it ships as a screenshot from a user.
 *
 * ── The layout contract ────────────────────────────────────────────────────
 * The card is built from fixed vertical regions (see the geometry block), each
 * of which owns its band of the frame: the display headline is bottom-anchored
 * in its region, the medallion's centre never moves, the middle stack is
 * centred in the gap between them, and the footer is pinned to the bottom.
 * Nothing is laid out relative to the thing above it, so no amount of text can
 * push a later block into another one — and every text block goes through
 * `fit`, so no line can reach the card's edge either.
 */
import { format, parseISO, differenceInDays } from 'date-fns';
import type { WorkoutLog, FightCamp, FighterProfile } from '../types';
import { resolveToken } from './designTokens';
import { blockHeight, fitText, LINE_HEIGHT_RATIO, type FittedText, type Measure } from './canvasText';
import { APP_SHARE_DOMAIN } from './shareLink';

/**
 * Canvas 2D cannot parse `var()`; it fails silently and paints black. Both
 * generators below therefore resolve the palette once per draw rather than
 * carrying a parallel set of hex literals, which is how an exported card ends
 * up off-brand from the screen that exported it.
 */
function palette() {
  return {
    obsidian: resolveToken('var(--bg-obsidian)'),
    ambient: resolveToken('var(--bg-ambient-warm)'),
    flame: resolveToken('var(--accent-flame)'),
    crimson: resolveToken('var(--accent-crimson)'),
    gold: resolveToken('var(--accent-gold)'),
    green: resolveToken('var(--pace-ahead)'),
    surface1: resolveToken('var(--surface-1)'),
    surface3: resolveToken('var(--surface-3)'),
    white: resolveToken('var(--text-primary)'),
    secondary: resolveToken('var(--text-secondary)'),
    tertiary: resolveToken('var(--text-tertiary)'),
  };
}

type Palette = ReturnType<typeof palette>;

/** Any CSS color the tokens can produce → channels, for alpha and mixing. */
function toRgb(color: string): [number, number, number] {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = color.trim().match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const [r, g, b] = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [r || 0, g || 0, b || 0];
  }
  return [255, 255, 255];
}

/**
 * `withAlpha` exists because the canvas code needs a lot of translucent fills,
 * and the old code got them by concatenating an alpha suffix onto a hex string
 * ('#ea580c22') — which silently produces an invalid color the moment the base
 * is a token rather than a literal.
 */
function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = toRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Linear blend, for building the headline's gradient out of brand tokens. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  const at = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${at(r1, r2)}, ${at(g1, g2)}, ${at(b1, b2)})`;
}

/**
 * A shareable win that isn't a training session — belt, streak, PR, fight.
 *
 * `title`/`subtitle` are the toast's wording and the share sheet's; the
 * optional slots below are what the card actually lays out. A caller that
 * knows the parts (a PR knows its label, value, unit and previous best) should
 * pass them, because a card built from `"New PR: Most workouts in a week"` can
 * only guess where the headline ends. `milestoneFacts` derives them when they
 * are missing, so an older caller still renders.
 */
export interface MilestoneShare {
  /** Big center line, e.g. "BLUE BELT", "14-DAY STREAK", "VICTORY". */
  title: string;
  /** Supporting line, e.g. "New rank earned" or "UD · R3 · vs J. Smith". */
  subtitle: string;
  /** File-name stem for the exported PNG, e.g. "belt-blue". */
  slug: string;
  /** Display word(s): "NEW PR", "VICTORY", "BLUE BELT". */
  headline?: string;
  /** Banner line under the medallion: "MOST WORKOUTS IN A WEEK". */
  descriptor?: string;
  /** The number the card is about: "5". Omitted for wins with no figure. */
  statValue?: string;
  /** What the number counts: "SESSIONS". */
  statLabel?: string;
  /** Context under the stat: "PREVIOUS BEST: 4". */
  footnote?: string;
}

/** The slots every card fills, whichever kind it is. */
export interface CardFacts {
  headline: string;
  descriptor: string;
  statValue?: string;
  statLabel?: string;
  footnote?: string;
  /** Accent line above the date — countdown, fight context. */
  accent?: string;
  accentColor?: string;
  dateText: string;
}

// ── Card geometry ───────────────────────────────────────────────────────────
//
// A 9:16 story frame. Each constant below is the boundary of a region that
// owns its band of the card; blocks are fitted inside their region and never
// measured against each other, so no input can make two of them collide.

const W = 1080;
const H = 1920;
const PAD = 90;
const CONTENT_W = W - PAD * 2;
/** The display headline runs closer to the edge than body text. */
const DISPLAY_W = W - 120;
const CX = W / 2;

const LOGO_TOP = 84;
const LOGO_SIZE = 132;
const BRAND_TOP = 246;
const NAME_TOP = 330;
/** The headline is bottom-anchored here, growing upward as it wraps. */
const DISPLAY_BOTTOM = 690;
const DISPLAY_TOP = 404;
const MEDAL_CY = 880;
const MEDAL_R = 195;
/** Banner → stat → label → footnote, centred in this band. */
const STACK_TOP = 1120;
const STACK_BOTTOM = 1600;
const RULE_Y = H - 296;
const DIAMOND_CY = H - 252;
const DATE_TOP = H - 212;
const LINK_TOP = H - 128;

const UI_FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

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
  /** Numeric CSS weight — Inter ships 400–900 and the card uses the range. */
  weight?: number;
  /** Letter spacing in em, matching the design system's tracking scale. */
  tracking?: number;
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
  const { size, weight = 400, tracking = 0 } = spec;
  ctx.font = `${weight} ${size}px ${UI_FONT}`;
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
 * the y its last line ends at. Every block is laid out from a top edge rather
 * than a baseline — with variable font sizes, baseline arithmetic is what
 * turns "one more line" into overlap.
 */
function drawBlock(
  ctx: CanvasRenderingContext2D,
  fitted: FittedText,
  spec: Omit<FontSpec, 'size'>,
  top: number,
  /** A gradient, for the headline's warm-to-deep fill. */
  color: string | CanvasGradient,
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

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Runs `paint` with a glow, then restores. Canvas shadow state is sticky. */
function withGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  paint: () => void,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  paint();
  ctx.restore();
}

// ── Assets ──────────────────────────────────────────────────────────────────

/**
 * Fonts and the brand mark, resolved once per session.
 *
 * Canvas does not participate in CSS font loading: `ctx.font = '900 220px
 * Inter'` silently falls back to the default face if that weight has not been
 * loaded yet, and the card is drawn milliseconds after the sheet opens. So the
 * weights are requested explicitly and awaited before the first stroke.
 *
 * Everything here is best-effort. A card that renders in system-ui because a
 * font request failed is worth far more than no card at all, so failures
 * resolve rather than reject, and the mark simply isn't drawn if it's missing.
 */
type LogoSource = CanvasImageSource | null;

let assetsPromise: Promise<{ logo: LogoSource }> | null = null;

/**
 * Knocks the mark's background tile out by luminance.
 *
 * The shipped asset is an app icon: the shield sits on an opaque near-black
 * tile, which lands on the card as a hard-edged square. Rebuilding each pixel's
 * alpha from its brightness drops the tile to nothing while leaving the
 * shield's own colour untouched — the dark parts that do disappear are its
 * outlines, which on a near-black card were reading as background anyway.
 *
 * Compositing with `lighten` would also hide the tile, but it blends the
 * shield into whatever is behind it and washes the metal out.
 */
function knockOutTile(img: HTMLImageElement): CanvasImageSource {
  const size = img.naturalWidth || 192;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  if (!octx) return img;
  octx.drawImage(img, 0, 0, size, size);
  try {
    const data = octx.getImageData(0, 0, size, size);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const brightest = Math.max(px[i], px[i + 1], px[i + 2]);
      // Slightly steeper than linear so the tile reaches zero rather than
      // leaving a faint grey ghost of its corners.
      px[i + 3] = Math.min(255, Math.round(brightest * 1.35));
    }
    octx.putImageData(data, 0, 0);
    return off;
  } catch {
    // A tainted canvas (the mark served cross-origin) — better the tile than
    // no mark at all.
    return img;
  }
}

export function ensureCardAssets(): Promise<{ logo: LogoSource }> {
  assetsPromise ??= (async () => {
    const fonts = [400, 500, 600, 700, 800, 900].map(w =>
      document.fonts?.load(`${w} 100px Inter`).catch(() => []),
    );
    const logo = new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = '/fc-mark-192.png';
    });
    const [, loaded] = await Promise.all([Promise.all(fonts), logo]);
    return { logo: loaded ? knockOutTile(loaded) : null };
  })();
  return assetsPromise;
}

// ── Background ──────────────────────────────────────────────────────────────

/**
 * The atmosphere: wash, concentric rings, dial ticks, lens streaks and smoke,
 * all centred on the medallion so the card reads as one radial composition
 * rather than a stack of decorated rows.
 */
function paintBackdrop(ctx: CanvasRenderingContext2D, c: Palette) {
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, c.obsidian);
  base.addColorStop(0.55, mix(c.obsidian, c.ambient, 0.75));
  base.addColorStop(1, c.obsidian);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // Smoke: a few oversized, very faint radial blobs either side of the
  // medallion. Low enough to read as atmosphere, not as banding.
  const smoke: Array<[number, number, number, number]> = [
    [-60, MEDAL_CY + 40, 420, 0.055],
    [W + 70, MEDAL_CY - 30, 460, 0.05],
    [140, MEDAL_CY + 320, 300, 0.035],
    [W - 120, MEDAL_CY + 300, 280, 0.03],
  ];
  for (const [x, y, r, a] of smoke) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(190, 200, 220, ${a})`);
    g.addColorStop(1, 'rgba(190, 200, 220, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Concentric rings — the widest reach past the frame, which is what makes
  // the composition feel bigger than the card.
  for (let i = 0; i < 16; i++) {
    const r = 150 + i * 68;
    ctx.beginPath();
    ctx.arc(CX, MEDAL_CY, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(c.flame, i % 4 === 0 ? 0.075 : 0.032);
    ctx.lineWidth = i % 4 === 0 ? 2 : 1;
    ctx.stroke();
  }

  // Dial ticks: a dense ring of short radial marks, every sixth one longer.
  ctx.save();
  ctx.translate(CX, MEDAL_CY);
  for (let i = 0; i < 144; i++) {
    const angle = (i / 144) * Math.PI * 2;
    const long = i % 6 === 0;
    const inner = MEDAL_R + 54;
    const outer = inner + (long ? 42 : 20);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.strokeStyle = withAlpha(c.flame, long ? 0.3 : 0.13);
    ctx.lineWidth = long ? 2.5 : 1.5;
    ctx.stroke();
  }
  ctx.restore();

  // Core glow behind the medallion.
  const glow = ctx.createRadialGradient(CX, MEDAL_CY, 20, CX, MEDAL_CY, 560);
  glow.addColorStop(0, withAlpha(c.flame, 0.34));
  glow.addColorStop(0.45, withAlpha(c.flame, 0.09));
  glow.addColorStop(1, withAlpha(c.flame, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, MEDAL_CY - 560, W, 1120);

  // Lens streaks through the medallion's centre line.
  for (const [half, alpha] of [[46, 0.1], [4, 0.5]] as const) {
    const streak = ctx.createLinearGradient(0, 0, W, 0);
    streak.addColorStop(0, withAlpha(c.flame, 0));
    streak.addColorStop(0.5, withAlpha(c.gold, alpha));
    streak.addColorStop(1, withAlpha(c.flame, 0));
    ctx.fillStyle = streak;
    ctx.fillRect(0, MEDAL_CY - half, W, half * 2);
  }

  // Vignette last, so it sits over the rings and pulls the eye inward.
  const vignette = ctx.createRadialGradient(CX, H * 0.46, H * 0.2, CX, H * 0.46, H * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}

// ── Components ──────────────────────────────────────────────────────────────

/** The brand mark, already knocked out of its tile by `ensureCardAssets`. */
function paintLogo(ctx: CanvasRenderingContext2D, c: Palette, logo: LogoSource) {
  if (!logo) return;
  withGlow(ctx, withAlpha(c.flame, 0.5), 36, () => {
    ctx.drawImage(logo, CX - LOGO_SIZE / 2, LOGO_TOP, LOGO_SIZE, LOGO_SIZE);
  });
}

function paintBrand(ctx: CanvasRenderingContext2D, c: Palette) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const brand = fit(ctx, 'FIGHT CAMP', { weight: 800, tracking: 0.26 }, {
    maxSize: 56, minSize: 40,
  });
  withGlow(ctx, withAlpha(c.flame, 0.5), 26, () => {
    drawBlock(ctx, brand, { weight: 800, tracking: 0.26 }, BRAND_TOP, c.flame);
  });
}

/** The athlete's name between two hairlines — `———— MIKE ————`. */
function paintNameRule(ctx: CanvasRenderingContext2D, c: Palette, name: string) {
  const spec = { weight: 600, tracking: 0.34 } as const;
  const fitted = fit(ctx, name.toUpperCase(), spec, { maxSize: 40, minSize: 24, maxWidth: 560 });
  if (!fitted.lines.length) return;
  drawBlock(ctx, fitted, spec, NAME_TOP, c.secondary);

  setFont(ctx, { ...spec, size: fitted.fontSize });
  const textW = ctx.measureText(fitted.lines[0]).width;
  const midY = NAME_TOP + (fitted.fontSize * LINE_HEIGHT_RATIO) / 2;
  const gap = 34;
  const ruleLen = 120;
  for (const dir of [-1, 1]) {
    const from = CX + dir * (textW / 2 + gap);
    const to = from + dir * ruleLen;
    const rule = ctx.createLinearGradient(from, 0, to, 0);
    rule.addColorStop(0, withAlpha(c.flame, 0.85));
    rule.addColorStop(1, withAlpha(c.flame, 0));
    ctx.strokeStyle = rule;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from, midY);
    ctx.lineTo(to, midY);
    ctx.stroke();
  }
}

/**
 * The hero word, bottom-anchored in its region so it grows upward into its own
 * empty space rather than downward into the medallion.
 */
function paintDisplay(ctx: CanvasRenderingContext2D, c: Palette, text: string) {
  const spec = { weight: 900, tracking: -0.01 } as const;

  // Two passes rather than one `maxLines: 2` fit, because the sizes that fit
  // the *width* are not the sizes that fit the *region*: "BLUE BELT" wrapped
  // to two 224px lines, which is 520px of type in a 286px band — straight
  // through the medallion below it. One line is tried down to a size that is
  // still unmistakably a headline; only past that does it wrap, at a size
  // whose two lines are guaranteed to fit.
  const single = fit(ctx, text.toUpperCase(), spec, {
    maxSize: 224, minSize: 128, step: 8, maxWidth: DISPLAY_W,
  });
  const fitted = single.truncated
    ? fit(ctx, text.toUpperCase(), spec, {
        maxSize: 120, minSize: 64, maxLines: 2, step: 6, maxWidth: DISPLAY_W,
      })
    : single;
  if (!fitted.lines.length) return;

  const height = blockHeight(fitted);
  const top = Math.max(DISPLAY_TOP, DISPLAY_BOTTOM - height);

  const grad = ctx.createLinearGradient(0, top, 0, top + height);
  grad.addColorStop(0, mix(c.flame, c.gold, 0.62));
  grad.addColorStop(0.42, c.flame);
  grad.addColorStop(1, mix(c.crimson, '#000000', 0.3));

  // Bloom first, then the crisp pass on top: one heavily-blurred draw reads as
  // light coming off the letterforms, where a single shadowed draw just looks
  // soft-focused.
  withGlow(ctx, withAlpha(c.flame, 0.75), 90, () => {
    drawBlock(ctx, fitted, spec, top, withAlpha(c.flame, 0.55));
  });
  drawBlock(ctx, fitted, spec, top, grad);
}

/**
 * The fist mark, drawn as vector paths.
 *
 * Deliberately not an emoji. The old card drew one at 340px and it landed as a
 * tofu box on the reporter's device — a platform font is not something a brand
 * artifact should depend on. Coordinates are a 0–100 box, scaled to `size`.
 */
function paintFist(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const u = size / 100;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 6;

  // Knuckle mass.
  roundRectPath(ctx, 16, 20, 68, 46, 16);
  ctx.stroke();
  // Finger separations across the top face.
  for (const x of [33, 50, 67]) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, 44);
    ctx.stroke();
  }
  // Thumb, wrapping the lower left.
  roundRectPath(ctx, 10, 48, 46, 26, 13);
  ctx.stroke();
  // Wrist cuff.
  roundRectPath(ctx, 22, 74, 56, 18, 8);
  ctx.stroke();
  ctx.restore();
}

function paintMedallion(ctx: CanvasRenderingContext2D, c: Palette) {
  // Inner disc, so the glyph has something to sit on rather than floating in
  // the ring field.
  const disc = ctx.createRadialGradient(CX, MEDAL_CY, 0, CX, MEDAL_CY, MEDAL_R);
  disc.addColorStop(0, withAlpha(c.crimson, 0.28));
  disc.addColorStop(0.7, withAlpha(c.obsidian, 0.85));
  disc.addColorStop(1, withAlpha(c.obsidian, 0.4));
  ctx.beginPath();
  ctx.arc(CX, MEDAL_CY, MEDAL_R, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();

  for (const [r, alpha, width] of [
    [MEDAL_R, 0.55, 3],
    [MEDAL_R - 26, 0.22, 1.5],
    [MEDAL_R - 44, 0.12, 1],
  ] as const) {
    ctx.beginPath();
    ctx.arc(CX, MEDAL_CY, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(c.flame, alpha);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  ctx.strokeStyle = mix(c.flame, c.gold, 0.45);
  withGlow(ctx, c.flame, 55, () => paintFist(ctx, CX, MEDAL_CY, 190));
  withGlow(ctx, c.flame, 18, () => paintFist(ctx, CX, MEDAL_CY, 190));
}

const BANNER_SPEC = { weight: 700, tracking: 0.08 } as const;
const BANNER_TEXT_W = CONTENT_W - 60;
const FOOTNOTE_SPEC = { weight: 600, tracking: 0.14 } as const;

/**
 * Fits the descriptor to one line if it possibly can, and only spills to two
 * when even the floor size won't hold it.
 *
 * `fitText` on its own spends a two-line budget on type size — right for the
 * headline, wrong for a banner, where "MOST WORKOUTS IN A / WEEK" in a box
 * built for one line reads as a mistake.
 */
function fitBanner(ctx: CanvasRenderingContext2D, text: string): FittedText {
  const single = fit(ctx, text.toUpperCase(), BANNER_SPEC, {
    maxSize: 46, minSize: 28, maxWidth: BANNER_TEXT_W,
  });
  if (!single.truncated) return single;
  return fit(ctx, text.toUpperCase(), BANNER_SPEC, {
    maxSize: 42, minSize: 26, maxLines: 2, maxWidth: BANNER_TEXT_W,
  });
}

/** The descriptor's chevron-ended banner. Returns its height. */
function paintBanner(ctx: CanvasRenderingContext2D, c: Palette, text: string, top: number): number {
  const spec = BANNER_SPEC;
  const fitted = fitBanner(ctx, text);
  if (!fitted.lines.length) return 0;

  const textH = blockHeight(fitted);
  const boxH = textH + 46;
  setFont(ctx, { ...spec, size: fitted.fontSize });
  const widest = fitted.lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const boxW = Math.min(W - 116, widest + 110);
  const x = CX - boxW / 2;
  const point = 26;

  ctx.beginPath();
  ctx.moveTo(x - point, top + boxH / 2);
  ctx.lineTo(x, top);
  ctx.lineTo(x + boxW, top);
  ctx.lineTo(x + boxW + point, top + boxH / 2);
  ctx.lineTo(x + boxW, top + boxH);
  ctx.lineTo(x, top + boxH);
  ctx.closePath();
  ctx.fillStyle = withAlpha(c.flame, 0.07);
  ctx.fill();
  ctx.strokeStyle = withAlpha(c.flame, 0.6);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  drawBlock(ctx, fitted, spec, top + 23, c.white);
  return boxH;
}

/** Short speed ticks flanking the stat label. */
function paintTicks(ctx: CanvasRenderingContext2D, c: Palette, midY: number, from: number) {
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = midY + (i - 1) * 16;
      const len = 42 - i * 6;
      const startX = CX + dir * (from + i * 10);
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + dir * len, y);
      ctx.strokeStyle = withAlpha(c.flame, i === 1 ? 0.85 : 0.4);
      ctx.lineWidth = i === 1 ? 4 : 2.5;
      ctx.stroke();
    }
  }
}

/**
 * The context line under the stat, with its figure picked out in brand orange
 * — "PREVIOUS BEST: 4". Falls back to a plain grey line when there is no
 * colon to split on, so any wording still renders.
 */
function paintFootnote(ctx: CanvasRenderingContext2D, c: Palette, fitted: FittedText, top: number) {
  const spec = FOOTNOTE_SPEC;
  const colon = fitted.lines.length === 1 ? fitted.lines[0].lastIndexOf(':') : -1;
  if (colon < 0) {
    drawBlock(ctx, fitted, spec, top, c.tertiary);
    return;
  }
  const label = fitted.lines[0].slice(0, colon + 1);
  const value = fitted.lines[0].slice(colon + 1);
  setFont(ctx, { ...spec, size: fitted.fontSize });
  const labelW = ctx.measureText(label).width;
  const valueW = ctx.measureText(value).width;
  const startX = CX - (labelW + valueW) / 2;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = c.tertiary;
  ctx.fillText(label, startX, top);
  ctx.fillStyle = c.flame;
  ctx.fillText(value, startX + labelW, top);
  ctx.textAlign = 'center';
}

function paintFooter(ctx: CanvasRenderingContext2D, c: Palette, dateText: string) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const rule = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
  rule.addColorStop(0, withAlpha(c.flame, 0));
  rule.addColorStop(0.5, withAlpha(c.flame, 0.45));
  rule.addColorStop(1, withAlpha(c.flame, 0));
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, RULE_Y);
  ctx.lineTo(W - PAD, RULE_Y);
  ctx.stroke();

  ctx.save();
  ctx.translate(CX, DIAMOND_CY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = c.flame;
  withGlow(ctx, c.flame, 20, () => ctx.fillRect(-11, -11, 22, 22));
  ctx.restore();

  const dateSpec = { weight: 600, tracking: 0.22 } as const;
  drawBlock(ctx, fit(ctx, dateText, dateSpec, { maxSize: 32, minSize: 24 }), dateSpec, DATE_TOP, c.tertiary);

  const linkSpec = { weight: 700, tracking: 0.16 } as const;
  const link = fit(ctx, APP_SHARE_DOMAIN, linkSpec, { maxSize: 38, minSize: 26 });
  withGlow(ctx, withAlpha(c.flame, 0.45), 22, () => {
    drawBlock(ctx, link, linkSpec, LINK_TOP, c.flame);
  });
}

/**
 * Banner, stat, label, footnote and accent, centred as a group in the band
 * between the medallion and the footer. Measured before anything is drawn, so
 * a card with no stat (a belt) sits balanced rather than top-heavy.
 */
function paintStack(ctx: CanvasRenderingContext2D, c: Palette, facts: CardFacts) {
  const valueSpec = { weight: 900, tracking: -0.02 } as const;
  const labelSpec = { weight: 800, tracking: 0.28 } as const;
  const footSpec = FOOTNOTE_SPEC;
  const accentSpec = { weight: 800, tracking: 0.16 } as const;

  const bannerFit = fitBanner(ctx, facts.descriptor);
  const labelFit = facts.statLabel
    ? fit(ctx, facts.statLabel.toUpperCase(), labelSpec, { maxSize: 54, minSize: 30, maxWidth: 620 })
    : null;
  const footFit = facts.footnote
    ? fit(ctx, facts.footnote.toUpperCase(), footSpec, { maxSize: 34, minSize: 24, maxLines: 2 })
    : null;
  const accentFit = facts.accent
    ? fit(ctx, facts.accent.toUpperCase(), accentSpec, { maxSize: 40, minSize: 26, maxLines: 2 })
    : null;

  const bannerH = bannerFit.lines.length ? blockHeight(bannerFit) + 46 : 0;

  // The figure is sized to the room the rest of the stack leaves, not to a
  // fixed maximum. Everything else here is either short or already capped at
  // two lines, so the figure is the one element that can be asked to give way
  // — and a session card (which also carries a countdown line) has meaningfully
  // less room for it than a PR card does.
  const fixedH =
    bannerH +
    (labelFit ? blockHeight(labelFit) + 6 : 0) +
    (footFit ? blockHeight(footFit) + 26 : 0) +
    (accentFit ? blockHeight(accentFit) + 22 : 0);
  const valueBudget = STACK_BOTTOM - STACK_TOP - fixedH - 30;
  const valueFit = facts.statValue
    ? fit(ctx, facts.statValue, valueSpec, {
        maxSize: Math.min(200, Math.floor(valueBudget / LINE_HEIGHT_RATIO)),
        minSize: 72,
        maxWidth: DISPLAY_W,
      })
    : null;

  // Biased above centre: a card with no figure (a belt) is short, and dead
  // space reads better under the stack than as a gap below the medallion.
  const total = fixedH + (valueFit ? blockHeight(valueFit) + 30 : 0);
  let y = STACK_TOP + Math.max(0, (STACK_BOTTOM - STACK_TOP - total) * 0.32);

  if (bannerH) {
    paintBanner(ctx, c, facts.descriptor, y);
    y += bannerH;
  }
  if (valueFit) {
    y += 30;
    withGlow(ctx, withAlpha(c.white, 0.45), 44, () => {
      drawBlock(ctx, valueFit, valueSpec, y, c.white);
    });
    y += blockHeight(valueFit);
  }
  if (labelFit) {
    y += 6;
    const labelMid = y + blockHeight(labelFit) / 2;
    setFont(ctx, { ...labelSpec, size: labelFit.fontSize });
    const labelW = ctx.measureText(labelFit.lines[0]).width;
    paintTicks(ctx, c, labelMid, labelW / 2 + 34);
    drawBlock(ctx, labelFit, labelSpec, y, c.flame);
    y += blockHeight(labelFit);
  }
  if (footFit) {
    y += 26;
    paintFootnote(ctx, c, footFit, y);
    y += blockHeight(footFit);
  }
  if (accentFit) {
    y += 22;
    drawBlock(ctx, accentFit, accentSpec, y, facts.accentColor ?? c.flame);
  }
}

/** Paints a whole card from its filled slots. */
function paintCard(facts: CardFacts, user: FighterProfile, logo: LogoSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const c = palette();

  paintBackdrop(ctx, c);
  paintLogo(ctx, c, logo);
  paintBrand(ctx, c);
  paintNameRule(ctx, c, user.name);
  paintDisplay(ctx, c, facts.headline);
  paintMedallion(ctx, c);
  paintStack(ctx, c, facts);
  paintFooter(ctx, c, facts.dateText);
  return canvas;
}

// ── Facts ───────────────────────────────────────────────────────────────────

/**
 * Fills the card's slots, from the caller's structured fields where they exist
 * and from the title/subtitle where they don't.
 *
 * The derivation splits on the colon that every generated milestone title uses
 * ("New PR: Most workouts in a week"), which is exactly the shape the display
 * headline wants: a short hero word and a descriptor.
 */
export function milestoneFacts(m: MilestoneShare): CardFacts {
  const colon = m.title.indexOf(':');
  const derivedHeadline = colon > 0 ? m.title.slice(0, colon) : m.title;
  const derivedDescriptor = colon > 0 ? m.title.slice(colon + 1) : m.subtitle;
  return {
    headline: (m.headline ?? derivedHeadline).trim(),
    descriptor: (m.descriptor ?? derivedDescriptor).trim(),
    statValue: m.statValue,
    statLabel: m.statLabel,
    // With no structured parts the subtitle is the only detail left, and it
    // has already been used as the descriptor if the title had no colon.
    footnote: m.footnote ?? (colon > 0 ? m.subtitle : undefined),
    dateText: format(new Date(), 'MMMM d, yyyy').toUpperCase(),
  };
}

/** Day N of a camp, 1-based and never below 1. */
export function campDay(camp: FightCamp, isoDate: string): number {
  return Math.max(1, differenceInDays(parseISO(isoDate), parseISO(camp.startDate)) + 1);
}

function sessionFacts(log: WorkoutLog, camp: FightCamp, c: Palette): CardFacts {
  const dayNum = campDay(camp, log.date);
  const totalDays = camp.campWeeks * 7;
  const daysToFight = camp.fightDate
    ? Math.max(0, differenceInDays(parseISO(camp.fightDate), new Date()))
    : 0;
  const typeLabel = SESSION_LABELS[log.sessionType] ?? log.sessionType;

  // Off-season blocks have no fight date, and format(Invalid Date) throws,
  // which killed the share card entirely.
  const fightDate = camp.fightDate ? format(parseISO(camp.fightDate), 'MMM d') : null;
  const accent = daysToFight > 0
    ? `${daysToFight} days to fight${camp.opponent ? ` · vs ${camp.opponent}` : ''}`
    : fightDate
      ? `Fight day · ${fightDate}`
      : 'Off-season training block';

  return {
    headline: `Day ${dayNum}`,
    descriptor: log.title,
    statValue: String(log.duration),
    statLabel: 'Minutes',
    footnote: `${typeLabel} · RPE ${log.rpe}/10 · Day ${dayNum} of ${totalDays}`,
    accent,
    // The same fight-week urgency ramp the countdown card uses, with the
    // relaxed tier moved off the pace-green and onto gold — green is the app's
    // "on track" signal, but on a warm card it reads as a colour clash rather
    // than as reassurance.
    accentColor:
      daysToFight > 0 && daysToFight < 14 ? c.crimson
        : daysToFight > 0 && daysToFight < 28 ? c.flame
          : c.gold,
    dateText: format(parseISO(log.date), 'MMMM d, yyyy').toUpperCase(),
  };
}

// ── Entry points ────────────────────────────────────────────────────────────
//
// Async because the fonts and the brand mark have to be in hand before the
// first stroke; the drawing itself is synchronous.

export async function drawSessionCard(
  log: WorkoutLog,
  camp: FightCamp,
  user: FighterProfile,
): Promise<HTMLCanvasElement> {
  const { logo } = await ensureCardAssets();
  return paintCard(sessionFacts(log, camp, palette()), user, logo);
}

export async function drawMilestoneCard(
  m: MilestoneShare,
  user: FighterProfile,
): Promise<HTMLCanvasElement> {
  const { logo } = await ensureCardAssets();
  return paintCard(milestoneFacts(m), user, logo);
}
