import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../trpc.js';
import { getDb } from '../db';
import { users, produceListings, productReviews, marketplaceOrders, orderItems } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

/**
 * Test suite for review analytics router
 * Tests admin-only analytics endpoints
 */

describe('Review Analytics Router', () => {
  let db: any;
  let adminId: number;
  let regularUserId: number;
  let listingId: number;

  beforeAll(async () => {
    db = await getDb();
    
    // Create admin user
    const [admin] = await db!.insert(users).values({
      email: `admin-analytics-${Date.now()}@example.com`,
      password: 'hashed_password',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
    }).returning();
    adminId = admin.id;

    // Create regular user
    const [regular] = await db!.insert(users).values({
      email: `regular-analytics-${Date.now()}@example.com`,
      password: 'hashed_password',
      firstName: 'Regular',
      lastName: 'User',
      role: 'farmer',
    }).returning();
    regularUserId = regular.id;

    // Create listing
    const [listing] = await db!.insert(produceListings).values({
      userId: regularUserId,
      title: 'Test Product',
      category: 'vegetables',
      quantity: 100,
      unit: 'kg',
      pricePerUnit: 50000,
      totalPrice: 5000000, // 100 kg * 50000 per unit
      organic: false,
      deliveryOptions: JSON.stringify({ pickup: true }),
      photos: JSON.stringify([]),
      status: 'active',
    }).returning();
    listingId = listing.id;

    // Create sample reviews
    await db!.insert(productReviews).values([
      {
        userId: regularUserId,
        listingId: listingId,
        rating: 5,
        title: 'Excellent',
        comment: 'Great product',
        verifiedPurchase: true,
        status: 'published',
        helpfulCount: 5,
        photos: JSON.stringify(['photo1.jpg']),
      },
      {
        userId: regularUserId,
        listingId: listingId,
        rating: 4,
        title: 'Good',
        comment: 'Nice',
        verifiedPurchase: false,
        status: 'published',
        helpfulCount: 2,
      },
      {
        userId: regularUserId,
        listingId: listingId,
        rating: 3,
        title: 'Average',
        comment: 'OK',
        verifiedPurchase: true,
        status: 'hidden',
        helpfulCount: 0,
      },
      {
        userId: regularUserId,
        listingId: listingId,
        rating: 2,
        title: 'Poor',
        comment: 'Not good',
        verifiedPurchase: false,
        status: 'flagged',
        helpfulCount: 0,
      },
    ]);
  });

  afterAll(async () => {
    // Cleanup
    if (listingId) {
      await db!.delete(productReviews).where(eq(productReviews.listingId, listingId));
      await db!.delete(produceListings).where(eq(produceListings.id, listingId));
    }
    if (adminId) {
      await db!.delete(users).where(eq(users.id, adminId));
    }
    if (regularUserId) {
      await db!.delete(users).where(eq(users.id, regularUserId));
    }
  });

  describe('getOverview', () => {
    it('should return analytics overview for admin', async () => {
      const caller = appRouter.createCaller({
        user: { id: adminId, email: 'admin@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      const overview = await caller.reviewAnalytics.getOverview();

      expect(overview).toBeDefined();
      expect(overview.total).toBeGreaterThanOrEqual(4);
      expect(overview.verified).toBeGreaterThanOrEqual(2);
      expect(overview.unverified).toBeGreaterThanOrEqual(2);
      expect(overview.published).toBeGreaterThanOrEqual(2);
      expect(overview.hidden).toBeGreaterThanOrEqual(1);
      expect(overview.flagged).toBeGreaterThanOrEqual(1);
      expect(overview.averageRating).toBeGreaterThan(0);
      expect(overview.withPhotos).toBeGreaterThanOrEqual(1);
      expect(overview.verificationRate).toBeDefined();
    });

    it('should reject non-admin users', async () => {
      const caller = appRouter.createCaller({
        user: { id: regularUserId, email: 'regular@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      await expect(caller.reviewAnalytics.getOverview()).rejects.toThrow(
        'Only admins can view review analytics'
      );
    });
  });

  describe('getVerificationStats', () => {
    it('should return verification breakdown by rating', async () => {
      const caller = appRouter.createCaller({
        user: { id: adminId, email: 'admin@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      const stats = await caller.reviewAnalytics.getVerificationStats();

      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBe(5); // Ratings 1-5
      
      // Check structure
      stats.forEach(item => {
        expect(item).toHaveProperty('rating');
        expect(item).toHaveProperty('verified');
        expect(item).toHaveProperty('unverified');
        expect(item).toHaveProperty('total');
        expect(item.rating).toBeGreaterThanOrEqual(1);
        expect(item.rating).toBeLessThanOrEqual(5);
      });
    });

    it('should reject non-admin users', async () => {
      const caller = appRouter.createCaller({
        user: { id: regularUserId, email: 'regular@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      await expect(caller.reviewAnalytics.getVerificationStats()).rejects.toThrow(
        'Only admins can view verification statistics'
      );
    });
  });

  describe('getModerationStats', () => {
    it('should return moderation statistics', async () => {
      const caller = appRouter.createCaller({
        user: { id: adminId, email: 'admin@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      const stats = await caller.reviewAnalytics.getModerationStats();

      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      
      // Check structure if data exists
      if (stats.length > 0) {
        stats.forEach(item => {
          expect(item).toHaveProperty('date');
          expect(item).toHaveProperty('status');
          expect(item).toHaveProperty('count');
        });
      }
    });

    it('should reject non-admin users', async () => {
      const caller = appRouter.createCaller({
        user: { id: regularUserId, email: 'regular@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      await expect(caller.reviewAnalytics.getModerationStats()).rejects.toThrow(
        'Only admins can view moderation statistics'
      );
    });
  });

  describe('getTopReviewers', () => {
    it('should return top reviewers with statistics', async () => {
      const caller = appRouter.createCaller({
        user: { id: adminId, email: 'admin@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      const topReviewers = await caller.reviewAnalytics.getTopReviewers({ limit: 5 });

      expect(topReviewers).toBeDefined();
      expect(Array.isArray(topReviewers)).toBe(true);
      
      if (topReviewers.length > 0) {
        topReviewers.forEach(reviewer => {
          expect(reviewer).toHaveProperty('userId');
          expect(reviewer).toHaveProperty('reviewCount');
          expect(reviewer).toHaveProperty('verifiedCount');
          expect(reviewer).toHaveProperty('avgRating');
          expect(reviewer).toHaveProperty('totalHelpful');
          expect(reviewer).toHaveProperty('user');
          expect(reviewer).toHaveProperty('verificationRate');
          expect(reviewer.reviewCount).toBeGreaterThan(0);
        });
      }
    });

    it('should respect limit parameter', async () => {
      const caller = appRouter.createCaller({
        user: { id: adminId, email: 'admin@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      const topReviewers = await caller.reviewAnalytics.getTopReviewers({ limit: 2 });

      expect(topReviewers.length).toBeLessThanOrEqual(2);
    });

    it('should reject non-admin users', async () => {
      const caller = appRouter.createCaller({
        user: { id: regularUserId, email: 'regular@example.com' },
        token: 'test-token',
        keycloakUser: null,
      });

      await expect(
        caller.reviewAnalytics.getTopReviewers({ limit: 10 })
      ).rejects.toThrow('Only admins can view top reviewers');
    });
  });
});
