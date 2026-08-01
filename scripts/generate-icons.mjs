/**
 * Regenerates every icon placement from the single source of truth: the iOS
 * AppIcon (square, full-bleed, no baked corner rounding).
 *
 *   node scripts/generate-icons.mjs
 *
 * Writes the PWA/favicon icons, the maskable variant, the compact in-app shield
 * mark, the Open Graph card and the iOS splash. Re-run it whenever the source
 * artwork changes so nothing drifts back out of sync.
 *
 * Uses Playwright's Chromium purely as an image resizer — it is already a dev
 * dependency for the App Store capture scripts, so this adds nothing new.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SRC = `${REPO}/ios/App/App/Assets.xcassets/AppIcon.appiconset/60AE026B-12CB-4851-9925-D8AFB5CC4719.png`;
const srcDataUrl = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

/**
 * Draw a region of the source onto a size×size canvas and return a PNG buffer.
 * sx/sy/sw/sh are fractions of the source (0..1). `pad` insets the drawn art
 * inside the output, leaving the background colour around it.
 */
async function render({ size, sx = 0, sy = 0, sw = 1, sh = 1, pad = 0, bg = '#000000' }) {
  const b64 = await page.evaluate(async ({ src, size, sx, sy, sw, sh, pad, bg }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.getElementById('c');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    const inset = Math.round(size * pad);
    ctx.drawImage(
      img,
      sx * img.width, sy * img.height, sw * img.width, sh * img.height,
      inset, inset, size - inset * 2, size - inset * 2,
    );
    return c.toDataURL('image/png').split(',')[1];
  }, { src: srcDataUrl, size, sx, sy, sw, sh, pad, bg });
  return Buffer.from(b64, 'base64');
}

const out = [];
const write = (path, buf) => { writeFileSync(`${REPO}/${path}`, buf); out.push([path, buf.length]); };

// ── PWA / favicon / apple-touch-icon: the full lockup, same art as iOS ──────
write('public/icon-192.png', await render({ size: 192 }));
write('public/icon-512.png', await render({ size: 512 }));

// ── Maskable: Android/Chrome crops to a circle inscribed in the safe zone, so
//    the art is inset to ~80% and the black field carries the rest.
write('public/icon-maskable-512.png', await render({ size: 512, pad: 0.12 }));

// ── The compact in-app mark: just the FC shield, no wordmark. Measured off the
//    source — the shield occupies roughly the top 68% and the middle 62%.
const SHIELD = { sx: 0.185, sy: 0.055, sw: 0.63, sh: 0.66 };
write('public/fc-mark-192.png', await render({ size: 192, ...SHIELD }));

// ── Open Graph card (1200x630 is not square, handled separately below) ──────
const ogB64 = await page.evaluate(async ({ src }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.getElementById('c');
  c.width = 1200; c.height = 630;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1200, 630);
  // Contain the square art in the middle of the wide card.
  const h = 630, w = 630;
  ctx.drawImage(img, 0, 0, img.width, img.height, (1200 - w) / 2, 0, w, h);
  return c.toDataURL('image/png').split(',')[1];
}, { src: srcDataUrl });
write('public/og-image.png', Buffer.from(ogB64, 'base64'));

// ── iOS splash: the lockup centred on the app's own background colour, so the
//    launch screen matches the app instead of flashing white.
const splashB64 = await page.evaluate(async ({ src }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const S = 2732;
  const c = document.getElementById('c');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // Pure black, matching the source art's own field — a #0a0a0a fill leaves a
  // visible square seam where the artwork's black tile meets it.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, S, S);
  // The splash is scaleAspectFill across every device size, so keep the art
  // well inside the middle third — that region survives any crop.
  const art = Math.round(S * 0.30);
  ctx.drawImage(img, 0, 0, img.width, img.height, (S - art) / 2, (S - art) / 2, art, art);
  return c.toDataURL('image/png').split(',')[1];
}, { src: srcDataUrl });
const splash = Buffer.from(splashB64, 'base64');
for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  write(`ios/App/App/Assets.xcassets/Splash.imageset/${n}`, splash);
}

await browser.close();
console.log('written:');
for (const [p, n] of out) console.log(`  ${p.padEnd(62)} ${(n / 1024).toFixed(0)} kB`);
