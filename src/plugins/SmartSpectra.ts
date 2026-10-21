import { registerPlugin } from '@capacitor/core';

/**
 * Why camera vitals are unavailable, when they are. Each reason needs different
 * copy, or none at all:
 *
 * - `web`            — no native layer. Worth a quiet "available in the iOS app".
 * - `not_installed`  — this build was compiled without the SmartSpectra package.
 *                      A build-configuration fact, not something the fighter
 *                      can act on: the feature stays hidden.
 * - `not_configured` — the package is present but the build carries no API key
 *                      or OAuth config. Hidden for the same reason.
 *
 * There is no "iOS too old" reason, deliberately. The SDK needs iOS 17, and
 * SPM will only link it into an app whose own minimum is 17 — so any build that
 * contains the SDK cannot be installed on an older iPhone in the first place.
 */
export type VitalsUnavailableReason = 'web' | 'not_installed' | 'not_configured';

export interface VitalsAvailability {
  supported: boolean;
  reason: VitalsUnavailableReason | null;
}

export interface VitalsMeasurement {
  /** Median pulse across the confident samples of the capture, bpm. */
  pulseRate: number;
  /**
   * rMSSD, ms, from the most trustworthy HRV window of the capture. Null when
   * the SDK never produced one — the capture was too short, or the signal too
   * poor for beat-to-beat timing. Pulse alone is not saved: the readiness
   * baseline is built on HRV.
   */
  hrvRmssd: number | null;
  /** Median breaths per minute, or null when the capture produced none. */
  breathingRate: number | null;
  /** Mean confidence of the samples used, 0..1. */
  confidence: number;
  /** Seconds of valid signal the result was computed from. */
  durationSec: number;
}

export interface MeasureOptions {
  /**
   * Seconds of valid signal to collect. The countdown only advances while the
   * SDK reports a usable face and light, so a fighter who moves out of frame
   * pauses it rather than diluting the result.
   */
  durationSec?: number;
}

/** Error codes `measure` rejects with, on `error.code`. */
export type VitalsErrorCode = 'CANCELLED' | 'NO_SIGNAL' | 'CAMERA_DENIED' | 'UNAVAILABLE' | 'SDK_ERROR';

export interface SmartSpectraPlugin {
  isSupported(): Promise<VitalsAvailability>;
  /**
   * Present the native capture sheet: camera preview, the SDK's own guidance
   * ("move closer", "more light") and a countdown. Resolves with the result
   * once enough valid signal is collected; rejects `CANCELLED` if the fighter
   * closes the sheet and `NO_SIGNAL` if no usable pulse arrived in time.
   *
   * The camera frames never reach the web layer — measurement runs on-device in
   * the SDK and only the numbers above come back.
   */
  measure(options?: MeasureOptions): Promise<VitalsMeasurement>;
}

/**
 * Camera-based vitals via the SmartSpectra SDK (Presage).
 *
 * The web fallback reports "unsupported" rather than throwing, so callers are
 * written once and run unchanged in the browser — the same shape as
 * `WatchBridge`. There is no browser SDK to fall back to: SmartSpectra ships
 * C++, Swift, Kotlin and Node bindings only, so a WebView cannot run it.
 */
export const SmartSpectra = registerPlugin<SmartSpectraPlugin>('SmartSpectra', {
  web: {
    isSupported: async () => ({ supported: false, reason: 'web' }),
    measure: async () => {
      throw Object.assign(new Error('Camera vitals are only available in the iOS app.'), {
        code: 'UNAVAILABLE' as VitalsErrorCode,
      });
    },
  },
});
