import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { productReviews, users, notificationQueue } from "../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { logger } from './logger.js';

/**
 * Moderation Workflow Router
 * Handles review approval, rejection, and appeal workflows
 */

/**
 * Send notification to a user about moderation action
 */
async function sendModerationNotification(
  userId: number,
  type: 'approved' | 'rejected' | 'appeal_received',
  data: { reviewId: number; reason?: string; note?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const titles: Record<string, string> = {
    approved: 'Your review has been approved',
    rejected: 'Your review was not approved',
    appeal_received: 'Your appeal has been received',
  };

  const messages: Record<string, string> = {
    approved: 'Your review has been approved and is now visible to other users.',
    rejected: `Your review was not approved. Reason: ${data.reason || 'Policy violation'}. ${data.note ? `Note: ${data.note}` : ''} You can appeal this decision.`,
    appeal_received: 'We have received your appeal and will review it within 48 hours.',
  };

  // Insert notification into queue
  await db.insert(notificationQueue).values({
    userId,
    phoneNumber: '',
    channel: 'in_app',
    notificationType: 'moderation',
    messageText: `${titles[type]}\n${messages[type]}`,
    messageData: data,
    status: 'pending',
  });

  logger.info(`[Moderation] Notification sent to user ${userId}: ${type}`);
}

const MODERATION_ACTIONS = ["approve", "reject", "hide", "flag"] as const;
const REJECTION_REASONS = [
  "spam",
  "profanity",
  "off_topic",
  "false_information",
  "harassment",
  "duplicate",
  "other",
] as const;

export const moderationWorkflowRouter = router({
  /**
   * Approve a flagged review (admin only)
   */
  approveReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can moderate reviews");
      }

      // Get review details for notification
      const [review] = await db
        .select()
        .from(productReviews)
        .where(eq(productReviews.id, input.reviewId))
        .limit(1);

      if (!review) {
        throw new Error("Review not found");
      }

      // Update review status
      await db
        .update(productReviews)
        .set({
          status: "published",
          updatedAt: new Date(),
        })
        .where(eq(productReviews.id, input.reviewId));

      // Send notification to reviewer
      await sendModerationNotification(review.userId, 'approved', {
        reviewId: input.reviewId,
        note: input.note,
      });
      logger.info(`[Moderation] Review ${input.reviewId} approved by admin ${ctx.user.id}`);
      if (input.note) {
        logger.info(`[Moderation] Note: ${input.note}`);
      }

      return { success: true, action: "approved" };
    }),

  /**
   * Reject a review (admin only)
   */
  rejectReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        reason: z.enum(REJECTION_REASONS),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can moderate reviews");
      }

      // Get review details for notification
      const [review] = await db
        .select()
        .from(productReviews)
        .where(eq(productReviews.id, input.reviewId))
        .limit(1);

      if (!review) {
        throw new Error("Review not found");
      }

      // Update review status
      await db
        .update(productReviews)
        .set({
          status: "hidden",
          updatedAt: new Date(),
        })
        .where(eq(productReviews.id, input.reviewId));

      // Send notification to reviewer with rejection reason
      await sendModerationNotification(review.userId, 'rejected', {
        reviewId: input.reviewId,
        reason: input.reason,
        note: input.note,
      });
      logger.info(`[Moderation] Review ${input.reviewId} rejected by admin ${ctx.user.id}`);
      logger.info(`[Moderation] Reason: ${input.reason}`);
      if (input.note) {
        logger.info(`[Moderation] Note: ${input.note}`);
      }

      return {
        success: true,
        action: "rejected",
        reason: input.reason,
      };
    }),

  /**
   * Hide a review temporarily (admin only)
   */
  hideReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can moderate reviews");
      }

      await db
        .update(productReviews)
        .set({
          status: "hidden",
          updatedAt: new Date(),
        })
        .where(eq(productReviews.id, input.reviewId));

      logger.info(`[Moderation] Review ${input.reviewId} hidden by admin ${ctx.user.id}`);

      return { success: true, action: "hidden" };
    }),

  /**
   * Flag a review for manual review (admin only)
   */
  flagReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can moderate reviews");
      }

      await db
        .update(productReviews)
        .set({
          status: "flagged",
          updatedAt: new Date(),
        })
        .where(eq(productReviews.id, input.reviewId));

      logger.info(`[Moderation] Review ${input.reviewId} flagged by admin ${ctx.user.id}`);

      return { success: true, action: "flagged" };
    }),

  /**
   * Bulk moderate reviews (admin only)
   */
  bulkModerate: protectedProcedure
    .input(
      z.object({
        reviewIds: z.array(z.number()),
        action: z.enum(MODERATION_ACTIONS),
        reason: z.enum(REJECTION_REASONS).optional(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can moderate reviews");
      }

      const statusMap: Record<typeof MODERATION_ACTIONS[number], string> = {
        approve: "published",
        reject: "hidden",
        hide: "hidden",
        flag: "flagged",
      };

      const newStatus = statusMap[input.action];

      // Update all reviews
      for (const reviewId of input.reviewIds) {
        await db
          .update(productReviews)
          .set({
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(productReviews.id, reviewId));
      }

      logger.info(`[Moderation] Bulk ${input.action} on ${input.reviewIds.length} reviews by admin ${ctx.user.id}`);

      return {
        success: true,
        action: input.action,
        count: input.reviewIds.length,
      };
    }),

  /**
   * Get moderation history for a review
   */
  getModerationHistory: protectedProcedure
    .input(z.object({ reviewId: z.number() }))
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
        throw new Error("Only admins can view moderation history");
      }

      // Query moderation actions from notification queue + review status changes
      const notifications = await db
        .select({
          id: notificationQueue.id,
          userId: notificationQueue.userId,
          messageText: notificationQueue.messageText,
          messageData: notificationQueue.messageData,
          createdAt: notificationQueue.createdAt,
        })
        .from(notificationQueue)
        .where(and(
          eq(notificationQueue.notificationType, 'moderation'),
        ))
        .orderBy(desc(notificationQueue.createdAt))
        .limit(20);

      // Get the review to find related moderation events
      const [review] = await db
        .select()
        .from(productReviews)
        .where(eq(productReviews.id, input.reviewId))
        .limit(1);

      // Build history from notification records related to this review
      const history = notifications
        .filter((n) => {
          const data = n.messageData as Record<string, unknown> | null;
          return data && (data.reviewId === input.reviewId || data.reviewId === String(input.reviewId));
        })
        .map((n, idx) => {
          const data = (n.messageData || {}) as Record<string, unknown>;
          const messageText = n.messageText || '';
          let action = 'moderated';
          if (messageText.includes('approved')) action = 'approved';
          else if (messageText.includes('not approved') || messageText.includes('rejected')) action = 'rejected';
          else if (messageText.includes('appeal')) action = 'appeal_received';
          else if (messageText.includes('flagged')) action = 'flagged';

          return {
            id: n.id,
            reviewId: input.reviewId,
            action,
            moderatorId: (data.moderatorId as number) || ctx.user.id,
            moderatorName: (data.moderatorName as string) || 'Moderator',
            reason: (data.reason as string) || '',
            note: (data.note as string) || '',
            timestamp: n.createdAt,
          };
        });

      // If no history found, include the current review status as the most recent action
      if (history.length === 0 && review) {
        history.push({
          id: 0,
          reviewId: input.reviewId,
          action: review.status === 'published' ? 'approved' : review.status === 'rejected' ? 'rejected' : 'pending',
          moderatorId: ctx.user.id,
          moderatorName: 'System',
          reason: '',
          note: `Review is currently ${review.status}`,
          timestamp: review.updatedAt || review.createdAt,
        });
      }

      return history;
    }),

  /**
   * Get rejection reasons list
   */
  getRejectionReasons: protectedProcedure.query(async () => {
    return REJECTION_REASONS.map(reason => ({
      value: reason,
      label: reason
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    }));
  }),

  /**
   * Get moderation actions list
   */
  getModerationActions: protectedProcedure.query(async () => {
    return MODERATION_ACTIONS.map(action => ({
      value: action,
      label: action.charAt(0).toUpperCase() + action.slice(1),
    }));
  }),

  /**
   * Appeal a rejected review (user)
   */
  appealReview: protectedProcedure
    .input(
      z.object({
        reviewId: z.number(),
        appealReason: z.string().min(20).max(500),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify user owns the review
      const [review] = await db
        .select()
        .from(productReviews)
        .where(
          and(
            eq(productReviews.id, input.reviewId),
            eq(productReviews.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!review) {
        throw new Error("Review not found or you don't have permission");
      }

      if (review.status !== "hidden") {
        throw new Error("Only rejected reviews can be appealed");
      }

      // Log the appeal
      logger.info(`[Appeal] User ${ctx.user.id} appealed review ${input.reviewId}`);
      logger.info(`[Appeal] Reason: ${input.appealReason}`);

      // Update review with appeal information (store in review record since we don't have separate appeals table)
      await db
        .update(productReviews)
        .set({
          status: "pending", // Set back to pending for re-review
          updatedAt: new Date(),
        })
        .where(eq(productReviews.id, input.reviewId));

      // Send notification to user confirming appeal received
      await sendModerationNotification(ctx.user.id, 'appeal_received', {
        reviewId: input.reviewId,
      });

      // Notify admins about the appeal via notification queue
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'));

      for (const admin of admins) {
        await db.insert(notificationQueue).values({
          userId: admin.id,
          phoneNumber: '',
          channel: 'in_app',
          notificationType: 'moderation_appeal',
          messageText: `New Review Appeal\nUser has appealed review #${input.reviewId}. Reason: ${input.appealReason.substring(0, 100)}...`,
          messageData: { reviewId: input.reviewId, appealReason: input.appealReason },
          status: 'pending',
        });
      }

      return {
        success: true,
        message: "Your appeal has been submitted and will be reviewed by our team.",
      };
    }),

  /**
   * Get user's appeals
   */
  getMyAppeals: protectedProcedure.query(async ({ ctx }) => {
    // In production, query appeals table
    // For now, return empty array
    return [];
  }),

  /**
   * Get pending appeals (admin only)
   */
  getPendingAppeals: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Check admin permission
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user || user.role !== 'admin') {
      throw new Error("Only admins can view appeals");
    }

    // In production, query appeals table
    // For now, return empty array
    return [];
  }),

  /**
   * Resolve an appeal (admin only)
   */
  resolveAppeal: protectedProcedure
    .input(
      z.object({
        appealId: z.number(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check admin permission
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user || user.role !== 'admin') {
        throw new Error("Only admins can resolve appeals");
      }

      logger.info(`[Appeal] Admin ${ctx.user.id} ${input.decision} appeal ${input.appealId}`);

      // Get the review associated with this appeal (appealId is the reviewId in our implementation)
      const [review] = await db
        .select()
        .from(productReviews)
        .where(eq(productReviews.id, input.appealId))
        .limit(1);

      if (!review) {
        throw new Error("Review not found");
      }

      // Update review status based on decision
      if (input.decision === 'approved') {
        await db.update(productReviews)
          .set({ status: 'published', updatedAt: new Date() })
          .where(eq(productReviews.id, input.appealId));
        
        // Notify user their appeal was approved
        await sendModerationNotification(review.userId, 'approved', {
          reviewId: input.appealId,
          note: input.note || 'Your appeal has been approved.',
        });
      } else {
        await db.update(productReviews)
          .set({ status: 'hidden', updatedAt: new Date() })
          .where(eq(productReviews.id, input.appealId));
        
        // Notify user their appeal was rejected
        await sendModerationNotification(review.userId, 'rejected', {
          reviewId: input.appealId,
          reason: 'appeal_denied',
          note: input.note || 'Your appeal has been reviewed and denied.',
        });
      }

      return {
        success: true,
        decision: input.decision,
      };
    }),
});
