import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plaster.the.wall.app',
  appName: 'plaster',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    allowsInlineMediaPlayback: true,
  },
  android: {
    // Let @capacitor-community/safe-area own edge-to-edge insets instead of
    // Capacitor core margin-adjusting the WebView (which insets it below the
    // system bars and leaves a bare white strip). Required for the plugin to work.
    adjustMarginsForEdgeToEdge: 'disable',
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
    // @capacitor-community/safe-area — polyfills env(safe-area-inset-*) on Android
    // (WebView reports 0) so edge-to-edge works like iOS. Cap v8 requires the
    // SystemBars insets handoff disabled so this plugin owns it. statusBar content
    // style is set dynamically per theme (see useTheme); DEFAULT is the initial.
    SystemBars: {
      insetsHandling: 'disable',
    },
    SafeArea: {
      statusBarStyle: 'DEFAULT',
      navigationBarStyle: 'DEFAULT',
    },
  },
};

export default config;
