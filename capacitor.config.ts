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
