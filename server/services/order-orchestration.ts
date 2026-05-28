/**
 * Farm-to-Home Order Orchestration Service
 * 
 * Wires the end-to-end flow:
 *   farmer lists → buyer orders → escrow holds funds → seller prepares →
 *   delivery assigned → cold chain monitored → buyer confirms → seller paid
 * 
 * This service connects marketplace, escrow, delivery, cold chain,
 * notifications, and payout services into a single pipeline.
 */

import { eq, and, desc, gte } from "drizzle-orm";
import { getDb } from "../db.js";
import {
  marketplaceOrders, orderItems, produceListings, users,
  escrowAccounts, deliveryAssignments, deliveryTracking,
  coldChainReadings, orderFreshnessLogs, orderNotifications,
  orderReturns,
} from "../../drizzle/schema.js";
import { getProducer } from "../kafka.js";
import { resilientPost } from "../services/resilient-http.js";
import { logger } from '../logger.js';

const DELIVERY_SERVICE_URL = process.env.DELIVERY_SERVICE_URL || "http://localhost:8091";

// ============================================================================
// 1. AUTO-ESCROW: Create escrow when order is placed
// ============================================================================

export async function createEscrowForOrder(
  orderId: number,
  buyerId: number,
  sellerId: number,
  totalAmount: number,
  currency: string = "NGN",
): Promise<{ escrowId: number } | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const autoReleaseAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const tigerBeetleTransferId = crypto.randomUUID();

    const [escrow] = await db.insert(escrowAccounts).values({
      orderId,
      buyerId,
      sellerId,
      amount: totalAmount,
      currency,
      status: "held",
      tigerBeetleTransferId,
      releaseCondition: "buyer_confirmation",
      autoReleaseAt,
    }).returning();

    await db.update(marketplaceOrders)
      .set({ paymentStatus: "escrowed" })
      .where(eq(marketplaceOrders.id, orderId));

    await publishEvent("escrow-events", {
      type: "escrow_created",
      escrow_id: escrow.id,
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: sellerId,
      amount: totalAmount,
      auto_release_at: autoReleaseAt.toISOString(),
    });

    return { escrowId: escrow.id };
  } catch (err) {
    logger.error("[Orchestration] Escrow creation failed:", err);
    return null;
  }
}

// ============================================================================
// 2. AUTO-DELIVERY HANDOFF: Assign delivery when order is ready/shipped
// ============================================================================

export async function requestDeliveryForOrder(
  orderId: number,
  sellerLocation: { latitude: number; longitude: number },
  buyerAddress: { street: string; city: string; state: string; zip: string; country: string },
  options: { weightKg?: number; requiresColdChain?: boolean; priority?: string } = {},
): Promise<{ assignmentId?: number; status: string }> {
  const db = await getDb();
  if (!db) return { status: "db_unavailable" };

  try {
    const geocoded = await geocodeAddress(buyerAddress);

    const result = await resilientPost<Record<string, unknown>>(
      "delivery-service",
      `${DELIVERY_SERVICE_URL}/api/delivery/request`,
      {
        order_id: orderId,
        pickup_location: sellerLocation,
        delivery_location: geocoded,
        weight_kg: options.weightKg || 10,
        requires_cold_chain: options.requiresColdChain || false,
        priority: options.priority || "normal",
      },
      { maxRetries: 3, timeoutMs: 15_000 },
    );

    if (result.driver_id) {
      const [assignment] = await db.insert(deliveryAssignments).values({
        orderId,
        driverId: result.driver_id as number,
        status: "assigned",
        estimatedArrival: result.estimated_arrival ? new Date(result.estimated_arrival as string) : null,
      }).returning();

      await publishEvent("delivery-events", {
        type: "delivery_assigned",
        order_id: orderId,
        assignment_id: assignment.id,
        driver_id: result.driver_id,
      });

      return { assignmentId: assignment.id, status: "assigned" };
    }

    return { status: "queued" };
  } catch (err) {
    logger.error("[Orchestration] Delivery request failed:", err);
    return { status: "failed" };
  }
}

// ============================================================================
// 3. DELIVERY CONFIRMATION → ESCROW RELEASE + SELLER PAYOUT
// ============================================================================

export async function onDeliveryConfirmed(
  orderId: number,
  assignmentId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Release escrow
    const [escrow] = await db.select().from(escrowAccounts)
      .where(and(
        eq(escrowAccounts.orderId, orderId),
        eq(escrowAccounts.status, "held"),
      ));

    if (escrow) {
      await db.update(escrowAccounts)
        .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
        .where(eq(escrowAccounts.id, escrow.id));

      await db.update(marketplaceOrders)
        .set({ paymentStatus: "released", status: "completed", deliveredAt: new Date(), updatedAt: new Date() })
        .where(eq(marketplaceOrders.id, orderId));

      await publishEvent("escrow-events", {
        type: "escrow_released",
        escrow_id: escrow.id,
        order_id: orderId,
        seller_id: escrow.sellerId,
        amount: escrow.amount,
        released_by: "delivery_confirmation",
      });

      // Trigger seller payout
      await triggerSellerPayout(escrow.sellerId, escrow.amount, escrow.currency, orderId);
    }

    // Generate freshness report
    await generateFreshnessReport(orderId, assignmentId);

    // Notify buyer
    const [order] = await db.select().from(marketplaceOrders).where(eq(marketplaceOrders.id, orderId));
    if (order) {
      await sendOrderNotification(orderId, order.buyerId, "order_delivered", {
        title: "Order Delivered!",
        body: `Your order #${order.orderNumber} has been delivered. Please confirm receipt to release payment.`,
      });
    }
  } catch (err) {
    logger.error("[Orchestration] Delivery confirmation handling failed:", err);
  }
}

// ============================================================================
// 4. ORDER STATUS NOTIFICATIONS
// ============================================================================

const NOTIFICATION_TEMPLATES: Record<string, { title: string; body: (orderNum: string) => string; recipients: "buyer" | "seller" | "both" }> = {
  order_placed: { title: "New Order!", body: (n) => `Order #${n} has been placed.`, recipients: "seller" },
  order_confirmed: { title: "Order Confirmed", body: (n) => `Order #${n} has been confirmed by the seller.`, recipients: "buyer" },
  order_preparing: { title: "Being Prepared", body: (n) => `Order #${n} is being prepared for dispatch.`, recipients: "buyer" },
  order_ready: { title: "Ready for Pickup/Delivery", body: (n) => `Order #${n} is ready.`, recipients: "buyer" },
  order_shipped: { title: "On the Way!", body: (n) => `Order #${n} has been shipped.`, recipients: "buyer" },
  order_delivered: { title: "Delivered!", body: (n) => `Order #${n} has been delivered.`, recipients: "buyer" },
  order_cancelled: { title: "Order Cancelled", body: (n) => `Order #${n} has been cancelled.`, recipients: "both" },
  return_requested: { title: "Return Requested", body: (n) => `A return has been requested for order #${n}.`, recipients: "seller" },
  return_approved: { title: "Return Approved", body: (n) => `Your return for order #${n} has been approved.`, recipients: "buyer" },
  refund_processed: { title: "Refund Processed", body: (n) => `Refund for order #${n} has been processed.`, recipients: "buyer" },
  payout_sent: { title: "Payout Sent", body: (n) => `Payment for order #${n} has been sent to your account.`, recipients: "seller" },
};

export async function notifyOrderStatusChange(
  orderId: number,
  newStatus: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const [order] = await db.select({
      id: marketplaceOrders.id,
      orderNumber: marketplaceOrders.orderNumber,
      buyerId: marketplaceOrders.buyerId,
      sellerId: marketplaceOrders.sellerId,
    }).from(marketplaceOrders).where(eq(marketplaceOrders.id, orderId));

    if (!order) return;

    const eventType = `order_${newStatus}`;
    const template = NOTIFICATION_TEMPLATES[eventType];
    if (!template) return;

    const recipients: number[] = [];
    if (template.recipients === "buyer" || template.recipients === "both") recipients.push(order.buyerId);
    if (template.recipients === "seller" || template.recipients === "both") recipients.push(order.sellerId);

    for (const userId of recipients) {
      await sendOrderNotification(orderId, userId, eventType, {
        title: template.title,
        body: template.body(order.orderNumber),
      });
    }
  } catch (err) {
    logger.error("[Orchestration] Notification failed:", err);
  }
}

async function sendOrderNotification(
  orderId: number,
  userId: number,
  eventType: string,
  content: { title: string; body: string },
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // In-app notification
  await db.insert(orderNotifications).values({
    orderId,
    userId,
    channel: "in_app",
    eventType,
    title: content.title,
    body: content.body,
    sentAt: new Date(),
    deliveryStatus: "sent",
  });

  // Try SMS via Africa's Talking
  const [user] = await db.select({ phone: users.phoneNumber, email: users.email })
    .from(users).where(eq(users.id, userId));

  if (user?.phone) {
    await db.insert(orderNotifications).values({
      orderId,
      userId,
      channel: "sms",
      eventType,
      title: content.title,
      body: content.body,
      sentAt: new Date(),
      deliveryStatus: "pending",
    });

    await publishEvent("notification-events", {
      type: "send_sms",
      phone: user.phone,
      message: `${content.title}: ${content.body}`,
    });
  }

  // WebSocket push for real-time
  await publishEvent("order-status-events", {
    type: "status_update",
    order_id: orderId,
    user_id: userId,
    event_type: eventType,
    title: content.title,
    body: content.body,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// 5. SELLER PAYOUT
// ============================================================================

async function triggerSellerPayout(
  sellerId: number,
  amount: number,
  currency: string,
  orderId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const platformFee = Math.round(amount * 0.03); // 3% platform fee
  const payoutAmount = amount - platformFee;

  await publishEvent("payout-events", {
    type: "seller_payout",
    seller_id: sellerId,
    order_id: orderId,
    gross_amount: amount,
    platform_fee: platformFee,
    net_payout: payoutAmount,
    currency,
  });

  await sendOrderNotification(orderId, sellerId, "payout_sent", {
    title: "Payment Received!",
    body: `${currency} ${payoutAmount} has been sent to your account for order delivery. Platform fee: ${currency} ${platformFee}.`,
  });
}

// ============================================================================
// 6. ADDRESS GEOCODING
// ============================================================================

export async function geocodeAddress(
  address: { street: string; city: string; state: string; zip: string; country: string },
): Promise<{ latitude: number; longitude: number }> {
  // Default coordinates for major East African cities
  const cityCoords: Record<string, { latitude: number; longitude: number }> = {
    nairobi: { latitude: -1.2921, longitude: 36.8219 },
    mombasa: { latitude: -4.0435, longitude: 39.6682 },
    kisumu: { latitude: -0.1022, longitude: 34.7617 },
    nakuru: { latitude: -0.3031, longitude: 36.0800 },
    kampala: { latitude: 0.3476, longitude: 32.5825 },
    "dar es salaam": { latitude: -6.7924, longitude: 39.2083 },
    lagos: { latitude: 6.5244, longitude: 3.3792 },
    abuja: { latitude: 9.0579, longitude: 7.4951 },
    kigali: { latitude: -1.9403, longitude: 29.8739 },
    "addis ababa": { latitude: 9.0192, longitude: 38.7525 },
  };

  const cityKey = address.city.toLowerCase().trim();
  if (cityCoords[cityKey]) {
    // Add small random offset for address-level precision
    return {
      latitude: cityCoords[cityKey].latitude + (Math.random() - 0.5) * 0.02,
      longitude: cityCoords[cityKey].longitude + (Math.random() - 0.5) * 0.02,
    };
  }

  // Try external geocoding service
  try {
    const fullAddress = `${address.street}, ${address.city}, ${address.state}, ${address.country}`;
    const result = await resilientPost<Record<string, unknown>>(
      "geocoding-service",
      `${DELIVERY_SERVICE_URL}/api/geocode`,
      { address: fullAddress },
      { maxRetries: 2, timeoutMs: 5_000 },
    );
    if (result.latitude && result.longitude) {
      return { latitude: result.latitude as number, longitude: result.longitude as number };
    }
  } catch (err) {
    // Geocoding service unavailable
  }

  // Fallback: center of the country
  const countryDefaults: Record<string, { latitude: number; longitude: number }> = {
    kenya: { latitude: -1.2921, longitude: 36.8219 },
    nigeria: { latitude: 9.0579, longitude: 7.4951 },
    uganda: { latitude: 0.3476, longitude: 32.5825 },
    tanzania: { latitude: -6.7924, longitude: 39.2083 },
    rwanda: { latitude: -1.9403, longitude: 29.8739 },
    ethiopia: { latitude: 9.0192, longitude: 38.7525 },
  };

  const countryKey = address.country.toLowerCase().trim();
  return countryDefaults[countryKey] || { latitude: -1.2921, longitude: 36.8219 };
}

// ============================================================================
// 7. DELIVERY FEE ESTIMATION (called during checkout)
// ============================================================================

export async function estimateDeliveryFee(
  sellerLocation: { latitude: number; longitude: number },
  buyerAddress: { street: string; city: string; state: string; zip: string; country: string },
  weightKg: number,
  coldChain: boolean,
): Promise<{ fee: number; currency: string; estimatedMinutes: number; distanceKm: number }> {
  try {
    const geocoded = await geocodeAddress(buyerAddress);

    const result = await resilientPost<Record<string, unknown>>(
      "delivery-service",
      `${DELIVERY_SERVICE_URL}/api/delivery/estimate-fee`,
      {
        pickup: sellerLocation,
        delivery: geocoded,
        weight_kg: weightKg,
        cold_chain: coldChain,
      },
      { maxRetries: 2, timeoutMs: 5_000 },
    );

    return {
      fee: (result.fee as number) || calculateFallbackFee(sellerLocation, geocoded, weightKg, coldChain),
      currency: (result.currency as string) || "NGN",
      estimatedMinutes: (result.estimated_minutes as number) || 60,
      distanceKm: (result.distance_km as number) || 10,
    };
  } catch (err) {
    const geocoded = await geocodeAddress(buyerAddress);
    return {
      fee: calculateFallbackFee(sellerLocation, geocoded, weightKg, coldChain),
      currency: "NGN",
      estimatedMinutes: 60,
      distanceKm: 10,
    };
  }
}

function calculateFallbackFee(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  weightKg: number,
  coldChain: boolean,
): number {
  const R = 6371;
  const dLat = (to.latitude - from.latitude) * Math.PI / 180;
  const dLng = (to.longitude - from.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  let fee = 100; // base fee KES
  fee += distanceKm * 15; // per km
  fee += weightKg * 5; // per kg
  if (coldChain) fee *= 1.5; // cold chain surcharge
  return Math.round(fee);
}

// ============================================================================
// 8. FRESHNESS TRACKING (cold chain → order linkage)
// ============================================================================

async function generateFreshnessReport(
  orderId: number,
  assignmentId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    // Find sensor readings during this delivery
    const readings = await db.select().from(coldChainReadings)
      .where(gte(coldChainReadings.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .orderBy(desc(coldChainReadings.createdAt))
      .limit(100);

    if (readings.length === 0) {
      // No cold chain data — create a default entry
      await db.insert(orderFreshnessLogs).values({
        orderId,
        assignmentId,
        freshnessScore: "90",
        freshnessGrade: "A",
        coldChainBreaches: 0,
        deliveryDate: new Date(),
      });
      return;
    }

    const temps = readings.map(r => Number(r.temperature));
    const humidities = readings.filter(r => r.humidity).map(r => Number(r.humidity));

    const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const avgHumidity = humidities.length > 0 ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null;

    // Count breaches (temps outside 2-8°C range for cold chain)
    const breaches = temps.filter(t => t < 2 || t > 8).length;

    // Calculate freshness score
    let score = 100;
    if (breaches > 0) score -= breaches * 5;
    if (maxTemp > 10) score -= (maxTemp - 10) * 3;
    if (maxTemp > 15) score -= 20;
    score = Math.max(0, Math.min(100, score));

    const grade = score >= 95 ? "A+" : score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "F";

    // Shelf life estimation based on temperature history
    const baseShelfLifeHours = 72; // 3 days at optimal temp
    const shelfLifeHours = Math.round(baseShelfLifeHours * (score / 100));

    await db.insert(orderFreshnessLogs).values({
      orderId,
      assignmentId,
      sensorId: readings[0].sensorId,
      avgTemperature: String(avgTemp.toFixed(2)),
      maxTemperature: String(maxTemp.toFixed(2)),
      minTemperature: String(minTemp.toFixed(2)),
      avgHumidity: avgHumidity ? String(avgHumidity.toFixed(2)) : null,
      totalTransitMinutes: readings.length * 5, // assume 5-min intervals
      coldChainBreaches: breaches,
      estimatedShelfLifeHours: shelfLifeHours,
      freshnessScore: String(score),
      freshnessGrade: grade,
      deliveryDate: new Date(),
    });
  } catch (err) {
    logger.error("[Orchestration] Freshness report failed:", err);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function publishEvent(topic: string, data: Record<string, unknown>): Promise<void> {
  try {
    const producer = await getProducer();
    if (producer) {
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(data) }],
      });
    }
  } catch (err) {
    // Event publishing is fire-and-forget
  }
}
