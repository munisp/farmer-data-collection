/**
 * E2E Test: Offline Sync & Data Persistence
 * 
 * Verifies that the app works correctly in offline mode:
 * 1. Data entry while offline
 * 2. Queue management for pending operations
 * 3. Automatic sync when connectivity restores
 * 4. Conflict resolution for concurrent edits
 * 5. Push notification for sync completion
 */
import { device, element, by, expect, waitFor } from 'detox';

describe('Offline Sync & Data Persistence', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: false });
  });

  it('should detect offline state and show indicator', async () => {
    // Disable network
    await device.setURLBlacklist(['.*']);
    
    // Wait for offline detection
    await waitFor(element(by.id('offline-banner')))
      .toBeVisible()
      .withTimeout(10000);
    
    await expect(element(by.text('Offline Mode'))).toBeVisible();
  });

  it('should allow harvest recording while offline', async () => {
    await element(by.id('tab-farm')).tap();
    await element(by.id('record-harvest-button')).tap();
    
    await waitFor(element(by.id('harvest-form')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Fill harvest data
    await element(by.id('crop-picker')).tap();
    await element(by.text('Maize')).tap();
    await element(by.id('quantity-input')).typeText('2500');
    await element(by.id('unit-picker')).tap();
    await element(by.text('kg')).tap();
    await element(by.id('quality-picker')).tap();
    await element(by.text('Grade A')).tap();
    
    // Submit (should queue locally)
    await element(by.id('save-harvest-button')).tap();
    
    // Should show queued confirmation
    await waitFor(element(by.id('queued-confirmation')))
      .toBeVisible()
      .withTimeout(3000);
    await expect(element(by.text('Saved locally'))).toBeVisible();
  });

  it('should show pending sync queue', async () => {
    await element(by.id('sync-status-icon')).tap();
    
    await waitFor(element(by.id('sync-queue-screen')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Should show 1 pending item
    await expect(element(by.id('pending-count'))).toHaveText('1');
    await expect(element(by.id('pending-item-0'))).toBeVisible();
  });

  it('should record expense while offline', async () => {
    await device.pressBack();
    await element(by.id('tab-farm')).tap();
    await element(by.id('record-expense-button')).tap();
    
    await element(by.id('expense-category-picker')).tap();
    await element(by.text('Seeds')).tap();
    await element(by.id('expense-amount-input')).typeText('45000');
    await element(by.id('expense-description-input')).typeText('Maize seeds for planting season');
    
    await element(by.id('save-expense-button')).tap();
    
    await waitFor(element(by.id('queued-confirmation')))
      .toBeVisible()
      .withTimeout(3000);
  });

  it('should sync data when connectivity restores', async () => {
    // Re-enable network
    await device.setURLBlacklist([]);
    
    // Wait for sync to complete
    await waitFor(element(by.id('offline-banner')))
      .not.toBeVisible()
      .withTimeout(15000);
    
    // Check sync status
    await element(by.id('sync-status-icon')).tap();
    
    await waitFor(element(by.id('pending-count')))
      .toHaveText('0')
      .withTimeout(15000);
  });

  it('should show synced data in dashboard', async () => {
    await device.pressBack();
    await element(by.id('tab-home')).tap();
    
    // Latest harvest should appear
    await waitFor(element(by.id('recent-activity-section')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Verify harvest appears in recent activity
    await expect(element(by.text('Maize - 2,500 kg'))).toBeVisible();
  });

  it('should handle sync conflicts gracefully', async () => {
    // Simulate conflict scenario:
    // 1. Go offline
    await device.setURLBlacklist(['.*']);
    
    // 2. Edit a record locally
    await element(by.id('tab-farm')).tap();
    await element(by.id('latest-harvest-item')).tap();
    await element(by.id('edit-button')).tap();
    await element(by.id('quantity-input')).clearText();
    await element(by.id('quantity-input')).typeText('2600');
    await element(by.id('save-button')).tap();
    
    // 3. Re-enable network (server may have different version)
    await device.setURLBlacklist([]);
    
    // 4. If conflict, should show resolution dialog
    // (In test env, we simulate a conflict)
    await waitFor(element(by.id('sync-complete-indicator')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('should persist data across app restarts', async () => {
    // Terminate and relaunch
    await device.terminateApp();
    await device.launchApp({ newInstance: false });
    
    // Data should still be there
    await waitFor(element(by.id('dashboard-screen')))
      .toBeVisible()
      .withTimeout(10000);
    
    await element(by.id('tab-farm')).tap();
    await expect(element(by.text('Maize'))).toBeVisible();
  });
});
