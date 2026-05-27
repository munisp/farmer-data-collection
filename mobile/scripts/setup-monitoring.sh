#!/bin/bash

# Setup Monitoring Infrastructure
# This script guides you through setting up Firebase and Sentry for the mobile app

set -e

echo "========================================="
echo "Mobile App Monitoring Setup"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from mobile directory${NC}"
    echo "Usage: cd mobile && bash scripts/setup-monitoring.sh"
    exit 1
fi

echo -e "${YELLOW}This script will help you set up:${NC}"
echo "1. Firebase Analytics"
echo "2. Sentry Error Tracking"
echo ""

# ==========================================
# FIREBASE SETUP
# ==========================================

echo -e "${GREEN}=== Firebase Setup ===${NC}"
echo ""

echo "Step 1: Create Firebase Project"
echo "-------------------------------"
echo "1. Go to https://console.firebase.google.com/"
echo "2. Click 'Add project'"
echo "3. Enter project name: 'Farmer Data Collection'"
echo "4. Enable Google Analytics (recommended)"
echo "5. Click 'Create project'"
echo ""
read -p "Press Enter when Firebase project is created..."

echo ""
echo "Step 2: Add iOS App to Firebase"
echo "--------------------------------"
echo "1. In Firebase Console, click 'Add app' → iOS"
echo "2. Enter iOS bundle ID: com.farmerdata.app"
echo "3. Enter app nickname: Farmer Data Collection iOS"
echo "4. Download GoogleService-Info.plist"
echo "5. Save file to: mobile/ios/GoogleService-Info.plist"
echo ""
read -p "Press Enter when iOS app is added and file is saved..."

# Check if GoogleService-Info.plist exists
if [ -f "ios/GoogleService-Info.plist" ]; then
    echo -e "${GREEN}✓ GoogleService-Info.plist found${NC}"
else
    echo -e "${YELLOW}⚠ GoogleService-Info.plist not found in mobile/ios/${NC}"
    echo "Please download and place the file before building iOS app"
fi

echo ""
echo "Step 3: Add Android App to Firebase"
echo "------------------------------------"
echo "1. In Firebase Console, click 'Add app' → Android"
echo "2. Enter Android package name: com.farmerdata.app"
echo "3. Enter app nickname: Farmer Data Collection Android"
echo "4. Download google-services.json"
echo "5. Save file to: mobile/android/app/google-services.json"
echo ""
read -p "Press Enter when Android app is added and file is saved..."

# Check if google-services.json exists
if [ -f "android/app/google-services.json" ]; then
    echo -e "${GREEN}✓ google-services.json found${NC}"
else
    echo -e "${YELLOW}⚠ google-services.json not found in mobile/android/app/${NC}"
    echo "Please download and place the file before building Android app"
fi

echo ""
echo -e "${GREEN}✓ Firebase setup complete!${NC}"
echo ""

# ==========================================
# SENTRY SETUP
# ==========================================

echo -e "${GREEN}=== Sentry Setup ===${NC}"
echo ""

echo "Step 1: Create Sentry Account"
echo "------------------------------"
echo "1. Go to https://sentry.io/"
echo "2. Sign up or log in"
echo ""
read -p "Press Enter when you have a Sentry account..."

echo ""
echo "Step 2: Create Sentry Project"
echo "------------------------------"
echo "1. Click 'Create Project'"
echo "2. Select platform: 'React Native'"
echo "3. Enter project name: farmer-data-collection-mobile"
echo "4. Click 'Create Project'"
echo ""
read -p "Press Enter when Sentry project is created..."

echo ""
echo "Step 3: Get Sentry DSN"
echo "----------------------"
echo "1. In Sentry project dashboard, go to Settings → Client Keys (DSN)"
echo "2. Copy the DSN (looks like: https://abc123@o123.ingest.sentry.io/456)"
echo ""
read -p "Enter your Sentry DSN: " SENTRY_DSN

if [ -z "$SENTRY_DSN" ]; then
    echo -e "${YELLOW}⚠ No DSN entered. You'll need to add it manually later.${NC}"
else
    echo -e "${GREEN}✓ Sentry DSN saved${NC}"
    
    # Create .env file with Sentry DSN
    echo "SENTRY_DSN=$SENTRY_DSN" > .env
    echo -e "${GREEN}✓ Created .env file with Sentry DSN${NC}"
fi

echo ""
echo "Step 4: Get Sentry Auth Token"
echo "------------------------------"
echo "1. Go to https://sentry.io/settings/account/api/auth-tokens/"
echo "2. Click 'Create New Token'"
echo "3. Name: 'Farmer Data Collection Mobile'"
echo "4. Scopes: project:read, project:write, org:read"
echo "5. Click 'Create Token'"
echo "6. Copy the token"
echo ""
read -p "Enter your Sentry Auth Token: " SENTRY_AUTH_TOKEN

if [ -z "$SENTRY_AUTH_TOKEN" ]; then
    echo -e "${YELLOW}⚠ No auth token entered. You'll need to add it manually later.${NC}"
else
    # Create .sentryclirc file
    cat > .sentryclirc << EOF
[auth]
token=$SENTRY_AUTH_TOKEN

[defaults]
url=https://sentry.io/
org=your-org-name
project=farmer-data-collection-mobile
EOF
    echo -e "${GREEN}✓ Created .sentryclirc file${NC}"
    echo -e "${YELLOW}⚠ Update 'org' in .sentryclirc with your Sentry organization name${NC}"
fi

echo ""
echo -e "${GREEN}✓ Sentry setup complete!${NC}"
echo ""

# ==========================================
# UPDATE APP CONFIGURATION
# ==========================================

echo -e "${GREEN}=== Update App Configuration ===${NC}"
echo ""

echo "Step 1: Update app.json"
echo "-----------------------"
echo "Add Firebase and Sentry plugins to app.json:"
echo ""
echo '{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/analytics",
      [
        "@sentry/react-native/expo",
        {
          "organization": "your-org-name",
          "project": "farmer-data-collection-mobile"
        }
      ]
    ]
  }
}'
echo ""
read -p "Press Enter to continue..."

echo ""
echo "Step 2: Update App.tsx"
echo "----------------------"
echo "Initialize Firebase and Sentry in App.tsx:"
echo ""
echo 'import analytics from "@react-native-firebase/analytics";
import SentryService from "@/services/sentry";

useEffect(() => {
  // Initialize Firebase Analytics
  analytics().setAnalyticsCollectionEnabled(true);
  
  // Initialize Sentry
  SentryService.init(
    process.env.SENTRY_DSN || "",
    __DEV__ ? "development" : "production"
  );
}, []);'
echo ""
read -p "Press Enter to continue..."

# ==========================================
# VERIFICATION
# ==========================================

echo ""
echo -e "${GREEN}=== Verification ===${NC}"
echo ""

echo "Checking setup..."
echo ""

# Check Firebase files
FIREBASE_IOS_OK=false
FIREBASE_ANDROID_OK=false

if [ -f "ios/GoogleService-Info.plist" ]; then
    echo -e "${GREEN}✓ Firebase iOS configuration found${NC}"
    FIREBASE_IOS_OK=true
else
    echo -e "${RED}✗ Firebase iOS configuration missing${NC}"
fi

if [ -f "android/app/google-services.json" ]; then
    echo -e "${GREEN}✓ Firebase Android configuration found${NC}"
    FIREBASE_ANDROID_OK=true
else
    echo -e "${RED}✗ Firebase Android configuration missing${NC}"
fi

# Check Sentry configuration
SENTRY_OK=false

if [ -f ".env" ] && grep -q "SENTRY_DSN" .env; then
    echo -e "${GREEN}✓ Sentry DSN configured${NC}"
    SENTRY_OK=true
else
    echo -e "${RED}✗ Sentry DSN not configured${NC}"
fi

if [ -f ".sentryclirc" ]; then
    echo -e "${GREEN}✓ Sentry CLI configured${NC}"
else
    echo -e "${RED}✗ Sentry CLI not configured${NC}"
fi

echo ""

# ==========================================
# NEXT STEPS
# ==========================================

echo -e "${GREEN}=== Next Steps ===${NC}"
echo ""

if [ "$FIREBASE_IOS_OK" = false ] || [ "$FIREBASE_ANDROID_OK" = false ]; then
    echo -e "${YELLOW}1. Complete Firebase setup:${NC}"
    if [ "$FIREBASE_IOS_OK" = false ]; then
        echo "   - Download GoogleService-Info.plist"
        echo "   - Place in mobile/ios/"
    fi
    if [ "$FIREBASE_ANDROID_OK" = false ]; then
        echo "   - Download google-services.json"
        echo "   - Place in mobile/android/app/"
    fi
    echo ""
fi

if [ "$SENTRY_OK" = false ]; then
    echo -e "${YELLOW}2. Complete Sentry setup:${NC}"
    echo "   - Add SENTRY_DSN to .env file"
    echo "   - Create .sentryclirc with auth token"
    echo ""
fi

echo "3. Update app.json with Firebase and Sentry plugins"
echo ""
echo "4. Update App.tsx to initialize Firebase and Sentry"
echo ""
echo "5. Rebuild app with EAS Build:"
echo "   npm run build:dev:all"
echo ""
echo "6. Test analytics and error tracking"
echo ""

echo -e "${GREEN}========================================="
echo "Setup Complete!"
echo "=========================================${NC}"
echo ""
echo "For detailed instructions, see:"
echo "- ANALYTICS_MONITORING_GUIDE.md"
echo "- BUILD_DEPLOY_GUIDE.md"
echo ""
