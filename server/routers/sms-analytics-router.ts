import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { smsDeliveryLogs } from "../../drizzle/sms-logs-schema";
import { smsScheduledMessages, smsTemplates } from "../../drizzle/schema";
import { eq, desc, and, sql, gte, lte, count } from "drizzle-orm";

/**
 * SMS Analytics Router
 * 
 * Provides comprehensive analytics for SMS delivery, costs, and engagement.
 */

export const smsAnalyticsRouter = router({
  // Get overall SMS statistics
  getOverallStats: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(smsDeliveryLogs.userId, ctx.user.id)];
      
      if (input?.startDate) {
        conditions.push(gte(smsDeliveryLogs.createdAt, new Date(input.startDate)));
      }
      
      if (input?.endDate) {
        conditions.push(lte(smsDeliveryLogs.createdAt, new Date(input.endDate)));
      }

      // Total messages sent
      const [totalResult] = await db
        .select({ count: count() })
        .from(smsDeliveryLogs)
        .where(and(...conditions));

      // Delivered messages
      const [deliveredResult] = await db
        .select({ count: count() })
        .from(smsDeliveryLogs)
        .where(
          and(
            ...conditions,
            eq(smsDeliveryLogs.status, "delivered")
          )
        );

      // Failed messages
      const [failedResult] = await db
        .select({ count: count() })
        .from(smsDeliveryLogs)
        .where(
          and(
            ...conditions,
            eq(smsDeliveryLogs.status, "failed")
          )
        );

      // Total cost
      const [costResult] = await db
        .select({ 
          totalCost: sql<number>`COALESCE(SUM(CAST(${smsDeliveryLogs.costAmount} AS NUMERIC)), 0)` 
        })
        .from(smsDeliveryLogs)
        .where(and(...conditions));

      const totalMessages = totalResult.count || 0;
      const deliveredMessages = deliveredResult.count || 0;
      const failedMessages = failedResult.count || 0;
      const totalCost = costResult.totalCost || 0;

      return {
        totalMessages,
        deliveredMessages,
        failedMessages,
        pendingMessages: totalMessages - deliveredMessages - failedMessages,
        deliveryRate: totalMessages > 0 ? (deliveredMessages / totalMessages) * 100 : 0,
        failureRate: totalMessages > 0 ? (failedMessages / totalMessages) * 100 : 0,
        totalCost,
        averageCostPerMessage: totalMessages > 0 ? totalCost / totalMessages : 0,
      };
    }),

  // Get delivery trends over time
  getDeliveryTrends: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      groupBy: z.enum(["hour", "day", "week", "month"]).default("day"),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Build date truncation based on groupBy
      let dateTrunc;
      switch (input.groupBy) {
        case "hour":
          dateTrunc = sql`DATE_TRUNC('hour', ${smsDeliveryLogs.createdAt})`;
          break;
        case "week":
          dateTrunc = sql`DATE_TRUNC('week', ${smsDeliveryLogs.createdAt})`;
          break;
        case "month":
          dateTrunc = sql`DATE_TRUNC('month', ${smsDeliveryLogs.createdAt})`;
          break;
        default:
          dateTrunc = sql`DATE_TRUNC('day', ${smsDeliveryLogs.createdAt})`;
      }

      const trends = await db
        .select({
          period: dateTrunc,
          totalMessages: count(),
          deliveredMessages: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'delivered' THEN 1 END)`,
          failedMessages: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'failed' THEN 1 END)`,
          totalCost: sql<number>`COALESCE(SUM(CAST(${smsDeliveryLogs.costAmount} AS NUMERIC)), 0)`,
        })
        .from(smsDeliveryLogs)
        .where(
          and(
            eq(smsDeliveryLogs.userId, ctx.user.id),
            gte(smsDeliveryLogs.createdAt, new Date(input.startDate)),
            lte(smsDeliveryLogs.createdAt, new Date(input.endDate))
          )
        )
        .groupBy(dateTrunc)
        .orderBy(dateTrunc);

      return trends;
    }),

  // Get message type breakdown
  getMessageTypeBreakdown: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(smsDeliveryLogs.userId, ctx.user.id)];
      
      if (input?.startDate) {
        conditions.push(gte(smsDeliveryLogs.createdAt, new Date(input.startDate)));
      }
      
      if (input?.endDate) {
        conditions.push(lte(smsDeliveryLogs.createdAt, new Date(input.endDate)));
      }

      const breakdown = await db
        .select({
          messageType: smsDeliveryLogs.messageType,
          count: count(),
          totalCost: sql<number>`COALESCE(SUM(CAST(${smsDeliveryLogs.costAmount} AS NUMERIC)), 0)`,
          deliveredCount: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'delivered' THEN 1 END)`,
        })
        .from(smsDeliveryLogs)
        .where(and(...conditions))
        .groupBy(smsDeliveryLogs.messageType)
        .orderBy(desc(count()));

      return breakdown;
    }),

  // Get recipient engagement metrics
  getRecipientEngagement: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(smsDeliveryLogs.userId, ctx.user.id)];
      
      if (input?.startDate) {
        conditions.push(gte(smsDeliveryLogs.createdAt, new Date(input.startDate)));
      }
      
      if (input?.endDate) {
        conditions.push(lte(smsDeliveryLogs.createdAt, new Date(input.endDate)));
      }

      const engagement = await db
        .select({
          recipientPhone: smsDeliveryLogs.phoneNumber,
          totalMessages: count(),
          deliveredMessages: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'delivered' THEN 1 END)`,
          failedMessages: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'failed' THEN 1 END)`,
          totalCost: sql<number>`COALESCE(SUM(CAST(${smsDeliveryLogs.costAmount} AS NUMERIC)), 0)`,
          lastMessageDate: sql<Date>`MAX(${smsDeliveryLogs.createdAt})`,
        })
        .from(smsDeliveryLogs)
        .where(and(...conditions))
        .groupBy(smsDeliveryLogs.phoneNumber)
        .orderBy(desc(count()))
        .limit(input?.limit || 20);

      return engagement;
    }),

  // Get template usage statistics
  getTemplateUsageStats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const templates = await db
        .select({
          id: smsTemplates.id,
          name: smsTemplates.name,
          type: smsTemplates.type,
          usageCount: smsTemplates.usageCount,
          isActive: smsTemplates.isActive,
          isDefault: smsTemplates.isDefault,
        })
        .from(smsTemplates)
        .orderBy(desc(smsTemplates.usageCount));

      return templates;
    }),

  // Get scheduled messages statistics
  getScheduledStats: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Pending count
      const [pendingResult] = await db
        .select({ count: count() })
        .from(smsScheduledMessages)
        .where(eq(smsScheduledMessages.status, "pending"));

      // Sent count
      const [sentResult] = await db
        .select({ count: count() })
        .from(smsScheduledMessages)
        .where(eq(smsScheduledMessages.status, "sent"));

      // Failed count
      const [failedResult] = await db
        .select({ count: count() })
        .from(smsScheduledMessages)
        .where(eq(smsScheduledMessages.status, "failed"));

      // Cancelled count
      const [cancelledResult] = await db
        .select({ count: count() })
        .from(smsScheduledMessages)
        .where(eq(smsScheduledMessages.status, "cancelled"));

      // Total cost of sent scheduled messages
      const [costResult] = await db
        .select({ 
          totalCost: sql<number>`COALESCE(SUM(${smsScheduledMessages.cost}), 0)` 
        })
        .from(smsScheduledMessages)
        .where(eq(smsScheduledMessages.status, "sent"));

      return {
        pending: pendingResult.count || 0,
        sent: sentResult.count || 0,
        failed: failedResult.count || 0,
        cancelled: cancelledResult.count || 0,
        totalCost: costResult.totalCost || 0,
      };
    }),

  // Get cost projections
  getCostProjections: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const days = input?.days || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get average daily cost
      const [avgResult] = await db
        .select({
          avgDailyCost: sql<number>`COALESCE(AVG(daily_cost), 0)`,
        })
        .from(
          db
            .select({
              date: sql`DATE(${smsDeliveryLogs.createdAt})`,
              daily_cost: sql<number>`SUM(CAST(${smsDeliveryLogs.costAmount} AS NUMERIC))`,
            })
            .from(smsDeliveryLogs)
            .where(
              and(
                eq(smsDeliveryLogs.userId, ctx.user.id),
                gte(smsDeliveryLogs.createdAt, startDate)
              )
            )
            .groupBy(sql`DATE(${smsDeliveryLogs.createdAt})`)
            .as("daily_costs")
        );

      const avgDailyCost = avgResult.avgDailyCost || 0;

      return {
        avgDailyCost,
        projectedWeeklyCost: avgDailyCost * 7,
        projectedMonthlyCost: avgDailyCost * 30,
        projectedYearlyCost: avgDailyCost * 365,
        basedOnDays: days,
      };
    }),

  // Get delivery success rate by hour of day
  getDeliveryByHourOfDay: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [eq(smsDeliveryLogs.userId, ctx.user.id)];
      
      if (input?.startDate) {
        conditions.push(gte(smsDeliveryLogs.createdAt, new Date(input.startDate)));
      }
      
      if (input?.endDate) {
        conditions.push(lte(smsDeliveryLogs.createdAt, new Date(input.endDate)));
      }

      const hourlyStats = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${smsDeliveryLogs.createdAt})`,
          totalMessages: count(),
          deliveredMessages: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'delivered' THEN 1 END)`,
          failedMessages: sql<number>`COUNT(CASE WHEN ${smsDeliveryLogs.status} = 'failed' THEN 1 END)`,
        })
        .from(smsDeliveryLogs)
        .where(and(...conditions))
        .groupBy(sql`EXTRACT(HOUR FROM ${smsDeliveryLogs.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${smsDeliveryLogs.createdAt})`);

      return hourlyStats;
    }),
});
