# Mobile App Quick Start Guide

Get the Farmer Data Collection mobile app running on your device in 5 minutes.

---

## Prerequisites

**Required:**
- Node.js 18+ installed
- npm or yarn installed
- iOS device with Expo Go app OR Android device with Expo Go app

**Optional (for simulators):**
- Xcode (macOS only) for iOS Simulator
- Android Studio for Android Emulator

---

## Step 1: Install Dependencies

```bash
cd mobile
npm install
```

This installs all required packages including React Native, Expo, navigation, and native modules.

---

## Step 2: Start Development Server

```bash
npm start
```

This starts the Expo development server. You'll see:
- QR code in terminal
- Metro bundler running
- Development menu with options

**Alternative commands:**
```bash
npm run ios      # Open in iOS Simulator (macOS only)
npm run android  # Open in Android Emulator
```

---

## Step 3: Test on Your Phone

### iOS (iPhone/iPad)

1. **Install Expo Go**
   - Open App Store
   - Search "Expo Go"
   - Install app

2. **Connect to Same WiFi**
   - Ensure phone and computer are on same WiFi network

3. **Scan QR Code**
   - Open Expo Go app
   - Tap "Scan QR Code"
   - Scan QR code from terminal
   - App loads on your phone!

### Android

1. **Install Expo Go**
   - Open Play Store
   - Search "Expo Go"
   - Install app

2. **Connect to Same WiFi**
   - Ensure phone and computer are on same WiFi network

3. **Scan QR Code**
   - Open Expo Go app
   - Tap "Scan QR Code"
   - Scan QR code from terminal
   - App loads on your phone!

---

## Step 4: Test Key Features

### Test Authentication
1. Open app on device
2. Tap "Login"
3. Enter test credentials:
   - Email: `test@farmer.com`
   - Password: `password123`
4. Tap "Login" button
5. Should navigate to Home screen

### Test Camera (Harvest Photos)
1. Navigate to "Harvests" tab
2. Tap "+" button (Create Harvest)
3. Tap "Take Photo" button
4. Grant camera permission when prompted
5. Take photo of anything
6. Photo appears in form

### Test GPS (Field Location)
1. In Harvest Create screen
2. Tap "Get Current Location" button
3. Grant location permission when prompted
4. Location coordinates appear
5. Map shows your location

### Test Biometric Auth
1. Logout from app
2. On Login screen, tap "Use Biometric"
3. Grant biometric permission when prompted
4. Use Face ID / Touch ID / Fingerprint
5. Should login automatically

### Test Offline Mode
1. Enable Airplane Mode on device
2. App should still work
3. Create harvest or expense
4. Data saved locally
5. Disable Airplane Mode
6. Data syncs automatically

---

## Step 5: Development Tips

### Hot Reload
- Save any file in `mobile/src/`
- App automatically reloads on device
- No need to restart server

### Shake for Dev Menu
- Shake device to open developer menu
- Options: Reload, Debug, Performance Monitor

### View Logs
- Logs appear in terminal where you ran `npm start`
- Use `console.log()` for debugging

### Clear Cache
If app behaves strangely:
```bash
npm start -- --clear
```

---

## Common Issues

### Issue: QR Code Won't Scan
**Solution:** 
- Ensure phone and computer on same WiFi
- Try typing URL manually in Expo Go
- Check firewall isn't blocking connection

### Issue: "Network request failed"
**Solution:**
- Backend server must be running
- Update API URL in `mobile/src/utils/constants.ts`
- Check network connection

### Issue: Camera Permission Denied
**Solution:**
- Go to device Settings
- Find "Expo Go" app
- Enable Camera permission
- Restart app

### Issue: Location Permission Denied
**Solution:**
- Go to device Settings
- Find "Expo Go" app
- Enable Location permission
- Restart app

### Issue: App Crashes on Startup
**Solution:**
- Check terminal for error logs
- Clear cache: `npm start -- --clear`
- Reinstall dependencies: `rm -rf node_modules && npm install`

---

## Next Steps

### For Development
- Edit screens in `mobile/src/screens/`
- Add components in `mobile/src/components/`
- Modify navigation in `mobile/src/navigation/`
- Update API calls in `mobile/src/services/`

### For Testing
- Follow `TESTING_GUIDE.md` for comprehensive testing
- Test all 22 screens
- Test offline functionality
- Test on multiple devices

### For Production Build
- Follow `BUILD_DEPLOY_GUIDE.md`
- Create EAS account
- Build for iOS and Android
- Submit to app stores

---

## Useful Commands

```bash
# Start development server
npm start

# Start with clear cache
npm start -- --clear

# Open iOS Simulator (macOS only)
npm run ios

# Open Android Emulator
npm run android

# Install dependencies
npm install

# Build for development
npm run build:dev:ios
npm run build:dev:android

# Build for production
npm run build:prod:all
```

---

## Project Structure

```
mobile/
├── App.tsx                 # Main app entry point
├── src/
│   ├── screens/           # All screen components
│   │   ├── auth/          # Login, Register
│   │   ├── harvests/      # Harvest CRUD
│   │   ├── expenses/      # Expense CRUD
│   │   ├── marketplace/   # Marketplace screens
│   │   ├── ml/            # ML prediction screens
│   │   └── profile/       # Profile screens
│   ├── components/        # Reusable UI components
│   │   ├── ui/            # Base UI (Button, Input, Card)
│   │   └── shared/        # Shared components
│   ├── navigation/        # Navigation setup
│   ├── services/          # API, Auth, Database, Sync
│   ├── stores/            # Zustand state management
│   ├── hooks/             # Custom React hooks
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── assets/                # Images, icons, fonts
├── app.json              # Expo configuration
├── eas.json              # EAS Build configuration
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

---

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [React Navigation](https://reactnavigation.org/)
- [Testing Guide](./TESTING_GUIDE.md)
- [Build & Deploy Guide](./BUILD_DEPLOY_GUIDE.md)
- [Analytics & Monitoring Guide](./ANALYTICS_MONITORING_GUIDE.md)

---

## Support

For issues or questions:
1. Check this guide first
2. Check `TESTING_GUIDE.md` for troubleshooting
3. Check error logs in terminal
4. Review Expo documentation

---

## Congratulations! 🎉

You now have the mobile app running on your device. Start exploring the features and testing functionality!
