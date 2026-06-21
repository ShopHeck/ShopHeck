// App Store screenshot generator (Playwright).
//
// Why not Fastlane snapshot? This app is a Capacitor WKWebView — XCUITest can't
// reliably drive web UI. Playwright drives the real DOM, and App Store
// screenshots only need PNGs at the right pixel sizes (they don't have to come
// from a device). This loads the live app with `?shot=1` (which seeds a demo
// camp + Pro — see src/utils/demoSeed.ts), navigates each screen via the
// `window.__setView` hook (exposed only in shot mode), and saves PNGs.
//
// One-time setup:
//   npm i -D playwright && npx playwright install chromium
//
// Run against a local production preview:
//   npm run build
//   npm run preview &           # serves http://localhost:4173
//   npm run screenshots         # or: node scripts/screenshots.mjs
//
// Or point at any deployed URL:
//   SHOT_URL=https://deploy-preview-XX--fightcamp.netlify.app npm run screenshots
//
// Output: ios/fastlane/screenshots/en-US/<device>-<NN-name>.png

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const BASE_URL = (process.env.SHOT_URL || 'http://localhost:4173').replace(/\/$/, '');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'ios', 'fastlane', 'screenshots', 'en-US');

// App Store device classes. width/height are logical points; deviceScaleFactor
// yields the exact PNG pixel dimensions Apple expects.
const DEVICES = [
  { name: 'iphone69', width: 440, height: 956, scale: 3, mobile: true },   // 6.9" -> 1320x2868
  { name: 'iphone67', width: 430, height: 932, scale: 3, mobile: true },   // 6.7" -> 1290x2796
  { name: 'ipad13', width: 1032, height: 1376, scale: 2, mobile: false },  // 13"  -> 2064x2752
];

// [internal view id, output label]. View ids are AppShell's <View> union.
const SHOTS = [
  ['dashboard', '01-dashboard'],
  ['timer', '02-timer'],
  ['planner', '03-planner'],
  ['weight', '04-weight'],
  ['progress', '05-progress'],
  ['aiinsights', '06-ai-insights'],
  ['nutrition', '07-nutrition'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
let count = 0;
try {
  for (const device of DEVICES) {
    mkdirSync(OUT, { recursive: true });
    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.scale,
      isMobile: device.mobile,
    });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/?shot=1`, { waitUntil: 'networkidle', timeout: 30000 });
    // Wait for the shot-mode hook to attach before navigating.
    await page.waitForFunction(() => typeof window.__setView === 'function', null, { timeout: 20000 });

    for (const [viewId, label] of SHOTS) {
      await page.evaluate((v) => window.__setView(v), viewId);
      await sleep(1500); // allow lazy-loaded views + charts to render
      await page.screenshot({ path: join(OUT, `${device.name}-${label}.png`) });
      count++;
      console.log(`✓ ${device.name}-${label}.png`);
    }
    await context.close();
  }
} catch (err) {
  console.error('\nScreenshot run failed:', err.message);
  console.error(`Is the app serving at ${BASE_URL}? Start it with: npm run preview`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(`\nDone — ${count} screenshots in ios/fastlane/screenshots/en-US/`);
