/**
 * Notification Router
 * Push notifications, alerts, and notification preferences
 */

import { router, protectedProcedure } from '../_core/trpc-base.js';
import { z } from 'zod';
import { getDb } from '../db.js';
import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  notifications,
  notificationPreferences,
  pushTokens,
  priceAlerts,
  weatherAlerts,
  notificationTemplates,
} from '../../drizzle/notification-schema.js';

export const notificationRouter = router({
  // Get user notifications
  list: protectedProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
      unreadOnly: z.boolean().default(false),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: (ReturnType<typeof eq> | ReturnType<typeof isNull>)[] = [eq(notifications.userId, input.userId)];
      
      if (input.unreadOnly) {
        conditions.push(isNull(notifications.readAt));
      }
      
      if (input.category) {
        conditions.push(eq(notifications.category, input.category as 'price_alert' | 'weather_alert' | 'loan_status' | 'payment_reminder' | 'order_update' | 'harvest_reminder' | 'sync_status' | 'system' | 'promotional' | 'security' | 'cooperative' | 'agent_task'));
      }
      
      const results = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      
      return results;
    }),

  // Get unread count
  getUnreadCount: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(and(
          eq(notifications.userId, input.userId),
          isNull(notifications.readAt)
        ));
      
      return result?.count || 0;
    }),

  // Mark notification as read
  markAsRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(notifications)
        .set({ readAt: new Date(), status: 'read' })
        .where(eq(notifications.id, input.id))
        .returning();
      
      return updated;
    }),

  // Mark all as read
  markAllAsRead: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      await db
        .update(notifications)
        .set({ readAt: new Date(), status: 'read' })
        .where(and(
          eq(notifications.userId, input.userId),
          isNull(notifications.readAt)
        ));
      
      return { success: true };
    }),

  // Create notification
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      title: z.string(),
      body: z.string(),
      category: z.enum(['price_alert', 'weather_alert', 'loan_status', 'payment_reminder', 'order_update', 'harvest_reminder', 'sync_status', 'system', 'promotional', 'security', 'cooperative', 'agent_task']),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      channel: z.enum(['push', 'in_app', 'email', 'sms', 'whatsapp']).default('in_app'),
      actionUrl: z.string().optional(),
      actionData: z.any().optional(),
      referenceType: z.string().optional(),
      referenceId: z.number().optional(),
      scheduledFor: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [notification] = await db
        .insert(notifications)
        .values({
          ...input,
          status: input.scheduledFor ? 'pending' : 'sent',
          sentAt: input.scheduledFor ? undefined : new Date(),
          scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
        })
        .returning();
      
      return notification;
    }),

  // Get notification preferences
  getPreferences: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [prefs] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, input.userId));
      
      // Return defaults if no preferences exist
      if (!prefs) {
        return {
          userId: input.userId,
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          whatsappEnabled: false,
          inAppEnabled: true,
          quietHoursEnabled: false,
          digestEnabled: false,
          language: 'en',
          categoryPreferences: {},
        };
      }
      
      return prefs;
    }),

  // Update notification preferences
  updatePreferences: protectedProcedure
    .input(z.object({
      userId: z.number(),
      pushEnabled: z.boolean().optional(),
      emailEnabled: z.boolean().optional(),
      smsEnabled: z.boolean().optional(),
      whatsappEnabled: z.boolean().optional(),
      inAppEnabled: z.boolean().optional(),
      quietHoursEnabled: z.boolean().optional(),
      quietHoursStart: z.string().optional(),
      quietHoursEnd: z.string().optional(),
      digestEnabled: z.boolean().optional(),
      digestFrequency: z.string().optional(),
      digestTime: z.string().optional(),
      language: z.string().optional(),
      categoryPreferences: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { userId, ...data } = input;
      
      // Check if preferences exist
      const [existing] = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      
      if (existing) {
        const [updated] = await db
          .update(notificationPreferences)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(notificationPreferences)
          .values({ userId, ...data })
          .returning();
        return created;
      }
    }),

  // Register push token
  registerPushToken: protectedProcedure
    .input(z.object({
      userId: z.number(),
      token: z.string(),
      platform: z.enum(['ios', 'android', 'web']),
      deviceId: z.string().optional(),
      deviceName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Deactivate existing tokens for this device
      if (input.deviceId) {
        await db
          .update(pushTokens)
          .set({ isActive: false })
          .where(and(
            eq(pushTokens.userId, input.userId),
            eq(pushTokens.deviceId, input.deviceId)
          ));
      }
      
      const [token] = await db
        .insert(pushTokens)
        .values({
          ...input,
          isActive: true,
          lastUsed: new Date(),
        })
        .returning();
      
      return token;
    }),

  // Get price alerts
  getPriceAlerts: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const alerts = await db
        .select()
        .from(priceAlerts)
        .where(eq(priceAlerts.userId, input.userId))
        .orderBy(desc(priceAlerts.createdAt));
      
      return alerts;
    }),

  // Create price alert
  createPriceAlert: protectedProcedure
    .input(z.object({
      userId: z.number(),
      cropType: z.string(),
      region: z.string().optional(),
      alertType: z.enum(['above', 'below', 'change']),
      thresholdPrice: z.number(),
      percentageChange: z.number().optional(),
      cooldownMinutes: z.number().default(60),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [alert] = await db
        .insert(priceAlerts)
        .values({
          ...input,
          isActive: true,
          triggerCount: 0,
        })
        .returning();
      
      return alert;
    }),

  // Update price alert
  updatePriceAlert: protectedProcedure
    .input(z.object({
      id: z.number(),
      isActive: z.boolean().optional(),
      thresholdPrice: z.number().optional(),
      percentageChange: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { id, ...data } = input;
      
      const [updated] = await db
        .update(priceAlerts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(priceAlerts.id, id))
        .returning();
      
      return updated;
    }),

  // Delete price alert
  deletePriceAlert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      await db.delete(priceAlerts).where(eq(priceAlerts.id, input.id));
      return { success: true };
    }),

  // Get weather alerts
  getWeatherAlerts: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
      region: z.string().optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: ReturnType<typeof eq>[] = [];
      
      if (input.userId) {
        conditions.push(eq(weatherAlerts.userId, input.userId));
      }
      if (input.region) {
        conditions.push(eq(weatherAlerts.region, input.region));
      }
      if (input.activeOnly) {
        conditions.push(eq(weatherAlerts.isActive, true));
      }
      
      const alerts = await db
        .select()
        .from(weatherAlerts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(weatherAlerts.validFrom));
      
      return alerts;
    }),

  // Create weather alert
  createWeatherAlert: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
      farmId: z.number().optional(),
      alertType: z.string(),
      severity: z.enum(['advisory', 'watch', 'warning', 'emergency']),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      region: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      recommendation: z.string().optional(),
      validFrom: z.string(),
      validUntil: z.string().optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [alert] = await db
        .insert(weatherAlerts)
        .values({
          ...input,
          validFrom: new Date(input.validFrom),
          validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
          isActive: true,
        })
        .returning();
      
      return alert;
    }),

  // Acknowledge weather alert
  acknowledgeWeatherAlert: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(weatherAlerts)
        .set({ acknowledgedAt: new Date() })
        .where(eq(weatherAlerts.id, input.id))
        .returning();
      
      return updated;
    }),

  // Get notification templates
  getTemplates: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      language: z.string().default('en'),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: ReturnType<typeof eq>[] = [eq(notificationTemplates.isActive, true)];
      
      if (input.category) {
        conditions.push(eq(notificationTemplates.category, input.category as 'price_alert' | 'weather_alert' | 'loan_status' | 'payment_reminder' | 'order_update' | 'harvest_reminder' | 'sync_status' | 'system' | 'promotional' | 'security' | 'cooperative' | 'agent_task'));
      }
      if (input.language) {
        conditions.push(eq(notificationTemplates.language, input.language));
      }
      
      const templates = await db
        .select()
        .from(notificationTemplates)
        .where(and(...conditions));
      
      return templates;
    }),
});
