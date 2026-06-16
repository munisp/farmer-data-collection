/**
 * Vitest Integration Test Configuration
 * 
 * Runs tests that require a live PostgreSQL database and external services.
 * Usage: npx vitest run --config vitest.integration.config.ts
 * 
 * Prerequisites:
 *   - PostgreSQL running with DATABASE_URL set
 *   - Migrations applied
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'server/__tests__/auth.test.ts',
      'server/__tests__/auth-integration.test.ts',
      'server/__tests__/farmer-crud.test.ts',
      'server/__tests__/integration.test.ts',
      'server/__tests__/loan-approval.test.ts',
      'server/__tests__/messaging-service.test.ts',
      'server/__tests__/messaging-channels.test.ts',
      'server/__tests__/marketplace-image-upload.test.ts',
      'server/__tests__/review-analytics.test.ts',
      'server/__tests__/review-purchase-verification.test.ts',
      'server/__tests__/ml-predictions-farm-data.test.ts',
      'server/__tests__/sync.test.ts',
      'server/__tests__/sync-improved.test.ts',
      'server/routers/__tests__/sms-templates-router.test.ts',
      'server/routers/__tests__/health-router.test.ts',
      'tests/marketplace.test.ts',
      'tests/microfinance.test.ts',
      'server/__tests__/accounting-router.test.ts',
      'server/__tests__/analytics-enhancements.test.ts',
      'server/__tests__/analytics-router.test.ts',
      'server/__tests__/e2e-critical-flows.test.ts',
      'server/__tests__/hr-router.test.ts',
      'server/__tests__/inventory-router.test.ts',
      'server/__tests__/microfinance-procedures.test.ts',
      'server/__tests__/new-features.test.ts',
      'server/services/__tests__/payment-reminder-cron.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'client', 'mobile/**'],
    testTimeout: 60000,
    setupFiles: ['./tests/setup.ts'],
  },
});
