import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc-base";
import { getDb } from "./db";
import { analyzeReview, shouldAutoFlag } from "./services/sentiment-analysis-service.js";
import { moderateReview, ModerationDecision } from "./services/auto-moderation-service.js";
import { predictHelpfulness } from "./services/review-helpfulness-ml.js";
import { productReviews, reviewVotes, marketplaceOrders, orderItems, users } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { uploadReviewPhoto } from "./services/storage-service";
import { logger } from './logger.js';

/**
 * Product Reviews Router
 * Handles product review submission, editing, voting, and moderation
 */

export const productReviewsRouter = router({
  /**
   * Submit a new product review
   */
  submitReview: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        orderId: z.number().optional(),
        rating: z.number().min(1).max(5),
        title: z.string().min(3).max(100),
        comment: z.string().min(10).max(2000),
        photos: z.array(z.string()).max(5).optional(), // Base64 encoded images
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;

      // Check if user already reviewed this listing
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const existingReview = await db
        .select()
        .from(productReviews)
        .where(
          and(
            eq(productReviews.listingId, input.listingId),
            eq(productReviews.userId, userId)
          )
        )
        .limit(1);

      if (existingReview.length > 0) {
        throw new Error("You have already reviewed this product");
      }

      // Verify purchase if orderId provided
      let verifiedPurchase = false;
      if (input.orderId) {
        // Check if user actually purchased this listing in the order
        const order = await db!
          .select()
          .from(marketplaceOrders)
          .where(
            and(
              eq(marketplaceOrders.id, input.orderId),
              eq(marketplaceOrders.buyerId, userId)
            )
          )
          .limit(1);

        if (order.length > 0) {
          // Check if this listing was in the order
          const orderItem = await db!
            .select()
            .from(orderItems)
            .where(
              and(
                eq(orderItems.orderId, input.orderId),
                eq(orderItems.listingId, input.listingId)
              )
            )
            .limit(1);

          verifiedPurchase = orderItem.length > 0;
        }
      }

      // Apply automated moderation workflow
      const moderationDecision = await moderateReview(
        input.title || '',
        input.comment || '',
        input.rating,
        {
          userId,
          listingId: input.listingId,
          rating: input.rating,
          verifiedPurchase,
        }
      );
      
      // Determine initial status based on moderation decision
      let initialStatus: 'published' | 'flagged' | 'hidden' = 'published';
      
      if (moderationDecision.action === 'reject' || moderationDecision.action === 'hide') {
        initialStatus = 'hidden';
      } else if (moderationDecision.action === 'flag') {
        initialStatus = 'flagged';
      } else {
        initialStatus = 'published';
      }
      
      // Insert review
      const [review] = await db!
        .insert(productReviews)
        .values({
          listingId: input.listingId,
          userId,
          orderId: input.orderId,
          rating: input.rating,
          title: input.title,
          comment: input.comment,
          verifiedPurchase,
          status: initialStatus,
          helpfulCount: 0,
          createdAt: new Date(),
        })
        .returning();

      // Upload photos if provided
      if (input.photos && input.photos.length > 0) {
        const photoUrls: string[] = [];
        for (let i = 0; i < input.photos.length; i++) {
          try {
            const result = await uploadReviewPhoto(
              input.photos[i],
              review.id,
              i
            );
            photoUrls.push(result.url);
          } catch (error) {
            logger.error("Failed to upload review photo:", error);
          }
        }

        // Update review with photo URLs
        if (photoUrls.length > 0) {
          await db!
            .update(productReviews)
            .set({ photos: photoUrls.join(",") })
            .where(eq(productReviews.id, review.id));
        }
      }

      return review;
    }),

  /**
   * Vote on review helpfulness
   */
  voteHelpful: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        helpful: z.boolean(), // true = helpful, false = unhelpful
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user.id;

      // Check if user already voted
      const [existingVote] = await db
        .select()
        .from(reviewVotes)
        .where(
          and(
            eq(reviewVotes.reviewId, input.reviewId),
            eq(reviewVotes.userId, userId)
          )
        )
        .limit(1);

      const voteType = input.helpful ? "helpful" : "unhelpful";

      if (existingVote) {
        // Update existing vote
        if (existingVote.voteType !== voteType) {
          await db
            .update(reviewVotes)
            .set({ voteType })
            .where(eq(reviewVotes.id, existingVote.id));

          // Update review counts
          if (input.helpful) {
            // Changed from unhelpful to helpful
            await db
              .update(productReviews)
              .set({
                helpfulCount: sql`${productReviews.helpfulCount} + 1`,
                unhelpfulCount: sql`${productReviews.unhelpfulCount} - 1`,
              })
              .where(eq(productReviews.id, input.reviewId));
          } else {
            // Changed from helpful to unhelpful
            await db
              .update(productReviews)
              .set({
                helpfulCount: sql`${productReviews.helpfulCount} - 1`,
                unhelpfulCount: sql`${productReviews.unhelpfulCount} + 1`,
              })
              .where(eq(productReviews.id, input.reviewId));
          }
        }
      } else {
        // Insert new vote
        await db.insert(reviewVotes).values({
          reviewId: input.reviewId,
          userId,
          voteType,
        });

        // Update review counts
        if (input.helpful) {
          await db
            .update(productReviews)
            .set({
              helpfulCount: sql`${productReviews.helpfulCount} + 1`,
            })
            .where(eq(productReviews.id, input.reviewId));
        } else {
          await db
            .update(productReviews)
            .set({
              unhelpfulCount: sql`${productReviews.unhelpfulCount} + 1`,
            })
            .where(eq(productReviews.id, input.reviewId));
        }
      }

      return { success: true };
    }),

  /**
   * Get user's vote for a review
   */
  getMyVote: protectedProcedure
    .input(z.object({ reviewId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [vote] = await db
        .select()
        .from(reviewVotes)
        .where(
          and(
            eq(reviewVotes.reviewId, input.reviewId),
            eq(reviewVotes.userId, ctx.user.id)
          )
        )
        .limit(1);

      return vote || null;
    }),

  /**
   * Get reviews for a listing (public)
   */
  getReviewsForListing: publicProcedure
    .input(
      z.object({
        listingId: z.number(),
        sortBy: z.enum(["recent", "helpful", "rating_high", "rating_low"]).optional(),
        limit: z.number().min(1).max(50).optional(),
        offset: z.number().min(0).optional(),
      })
    )
    .query(async ({ input }) => {
      const { listingId, sortBy = "recent", limit = 20, offset = 0 } = input;
      const db = await getDb();

      const baseQuery = db!
        .select({
          id: productReviews.id,
          userId: productReviews.userId,
          rating: productReviews.rating,
          title: productReviews.title,
          comment: productReviews.comment,
          photos: productReviews.photos,
          verifiedPurchase: productReviews.verifiedPurchase,
          helpfulCount: productReviews.helpfulCount,
          createdAt: productReviews.createdAt,
          status: productReviews.status,
        })
        .from(productReviews)
        .where(
          and(
            eq(productReviews.listingId, listingId),
            eq(productReviews.status, "published")
          )
        );

      // Apply sorting and execute query
      let reviews;
      if (sortBy === "helpful") {
        reviews = await baseQuery.orderBy(desc(productReviews.helpfulCount)).limit(limit).offset(offset);
      } else if (sortBy === "rating_high") {
        reviews = await baseQuery.orderBy(desc(productReviews.rating)).limit(limit).offset(offset);
      } else if (sortBy === "rating_low") {
        reviews = await baseQuery.orderBy(productReviews.rating).limit(limit).offset(offset);
      } else {
        reviews = await baseQuery.orderBy(desc(productReviews.createdAt)).limit(limit).offset(offset);
      }

      // Get total count
      const [countResult] = await db!
        .select({ count: sql<number>`count(*)` })
        .from(productReviews)
        .where(
          and(
            eq(productReviews.listingId, listingId),
            eq(productReviews.status, "published")
          )
        );

      return {
        reviews: reviews.map((r) => ({
          ...r,
          photos: r.photos ? r.photos.split(",") : [],
        })),
        total: countResult.count,
      };
    }),

  /**
   * Get review statistics for a listing
   */
  getReviewStats: publicProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const reviews = await db!
        .select({
          rating: productReviews.rating,
        })
        .from(productReviews)
        .where(
          and(
            eq(productReviews.listingId, input.listingId),
            eq(productReviews.status, "published")
          )
        );

      if (reviews.length === 0) {
        return {
          averageRating: 0,
          totalReviews: 0,
          ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        };
      }

      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = totalRating / reviews.length;

      const ratingDistribution = reviews.reduce(
        (acc, r) => {
          acc[r.rating] = (acc[r.rating] || 0) + 1;
          return acc;
        },
        { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<number, number>
      );

      return {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: reviews.length,
        ratingDistribution,
      };
    }),

  /**
   * Edit a review
   */
  editReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        rating: z.number().min(1).max(5).optional(),
        title: z.string().min(3).max(100).optional(),
        comment: z.string().min(10).max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = await getDb();

      // Verify ownership
      const [review] = await db!
        .select()
        .from(productReviews)
        .where(eq(productReviews.id, input.reviewId))
        .limit(1);

      if (!review) {
        throw new Error("Review not found");
      }

      if (review.userId !== userId) {
        throw new Error("You can only edit your own reviews");
      }

      // Update review
      await db!
        .update(productReviews)
        .set({
          ...(input.rating && { rating: input.rating }),
          ...(input.title && { title: input.title }),
          ...(input.comment && { comment: input.comment }),
        })
        .where(eq(productReviews.id, input.reviewId));

      return { success: true };
    }),

  /**
   * Delete a review
   */
  deleteReview: protectedProcedure
    .input(z.object({ reviewId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = await getDb();

      // Verify ownership
      const [review] = await db!
        .select()
        .from(productReviews)
        .where(eq(productReviews.id, input.reviewId))
        .limit(1);

      if (!review) {
        throw new Error("Review not found");
      }

      if (review.userId !== userId) {
        throw new Error("You can only delete your own reviews");
      }

      // Soft delete by setting status to hidden
      await db!
        .update(productReviews)
        .set({ status: "hidden" })
        .where(eq(productReviews.id, input.reviewId));

      return { success: true };
    }),

  /**
   * Vote on a review (helpful/unhelpful)
   */
  voteReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        voteType: z.enum(["helpful", "unhelpful"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;
      const db = await getDb();

      // Check if user already voted
      const [existingVote] = await db!
        .select()
        .from(reviewVotes)
        .where(
          and(
            eq(reviewVotes.reviewId, input.reviewId),
            eq(reviewVotes.userId, userId)
          )
        )
        .limit(1);

      if (existingVote) {
        // Update existing vote
        await db!
          .update(reviewVotes)
          .set({ voteType: input.voteType })
          .where(eq(reviewVotes.id, existingVote.id));
      } else {
        // Insert new vote
        await db!.insert(reviewVotes).values({
          reviewId: input.reviewId,
          userId,
          voteType: input.voteType,
          createdAt: new Date(),
        });
      }

      // Update helpful count on review
      const [voteCount] = await db!
        .select({ count: sql<number>`count(*)` })
        .from(reviewVotes)
        .where(
          and(
            eq(reviewVotes.reviewId, input.reviewId),
            eq(reviewVotes.voteType, "helpful")
          )
        );

      await db!
        .update(productReviews)
        .set({ helpfulCount: voteCount.count })
        .where(eq(productReviews.id, input.reviewId));

      return { success: true };
    }),

  /**
   * Get user's reviews
   */
  getMyReviews: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const db = await getDb();

    const reviews = await db!
      .select()
      .from(productReviews)
      .where(eq(productReviews.userId, userId))
      .orderBy(desc(productReviews.createdAt));

    return reviews.map((r) => ({
      ...r,
      photos: r.photos ? r.photos.split(",") : [],
    }));
  }),

  /**
   * Moderate review (admin only)
   */
  moderateReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        status: z.enum(["published", "hidden", "flagged"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      
      // Check if user is admin
      const user = await db!
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      
      if (user.length === 0 || user[0].role !== 'admin') {
        throw new Error("Only admins can moderate reviews");
      }

      await db!
        .update(productReviews)
        .set({ status: input.status })
        .where(eq(productReviews.id, input.reviewId));

      return { success: true };
    }),

  /**
   * Get flagged reviews (admin only)
   */
  getFlaggedReviews: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    
    // Check if user is admin
    const user = await db!
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    
    if (user.length === 0 || user[0].role !== 'admin') {
      throw new Error("Only admins can view flagged reviews");
    }

    const reviews = await db!
      .select()
      .from(productReviews)
      .where(eq(productReviews.status, "flagged"))
      .orderBy(desc(productReviews.createdAt));

    return reviews.map((r) => ({
      ...r,
      photos: r.photos ? r.photos.split(",") : [],
    }));
  }),
});
