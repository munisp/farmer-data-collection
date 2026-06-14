/**
 * Push Notification Router (P2-5)
 * Web Push notifications via FCM/VAPID with topic subscriptions,
 * delivery scheduling, and preference management.
 * Middleware: Redis (dedup), Kafka (event sourcing), Dapr (state).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { publishKafkaEvent, saveDaprState, getDaprState, withRedisCache, checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";
import { getDb } from "../db.js";
import { notificationQueue } from "../../drizzle/schema.js";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../logger.js";

const notificationTopics = [
  { id: "price_alerts", name: "Price Alerts", description: "Commodity price changes above your threshold" },
  { id: "weather_alerts", name: "Weather Alerts", description: "Severe weather warnings for your farm location" },
  { id: "order_updates", name: "Order Updates", description: "Status changes for your buy/sell orders" },
  { id: "delivery_tracking", name: "Delivery Tracking", description: "Real-time delivery status updates" },
  { id: "loan_updates", name: "Loan Updates", description: "Loan application and repayment reminders" },
  { id: "harvest_reminders", name: "Harvest Reminders", description: "Scheduled harvest time notifications" },
  { id: "iot_alerts", name: "IoT Alerts", description: "Sensor threshold alerts (soil, water, temperature)" },
  { id: "community", name: "Community", description: "Cooperative announcements and community updates" },
];

export const pushNotificationRouter = router({
  listTopics: protectedProcedure.query(async () => ({
    topics: notificationTopics,
    total: notificationTopics.length,
  })),

  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await getDaprState("notifications", `prefs:${ctx.user.id}`);
    return (prefs as Record<string, unknown>) || {
      userId: ctx.user.id,
      enabled: true,
      quiet_hours: { start: "22:00", end: "06:00" },
      subscriptions: ["price_alerts", "weather_alerts", "order_updates"],
      channels: { push: true, sms: false, email: true, whatsapp: false },
    };
  }),

  updatePreferences: protectedProcedure
    .input(z.object({
      subscriptions: z.array(z.string()).optional(),
      quietHoursStart: z.string().optional(),
      quietHoursEnd: z.string().optional(),
      channels: z.object({
        push: z.boolean().optional(),
        sms: z.boolean().optional(),
        email: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("push_notification", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("push_notification", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const prefs = {
        userId: ctx.user.id,
        enabled: true,
        subscriptions: input.subscriptions || ["price_alerts"],
        quiet_hours: { start: input.quietHoursStart || "22:00", end: input.quietHoursEnd || "06:00" },
        channels: input.channels || { push: true, sms: false, email: true, whatsapp: false },
        updatedAt: new Date().toISOString(),
      };
      await saveDaprState("notifications", `prefs:${ctx.user.id}`, prefs);
      await publishKafkaEvent("notification.preferences.updated", String(ctx.user.id), prefs);
      return prefs;
    }),

  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      return withRedisCache(`notif-history:${ctx.user.id}`, 60, async () => {
        try {
          const db = await getDb();
          if (!db) return { notifications: [], total: 0, unread: 0 };

          const rows = await db.select().from(notificationQueue)
            .where(eq(notificationQueue.userId, ctx.user.id))
            .orderBy(desc(notificationQueue.createdAt))
            .limit(limit);

          const notifications = rows.map(r => ({
            id: `N-${r.id}`,
            topic: r.notificationType,
            title: r.notificationType.replace(/_/g, " "),
            body: r.messageText,
            read: r.status === "sent",
            sentAt: (r.sentAt || r.createdAt).toISOString(),
          }));

          const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(notificationQueue)
            .where(eq(notificationQueue.userId, ctx.user.id));
          const total = Number(countResult?.count ?? 0);

          const [unreadResult] = await db.select({ count: sql<number>`count(*)` }).from(notificationQueue)
            .where(sql`${notificationQueue.userId} = ${ctx.user.id} AND ${notificationQueue.status} = 'pending'`);
          const unread = Number(unreadResult?.count ?? 0);

          return { notifications, total, unread };
        } catch (err) {
          logger.warn("[PushNotification] DB query failed, returning empty");
          return { notifications: [], total: 0, unread: 0 };
        }
      });
    }),

  registerDevice: protectedProcedure
    .input(z.object({
      token: z.string(),
      platform: z.enum(["web", "android", "ios"]),
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("push_notification", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("push_notification", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      await saveDaprState("notifications", `device:${ctx.user.id}:${input.platform}`, {
        token: input.token,
        platform: input.platform,
        deviceName: input.deviceName,
        registeredAt: new Date().toISOString(),
      });
      return { registered: true, platform: input.platform };
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) return { userId: ctx.user.id, totalSent: 0, totalRead: 0, readRate: 0, topTopics: [] };

      const [sentResult] = await db.select({ count: sql<number>`count(*)` }).from(notificationQueue)
        .where(eq(notificationQueue.userId, ctx.user.id));
      const totalSent = Number(sentResult?.count ?? 0);

      const [readResult] = await db.select({ count: sql<number>`count(*)` }).from(notificationQueue)
        .where(sql`${notificationQueue.userId} = ${ctx.user.id} AND ${notificationQueue.status} = 'sent'`);
      const totalRead = Number(readResult?.count ?? 0);

      const topTopics = await db.select({
        topic: notificationQueue.notificationType,
        count: sql<number>`count(*)`,
      }).from(notificationQueue)
        .where(eq(notificationQueue.userId, ctx.user.id))
        .groupBy(notificationQueue.notificationType)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      return {
        userId: ctx.user.id,
        totalSent,
        totalRead,
        readRate: totalSent > 0 ? Math.round((totalRead / totalSent) * 1000) / 10 : 0,
        topTopics: topTopics.map(t => ({ topic: t.topic, count: Number(t.count) })),
      };
    } catch (err) {
      logger.warn("[PushNotification] Stats query failed, returning empty");
      return { userId: ctx.user.id, totalSent: 0, totalRead: 0, readRate: 0, topTopics: [] };
    }
  }),
});
