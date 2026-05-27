# Build and Deployment Guide

Complete guide for building and deploying the Farmer Data Collection mobile app to iOS App Store and Google Play Store.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [EAS Build Setup](#eas-build-setup)
3. [iOS Build Configuration](#ios-build-configuration)
4. [Android Build Configuration](#android-build-configuration)
5. [Building for Development](#building-for-development)
6. [Building for Preview](#building-for-preview)
7. [Building for Production](#building-for-production)
8. [App Store Submission](#app-store-submission)
9. [Play Store Submission](#play-store-submission)
10. [Continuous Deployment](#continuous-deployment)

---

## Prerequisites

### Required Accounts

1. **Expo Account** (Free)
   - Sign up at [expo.dev](https://expo.dev/)
   - Required for EAS Build

2. **Apple Developer Account** ($99/year)
   - Required for iOS App Store submission
   - Sign up at [developer.apple.com](https://developer.apple.com/)

3. **Google Play Console Account** ($25 one-time)
   - Required for Google Play Store submission
   - Sign up at [play.google.com/console](https://play.google.com/console/)

### Required Tools

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo account
eas login

# Verify installation
eas --version
```

---

## EAS Build Setup

### 1. Initialize EAS Build

```bash
cd mobile
eas build:configure
```

This creates `eas.json` configuration file (already created).

### 2. Link Project to Expo

```bash
eas init
```

Follow prompts to link or create new Expo project.

### 3. Verify Configuration

```bash
eas build:list
```

---

## iOS Build Configuration

### 1. Apple Developer Setup

**Create App ID:**
1. Go to [developer.apple.com](https://developer.apple.com/)
2. Navigate to Certificates, Identifiers & Profiles
3. Create new App ID: `com.farmerdata.app`
4. Enable capabilities:
   - Push Notifications
   - Sign in with Apple (if needed)

**Create Certificates:**
EAS Build handles certificates automatically, but you can manage manually:
1. Distribution Certificate
2. Push Notification Certificate

**Create Provisioning Profiles:**
EAS Build creates these automatically.

### 2. App Store Connect Setup

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com/)
2. Click "My Apps" → "+" → "New App"
3. Fill in app information:
   - **Platform:** iOS
   - **Name:** Farmer Data Collection
   - **Primary Language:** English
   - **Bundle ID:** com.farmerdata.app
   - **SKU:** farmer-data-collection
   - **User Access:** Full Access

4. Create app version (1.0.0)

### 3. Update eas.json for iOS

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCDE12345"
      }
    }
  }
}
```

Replace with your actual values:
- `appleId`: Your Apple ID email
- `ascAppId`: App ID from App Store Connect
- `appleTeamId`: Team ID from developer.apple.com

---

## Android Build Configuration

### 1. Create Keystore

**Option 1: Let EAS Build create keystore (Recommended)**
```bash
eas build --platform android --profile production
```
EAS will create and manage keystore automatically.

**Option 2: Create keystore manually**
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore farmer-data-collection.jks -alias farmer-data-collection -keyalg RSA -keysize 2048 -validity 10000
```

Store keystore securely - you'll need it for all future updates.

### 2. Google Play Console Setup

1. Go to [play.google.com/console](https://play.google.com/console/)
2. Click "Create app"
3. Fill in app details:
   - **App name:** Farmer Data Collection
   - **Default language:** English
   - **App or game:** App
   - **Free or paid:** Free

4. Complete store listing:
   - Short description (80 chars)
   - Full description (4000 chars)
   - App icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (minimum 2)

5. Complete content rating questionnaire

6. Select target audience and content

7. Create internal testing track

### 3. Service Account for Automated Submission

1. Go to Google Cloud Console
2. Create service account
3. Download JSON key file
4. Save as `google-play-service-account.json` in mobile directory
5. Add to `.gitignore`

---

## Building for Development

Development builds include dev tools and run on simulators/emulators.

### iOS Development Build

```bash
cd mobile
eas build --profile development --platform ios
```

**Install on Simulator:**
```bash
# Download .app file from EAS Build
# Drag and drop onto iOS Simulator
```

### Android Development Build

```bash
cd mobile
eas build --profile development --platform android
```

**Install on Emulator:**
```bash
# Download .apk file from EAS Build
adb install path/to/app.apk
```

---

## Building for Preview

Preview builds are for internal testing on real devices.

### iOS Preview Build

```bash
cd mobile
eas build --profile preview --platform ios
```

**Install on Device:**
1. Download .ipa file from EAS Build
2. Use TestFlight or direct installation
3. Share link with testers

### Android Preview Build

```bash
cd mobile
eas build --profile preview --platform android
```

**Install on Device:**
1. Download .apk file from EAS Build
2. Share link with testers
3. Testers enable "Install from Unknown Sources"
4. Install APK

---

## Building for Production

Production builds are for app store submission.

### iOS Production Build

```bash
cd mobile
eas build --profile production --platform ios
```

This creates an `.ipa` file ready for App Store submission.

### Android Production Build

```bash
cd mobile
eas build --profile production --platform android
```

This creates an `.aab` (App Bundle) file ready for Play Store submission.

### Build Both Platforms

```bash
cd mobile
eas build --profile production --platform all
```

---

## App Store Submission

### Automated Submission (Recommended)

```bash
cd mobile
eas submit --platform ios --latest
```

EAS will upload the latest production build to App Store Connect.

### Manual Submission

1. Download `.ipa` from EAS Build
2. Open Xcode
3. Window → Organizer
4. Drag `.ipa` to Organizer
5. Click "Distribute App"
6. Follow prompts to upload to App Store Connect

### Complete App Store Connect Listing

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com/)
2. Select your app
3. Complete all required fields:

**App Information:**
- Name: Farmer Data Collection
- Subtitle: Track harvests, expenses, and market prices
- Category: Business or Productivity
- Content Rights: Check if you own rights

**Pricing and Availability:**
- Price: Free
- Availability: All countries

**App Privacy:**
- Privacy Policy URL (required if collecting data)
- Data collection details

**Screenshots:**
- 6.5" iPhone (required): 1242x2688 or 1284x2778
- 5.5" iPhone (required): 1242x2208
- iPad Pro (optional): 2048x2732

**App Preview Video (optional):**
- 15-30 seconds
- Show key features

**Description:**
```
Farmer Data Collection helps farmers track harvests, manage expenses, and make data-driven decisions.

KEY FEATURES:
• Track harvests with photos and GPS location
• Manage expenses with receipt scanning
• Browse marketplace for supplies
• AI-powered yield predictions
• Market price forecasting
• Offline mode with automatic sync
• Secure biometric authentication

Perfect for small to medium-sized farms looking to modernize their operations and increase profitability.
```

**Keywords:**
```
farming,agriculture,harvest,crops,expenses,marketplace,yield,prediction,farm management
```

**Support URL:**
```
https://farmerplatform.com/support
```

**Marketing URL (optional):**
```
https://farmerplatform.com
```

4. Submit for review
5. Wait for Apple review (1-3 days typically)
6. App goes live after approval

---

## Play Store Submission

### Automated Submission (Recommended)

```bash
cd mobile
eas submit --platform android --latest
```

EAS will upload the latest production build to Google Play Console.

### Manual Submission

1. Download `.aab` from EAS Build
2. Go to [play.google.com/console](https://play.google.com/console/)
3. Select your app
4. Production → Create new release
5. Upload `.aab` file
6. Fill in release notes
7. Review and rollout

### Complete Play Store Listing

**Store Listing:**

**Short Description (80 chars):**
```
Track harvests, manage expenses, and make data-driven farming decisions
```

**Full Description (4000 chars):**
```
Farmer Data Collection is a comprehensive farm management app that helps farmers track harvests, manage expenses, and make data-driven decisions to increase profitability.

📊 HARVEST TRACKING
• Record harvest data with photos and GPS location
• Track crop types, quantities, and dates
• View harvest history and trends
• Offline mode with automatic sync

💰 EXPENSE MANAGEMENT
• Track all farm expenses by category
• Scan receipts with camera
• Generate expense reports
• Monitor spending patterns

🛒 MARKETPLACE
• Browse agricultural supplies
• Compare prices from local sellers
• Place orders directly in app
• Track order status

🤖 AI-POWERED INSIGHTS
• Yield prediction based on field conditions
• Market price forecasting
• Data-driven recommendations
• Historical trend analysis

🔒 SECURE & PRIVATE
• Biometric authentication (Face ID, Touch ID, Fingerprint)
• Secure data storage
• Offline capability
• Automatic cloud backup

✨ KEY BENEFITS
• Save time with digital record keeping
• Make informed decisions with data insights
• Increase profitability with better planning
• Access your data anywhere, anytime

Perfect for small to medium-sized farms, agricultural cooperatives, and farm managers looking to modernize their operations.

Download now and start making data-driven farming decisions!
```

**App Icon:**
- 512x512 PNG (high-res icon)

**Feature Graphic:**
- 1024x500 PNG (banner image)

**Screenshots:**
- Phone: Minimum 2, maximum 8
- 7" Tablet: Optional
- 10" Tablet: Optional

**App Category:**
- Business or Productivity

**Content Rating:**
- Complete questionnaire
- Likely rating: Everyone

**Target Audience:**
- Age range: 18+

**Privacy Policy:**
- URL: https://farmerplatform.com/privacy

**Contact Details:**
- Email: support@farmerplatform.com
- Phone: Optional
- Website: https://farmerplatform.com

**Release:**
1. Create internal testing release first
2. Test with internal testers
3. Create production release
4. Submit for review
5. Wait for Google review (few hours to few days)
6. App goes live after approval

---

## Continuous Deployment

### GitHub Actions Workflow

Create `.github/workflows/mobile-deploy.yml`:

```yaml
name: Mobile App Deployment

on:
  push:
    branches: [main]
    paths:
      - 'mobile/**'

jobs:
  build-ios:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - name: Install dependencies
        run: cd mobile && npm install
      - name: Build iOS
        run: cd mobile && eas build --platform ios --profile production --non-interactive

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - name: Install dependencies
        run: cd mobile && npm install
      - name: Build Android
        run: cd mobile && eas build --platform android --profile production --non-interactive
```

### Required Secrets

Add to GitHub repository secrets:
- `EXPO_TOKEN`: Get from `eas whoami --json`

---

## Build Scripts

Add to `mobile/package.json`:

```json
{
  "scripts": {
    "build:dev:ios": "eas build --profile development --platform ios",
    "build:dev:android": "eas build --profile development --platform android",
    "build:preview:ios": "eas build --profile preview --platform ios",
    "build:preview:android": "eas build --profile preview --platform android",
    "build:prod:ios": "eas build --profile production --platform ios",
    "build:prod:android": "eas build --profile production --platform android",
    "build:prod:all": "eas build --profile production --platform all",
    "submit:ios": "eas submit --platform ios --latest",
    "submit:android": "eas submit --platform android --latest",
    "submit:all": "eas submit --platform all --latest"
  }
}
```

### Usage

```bash
# Development builds
npm run build:dev:ios
npm run build:dev:android

# Preview builds
npm run build:preview:ios
npm run build:preview:android

# Production builds
npm run build:prod:ios
npm run build:prod:android
npm run build:prod:all

# Submit to stores
npm run submit:ios
npm run submit:android
npm run submit:all
```

---

## Troubleshooting

### Build Fails

**Check build logs:**
```bash
eas build:list
# Click on build to view logs
```

**Common issues:**
- Missing credentials: Run `eas credentials`
- Invalid bundle ID: Check app.json
- Missing permissions: Check Info.plist (iOS) or AndroidManifest.xml (Android)

### Submission Fails

**iOS:**
- Missing required screenshots
- Invalid privacy policy URL
- Missing export compliance
- Invalid bundle ID

**Android:**
- Invalid package name
- Missing content rating
- Invalid screenshots
- Missing privacy policy

### App Rejected

**iOS:**
- Review rejection reasons in App Store Connect
- Fix issues and resubmit
- Typical issues: crashes, missing functionality, misleading description

**Android:**
- Review rejection reasons in Play Console
- Fix issues and create new release
- Typical issues: crashes, policy violations, misleading content

---

## Best Practices

1. **Version Management**
   - Use semantic versioning (1.0.0, 1.0.1, 1.1.0, 2.0.0)
   - Increment version for each release
   - Keep build number auto-incrementing

2. **Testing Before Submission**
   - Test on real devices
   - Complete full testing checklist
   - Test all user flows
   - Check for crashes

3. **Release Notes**
   - Write clear, user-friendly release notes
   - Highlight new features
   - Mention bug fixes
   - Keep it concise

4. **Monitoring**
   - Set up crash reporting (Sentry)
   - Monitor app analytics (Firebase)
   - Track user feedback
   - Monitor app store reviews

5. **Update Strategy**
   - Release updates regularly
   - Fix critical bugs quickly
   - Communicate with users
   - Maintain backward compatibility

---

## Resources

- [Expo EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [App Store Connect Help](https://developer.apple.com/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer/)
- [iOS App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policy Center](https://play.google.com/about/developer-content-policy/)

---

## Conclusion

This guide covers the complete build and deployment process for both iOS and Android. Follow these steps to successfully publish your app to the App Store and Play Store.

For questions or issues, refer to the official documentation or contact support.
