import { registerPlugin } from '@capacitor/core';

export interface RevenueCatPackage {
  identifier: string;
  productIdentifier: string;
  packageType: string;
  localizedPrice: string;
  productTitle: string;
}

export interface RevenueCatPlugin {
  getCustomerInfo(): Promise<{ isPro: boolean; tier: string }>;
  /** Resolves with the post-paywall entitlement state once the sheet is dismissed
   *  (purchase, restore, or cancel). Rejects only if the sheet can't be shown. */
  presentPaywall(): Promise<{ isPro: boolean; tier: string }>;
  presentCustomerCenter(): Promise<void>;
  restorePurchases(): Promise<{ isPro: boolean; tier: string }>;
  /** Lists the current offering's packages so the app's own upgrade screen can
   *  drive a direct purchase. Empty list when no offering is configured. */
  getPackages(): Promise<{ packages: RevenueCatPackage[] }>;
  /** Purchases one package by identifier straight through StoreKit — no
   *  RevenueCat paywall sheet in between. Resolves with the post-purchase
   *  entitlement state plus a `cancelled` flag for a backed-out purchase. */
  purchasePackage(options: { packageId: string }): Promise<{ isPro: boolean; tier: string; cancelled: boolean }>;
  /** Ties the RevenueCat subscriber to the signed-in Supabase account so webhook
   *  events carry an attributable user id (server-verified entitlements).
   *  Resolves with the identified account's entitlements — a subscription bought
   *  on another device under this account surfaces here. */
  logIn(options: { appUserId: string }): Promise<{ isPro: boolean; tier: string }>;
  /** Detaches the account (returns to an anonymous subscriber). Safe to call
   *  when already anonymous — it's a no-op then. */
  logOut(): Promise<void>;
  /** What this build's purchase stack actually looks like — whether the SDK
   *  configured, what kind of API key it got, and whether an offering can be
   *  fetched. Powers Settings → Diagnostics. Never rejects. */
  getDiagnostics(): Promise<RevenueCatDiagnostics>;
}

export interface RevenueCatDiagnostics {
  configured: boolean;
  /** `appl_`, `test_`, `goog_`, `none`, … — the kind of key, never the key. */
  keyPrefix: string;
  /** Empty when the SDK configured cleanly. */
  configurationError: string;
  offeringsStatus: string;
  appUserId?: string;
  anonymous?: boolean;
}

export const RevenueCat = registerPlugin<RevenueCatPlugin>('RevenueCat', {
  web: {
    getCustomerInfo: async () => ({ isPro: false, tier: 'free' }),
    presentPaywall: async () => ({ isPro: false, tier: 'free' }),
    presentCustomerCenter: async () => {},
    restorePurchases: async () => ({ isPro: false, tier: 'free' }),
    getPackages: async () => ({ packages: [] }),
    purchasePackage: async () => ({ isPro: false, tier: 'free', cancelled: false }),
    logIn: async () => ({ isPro: false, tier: 'free' }),
    logOut: async () => {},
    getDiagnostics: async () => ({
      configured: false,
      keyPrefix: 'none',
      configurationError: 'Purchases run through the App Store, so they are only available in the iOS app.',
      offeringsStatus: 'n/a on web',
    }),
  },
});
