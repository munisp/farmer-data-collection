/**
 * E2E Test: Loan Application Flow
 * 
 * Verifies the complete loan application journey:
 * 1. Navigate to Microfinance section
 * 2. View available loan products
 * 3. Apply for a loan (amount, purpose, duration)
 * 4. Review terms & conditions
 * 5. Submit application
 * 6. Track application status
 * 7. Receive disbursement notification
 */
import { device, element, by, expect, waitFor } from 'detox';

describe('Loan Application Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: false });
    // Navigate to microfinance from dashboard
    await element(by.id('tab-finance')).tap();
  });

  it('should display microfinance section with loan products', async () => {
    await expect(element(by.id('finance-screen'))).toBeVisible();
    await expect(element(by.id('loan-products-section'))).toBeVisible();
    
    // Should show at least one loan product
    await expect(element(by.id('loan-product-0'))).toBeVisible();
  });

  it('should show loan product details', async () => {
    await element(by.id('loan-product-0')).tap();
    
    await waitFor(element(by.id('loan-product-details')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Verify product info
    await expect(element(by.id('interest-rate'))).toBeVisible();
    await expect(element(by.id('max-amount'))).toBeVisible();
    await expect(element(by.id('tenure-range'))).toBeVisible();
    await expect(element(by.id('eligibility-criteria'))).toBeVisible();
  });

  it('should start loan application', async () => {
    await element(by.id('apply-now-button')).tap();
    
    await waitFor(element(by.id('loan-application-form')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should fill loan amount and purpose', async () => {
    // Enter amount
    await element(by.id('loan-amount-input')).typeText('150000');
    
    // Select purpose
    await element(by.id('loan-purpose-picker')).tap();
    await element(by.text('Farm Inputs (Seeds & Fertilizer)')).tap();
    
    // Select duration
    await element(by.id('loan-duration-picker')).tap();
    await element(by.text('12 months')).tap();
    
    // Should show monthly repayment preview
    await waitFor(element(by.id('monthly-repayment-preview')))
      .toBeVisible()
      .withTimeout(3000);
  });

  it('should display credit score and eligibility', async () => {
    await element(by.id('check-eligibility-button')).tap();
    
    await waitFor(element(by.id('credit-score-display')))
      .toBeVisible()
      .withTimeout(10000);
    
    // Should show score band
    await expect(element(by.id('score-band'))).toBeVisible();
    await expect(element(by.id('eligibility-status'))).toBeVisible();
  });

  it('should review terms and conditions', async () => {
    await element(by.id('proceed-button')).tap();
    
    await waitFor(element(by.id('terms-screen')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Scroll through terms
    await element(by.id('terms-scroll-view')).scrollTo('bottom');
    
    // Accept terms
    await element(by.id('accept-terms-checkbox')).tap();
    await expect(element(by.id('submit-application-button'))).toBeVisible();
  });

  it('should submit loan application', async () => {
    await element(by.id('submit-application-button')).tap();
    
    // Should show confirmation
    await waitFor(element(by.id('application-submitted-screen')))
      .toBeVisible()
      .withTimeout(10000);
    
    await expect(element(by.id('application-reference'))).toBeVisible();
    await expect(element(by.text('Application Submitted'))).toBeVisible();
  });

  it('should track application status', async () => {
    await element(by.id('track-status-button')).tap();
    
    await waitFor(element(by.id('loan-status-screen')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Should show status timeline
    await expect(element(by.id('status-timeline'))).toBeVisible();
    await expect(element(by.id('status-submitted'))).toBeVisible();
  });

  it('should handle offline loan application gracefully', async () => {
    // Go offline
    await device.setURLBlacklist(['.*']);
    
    // Navigate back and try another application
    await device.pressBack();
    await element(by.id('apply-now-button')).tap();
    
    // Should show offline mode indicator
    await waitFor(element(by.id('offline-mode-notice')))
      .toBeVisible()
      .withTimeout(5000);
    
    // Should still allow form filling (queued for sync)
    await element(by.id('loan-amount-input')).typeText('50000');
    
    // Re-enable network
    await device.setURLBlacklist([]);
  });
});
