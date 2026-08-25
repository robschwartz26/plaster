import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plaster.the.wall.app',
  appName: 'plaster',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    allowsInlineMediaPlayback: true,
  },
  plugins: {
    // Capgo OTA: web-bundle updates download in the background on app open
    // and apply next launch — no App Review for JS-level changes. autoUpdate
    // pulls from the app's default channel; a failed update auto-rolls-back
    // (requires the notifyAppReady() call in main.tsx).
    //
    // statsUrl: "" disables Capgo's telemetry (update-lifecycle events, crash /
    // ANR / memory / WebView health signals). Update *delivery* still works —
    // only the analytics reporting is turned off — so we don't collect that data
    // and don't have to disclose it on the App Store privacy label.
    CapacitorUpdater: {
      autoUpdate: true,
      statsUrl: '',
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      launchFadeOutDuration: 0,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
      iosSplashResourceName: 'Splash',
    },
  },
};

export default config;
