// Apple App Store asset specification — the single source of truth for every
// pixel size this repo produces or checks.
//
// Both generators (screenshots.mjs, app-preview.mjs) and the verifier
// (verify-appstore-assets.mjs) import from here, so a size can never drift
// between "what we render" and "what we check". If Apple changes the spec,
// change it in this file only.
//
// Reference: App Store Connect → Reference → Screenshot specifications and
// App preview specifications (developer.apple.com/help/app-store-connect/
// reference/screenshot-specifications).
//
// ── Why exact pixel sizes matter ────────────────────────────────────────────
// App Store Connect rejects (or silently letterboxes) images whose dimensions
// aren't an exact match for the display slot they're uploaded into. A
// letterboxed screenshot renders with white bars inside the product-page card,
// and an incomplete iPhone set suppresses the 3-up screenshot strip that the
// App Store shows under each search result. Rendering at exactly `width` ×
// `height` below is what keeps both from happening.

/**
 * Screenshot display targets.
 *
 * `viewport` × `scale` always equals `width` × `height` — we render the page at
 * a sane CSS-pixel size and let the device pixel ratio produce the exact PNG
 * dimensions Apple wants, rather than laying out a 1320px-wide "phone".
 *
 * `alt` lists the other pixel sizes Apple accepts for the same slot. We never
 * render those, but the verifier accepts them so hand-made assets still pass.
 *
 * `required` marks the two slots Apple has mandated since April 2025: a 6.9"
 * iPhone set, plus a 13" iPad set for any app that ships an iPad build (this
 * one does — TARGETED_DEVICE_FAMILY = "1,2"). Every other iPhone/iPad size is
 * derived by Apple from these, which is why we no longer render 6.7".
 */
export const SCREENSHOT_TARGETS = {
  'iphone-6.9': {
    label: 'iPhone 6.9"',
    width: 1320,
    height: 2868,
    alt: [[1290, 2796]],
    viewport: { width: 440, height: 956 },
    scale: 3,
    mobile: true,
    required: true,
    // Filename prefix. Kept stable so an existing App Store Connect upload
    // order (which deliver derives from sorted filenames) doesn't shuffle.
    prefix: 'iphone69',
  },
  'ipad-13': {
    label: 'iPad 13"',
    width: 2064,
    height: 2752,
    alt: [[2048, 2732]],
    viewport: { width: 1032, height: 1376 },
    scale: 2,
    mobile: false,
    required: true,
    prefix: 'ipad13',
  },
};

/**
 * App preview (video) targets.
 *
 * Apple accepts 886×1920 for both the 6.9" and 6.5" iPhone slots, so one render
 * covers the modern tall-iPhone lineup. 1080×1920 is the documented alternate.
 *
 * ── How `layoutWidth` produces a pixel-exact, sharp recording ───────────────
 * Chromium's screencast — which is what Playwright's recordVideo consumes —
 * captures the *composited* surface at CSS-pixel resolution and ignores
 * deviceScaleFactor. Ask it for a frame larger than the viewport and Playwright
 * pads the difference with grey instead of scaling, so the app ends up in the
 * top-left corner of the video.
 *
 * The fix is to size the browser viewport to the output pixels and let the
 * page's *viewport meta* set the layout width instead: with mobile emulation
 * on, `<meta name="viewport" content="width=443">` in an 886px-wide window
 * makes Chromium lay out at 443 CSS px and composite at a page scale of 2.
 * Rasterization happens at that scale, so text stays sharp and the recording is
 * natively `width` × `height` with nothing to pad or resample.
 *
 * `layoutWidth` must therefore keep the same aspect ratio as `width`/`height`,
 * and should match the device's real logical width so the capture reflects the
 * layout users actually get (443×960 phone, 1032×1376 iPad).
 */
export const PREVIEW_TARGETS = {
  'iphone-6.9': {
    label: 'iPhone 6.9"',
    width: 886,
    height: 1920,
    alt: [[1080, 1920]],
    layoutWidth: 443,
    prefix: 'iphone69',
  },
  'ipad-13': {
    label: 'iPad 13"',
    width: 1200,
    height: 1600,
    alt: [[1600, 1200]],
    layoutWidth: 1032,
    prefix: 'ipad13',
  },
};

/** Constraints App Store Connect enforces on an uploaded app preview. */
export const PREVIEW_RULES = {
  minSeconds: 15,
  maxSeconds: 30,
  /** Apple documents 30 fps; we transcode to exactly that. */
  fps: 30,
  /** H.264 High profile, yuv420p. ProRes 422 HQ is also accepted, but is huge. */
  videoCodec: 'h264',
  pixelFormat: 'yuv420p',
  /**
   * ASC has historically rejected videos with no audio track, so we mux a
   * silent AAC stream rather than shipping a video-only file.
   */
  audioCodec: 'aac',
  maxBytes: 500 * 1024 * 1024,
  /** Apple allows up to 3 previews per display size. */
  maxPerSize: 3,
  extensions: ['.mp4', '.mov', '.m4v'],
};

/** Constraints on a screenshot set for one display size. */
export const SCREENSHOT_RULES = {
  /**
   * Apple's hard minimum is 1, but the App Store only renders the 3-up
   * screenshot strip under a search result when the set has at least 3
   * portrait images. Fewer than 3 and the app shows up in search with no
   * visuals at all, so we treat 3 as the real floor.
   */
  min: 3,
  max: 10,
  extensions: ['.png', '.jpg', '.jpeg'],
};

/** Locale directory that `deliver` reads assets from. */
export const LOCALE = 'en-US';

/**
 * True when `[w, h]` is a size Apple accepts for `target` (canonical or alt).
 */
export function matchesTarget(target, w, h) {
  if (w === target.width && h === target.height) return true;
  return (target.alt ?? []).some(([aw, ah]) => w === aw && h === ah);
}

/** Human-readable list of every size Apple accepts for `target`. */
export function acceptedSizes(target) {
  return [[target.width, target.height], ...(target.alt ?? [])]
    .map(([w, h]) => `${w}x${h}`)
    .join(' or ');
}
