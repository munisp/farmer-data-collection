import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { productReviews, users } from "../drizzle/schema.js";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

/**
 * Moderation Analytics Router
 * Real-time dashboard for moderation statistics and insights
 */

export const moderationAnalyticsRouter = router({
  /**
   * Get real-time moderation overview
   */
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view moderation analytics");
    }

    // Get overall statistics
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${productReviews.status} = 'published' then 1 else 0 end)`,
        flagged: sql<number>`sum(case when ${productReviews.status} = 'flagged' then 1 else 0 end)`,
        hidden: sql<number>`sum(case when ${productReviews.status} = 'hidden' then 1 else 0 end)`,
        verified: sql<number>`sum(case when ${productReviews.verifiedPurchase} = true then 1 else 0 end)`,
      })
      .from(productReviews);

    const total = stats.total || 0;
    const published = stats.published || 0;
    const flagged = stats.flagged || 0;
    const hidden = stats.hidden || 0;
    const verified = stats.verified || 0;

    // Calculate rates
    const autoApprovalRate = total > 0 ? (published / total) * 100 : 0;
    const flagRate = total > 0 ? (flagged / total) * 100 : 0;
    const verificationRate = total > 0 ? (verified / total) * 100 : 0;

    // Get today's statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayStats] = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${productReviews.status} = 'published' then 1 else 0 end)`,
        flagged: sql<number>`sum(case when ${productReviews.status} = 'flagged' then 1 else 0 end)`,
      })
      .from(productReviews)
      .where(gte(productReviews.createdAt, today));

    return {
      total,
      published,
      flagged,
      hidden,
      verified,
      autoApprovalRate: Math.round(autoApprovalRate * 10) / 10,
      flagRate: Math.round(flagRate * 10) / 10,
      verificationRate: Math.round(verificationRate * 10) / 10,
      today: {
        total: todayStats.total || 0,
        published: todayStats.published || 0,
        flagged: todayStats.flagged || 0,
      },
    };
  }),

  /**
   * Get moderation queue (flagged reviews)
   */
  getModerationQueue: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can view moderation queue");
      }

      const queue = await db
        .select({
          id: productReviews.id,
          listingId: productReviews.listingId,
          userId: productReviews.userId,
          rating: productReviews.rating,
          title: productReviews.title,
          comment: productReviews.comment,
          photos: productReviews.photos,
          verifiedPurchase: productReviews.verifiedPurchase,
          status: productReviews.status,
          createdAt: productReviews.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
          userEmail: users.email,
        })
        .from(productReviews)
        .leftJoin(users, eq(productReviews.userId, users.id))
        .where(eq(productReviews.status, "flagged"))
        .orderBy(desc(productReviews.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return queue.map((item: Record<string, any>) => ({
        ...item,
        photos: item.photos ? item.photos.split(",") : [],
      }));
    }),

  /**
   * Get moderation activity timeline (last 30 days)
   */
  getActivityTimeline: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view activity timeline");
    }

    // Get last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const timeline = await db
      .select({
        date: sql<string>`DATE(${productReviews.createdAt})`,
        total: sql<number>`count(*)`,
        published: sql<number>`sum(case when ${productReviews.status} = 'published' then 1 else 0 end)`,
        flagged: sql<number>`sum(case when ${productReviews.status} = 'flagged' then 1 else 0 end)`,
        hidden: sql<number>`sum(case when ${productReviews.status} = 'hidden' then 1 else 0 end)`,
      })
      .from(productReviews)
      .where(gte(productReviews.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${productReviews.createdAt})`)
      .orderBy(sql`DATE(${productReviews.createdAt})`);

    return timeline;
  }),

  /**
   * Get rule effectiveness statistics
   */
  getRuleEffectiveness: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view rule effectiveness");
    }

    // Simulate rule effectiveness (in production, this would track actual rule triggers)
    const rules = [
      {
        ruleId: 'reject_spam',
        name: 'Reject Spam',
        triggered: 45,
        falsePositives: 2,
        accuracy: 95.6,
      },
      {
        ruleId: 'flag_profanity',
        name: 'Flag Profanity',
        triggered: 23,
        falsePositives: 1,
        accuracy: 95.7,
      },
      {
        ruleId: 'flag_sentiment_mismatch',
        name: 'Flag Sentiment Mismatch',
        triggered: 67,
        falsePositives: 12,
        accuracy: 82.1,
      },
      {
        ruleId: 'approve_verified_positive',
        name: 'Auto-Approve Verified Positive',
        triggered: 342,
        falsePositives: 8,
        accuracy: 97.7,
      },
      {
        ruleId: 'flag_unverified_negative',
        name: 'Flag Unverified Negative',
        triggered: 89,
        falsePositives: 15,
        accuracy: 83.1,
      },
    ];

    return rules;
  }),

  /**
   * Get false positive/negative rates
   */
  getAccuracyMetrics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view accuracy metrics");
    }

    // In production, these would be calculated from actual moderation actions
    return {
      overallAccuracy: 91.5,
      falsePositiveRate: 6.2,
      falseNegativeRate: 2.3,
      precision: 93.8,
      recall: 97.7,
      f1Score: 95.7,
      totalReviewed: 1247,
      correctDecisions: 1141,
      incorrectDecisions: 106,
    };
  }),

  /**
   * Get moderator performance (if manual moderation is tracked)
   */
  getModeratorPerformance: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view moderator performance");
    }

    // Placeholder - in production, track manual moderation actions
    return {
      automated: {
        reviewsProcessed: 1156,
        averageTime: 0.05, // seconds
        accuracy: 91.5,
      },
      manual: {
        reviewsProcessed: 91,
        averageTime: 45, // seconds
        accuracy: 98.9,
      },
      costSavings: {
        timesSaved: 68.4, // hours
        costSaved: 3420, // dollars
        efficiencyGain: 92.7, // percent
      },
    };
  }),

  /**
   * Get sentiment distribution over time
   */
  getSentimentTrends: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view sentiment trends");
    }

    // Get last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trends = await db
      .select({
        date: sql<string>`DATE(${productReviews.createdAt})`,
        avgRating: sql<number>`AVG(${productReviews.rating})`,
        positiveCount: sql<number>`sum(case when ${productReviews.rating} >= 4 then 1 else 0 end)`,
        negativeCount: sql<number>`sum(case when ${productReviews.rating} <= 2 then 1 else 0 end)`,
        neutralCount: sql<number>`sum(case when ${productReviews.rating} = 3 then 1 else 0 end)`,
      })
      .from(productReviews)
      .where(gte(productReviews.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${productReviews.createdAt})`)
      .orderBy(sql`DATE(${productReviews.createdAt})`);

    return trends;
  }),
});
