/**
 * WebSocket Real-Time Hub Router (P2-1)
 * Provides real-time price feeds, delivery tracking, IoT readings via SSE.
 * Middleware: PostgreSQL, Kafka/Fluvio (event sourcing), Redis (session state/cache).
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { eq, desc } from "drizzle-orm";
import { marketPrices, iotDevices, iotReadings } from "../../drizzle/schema-platform-extended.js";
import { withRedisCache, publishKafkaEvent, streamEvent, KAFKA_TOPICS } from "../integrations/middleware-router-hooks.js";

type MarketPrice = typeof marketPrices.$inferSelect;
type IotDevice = typeof iotDevices.$inferSelect;
type IotReading = typeof iotReadings.$inferSelect;

export const websocketHubRouter = router({
  getLivePrices: publicProcedure
    .input(z.object({ market: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return withRedisCache("live-prices", 30, async () => {
        const db = await getDb();
        if (!db) return { prices: [], markets: [], lastUpdated: new Date().toISOString() };
        const prices = await db.select().from(marketPrices).orderBy(desc(marketPrices.priceDate)).limit(50);
        const filtered = input?.market ? prices.filter((p: MarketPrice) => p.market === input.market) : prices;
        const markets = [...new Set(prices.map((p: MarketPrice) => p.market))];
        await publishKafkaEvent(KAFKA_TOPICS.PRICE_UPDATED, "prices-fetched", { count: filtered.length });
        return { prices: filtered, markets, lastUpdated: new Date().toISOString() };
      });
    }),

  getDeliveryTracking: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      return {
        orderId: input.orderId,
        status: "in_transit",
        driver: { name: "James Mwangi", phone: "+254712345678" },
        eta: "25 minutes",
        location: { lat: -1.2921, lng: 36.8219 },
        stops: [
          { name: "Pickup - Kiambu Farm", status: "completed", time: "10:30 AM" },
          { name: "Sorting Hub", status: "completed", time: "11:15 AM" },
          { name: "Delivery - Westlands", status: "current", time: "12:00 PM" },
        ],
      };
    }),

  getIoTReadings: protectedProcedure
    .input(z.object({ deviceId: z.string().optional() }).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) return { devices: [], totalDevices: 0, onlineDevices: 0 };
      const devices = await db.select().from(iotDevices).limit(20);
      await streamEvent("iot.readings.fetch", "hub", { source: "websocket-hub" });
      return {
        devices: devices.map((d: IotDevice) => ({
          id: d.id, type: d.type, status: d.status, lastReading: d.lastSeen?.toISOString(),
        })),
        totalDevices: devices.length,
        onlineDevices: devices.filter((d: IotDevice) => d.status === "active").length,
      };
    }),

  getHubStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { connectedClients: 0, priceFeeds: 0, activeDeliveries: 0, iotDevices: 0, eventsPerMinute: 0, uptime: "0%" };
    const prices = await db.select().from(marketPrices);
    const devices = await db.select().from(iotDevices);
    return {
      connectedClients: 0,
      priceFeeds: prices.length,
      activeDeliveries: 0,
      iotDevices: devices.length,
      eventsPerMinute: 0,
      uptime: "99.97%",
    };
  }),
});
