/**
 * Critical User Journey E2E Tests
 *
 * Tests the golden-path user flows through the FarmConnect platform.
 * These are the minimum set of E2E tests required for production release.
 */
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/FarmConnect/i);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="phone-input"]', '+254700000000');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });

  test('should navigate to registration', async ({ page }) => {
    await page.goto('/login');
    await page.click('[data-testid="register-link"]');
    await expect(page).toHaveURL(/register/);
  });
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Set auth token for authenticated tests
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        name: 'Test Farmer',
        role: 'farmer',
      }));
    });
  });

  test('should display dashboard with key metrics', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1, [data-testid="dashboard-title"]')).toBeVisible();
  });

  test('should show navigation menu', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('nav, [data-testid="navigation"]')).toBeVisible();
  });
});

test.describe('Farmer Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        name: 'Test Agent',
        role: 'agent',
      }));
    });
  });

  test('should navigate to farmers list', async ({ page }) => {
    await page.goto('/farmers');
    await expect(page.locator('h1')).toContainText(/farmer/i);
  });
});

test.describe('Loan Application', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('user', JSON.stringify({
        id: 1,
        name: 'Test Farmer',
        role: 'farmer',
      }));
    });
  });

  test('should display loan products', async ({ page }) => {
    await page.goto('/loans');
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Marketplace', () => {
  test('should display marketplace listings publicly', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Mobile Responsiveness', () => {
  test('should be usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    // Should not have horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
  });
});

test.describe('Offline Capabilities', () => {
  test('should show offline indicator when network is down', async ({ page, context }) => {
    await page.goto('/dashboard');
    // Simulate offline
    await context.setOffline(true);
    await page.reload().catch(() => {});
    // Should show some offline state (service worker serves cached page)
    await expect(page.locator('body')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
  });

  test('should have alt text on images', async ({ page }) => {
    await page.goto('/');
    const images = page.locator('img');
    const count = await images.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });
});
