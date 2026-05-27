# EAS (Expo Application Services) Setup Guide

Complete guide to set up EAS Build for building and submitting your mobile app to app stores.

---

## Table of Contents

1. [What is EAS?](#what-is-eas)
2. [Create Expo Account](#create-expo-account)
3. [Install EAS CLI](#install-eas-cli)
4. [Initialize EAS Project](#initialize-eas-project)
5. [Configure Credentials](#configure-credentials)
6. [Build Your First App](#build-your-first-app)
7. [Troubleshooting](#troubleshooting)

---

## What is EAS?

**EAS (Expo Application Services)** is a suite of cloud services for building, submitting, and updating React Native apps.

**Key Features:**
- **EAS Build**: Build iOS and Android apps in the cloud
- **EAS Submit**: Submit apps to App Store and Play Store
- **EAS Update**: Push over-the-air updates
- **Managed Credentials**: Automatic certificate and keystore management

**Pricing:**
- Free tier: Limited builds per month
- Production tier: Unlimited builds ($29/month)
- [See pricing](https://expo.dev/pricing)

---

## Create Expo Account

### Step 1: Sign Up

1. Go to [expo.dev](https://expo.dev/)
2. Click "Sign Up" in top right
3. Choose sign-up method:
   - **GitHub** (recommended for developers)
   - **Google**
   - **Email**

4. Complete registration

### Step 2: Verify Email

1. Check your email inbox
2. Click verification link
3. Email verified!

### Step 3: Create Organization (Optional)

For team projects:
1. Go to [expo.dev/accounts](https://expo.dev/accounts)
2. Click "Create Organization"
3. Enter organization name
4. Invite team members

---

## Install EAS CLI

### Install Globally

```bash
npm install -g eas-cli
```

### Verify Installation

```bash
eas --version
```

Should output version number (e.g., `eas-cli/13.2.0`)

### Login to EAS

```bash
eas login
```

Enter your Expo credentials:
- Username or email
- Password

**Successful login shows:**
```
✔ Logged in as your-username
```

### Verify Login

```bash
eas whoami
```

Should display your username.

---

## Initialize EAS Project

### Step 1: Navigate to Mobile Directory

```bash
cd /path/to/farmer-data-collection/mobile
```

### Step 2: Initialize EAS

```bash
eas init
```

**You'll be prompted:**

**1. "What would you like your project slug to be?"**
```
farmer-data-collection-mobile
```
(or press Enter to use default)

**2. "Link to existing project or create new one?"**
```
> Create a new project
```

**3. "Project name?"**
```
Farmer Data Collection
```

**Success message:**
```
✔ Created project: farmer-data-collection-mobile
✔ Linked local project to EAS project
```

### Step 3: Verify Configuration

Check `app.json`:
```json
{
  "expo": {
    "name": "Farmer Data Collection",
    "slug": "farmer-data-collection-mobile",
    "owner": "your-username",
    "extra": {
      "eas": {
        "projectId": "abc123-def456-ghi789"
      }
    }
  }
}
```

The `projectId` confirms successful linking.

---

## Configure Credentials

EAS can automatically manage certificates and keystores, or you can provide your own.

### Option 1: Automatic Credentials (Recommended)

EAS will create and manage certificates automatically during first build.

**No action needed!** Just proceed to building.

### Option 2: Manual Credentials

If you have existing certificates:

#### iOS Certificates

```bash
eas credentials
```

1. Select platform: **iOS**
2. Select action: **Add new credentials**
3. Choose credential type:
   - Distribution Certificate
   - Push Notification Key
   - Provisioning Profile
4. Follow prompts to upload files

#### Android Keystore

```bash
eas credentials
```

1. Select platform: **Android**
2. Select action: **Add new keystore**
3. Provide keystore file or let EAS generate one

---

## Build Your First App

### Development Build (Test on Device)

**iOS:**
```bash
eas build --profile development --platform ios
```

**Android:**
```bash
eas build --profile development --platform android
```

**Both:**
```bash
eas build --profile development --platform all
```

### What Happens During Build:

1. **Upload Code**: EAS uploads your project
2. **Install Dependencies**: npm install runs in cloud
3. **Configure Credentials**: Certificates/keystores applied
4. **Compile Native Code**: iOS/Android compilation
5. **Generate Binary**: .ipa (iOS) or .apk (Android) created
6. **Upload to CDN**: Download link provided

**Build time:** 10-20 minutes typically

### Monitor Build Progress

**In Terminal:**
- Build progress shown in real-time
- URL to build dashboard provided

**In Browser:**
1. Go to [expo.dev/accounts/[username]/projects/farmer-data-collection-mobile/builds](https://expo.dev)
2. View all builds
3. See build logs
4. Download binaries

### Download and Install

**iOS (.ipa):**
1. Download from build dashboard
2. Install via:
   - Xcode Devices window
   - Apple Configurator
   - TestFlight (for distribution)

**Android (.apk):**
1. Download from build dashboard
2. Transfer to device
3. Enable "Install from Unknown Sources"
4. Install APK

---

## Preview Build (Internal Testing)

For testing with team before production:

```bash
eas build --profile preview --platform all
```

**iOS:** Creates .ipa for TestFlight or direct installation
**Android:** Creates .apk for direct installation

---

## Production Build (App Store Submission)

When ready for app stores:

```bash
eas build --profile production --platform all
```

**iOS:** Creates .ipa for App Store Connect
**Android:** Creates .aab (App Bundle) for Play Console

**Note:** Production builds take longer (15-30 minutes)

---

## Submit to App Stores

### Prerequisites

**iOS:**
- Apple Developer Account ($99/year)
- App created in App Store Connect
- App Store Connect credentials in EAS

**Android:**
- Google Play Console Account ($25 one-time)
- App created in Play Console
- Service account JSON key

### Submit to iOS App Store

```bash
eas submit --platform ios --latest
```

EAS will:
1. Upload latest iOS production build
2. Submit to App Store Connect
3. Set for manual release or automatic

### Submit to Android Play Store

```bash
eas submit --platform android --latest
```

EAS will:
1. Upload latest Android production build
2. Submit to Play Console
3. Release to selected track (internal/alpha/beta/production)

### Submit to Both

```bash
eas submit --platform all --latest
```

---

## Build Scripts (Already Configured)

Your `package.json` includes convenient scripts:

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

### Issue: "Not logged in"

**Solution:**
```bash
eas login
```

### Issue: "Project not initialized"

**Solution:**
```bash
eas init
```

### Issue: "Build failed - credentials error"

**Solution:**
```bash
eas credentials
```
Check and reconfigure credentials.

### Issue: "Build failed - dependency error"

**Solution:**
1. Check `package.json` for invalid dependencies
2. Run `npm install` locally first
3. Check build logs for specific error

### Issue: "iOS build failed - provisioning profile"

**Solution:**
1. Go to [developer.apple.com](https://developer.apple.com/)
2. Verify App ID exists
3. Verify bundle ID matches `app.json`
4. Run `eas credentials` to reconfigure

### Issue: "Android build failed - keystore"

**Solution:**
```bash
eas credentials
```
Select Android → Generate new keystore

### Issue: "Submission failed - missing metadata"

**Solution:**
1. Complete App Store Connect listing (iOS)
2. Complete Play Console listing (Android)
3. Ensure all required fields filled

---

## Best Practices

### 1. Use Version Control

Always commit before building:
```bash
git add .
git commit -m "Pre-build commit"
git push
```

### 2. Test Locally First

Before cloud builds:
```bash
npm start
# Test on Expo Go
```

### 3. Use Build Profiles

- **development**: For testing features
- **preview**: For team testing
- **production**: For app store submission

### 4. Monitor Build Logs

Always check build logs for warnings or errors.

### 5. Keep Credentials Secure

Never commit:
- `.p12` files (iOS certificates)
- `.mobileprovision` files
- `.jks` files (Android keystores)
- Service account JSON keys

Add to `.gitignore`:
```
*.p12
*.mobileprovision
*.jks
google-play-service-account.json
```

---

## EAS Dashboard

Access your project dashboard:
```
https://expo.dev/accounts/[username]/projects/farmer-data-collection-mobile
```

**Dashboard Features:**
- View all builds
- Download binaries
- View build logs
- Manage credentials
- View submissions
- Team management
- Analytics

---

## Pricing Considerations

### Free Tier
- Limited builds per month
- Slower build queue
- Good for development

### Production Tier ($29/month)
- Unlimited builds
- Priority build queue
- Faster builds
- Team collaboration
- Advanced features

**Recommendation:** Start with free tier, upgrade when ready for production.

---

## Next Steps

1. **Build development version**: `npm run build:dev:all`
2. **Test on real devices**: Install and test
3. **Build production version**: `npm run build:prod:all`
4. **Submit to stores**: `npm run submit:all`
5. **Monitor submissions**: Check App Store Connect and Play Console

---

## Resources

- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [EAS Credentials Documentation](https://docs.expo.dev/app-signing/app-credentials/)
- [EAS Pricing](https://expo.dev/pricing)
- [Expo Forums](https://forums.expo.dev/)

---

## Conclusion

EAS simplifies the complex process of building and submitting mobile apps. Follow this guide to get your app into the hands of users quickly and reliably.

Happy building! 🚀
