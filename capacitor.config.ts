import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for packaging the PWA as a native app.
 *
 * Setup steps (run once):
 *   npm install @capacitor/core @capacitor/cli @capacitor/app @capacitor/status-bar @capacitor/splash-screen
 *   npx cap add ios      (requires Mac + Xcode 15+)
 *   npx cap add android  (requires Android Studio)
 *
 * Build workflow:
 *   npm run build && npx cap sync
 *   npx cap open ios      → Archive → upload to App Store Connect
 *   npx cap open android  → Generate Signed Bundle → upload to Google Play Console
 */
const config: CapacitorConfig = {
  appId: 'app.fightcamptraining',
  appName: 'Fight Camp Training',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#0a0a0a',
  },
};

export default config;
