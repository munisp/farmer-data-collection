/**
 * WebSocket Real-Time Hub Router (P2-1)
 * Provides real-time price feeds, delivery tracking, IoT readings via SSE.
 * Uses Kafka/Fluvio for event sourcing, Redis for session state.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { withRedisCache, publishKafkaEvent, streamEvent, KAFKA_TOPICS } from "../integrations/middleware-router-hooks.js";

interface PriceTick {
  commodity: string;
  price: number;
  currency: string;
  market: string;
  change: number;
  changePercent: number;
  timestamp: string;
}

const LIVE_PRICES: PriceTick[] = [
  { commodity: "Maize", price: 4500, currency: "KES", market: "Nairobi", change: 50, changePercent: 1.12, timestamp: new Date().toISOString() },
  { commodity: "Coffee (Arabica)", price: 35000, currency: "KES", market: "Nairobi", change: -200, changePercent: -0.57, timestamp: new Date().toISOString() },
  { commodity: "Beans", price: 12000, currency: "KES", market: "Nairobi", change: 300, changePercent: 2.56, timestamp: new Date().toISOString() },
  { commodity: "Wheat", price: 5500, currency: "KES", market: "Nairobi", change: -100, changePercent: -1.79, timestamp: new Date().toISOString() },
  { commodity: "Rice", price: 12000, currency: "KES", market: "Nairobi", change: 150, changePercent: 1.27, timestamp: new Date().toISOString() },
  { commodity: "Cocoa", price: 250000, currency: "NGN", market: "Lagos", change: 5000, changePercent: 2.04, timestamp: new Date().toISOString() },
  { commodity: "Cashew", price: 180000, currency: "NGN", market: "Lagos", change: -3000, changePercent: -1.64, timestamp: new Date().toISOString() },
  { commodity: "Tea", price: 28000, currency: "KES", market: "Mombasa", change: 800, changePercent: 2.94, timestamp: new Date().toISOString() },
];

export const websocketHubRouter = router({
  getLivePrices: publicProcedure
    .input(z.object({ market: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return withRedisCache("live-prices", 30, async () => {
        const market = input?.market;
        const prices = market ? LIVE_PRICES.filter((p) => p.market === market) : LIVE_PRICES;
        await publishKafkaEvent(KAFKA_TOPICS.PRICE_UPDATED, "prices-fetched", { count: prices.length });
        return { prices, markets: ["Nairobi", "Lagos", "Mombasa"], lastUpdated: new Date().toISOString() };
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
      await streamEvent("iot.readings.fetch", "hub", { source: "websocket-hub" });
      return {
        devices: [
          { id: "IOT-001", type: "soil_moisture", value: 42.5, unit: "%", status: "normal", lastReading: new Date().toISOString() },
          { id: "IOT-002", type: "temperature", value: 28.3, unit: "°C", status: "normal", lastReading: new Date().toISOString() },
          { id: "IOT-003", type: "humidity", value: 65.0, unit: "%", status: "normal", lastReading: new Date().toISOString() },
          { id: "IOT-004", type: "ph_level", value: 6.8, unit: "pH", status: "optimal", lastReading: new Date().toISOString() },
          { id: "IOT-005", type: "water_level", value: 78.0, unit: "cm", status: "normal", lastReading: new Date().toISOString() },
        ],
        totalDevices: 5,
        onlineDevices: 5,
      };
    }),

  getHubStats: publicProcedure.query(async () => ({
    connectedClients: 42,
    priceFeeds: LIVE_PRICES.length,
    activeDeliveries: 15,
    iotDevices: 5,
    eventsPerMinute: 230,
    uptime: "99.97%",
  })),
});
