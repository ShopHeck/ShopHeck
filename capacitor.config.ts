import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the React/Vite PWA as a native iOS (and eventually Android) app.
 *
 * One-time setup (Mac required for iOS):
 *   npx cap add ios          — creates the Xcode project
 *   npx cap add android      — future: creates the Android Studio project
 *
 * Daily build workflow:
 *   npm run cap:sync         — builds web + syncs plugins to native project
 *   npm run cap:ios          — build + sync + open Xcode
 *
 * App Store submission:
 *   In Xcode: Product → Archive → Distribute App → App Store Connect
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
    contentInset: 'always',    // Respect safe-area (notch / home indicator)
    allowsLinkPreview: false,
    scrollEnabled: true,       // WKWebView scrolling enabled; rubber-band is suppressed via CSS overscroll-behavior on body
  },

  android: {
    backgroundColor: '#0a0a0a',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#0a0a0a',
      iosSpinnerStyle: 'large',
      spinnerColor: '#f97316',   // brand orange
      showSpinner: true,
    },
    StatusBar: {
      style: 'DARK',             // White text / icons on dark background
      backgroundColor: '#0a0a0a',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',          // Resize the WKWebView itself — fixed elements naturally clear the keyboard
      resizeOnFullScreen: true,
      style: 'dark',
    },
  },
};

export default config;
