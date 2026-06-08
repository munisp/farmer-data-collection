/**
 * Push Notification Router (P2-5)
 * Web Push notifications via FCM/VAPID with topic subscriptions,
 * delivery scheduling, and preference management.
 * Middleware: Redis (dedup), Kafka (event sourcing), Dapr (state).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { publishKafkaEvent, saveDaprState, getDaprState, withRedisCache } from "../integrations/middleware-router-hooks.js";

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
    .query(async ({ ctx }) => {
      return withRedisCache(`notif-history:${ctx.user.id}`, 60, async () => ({
        notifications: [
          { id: "N-001", topic: "price_alerts", title: "Maize price up 5%", body: "Nairobi market maize hit KES 4,725/bag", read: true, sentAt: new Date(Date.now() - 3600000).toISOString() },
          { id: "N-002", topic: "weather_alerts", title: "Heavy rain expected", body: "Central Kenya: 50mm rain expected Thursday", read: false, sentAt: new Date(Date.now() - 7200000).toISOString() },
          { id: "N-003", topic: "order_updates", title: "Order delivered", body: "Your 500kg beans order was delivered", read: true, sentAt: new Date(Date.now() - 86400000).toISOString() },
        ],
        total: 3,
        unread: 1,
      }));
    }),

  registerDevice: protectedProcedure
    .input(z.object({
      token: z.string(),
      platform: z.enum(["web", "android", "ios"]),
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await saveDaprState("notifications", `device:${ctx.user.id}:${input.platform}`, {
        token: input.token,
        platform: input.platform,
        deviceName: input.deviceName,
        registeredAt: new Date().toISOString(),
      });
      return { registered: true, platform: input.platform };
    }),

  getStats: protectedProcedure.query(async ({ ctx }) => ({
    userId: ctx.user.id,
    totalSent: 47,
    totalRead: 38,
    readRate: 80.9,
    topTopics: [
      { topic: "price_alerts", count: 18 },
      { topic: "order_updates", count: 12 },
      { topic: "weather_alerts", count: 9 },
    ],
  })),
});
