// Shared Playwright + asset helpers for the App Store capture scripts.

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

/**
 * Load Playwright, failing with an actionable message instead of a stack trace.
 */
export async function loadChromium() {
  try {
    const { chromium } = await import('playwright');
    return chromium;
  } catch {
    console.error(
      'Playwright is not installed. Run:\n  npm i -D playwright && npx playwright install chromium',
    );
    process.exit(1);
  }
}

/**
 * Launch options. Playwright normally finds its own Chromium; CI images that
 * pre-install browsers elsewhere can point at one with PLAYWRIGHT_CHROMIUM_PATH
 * instead of re-downloading (see PLAYWRIGHT_BROWSERS_PATH in the sandbox docs).
 */
export function launchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  return executablePath ? { executablePath } : {};
}

/**
 * Inter, inlined as base64 @font-face rules.
 *
 * The marketing frame's headline/caption typography has to look identical no
 * matter which machine renders it. Relying on `system-ui` would give SF Pro on
 * a Mac and DejaVu/Liberation on a Linux CI runner, so the frame ships its own
 * webfont. (This is frame chrome only — the app UI inside the device mockup is
 * captured exactly as the app renders it, fonts included.)
 */
let cachedFontCss = null;
export function interFontFaceCss() {
  if (cachedFontCss) return cachedFontCss;
  const weights = [400, 600, 800];
  cachedFontCss = weights
    .map((weight) => {
      const file = require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff2`);
      const b64 = readFileSync(file).toString('base64');
      return `@font-face{font-family:'InterEmbedded';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    })
    .join('\n');
  return cachedFontCss;
}

/** Wrap a PNG buffer as a data URI for embedding in the frame HTML. */
export const pngDataUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Open the app in screenshot mode and wait for the `?shot` harness to attach.
 * `?shot=1` seeds a fully-populated demo camp with Pro unlocked
 * (src/utils/demoSeed.ts) and exposes window.__setView / window.__openUpgrade
 * (src/App.tsx), which is how these scripts navigate deterministically.
 */
export async function openShotPage(context, baseUrl) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?shot=1`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__setView === 'function', null, { timeout: 30000 });
  // Kill caret blink and any scroll-anchoring jitter so repeat runs are
  // byte-comparable and video frames don't flicker.
  await page.addStyleTag({
    content: '*{caret-color:transparent!important}::-webkit-scrollbar{display:none!important}',
  });
  return page;
}

/** Navigate the app to an internal view id and let lazy chunks/charts settle. */
export async function setView(page, viewId, settleMs = 1600) {
  await page.evaluate((v) => window.__setView(v), viewId);
  await sleep(settleMs);
}
