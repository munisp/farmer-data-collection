import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { productReviews, users, marketplaceOrders, orderItems } from "../drizzle/schema.js";
import { eq, and, desc, sql, gte } from "drizzle-orm";

/**
 * Review Analytics Router
 * Provides analytics and insights for product reviews (admin only)
 */

export const reviewAnalyticsRouter = router({
  /**
   * Get review analytics overview
   */
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    
    // Check if user is admin
    const user = await db!
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    
    if (user.length === 0 || user[0].role !== 'admin') {
      throw new Error("Only admins can view review analytics");
    }

    // Get total reviews
    const totalReviews = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews);

    // Get verified vs unverified
    const verifiedCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(eq(productReviews.verifiedPurchase, true));

    const unverifiedCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(eq(productReviews.verifiedPurchase, false));

    // Get reviews by status
    const publishedCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(eq(productReviews.status, 'published'));

    const hiddenCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(eq(productReviews.status, 'hidden'));

    const flaggedCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(eq(productReviews.status, 'flagged'));

    // Get average rating
    const avgRating = await db!
      .select({ avg: sql<number>`avg(${productReviews.rating})` })
      .from(productReviews)
      .where(eq(productReviews.status, 'published'));

    // Get reviews with photos
    const withPhotosCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(sql`${productReviews.photos} IS NOT NULL AND ${productReviews.photos} != '[]'`);

    // Get helpful reviews (helpfulCount > 0)
    const helpfulCount = await db!
      .select({ count: sql<number>`count(*)` })
      .from(productReviews)
      .where(sql`${productReviews.helpfulCount} > 0`);

    return {
      total: Number(totalReviews[0]?.count) || 0,
      verified: Number(verifiedCount[0]?.count) || 0,
      unverified: Number(unverifiedCount[0]?.count) || 0,
      published: Number(publishedCount[0]?.count) || 0,
      hidden: Number(hiddenCount[0]?.count) || 0,
      flagged: Number(flaggedCount[0]?.count) || 0,
      averageRating: avgRating[0]?.avg ? parseFloat(parseFloat(String(avgRating[0].avg)).toFixed(2)) : 0,
      withPhotos: Number(withPhotosCount[0]?.count) || 0,
      helpful: Number(helpfulCount[0]?.count) || 0,
      verificationRate: Number(totalReviews[0]?.count) > 0 
        ? ((Number(verifiedCount[0]?.count) || 0) / Number(totalReviews[0].count) * 100).toFixed(1)
        : '0',
    };
  }),

  /**
   * Get purchase verification statistics
   */
  getVerificationStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    
    // Check if user is admin
    const user = await db!
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    
    if (user.length === 0 || user[0].role !== 'admin') {
      throw new Error("Only admins can view verification statistics");
    }

    // Get reviews by rating and verification status
    const ratingBreakdown = await db!
      .select({
        rating: productReviews.rating,
        verified: productReviews.verifiedPurchase,
        count: sql<number>`count(*)`,
      })
      .from(productReviews)
      .groupBy(productReviews.rating, productReviews.verifiedPurchase)
      .orderBy(productReviews.rating);

    // Format for chart display
    const ratings = [1, 2, 3, 4, 5];
    const chartData = ratings.map(rating => {
      const verifiedItem = ratingBreakdown.find(
        item => item.rating === rating && item.verified
      );
      const unverifiedItem = ratingBreakdown.find(
        item => item.rating === rating && !item.verified
      );

      return {
        rating,
        verified: verifiedItem?.count || 0,
        unverified: unverifiedItem?.count || 0,
        total: (verifiedItem?.count || 0) + (unverifiedItem?.count || 0),
      };
    });

    return chartData;
  }),

  /**
   * Get moderation queue statistics
   */
  getModerationStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    
    // Check if user is admin
    const user = await db!
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    
    if (user.length === 0 || user[0].role !== 'admin') {
      throw new Error("Only admins can view moderation statistics");
    }

    // Get recent reviews by day (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentReviews = await db!
      .select({
        date: sql<string>`DATE(${productReviews.createdAt})`,
        status: productReviews.status,
        count: sql<number>`count(*)`,
      })
      .from(productReviews)
      .where(gte(productReviews.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${productReviews.createdAt})`, productReviews.status)
      .orderBy(sql`DATE(${productReviews.createdAt})`);

    return recentReviews;
  }),

  /**
   * Get top reviewers
   */
  getTopReviewers: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      
      // Check if user is admin
      const user = await db!
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      
      if (user.length === 0 || user[0].role !== 'admin') {
        throw new Error("Only admins can view top reviewers");
      }

      const topReviewers = await db!
        .select({
          userId: productReviews.userId,
          reviewCount: sql<number>`count(*)`,
          verifiedCount: sql<number>`sum(case when ${productReviews.verifiedPurchase} then 1 else 0 end)`,
          avgRating: sql<number>`avg(${productReviews.rating})`,
          totalHelpful: sql<number>`sum(${productReviews.helpfulCount})`,
        })
        .from(productReviews)
        .groupBy(productReviews.userId)
        .orderBy(desc(sql`count(*)`))
        .limit(input.limit);

      // Get user details
      const reviewersWithDetails = await Promise.all(
        topReviewers.map(async (reviewer) => {
          const userDetails = await db!
            .select({
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(eq(users.id, reviewer.userId))
            .limit(1);

          const reviewCount = Number(reviewer.reviewCount);
          const verifiedCount = Number(reviewer.verifiedCount);
          
          return {
            ...reviewer,
            reviewCount,
            verifiedCount,
            avgRating: parseFloat(reviewer.avgRating as any),
            totalHelpful: Number(reviewer.totalHelpful),
            user: userDetails[0] || null,
            verificationRate: reviewCount > 0
              ? ((verifiedCount / reviewCount) * 100).toFixed(1)
              : '0',
          };
        })
      );

      return reviewersWithDetails;
    }),
});
