// In-app purchase review screenshot generator (Playwright).
//
// App Store Connect requires a "Review Screenshot" on every in-app purchase /
// subscription before it can be submitted for review (the missing screenshots
// were part of the Guideline 2.1(b) rejection). This captures the in-app
// upgrade paywall with the relevant billing period selected, once per product:
//
//   fighter-pro-monthly.png   Fighter Pro Monthly  $7.99/mo
//   fighter-pro-annual.png    Fighter Pro Annual   $59.99/yr
//   coach-pro-monthly.png     Coach Pro Monthly    $19.99/mo
//   coach-pro-annual.png      Coach Pro Annual     $149.99/yr
//
// Captured at 1290x2796 (6.7" iPhone) — well above ASC's 640x920 minimum.
// Upload each PNG on its product page: App Store Connect → Subscriptions →
// <product> → Review Information → Screenshot.
//
// One-time setup:
//   npm i -D playwright && npx playwright install chromium
//
// Run against a local production preview:
//   npm run build
//   npm run preview &           # serves http://localhost:4173
//   node scripts/iap-screenshots.mjs
//
// Or point at any deployed URL:
//   SHOT_URL=https://fightcamp.netlify.app node scripts/iap-screenshots.mjs
//
// Output: ios/fastlane/screenshots/iap/*.png

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
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'ios', 'fastlane', 'screenshots', 'iap');

// One shot per ASC product. `billing` drives the modal's Monthly/Annual toggle;
// the paywall shows the Fighter and Coach cards together, so the fighter and
// coach variants of the same period differ only in which card ASC reviewers
// are pointed at — each product still needs its own uploaded file.
const SHOTS = [
  { file: 'fighter-pro-monthly.png', billing: 'Monthly', product: 'Fighter Pro Monthly $7.99/mo' },
  { file: 'fighter-pro-annual.png',  billing: 'Annual',  product: 'Fighter Pro Annual $59.99/yr' },
  { file: 'coach-pro-monthly.png',   billing: 'Monthly', product: 'Coach Pro Monthly $19.99/mo' },
  { file: 'coach-pro-annual.png',    billing: 'Annual',  product: 'Coach Pro Annual $149.99/yr' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CHROMIUM_PATH: escape hatch for environments whose preinstalled Chromium
// doesn't match this playwright version's registry (falls back to the default
// download otherwise).
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
let count = 0;
try {
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },  // 6.7" iPhone -> 1290x2796 px
    deviceScaleFactor: 3,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/?shot=1`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => typeof window.__openUpgrade === 'function', null, { timeout: 20000 });

  // Drain the gamification celebration toasts (streaks, first-workout, …) —
  // dismissing one shows the next queued toast, and they overlap the top of the
  // frame where they don't belong in a product review screenshot.
  const toastDismiss = page.getByRole('button', { name: 'Dismiss' });
  for (let i = 0; i < 10 && (await toastDismiss.count()); i++) {
    await toastDismiss.first().click();
    await sleep(500);
  }

  await page.evaluate(() => window.__openUpgrade());
  await page.waitForSelector('text=Unlock the full platform', { timeout: 10000 });

  for (const { file, billing, product } of SHOTS) {
    await page.getByRole('button', { name: billing }).click();
    await sleep(400); // toggle transition
    await page.screenshot({ path: join(OUT, file) });
    count++;
    console.log(`✓ ${file}  (${product})`);
  }
  await context.close();
} catch (err) {
  console.error('\nIAP screenshot run failed:', err.message);
  console.error(`Is the app serving at ${BASE_URL}? Start it with: npm run preview`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
console.log(`\nDone — ${count} review screenshots in ios/fastlane/screenshots/iap/`);
