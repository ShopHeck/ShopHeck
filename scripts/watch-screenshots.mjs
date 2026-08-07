#!/usr/bin/env node
// Apple Watch App Store screenshots — build, launch with -shot scenes, capture.
//
// Output (exact ASC size, one family for all locales):
//   ios/fastlane/screenshots/en-US/watch-01-ready.png
//   ios/fastlane/screenshots/en-US/watch-02-work.png
//   ios/fastlane/screenshots/en-US/watch-03-rest.png
//   ios/fastlane/screenshots/en-US/watch-04-done.png
//
// Default: 416×496 (Apple Watch Series 10/11 46mm slot).
// Override: WATCH_SIM="Apple Watch Ultra 3 (49mm)" WATCH_W=422 WATCH_H=514
//
//   node scripts/watch-screenshots.mjs
//
// Requires Xcode + a watchOS Simulator runtime.

import { spawnSync, execFileSync } from 'node:child_process';
import {
  mkdirSync, existsSync, copyFileSync, unlinkSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'ios', 'fastlane', 'screenshots', 'en-US');
const DERIVED = join(tmpdir(), 'FightCampWatchShot');
const BUNDLE_ID = 'app.fightcamptraining.watchkitapp';
const APP = join(DERIVED, 'Build/Products/Debug-watchsimulator/FightCampWatch.app');

const SIM_NAME = process.env.WATCH_SIM || 'Apple Watch Series 11 (46mm)';
const TARGET_W = Number(process.env.WATCH_W || 416);
const TARGET_H = Number(process.env.WATCH_H || 496);

const SCENES = [
  { arg: 'ready', file: 'watch-01-ready.png' },
  { arg: 'work', file: 'watch-02-work.png' },
  { arg: 'rest', file: 'watch-03-rest.png' },
  { arg: 'done', file: 'watch-04-done.png' },
];

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0 && !opts.allowFail) {
    const err = (r.stderr || r.stdout || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status}): ${err.slice(-800)}`);
  }
  return r;
}

function simctl(...args) {
  return sh('xcrun', ['simctl', ...args]);
}

function udidFor(name) {
  const list = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }),
  );
  for (const devices of Object.values(list.devices)) {
    for (const d of devices) {
      if (d.name === name && d.isAvailable !== false) return d.udid;
    }
  }
  throw new Error(`Simulator not found: ${name}`);
}

function pngDims(file) {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Force exact ASC pixel size with sips (center-crop when aspect differs). */
function fitToAsc(src, dest) {
  const dims = pngDims(src);
  if (!dims) throw new Error(`Not a PNG: ${src}`);
  if (dims.w === TARGET_W && dims.h === TARGET_H) {
    copyFileSync(src, dest);
    return;
  }

  const tmp = join(tmpdir(), `watch-shot-${process.pid}-scaled.png`);
  const scale = Math.max(TARGET_W / dims.w, TARGET_H / dims.h);
  const sw = Math.max(TARGET_W, Math.round(dims.w * scale));
  const shh = Math.max(TARGET_H, Math.round(dims.h * scale));

  // sips -z height width
  sh('sips', ['-z', String(shh), String(sw), src, '--out', tmp]);

  const cropX = Math.max(0, Math.floor((sw - TARGET_W) / 2));
  const cropY = Math.max(0, Math.floor((shh - TARGET_H) / 2));
  sh('sips', [
    '--cropToHeightWidth', String(TARGET_H), String(TARGET_W),
    '--cropOffset', String(cropY), String(cropX),
    tmp, '--out', dest,
  ]);
  try { unlinkSync(tmp); } catch { /* ignore */ }

  const final = pngDims(dest);
  if (!final || final.w !== TARGET_W || final.h !== TARGET_H) {
    sh('sips', ['-z', String(TARGET_H), String(TARGET_W), src, '--out', dest]);
  }
}

console.log(`Apple Watch screenshots → ${TARGET_W}×${TARGET_H} (${SIM_NAME})\n`);

const udid = udidFor(SIM_NAME);
console.log(`Simulator: ${udid}`);

sh('xcrun', ['simctl', 'boot', udid], { allowFail: true });
// Wait until boot completes
sh('xcrun', ['simctl', 'bootstatus', udid, '-b'], { allowFail: true });

console.log('Building FightCampWatch…');
sh('xcodebuild', [
  '-project', join(ROOT, 'ios/App/App.xcodeproj'),
  '-scheme', 'FightCampWatch',
  '-configuration', 'Debug',
  '-destination', `platform=watchOS Simulator,id=${udid}`,
  '-derivedDataPath', DERIVED,
  'CODE_SIGNING_ALLOWED=NO',
  'build',
], { inherit: true });

if (!existsSync(APP)) throw new Error(`App missing at ${APP}`);

mkdirSync(OUT, { recursive: true });

sh('xcrun', ['simctl', 'uninstall', udid, BUNDLE_ID], { allowFail: true });
simctl('install', udid, APP);

let n = 0;
for (const scene of SCENES) {
  console.log(`\nScene: ${scene.arg}`);
  sh('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID], { allowFail: true });
  simctl('launch', udid, BUNDLE_ID, '-shot', scene.arg);
  // Let SwiftUI apply the frozen scene
  execFileSync('sleep', ['1.8']);
  const raw = join(tmpdir(), `watch-raw-${scene.arg}-${process.pid}.png`);
  simctl('io', udid, 'screenshot', raw);
  const dest = join(OUT, scene.file);
  fitToAsc(raw, dest);
  const d = pngDims(dest);
  console.log(`  ✓ ${scene.file} (${d?.w}×${d?.h})`);
  n++;
  try { unlinkSync(raw); } catch { /* ignore */ }
}

console.log(`\nDone — ${n} Watch screenshots in ios/fastlane/screenshots/en-US/`);
console.log(`Upload: drag watch-*.png into App Store Connect → Apple Watch (${TARGET_W}×${TARGET_H}).`);
