import { registerPlugin } from '@capacitor/core';

export interface RevenueCatPlugin {
  getCustomerInfo(): Promise<{ isPro: boolean }>;
  presentPaywall(): Promise<void>;
  presentCustomerCenter(): Promise<void>;
  restorePurchases(): Promise<{ isPro: boolean }>;
}

export const RevenueCat = registerPlugin<RevenueCatPlugin>('RevenueCat', {
  web: {
    getCustomerInfo: async () => ({ isPro: false }),
    presentPaywall: async () => {},
    presentCustomerCenter: async () => {},
    restorePurchases: async () => ({ isPro: false }),
  },
});
