import { registerPlugin } from '@capacitor/core';

export interface AppReviewPlugin {
  /** Asks StoreKit for the in-app rating sheet. Apple decides whether it
   *  actually appears (~3/year cap), so this always resolves — shown or not.
   *  Call it only at earned moments, via utils/appReview.maybeRequestReview. */
  requestReview(): Promise<void>;
}

export const AppReview = registerPlugin<AppReviewPlugin>('AppReview', {
  web: {
    requestReview: async () => {},
  },
});
