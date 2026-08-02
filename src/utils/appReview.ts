import { Capacitor } from '@capacitor/core';
import { AppReview } from '../plugins/AppReview';

const ASKED_KEY = 'fightcamp_review_asked_at';
const MIN_GAP_DAYS = 120;

/** The earned moments that justify a rating ask (audit P0-4: review asks live
 *  at highs the user just experienced, never at cold start). */
export type ReviewMoment = 'belt' | 'made_weight';

/**
 * Ask iOS for the rating sheet at an earned moment. Apple enforces its own
 * system-wide cap (~3 shown per year), but we self-throttle far below the
 * request rate that cap tolerates so the ask only ever rides a real high —
 * a belt promotion or hitting fight weight — instead of becoming wallpaper.
 * No-op on web; never throws (a review ask must not break a celebration).
 */
export async function maybeRequestReview(_moment: ReviewMoment): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const last = Number(localStorage.getItem(ASKED_KEY) ?? 0);
    if (Date.now() - last < MIN_GAP_DAYS * 24 * 60 * 60 * 1000) return;
    // Stamped before the call so a crash loop can't burn Apple's yearly cap.
    localStorage.setItem(ASKED_KEY, String(Date.now()));
    await AppReview.requestReview();
  } catch {
    /* noop */
  }
}
