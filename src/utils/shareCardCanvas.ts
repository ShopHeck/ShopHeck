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
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import type { WorkoutLog, FightCamp, FighterProfile, SessionType } from '../types';
import { resolveToken } from './designTokens';
import { blockHeight, fitText, LINE_HEIGHT_RATIO, type FittedText, type Measure } from './canvasText';
import { APP_SHARE_CTA } from './shareLink';

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

const LOGO_TOP = 78;
const LOGO_SIZE = 128;
const BRAND_TOP = 238;
const NAME_TOP = 322;
/**
 * The headline sits *behind* the medallion, which is what gives the card its
 * depth — so a single line is anchored low enough for the bezel to cut across
 * its baseline. A wrapped headline is anchored above the medallion instead:
 * a second line hidden behind the bezel is a lost word, not a composition.
 */
const DISPLAY_BOTTOM = 800;
const DISPLAY_TOP = 420;
const MEDAL_CY = 940;
const MEDAL_R = 265;
/**
 * The flame's lit height. Its artwork is roughly 3:5, so this also fixes the
 * width at ~0.61 of it — sized so the whole lit box clears the inner bezel
 * (radius 213) on the diagonal rather than only on the axes.
 */
const FLAME_H = 330;
const DISPLAY_WRAP_BOTTOM = MEDAL_CY - MEDAL_R - 6;
/** Banner → stat → label → footnote, centred in this band. */
const STACK_TOP = 1240;
const STACK_BOTTOM = 1668;
const RULE_Y = 1706;
const SPARKLE_CY = 1748;
const DATE_TOP = 1784;
const LINK_TOP = 1850;
/** Below this the figure stops reading as the card's headline number. */
const STAT_FLOOR = 56;

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

/**
 * A tiny deterministic PRNG (mulberry32).
 *
 * The ember field and the burst rays want scatter, not randomness: two runs of
 * the preview script have to produce byte-identical PNGs or "did that change?"
 * stops being answerable by looking. Seeded, the sparks land in the same place
 * every time.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

interface CardAssets {
  logo: LogoSource;
  flame: LogoSource;
}

let assetsPromise: Promise<CardAssets> | null = null;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

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

export function ensureCardAssets(): Promise<CardAssets> {
  assetsPromise ??= (async () => {
    const fonts = [400, 500, 600, 700, 800, 900].map(w =>
      document.fonts?.load(`${w} 100px Inter`).catch(() => []),
    );
    const [, logo, flame] = await Promise.all([
      Promise.all(fonts),
      loadImage('/fc-mark-192.png'),
      loadImage(FLAME_SRC),
    ]);
    return { logo: logo ? knockOutTile(logo) : null, flame };
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

  // Halftone field. Faded out near the medallion so it reads as texture at the
  // card's edges rather than as noise behind the artwork.
  const step = 22;
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      const d = Math.hypot(x - CX, y - MEDAL_CY);
      const reveal = Math.min(1, Math.max(0, (d - 340) / 420));
      if (reveal <= 0.02) continue;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(c.flame, 0.085 * reveal);
      ctx.fill();
    }
  }

  // Concentric rings — the widest reach past the frame, which is what makes
  // the composition feel bigger than the card.
  for (let i = 0; i < 14; i++) {
    const r = MEDAL_R + 40 + i * 74;
    ctx.beginPath();
    ctx.arc(CX, MEDAL_CY, r, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(c.flame, i % 4 === 0 ? 0.08 : 0.03);
    ctx.lineWidth = i % 4 === 0 ? 2 : 1;
    ctx.stroke();
  }

  // Core glow behind the medallion.
  const glow = ctx.createRadialGradient(CX, MEDAL_CY, 20, CX, MEDAL_CY, 620);
  glow.addColorStop(0, withAlpha(c.flame, 0.36));
  glow.addColorStop(0.45, withAlpha(c.flame, 0.1));
  glow.addColorStop(1, withAlpha(c.flame, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, MEDAL_CY - 620, W, 1240);

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
  const wrapped = single.truncated;
  const fitted = wrapped
    ? fit(ctx, text.toUpperCase(), spec, {
        maxSize: 104, minSize: 60, maxLines: 2, step: 6, maxWidth: DISPLAY_W,
      })
    : single;
  if (!fitted.lines.length) return;

  const height = blockHeight(fitted);
  const bottom = wrapped ? DISPLAY_WRAP_BOTTOM : DISPLAY_BOTTOM;
  const top = Math.max(DISPLAY_TOP, bottom - height);

  const grad = ctx.createLinearGradient(0, top, 0, top + height);
  grad.addColorStop(0, mix(c.flame, c.gold, 0.66));
  grad.addColorStop(0.38, c.flame);
  grad.addColorStop(1, mix(c.crimson, '#000000', 0.42));

  // Bloom, then the extrusion, then the face. One heavily-blurred pass reads
  // as light coming off the letterforms, where a single shadowed draw just
  // looks soft-focused.
  withGlow(ctx, withAlpha(c.flame, 0.8), 110, () => {
    drawBlock(ctx, fitted, spec, top, withAlpha(c.flame, 0.5));
  });

  // The extrusion: the same block restruck downward in a dark face, deepest
  // first, so the letters read as cut from a solid rather than printed on one.
  const depth = Math.max(6, Math.round(fitted.fontSize * 0.075));
  const side = mix(c.crimson, '#000000', 0.76);
  for (let i = depth; i >= 1; i--) {
    drawBlock(ctx, fitted, spec, top + i * 1.7, side);
  }
  drawBlock(ctx, fitted, spec, top, grad);

  // A hairline of hot light along the top edge, which is what sells the bevel.
  withGlow(ctx, withAlpha(c.gold, 0.6), 12, () => {
    drawBlock(ctx, fitted, spec, top - 2.5, mix(c.gold, '#FFFFFF', 0.45));
  });
  drawBlock(ctx, fitted, spec, top, grad);
}

/**
 * The medallion's flame, drawn from artwork rather than from vector paths.
 *
 * The two-bezier flame this replaces had to imply fire with a silhouette and a
 * gradient, and at 216px it read as a lick of orange jelly. Photographic fire
 * is all detail the pen tool cannot reach — the smoke off the tip, the sparks,
 * the way the core goes white — so the glyph is now a real image.
 *
 * Still deliberately not an emoji, for the reason the vector version existed:
 * the card that shipped before drew one at 340px and it landed as a tofu box
 * on the device that reported it. A platform font is not something a brand
 * artifact should depend on; an asset in `public/` is.
 */
const FLAME_SRC = '/fc-flame-360.png';

/**
 * Where the lit pixels actually sit inside that square, measured off the file's
 * alpha rather than eyeballed: the flame spans the full height but only the
 * middle 61% of the width, and its mass sits a hair left of centre.
 *
 * Without this the drawn square is what gets centred, which leaves the flame
 * itself visibly off to one side in a medallion whose whole job is symmetry.
 */
const FLAME_BOX = { left: 0.172, right: 0.783, top: 0, bottom: 1 } as const;
const FLAME_CX = (FLAME_BOX.left + FLAME_BOX.right) / 2;
const FLAME_CY_FRAC = (FLAME_BOX.top + FLAME_BOX.bottom) / 2;

/**
 * Draws the flame so that its *lit* box — not the transparent square around it
 * — is `height` tall and centred on (cx, cy).
 */
function paintFlame(
  ctx: CanvasRenderingContext2D,
  flame: LogoSource,
  cx: number,
  cy: number,
  height: number,
) {
  if (!flame) return;
  // The lit box is the full height of a square source, so the square is drawn
  // at `height` on both axes; only the centring differs per axis.
  const side = height / (FLAME_BOX.bottom - FLAME_BOX.top);
  ctx.drawImage(flame, cx - FLAME_CX * side, cy - FLAME_CY_FRAC * side, side, side);
}

/**
 * The medallion: a machined bezel around a glowing core, with light thrown out
 * behind it. Built back to front — rays, embers, bezel, rings, glove, flare —
 * because each layer has to be occluded by the next.
 */
function paintMedallion(ctx: CanvasRenderingContext2D, c: Palette, flame: LogoSource) {
  const random = rng(0x5150);

  // Burst rays, radiating from behind the bezel.
  ctx.save();
  ctx.translate(CX, MEDAL_CY);
  // Each ray is a triangle with its apex *outward* and its base hidden behind
  // the bezel, so it tapers to a point like thrown light. Constant-width
  // wedges, which is what a naive fan gives you, read as solid bars.
  const rayFade = ctx.createRadialGradient(0, 0, MEDAL_R * 0.9, 0, 0, MEDAL_R * 1.95);
  rayFade.addColorStop(0, withAlpha(c.gold, 0.42));
  rayFade.addColorStop(0.3, withAlpha(c.flame, 0.2));
  rayFade.addColorStop(1, withAlpha(c.flame, 0));
  ctx.fillStyle = rayFade;
  const base = MEDAL_R * 0.9;
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * Math.PI * 2 + random() * 0.04;
    const reach = MEDAL_R * (1.12 + random() * random() * 0.85);
    const halfWidth = 0.008 + random() * 0.018;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    ctx.lineTo(Math.cos(angle - halfWidth) * base, Math.sin(angle - halfWidth) * base);
    ctx.lineTo(Math.cos(angle + halfWidth) * base, Math.sin(angle + halfWidth) * base);
    ctx.closePath();
    ctx.fill();
  }

  // Embers thrown clear of the bezel.
  for (let i = 0; i < 130; i++) {
    const angle = random() * Math.PI * 2;
    const d = MEDAL_R * (1.02 + random() * random() * 1.1);
    const size = 1.4 + random() * 3.4;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * d, Math.sin(angle) * d, size, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(mix(c.flame, c.gold, random()), 0.25 + random() * 0.6);
    ctx.fill();
  }
  ctx.restore();

  // Machined bezel: an opaque metal band, so the headline behind it is cut
  // cleanly rather than showing through.
  const bandInner = MEDAL_R - 52;
  const metal = ctx.createLinearGradient(0, MEDAL_CY - MEDAL_R, 0, MEDAL_CY + MEDAL_R);
  metal.addColorStop(0, '#3b414d');
  metal.addColorStop(0.35, '#191d26');
  metal.addColorStop(0.62, '#0d1016');
  metal.addColorStop(1, '#2b303a');
  ctx.beginPath();
  ctx.arc(CX, MEDAL_CY, MEDAL_R, 0, Math.PI * 2);
  ctx.arc(CX, MEDAL_CY, bandInner, 0, Math.PI * 2, true);
  ctx.fillStyle = metal;
  ctx.fill('evenodd');

  // Slots cut through the band, with a few lit in brand orange.
  ctx.save();
  ctx.translate(CX, MEDAL_CY);
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / 28 * 0.62;
    const lit = i % 7 === 0;
    ctx.beginPath();
    ctx.arc(0, 0, MEDAL_R - 16, a0, a1);
    ctx.arc(0, 0, bandInner + 16, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = lit ? withAlpha(c.flame, 0.75) : 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
  }
  ctx.restore();

  // Bezel edges.
  for (const [r, color, width] of [
    [MEDAL_R, withAlpha('#FFFFFF', 0.16), 2],
    [bandInner, withAlpha('#FFFFFF', 0.1), 1.5],
  ] as const) {
    ctx.beginPath();
    ctx.arc(CX, MEDAL_CY, r, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  // Core: dark inside, lit at the rim.
  const disc = ctx.createRadialGradient(CX, MEDAL_CY, 0, CX, MEDAL_CY, bandInner);
  disc.addColorStop(0, withAlpha(c.crimson, 0.34));
  disc.addColorStop(0.62, 'rgba(8, 9, 13, 0.94)');
  disc.addColorStop(1, 'rgba(8, 9, 13, 0.99)');
  ctx.beginPath();
  ctx.arc(CX, MEDAL_CY, bandInner, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();

  // The hot rings.
  for (const [r, width, alpha] of [
    [bandInner - 4, 6, 0.95],
    [bandInner - 34, 3, 0.55],
    [bandInner - 58, 1.5, 0.28],
  ] as const) {
    withGlow(ctx, c.flame, 30, () => {
      ctx.beginPath();
      ctx.arc(CX, MEDAL_CY, r, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(mix(c.flame, c.gold, 0.25), alpha);
      ctx.lineWidth = width;
      ctx.stroke();
    });
  }

  // Dialled back from what a dark silhouette needed behind it: the flame is
  // the light source now, and a hot core would swallow it.
  const core = ctx.createRadialGradient(CX, MEDAL_CY, 0, CX, MEDAL_CY, bandInner * 0.95);
  core.addColorStop(0, withAlpha(c.flame, 0.26));
  core.addColorStop(0.3, withAlpha(c.flame, 0.16));
  core.addColorStop(1, withAlpha(c.flame, 0));
  ctx.beginPath();
  ctx.arc(CX, MEDAL_CY, bandInner, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();

  // One soft pass for the light it throws into the medallion, then the artwork
  // itself. The vector flame needed a second tight pass to stay crisp inside
  // its own glow; a photograph carries its own edge and only loses it if you
  // blur it twice.
  withGlow(ctx, withAlpha(c.flame, 0.55), 70, () => {
    paintFlame(ctx, flame, CX, MEDAL_CY, FLAME_H);
  });
  paintFlame(ctx, flame, CX, MEDAL_CY, FLAME_H);

  // Lens flare across the medallion's centre line, over everything.
  for (const [half, alpha] of [[42, 0.09], [3, 0.55]] as const) {
    const streak = ctx.createLinearGradient(0, 0, W, 0);
    streak.addColorStop(0, withAlpha(c.flame, 0));
    streak.addColorStop(0.5, withAlpha(c.gold, alpha));
    streak.addColorStop(1, withAlpha(c.flame, 0));
    ctx.fillStyle = streak;
    ctx.fillRect(0, MEDAL_CY - half, W, half * 2);
  }
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

  // A four-point sparkle rather than a plain diamond — the concave sides read
  // as light, which is the language the rest of the card is speaking.
  const r = 17;
  const k = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(CX, SPARKLE_CY - r);
  ctx.quadraticCurveTo(CX + k, SPARKLE_CY - k, CX + r, SPARKLE_CY);
  ctx.quadraticCurveTo(CX + k, SPARKLE_CY + k, CX, SPARKLE_CY + r);
  ctx.quadraticCurveTo(CX - k, SPARKLE_CY + k, CX - r, SPARKLE_CY);
  ctx.quadraticCurveTo(CX - k, SPARKLE_CY - k, CX, SPARKLE_CY - r);
  ctx.closePath();
  ctx.fillStyle = c.flame;
  withGlow(ctx, c.flame, 22, () => ctx.fill());

  const dateSpec = { weight: 600, tracking: 0.22 } as const;
  drawBlock(ctx, fit(ctx, dateText, dateSpec, { maxSize: 32, minSize: 24 }), dateSpec, DATE_TOP, c.tertiary);

  // Uppercase like the date above it — the footer's one lowercase element was
  // a domain, and the call to action that replaced it is not.
  const linkSpec = { weight: 700, tracking: 0.16 } as const;
  const link = fit(ctx, APP_SHARE_CTA.toUpperCase(), linkSpec, { maxSize: 38, minSize: 26 });
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
  // One line only: this is context, and an ellipsised opponent name costs less
  // than a second line pushing the stack through the footer rule.
  const accentFit = facts.accent
    ? fit(ctx, facts.accent.toUpperCase(), accentSpec, { maxSize: 40, minSize: 26 })
    : null;

  const bannerH = bannerFit.lines.length ? blockHeight(bannerFit) + 46 : 0;

  /**
   * The figure gets what the rest of the stack leaves, and drops out if that
   * isn't enough to read as a headline number.
   *
   * Everything else here is capped at one or two lines, so their combined
   * height is bounded below the region — which makes the stack unable to reach
   * the footer no matter what it is handed. Sizing the figure to a fixed
   * maximum instead is what ran a session card (which carries a countdown line
   * a PR card doesn't) straight through the rule.
   */
  const region = STACK_BOTTOM - STACK_TOP;
  const outsideStat =
    bannerH +
    (footFit ? blockHeight(footFit) + 26 : 0) +
    (accentFit ? blockHeight(accentFit) + 22 : 0);
  const labelH = labelFit ? blockHeight(labelFit) + 6 : 0;
  const valueMax = Math.floor((region - outsideStat - labelH - 24) / LINE_HEIGHT_RATIO);
  const showStat = !!facts.statValue && valueMax >= STAT_FLOOR;
  const valueFit = showStat
    ? fit(ctx, facts.statValue!, valueSpec, {
        maxSize: Math.min(200, valueMax), minSize: STAT_FLOOR, maxWidth: DISPLAY_W,
      })
    : null;

  // Biased above centre: a card with no figure (a belt) is short, and dead
  // space reads better under the stack than as a gap below the medallion.
  const statH = valueFit ? blockHeight(valueFit) + 24 + labelH : 0;
  const total = outsideStat + statH;
  let y = STACK_TOP + Math.max(0, (region - total) * 0.32);

  if (bannerH) {
    paintBanner(ctx, c, facts.descriptor, y);
    y += bannerH;
  }
  if (valueFit) {
    y += 24;
    withGlow(ctx, withAlpha(c.white, 0.45), 44, () => {
      drawBlock(ctx, valueFit, valueSpec, y, c.white);
    });
    y += blockHeight(valueFit);
  }
  // The label names the figure, so it goes when the figure does.
  if (labelFit && valueFit) {
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
function paintCard(facts: CardFacts, user: FighterProfile, assets: CardAssets): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const c = palette();

  // Scenery first, then every word on top of it. The medallion used to be
  // painted after the headline — its opaque bezel deliberately cut across the
  // baseline for depth, and its lens flare ran the full width of the card over
  // whatever was there. Depth is not worth a headline you cannot read, so the
  // ordering is now simply: art below, type above, no exceptions.
  paintBackdrop(ctx, c);
  paintMedallion(ctx, c, assets.flame);

  paintLogo(ctx, c, assets.logo);
  paintBrand(ctx, c);
  paintNameRule(ctx, c, user.name);
  paintDisplay(ctx, c, facts.headline);
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

/**
 * Day N of the camp for a logged date — or null when the session predates the
 * block entirely.
 *
 * The `Math.max(1, …)` this replaces is why the card read "DAY 1" for days on
 * end: a camp's start date is derived backwards from the fight, so a fight
 * booked far enough out (six months, with an eight-week camp) leaves every
 * session logged in the meantime sitting *before* day one. Clamping printed
 * all of them as the first day of camp. Absent is honest; wrong is not.
 *
 * Calendar days rather than elapsed 24-hour periods, matching
 * `getWeekNumberForDate`: a daylight-saving weekend is 71 hours long and would
 * otherwise shave a day off the count.
 */
export function campDay(camp: FightCamp, isoDate: string): number | null {
  const day = differenceInCalendarDays(parseISO(isoDate), parseISO(camp.startDate)) + 1;
  // Also catches an unparseable date, which arrives here as NaN.
  return day >= 1 ? day : null;
}

// ── The session card's hero word ────────────────────────────────────────────
//
// The display slot used to hold `Day ${n}` — the least interesting thing the
// card knew about the session, and (see `campDay`) frequently a lie. The day
// number is context, and context belongs in the footnote under the stat; the
// headline now says something about the training that was actually done.

/** What picking a word needs to know. A log, minus the parts it doesn't read. */
type SessionSeed = Pick<WorkoutLog, 'date' | 'title' | 'sessionType' | 'duration' | 'rpe'>;

/**
 * Hero words, by what the session was.
 *
 * Short on purpose: the display slot holds seven or so characters at its full
 * 224px, and `paintDisplay` shrinks anything longer. A word that has to shrink
 * to fit stops reading as a headline, so nothing here is longer than it has to
 * be.
 */
const SESSION_WORDS: Record<SessionType, string[]> = {
  conditioning: ['ENGINE', 'RELENTLESS', 'NO QUIT', 'UNBROKEN', 'MOTOR', 'EARNED'],
  skill: ['SHARP', 'PRECISION', 'CRAFT', 'DIALED IN', 'POLISHED', 'CLEAN WORK'],
  sparring: ['BATTLE', 'TESTED', 'FEARLESS', 'IRON', 'WAR READY', 'NO FEAR'],
  strength: ['FORGED', 'STRONGER', 'POWER', 'BUILT', 'HEAVY', 'STEEL'],
  recovery: ['RESET', 'RESTORED', 'RECHARGED', 'REPAIR', 'PATIENCE'],
  rest: ['RECHARGED', 'RESET', 'PATIENCE'],
};

/**
 * Reserved for sessions that went to the well. Gated on session type as well
 * as effort, because RPE 9 on a recovery swim is a typo, not a war.
 */
const ALL_OUT_WORDS = ['SAVAGE', 'ALL HEART', 'NO MERCY', 'WARRIOR', 'EMPTY TANK'];
const ALL_OUT_TYPES = new Set<SessionType>(['conditioning', 'skill', 'sparring', 'strength']);
const ALL_OUT_RPE = 9;

/** A session type this build doesn't know — synced from a newer one, say. */
const FALLBACK_WORDS = ['EARNED', 'WORK DONE', 'SHOWED UP', 'PROGRESS'];

/** FNV-1a. Spreads the session's own details across the word pool. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** The rotation's anchor. Any fixed date does; this one keeps the maths small. */
const WORD_EPOCH = '2020-01-01';

/**
 * The word that headlines a session card.
 *
 * Deterministic, and deliberately not `Math.random()`: `ShareCard` redraws the
 * canvas whenever its parent re-renders, so a random word would change under
 * the fighter between the preview they looked at and the image they shared —
 * and `scripts/share-card-preview.mjs` could no longer tell a layout change
 * from a reshuffle.
 *
 * The pick steps once per calendar day and is phased by the session's own
 * details, which buys the two properties that matter here: the same session
 * logged on consecutive days is *guaranteed* a different word — the complaint
 * that started this — and two sessions on one day land on the same word only
 * if they were the same work.
 */
export function sessionHeadline(log: SessionSeed): string {
  const pool =
    log.rpe >= ALL_OUT_RPE && ALL_OUT_TYPES.has(log.sessionType)
      ? ALL_OUT_WORDS
      : SESSION_WORDS[log.sessionType] ?? FALLBACK_WORDS;

  const phase = hashString(
    `${log.sessionType}|${log.title.trim().toLowerCase()}|${log.duration}|${log.rpe}`,
  );
  const day = differenceInCalendarDays(parseISO(log.date), parseISO(WORD_EPOCH));
  // An unparseable date must not cost the whole card: NaN would index the pool
  // to `undefined`, and `paintDisplay` calls `.toUpperCase()` on what it gets.
  const step = Number.isFinite(day) ? day : 0;
  // Two-step modulo — `step` is negative for any date before the epoch.
  return pool[(((phase + step) % pool.length) + pool.length) % pool.length];
}

function sessionFacts(log: WorkoutLog, camp: FightCamp, c: Palette): CardFacts {
  const dayNum = campDay(camp, log.date);
  const totalDays = camp.campWeeks * 7;
  const daysToFight = camp.fightDate
    ? Math.max(0, differenceInCalendarDays(parseISO(camp.fightDate), new Date()))
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

  // Where the session sits in the block. A log from before the start date has
  // no day number at all, and one from after the last day has a number but no
  // total left to count it against.
  const dayPart =
    dayNum === null ? 'Pre-camp'
      : dayNum <= totalDays ? `Day ${dayNum} of ${totalDays}`
        : `Day ${dayNum}`;

  return {
    headline: sessionHeadline(log),
    descriptor: log.title,
    statValue: String(log.duration),
    statLabel: 'Minutes',
    footnote: `${typeLabel} · RPE ${log.rpe}/10 · ${dayPart}`,
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
  const assets = await ensureCardAssets();
  return paintCard(sessionFacts(log, camp, palette()), user, assets);
}

export async function drawMilestoneCard(
  m: MilestoneShare,
  user: FighterProfile,
): Promise<HTMLCanvasElement> {
  const assets = await ensureCardAssets();
  return paintCard(milestoneFacts(m), user, assets);
}
