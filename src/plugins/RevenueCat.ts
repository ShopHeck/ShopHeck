import { registerPlugin } from '@capacitor/core';

export interface RevenueCatPlugin {
  getCustomerInfo(): Promise<{ isPro: boolean; tier: string }>;
  /** Resolves with the post-paywall entitlement state once the sheet is dismissed
   *  (purchase, restore, or cancel). Rejects only if the sheet can't be shown. */
  presentPaywall(): Promise<{ isPro: boolean; tier: string }>;
  presentCustomerCenter(): Promise<void>;
  restorePurchases(): Promise<{ isPro: boolean; tier: string }>;
}

export const RevenueCat = registerPlugin<RevenueCatPlugin>('RevenueCat', {
  web: {
    getCustomerInfo: async () => ({ isPro: false, tier: 'free' }),
    presentPaywall: async () => ({ isPro: false, tier: 'free' }),
    presentCustomerCenter: async () => {},
    restorePurchases: async () => ({ isPro: false, tier: 'free' }),
  },
});
