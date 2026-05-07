import { registerPlugin } from '@capacitor/core';

export interface RevenueCatPlugin {
  getCustomerInfo(): Promise<{ isPro: boolean; tier: string }>;
  presentPaywall(): Promise<void>;
  presentCustomerCenter(): Promise<void>;
  restorePurchases(): Promise<{ isPro: boolean; tier: string }>;
}

export const RevenueCat = registerPlugin<RevenueCatPlugin>('RevenueCat', {
  web: {
    getCustomerInfo: async () => ({ isPro: false, tier: 'free' }),
    presentPaywall: async () => {},
    presentCustomerCenter: async () => {},
    restorePurchases: async () => ({ isPro: false, tier: 'free' }),
  },
});
