/**
 * Price Alerts & Market Intelligence Router
 * 
 * SMS/push alerts when crop prices hit thresholds.
 * Price prediction via Python ML service.
 * Market overview and demand forecasting.
 * 
 * Middleware: Kafka (alert events), Redis (threshold cache),
 * PostgreSQL (alert subscriptions), Africa's Talking (SMS delivery)
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { priceAlerts, weatherStations } from "../../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getProducer } from "../kafka.js";
import { resilientFetch } from "../services/resilient-http.js";

const PRICE_SERVICE_URL = process.env.PRICE_PREDICTION_SERVICE_URL || "http://localhost:8093";

async function callPriceService(method: string, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const resp = await resilientFetch(
      "price-prediction-service",
      `${PRICE_SERVICE_URL}${path}`,
      {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      },
      { maxRetries: 3, timeoutMs: 10_000 },
    );
    return await resp.json() as Record<string, unknown>;
  } catch (err) {
    return { error: "Price prediction service unavailable" };
  }
}

export const priceAlertsRouter = router({
  // ============================================================================
  // Price Alerts
  // ============================================================================

  // Subscribe to price alerts
  createAlert: protectedProcedure
    .input(z.object({
      crop: z.string(),
      alertType: z.enum(["above", "below", "change"]),
      threshold: z.number().positive(),
      currency: z.string().default("NGN"),
      notificationChannel: z.enum(["sms", "push", "email", "whatsapp"]).default("sms"),
      phoneNumber: z.string().optional(),
      region: z.string().default("kenya"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [alert] = await db.insert(priceAlerts).values({
        userId: ctx.user.id,
        crop: input.crop,
        alertType: input.alertType,
        threshold: input.threshold,
        currency: input.currency,
        notificationChannel: input.notificationChannel,
        phoneNumber: input.phoneNumber || null,
        region: input.region,
        active: true,
      }).returning();
      return alert;
    }),

  getMyAlerts: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(priceAlerts)
        .where(and(eq(priceAlerts.userId, ctx.user.id), eq(priceAlerts.active, true)))
        .orderBy(desc(priceAlerts.createdAt));
    }),

  deleteAlert: protectedProcedure
    .input(z.object({ alertId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(priceAlerts)
        .set({ active: false })
        .where(and(eq(priceAlerts.id, input.alertId), eq(priceAlerts.userId, ctx.user.id)));
      return { deleted: true };
    }),

  // ============================================================================
  // Price Predictions (Python ML service)
  // ============================================================================

  predictPrice: publicProcedure
    .input(z.object({
      crop: z.string(),
      targetDate: z.string(),
      region: z.string().default("kenya"),
      weatherCondition: z.enum(["drought", "below_normal_rain", "normal", "above_normal_rain", "flood"]).default("normal"),
      supplyLevel: z.enum(["low", "normal", "high", "surplus"]).default("normal"),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callPriceService("POST", "/api/predict", {
        crop: input.crop,
        target_date: input.targetDate,
        region: input.region,
        weather_condition: input.weatherCondition,
        supply_level: input.supplyLevel,
      });
    }),

  predictPriceSeries: publicProcedure
    .input(z.object({
      crop: z.string(),
      startDate: z.string().optional(),
      weeks: z.number().min(1).max(52).default(12),
      weatherCondition: z.string().default("normal"),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callPriceService("POST", "/api/predict/series", {
        crop: input.crop,
        start_date: input.startDate || new Date().toISOString().split("T")[0],
        weeks: input.weeks,
        weather_condition: input.weatherCondition,
      });
    }),

  forecastDemand: publicProcedure
    .input(z.object({
      crop: z.string(),
      region: z.string().default("nairobi"),
      weeksAhead: z.number().min(1).max(52).default(4),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callPriceService("POST", "/api/demand/forecast", {
        crop: input.crop,
        region: input.region,
        weeks_ahead: input.weeksAhead,
      });
    }),

  getMarketOverview: publicProcedure
    .query(async () => {
      const db = await requireDb();
      return callPriceService("GET", "/api/market-overview");
    }),

  getSupportedCrops: publicProcedure
    .query(async () => {
      const db = await requireDb();
      return callPriceService("GET", "/api/crops");
    }),

  // ============================================================================
  // Weather Stations (for hyperlocal alerts)
  // ============================================================================

  registerWeatherStation: protectedProcedure
    .input(z.object({
      stationId: z.string(),
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      elevation: z.number().optional(),
      stationType: z.string().default("automated"),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [station] = await db.insert(weatherStations).values({
        stationId: input.stationId,
        name: input.name,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        elevation: input.elevation ? String(input.elevation) : null,
        stationType: input.stationType,
      }).returning();
      return station;
    }),

  getWeatherStations: publicProcedure
    .query(async () => {
      const db = await requireDb();
      return db.select().from(weatherStations);
    }),
});
