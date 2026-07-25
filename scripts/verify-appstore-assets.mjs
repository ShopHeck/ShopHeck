// Pre-flight check for everything in ios/fastlane/screenshots/<locale>/.
//
// Run this before any upload. It is the guard against the exact failure that
// put the live listing in a bad state: assets that look fine locally but are
// the wrong pixel size for the App Store Connect slot they land in, which the
// store then letterboxes inside a white card — or, when an iPhone set has
// fewer than three images, drops from search results entirely.
//
// Checks, per display size:
//   * every screenshot is an exact match for a size Apple accepts
//   * the set has 3-10 images (3 is what the search-results strip needs)
//   * every required size (6.9" iPhone, 13" iPad) is actually present
//   * previews are H.264 / yuv420p, 15-30s, ~30fps, exact size, with audio
//
// Usage:  npm run verify:appstore
// Exit:   0 = ready to upload, 1 = something would be rejected or degraded

import { fileURLToPath } from 'node:url';
import { dirname, join, extname, basename } from 'node:path';
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  SCREENSHOT_TARGETS,
  PREVIEW_TARGETS,
  SCREENSHOT_RULES,
  PREVIEW_RULES,
  LOCALE,
  matchesTarget,
  acceptedSizes,
} from './lib/appstore-spec.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'ios', 'fastlane', 'screenshots', LOCALE);
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

/**
 * Read a PNG's dimensions from the IHDR chunk without pulling in an image
 * library — bytes 16..24 of a PNG are width and height, big-endian.
 */
function pngSize(file) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(24);
    readSync(fd, buf, 0, 24, 0);
    if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    closeSync(fd);
  }
}

/** Probe a video for the fields ASC cares about. */
function probeVideo(file) {
  const out = execFileSync(
    FFPROBE,
    [
      '-v', 'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate:format=duration,size',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  const data = JSON.parse(out);
  const video = (data.streams ?? []).find((s) => s.codec_type === 'video');
  const audio = (data.streams ?? []).find((s) => s.codec_type === 'audio');
  const [num, den] = (video?.avg_frame_rate ?? '0/1').split('/').map(Number);
  return {
    video,
    audio,
    fps: den ? num / den : 0,
    duration: Number(data.format?.duration ?? 0),
    bytes: Number(data.format?.size ?? 0),
  };
}

/** Which target a file belongs to, by its `<prefix>-` filename. */
const targetFor = (targets, file) =>
  Object.entries(targets).find(([, t]) => basename(file).startsWith(`${t.prefix}-`));

// ── collect ─────────────────────────────────────────────────────────────────

if (!existsSync(DIR)) {
  console.error(`No assets found at ios/fastlane/screenshots/${LOCALE}/`);
  console.error('Generate them first:\n  npm run screenshots\n  npm run preview:video');
  process.exit(1);
}

const files = readdirSync(DIR).filter((f) => !f.startsWith('.')).sort();
const shots = files.filter((f) => SCREENSHOT_RULES.extensions.includes(extname(f).toLowerCase()));
const videos = files.filter((f) => PREVIEW_RULES.extensions.includes(extname(f).toLowerCase()));
const unknown = files.filter((f) => !shots.includes(f) && !videos.includes(f));

for (const f of unknown) {
  fail(`${f}: unrecognized file type — deliver uploads everything in this folder, so remove it`);
}

// ── screenshots ─────────────────────────────────────────────────────────────

console.log(`Screenshots — ios/fastlane/screenshots/${LOCALE}/`);
const byTarget = new Map(Object.keys(SCREENSHOT_TARGETS).map((k) => [k, []]));

for (const file of shots) {
  const match = targetFor(SCREENSHOT_TARGETS, file);
  if (!match) {
    fail(`${file}: filename doesn't start with a known device prefix (${Object.values(SCREENSHOT_TARGETS).map((t) => t.prefix).join(', ')})`);
    continue;
  }
  const [key, target] = match;
  byTarget.get(key).push(file);

  if (extname(file).toLowerCase() !== '.png') {
    notes.push(`${file}: JPEG is accepted, but PNG avoids recompression artifacts`);
    continue;
  }
  const size = pngSize(join(DIR, file));
  if (!size) {
    fail(`${file}: not a readable PNG`);
    continue;
  }
  if (!matchesTarget(target, size.width, size.height)) {
    fail(
      `${file}: ${size.width}x${size.height} — ${target.label} requires ${acceptedSizes(target)}. ` +
        `App Store Connect will reject this, or the store will letterbox it inside a white card.`,
    );
  }
}

for (const [key, target] of Object.entries(SCREENSHOT_TARGETS)) {
  const list = byTarget.get(key);
  const state = `${list.length} image${list.length === 1 ? '' : 's'}`;
  if (list.length === 0) {
    if (target.required) {
      fail(`${target.label}: no screenshots. This size is required — Apple derives every smaller device from it.`);
    }
    console.log(`  ${target.label.padEnd(14)} —  none`);
    continue;
  }
  if (list.length < SCREENSHOT_RULES.min) {
    fail(
      `${target.label}: only ${state}. The App Store needs at least ${SCREENSHOT_RULES.min} to render the ` +
        `screenshot strip under a search result — below that the app appears in search with no visuals.`,
    );
  }
  if (list.length > SCREENSHOT_RULES.max) {
    fail(`${target.label}: ${state} exceeds Apple's max of ${SCREENSHOT_RULES.max}`);
  }
  console.log(`  ${target.label.padEnd(14)} —  ${state} @ ${target.width}x${target.height}`);
}

// ── previews ────────────────────────────────────────────────────────────────

console.log('\nApp previews');
if (videos.length === 0) {
  fail(
    'No app previews found. The listing will lead with a static screenshot and show no video in ' +
      'search results. Generate one with: npm run preview:video',
  );
} else {
  let probeOk = true;
  try {
    execFileSync(FFPROBE, ['-version'], { stdio: 'ignore' });
  } catch {
    probeOk = false;
    notes.push(`ffprobe not found (tried "${FFPROBE}") — previews could not be inspected`);
  }

  const previewCounts = new Map();
  for (const file of videos) {
    const match = targetFor(PREVIEW_TARGETS, file);
    if (!match) {
      fail(`${file}: filename doesn't start with a known device prefix`);
      continue;
    }
    const [key, target] = match;
    previewCounts.set(key, (previewCounts.get(key) ?? 0) + 1);
    if (!probeOk) continue;

    const p = probeVideo(join(DIR, file));
    if (!p.video) {
      fail(`${file}: no video stream`);
      continue;
    }
    if (!matchesTarget(target, p.video.width, p.video.height)) {
      fail(`${file}: ${p.video.width}x${p.video.height} — ${target.label} preview requires ${acceptedSizes(target)}`);
    }
    if (p.video.codec_name !== PREVIEW_RULES.videoCodec) {
      fail(`${file}: video codec is ${p.video.codec_name}, App Store Connect wants ${PREVIEW_RULES.videoCodec}`);
    }
    if (p.video.pix_fmt !== PREVIEW_RULES.pixelFormat) {
      fail(`${file}: pixel format is ${p.video.pix_fmt}, expected ${PREVIEW_RULES.pixelFormat}`);
    }
    if (p.duration < PREVIEW_RULES.minSeconds || p.duration > PREVIEW_RULES.maxSeconds) {
      fail(`${file}: ${p.duration.toFixed(1)}s — Apple requires ${PREVIEW_RULES.minSeconds}-${PREVIEW_RULES.maxSeconds}s`);
    }
    if (Math.abs(p.fps - PREVIEW_RULES.fps) > 1) {
      fail(`${file}: ${p.fps.toFixed(1)} fps, expected ~${PREVIEW_RULES.fps}`);
    }
    if (!p.audio) {
      fail(`${file}: no audio track — App Store Connect rejects video-only previews (mux silent AAC)`);
    }
    if (p.bytes > PREVIEW_RULES.maxBytes) {
      fail(`${file}: ${(p.bytes / 1e6).toFixed(0)} MB exceeds Apple's 500 MB limit`);
    }
    console.log(
      `  ${file.padEnd(26)} ${p.video.width}x${p.video.height}  ${p.duration.toFixed(1)}s  ` +
        `${p.fps.toFixed(0)}fps  ${p.video.codec_name}  ${(p.bytes / 1e6).toFixed(1)}MB`,
    );
  }

  for (const [key, count] of previewCounts) {
    if (count > PREVIEW_RULES.maxPerSize) {
      fail(`${PREVIEW_TARGETS[key].label}: ${count} previews exceeds Apple's max of ${PREVIEW_RULES.maxPerSize} per size`);
    }
  }
  for (const [key, target] of Object.entries(PREVIEW_TARGETS)) {
    if (!previewCounts.has(key)) {
      notes.push(`${target.label}: no app preview (optional, but the gallery leads with video when present)`);
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────

if (notes.length) {
  console.log('\nNotes');
  for (const n of notes) console.log(`  · ${n}`);
}

if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} — do not upload yet:`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}

const totalBytes = files.reduce((n, f) => n + statSync(join(DIR, f)).size, 0);
console.log(`\n✓ ${files.length} assets, ${(totalBytes / 1e6).toFixed(1)} MB — ready to upload.`);
