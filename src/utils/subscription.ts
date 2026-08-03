import { Capacitor } from '@capacitor/core';
import { RevenueCat } from '../plugins/RevenueCat';
import type { SubscriptionState } from '../types';

const SUB_KEY = 'fightcamp_subscription';

// DEV: set to 'coach_pro' for testing all features — flip back to 'free' before launch
export const DEFAULT_SUBSCRIPTION: SubscriptionState = {
  tier: 'free',
  expiresAt: null,
  source: 'none',
};

export function loadSubscription(): SubscriptionState {
  try {
    const raw = localStorage.getItem(SUB_KEY);
    if (!raw) return DEFAULT_SUBSCRIPTION;
    return { ...DEFAULT_SUBSCRIPTION, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SUBSCRIPTION;
  }
}

export function saveSubscription(s: SubscriptionState): void {
  try { localStorage.setItem(SUB_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

/**
 * Comp ("complimentary") access — founder / internal-test accounts that get the
 * full Coach Pro tier for free, tied to their signed-in account email. The owner
 * account is built in; add more testers via VITE_COMP_PRO_EMAILS (comma-separated)
 * with no code change. Safe even though entitlement checks are client-side: a
 * person must actually authenticate as one of these emails (via Supabase) for it
 * to apply, and it grants nothing to anyone else.
 */
const COMP_PRO_EMAILS: ReadonlySet<string> = new Set(
  ['michaelheckert@heckholdings.com', ...(import.meta.env.VITE_COMP_PRO_EMAILS ?? '').split(',')]
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Lifetime Coach Pro granted to comp accounts (no expiry = perpetual). */
export const COMP_SUBSCRIPTION: SubscriptionState = {
  tier: 'coach_pro',
  expiresAt: null,
  source: 'comp',
};

/** True when this account email is on the comp list and entitled to Coach Pro. */
export function isCompEmail(email: string | null | undefined): boolean {
  return !!email && COMP_PRO_EMAILS.has(email.trim().toLowerCase());
}

export function isPro(s: SubscriptionState): boolean {
  if (s.tier === 'free') return false;
  if (!s.expiresAt) return true; // no expiry = perpetual
  return new Date(s.expiresAt) > new Date();
}

export function isCoachPro(s: SubscriptionState): boolean {
  return s.tier === 'coach_pro' && isPro(s);
}

/**
 * Checks the user's active entitlements via RevenueCat (native iOS only).
 * Returns { isPro, tier } when RevenueCat responds, null when it errors
 * (network unavailable, SDK not yet configured) so callers leave state
 * unchanged rather than accidentally downgrading an offline user.
 */
export async function checkNativeSubscription(): Promise<{ isPro: boolean; tier: string } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await RevenueCat.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Ties this device's RevenueCat subscriber to the signed-in Supabase account
 * (native iOS only) — the piece that makes App Store purchases attributable
 * server-side, because webhook events then carry the Supabase user id. Pass
 * null on sign-out to detach (a no-op when already anonymous).
 *
 * Returns the identified account's entitlements when signing in (so a
 * subscription bought on another device under this account can be applied),
 * or null on web / sign-out / error — callers leave state unchanged then.
 */
export async function identifyNativeSubscriber(
  userId: string | null,
): Promise<{ isPro: boolean; tier: string } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    if (userId) return await RevenueCat.logIn({ appUserId: userId });
    await RevenueCat.logOut();
    return null;
  } catch {
    return null;
  }
}

/**
 * Consume Stripe's success-return parameters without granting any local access.
 * Entitlements are applied only after the signed webhook records a verified
 * subscription in Supabase. Returns true so AppContext can briefly poll for the
 * webhook row and give a completed checkout an immediate unlock when it lands.
 */
export function processStripeReturn(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get('tier');
    const session = params.get('stripe_session');
    const validTier = tier === 'fighter_pro' || tier === 'coach_pro';

    if (!validTier || !session) return false;

    const url = new URL(window.location.href);
    url.searchParams.delete('tier');
    url.searchParams.delete('stripe_session');
    window.history.replaceState({}, '', url.toString());
    return true;
  } catch {
    return false;
  }
}
