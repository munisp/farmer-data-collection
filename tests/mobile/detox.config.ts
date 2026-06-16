/**
 * Detox E2E Test Configuration
 * 
 * Configures device targets (iOS Simulator, Android Emulator) and
 * build commands for the FarmConnect mobile app.
 * 
 * Prerequisites:
 *   - Xcode 15+ (iOS) or Android SDK 34+ (Android)
 *   - EAS CLI: npm install -g eas-cli
 *   - Detox CLI: npm install -g detox-cli
 * 
 * Usage:
 *   npx detox build --configuration ios.sim.debug
 *   npx detox test --configuration ios.sim.debug
 */
import type { DetoxConfig } from 'detox';

const config: DetoxConfig = {
  testRunner: {
    args: {
      config: 'tests/mobile/jest.config.ts',
      maxWorkers: 1,
      _: ['tests/mobile/e2e/'],
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'mobile/ios/build/Build/Products/Debug-iphonesimulator/FarmConnect.app',
      build: 'cd mobile && npx expo run:ios --configuration Debug --no-install',
    },
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'mobile/ios/build/Build/Products/Release-iphonesimulator/FarmConnect.app',
      build: 'cd mobile && npx expo run:ios --configuration Release --no-install',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'mobile/android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd mobile && npx expo run:android --variant debug',
      testBinaryPath: 'mobile/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'mobile/android/app/build/outputs/apk/release/app-release.apk',
      build: 'cd mobile && npx expo run:android --variant release',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_7_API_34',
      },
    },
  },
  configurations: {
    'ios.sim.debug': {
      device: 'simulator',
      app: 'ios.debug',
    },
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
  },
};

export default config;
