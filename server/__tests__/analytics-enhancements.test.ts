import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../trpc.js';
import { getDb } from '../db.js';
import { messageLogs, users } from '../../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

describe('Analytics Enhancements', () => {
  let testUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;

    // Create test user
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    const [user] = await db
      .insert(users)
      .values({
        email: `analytics-enhancements-test-${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: 'Analytics',
        lastName: 'Enhancements',
        role: 'farmer',
      })
      .returning();
    testUserId = user.id;

    // Insert test message logs for historical trends
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    await db.insert(messageLogs).values([
      {
        phoneNumber: '+1111111111',
        channel: 'whatsapp',
        direction: 'outbound',
        messageText: 'Test message day 0',
        status: 'success',
        createdAt: now,
      },
      {
        phoneNumber: '+1111111111',
        channel: 'whatsapp',
        direction: 'outbound',
        messageText: 'Test message day 1',
        status: 'success',
        createdAt: yesterday,
      },
      {
        phoneNumber: '+2222222222',
        channel: 'sms',
        direction: 'outbound',
        messageText: 'Test SMS day 2',
        status: 'success',
        createdAt: twoDaysAgo,
      },
      {
        phoneNumber: '+1111111111',
        channel: 'whatsapp',
        direction: 'outbound',
        messageText: 'Test message day 3',
        status: 'success',
        createdAt: threeDaysAgo,
      },
    ]);
  });

  describe('Historical Trends', () => {
    it('should get historical trends with daily granularity', async () => {
      const caller = appRouter.createCaller({
        db: await getDb(),
        user: null,
        token: null,
      });

      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await caller.analytics.getHistoricalTrends({
        startDate,
        endDate,
        granularity: 'daily',
      });

      expect(result).toBeDefined();
      expect(result.messageVolume).toBeDefined();
      expect(Array.isArray(result.messageVolume)).toBe(true);
      expect(result.userGrowth).toBeDefined();
      expect(Array.isArray(result.userGrowth)).toBe(true);
      expect(result.costTrend).toBeDefined();
      expect(Array.isArray(result.costTrend)).toBe(true);
      expect(result.engagementRate).toBeDefined();
      expect(Array.isArray(result.engagementRate)).toBe(true);

      // Verify data structure
      if (result.messageVolume.length > 0) {
        const dataPoint = result.messageVolume[0];
        expect(dataPoint.date).toBeDefined();
        expect(typeof dataPoint.date).toBe('string');
        expect(dataPoint.value).toBeDefined();
        expect(typeof dataPoint.value).toBe('number');
      }
    });

    it('should get historical trends with weekly granularity', async () => {
      const caller = appRouter.createCaller({
        db: await getDb(),
        user: null,
        token: null,
      });

      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await caller.analytics.getHistoricalTrends({
        startDate,
        endDate,
        granularity: 'weekly',
      });

      expect(result).toBeDefined();
      expect(result.messageVolume).toBeDefined();
      expect(Array.isArray(result.messageVolume)).toBe(true);
    });

    it('should get historical trends with monthly granularity', async () => {
      const caller = appRouter.createCaller({
        db: await getDb(),
        user: null,
        token: null,
      });

      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await caller.analytics.getHistoricalTrends({
        startDate,
        endDate,
        granularity: 'monthly',
      });

      expect(result).toBeDefined();
      expect(result.messageVolume).toBeDefined();
      expect(Array.isArray(result.messageVolume)).toBe(true);
    });
  });

  describe('Period Comparison', () => {
    it('should compare two periods and calculate changes', async () => {
      const caller = appRouter.createCaller({
        db: await getDb(),
        user: null,
        token: null,
      });

      const currentEnd = new Date().toISOString().split('T')[0];
      const currentStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const previousEnd = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const previousStart = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await caller.analytics.getPeriodComparison({
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      // Verify comparison structure
      const comparison = result[0];
      expect(comparison.metric).toBeDefined();
      expect(typeof comparison.metric).toBe('string');
      expect(comparison.currentValue).toBeDefined();
      expect(typeof comparison.currentValue).toBe('number');
      expect(comparison.previousValue).toBeDefined();
      expect(typeof comparison.previousValue).toBe('number');
      expect(comparison.change).toBeDefined();
      expect(typeof comparison.change).toBe('number');
      expect(comparison.changePercent).toBeDefined();
      expect(typeof comparison.changePercent).toBe('number');
    });

    it('should calculate percentage change correctly', async () => {
      const caller = appRouter.createCaller({
        db: await getDb(),
        user: null,
        token: null,
      });

      const currentEnd = new Date().toISOString().split('T')[0];
      const currentStart = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const previousEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const previousStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await caller.analytics.getPeriodComparison({
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
      });

      // Verify change calculation
      const totalMessagesComparison = result.find(c => c.metric === 'Total Messages');
      if (totalMessagesComparison && totalMessagesComparison.previousValue > 0) {
        const expectedChange = totalMessagesComparison.currentValue - totalMessagesComparison.previousValue;
        const expectedPercent = (expectedChange / totalMessagesComparison.previousValue) * 100;
        
        expect(totalMessagesComparison.change).toBe(expectedChange);
        expect(Math.abs(totalMessagesComparison.changePercent - expectedPercent)).toBeLessThan(0.01);
      }
    });

    it('should handle zero previous values gracefully', async () => {
      const caller = appRouter.createCaller({
        db: await getDb(),
        user: null,
        token: null,
      });

      // Use a period with no data
      const currentEnd = new Date().toISOString().split('T')[0];
      const currentStart = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const previousEnd = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const previousStart = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const result = await caller.analytics.getPeriodComparison({
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // Should not throw errors even with zero values
      result.forEach(comparison => {
        expect(comparison.changePercent).toBeDefined();
        expect(isNaN(comparison.changePercent)).toBe(false);
      });
    });
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });
});
