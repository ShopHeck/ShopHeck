// App Store preview (video) generator — Playwright screencast + ffmpeg.
//
// The App Store shows an app preview as the first tile in the product-page
// gallery and in search results. Without one, the listing leads with a static
// screenshot. This records the real app being driven through a scripted tour,
// then transcodes to the exact format App Store Connect accepts.
//
// ── Why a screencast, not a frame loop ─────────────────────────────────────
// Capturing PNGs in a loop tops out around 10 fps in a headless browser — far
// short of the 30 fps Apple wants, and the pacing stutters. Playwright's
// screencast records the compositor surface directly; ffmpeg then does the
// format conversion. See PREVIEW_TARGETS for why the browser viewport is sized
// in output pixels while the viewport meta sets the app's layout width — get
// that backwards and the recording is a grey frame with the app pasted into
// one corner.
//
// ── What ASC requires ──────────────────────────────────────────────────────
//   * exact pixel size for the display slot (886x1920 for 6.9" iPhone)
//   * 15-30 seconds, 30 fps
//   * H.264 in .mp4/.mov/.m4v, yuv420p
//   * an audio track — video-only files get rejected, so we mux silent AAC
// All of these come from PREVIEW_RULES and are re-checked by
// scripts/verify-appstore-assets.mjs after the run.
//
// One-time setup:
//   npm i -D playwright && npx playwright install chromium
//   ffmpeg must be on PATH (brew install ffmpeg)
//
// Run against a local production preview:
//   npm run build
//   npm run preview &           # serves http://localhost:4173
//   npm run preview:video       # or: node scripts/app-preview.mjs
//
// Or point at any deployed URL:
//   SHOT_URL=https://fightcamp.netlify.app npm run preview:video
//
// Output: ios/fastlane/screenshots/en-US/<device>-preview.mp4
// Verify: npm run verify:appstore

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

import { PREVIEW_TARGETS, PREVIEW_RULES, LOCALE } from './lib/appstore-spec.mjs';
import { loadChromium, launchOptions, interFontFaceCss, sleep } from './lib/browser.mjs';

const BASE_URL = (process.env.SHOT_URL || 'http://localhost:4173').replace(/\/$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'ios', 'fastlane', 'screenshots', LOCALE);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * The tour. `hold` is seconds spent on the scene; the sum lands inside Apple's
 * 15-30s window (checked below). `action` gets the page and may scroll, click,
 * or start the clock — anything that produces honest motion.
 */
const SCENES = [
  {
    view: 'dashboard',
    caption: 'Your whole camp, one screen',
    hold: 4.5,
    action: (page) => scrollTour(page, [260, 260]),
  },
  {
    view: 'timer',
    caption: 'Pro round timer, built for the gym',
    hold: 7,
    action: async (page) => {
      await sleep(1200);
      // Run the clock so the preview shows a live countdown, not a frozen 3:00.
      const started = await page.evaluate(() => {
        if (typeof window.__timerStartPause !== 'function') return false;
        window.__timerStartPause();
        return true;
      });
      if (!started) {
        console.warn('  ! __timerStartPause hook missing — timer scene will be static');
      }
    },
  },
  {
    view: 'planner',
    caption: 'A plan periodized to your fight date',
    hold: 4.5,
    action: (page) => scrollTour(page, [300, 300]),
  },
  {
    view: 'weight',
    caption: 'Make weight with safe-cut projections',
    hold: 4,
    action: (page) => scrollTour(page, [240]),
  },
  {
    view: 'progress',
    caption: 'Charts, benchmarks, and personal bests',
    hold: 4,
    action: (page) => scrollTour(page, [280]),
  },
  {
    view: 'aiinsights',
    caption: 'AI insights on your readiness',
    hold: 4,
    action: (page) => scrollTour(page, [240]),
  },
];

const PLANNED_SECONDS = SCENES.reduce((t, s) => t + s.hold, 0);
if (PLANNED_SECONDS < PREVIEW_RULES.minSeconds || PLANNED_SECONDS > PREVIEW_RULES.maxSeconds) {
  console.error(
    `Scene list runs ${PLANNED_SECONDS}s; Apple accepts ${PREVIEW_RULES.minSeconds}-${PREVIEW_RULES.maxSeconds}s.`,
  );
  process.exit(1);
}

/** The app's single scrolling column (AppShell's `flex-1 ... overflow-y-auto`). */
const SCROLLER = '.overflow-y-auto';

/** Smoothly scroll the app's scroll container by each delta in turn. */
async function scrollTour(page, deltas) {
  for (const dy of deltas) {
    await page.evaluate(
      ([sel, d]) => {
        const el = document.querySelector(sel) ?? document.scrollingElement;
        el?.scrollBy({ top: d, behavior: 'smooth' });
      },
      [SCROLLER, dy],
    );
    await sleep(1400);
  }
}

/**
 * Snap back to the top of the column. Views share one scroll container, so
 * without this a scene inherits the previous scene's scroll offset — which is
 * how the timer scene ends up filming the colour-picker rows instead of the
 * clock.
 */
async function resetScroll(page) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) ?? document.scrollingElement;
    if (el) el.scrollTop = 0;
  }, SCROLLER);
}

/**
 * Inject the caption bar into the app page. It's part of the recorded frame, so
 * it has to carry its own embedded font — see interFontFaceCss().
 */
async function installCaption(page, target) {
  // The caption lives in the app's layout space, so it scales with layoutWidth
  // (443 phone → 1x, 1032 iPad → ~2.3x) rather than with the output pixels.
  const scale = target.layoutWidth / PREVIEW_TARGETS['iphone-6.9'].layoutWidth;
  await page.addStyleTag({
    content: `${interFontFaceCss()}
#__cap{
  position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;
  padding:${86 * scale}px ${26 * scale}px ${30 * scale}px;
  background:linear-gradient(to top,rgba(10,10,10,.96) 34%,rgba(10,10,10,.72) 64%,transparent);
  font-family:'InterEmbedded',system-ui,sans-serif;
  text-align:center;
}
#__cap .t{
  font-size:${21 * scale}px;font-weight:800;letter-spacing:${-0.4 * scale}px;line-height:1.25;color:#fff;
  opacity:0;transform:translateY(${10 * scale}px);
  transition:opacity .45s ease,transform .45s ease;
}
#__cap .t.on{opacity:1;transform:none}
#__cap .rule{
  width:${44 * scale}px;height:${3 * scale}px;border-radius:99px;background:#f97316;
  margin:${13 * scale}px auto 0;opacity:0;transition:opacity .45s ease .1s;
}
#__cap .rule.on{opacity:1}`,
  });
  await page.evaluate(() => {
    const bar = document.createElement('div');
    bar.id = '__cap';
    bar.innerHTML = '<div class="t"></div><div class="rule"></div>';
    document.body.appendChild(bar);
  });
}

/** Cross-fade the caption to new text. */
async function setCaption(page, text) {
  await page.evaluate((t) => {
    const el = document.querySelector('#__cap .t');
    const rule = document.querySelector('#__cap .rule');
    el.classList.remove('on');
    rule.classList.remove('on');
    setTimeout(() => {
      el.textContent = t;
      el.classList.add('on');
      rule.classList.add('on');
    }, 260);
  }, text);
}

/**
 * Transcode the raw screencast into an App Store-ready preview.
 *
 * `startAt`/`duration` trim the head, which is the app booting — the recording
 * begins when the browser context is created, well before the first scene.
 */
function transcode({ src, dest, target, startAt, duration }) {
  const args = [
    '-y',
    '-v', 'error',
    '-i', src,
    // Silent stereo track: ASC rejects previews with no audio stream.
    '-f', 'lavfi',
    '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
    '-ss', startAt.toFixed(3),
    '-t', duration.toFixed(3),
    // Force the exact slot size even if the screencast drifted by a pixel.
    '-vf', `scale=${target.width}:${target.height}:flags=lanczos,fps=${PREVIEW_RULES.fps},format=${PREVIEW_RULES.pixelFormat}`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.0',
    '-preset', 'slow',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-ac', '2',
    '-shortest',
    // Put the moov atom first so the App Store can stream it without a full
    // download.
    '-movflags', '+faststart',
    dest,
  ];
  execFileSync(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
}

// ── run ─────────────────────────────────────────────────────────────────────

try {
  execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' });
} catch {
  console.error(`ffmpeg not found (tried "${FFMPEG}").\nInstall it — macOS: brew install ffmpeg — or set FFMPEG_PATH.`);
  process.exit(1);
}

const chromium = await loadChromium();
const browser = await chromium.launch(launchOptions());
const workDir = join(tmpdir(), `fc-preview-${process.pid}`);
let made = 0;

try {
  mkdirSync(OUT, { recursive: true });

  for (const [key, target] of Object.entries(PREVIEW_TARGETS)) {
    const rawDir = join(workDir, target.prefix);
    mkdirSync(rawDir, { recursive: true });

    console.log(`\n${target.label} — ${target.width}x${target.height}, ~${PLANNED_SECONDS}s`);

    const contextStart = Date.now();
    const context = await browser.newContext({
      // Viewport is in OUTPUT pixels; the app's layout width comes from the
      // rewritten viewport meta below. isMobile enables the mobile emulation
      // path that honours that meta at all.
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: 1,
      isMobile: true,
      recordVideo: { dir: rawDir, size: { width: target.width, height: target.height } },
    });

    // Rewrite the document's viewport meta on the way through. Setting it from
    // page script after load is too late — Chromium has already committed a
    // layout — and it must not carry `initial-scale`, which would pin the page
    // scale to 1 and defeat the whole mechanism.
    await context.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const res = await route.fetch();
      const body = (await res.text()).replace(
        /<meta name="viewport"[^>]*>/i,
        `<meta name="viewport" content="width=${target.layoutWidth},viewport-fit=cover">`,
      );
      await route.fulfill({ response: res, body });
    });

    const page = await context.newPage();
    await page.goto(`${BASE_URL}/?shot=1`, { waitUntil: 'networkidle', timeout: 60000 });

    const laidOut = await page.evaluate(() => document.documentElement.clientWidth);
    if (laidOut !== target.layoutWidth) {
      throw new Error(
        `layout width is ${laidOut}, expected ${target.layoutWidth} — the viewport meta rewrite did not take, ` +
          'so the recording would be the wrong scale',
      );
    }
    await page.waitForFunction(() => typeof window.__setView === 'function', null, { timeout: 30000 });
    await page.addStyleTag({
      content: '*{caret-color:transparent!important}::-webkit-scrollbar{display:none!important}',
    });
    await installCaption(page, target);
    // Settle before the clock starts so the trim point lands on a painted frame.
    await sleep(900);

    const sceneStart = Date.now();
    for (const scene of SCENES) {
      const until = Date.now() + scene.hold * 1000;
      // Start the caption's cross-fade first so its new text lands on screen at
      // the same moment as the new view, not a beat behind it.
      await setCaption(page, scene.caption);
      await sleep(280);
      await page.evaluate((v) => window.__setView(v), scene.view);
      await resetScroll(page);
      if (scene.action) await scene.action(page);
      const remaining = until - Date.now();
      if (remaining > 0) await sleep(remaining);
      console.log(`  · ${scene.view} — "${scene.caption}"`);
    }
    const sceneEnd = Date.now();

    // The webm is only flushed to disk once the context closes.
    await context.close();

    const raw = readdirSync(rawDir).find((f) => f.endsWith('.webm'));
    if (!raw) throw new Error(`no screencast written for ${target.label}`);

    const startAt = (sceneStart - contextStart) / 1000;
    const duration = Math.min((sceneEnd - sceneStart) / 1000, PREVIEW_RULES.maxSeconds - 0.4);
    const dest = join(OUT, `${target.prefix}-preview.mp4`);
    transcode({ src: join(rawDir, raw), dest, target, startAt, duration });

    console.log(`  ✓ ${target.prefix}-preview.mp4 (${duration.toFixed(1)}s)`);
    made++;
  }
} catch (err) {
  console.error('\nApp preview run failed:', err.message);
  console.error(`Is the app serving at ${BASE_URL}? Start it with: npm run preview`);
  process.exitCode = 1;
} finally {
  await browser.close();
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}

console.log(`\nDone — ${made} app preview(s) in ios/fastlane/screenshots/${LOCALE}/`);
console.log('Next: npm run verify:appstore');
