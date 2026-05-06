import { Capacitor } from '@capacitor/core';
import { RevenueCat } from '../plugins/RevenueCat';
import type { SubscriptionState, SubscriptionTier } from '../types';

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
 * Returns true/false when RevenueCat responds, null when it errors (network
 * unavailable, SDK not yet configured, etc.) so callers can skip state changes
 * rather than accidentally downgrading an offline user.
 */
export async function checkNativeSubscription(): Promise<boolean | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { isPro } = await RevenueCat.getCustomerInfo();
    return isPro;
  } catch {
    return null;
  }
}

/**
 * Reads Stripe Payment Link return params from the URL, writes a 30-day soft
 * unlock to localStorage, and strips the params from the URL.
 * Returns the new subscription state if a valid return was detected, else null.
 */
export function processStripeReturn(): SubscriptionState | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const tier = params.get('tier') as SubscriptionTier | null;
    const session = params.get('stripe_session');

    if (!tier || !session) return null;
    if (!['fighter_pro', 'coach_pro'].includes(tier)) return null;

    // 30-day soft unlock (client-side only — acceptable for MVP)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const sub: SubscriptionState = { tier, expiresAt, source: 'stripe_payment_link' };
    saveSubscription(sub);

    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('tier');
    url.searchParams.delete('stripe_session');
    window.history.replaceState({}, '', url.toString());

    return sub;
  } catch {
    return null;
  }
}
