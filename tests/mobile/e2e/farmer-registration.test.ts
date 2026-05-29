/**
 * E2E Test: Farmer Registration Flow
 * 
 * Verifies the complete farmer onboarding journey:
 * 1. Welcome screen → Sign Up
 * 2. Phone number entry + OTP verification
 * 3. Profile creation (name, location, farm size)
 * 4. Farm registration (crops, livestock)
 * 5. KYC document upload
 * 6. Dashboard landing
 * 
 * Target: iOS Simulator (iPhone 15) or Android Emulator (Pixel 7)
 */
import { device, element, by, expect, waitFor } from 'detox';

describe('Farmer Registration Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  it('should display welcome screen with sign up option', async () => {
    await expect(element(by.id('welcome-screen'))).toBeVisible();
    await expect(element(by.id('sign-up-button'))).toBeVisible();
    await expect(element(by.id('login-button'))).toBeVisible();
    await expect(element(by.text('FarmConnect'))).toBeVisible();
  });

  it('should navigate to phone number entry', async () => {
    await element(by.id('sign-up-button')).tap();
    await expect(element(by.id('phone-input'))).toBeVisible();
    await expect(element(by.text('Enter your phone number'))).toBeVisible();
  });

  it('should enter phone number and request OTP', async () => {
    await element(by.id('country-code-picker')).tap();
    await element(by.text('+234')).tap(); // Nigeria
    await element(by.id('phone-input')).typeText('8012345678');
    await element(by.id('request-otp-button')).tap();
    
    // Should show OTP input
    await waitFor(element(by.id('otp-input')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should verify OTP code', async () => {
    // In test environment, OTP is always 123456
    await element(by.id('otp-input')).typeText('123456');
    await element(by.id('verify-otp-button')).tap();
    
    // Should proceed to profile creation
    await waitFor(element(by.id('profile-form')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should fill in personal profile', async () => {
    await element(by.id('first-name-input')).typeText('Adewale');
    await element(by.id('last-name-input')).typeText('Ogundimu');
    await element(by.id('gender-picker')).tap();
    await element(by.text('Male')).tap();
    
    // Location selection
    await element(by.id('state-picker')).tap();
    await element(by.text('Oyo')).tap();
    await element(by.id('lga-picker')).tap();
    await element(by.text('Ibadan North')).tap();
    
    await element(by.id('next-button')).tap();
    
    // Should proceed to farm registration
    await waitFor(element(by.id('farm-form')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should register farm details', async () => {
    await element(by.id('farm-name-input')).typeText('Ogundimu Family Farm');
    await element(by.id('farm-size-input')).typeText('5.5');
    await element(by.id('farm-size-unit-picker')).tap();
    await element(by.text('Hectares')).tap();
    
    // Select crops
    await element(by.id('crop-selector')).tap();
    await element(by.text('Maize')).tap();
    await element(by.text('Cassava')).tap();
    await element(by.text('Done')).tap();
    
    // Farming type
    await element(by.id('farming-type-picker')).tap();
    await element(by.text('Mixed (Crops & Livestock)')).tap();
    
    await element(by.id('next-button')).tap();
    
    await waitFor(element(by.id('kyc-upload')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should handle KYC document upload', async () => {
    // Select ID type
    await element(by.id('id-type-picker')).tap();
    await element(by.text('National ID (NIN)')).tap();
    
    // Upload document (mock camera/gallery in test)
    await element(by.id('upload-front-button')).tap();
    // In test mode, this uses a pre-loaded test image
    
    await waitFor(element(by.id('document-preview')))
      .toBeVisible()
      .withTimeout(10000);
    
    await element(by.id('confirm-upload-button')).tap();
    
    // Skip back photo for testing
    await element(by.id('skip-back-button')).tap();
    await element(by.id('submit-kyc-button')).tap();
    
    await waitFor(element(by.id('kyc-pending-message')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should land on dashboard after registration', async () => {
    await element(by.id('continue-to-dashboard')).tap();
    
    await waitFor(element(by.id('dashboard-screen')))
      .toBeVisible()
      .withTimeout(10000);
    
    // Verify key dashboard elements
    await expect(element(by.id('farmer-name-text'))).toHaveText('Adewale Ogundimu');
    await expect(element(by.id('farm-summary-card'))).toBeVisible();
    await expect(element(by.id('weather-widget'))).toBeVisible();
    await expect(element(by.id('quick-actions'))).toBeVisible();
  });

  it('should show offline indicator when disconnected', async () => {
    // Disable network
    await device.setURLBlacklist(['.*']);
    
    await waitFor(element(by.id('offline-banner')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Re-enable network
    await device.setURLBlacklist([]);
    
    await waitFor(element(by.id('offline-banner')))
      .not.toBeVisible()
      .withTimeout(10000);
  });
});
