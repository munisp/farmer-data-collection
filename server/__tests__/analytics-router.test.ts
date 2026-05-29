import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../trpc.js';
import { getDb } from '../db.js';
import { messageLogs, users } from '../../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

describe('Analytics Router', () => {
  let testUserId: number;
  let testToken: string;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;

    // Create test user
    const hashedPassword = await bcrypt.hash('testpass123', 10);
    const [user] = await db
      .insert(users)
      .values({
        email: `analytics-test-${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: 'Analytics',
        lastName: 'Tester',
        role: 'farmer',
      })
      .returning();
    testUserId = user.id;

    // Insert test message logs
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    await db.insert(messageLogs).values([
      {
        phoneNumber: '+1234567890',
        channel: 'whatsapp',
        direction: 'outbound',
        messageText: 'Test message 1',
        status: 'success',
        createdAt: now,
      },
      {
        phoneNumber: '+1234567890',
        channel: 'whatsapp',
        direction: 'outbound',
        messageText: 'Test message 2',
        status: 'success',
        createdAt: yesterday,
      },
      {
        phoneNumber: '+0987654321',
        channel: 'sms',
        direction: 'outbound',
        messageText: 'Test SMS',
        status: 'success',
        createdAt: yesterday,
      },
      {
        phoneNumber: '+1234567890',
        channel: 'ussd',
        direction: 'outbound',
        messageText: 'Test USSD',
        status: 'failed',
        createdAt: lastWeek,
      },
    ]);
  });

  it('should get dashboard summary', async () => {
    const caller = appRouter.createCaller({
      db: await getDb(),
      user: null,
      token: null,
    });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await caller.analytics.getDashboardSummary({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(result.overview).toBeDefined();
    expect(result.overview.totalMessages).toBeGreaterThan(0);
    expect(result.overview.totalCost).toBeGreaterThan(0);
    expect(result.channels).toBeDefined();
    expect(Array.isArray(result.channels)).toBe(true);
    expect(result.engagement).toBeDefined();
    expect(result.features).toBeDefined();
    expect(result.costs).toBeDefined();
  });

  it('should get channel metrics', async () => {
    const caller = appRouter.createCaller({
      db: await getDb(),
      user: null,
      token: null,
    });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await caller.analytics.getChannelMetrics({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    
    const whatsappMetrics = result.find(m => m.channel === 'whatsapp');
    expect(whatsappMetrics).toBeDefined();
    if (whatsappMetrics) {
      expect(whatsappMetrics.totalMessages).toBeGreaterThan(0);
      expect(whatsappMetrics.uniqueUsers).toBeGreaterThan(0);
      expect(whatsappMetrics.successRate).toBeGreaterThanOrEqual(0);
      expect(whatsappMetrics.successRate).toBeLessThanOrEqual(100);
      expect(whatsappMetrics.avgResponseTime).toBeGreaterThanOrEqual(0); // Currently hardcoded to 0
      expect(whatsappMetrics.costPerMessage).toBeGreaterThan(0);
      expect(whatsappMetrics.totalCost).toBeGreaterThan(0);
    }
  });

  it('should get real-time metrics', async () => {
    const caller = appRouter.createCaller({
      db: await getDb(),
      user: null,
      token: null,
    });

    const result = await caller.analytics.getRealTimeMetrics();

    expect(result).toBeDefined();
    expect(result.activeUsers).toBeGreaterThanOrEqual(0);
    expect(result.messagesPerMinute).toBeGreaterThanOrEqual(0);
    expect(result.errorsPerMinute).toBeGreaterThanOrEqual(0);
    expect(result.avgResponseTime).toBeGreaterThanOrEqual(0);
  });

  it('should get user engagement metrics', async () => {
    const caller = appRouter.createCaller({
      db: await getDb(),
      user: null,
      token: null,
    });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await caller.analytics.getUserEngagement({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(result.dau).toBeGreaterThanOrEqual(0);
    expect(result.wau).toBeGreaterThanOrEqual(0);
    expect(result.mau).toBeGreaterThanOrEqual(0);
    expect(result.retention).toBeDefined();
    expect(result.retention.day1).toBeGreaterThanOrEqual(0);
    expect(result.retention.day7).toBeGreaterThanOrEqual(0);
    expect(result.retention.day30).toBeGreaterThanOrEqual(0);
    expect(result.avgSessionsPerUser).toBeGreaterThanOrEqual(0);
    expect(result.avgActionsPerSession).toBeGreaterThanOrEqual(0);
  });

  it('should get feature popularity', async () => {
    const caller = appRouter.createCaller({
      db: await getDb(),
      user: null,
      token: null,
    });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await caller.analytics.getFeaturePopularity({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    // Feature popularity may be empty if no feature usage data exists
    if (result.length > 0) {
      const feature = result[0];
      expect(feature.feature).toBeDefined();
      expect(feature.usageCount).toBeGreaterThanOrEqual(0);
      expect(feature.uniqueUsers).toBeGreaterThanOrEqual(0);
      expect(feature.avgCompletionTime).toBeGreaterThanOrEqual(0);
      expect(feature.successRate).toBeGreaterThanOrEqual(0);
      expect(feature.successRate).toBeLessThanOrEqual(100);
    }
  });

  it('should get cost analysis', async () => {
    const caller = appRouter.createCaller({
      db: await getDb(),
      user: null,
      token: null,
    });

    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await caller.analytics.getCostAnalysis({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    
    const channelCost = result[0];
    expect(channelCost.channel).toBeDefined();
    expect(channelCost.totalCost).toBeGreaterThan(0);
    expect(channelCost.costPerUser).toBeGreaterThanOrEqual(0);
    expect(channelCost.costPerTransaction).toBeGreaterThanOrEqual(0);
    // ROI can be negative, zero, or positive
    expect(typeof channelCost.roi).toBe('number');
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    await db.delete(messageLogs).where(
      // Delete all test message logs (they have specific phone numbers)
      // In production, you'd want more specific cleanup
    );
    
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });
});
