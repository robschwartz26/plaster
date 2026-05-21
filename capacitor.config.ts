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
      launchShowDuration: 400,
      launchAutoHide: true,
      launchFadeOutDuration: 0,
      backgroundColor: '#0a0a0a',
      showSpinner: false,
    },
  },
};

export default config;
