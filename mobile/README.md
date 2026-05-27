# Farmer Data Collection - Mobile App

Production-ready React Native mobile app with full feature parity to the web platform.

## Architecture Overview

### Tech Stack

- **Framework**: React Native with Expo SDK 54
- **Language**: TypeScript
- **Navigation**: React Navigation (Stack + Bottom Tabs)
- **State Management**: Zustand + React Query
- **Database**: SQLite (expo-sqlite) for offline-first
- **Authentication**: JWT + Biometric (Face ID/Fingerprint)
- **Native Features**:
  - Camera (expo-camera) - Crop photos, receipt scanning
  - GPS (expo-location) - Field mapping, location tracking
  - Push Notifications (expo-notifications)
  - Secure Storage (expo-secure-store)
  - Image Picker (expo-image-picker)

### Project Structure

```
mobile/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # Base UI components (Button, Input, Card)
│   │   ├── forms/        # Form components
│   │   └── shared/       # Shared components (Header, Loading)
│   ├── screens/          # Screen components
│   │   ├── auth/         # Login, Register, Biometric
│   │   ├── harvests/     # Harvest CRUD, Photo capture
│   │   ├── expenses/     # Expense CRUD, Receipt scanning
│   │   ├── marketplace/  # Browse, Search, Cart, Checkout
│   │   ├── ml/           # Yield forecast, Price prediction
│   │   └── profile/      # Settings, Profile
│   ├── navigation/       # Navigation configuration
│   │   ├── AppNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   └── MainNavigator.tsx
│   ├── services/         # API and data services
│   │   ├── api/          # API client (tRPC)
│   │   ├── database/     # SQLite operations
│   │   ├── sync/         # Background sync logic
│   │   └── auth/         # Authentication service
│   ├── stores/           # Zustand stores
│   │   ├── authStore.ts
│   │   ├── syncStore.ts
│   │   └── offlineStore.ts
│   ├── hooks/            # Custom React hooks
│   │   ├── useAuth.ts
│   │   ├── useCamera.ts
│   │   ├── useLocation.ts
│   │   └── useOfflineSync.ts
│   ├── utils/            # Utility functions
│   │   ├── validation.ts
│   │   ├── formatting.ts
│   │   └── constants.ts
│   └── types/            # TypeScript type definitions
│       ├── api.ts
│       ├── models.ts
│       └── navigation.ts
├── assets/               # Images, fonts, icons
├── app.json             # Expo configuration
├── App.tsx              # Root component
└── package.json         # Dependencies

```

## Features

### ✅ Offline-First Architecture

- **SQLite Database**: Local data storage with full CRUD operations
- **Background Sync**: Automatic sync when online
- **Conflict Resolution**: Last-write-wins with server timestamps
- **Queue Management**: Failed requests queued for retry

### ✅ Authentication

- **JWT Authentication**: Secure token-based auth
- **Biometric Login**: Face ID (iOS) / Fingerprint (Android)
- **Secure Storage**: Tokens stored in device keychain
- **Auto-refresh**: Automatic token refresh

### ✅ Native Device Features

#### Camera Integration
- Capture crop photos
- Scan receipts (OCR ready)
- Image compression and optimization
- Gallery access

#### GPS & Location
- Field mapping with coordinates
- Harvest location tracking
- Distance calculations
- Offline map caching

#### Push Notifications
- Harvest reminders
- Price alerts
- Marketplace updates
- Background notifications

### ✅ Feature Modules

#### 1. Harvests
- Create/edit/delete harvests
- Photo capture with camera
- GPS location tagging
- Offline CRUD operations
- Sync status indicators

#### 2. Expenses
- Record farm expenses
- Receipt photo capture
- Category management
- Offline tracking
- Export to CSV

#### 3. Marketplace
- Browse listings
- Search and filters
- Shopping cart
- Checkout flow
- Order tracking

#### 4. ML Predictions
- Crop yield forecasting
- Price predictions
- Historical data visualization
- Confidence scores

#### 5. Profile & Settings
- User profile management
- App settings
- Biometric toggle
- Sync preferences
- Logout

## Development

### Prerequisites

```bash
# Install Node.js 18+
# Install Expo CLI
npm install -g expo-cli

# Install EAS CLI (for builds)
npm install -g eas-cli
```

### Setup

```bash
# Navigate to mobile directory
cd mobile

# Install dependencies
npm install

# Start development server
npx expo start
```

### Running on Devices

#### iOS Simulator
```bash
npx expo start --ios
```

#### Android Emulator
```bash
npx expo start --android
```

#### Physical Device
1. Install Expo Go app from App Store/Play Store
2. Scan QR code from terminal
3. App loads on device

### Building for Production

#### iOS Build
```bash
# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

#### Android Build
```bash
# Build for Android
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

## Offline-First Implementation

### Data Flow

```
User Action
    ↓
SQLite (Local DB)
    ↓
Sync Queue
    ↓
[Online?] → Yes → API Request → Update Local DB
    ↓
    No → Queue for later
```

### Sync Strategy

1. **Immediate Sync**: Attempt sync on every action when online
2. **Background Sync**: Periodic sync every 15 minutes
3. **Manual Sync**: Pull-to-refresh on all screens
4. **Conflict Resolution**: Server timestamp wins

### Database Schema

```sql
-- Harvests
CREATE TABLE harvests (
  id TEXT PRIMARY KEY,
  crop_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  harvest_date TEXT NOT NULL,
  location_lat REAL,
  location_lng REAL,
  photo_uri TEXT,
  notes TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Expenses
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  expense_date TEXT NOT NULL,
  receipt_uri TEXT,
  synced INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sync Queue
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
```

## API Integration

### tRPC Client

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../server/trpc';
import { getAuthToken } from './auth';

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'https://farmerplatform.com/api/trpc',
      headers: async () => {
        const token = await getAuthToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
```

### React Query Integration

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
```

## Performance Optimization

### Image Optimization
- Compress images before upload (max 1MB)
- Resize to max 1920x1080
- Use WebP format when supported
- Lazy load images

### List Rendering
- Use FlatList with `getItemLayout`
- Implement pagination (20 items per page)
- Memoize list items with React.memo
- Virtual scrolling for long lists

### Bundle Size
- Code splitting by route
- Tree shaking unused code
- Optimize assets (compress images, fonts)
- Target bundle size: < 50MB

## Testing

### Unit Tests
```bash
npm run test
```

### E2E Tests (Detox)
```bash
# iOS
npm run test:e2e:ios

# Android
npm run test:e2e:android
```

## App Store Submission

### iOS App Store

1. **Prepare Assets**
   - App icon (1024x1024)
   - Screenshots (6.5", 5.5")
   - App preview video (optional)

2. **App Store Connect**
   - Create app listing
   - Add description, keywords
   - Set pricing
   - Submit for review

3. **Review Checklist**
   - Privacy policy URL
   - Support URL
   - Age rating
   - Export compliance

### Google Play Store

1. **Prepare Assets**
   - App icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (phone, tablet)

2. **Play Console**
   - Create app listing
   - Add description, category
   - Set pricing
   - Submit for review

3. **Review Checklist**
   - Privacy policy URL
   - Content rating questionnaire
   - Target audience
   - Data safety form

## Security

### Best Practices

- ✅ Store tokens in secure storage (Keychain/Keystore)
- ✅ Enable SSL pinning for API requests
- ✅ Implement biometric authentication
- ✅ Encrypt sensitive local data
- ✅ Validate all user inputs
- ✅ Use HTTPS only
- ✅ Implement rate limiting
- ✅ Log security events

### Permissions

- **Camera**: Required for crop photos and receipt scanning
- **Location**: Required for field mapping
- **Notifications**: Optional for reminders and alerts
- **Biometric**: Optional for quick login
- **Storage**: Required for photo caching

## Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache
npx expo start --clear

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### iOS Simulator Issues
```bash
# Reset simulator
xcrun simctl erase all

# Rebuild
npx expo run:ios
```

#### Android Emulator Issues
```bash
# Cold boot emulator
emulator -avd Pixel_5_API_31 -no-snapshot-load

# Clear gradle cache
cd android && ./gradlew clean
```

## Monitoring & Analytics

### Crash Reporting
- Sentry integration for crash tracking
- Error boundaries for graceful failures
- Automatic crash reports

### Analytics
- Firebase Analytics for user behavior
- Custom events for key actions
- Funnel analysis for conversions

### Performance Monitoring
- React Native Performance Monitor
- Frame rate tracking
- Memory usage monitoring
- Network request timing

## Deployment

### Release Process

1. **Version Bump**
   ```bash
   # Update version in app.json
   # iOS: buildNumber
   # Android: versionCode
   ```

2. **Build**
   ```bash
   eas build --platform all --profile production
   ```

3. **Test**
   - Install on test devices
   - Run smoke tests
   - Verify all features

4. **Submit**
   ```bash
   eas submit --platform all
   ```

5. **Monitor**
   - Watch crash reports
   - Monitor user feedback
   - Track key metrics

## Roadmap

### Phase 1 (Current)
- ✅ Core features (harvests, expenses, marketplace)
- ✅ Offline-first architecture
- ✅ Native device features
- ✅ App store submission

### Phase 2 (Future)
- [ ] Advanced ML features (image recognition for crop diseases)
- [ ] Social features (farmer community, knowledge sharing)
- [ ] IoT integration (sensor data, weather stations)
- [ ] Multi-language support
- [ ] Accessibility improvements

## Support

- **Documentation**: https://docs.farmerplatform.com/mobile
- **Issues**: https://github.com/farmer-platform/mobile/issues
- **Email**: support@farmerplatform.com

## License

Proprietary - All rights reserved
