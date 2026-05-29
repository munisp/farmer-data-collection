import { device, element, by, expect } from 'detox';

describe('Farmer Registration Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should show onboarding screen on first launch', async () => {
    await expect(element(by.id('onboarding-screen'))).toBeVisible();
  });

  it('should navigate to registration from onboarding', async () => {
    await element(by.id('get-started-button')).tap();
    await expect(element(by.id('registration-screen'))).toBeVisible();
  });

  it('should validate required fields', async () => {
    await element(by.id('submit-registration')).tap();
    await expect(element(by.id('name-error'))).toBeVisible();
    await expect(element(by.id('phone-error'))).toBeVisible();
  });

  it('should register a new farmer with valid data', async () => {
    await element(by.id('farmer-name-input')).typeText('Amina Bello');
    await element(by.id('farmer-phone-input')).typeText('+2348012345678');
    await element(by.id('farmer-state-picker')).tap();
    await element(by.text('Oyo')).tap();
    await element(by.id('farmer-lga-picker')).tap();
    await element(by.text('Ibadan North')).tap();
    await element(by.id('submit-registration')).tap();

    await expect(element(by.id('registration-success'))).toBeVisible();
  });

  it('should navigate to dashboard after registration', async () => {
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
    await expect(element(by.text('Welcome, Amina'))).toBeVisible();
  });
});

describe('Farm Data Collection (Offline)', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should show farm list', async () => {
    await element(by.id('tab-farms')).tap();
    await expect(element(by.id('farm-list'))).toBeVisible();
  });

  it('should allow adding a new farm', async () => {
    await element(by.id('add-farm-button')).tap();
    await expect(element(by.id('farm-form'))).toBeVisible();

    await element(by.id('farm-name-input')).typeText('Amina Farm 1');
    await element(by.id('farm-size-input')).typeText('2.5');
    await element(by.id('farm-crop-picker')).tap();
    await element(by.text('Cassava')).tap();
  });

  it('should queue data when offline', async () => {
    await device.setURLBlacklist(['.*']);
    await element(by.id('save-farm-button')).tap();
    await expect(element(by.id('sync-pending-badge'))).toBeVisible();
    await device.setURLBlacklist([]);
  });

  it('should sync when back online', async () => {
    await expect(element(by.id('sync-success'))).toBeVisible();
  });
});

describe('Marketplace Browsing', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should show marketplace tab', async () => {
    await element(by.id('tab-marketplace')).tap();
    await expect(element(by.id('marketplace-screen'))).toBeVisible();
  });

  it('should display produce listings', async () => {
    await expect(element(by.id('listing-card-0'))).toBeVisible();
  });

  it('should filter by crop type', async () => {
    await element(by.id('filter-crop')).tap();
    await element(by.text('Rice')).tap();
    await expect(element(by.id('listing-card-0'))).toBeVisible();
  });
});
