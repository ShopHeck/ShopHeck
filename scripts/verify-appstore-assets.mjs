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
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
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
    if (readSync(fd, buf, 0, 24, 0) < 24) return null;
    if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    closeSync(fd);
  }
}

/**
 * Read a JPEG's dimensions by walking the segment markers to the frame header.
 *
 * Apple accepts JPEG screenshots, so hand-made assets legitimately turn up with
 * a .jpg extension — and they need exactly the same dimension check as a PNG.
 * Dimensions live in the SOFn segment (any marker in 0xC0-0xCF except DHT
 * 0xC4, JPG 0xC8, and DAC 0xCC, which share the range but aren't frame
 * headers) as: length(2) precision(1) height(2) width(2).
 */
function jpegSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let pos = 2;
  while (pos + 1 < buf.length) {
    if (buf[pos] !== 0xff) return null; // desynced — not a well-formed stream
    let marker = buf[pos + 1];
    pos += 2;
    // 0xFF is a legal fill byte before the real marker.
    while (marker === 0xff && pos < buf.length) marker = buf[pos++];

    // Standalone markers carry no payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    // Start-of-scan or end-of-image: entropy-coded data from here, no SOF ahead.
    if (marker === 0xda || marker === 0xd9) return null;

    if (pos + 2 > buf.length) return null;
    const length = buf.readUInt16BE(pos);
    if (length < 2) return null;

    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      if (pos + 7 > buf.length) return null;
      return { height: buf.readUInt16BE(pos + 3), width: buf.readUInt16BE(pos + 5) };
    }
    pos += length;
  }
  return null;
}

/** Dimensions of any screenshot format Apple accepts, or null if unreadable. */
function imageSize(file) {
  return extname(file).toLowerCase() === '.png' ? pngSize(file) : jpegSize(file);
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
    // Capture stderr rather than letting it through, so a bad file reports via
    // the problem list instead of printing ffprobe noise above it.
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
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

  // JPEG is a valid App Store format, so it gets a nudge rather than a pass —
  // it still has to clear the same dimension check as a PNG.
  if (extname(file).toLowerCase() !== '.png') {
    notes.push(`${file}: JPEG is accepted, but PNG avoids recompression artifacts`);
  }
  const size = imageSize(join(DIR, file));
  if (!size) {
    fail(`${file}: could not read image dimensions — the file is corrupt or not a real PNG/JPEG`);
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
  // Not being able to inspect a preview is a verification failure, not a note.
  // Downgrading it to a warning would let this script print "ready to upload"
  // over videos nothing has looked at — the precise outcome it exists to stop.
  let probeOk = true;
  try {
    execFileSync(FFPROBE, ['-version'], { stdio: 'ignore' });
  } catch {
    probeOk = false;
    fail(
      `ffprobe not found (tried "${FFPROBE}") — ${videos.length} preview(s) present but none could be ` +
        'checked for size, codec, duration, or audio. Install ffmpeg (macOS: brew install ffmpeg) or ' +
        'set FFPROBE_PATH.',
    );
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

    let p;
    try {
      p = probeVideo(join(DIR, file));
    } catch (err) {
      // A file ffprobe can't parse is unshippable, and it must not fall through
      // to an unhandled exception either.
      fail(`${file}: ffprobe could not read this file — it is corrupt or not a video (${err.message.trim().split('\n').pop()})`);
      continue;
    }
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
