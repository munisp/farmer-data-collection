import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { smsResponses, users, loans } from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from '../logger.js';

/**
 * SMS Responses Router
 * 
 * Handles incoming SMS responses from borrowers via Africa's Talking webhook.
 * Provides classification, auto-reply, and admin management features.
 */

// Simple keyword-based classification
function classifyMessage(message: string): { category: string, sentiment: string } {
  const lowerMessage = message.toLowerCase();
  
  // Category classification
  let category = "other";
  if (lowerMessage.match(/paid|payment|sent|transferred/)) {
    category = "payment_confirmation";
  } else if (lowerMessage.match(/when|how|what|why|where|can i|help/)) {
    category = "query";
  } else if (lowerMessage.match(/problem|issue|complaint|wrong|error|not received/)) {
    category = "complaint";
  } else if (lowerMessage.match(/ok|okay|thanks|thank you|received|understood/)) {
    category = "acknowledgment";
  }
  
  // Sentiment analysis (basic)
  let sentiment = "neutral";
  if (lowerMessage.match(/thank|thanks|great|good|happy|appreciate/)) {
    sentiment = "positive";
  } else if (lowerMessage.match(/bad|terrible|angry|frustrated|disappointed|complaint/)) {
    sentiment = "negative";
  }
  
  return { category, sentiment };
}

// Generate auto-reply based on category
function generateAutoReply(category: string, borrowerName?: string): string | null {
  const greeting = borrowerName ? `Dear ${borrowerName}, ` : "Dear customer, ";
  
  switch (category) {
    case "payment_confirmation":
      return `${greeting}Thank you for confirming your payment. We will verify and update your account shortly.`;
    case "acknowledgment":
      return `${greeting}Thank you for your response. We're here if you need any assistance.`;
    case "query":
      return `${greeting}Thank you for your message. Our team will respond to your query within 24 hours.`;
    case "complaint":
      return `${greeting}We apologize for the inconvenience. Your complaint has been escalated to our team for immediate attention.`;
    default:
      return null; // No auto-reply for "other" category
  }
}

export const smsResponsesRouter = router({
  /**
   * Webhook endpoint for incoming SMS from Africa's Talking
   * This is a public endpoint (no authentication required)
   */
  webhook: publicProcedure
    .input(z.object({
      from: z.string(), // Sender's phone number
      to: z.string(), // Our shortcode/number
      text: z.string(), // Message content
      id: z.string().optional(), // Africa's Talking message ID
      date: z.string().optional(), // Timestamp
      linkId: z.string().optional(), // Link to original message (if reply)
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Classify the message
      const { category, sentiment } = classifyMessage(input.text);

      // Try to match phone number to a user
      let matchedUserId: number | null = null;
      let matchedLoanId: number | null = null;
      let borrowerName: string | undefined;

      const [matchedUser] = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.phoneNumber, input.from))
        .limit(1);

      if (matchedUser) {
        matchedUserId = matchedUser.id;
        borrowerName = `${matchedUser.firstName} ${matchedUser.lastName}`;

        // Try to find an active loan for this user
        const [activeLoan] = await db
          .select({ id: loans.id })
          .from(loans)
          .where(
            and(
              eq(loans.userId, matchedUser.id),
              eq(loans.status, "active")
            )
          )
          .limit(1);

        if (activeLoan) {
          matchedLoanId = activeLoan.id;
        }
      }

      // Determine if requires attention
      const requiresAttention = category === "complaint" || category === "query";

      // Store the response
      const [response] = await db
        .insert(smsResponses)
        .values({
          fromPhone: input.from,
          toPhone: input.to,
          message: input.text,
          messageId: input.id,
          category,
          sentiment,
          isProcessed: requiresAttention ? "requires_attention" : "pending",
          userId: matchedUserId,
          loanId: matchedLoanId,
          originalMessageId: input.linkId,
          metadata: JSON.stringify({
            receivedDate: input.date,
            classification: { category, sentiment },
          }),
        })
        .returning();

      // Generate and send auto-reply if applicable
      const autoReplyMessage = generateAutoReply(category, borrowerName);
      if (autoReplyMessage) {
        try {
          const smsService = await import("../services/sms");
          await smsService.sendSMS({
            to: input.from,
            message: autoReplyMessage,
          });

          // Update response with auto-reply info
          await db
            .update(smsResponses)
            .set({
              autoReplyMessage,
              autoReplySentAt: new Date(),
            })
            .where(eq(smsResponses.id, response.id));
        } catch (error) {
          logger.error("Failed to send auto-reply:", error);
        }
      }

      return {
        success: true,
        responseId: response.id,
        category,
        sentiment,
        autoReplySent: !!autoReplyMessage,
      };
    }),

  /**
   * List all SMS responses with filters
   */
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "processed", "requires_attention", "all"]).optional(),
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];
      
      if (input.status && input.status !== "all") {
        conditions.push(eq(smsResponses.isProcessed, input.status));
      }
      
      if (input.category) {
        conditions.push(eq(smsResponses.category, input.category));
      }

      const responses = await db
        .select({
          response: smsResponses,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
        })
        .from(smsResponses)
        .leftJoin(users, eq(smsResponses.userId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(smsResponses.receivedAt))
        .limit(input.limit)
        .offset(input.offset);

      return responses;
    }),

  /**
   * Get response by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [response] = await db
        .select({
          response: smsResponses,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phoneNumber: users.phoneNumber,
          },
          loan: loans,
        })
        .from(smsResponses)
        .leftJoin(users, eq(smsResponses.userId, users.id))
        .leftJoin(loans, eq(smsResponses.loanId, loans.id))
        .where(eq(smsResponses.id, input.id))
        .limit(1);

      if (!response) {
        throw new Error("Response not found");
      }

      return response;
    }),

  /**
   * Update response status and add notes
   */
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "processed", "requires_attention"]),
      notes: z.string().optional(),
      assignTo: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updates: Record<string, unknown> = {
        isProcessed: input.status,
        updatedAt: new Date(),
      };

      if (input.notes) {
        updates.notes = input.notes;
      }

      if (input.assignTo) {
        updates.assignedTo = input.assignTo;
      }

      if (input.status === "processed") {
        updates.resolvedAt = new Date();
        updates.resolvedBy = ctx.user.id;
      }

      const [response] = await db
        .update(smsResponses)
        .set(updates)
        .where(eq(smsResponses.id, input.id))
        .returning();

      return response;
    }),

  /**
   * Send manual reply to a response
   */
  sendReply: protectedProcedure
    .input(z.object({
      responseId: z.number(),
      message: z.string().min(1).max(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get the original response
      const [response] = await db
        .select()
        .from(smsResponses)
        .where(eq(smsResponses.id, input.responseId))
        .limit(1);

      if (!response) {
        throw new Error("Response not found");
      }

      // Send SMS
      const smsService = await import("../services/sms");
      const result = await smsService.sendSMS({
        to: response.fromPhone,
        message: input.message,
      });

      if (!result.success) {
        throw new Error(`Failed to send reply: ${result.error}`);
      }

      // Update response status
      await db
        .update(smsResponses)
        .set({
          isProcessed: "processed",
          resolvedAt: new Date(),
          resolvedBy: ctx.user.id,
          notes: sql`COALESCE(${smsResponses.notes}, '') || '\n\nReply sent: ' || ${input.message}`,
          updatedAt: new Date(),
        })
        .where(eq(smsResponses.id, input.responseId));

      return {
        success: true,
        messageId: result.messageId,
      };
    }),

  /**
   * Get statistics for SMS responses
   */
  getStatistics: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [stats] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          pending: sql<number>`SUM(CASE WHEN ${smsResponses.isProcessed} = 'pending' THEN 1 ELSE 0 END)`,
          processed: sql<number>`SUM(CASE WHEN ${smsResponses.isProcessed} = 'processed' THEN 1 ELSE 0 END)`,
          requiresAttention: sql<number>`SUM(CASE WHEN ${smsResponses.isProcessed} = 'requires_attention' THEN 1 ELSE 0 END)`,
          paymentConfirmations: sql<number>`SUM(CASE WHEN ${smsResponses.category} = 'payment_confirmation' THEN 1 ELSE 0 END)`,
          queries: sql<number>`SUM(CASE WHEN ${smsResponses.category} = 'query' THEN 1 ELSE 0 END)`,
          complaints: sql<number>`SUM(CASE WHEN ${smsResponses.category} = 'complaint' THEN 1 ELSE 0 END)`,
          positiveResponses: sql<number>`SUM(CASE WHEN ${smsResponses.sentiment} = 'positive' THEN 1 ELSE 0 END)`,
          negativeResponses: sql<number>`SUM(CASE WHEN ${smsResponses.sentiment} = 'negative' THEN 1 ELSE 0 END)`,
        })
        .from(smsResponses);

      return stats;
    }),
});
