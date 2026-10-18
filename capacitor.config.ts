import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.foodlenscare.app',
  appName: '食护家',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false, loggingBehavior: 'none' },
  plugins: { CapacitorHttp: { enabled: false }, CapacitorCookies: { enabled: false } },
};
export default config;
