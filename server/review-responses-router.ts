import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { reviewResponses, productReviews, produceListings, users } from "../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { logger } from './logger.js';

/**
 * Review Responses Router
 * Handles seller responses to product reviews with notifications
 */

export const reviewResponsesRouter = router({
  /**
   * Submit a response to a review (seller only)
   */
  respondToReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        response: z.string().min(10).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const sellerId = ctx.user.id;

      // Get the review and verify seller owns the listing
      const [review] = await db
        .select({
          id: productReviews.id,
          listingId: productReviews.listingId,
          userId: productReviews.userId,
          listingSellerId: produceListings.userId,
        })
        .from(productReviews)
        .leftJoin(produceListings, eq(productReviews.listingId, produceListings.id))
        .where(eq(productReviews.id, input.reviewId))
        .limit(1);

      if (!review) {
        throw new Error("Review not found");
      }

      if (review.listingSellerId !== sellerId) {
        throw new Error("You can only respond to reviews on your own listings");
      }

      // Check if seller already responded
      const [existingResponse] = await db
        .select()
        .from(reviewResponses)
        .where(
          and(
            eq(reviewResponses.reviewId, input.reviewId),
            eq(reviewResponses.sellerId, sellerId)
          )
        )
        .limit(1);

      if (existingResponse) {
        throw new Error("You have already responded to this review");
      }

      // Insert response
      const [response] = await db
        .insert(reviewResponses)
        .values({
          reviewId: input.reviewId,
          sellerId,
          response: input.response,
          status: "published",
        })
        .returning();

      // Send notification to reviewer using the notification queue
      try {
        const { notificationQueue } = await import('../drizzle/schema.js');
        
        // Get reviewer details for notification
        const [reviewer] = await db
          .select({
            email: users.email,
            phoneNumber: users.phoneNumber,
            firstName: users.firstName,
          })
          .from(users)
          .where(eq(users.id, review.userId!))
          .limit(1);

        if (reviewer) {
          // Queue notification for the reviewer
          await db.insert(notificationQueue).values({
            userId: review.userId,
            phoneNumber: reviewer.phoneNumber || '',
            channel: 'in_app',
            notificationType: 'review_response',
            messageText: `Seller responded to your review\nThe seller has responded to your review on the marketplace.`,
            messageData: {
              reviewId: input.reviewId,
              listingId: review.listingId,
              link: `/marketplace/${review.listingId}?review=${input.reviewId}`,
            },
            status: 'pending',
          });
          
          logger.info(`[ReviewResponse] Notification queued for user ${review.userId} for review ${input.reviewId}`);
        }
      } catch (error) {
        logger.error("[ReviewResponse] Failed to queue notification:", error);
        // Don't fail the response if notification fails
      }

      return { success: true, responseId: response.id };
    }),

  /**
   * Update a response (seller only)
   */
  updateResponse: protectedProcedure
    .input(
      z.object({
        responseId: z.number(),
        response: z.string().min(10).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const sellerId = ctx.user.id;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(reviewResponses)
        .where(eq(reviewResponses.id, input.responseId))
        .limit(1);

      if (!existing) {
        throw new Error("Response not found");
      }

      if (existing.sellerId !== sellerId) {
        throw new Error("You can only edit your own responses");
      }

      // Update response
      await db
        .update(reviewResponses)
        .set({
          response: input.response,
          updatedAt: new Date(),
        })
        .where(eq(reviewResponses.id, input.responseId));

      return { success: true };
    }),

  /**
   * Delete a response (seller only)
   */
  deleteResponse: protectedProcedure
    .input(z.object({ responseId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const sellerId = ctx.user.id;

      // Verify ownership
      const [existing] = await db
        .select()
        .from(reviewResponses)
        .where(eq(reviewResponses.id, input.responseId))
        .limit(1);

      if (!existing) {
        throw new Error("Response not found");
      }

      if (existing.sellerId !== sellerId) {
        throw new Error("You can only delete your own responses");
      }

      // Soft delete by setting status to hidden
      await db
        .update(reviewResponses)
        .set({ status: "hidden" })
        .where(eq(reviewResponses.id, input.responseId));

      return { success: true };
    }),

  /**
   * Get response for a specific review (public)
   */
  getResponseForReview: publicProcedure
    .input(z.object({ reviewId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [response] = await db
        .select({
          id: reviewResponses.id,
          reviewId: reviewResponses.reviewId,
          sellerId: reviewResponses.sellerId,
          response: reviewResponses.response,
          status: reviewResponses.status,
          createdAt: reviewResponses.createdAt,
          updatedAt: reviewResponses.updatedAt,
          sellerFirstName: users.firstName,
          sellerLastName: users.lastName,
        })
        .from(reviewResponses)
        .leftJoin(users, eq(reviewResponses.sellerId, users.id))
        .where(
          and(
            eq(reviewResponses.reviewId, input.reviewId),
            eq(reviewResponses.status, "published")
          )
        )
        .limit(1);

      return response || null;
    }),

  /**
   * Get all responses for a listing (public)
   */
  getResponsesForListing: publicProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const responses = await db
        .select({
          id: reviewResponses.id,
          reviewId: reviewResponses.reviewId,
          sellerId: reviewResponses.sellerId,
          response: reviewResponses.response,
          createdAt: reviewResponses.createdAt,
          updatedAt: reviewResponses.updatedAt,
          sellerFirstName: users.firstName,
          sellerLastName: users.lastName,
        })
        .from(reviewResponses)
        .leftJoin(productReviews, eq(reviewResponses.reviewId, productReviews.id))
        .leftJoin(users, eq(reviewResponses.sellerId, users.id))
        .where(
          and(
            eq(productReviews.listingId, input.listingId),
            eq(reviewResponses.status, "published")
          )
        )
        .orderBy(desc(reviewResponses.createdAt));

      return responses;
    }),

  /**
   * Get seller's own responses
   */
  getMyResponses: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const sellerId = ctx.user.id;

    const responses = await db
      .select({
        id: reviewResponses.id,
        reviewId: reviewResponses.reviewId,
        response: reviewResponses.response,
        status: reviewResponses.status,
        createdAt: reviewResponses.createdAt,
        updatedAt: reviewResponses.updatedAt,
        reviewRating: productReviews.rating,
        reviewTitle: productReviews.title,
        reviewComment: productReviews.comment,
        listingId: productReviews.listingId,
        listingTitle: produceListings.title,
      })
      .from(reviewResponses)
      .leftJoin(productReviews, eq(reviewResponses.reviewId, productReviews.id))
      .leftJoin(produceListings, eq(productReviews.listingId, produceListings.id))
      .where(eq(reviewResponses.sellerId, sellerId))
      .orderBy(desc(reviewResponses.createdAt));

    return responses;
  }),

  /**
   * Get statistics for seller responses
   */
  getResponseStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const sellerId = ctx.user.id;

    // Get total reviews on seller's listings
    const [reviewStats] = await db
      .select({
        totalReviews: db.$count(productReviews.id),
      })
      .from(productReviews)
      .leftJoin(produceListings, eq(productReviews.listingId, produceListings.id))
      .where(eq(produceListings.userId, sellerId));

    // Get total responses
    const [responseStats] = await db
      .select({
        totalResponses: db.$count(reviewResponses.id),
      })
      .from(reviewResponses)
      .where(eq(reviewResponses.sellerId, sellerId));

    const totalReviews = reviewStats?.totalReviews || 0;
    const totalResponses = responseStats?.totalResponses || 0;
    const responseRate = totalReviews > 0 ? (totalResponses / totalReviews) * 100 : 0;

    return {
      totalReviews,
      totalResponses,
      unansweredReviews: totalReviews - totalResponses,
      responseRate: Math.round(responseRate * 10) / 10,
    };
  }),
});
