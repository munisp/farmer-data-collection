# Analytics and Monitoring Guide

Complete guide for setting up Firebase Analytics and Sentry error tracking in the Farmer Data Collection mobile app.

---

## Table of Contents

1. [Firebase Analytics Setup](#firebase-analytics-setup)
2. [Sentry Setup](#sentry-setup)
3. [Analytics Events](#analytics-events)
4. [Error Tracking](#error-tracking)
5. [Usage Examples](#usage-examples)
6. [Best Practices](#best-practices)
7. [Privacy Considerations](#privacy-considerations)

---

## Firebase Analytics Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: "Farmer Data Collection"
4. Enable Google Analytics (recommended)
5. Select or create Google Analytics account
6. Click "Create project"

### 2. Add iOS App

1. In Firebase Console, click "Add app" → iOS
2. Enter iOS bundle ID: `com.farmerdata.app`
3. Enter app nickname: "Farmer Data Collection iOS"
4. Download `GoogleService-Info.plist`
5. Place file in `mobile/ios/` directory
6. Follow Firebase setup instructions

### 3. Add Android App

1. In Firebase Console, click "Add app" → Android
2. Enter Android package name: `com.farmerdata.app`
3. Enter app nickname: "Farmer Data Collection Android"
4. Download `google-services.json`
5. Place file in `mobile/android/app/` directory
6. Follow Firebase setup instructions

### 4. Configure Firebase in App

The Firebase SDK is already installed. To initialize:

**Update `mobile/App.tsx`:**

```typescript
import analytics from '@react-native-firebase/analytics';
import AnalyticsService from '@/services/analytics';

// Initialize Firebase Analytics
useEffect(() => {
  analytics().setAnalyticsCollectionEnabled(true);
}, []);
```

### 5. Update app.json

Add Firebase plugin to `mobile/app.json`:

```json
{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/analytics"
    ]
  }
}
```

### 6. Rebuild App

```bash
cd mobile
eas build --profile development --platform all
```

---

## Sentry Setup

### 1. Create Sentry Project

1. Go to [Sentry.io](https://sentry.io/)
2. Sign up or log in
3. Click "Create Project"
4. Select "React Native"
5. Enter project name: "farmer-data-collection-mobile"
6. Copy DSN (Data Source Name)

### 2. Configure Sentry

**Create `mobile/.sentryclirc`:**

```ini
[auth]
token=YOUR_AUTH_TOKEN

[defaults]
url=https://sentry.io/
org=your-org-name
project=farmer-data-collection-mobile
```

**Update `mobile/app.json`:**

```json
{
  "expo": {
    "plugins": [
      [
        "@sentry/react-native/expo",
        {
          "organization": "your-org-name",
          "project": "farmer-data-collection-mobile"
        }
      ]
    ],
    "hooks": {
      "postPublish": [
        {
          "file": "sentry-expo/upload-sourcemaps",
          "config": {
            "organization": "your-org-name",
            "project": "farmer-data-collection-mobile",
            "authToken": "YOUR_AUTH_TOKEN"
          }
        }
      ]
    }
  }
}
```

### 3. Initialize Sentry in App

**Update `mobile/App.tsx`:**

```typescript
import SentryService from '@/services/sentry';

// Initialize Sentry
useEffect(() => {
  SentryService.init(
    'YOUR_SENTRY_DSN',
    __DEV__ ? 'development' : 'production'
  );
}, []);
```

### 4. Wrap App with Error Boundary

```typescript
import SentryService from '@/services/sentry';

function App() {
  return (
    <SentryService.ErrorBoundary fallback={<ErrorFallback />}>
      {/* Your app content */}
    </SentryService.ErrorBoundary>
  );
}
```

---

## Analytics Events

### Screen Tracking

Automatically track screen views:

```typescript
import AnalyticsService from '@/services/analytics';
import { useNavigationContainerRef } from '@react-navigation/native';

const navigationRef = useNavigationContainerRef();

useEffect(() => {
  const unsubscribe = navigationRef.addListener('state', () => {
    const currentRoute = navigationRef.getCurrentRoute();
    if (currentRoute) {
      AnalyticsService.logScreenView(currentRoute.name);
    }
  });
  return unsubscribe;
}, []);
```

### User Authentication Events

```typescript
// Login
AnalyticsService.logLogin('email');
AnalyticsService.logLogin('biometric');

// Registration
AnalyticsService.logSignUp('email');

// Set user ID
AnalyticsService.setUserId(user.id);

// Set user properties
AnalyticsService.setUserProperties({
  user_type: 'farmer',
  farm_size: 'medium',
  location: 'US',
});
```

### Harvest Events

```typescript
// Harvest created
AnalyticsService.logHarvestCreated('Wheat', 500);

// Custom event
AnalyticsService.logEvent('harvest_edited', {
  crop_type: 'Wheat',
  quantity: 600,
  change: 100,
});
```

### Expense Events

```typescript
// Expense created
AnalyticsService.logExpenseCreated('Seeds', 450.00);

// Custom event
AnalyticsService.logEvent('expense_deleted', {
  category: 'Fertilizer',
  amount: 200.00,
});
```

### Marketplace Events

```typescript
// Product view
AnalyticsService.logProductView('prod_123', 'Wheat Seeds', 45.00);

// Add to cart
AnalyticsService.logAddToCart('prod_123', 'Wheat Seeds', 45.00, 10);

// Purchase
AnalyticsService.logPurchase('order_123', 620.00, [
  { item_id: 'prod_123', item_name: 'Wheat Seeds', price: 45.00, quantity: 10 },
  { item_id: 'prod_456', item_name: 'Fertilizer', price: 30.00, quantity: 5 },
]);
```

### ML Prediction Events

```typescript
// Yield prediction
AnalyticsService.logMLPrediction('yield', 'Wheat');

// Price forecast
AnalyticsService.logMLPrediction('price', 'Rice');
```

### Search Events

```typescript
AnalyticsService.logSearch('wheat seeds', 'marketplace');
```

---

## Error Tracking

### Capture Exceptions

```typescript
import SentryService from '@/services/sentry';

try {
  // Your code
} catch (error) {
  SentryService.captureException(error, {
    context: 'harvest_creation',
    user_action: 'save_harvest',
  });
}
```

### Capture Messages

```typescript
SentryService.captureMessage('Unusual behavior detected', 'warning');
```

### Set User Context

```typescript
// On login
SentryService.setUser({
  id: user.id,
  email: user.email,
  username: user.name,
});

// On logout
SentryService.clearUser();
```

### Add Breadcrumbs

```typescript
SentryService.addBreadcrumb({
  message: 'User clicked save button',
  category: 'user_action',
  level: 'info',
  data: { screen: 'HarvestCreate' },
});
```

### Track Navigation

```typescript
SentryService.trackNavigation('HarvestDetail', { harvestId: '123' });
```

### Track API Calls

```typescript
SentryService.trackAPICall('/api/harvests', 'POST', 201);
SentryService.trackAPICall('/api/harvests', 'GET', 500); // Error
```

### Track User Actions

```typescript
SentryService.trackUserAction('harvest_created', {
  crop_type: 'Wheat',
  quantity: 500,
});
```

---

## Usage Examples

### Example 1: Login Screen

```typescript
import AnalyticsService from '@/services/analytics';
import SentryService from '@/services/sentry';

const handleLogin = async () => {
  try {
    SentryService.trackUserAction('login_attempt', { method: 'email' });
    
    const user = await authService.login(email, password);
    
    // Analytics
    AnalyticsService.logLogin('email');
    AnalyticsService.setUserId(user.id);
    AnalyticsService.setUserProperties({
      user_type: user.type,
      registration_date: user.createdAt,
    });
    
    // Sentry
    SentryService.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });
    
    navigation.navigate('Home');
  } catch (error) {
    SentryService.captureException(error, {
      context: 'login',
      email,
    });
    Alert.alert('Error', 'Login failed');
  }
};
```

### Example 2: Harvest Creation

```typescript
import AnalyticsService from '@/services/analytics';
import SentryService from '@/services/sentry';

const handleSaveHarvest = async () => {
  try {
    SentryService.trackUserAction('harvest_save_attempt', {
      crop_type: cropType,
      quantity,
    });
    
    const harvest = await harvestService.create({
      cropType,
      quantity,
      date,
      location,
      photos,
    });
    
    // Analytics
    AnalyticsService.logHarvestCreated(cropType, quantity);
    
    // Sentry breadcrumb
    SentryService.addBreadcrumb({
      message: 'Harvest created successfully',
      category: 'harvest',
      level: 'info',
      data: { harvestId: harvest.id },
    });
    
    navigation.goBack();
  } catch (error) {
    SentryService.captureException(error, {
      context: 'harvest_creation',
      crop_type: cropType,
      quantity,
    });
    Alert.alert('Error', 'Failed to save harvest');
  }
};
```

### Example 3: Marketplace Purchase

```typescript
import AnalyticsService from '@/services/analytics';
import SentryService from '@/services/sentry';

const handlePlaceOrder = async () => {
  try {
    SentryService.trackUserAction('order_place_attempt', {
      total,
      item_count: cartItems.length,
    });
    
    const order = await marketplaceService.placeOrder({
      items: cartItems,
      deliveryAddress,
      phone,
    });
    
    // Analytics
    AnalyticsService.logPurchase(
      order.id,
      order.total,
      cartItems.map(item => ({
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
      }))
    );
    
    // Sentry
    SentryService.addBreadcrumb({
      message: 'Order placed successfully',
      category: 'marketplace',
      level: 'info',
      data: { orderId: order.id, total: order.total },
    });
    
    navigation.navigate('Orders');
  } catch (error) {
    SentryService.captureException(error, {
      context: 'order_placement',
      total,
      item_count: cartItems.length,
    });
    Alert.alert('Error', 'Failed to place order');
  }
};
```

---

## Best Practices

### Analytics Best Practices

1. **Track Key User Actions**
   - User registration and login
   - Feature usage (harvests, expenses, marketplace, ML)
   - Conversions (purchases, predictions)

2. **Use Consistent Event Names**
   - Use snake_case: `harvest_created`, `expense_deleted`
   - Be descriptive: `ml_yield_prediction_completed`
   - Group related events: `harvest_*`, `expense_*`, `marketplace_*`

3. **Include Relevant Context**
   - Crop types, categories, amounts
   - User properties (farm size, location)
   - Timestamps for time-based analysis

4. **Don't Overtrack**
   - Track meaningful actions, not every tap
   - Avoid tracking sensitive data (passwords, personal info)
   - Use sampling for high-frequency events

5. **Test Analytics**
   - Use Firebase DebugView during development
   - Verify events appear in Firebase Console
   - Check event parameters are correct

### Error Tracking Best Practices

1. **Capture Meaningful Errors**
   - Network errors
   - API errors
   - Unexpected exceptions
   - Critical user flow failures

2. **Add Context**
   - User ID and properties
   - Screen/component name
   - User action that triggered error
   - Relevant data (IDs, amounts, etc.)

3. **Use Breadcrumbs**
   - Track user navigation
   - Track API calls
   - Track user actions
   - Build timeline leading to error

4. **Set Appropriate Levels**
   - `fatal`: App crashes
   - `error`: Exceptions, failed operations
   - `warning`: Unusual behavior
   - `info`: Important events
   - `debug`: Detailed debugging info

5. **Filter Sensitive Data**
   - Remove passwords, tokens, API keys
   - Sanitize user data
   - Use `beforeSend` hook to filter

---

## Privacy Considerations

### Data Collection

**What We Track:**
- Screen views and navigation
- Feature usage (harvests, expenses, marketplace)
- ML prediction usage
- Errors and crashes
- Device information (OS, version, model)

**What We DON'T Track:**
- Passwords or authentication tokens
- Personal identification information (except user ID)
- Exact GPS coordinates (only general location)
- Private messages or notes
- Financial account information

### User Consent

**Privacy Policy:**
- Clearly state what data is collected
- Explain how data is used
- Provide opt-out mechanism
- Comply with GDPR, CCPA, and local regulations

**Example Privacy Policy Section:**
```
Analytics and Crash Reporting

We use Firebase Analytics and Sentry to improve app performance and user experience. This includes:
- Anonymous usage statistics
- Crash reports
- Feature usage patterns

You can opt out of analytics in Settings > Privacy.
```

### Opt-Out Mechanism

```typescript
// In Settings screen
const handleToggleAnalytics = async (enabled: boolean) => {
  await analytics().setAnalyticsCollectionEnabled(enabled);
  await AsyncStorage.setItem('analytics_enabled', String(enabled));
};
```

---

## Monitoring Dashboards

### Firebase Analytics Dashboard

**Key Metrics to Monitor:**
- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- User retention (1-day, 7-day, 30-day)
- Session duration
- Screen views per session
- Conversion rates (registrations, purchases)

**Custom Dashboards:**
1. Harvest Activity Dashboard
   - Harvests created per day
   - Top crop types
   - Average harvest quantity

2. Marketplace Dashboard
   - Product views
   - Add to cart rate
   - Purchase conversion rate
   - Average order value

3. ML Usage Dashboard
   - Yield predictions per day
   - Price forecasts per day
   - Most predicted crops

### Sentry Dashboard

**Key Metrics to Monitor:**
- Error rate (errors per session)
- Crash-free rate
- Most common errors
- Affected users
- Error trends over time

**Alerts:**
- Set up alerts for:
  - Crash rate > 1%
  - Error rate spike
  - New error types
  - Critical errors

---

## Troubleshooting

### Firebase Analytics Not Working

**Check:**
1. `GoogleService-Info.plist` (iOS) or `google-services.json` (Android) in correct location
2. Firebase initialized in App.tsx
3. Analytics enabled: `analytics().setAnalyticsCollectionEnabled(true)`
4. Events visible in Firebase DebugView (development mode)

**Debug Mode:**
```bash
# iOS
adb shell setprop debug.firebase.analytics.app com.farmerdata.app

# Android
adb shell setprop debug.firebase.analytics.app com.farmerdata.app
```

### Sentry Not Capturing Errors

**Check:**
1. Sentry DSN configured correctly
2. Sentry initialized in App.tsx
3. Error boundary wrapping app
4. Source maps uploaded for production builds

**Test Sentry:**
```typescript
// Trigger test error
SentryService.captureMessage('Test message', 'info');
throw new Error('Test error');
```

---

## Resources

- [Firebase Analytics Documentation](https://firebase.google.com/docs/analytics)
- [Sentry React Native Documentation](https://docs.sentry.io/platforms/react-native/)
- [React Native Firebase](https://rnfirebase.io/)
- [Google Analytics for Firebase](https://firebase.google.com/docs/analytics/get-started?platform=ios)

---

## Conclusion

Proper analytics and error tracking are essential for understanding user behavior, improving app quality, and making data-driven decisions. Follow this guide to set up comprehensive monitoring for your mobile app.
