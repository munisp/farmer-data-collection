/**
 * Retail Store Router (B2B Farm-to-Store)
 * 
 * Manages retail store profiles, standing orders, bulk purchasing,
 * invoicing, and direct farmer-to-store supply chains.
 * 
 * Supports: supermarkets, grocery stores, restaurants, hotels,
 * schools, hospitals, and wholesalers.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import {
  retailStores, retailStandingOrders, retailInvoices,
  produceListings, marketplaceOrders, orderItems, users,
} from "../../drizzle/schema.js";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import crypto from "crypto";
import { createEscrowForOrder, estimateDeliveryFee, geocodeAddress } from "../services/order-orchestration.js";

export const retailStoreRouter = router({
  // ========================================================================
  // STORE MANAGEMENT
  // ========================================================================

  registerStore: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(200),
      businessType: z.enum(["supermarket", "grocery", "restaurant", "hotel", "school", "hospital", "wholesaler"]),
      registrationNumber: z.string().optional(),
      taxId: z.string().optional(),
      address: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string().default("Kenya"),
      contactPhone: z.string().optional(),
      contactEmail: z.string().email().optional(),
      operatingHours: z.record(z.string(), z.object({ open: z.string(), close: z.string() })).optional(),
      deliveryInstructions: z.string().optional(),
      preferredDeliveryDays: z.array(z.string()).optional(),
      paymentTerms: z.enum(["cod", "net_7", "net_14", "net_30", "prepaid"]).default("cod"),
      preferredCategories: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const geocoded = await geocodeAddress({
        street: input.address, city: input.city, state: input.state, zip: "", country: input.country,
      });

      const [store] = await db.insert(retailStores).values({
        ownerId: ctx.user.id,
        name: input.name,
        businessType: input.businessType,
        registrationNumber: input.registrationNumber || null,
        taxId: input.taxId || null,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        latitude: String(geocoded.latitude),
        longitude: String(geocoded.longitude),
        contactPhone: input.contactPhone || null,
        contactEmail: input.contactEmail || null,
        operatingHours: input.operatingHours ? JSON.stringify(input.operatingHours) : null,
        deliveryInstructions: input.deliveryInstructions || null,
        preferredDeliveryDays: input.preferredDeliveryDays ? JSON.stringify(input.preferredDeliveryDays) : null,
        paymentTerms: input.paymentTerms,
        preferredCategories: input.preferredCategories ? JSON.stringify(input.preferredCategories) : null,
      }).returning();

      return store;
    }),

  getMyStore: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const stores = await db.select().from(retailStores)
        .where(eq(retailStores.ownerId, ctx.user.id));
      return stores;
    }),

  updateStore: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      contactPhone: z.string().optional(),
      contactEmail: z.string().email().optional(),
      operatingHours: z.record(z.string(), z.object({ open: z.string(), close: z.string() })).optional(),
      deliveryInstructions: z.string().optional(),
      preferredDeliveryDays: z.array(z.string()).optional(),
      paymentTerms: z.enum(["cod", "net_7", "net_14", "net_30", "prepaid"]).optional(),
      preferredCategories: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [store] = await db.select().from(retailStores)
        .where(and(eq(retailStores.id, input.storeId), eq(retailStores.ownerId, ctx.user.id)));
      if (!store) throw new Error("Store not found or unauthorized");

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updates.name = input.name;
      if (input.address) updates.address = input.address;
      if (input.city) updates.city = input.city;
      if (input.contactPhone) updates.contactPhone = input.contactPhone;
      if (input.contactEmail) updates.contactEmail = input.contactEmail;
      if (input.operatingHours) updates.operatingHours = JSON.stringify(input.operatingHours);
      if (input.deliveryInstructions) updates.deliveryInstructions = input.deliveryInstructions;
      if (input.preferredDeliveryDays) updates.preferredDeliveryDays = JSON.stringify(input.preferredDeliveryDays);
      if (input.paymentTerms) updates.paymentTerms = input.paymentTerms;
      if (input.preferredCategories) updates.preferredCategories = JSON.stringify(input.preferredCategories);

      const [updated] = await db.update(retailStores).set(updates)
        .where(eq(retailStores.id, input.storeId)).returning();
      return updated;
    }),

  browseNearbyStores: publicProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().default(20),
      businessType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      let query = db.select().from(retailStores)
        .where(eq(retailStores.active, true));

      const stores = await query.orderBy(desc(retailStores.createdAt)).limit(50);

      // Filter by distance in-memory (PostGIS would do this in SQL)
      return stores.filter(store => {
        if (!store.latitude || !store.longitude) return true;
        const R = 6371;
        const dLat = (Number(store.latitude) - input.latitude) * Math.PI / 180;
        const dLng = (Number(store.longitude) - input.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(input.latitude * Math.PI / 180) * Math.cos(Number(store.latitude) * Math.PI / 180) *
          Math.sin(dLng / 2) ** 2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distKm <= input.radiusKm;
      }).filter(store => !input.businessType || store.businessType === input.businessType);
    }),

  getStoreAnalytics: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [store] = await db.select().from(retailStores)
        .where(and(eq(retailStores.id, input.storeId), eq(retailStores.ownerId, ctx.user.id)));
      if (!store) throw new Error("Store not found");

      const invoices = await db.select().from(retailInvoices)
        .where(eq(retailInvoices.storeId, input.storeId));

      const standing = await db.select().from(retailStandingOrders)
        .where(eq(retailStandingOrders.storeId, input.storeId));

      const totalSpent = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const paidInvoices = invoices.filter(inv => inv.status === "paid");
      const overdueInvoices = invoices.filter(inv => inv.status === "overdue");
      const activeStanding = standing.filter(so => so.status === "active");

      return {
        store,
        totalSpent,
        invoiceCount: invoices.length,
        paidCount: paidInvoices.length,
        overdueCount: overdueInvoices.length,
        activeStandingOrders: activeStanding.length,
        avgFulfillmentRate: activeStanding.length > 0
          ? activeStanding.reduce((sum, so) => sum + Number(so.fulfillmentRate || 0), 0) / activeStanding.length
          : 0,
        creditRemaining: (store.creditLimit || 0) - (store.creditUsed || 0),
      };
    }),

  // ========================================================================
  // STANDING ORDERS (recurring supply)
  // ========================================================================

  createStandingOrder: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      sellerId: z.number(),
      category: z.string(),
      productName: z.string().optional(),
      weeklyQuantity: z.number().positive(),
      unit: z.string(),
      maxPricePerUnit: z.number().optional(),
      qualityGrade: z.enum(["A+", "A", "B"]).default("A"),
      deliveryDay: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
      deliveryTimeSlot: z.enum(["morning", "afternoon", "evening"]).default("morning"),
      requiresColdChain: z.boolean().default(false),
      autoRenew: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [store] = await db.select().from(retailStores)
        .where(and(eq(retailStores.id, input.storeId), eq(retailStores.ownerId, ctx.user.id)));
      if (!store) throw new Error("Store not found or unauthorized");

      const [so] = await db.insert(retailStandingOrders).values({
        storeId: input.storeId,
        sellerId: input.sellerId,
        category: input.category,
        productName: input.productName || null,
        weeklyQuantity: input.weeklyQuantity,
        unit: input.unit,
        maxPricePerUnit: input.maxPricePerUnit || null,
        qualityGrade: input.qualityGrade,
        deliveryDay: input.deliveryDay,
        deliveryTimeSlot: input.deliveryTimeSlot,
        requiresColdChain: input.requiresColdChain,
        autoRenew: input.autoRenew,
      }).returning();

      return so;
    }),

  getStandingOrders: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      return db.select().from(retailStandingOrders)
        .where(eq(retailStandingOrders.storeId, input.storeId))
        .orderBy(desc(retailStandingOrders.createdAt));
    }),

  pauseStandingOrder: protectedProcedure
    .input(z.object({ standingOrderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [updated] = await db.update(retailStandingOrders)
        .set({ status: "paused", updatedAt: new Date() })
        .where(eq(retailStandingOrders.id, input.standingOrderId))
        .returning();
      return updated;
    }),

  cancelStandingOrder: protectedProcedure
    .input(z.object({ standingOrderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [updated] = await db.update(retailStandingOrders)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(retailStandingOrders.id, input.standingOrderId))
        .returning();
      return updated;
    }),

  fulfillStandingOrder: protectedProcedure
    .input(z.object({
      standingOrderId: z.number(),
      actualQuantity: z.number().positive(),
      pricePerUnit: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [so] = await db.select().from(retailStandingOrders)
        .where(eq(retailStandingOrders.id, input.standingOrderId));
      if (!so) throw new Error("Standing order not found");

      const [store] = await db.select().from(retailStores)
        .where(eq(retailStores.id, so.storeId));
      if (!store) throw new Error("Store not found");

      // Create marketplace order
      const orderNumber = `RSO-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const totalAmount = input.actualQuantity * input.pricePerUnit;

      const [order] = await db.insert(marketplaceOrders).values({
        buyerId: store.ownerId,
        sellerId: so.sellerId,
        orderNumber,
        totalAmount,
        status: "confirmed",
        paymentStatus: store.paymentTerms === "prepaid" ? "pending" : "invoiced",
        paymentMethod: store.paymentTerms === "cod" ? "cash" : "invoice",
        deliveryMethod: "delivery",
        deliveryAddress: store.address ? {
          street: store.address, city: store.city || "", state: store.state || "", zip: "", country: store.country || "Kenya",
        } : null,
        notes: `Standing order #${so.id} fulfillment`,
      }).returning();

      // Create invoice for non-prepaid terms
      if (store.paymentTerms !== "prepaid") {
        const daysMap: Record<string, number> = { cod: 0, net_7: 7, net_14: 14, net_30: 30 };
        const dueDays = daysMap[store.paymentTerms || "cod"] || 0;
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

        await db.insert(retailInvoices).values({
          storeId: so.storeId,
          invoiceNumber,
          orderId: order.id,
          subtotal: totalAmount,
          totalAmount,
          dueDate: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
          lineItems: JSON.stringify([{
            product: so.productName || so.category,
            quantity: input.actualQuantity,
            unit: so.unit,
            pricePerUnit: input.pricePerUnit,
            total: totalAmount,
          }]),
        });
      }

      // Update standing order fulfillment
      await db.update(retailStandingOrders).set({
        lastFulfilledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(retailStandingOrders.id, input.standingOrderId));

      // Auto-create escrow for prepaid orders
      if (store.paymentTerms === "prepaid") {
        await createEscrowForOrder(order.id, store.ownerId, so.sellerId, totalAmount, store.currency || "NGN");
      }

      return { order, totalAmount };
    }),

  // ========================================================================
  // BULK PURCHASING
  // ========================================================================

  browseBulkListings: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      minQuantity: z.number().optional(),
      maxPricePerUnit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const listings = await db.select().from(produceListings)
        .where(eq(produceListings.status, "active"))
        .orderBy(desc(produceListings.quantity))
        .limit(50);

      return listings.filter(l => {
        if (input.category && l.category !== input.category) return false;
        if (input.minQuantity && l.quantity < input.minQuantity) return false;
        if (input.maxPricePerUnit && l.pricePerUnit > input.maxPricePerUnit) return false;
        return true;
      });
    }),

  createBulkOrder: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      items: z.array(z.object({
        listingId: z.number(),
        quantity: z.number().positive(),
      })),
      deliveryDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [store] = await db.select().from(retailStores)
        .where(and(eq(retailStores.id, input.storeId), eq(retailStores.ownerId, ctx.user.id)));
      if (!store) throw new Error("Store not found");

      const listingIds = input.items.map(i => i.listingId);
      const listings = await db.select().from(produceListings)
        .where(and(
          inArray(produceListings.id, listingIds),
          eq(produceListings.status, "active"),
        ));

      if (listings.length !== input.items.length) {
        throw new Error("Some listings are no longer available");
      }

      // Group by seller
      const sellerGroups = new Map<number, { listing: typeof listings[0]; qty: number }[]>();
      for (const item of input.items) {
        const listing = listings.find(l => l.id === item.listingId);
        if (!listing) throw new Error("Listing not found");
        if (listing.quantity < item.quantity) throw new Error(`Insufficient quantity for ${listing.title}`);

        const group = sellerGroups.get(listing.userId) || [];
        group.push({ listing, qty: item.quantity });
        sellerGroups.set(listing.userId, group);
      }

      const orders = [];
      for (const [sellerId, items] of sellerGroups) {
        const totalAmount = items.reduce((sum, { listing, qty }) => sum + listing.pricePerUnit * qty, 0);
        const orderNumber = `BULK-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

        const [order] = await db.insert(marketplaceOrders).values({
          buyerId: ctx.user.id,
          sellerId,
          orderNumber,
          totalAmount,
          status: "pending",
          paymentStatus: store.paymentTerms === "prepaid" ? "pending" : "invoiced",
          paymentMethod: store.paymentTerms === "cod" ? "cash" : "invoice",
          deliveryMethod: "delivery",
          deliveryAddress: store.address ? {
            street: store.address, city: store.city || "", state: store.state || "", zip: "", country: store.country || "Kenya",
          } : null,
          deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
          notes: `Bulk order for ${store.name}. ${input.notes || ""}`.trim(),
        }).returning();

        // Create order items + deduct inventory
        for (const { listing, qty } of items) {
          await db.insert(orderItems).values({
            orderId: order.id,
            listingId: listing.id,
            quantity: qty,
            pricePerUnit: listing.pricePerUnit,
            totalPrice: listing.pricePerUnit * qty,
            productTitle: listing.title,
            productUnit: listing.unit,
          });

          await db.update(produceListings).set({
            quantity: listing.quantity - qty,
            status: listing.quantity - qty === 0 ? "sold_out" : "active",
            updatedAt: new Date(),
          }).where(eq(produceListings.id, listing.id));
        }

        // Create invoice
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
        const daysMap: Record<string, number> = { cod: 0, net_7: 7, net_14: 14, net_30: 30, prepaid: 0 };
        const dueDays = daysMap[store.paymentTerms || "cod"] || 0;

        await db.insert(retailInvoices).values({
          storeId: store.id,
          invoiceNumber,
          orderId: order.id,
          subtotal: totalAmount,
          totalAmount,
          dueDate: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
          lineItems: JSON.stringify(items.map(({ listing, qty }) => ({
            product: listing.title,
            quantity: qty,
            unit: listing.unit,
            pricePerUnit: listing.pricePerUnit,
            total: listing.pricePerUnit * qty,
          }))),
        });

        if (store.paymentTerms === "prepaid") {
          await createEscrowForOrder(order.id, ctx.user.id, sellerId, totalAmount, store.currency || "NGN");
        }

        orders.push(order);
      }

      return { orders, orderCount: orders.length };
    }),

  // ========================================================================
  // INVOICING
  // ========================================================================

  getInvoices: protectedProcedure
    .input(z.object({
      storeId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      let query = db.select().from(retailInvoices)
        .where(eq(retailInvoices.storeId, input.storeId));

      const invoices = await query.orderBy(desc(retailInvoices.createdAt));
      if (input.status) return invoices.filter(inv => inv.status === input.status);
      return invoices;
    }),

  payInvoice: protectedProcedure
    .input(z.object({
      invoiceId: z.number(),
      paymentMethod: z.enum(["mobile_money", "bank_transfer", "cash", "card"]),
      paymentReference: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [updated] = await db.update(retailInvoices).set({
        status: "paid",
        paidAt: new Date(),
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference || null,
        updatedAt: new Date(),
      }).where(eq(retailInvoices.id, input.invoiceId)).returning();
      return updated;
    }),

  getOutstandingBalance: protectedProcedure
    .input(z.object({ storeId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const invoices = await db.select().from(retailInvoices)
        .where(and(
          eq(retailInvoices.storeId, input.storeId),
          inArray(retailInvoices.status, ["unpaid", "overdue"]),
        ));

      const totalOutstanding = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
      const overdueAmount = invoices
        .filter(inv => inv.dueDate && new Date(inv.dueDate) < new Date())
        .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

      return { totalOutstanding, overdueAmount, invoiceCount: invoices.length };
    }),

  // ========================================================================
  // FARMER/SELLER SIDE: View retail demand
  // ========================================================================

  getRetailDemand: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const standingOrders = await db.select({
        id: retailStandingOrders.id,
        category: retailStandingOrders.category,
        productName: retailStandingOrders.productName,
        weeklyQuantity: retailStandingOrders.weeklyQuantity,
        unit: retailStandingOrders.unit,
        maxPricePerUnit: retailStandingOrders.maxPricePerUnit,
        qualityGrade: retailStandingOrders.qualityGrade,
        deliveryDay: retailStandingOrders.deliveryDay,
        requiresColdChain: retailStandingOrders.requiresColdChain,
        storeName: retailStores.name,
        storeCity: retailStores.city,
        storeType: retailStores.businessType,
      })
        .from(retailStandingOrders)
        .innerJoin(retailStores, eq(retailStandingOrders.storeId, retailStores.id))
        .where(and(
          eq(retailStandingOrders.sellerId, ctx.user.id),
          eq(retailStandingOrders.status, "active"),
        ))
        .orderBy(desc(retailStandingOrders.createdAt));

      return standingOrders;
    }),

  getOpenRetailDemand: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      city: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const demand = await db.select({
        category: retailStandingOrders.category,
        productName: retailStandingOrders.productName,
        weeklyQuantity: retailStandingOrders.weeklyQuantity,
        unit: retailStandingOrders.unit,
        maxPricePerUnit: retailStandingOrders.maxPricePerUnit,
        qualityGrade: retailStandingOrders.qualityGrade,
        storeType: retailStores.businessType,
        storeCity: retailStores.city,
      })
        .from(retailStandingOrders)
        .innerJoin(retailStores, eq(retailStandingOrders.storeId, retailStores.id))
        .where(eq(retailStandingOrders.status, "active"))
        .limit(100);

      return demand.filter(d => {
        if (input.category && d.category !== input.category) return false;
        if (input.city && d.storeCity !== input.city) return false;
        return true;
      });
    }),
});
