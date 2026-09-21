import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stockwatch.app',
  appName: '看盘股票',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0e1117',
    allowMixedContent: false,
  },
};

export default config;
