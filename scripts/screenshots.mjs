// App Store screenshot generator (Playwright).
//
// Produces the finished, correctly-sized store images for every display size
// Apple requires — brand frame, headline, feature chips, and device mockup
// composed around a live capture of the real app.
//
// Why not Fastlane snapshot? This app is a Capacitor WKWebView — XCUITest can't
// reliably drive web UI. Playwright drives the real DOM, and App Store
// screenshots only need PNGs at the right pixel sizes (they don't have to come
// from a device). This loads the app with `?shot=1` (which seeds a demo camp +
// Pro — see src/utils/demoSeed.ts), navigates each screen via the
// `window.__setView` hook (exposed only in shot mode), and composes each frame.
//
// ── Sizes ──────────────────────────────────────────────────────────────────
// Every size comes from scripts/lib/appstore-spec.mjs. Since April 2025 Apple
// requires exactly two sets — 6.9" iPhone and (for iPad-capable apps like this
// one) 13" iPad — and derives every smaller device from them. Getting these
// dimensions wrong is what makes the App Store letterbox a screenshot inside
// its card, and an iPhone set of fewer than three images is what makes the
// 3-up screenshot strip disappear from search results entirely.
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
//   SHOT_URL=https://fightcamp.netlify.app npm run screenshots
//
// Flags:
//   --raw    also write the unframed app captures (debugging / alt art)
//
// Output: ios/fastlane/screenshots/en-US/<device>-<NN-name>.png
// Verify: npm run verify:appstore

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { SCREENSHOT_TARGETS, SCREENSHOT_RULES, LOCALE } from './lib/appstore-spec.mjs';
import { loadChromium, launchOptions, openShotPage, setView } from './lib/browser.mjs';
import { renderFramedScreenshot } from './lib/frame.mjs';

const BASE_URL = (process.env.SHOT_URL || 'http://localhost:4173').replace(/\/$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'ios', 'fastlane', 'screenshots', LOCALE);
const RAW_OUT = join(ROOT, 'ios', 'fastlane', 'screenshots', 'raw');
const WRITE_RAW = process.argv.includes('--raw');

/**
 * The shot list. `view` is an AppShell <View> id; the rest is marketing copy.
 *
 * Headline syntax: `\n` breaks the line, `*word*` paints it accent-orange.
 * Keep chip titles short — they wrap inside a ~156px column on the phone frame.
 *
 * Order matters: it becomes the order on the product page, and the first three
 * are what the App Store shows in search results. Lead with the screens that
 * sell the app fastest.
 */
const SHOTS = [
  {
    view: 'dashboard',
    label: '01-dashboard',
    headline: 'Your whole camp,\n*one screen*',
    sub: 'Fight date, weekly load, weight, and readiness — the second you open the app.',
    chips: [
      { icon: 'calendar', title: 'Countdown', note: 'Weeks to fight night' },
      { icon: 'flame', title: 'Today', note: 'Straight from the plan' },
      { icon: 'target', title: 'Readiness', note: 'Know when to push' },
    ],
  },
  {
    view: 'timer',
    label: '02-timer',
    headline: 'Train every\n*round*',
    sub: 'Custom intervals for boxing, MMA, Muay Thai, HIIT, and more.',
    chips: [
      { icon: 'timer', title: '3:00 rounds', note: 'Bells + prep' },
      { icon: 'sliders', title: 'Presets', note: 'Saved and ready' },
      { icon: 'monitor', title: 'Gym display', note: 'Big screen mode' },
    ],
  },
  {
    view: 'planner',
    label: '03-planner',
    headline: 'A plan built for\n*fight night*',
    sub: 'Periodized week by week from your fight date, taper already built in.',
    chips: [
      { icon: 'calendar', title: 'Week by week', note: 'Auto-generated' },
      { icon: 'trend', title: 'Ramp & taper', note: 'Peak on the day' },
      { icon: 'award', title: 'Your sport', note: 'And your level' },
    ],
  },
  {
    view: 'weight',
    label: '04-weight',
    headline: 'Make weight,\n*safely*',
    sub: 'Daily weigh-ins with a projected cut pace, so you always know where you stand.',
    chips: [
      { icon: 'scale', title: 'Cut pace', note: 'Projected to target' },
      { icon: 'droplet', title: 'Hydration', note: 'Logged all camp' },
      { icon: 'trend', title: 'Trend line', note: 'No guesswork' },
    ],
  },
  {
    view: 'progress',
    label: '05-progress',
    headline: 'See every\n*gain*',
    sub: 'Volume, intensity, and benchmarks charted across the whole camp.',
    chips: [
      { icon: 'trend', title: 'Volume', note: 'Week over week' },
      { icon: 'heart', title: 'Conditioning', note: 'Benchmark tests' },
      { icon: 'award', title: 'Personal bests', note: 'Tracked for you' },
    ],
  },
  {
    view: 'aiinsights',
    label: '06-ai-insights',
    headline: 'AI that reads\n*your camp*',
    sub: 'Insights on load, recovery, and what to adjust — before it costs you.',
    chips: [
      { icon: 'sparkles', title: 'Analysis', note: 'From your data' },
      { icon: 'target', title: 'What to fix', note: 'Clear flags' },
      { icon: 'heart', title: 'Recovery', note: 'Spot overreaching' },
    ],
  },
  {
    view: 'nutrition',
    label: '07-nutrition',
    headline: 'Fuel the\n*work*',
    sub: 'Meals, macros, and water logged next to the training that earns them.',
    chips: [
      { icon: 'flame', title: 'Macros', note: 'Daily targets' },
      { icon: 'droplet', title: 'Water', note: 'Hydration log' },
      { icon: 'users', title: 'Meal plans', note: 'Built for camp' },
    ],
  },
];

if (SHOTS.length < SCREENSHOT_RULES.min || SHOTS.length > SCREENSHOT_RULES.max) {
  console.error(
    `Shot list has ${SHOTS.length} entries; Apple accepts ${SCREENSHOT_RULES.min}-${SCREENSHOT_RULES.max} per size.`,
  );
  process.exit(1);
}

const chromium = await loadChromium();
const browser = await chromium.launch(launchOptions());
let count = 0;

try {
  mkdirSync(OUT, { recursive: true });
  if (WRITE_RAW) mkdirSync(RAW_OUT, { recursive: true });

  for (const [key, target] of Object.entries(SCREENSHOT_TARGETS)) {
    const context = await browser.newContext({
      viewport: target.viewport,
      deviceScaleFactor: target.scale,
      isMobile: target.mobile,
      // Charts and the frame's glow gradients animate in; freezing motion keeps
      // repeat runs deterministic and avoids capturing a half-drawn chart.
      reducedMotion: 'reduce',
    });

    const app = await openShotPage(context, BASE_URL);
    // A second page in the same context renders the marketing frame, so the
    // capture is composed at exactly target.width x target.height.
    const framePage = await context.newPage();

    console.log(`\n${target.label} — ${target.width}x${target.height}`);
    for (const shot of SHOTS) {
      await setView(app, shot.view);
      const appPng = await app.screenshot({ type: 'png' });
      if (WRITE_RAW) {
        writeFileSync(join(RAW_OUT, `${target.prefix}-${shot.label}.png`), appPng);
      }

      const framed = await renderFramedScreenshot({ page: framePage, target, appPng, shot });
      writeFileSync(join(OUT, `${target.prefix}-${shot.label}.png`), framed);
      count++;
      console.log(`  ✓ ${target.prefix}-${shot.label}.png`);
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

console.log(`\nDone — ${count} screenshots in ios/fastlane/screenshots/${LOCALE}/`);
console.log('Next: npm run verify:appstore');
