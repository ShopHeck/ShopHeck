// Marketing frame renderer for App Store screenshots.
//
// Takes a raw capture of the running app and composes it into the finished
// store image: brand lockup, headline, feature chips, and a device mockup —
// rendered in Playwright at exactly the target's pixel dimensions.
//
// Everything is drawn in CSS (no image assets, no design-tool export), so a
// copy change is a one-line edit in scripts/screenshots.mjs and the output
// stays pixel-identical across machines.

import { interFontFaceCss, pngDataUri } from './browser.mjs';

/** App accent + surface colors, matched to tailwind.config.js `brand`/`dark`. */
const ACCENT = '#f97316';
const BG = '#0a0a0a';

/**
 * 24×24 stroke icons (lucide-style paths) used in the feature chips. Inlined
 * rather than imported from lucide-react so the frame renderer stays free of
 * the app's React runtime.
 */
const ICONS = {
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  scale: '<path d="M12 3v18M7 7h10M5 21h14M6 7l-3 7h6zM18 7l-3 7h6z"/>',
  trend: '<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  droplet: '<path d="M12 2.7l5.3 5.3a7.5 7.5 0 1 1-10.6 0z"/>',
  flame: '<path d="M12 2s4 4.5 4 8a4 4 0 0 1-8 0c0-1.2.5-2.3 1-3-2.5 1.6-4 4.2-4 7a7 7 0 1 0 14 0c0-5-7-12-7-12z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  heart: '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.2 14.3L7 22l5-3 5 3-1.2-7.7"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
};

const icon = (name, size = 20, stroke = 2) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
        stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ICONS.flame}</svg>`;

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Render a headline. `*word*` marks accent-colored text and `\n` forces a line
 * break, so the shot list reads like plain copy:
 *   'Train every\n*round*'
 */
const headlineHtml = (text) =>
  escapeHtml(text)
    .split(/(\*[^*]+\*)/g)
    .map((part) =>
      part.startsWith('*') && part.endsWith('*') && part.length > 2
        ? `<span class="ac">${part.slice(1, -1)}</span>`
        : part,
    )
    .join('')
    .replace(/\n/g, '<br>');

/**
 * Per-variant geometry, in CSS pixels of the target's `viewport`.
 *
 * The phone layout stacks copy over a left chip column with the device bleeding
 * toward the right edge; the 4:3 tablet is far too wide for that, so it centers
 * the device and runs the chips as a bottom row.
 */
const LAYOUTS = {
  phone: {
    pad: 34,
    topPad: 44,
    brandSize: 12.5,
    h1: 45,
    h1Track: -1.5,
    subSize: 15.5,
    subWidth: 336,
    stageTop: 300,
    chipWidth: 156,
    chipGap: 12,
    deviceWidth: 280,
    deviceRight: -30,
    deviceTop: 8,
    tilt: 'perspective(1500px) rotateY(-12deg) rotateZ(-1.2deg)',
    radius: 40,
    bezel: 9,
  },
  // 1032x1376 is portrait 3:4 — far squarer than the phone — so the copy stacks
  // over a centered device with the chips as a bottom row. `stageTop` has to
  // clear the whole copy block (top pad + brand + two headline lines + sub) or
  // the device is painted straight over the subhead.
  tablet: {
    pad: 76,
    topPad: 70,
    brandSize: 17,
    h1: 64,
    h1Track: -2.1,
    subSize: 23,
    subWidth: 720,
    stageTop: 400,
    chipWidth: 0, // horizontal row instead
    chipGap: 20,
    deviceWidth: 600,
    deviceRight: null, // centered
    deviceTop: 0,
    tilt: 'perspective(2600px) rotateY(-7deg) rotateZ(-0.6deg)',
    radius: 34,
    bezel: 10,
  },
};

function buildHtml({ target, appDataUri, shot, variant }) {
  const L = LAYOUTS[variant];
  const { width: vw, height: vh } = target.viewport;
  const isPhone = variant === 'phone';

  const chips = (shot.chips ?? [])
    .map(
      (c) => `
      <div class="chip">
        <div class="ico">${icon(c.icon, isPhone ? 18 : 26)}</div>
        <div class="txt">
          <div class="t">${escapeHtml(c.title)}</div>
          ${c.note ? `<div class="n">${escapeHtml(c.note)}</div>` : ''}
        </div>
      </div>`,
    )
    .join('');

  // The viewport meta is load-bearing, not boilerplate: contexts created with
  // isMobile:true fall back to Chromium's legacy 980px layout viewport without
  // it, then scale the result down to fit. That both throws off every CSS pixel
  // measurement below and lands the capture on a fractional device pixel —
  // which is how you end up with a 1320x2867 PNG that App Store Connect
  // refuses because it is one pixel short of 1320x2868.
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
${interFontFaceCss()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${vw}px;height:${vh}px;overflow:hidden}
body{
  background:${BG};
  font-family:'InterEmbedded',system-ui,sans-serif;
  color:#fff;
  -webkit-font-smoothing:antialiased;
}
/* Warm glow behind the device, plus a cooler wash up top so the headline
   doesn't sit on flat black. */
.glow{
  position:absolute;inset:0;
  background:
    radial-gradient(120% 62% at 82% 86%, rgba(249,115,22,.34), transparent 62%),
    radial-gradient(90% 46% at 6% -6%, rgba(249,115,22,.10), transparent 58%),
    radial-gradient(140% 90% at 50% 120%, rgba(0,0,0,.55), transparent 60%);
}
.copy{position:absolute;left:${L.pad}px;right:${L.pad}px;top:${L.topPad}px;${isPhone ? '' : 'text-align:center;'}}
.brand{display:flex;align-items:center;gap:${isPhone ? 9 : 14}px;${isPhone ? '' : 'justify-content:center;'}margin-bottom:${isPhone ? 24 : 30}px}
.brand .mark{
  width:${isPhone ? 30 : 44}px;height:${isPhone ? 30 : 44}px;border-radius:${isPhone ? 9 : 13}px;
  background:linear-gradient(150deg,#fb923c,${ACCENT});
  display:grid;place-items:center;color:#fff;
  box-shadow:0 6px 18px rgba(249,115,22,.42);
}
.brand .name{font-size:${L.brandSize}px;font-weight:800;letter-spacing:.19em;text-transform:uppercase}
h1{font-size:${L.h1}px;line-height:1.03;font-weight:800;letter-spacing:${L.h1Track}px}
h1 .ac{color:${ACCENT}}
.sub{
  margin-top:${isPhone ? 15 : 22}px;font-size:${L.subSize}px;line-height:1.45;font-weight:400;
  color:#9ca3af;max-width:${L.subWidth}px;${isPhone ? '' : 'margin-left:auto;margin-right:auto;'}
}
/* ── chips ─────────────────────────────────────────────────────────────── */
.chips{
  position:absolute;display:flex;gap:${L.chipGap}px;
  ${isPhone
    ? `left:${L.pad}px;top:${L.stageTop + 44}px;width:${L.chipWidth}px;flex-direction:column;`
    : `left:${L.pad}px;right:${L.pad}px;bottom:${L.pad + 6}px;flex-direction:row;justify-content:center;`}
}
.chip{
  display:flex;align-items:center;gap:${isPhone ? 10 : 14}px;
  background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);
  border-radius:${isPhone ? 14 : 20}px;padding:${isPhone ? '11px 12px' : '18px 22px'};
  backdrop-filter:blur(6px);
  ${isPhone ? '' : 'flex:0 1 auto;'}
}
.chip .ico{
  width:${isPhone ? 30 : 46}px;height:${isPhone ? 30 : 46}px;border-radius:${isPhone ? 9 : 14}px;
  background:rgba(249,115,22,.15);color:${ACCENT};display:grid;place-items:center;flex:none;
}
/* Labels wrap rather than truncate — a chip growing to two lines looks
   intentional, a clipped word does not. Keep copy short in the shot list. */
.chip .t{font-size:${isPhone ? 12.5 : 19}px;font-weight:700;line-height:1.25}
.chip .n{font-size:${isPhone ? 10.5 : 15}px;font-weight:400;color:#8b9098;margin-top:2px;line-height:1.25}
/* ── device mockup ─────────────────────────────────────────────────────── */
.device{
  position:absolute;
  width:${L.deviceWidth}px;
  ${isPhone
    ? `right:${L.deviceRight}px;top:${L.stageTop + L.deviceTop}px;`
    : `left:50%;margin-left:${-L.deviceWidth / 2}px;top:${L.stageTop + L.deviceTop}px;`}
  padding:${L.bezel}px;
  border-radius:${L.radius}px;
  background:linear-gradient(155deg,#3a3a42,#141418 46%,#0c0c0f);
  box-shadow:
    0 2px 0 rgba(255,255,255,.10) inset,
    0 40px 90px rgba(0,0,0,.72),
    0 0 0 1px rgba(255,255,255,.05);
  transform:${L.tilt};
  transform-origin:center center;
}
.device .screen{
  position:relative;border-radius:${L.radius - L.bezel - 2}px;overflow:hidden;
  background:${BG};line-height:0;
}
.device img{display:block;width:100%;height:auto}
/* Faint diagonal glare so the mockup reads as glass, not a flat paste-in. */
.device .glare{
  position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(118deg,rgba(255,255,255,.075) 0%,rgba(255,255,255,.02) 26%,transparent 46%);
}
</style></head><body>
  <div class="glow"></div>
  <div class="copy">
    <div class="brand">
      <div class="mark">${icon('flame', isPhone ? 17 : 25, 2.2)}</div>
      <div class="name">Fight Camp</div>
    </div>
    <h1>${headlineHtml(shot.headline)}</h1>
    ${shot.sub ? `<div class="sub">${escapeHtml(shot.sub)}</div>` : ''}
  </div>
  <div class="device"><div class="screen"><img src="${appDataUri}"><div class="glare"></div></div></div>
  <div class="chips">${chips}</div>
</body></html>`;
}

/**
 * Compose one finished App Store screenshot.
 *
 * @param page      Playwright page already sized to `target.viewport` at
 *                  `target.scale` — the screenshot comes out at exactly
 *                  target.width × target.height with no resampling.
 * @param target    entry from SCREENSHOT_TARGETS
 * @param appPng    raw PNG buffer of the app screen
 * @param shot      { headline, sub, chips: [{icon,title,note}] }
 * @returns PNG buffer
 */
export async function renderFramedScreenshot({ page, target, appPng, shot }) {
  const variant = target.mobile ? 'phone' : 'tablet';
  const html = buildHtml({ target, appDataUri: pngDataUri(appPng), shot, variant });

  await page.setContent(html, { waitUntil: 'load' });
  // Both the embedded webfont and the (large) inlined screenshot must be ready
  // before we capture, or the frame renders with fallback metrics / a blank
  // device screen.
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {}))),
  );
  return page.screenshot({ type: 'png' });
}
