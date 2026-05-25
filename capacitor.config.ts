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
