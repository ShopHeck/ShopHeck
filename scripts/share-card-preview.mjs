// Share-card preview renderer (Playwright).
//
// Paints every share-card variant to a PNG so a layout change can be *looked
// at* instead of reasoned about. The cards are canvas-drawn at 1080×1920 with
// hand-computed geometry, and the failure mode is entirely visual: text that
// overruns the frame, blocks that collide, a glyph that lands as a tofu box.
// None of that shows up in a unit test, and the alternative — logging a session
// on a phone, hitting a PR, and screenshotting the share sheet — is why the
// last regression was found by a user.
//
// The generators live in src/utils/shareCardCanvas.ts precisely so this script
// can import them directly, rather than driving the app to the moment that
// produces a card.
//
// Run:
//   node scripts/share-card-preview.mjs
//   PREVIEW_URL=http://localhost:5173 node scripts/share-card-preview.mjs   # reuse a running dev server
//
// Output: share-card-preview/*.png (gitignored)

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { loadChromium, launchOptions, sleep } from './lib/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'share-card-preview');
const PORT = 5199;

/**
 * The variants worth looking at — the ordinary case for each card, plus the
 * inputs that used to break the layout: the PR headline from the bug report,
 * free text long enough to need clipping, and an off-season camp with no
 * fight date.
 */
const CASES = [
  {
    name: 'milestone-pr',
    kind: 'milestone',
    milestone: {
      title: 'NEW PR: MOST WORKOUTS IN A WEEK',
      subtitle: '5 sessions (was 4)',
      slug: 'pr-workouts',
      headline: 'New PR',
      descriptor: 'Most workouts in a week',
      statValue: '5',
      statLabel: 'Sessions',
      footnote: 'Previous best: 4',
    },
  },
  {
    name: 'milestone-belt',
    kind: 'milestone',
    milestone: {
      title: 'BLUE BELT UNLOCKED', subtitle: 'New rank earned', slug: 'belt-blue',
      headline: 'Blue Belt', descriptor: 'New rank earned', footnote: 'Keep grinding',
    },
  },
  {
    name: 'milestone-streak',
    kind: 'milestone',
    milestone: {
      title: '14-DAY STREAK', subtitle: 'Two weeks without a missed session', slug: 'streak-14',
      headline: 'Streak', descriptor: 'Consecutive training days',
      statValue: '14', statLabel: 'Days', footnote: 'Currently on 14',
    },
  },
  {
    name: 'milestone-victory',
    kind: 'milestone',
    milestone: {
      title: 'VICTORY', subtitle: 'UD · R3 · vs J. Smith', slug: 'fight-win',
      headline: 'Victory', descriptor: 'vs J. Smith',
      statValue: '3', statLabel: 'Round', footnote: 'TKO · R3',
    },
  },
  {
    // No structured slots at all — proves the title/subtitle fallback still
    // produces a coherent card for any caller that hasn't been updated.
    name: 'milestone-derived',
    kind: 'milestone',
    milestone: {
      title: 'NEW PR: HIGHEST WEEKLY MEP',
      subtitle: '482 MEP (was 431)',
      slug: 'pr-mep',
    },
  },
  {
    name: 'milestone-overflow',
    kind: 'milestone',
    milestone: {
      title: 'NEW PR: MOST SPARRING ROUNDS COMPLETED IN A SINGLE WEEK OF FIGHT CAMP',
      subtitle: 'Forty-two rounds across five sessions, beating the previous best of thirty-eight',
      slug: 'pr-sparring',
      headline: 'New Personal Record',
      descriptor: 'Most sparring rounds completed in a single week of fight camp',
      statValue: '42',
      statLabel: 'Rounds completed',
      footnote: 'Beating the previous best of thirty-eight rounds across five sessions',
    },
  },
  { name: 'session', kind: 'session', log: { title: 'Heavy Bag Intervals', sessionType: 'conditioning', duration: 60, rpe: 8 } },
  {
    name: 'session-overflow',
    kind: 'session',
    log: { title: 'Southpaw Counter Sparring and Clinch Work with the Visiting Camp', sessionType: 'sparring', duration: 105, rpe: 9 },
    camp: { opponent: 'Alexander Konstantinopoulos-Fernandez' },
  },
  { name: 'session-offseason', kind: 'session', log: { title: 'Strength Block', sessionType: 'strength', duration: 75, rpe: 7 }, camp: { fightDate: null, opponent: null } },
];

/** Waits for the dev server to answer, so the page load isn't a race. */
async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(300);
  }
  throw new Error(`Dev server never came up at ${url}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  let server = null;
  let baseUrl = process.env.PREVIEW_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    baseUrl = `http://localhost:${PORT}`;
    server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    await waitForServer(baseUrl);
  }

  const chromium = await loadChromium();
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await browser.newPage();
    // The app itself is only here to bring in the stylesheet: the generators
    // resolve their palette from the CSS custom properties on :root, so a card
    // drawn against an unstyled page would come out in fallback white.
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(
      () => !!getComputedStyle(document.documentElement).getPropertyValue('--accent-flame').trim(),
      null,
      { timeout: 30000 },
    );

    for (const testCase of CASES) {
      const dataUrl = await page.evaluate(async (c) => {
        const { drawSessionCard, drawMilestoneCard } = await import('/src/utils/shareCardCanvas.ts');
        const user = { name: 'Mike' };
        if (c.kind === 'milestone') {
          return (await drawMilestoneCard(c.milestone, user)).toDataURL('image/png');
        }
        const camp = {
          startDate: '2026-07-01',
          campWeeks: 8,
          fightDate: '2026-09-12',
          opponent: 'J. Smith',
          ...(c.camp ?? {}),
        };
        const log = { date: '2026-08-09', ...c.log };
        return (await drawSessionCard(log, camp, user)).toDataURL('image/png');
      }, testCase);

      const file = join(OUT, `${testCase.name}.png`);
      writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
      console.log(`✓ ${file}`);
    }
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
