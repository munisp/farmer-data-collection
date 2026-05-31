/**
 * Subscription Delivery Router — Urban Micro-Delivery
 *
 * Orchestrates communication between:
 *  - Rust Urban Delivery Service (Port 8111) — micro-zones, subscription boxes,
 *    courier tracking, route optimization, dynamic pricing
 *  - PostgreSQL — subscription + delivery persistence
 *  - Kafka — delivery event streaming
 *
 * Features:
 *  - Micro-delivery zones (block-level, <5km radius, Nairobi/Lagos)
 *  - Subscription box management (weekly/biweekly/monthly produce boxes)
 *  - Same-day & next-day delivery scheduling
 *  - Real-time bike/EV courier tracking
 *  - Dynamic pricing (distance, surge, cold-chain, subscriber discount)
 *  - Route optimization for recurring deliveries
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { TRPCError } from "@trpc/server";
import { logger } from "../logger.js";
import { resilientPost } from "../services/resilient-http.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";

const URBAN_DELIVERY_URL = process.env.URBAN_DELIVERY_URL || "http://localhost:8111";

async function callDeliveryService<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  if (method === "GET") {
    const resp = await fetch(`${URBAN_DELIVERY_URL}${path}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()) as T;
  }
  return await resilientPost<T>("urban-delivery", `${URBAN_DELIVERY_URL}${path}`, body || {});
}

export const subscriptionDeliveryRouter = router({
  // ========================================================================
  // MICRO-DELIVERY ZONES
  // ========================================================================

  listMicroZones: publicProcedure
    .input(z.object({ city: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const zones = await callDeliveryService<Array<Record<string, unknown>>>("GET", "/api/zones");
        if (input?.city) {
          return zones.filter((z) => (z.city as string)?.toLowerCase() === input.city!.toLowerCase());
        }
        return zones;
      } catch (err) {
        logger.warn(`[subscription-delivery] Rust service unavailable: ${err}`);
        return getFallbackZones(input?.city);
      }
    }),

  createMicroZone: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string(),
      city: z.string(),
      neighborhood: z.string(),
      centerLat: z.number(),
      centerLng: z.number(),
      radiusKm: z.number().default(3.0),
      baseFee: z.number().default(150),
      perKmFee: z.number().default(30),
      deliveryTypes: z.array(z.string()).default(["BikeCourier", "PickupPoint"]),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/zones", {
          id: input.id,
          name: input.name,
          city: input.city,
          neighborhood: input.neighborhood,
          center_lat: input.centerLat,
          center_lng: input.centerLng,
          radius_km: input.radiusKm,
          polygon_points: [],
          base_fee: input.baseFee,
          per_km_fee: input.perKmFee,
          surge_multiplier: 1.0,
          delivery_types: input.deliveryTypes,
          active: true,
          courier_count: 0,
          avg_delivery_mins: 35,
          operating_hours: { weekday_start: "07:00", weekday_end: "21:00", weekend_start: "08:00", weekend_end: "18:00" },
        });
      } catch (err) {
        logger.warn(`[subscription-delivery] Failed to create zone in Rust service: ${err}`);
        return { id: input.id, name: input.name, city: input.city, created: true, fallback: true };
      }
    }),

  findZoneForLocation: publicProcedure
    .input(z.object({ latitude: z.number(), longitude: z.number() }))
    .query(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/zones/find", { lat: input.latitude, lng: input.longitude });
      } catch {
        return null;
      }
    }),

  // ========================================================================
  // SUBSCRIPTION BOX MANAGEMENT
  // ========================================================================

  createSubscription: protectedProcedure
    .input(z.object({
      customerId: z.number(),
      customerName: z.string(),
      plan: z.enum(["Weekly", "Biweekly", "Monthly", "Custom"]),
      boxType: z.enum(["SmallBox", "MediumBox", "LargeBox", "FamilyBox", "OfficeBox", "JuiceBox", "SaladBox", "HerbBox", "CustomBox"]),
      preferences: z.array(z.string()).optional(),
      exclusions: z.array(z.string()).optional(),
      street: z.string(),
      building: z.string().default(""),
      floor: z.string().default(""),
      apartment: z.string().default(""),
      city: z.string(),
      neighborhood: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      deliveryNotes: z.string().default(""),
      preferredDay: z.string().default("Monday"),
      preferredTimeSlot: z.string().default("09:00-12:00"),
    }))
    .mutation(async ({ input, ctx }) => {
      let subscription: Record<string, unknown>;

      try {
        subscription = await callDeliveryService("POST", "/api/subscriptions", {
          customer_id: input.customerId,
          customer_name: input.customerName,
          plan: input.plan,
          box_type: input.boxType,
          preferences: input.preferences || [],
          exclusions: input.exclusions || [],
          address: {
            street: input.street,
            building: input.building,
            floor: input.floor,
            apartment: input.apartment,
            city: input.city,
            neighborhood: input.neighborhood,
            lat: input.latitude,
            lng: input.longitude,
            delivery_notes: input.deliveryNotes,
          },
          preferred_day: input.preferredDay,
          preferred_time_slot: input.preferredTimeSlot,
        });
      } catch (err) {
        logger.warn(`[subscription-delivery] Rust service unavailable for subscription: ${err}`);
        subscription = {
          id: `sub-${Date.now()}`,
          customerId: input.customerId,
          plan: input.plan,
          boxType: input.boxType,
          status: "Active",
          fallback: true,
        };
      }

      // Kafka event
      try {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "subscription.created",
            messages: [{
              key: String(input.customerId),
              value: JSON.stringify(createEvent("subscription.created", "subscription", String(subscription.id || ""), String(ctx.user.id), {
                plan: input.plan,
                boxType: input.boxType,
                city: input.city,
              })),
            }],
          });
        }
      } catch (err) {
        logger.error("Failed to publish subscription event", err);
      }

      return subscription;
    }),

  listSubscriptions: protectedProcedure
    .input(z.object({ customerId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const subs = await callDeliveryService<Array<Record<string, unknown>>>("GET", "/api/subscriptions");
        if (input?.customerId) {
          return subs.filter((s) => s.customer_id === input.customerId);
        }
        return subs;
      } catch {
        return [];
      }
    }),

  pauseSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/subscriptions/pause", { subscription_id: input.subscriptionId });
      } catch {
        return { subscriptionId: input.subscriptionId, status: "Paused", fallback: true };
      }
    }),

  resumeSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/subscriptions/resume", { subscription_id: input.subscriptionId });
      } catch {
        return { subscriptionId: input.subscriptionId, status: "Active", fallback: true };
      }
    }),

  cancelSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/subscriptions/cancel", { subscription_id: input.subscriptionId });
      } catch {
        return { subscriptionId: input.subscriptionId, status: "Cancelled", fallback: true };
      }
    }),

  // ========================================================================
  // DELIVERY SCHEDULING
  // ========================================================================

  scheduleDelivery: protectedProcedure
    .input(z.object({
      subscriptionId: z.string().optional(),
      orderId: z.string().optional(),
      zoneId: z.string(),
      pickupLat: z.number(),
      pickupLng: z.number(),
      dropoffLat: z.number(),
      dropoffLng: z.number(),
      items: z.array(z.object({
        product: z.string(),
        variety: z.string().default(""),
        quantity: z.number(),
        unit: z.string().default("kg"),
        weightKg: z.number(),
        needsColdChain: z.boolean().default(false),
      })),
      date: z.string(),
      timeSlot: z.string().default("09:00-12:00"),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await callDeliveryService("POST", "/api/deliveries/schedule", {
          subscription_id: input.subscriptionId,
          order_id: input.orderId,
          zone_id: input.zoneId,
          pickup_lat: input.pickupLat,
          pickup_lng: input.pickupLng,
          dropoff_lat: input.dropoffLat,
          dropoff_lng: input.dropoffLng,
          items: input.items.map((i) => ({
            product: i.product,
            variety: i.variety,
            quantity: i.quantity,
            unit: i.unit,
            weight_kg: i.weightKg,
            needs_cold_chain: i.needsColdChain,
          })),
          date: input.date,
          time_slot: input.timeSlot,
        });
      } catch (err) {
        logger.warn(`[subscription-delivery] Delivery scheduling failed: ${err}`);
        return {
          id: `task-${Date.now()}`,
          status: "Scheduled",
          zoneId: input.zoneId,
          date: input.date,
          timeSlot: input.timeSlot,
          fallback: true,
        };
      }
    }),

  estimateDelivery: publicProcedure
    .input(z.object({
      pickupLat: z.number(),
      pickupLng: z.number(),
      dropoffLat: z.number(),
      dropoffLng: z.number(),
      needsColdChain: z.boolean().default(false),
      isSubscriber: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/deliveries/estimate", {
          pickup_lat: input.pickupLat,
          pickup_lng: input.pickupLng,
          dropoff_lat: input.dropoffLat,
          dropoff_lng: input.dropoffLng,
          needs_cold_chain: input.needsColdChain,
          is_subscriber: input.isSubscriber,
        });
      } catch {
        // Fallback pricing
        const R = 6371;
        const dLat = (input.dropoffLat - input.pickupLat) * (Math.PI / 180);
        const dLng = (input.dropoffLng - input.pickupLng) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(input.pickupLat * Math.PI / 180) * Math.cos(input.dropoffLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        const dist = R * 2 * Math.asin(Math.sqrt(a));
        const baseFee = 150;
        const distFee = dist * 30;
        const coldFee = input.needsColdChain ? 50 : 0;
        const subtotal = baseFee + distFee + coldFee;
        const discount = input.isSubscriber ? subtotal * 0.15 : 0;
        return { baseFee, distanceFee: distFee, coldChainFee: coldFee, subscriptionDiscount: discount, total: subtotal - discount, currency: "KES", estimatedTimeMins: Math.round(dist * 8 + 10) };
      }
    }),

  // ========================================================================
  // COURIER MANAGEMENT
  // ========================================================================

  registerCourier: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string(),
      vehicleType: z.enum(["BikeCourier", "ElectricVan", "WalkingCourier", "DroneDelivery"]),
      zoneId: z.string(),
      capacityKg: z.number().default(20),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/couriers", {
          id: input.id,
          name: input.name,
          phone: input.phone,
          vehicle_type: input.vehicleType,
          current_lat: input.latitude,
          current_lng: input.longitude,
          status: "Available",
          zone_id: input.zoneId,
          capacity_kg: input.capacityKg,
          current_load_kg: 0,
          deliveries_today: 0,
          rating: 5.0,
          battery_pct: input.vehicleType === "ElectricVan" ? 100 : null,
        });
      } catch {
        return { id: input.id, name: input.name, status: "Available", fallback: true };
      }
    }),

  listCouriers: protectedProcedure
    .input(z.object({ zoneId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      try {
        const couriers = await callDeliveryService<Array<Record<string, unknown>>>("GET", "/api/couriers");
        if (input?.zoneId) return couriers.filter((c) => c.zone_id === input.zoneId);
        return couriers;
      } catch {
        return [];
      }
    }),

  trackCourier: protectedProcedure
    .input(z.object({ courierId: z.string(), latitude: z.number(), longitude: z.number() }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/couriers/track", {
          courier_id: input.courierId,
          lat: input.latitude,
          lng: input.longitude,
        });
      } catch {
        return { courierId: input.courierId, updated: true, fallback: true };
      }
    }),

  // ========================================================================
  // ROUTE OPTIMIZATION
  // ========================================================================

  optimizeRoutes: protectedProcedure
    .input(z.object({ zoneId: z.string(), date: z.string() }))
    .mutation(async ({ input }) => {
      try {
        return await callDeliveryService("POST", "/api/routes/optimize", {
          zone_id: input.zoneId,
          date: input.date,
        });
      } catch {
        return { zoneId: input.zoneId, date: input.date, totalDeliveries: 0, optimizedRoutes: [], fallback: true };
      }
    }),

  // ========================================================================
  // STATS
  // ========================================================================

  getStats: protectedProcedure.query(async () => {
    try {
      return await callDeliveryService("GET", "/api/stats");
    } catch {
      return { totalZones: 0, activeZones: 0, totalSubscriptions: 0, activeSubscriptions: 0, totalCouriers: 0, totalDeliveries: 0, pendingDeliveries: 0, fallback: true };
    }
  }),
});

// Fallback zone data when Rust service is unavailable
function getFallbackZones(city?: string) {
  const zones = [
    { id: "zone-westlands", name: "Westlands", city: "Nairobi", center_lat: -1.2635, center_lng: 36.8039, radius_km: 3.0 },
    { id: "zone-kilimani", name: "Kilimani", city: "Nairobi", center_lat: -1.2893, center_lng: 36.7850, radius_km: 2.5 },
    { id: "zone-lavington", name: "Lavington", city: "Nairobi", center_lat: -1.2784, center_lng: 36.7715, radius_km: 2.0 },
    { id: "zone-karen", name: "Karen", city: "Nairobi", center_lat: -1.3223, center_lng: 36.7109, radius_km: 4.0 },
    { id: "zone-kileleshwa", name: "Kileleshwa", city: "Nairobi", center_lat: -1.2748, center_lng: 36.7792, radius_km: 2.0 },
    { id: "zone-ikoyi", name: "Ikoyi", city: "Lagos", center_lat: 6.4490, center_lng: 3.4300, radius_km: 3.0 },
    { id: "zone-vi", name: "Victoria Island", city: "Lagos", center_lat: 6.4280, center_lng: 3.4219, radius_km: 2.5 },
    { id: "zone-lekki", name: "Lekki", city: "Lagos", center_lat: 6.4369, center_lng: 3.4700, radius_km: 4.0 },
  ];
  if (city) return zones.filter((z) => z.city.toLowerCase() === city.toLowerCase());
  return zones;
}
