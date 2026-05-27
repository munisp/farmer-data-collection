# Mobile App Testing Guide

Complete testing documentation for the Farmer Data Collection mobile app.

---

## Table of Contents

1. [Development Testing](#development-testing)
2. [Device Testing](#device-testing)
3. [Feature Testing Checklist](#feature-testing-checklist)
4. [Performance Testing](#performance-testing)
5. [Security Testing](#security-testing)
6. [App Store Submission Testing](#app-store-submission-testing)

---

## Development Testing

### Prerequisites

- Node.js 18+ installed
- Expo CLI installed globally: `npm install -g expo-cli`
- iOS Simulator (macOS only) or Android Emulator
- Physical iOS/Android device with Expo Go app installed

### Start Development Server

```bash
cd mobile
npx expo start
```

### Testing Options

**Option 1: Expo Go (Recommended for Development)**
1. Install Expo Go app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent))
2. Scan QR code from terminal
3. App loads instantly with hot reload

**Option 2: iOS Simulator (macOS only)**
```bash
npx expo start --ios
```

**Option 3: Android Emulator**
```bash
npx expo start --android
```

---

## Device Testing

### iOS Device Testing

**Requirements:**
- iPhone running iOS 15.1 or later
- Expo Go app installed
- Same WiFi network as development machine

**Steps:**
1. Open Expo Go app
2. Scan QR code from terminal
3. App loads on device

**Native Features to Test:**
- ✅ Camera (harvest/expense photos)
- ✅ Photo library access
- ✅ GPS location (field mapping)
- ✅ Face ID / Touch ID (biometric auth)
- ✅ Push notifications
- ✅ Offline mode (airplane mode)
- ✅ Background sync

### Android Device Testing

**Requirements:**
- Android device running Android 6.0 (API 23) or later
- Expo Go app installed
- Same WiFi network as development machine

**Steps:**
1. Open Expo Go app
2. Scan QR code from terminal
3. App loads on device

**Native Features to Test:**
- ✅ Camera (harvest/expense photos)
- ✅ Photo library access
- ✅ GPS location (field mapping)
- ✅ Fingerprint / Face unlock (biometric auth)
- ✅ Push notifications
- ✅ Offline mode (airplane mode)
- ✅ Background sync

---

## Feature Testing Checklist

### Authentication Module (2 screens)

**LoginScreen**
- [ ] Email validation (valid/invalid formats)
- [ ] Password validation (minimum length)
- [ ] Login with valid credentials
- [ ] Login with invalid credentials (error message)
- [ ] "Remember me" checkbox functionality
- [ ] Biometric login (Face ID/Touch ID/Fingerprint)
- [ ] Navigation to Register screen
- [ ] Loading state during login
- [ ] Error handling (network errors)

**RegisterScreen**
- [ ] All form fields validation
- [ ] Password strength indicator
- [ ] Password confirmation match
- [ ] Register with valid data
- [ ] Register with duplicate email (error)
- [ ] Navigation back to Login
- [ ] Loading state during registration

### Home Module (1 screen)

**HomeScreen**
- [ ] Dashboard loads with user data
- [ ] Sync status indicator visible
- [ ] Quick action buttons work
- [ ] Navigation to all modules
- [ ] Pull-to-refresh functionality
- [ ] Offline mode indicator

### Harvests Module (4 screens)

**HarvestListScreen**
- [ ] List loads with all harvests
- [ ] Empty state when no harvests
- [ ] Pull-to-refresh
- [ ] Search functionality
- [ ] Filter by crop type
- [ ] Sort by date/quantity
- [ ] Navigation to detail screen
- [ ] Navigation to create screen
- [ ] Offline data display

**HarvestDetailScreen**
- [ ] All harvest details display correctly
- [ ] Photo gallery works
- [ ] Location map displays
- [ ] Edit button navigates to edit screen
- [ ] Delete button with confirmation
- [ ] Back navigation

**HarvestCreateScreen**
- [ ] All form fields work
- [ ] Crop type selection
- [ ] Quantity input with validation
- [ ] Date picker
- [ ] Camera integration (take photo)
- [ ] Photo library integration (select photo)
- [ ] GPS location capture
- [ ] Manual location entry
- [ ] Form validation
- [ ] Save button creates harvest
- [ ] Offline creation (queued for sync)
- [ ] Success message
- [ ] Navigation back to list

**HarvestEditScreen**
- [ ] Form pre-fills with existing data
- [ ] All fields editable
- [ ] Photo update/delete
- [ ] Location update
- [ ] Save button updates harvest
- [ ] Cancel button discards changes
- [ ] Validation on save

### Expenses Module (4 screens)

**ExpenseListScreen**
- [ ] List loads with all expenses
- [ ] Empty state when no expenses
- [ ] Pull-to-refresh
- [ ] Search functionality
- [ ] Filter by category
- [ ] Sort by date/amount
- [ ] Total expenses calculation
- [ ] Navigation to detail screen
- [ ] Navigation to create screen

**ExpenseDetailScreen**
- [ ] All expense details display
- [ ] Receipt photo displays
- [ ] Category badge displays
- [ ] Edit button works
- [ ] Delete button with confirmation
- [ ] Back navigation

**ExpenseCreateScreen**
- [ ] All form fields work
- [ ] Category selection
- [ ] Amount input with validation
- [ ] Date picker
- [ ] Camera for receipt photo
- [ ] Photo library for receipt
- [ ] Notes field
- [ ] Form validation
- [ ] Save creates expense
- [ ] Offline creation
- [ ] Success message

**ExpenseEditScreen**
- [ ] Form pre-fills correctly
- [ ] All fields editable
- [ ] Receipt photo update
- [ ] Save updates expense
- [ ] Cancel discards changes

### Marketplace Module (5 screens)

**MarketplaceBrowseScreen**
- [ ] Product list loads
- [ ] Search functionality
- [ ] Category filtering
- [ ] Price sorting
- [ ] Availability badge
- [ ] Seller information displays
- [ ] Distance calculation
- [ ] Navigation to detail screen
- [ ] Pull-to-refresh

**MarketplaceDetailScreen**
- [ ] Product details display
- [ ] Price and unit display
- [ ] Seller information
- [ ] Description text
- [ ] Available quantity
- [ ] "Add to Cart" button works
- [ ] "Contact Seller" button works
- [ ] Back navigation

**CartScreen**
- [ ] Cart items display
- [ ] Quantity display
- [ ] Price calculation
- [ ] Total calculation
- [ ] Remove item functionality
- [ ] Empty cart state
- [ ] "Proceed to Checkout" button
- [ ] Navigation to marketplace

**CheckoutScreen**
- [ ] Order summary displays
- [ ] Subtotal calculation
- [ ] Delivery fee calculation
- [ ] Total calculation
- [ ] Delivery address input
- [ ] Phone number input
- [ ] Delivery notes input
- [ ] Form validation
- [ ] "Place Order" button
- [ ] Loading state
- [ ] Success message
- [ ] Navigation to orders

**OrdersScreen**
- [ ] Order list loads
- [ ] Order number displays
- [ ] Order date displays
- [ ] Order status badge
- [ ] Item count displays
- [ ] Total amount displays
- [ ] Status colors correct
- [ ] Empty state when no orders
- [ ] Pull-to-refresh
- [ ] Navigation to order detail (if implemented)

### ML Module (2 screens)

**YieldPredictionScreen**
- [ ] Form fields work
- [ ] Crop type input
- [ ] Field size input (numeric)
- [ ] Soil type input
- [ ] Rainfall input (numeric)
- [ ] Form validation
- [ ] "Predict Yield" button
- [ ] Loading state (2 seconds)
- [ ] Prediction results display
- [ ] Estimated yield calculation
- [ ] Confidence percentage
- [ ] Result note displays
- [ ] Back navigation

**PriceForecastScreen**
- [ ] Form fields work
- [ ] Crop type input
- [ ] Quantity input (numeric)
- [ ] Form validation
- [ ] "Get Price Forecast" button
- [ ] Loading state (2 seconds)
- [ ] Current price displays
- [ ] 7-day forecast displays
- [ ] 30-day forecast displays
- [ ] Market trend badge
- [ ] Trend color coding (up=green, down=red, stable=yellow)
- [ ] Trend icon displays
- [ ] Result note displays
- [ ] Back navigation

### Profile Module (2 screens)

**ProfileScreen**
- [ ] User information displays
- [ ] Profile photo displays
- [ ] Edit profile button
- [ ] Settings button
- [ ] Logout button with confirmation
- [ ] Navigation to settings

**SettingsScreen**
- [ ] Settings list displays
- [ ] Toggle switches work
- [ ] Notification settings
- [ ] Theme settings (if implemented)
- [ ] Language settings (if implemented)
- [ ] About section
- [ ] Version number displays
- [ ] Back navigation

---

## Performance Testing

### Load Time Testing
- [ ] App launch time < 3 seconds
- [ ] Screen navigation < 500ms
- [ ] List rendering < 1 second
- [ ] Image loading with placeholders
- [ ] Smooth scrolling (60 FPS)

### Memory Testing
- [ ] No memory leaks on navigation
- [ ] Image memory management
- [ ] Large list virtualization
- [ ] Background memory usage

### Network Testing
- [ ] API calls complete within timeout
- [ ] Retry logic on failure
- [ ] Offline queue works
- [ ] Sync on network restore
- [ ] Loading indicators

### Battery Testing
- [ ] Background sync doesn't drain battery
- [ ] GPS usage optimized
- [ ] Camera usage optimized
- [ ] No excessive wake locks

---

## Security Testing

### Authentication
- [ ] Tokens stored securely (Keychain/Keystore)
- [ ] Biometric authentication works
- [ ] Session timeout works
- [ ] Logout clears sensitive data

### Data Security
- [ ] SQLite database encrypted (if implemented)
- [ ] Sensitive data not logged
- [ ] HTTPS for all API calls
- [ ] Input validation prevents injection

### Permissions
- [ ] Camera permission requested properly
- [ ] Location permission requested properly
- [ ] Photo library permission requested properly
- [ ] Biometric permission requested properly
- [ ] Notification permission requested properly

---

## App Store Submission Testing

### iOS App Store Requirements

**Functionality**
- [ ] App doesn't crash
- [ ] All features work as described
- [ ] No placeholder content
- [ ] Links work correctly

**Design**
- [ ] App icon meets requirements (1024x1024)
- [ ] Splash screen displays correctly
- [ ] UI is polished and professional
- [ ] No design inconsistencies

**Legal**
- [ ] Privacy policy URL (if collecting data)
- [ ] Terms of service URL (if required)
- [ ] Age rating appropriate
- [ ] Copyright information

**Metadata**
- [ ] App name (30 characters max)
- [ ] Subtitle (30 characters max)
- [ ] Description (4000 characters max)
- [ ] Keywords (100 characters max)
- [ ] Screenshots (6.5", 5.5" required)
- [ ] App preview video (optional)

### Google Play Store Requirements

**Functionality**
- [ ] App doesn't crash
- [ ] All features work as described
- [ ] No placeholder content
- [ ] Links work correctly

**Design**
- [ ] App icon meets requirements (512x512)
- [ ] Feature graphic (1024x500)
- [ ] Screenshots (minimum 2)
- [ ] UI is polished

**Legal**
- [ ] Privacy policy URL (required)
- [ ] Content rating questionnaire
- [ ] Target audience
- [ ] App category

**Metadata**
- [ ] App name (50 characters max)
- [ ] Short description (80 characters max)
- [ ] Full description (4000 characters max)
- [ ] Screenshots (minimum 2, maximum 8)
- [ ] Feature graphic required

---

## Common Issues and Solutions

### Issue: App won't load on device
**Solution:** Ensure device and computer are on same WiFi network

### Issue: Camera permission denied
**Solution:** Go to device Settings > App > Permissions > Enable Camera

### Issue: GPS not working
**Solution:** Enable Location Services in device settings

### Issue: Biometric auth not working
**Solution:** Ensure biometric is set up in device settings

### Issue: Push notifications not received
**Solution:** Check notification permissions in device settings

### Issue: Offline sync not working
**Solution:** Check network detection logic and sync queue

### Issue: Images not loading
**Solution:** Check image URLs and network connection

### Issue: App crashes on startup
**Solution:** Check error logs in Expo Dev Tools or Sentry

---

## Testing Best Practices

1. **Test on Multiple Devices**
   - Test on at least one iOS and one Android device
   - Test on different screen sizes
   - Test on different OS versions

2. **Test Different Network Conditions**
   - WiFi
   - 4G/5G
   - Slow 3G
   - Offline mode
   - Intermittent connection

3. **Test Edge Cases**
   - Empty states
   - Error states
   - Loading states
   - Very long text
   - Special characters
   - Large datasets

4. **Test User Flows**
   - Complete registration to first harvest
   - Create harvest with photo and location
   - Create expense with receipt
   - Browse marketplace and place order
   - Use ML prediction tools
   - Logout and login

5. **Test Accessibility**
   - Screen reader support
   - Font scaling
   - Color contrast
   - Touch target sizes

---

## Automated Testing (Future)

### Unit Tests (Jest)
```bash
cd mobile
npm test
```

### E2E Tests (Detox)
```bash
cd mobile
npm run test:e2e
```

### Integration Tests
```bash
cd mobile
npm run test:integration
```

---

## Reporting Bugs

When reporting bugs, include:
- Device model and OS version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots/videos
- Error logs from Expo Dev Tools

---

## Conclusion

This testing guide covers all aspects of mobile app testing. Follow this checklist before submitting to app stores to ensure a high-quality user experience.

For questions or issues, refer to:
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- Project README.md
