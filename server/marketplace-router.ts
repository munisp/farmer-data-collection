import crypto from "crypto";
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc-base.js";
import { goImageClient } from "./clients/go-image-client.js";
import { getDb } from "./db.js";
import { 
  produceListings, 
  marketplaceOrders, 
  orderItems, 
  buyerProfiles,
  shoppingCartItems,
  marketplaceMessages,
  marketplaceReviews,
  users,
  farms,
  crops
} from "../drizzle/schema.js";
import { eq, and, desc, sql, gte, lte, like, or, inArray } from "drizzle-orm";
import { createEscrowForOrder, notifyOrderStatusChange, requestDeliveryForOrder } from "./services/order-orchestration.js";
import { logger } from './logger.js';

// ============================================================================
// Validation Schemas
// ============================================================================

const createListingSchema = z.object({
  farmId: z.number().optional(),
  cropId: z.number().optional(),
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  category: z.enum(["vegetables", "fruits", "grains", "dairy", "meat", "eggs", "honey", "other"]),
  quantity: z.number().positive(),
  unit: z.enum(["kg", "lbs", "units", "dozens", "liters", "grams"]),
  pricePerUnit: z.number().positive(),
  organic: z.boolean().default(false),
  certification: z.string().optional(),
  availableFrom: z.string().optional(), // ISO date string
  availableUntil: z.string().optional(),
  deliveryOptions: z.object({
    pickup: z.boolean(),
    delivery: z.boolean(),
    shipping: z.boolean(),
  }),
  location: z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
  photos: z.array(z.string()).optional(),
});

const updateListingSchema = z.object({
  id: z.number(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().optional(),
  quantity: z.number().positive().optional(),
  pricePerUnit: z.number().positive().optional(),
  status: z.enum(["active", "sold_out", "expired", "deleted"]).optional(),
  availableUntil: z.string().optional(),
});

const searchListingsSchema = z.object({
  category: z.string().optional(),
  organic: z.boolean().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  searchTerm: z.string().optional(),
  location: z.string().optional(),
  sortBy: z.enum(["newest", "price-low", "price-high", "popular"]).default("newest"),
  limit: z.number().default(20),
  offset: z.number().default(0),
});

const createOrderSchema = z.object({
  items: z.array(z.object({
    listingId: z.number(),
    quantity: z.number().positive(),
  })),
  deliveryMethod: z.enum(["pickup", "delivery", "shipping"]),
  deliveryAddress: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string(),
  }).optional(),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateOrderStatusSchema = z.object({
  orderId: z.number(),
  status: z.enum(["pending", "confirmed", "preparing", "ready", "shipped", "delivered", "cancelled"]),
  trackingNumber: z.string().optional(),
  cancellationReason: z.string().max(500).optional(),
});

const addToCartSchema = z.object({
  listingId: z.number(),
  quantity: z.number().positive(),
});

const updateCartItemSchema = z.object({
  cartItemId: z.number(),
  quantity: z.number().int().positive(),
});

// ============================================================================
// Marketplace Router
// ============================================================================

export const marketplaceRouter = router({
  // ========================================================================
  // LISTINGS
  // ========================================================================
  
  // Create a new produce listing
  createListing: protectedProcedure
    .input(createListingSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      const totalPrice = Math.round(input.quantity * input.pricePerUnit);
      
      const [listing] = await db.insert(produceListings).values({
        userId,
        farmId: input.farmId || null,
        cropId: input.cropId || null,
        title: input.title,
        description: input.description || null,
        category: input.category,
        quantity: input.quantity,
        unit: input.unit,
        pricePerUnit: input.pricePerUnit,
        totalPrice,
        organic: input.organic,
        certification: input.certification || null,
        availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
        availableUntil: input.availableUntil ? new Date(input.availableUntil) : null,
        deliveryOptions: JSON.stringify(input.deliveryOptions) as any,
        location: input.location ? (JSON.stringify(input.location) as any) : null,
        photos: (input.photos ? JSON.stringify(input.photos) : JSON.stringify([])) as any,
        status: "active",
      }).returning();
      
      return listing;
    }),
  
  // Update an existing listing
  updateListing: protectedProcedure
    .input(updateListingSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      // Verify ownership
      const [existing] = await db
        .select()
        .from(produceListings)
        .where(and(
          eq(produceListings.id, input.id),
          eq(produceListings.userId, userId)
        ))
        .limit(1);
      
      if (!existing) {
        throw new Error("Listing not found or you don't have permission to edit it");
      }
      
      const updates: Record<string, any> = {};
      if (input.title) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.quantity) {
        updates.quantity = input.quantity;
        updates.totalPrice = Math.round(input.quantity * (input.pricePerUnit || existing.pricePerUnit));
      }
      if (input.pricePerUnit) {
        updates.pricePerUnit = input.pricePerUnit;
        updates.totalPrice = Math.round((input.quantity || existing.quantity) * input.pricePerUnit);
      }
      if (input.status) updates.status = input.status;
      if (input.availableUntil) updates.availableUntil = new Date(input.availableUntil);
      updates.updatedAt = new Date();
      
      const [updated] = await db.update(produceListings)
        .set(updates)
        .where(eq(produceListings.id, input.id))
        .returning();
      
      return updated;
    }),
  
  // Delete a listing (soft delete by setting status to 'deleted')
  deleteListing: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [deleted] = await db.update(produceListings)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(and(
          eq(produceListings.id, input.id),
          eq(produceListings.userId, userId)
        ))
        .returning();
      
      if (!deleted) {
        throw new Error("Listing not found or you don't have permission to delete it");
      }
      
      return { success: true };
    }),
  
  // Get user's own listings
  getMyListings: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const listings = await db
        .select()
        .from(produceListings)
        .where(and(
          eq(produceListings.userId, userId),
          sql`${produceListings.status} != 'deleted'`
        ))
        .orderBy(desc(produceListings.createdAt));
      
      return listings.map((listing) => ({
        ...listing,
        deliveryOptions: typeof listing.deliveryOptions === 'string' 
          ? JSON.parse(listing.deliveryOptions) 
          : listing.deliveryOptions,
        location: typeof listing.location === 'string' 
          ? JSON.parse(listing.location) 
          : listing.location,
        photos: typeof listing.photos === 'string' 
          ? JSON.parse(listing.photos) 
          : listing.photos,
      }));
    }),
  
  // Get a single listing by ID (public)
  getListing: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [listing] = await db
        .select({
          id: produceListings.id,
          userId: produceListings.userId,
          farmId: produceListings.farmId,
          cropId: produceListings.cropId,
          title: produceListings.title,
          description: produceListings.description,
          category: produceListings.category,
          quantity: produceListings.quantity,
          unit: produceListings.unit,
          pricePerUnit: produceListings.pricePerUnit,
          totalPrice: produceListings.totalPrice,
          organic: produceListings.organic,
          certification: produceListings.certification,
          availableFrom: produceListings.availableFrom,
          availableUntil: produceListings.availableUntil,
          deliveryOptions: produceListings.deliveryOptions,
          location: produceListings.location,
          photos: produceListings.photos,
          status: produceListings.status,
          views: produceListings.views,
          createdAt: produceListings.createdAt,
          updatedAt: produceListings.updatedAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
        })
        .from(produceListings)
        .leftJoin(users, eq(produceListings.userId, users.id))
        .where(and(
          eq(produceListings.id, input.id),
          eq(produceListings.status, "active")
        ))
        .limit(1);
      
      if (!listing) {
        throw new Error("Listing not found");
      }
      
      // Increment view count
      await db.update(produceListings)
        .set({ views: sql`${produceListings.views} + 1` })
        .where(eq(produceListings.id, input.id));
      
      return {
        ...listing,
        deliveryOptions: typeof listing.deliveryOptions === 'string' 
          ? JSON.parse(listing.deliveryOptions) 
          : listing.deliveryOptions,
        location: typeof listing.location === 'string' 
          ? JSON.parse(listing.location) 
          : listing.location,
        photos: typeof listing.photos === 'string' 
          ? JSON.parse(listing.photos) 
          : listing.photos,
      };
    }),
  
  // Search and browse listings (public)
  searchListings: publicProcedure
    .input(searchListingsSchema)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const conditions = [eq(produceListings.status, "active")];
      
      if (input.category) {
        conditions.push(eq(produceListings.category, input.category));
      }
      
      if (input.organic !== undefined) {
        conditions.push(eq(produceListings.organic, input.organic));
      }
      
      if (input.minPrice) {
        conditions.push(gte(produceListings.pricePerUnit, input.minPrice));
      }
      
      if (input.maxPrice) {
        conditions.push(lte(produceListings.pricePerUnit, input.maxPrice));
      }
      
      if (input.searchTerm) {
        conditions.push(
          or(
            like(produceListings.title, `%${input.searchTerm}%`),
            like(produceListings.description, `%${input.searchTerm}%`)
          )!
        );
      }

      if (input.location) {
        conditions.push(sql`${produceListings.location}::text ILIKE ${`%${input.location}%`}`);
      }

      const sortOrder =
        input.sortBy === "price-low"
          ? produceListings.pricePerUnit
          : input.sortBy === "price-high"
            ? desc(produceListings.pricePerUnit)
            : input.sortBy === "popular"
              ? desc(produceListings.views)
              : desc(produceListings.createdAt);
      
      const listings = await db
        .select({
          id: produceListings.id,
          userId: produceListings.userId,
          title: produceListings.title,
          description: produceListings.description,
          category: produceListings.category,
          quantity: produceListings.quantity,
          unit: produceListings.unit,
          pricePerUnit: produceListings.pricePerUnit,
          totalPrice: produceListings.totalPrice,
          organic: produceListings.organic,
          deliveryOptions: produceListings.deliveryOptions,
          location: produceListings.location,
          photos: produceListings.photos,
          views: produceListings.views,
          createdAt: produceListings.createdAt,
          userFirstName: users.firstName,
          userLastName: users.lastName,
        })
        .from(produceListings)
        .leftJoin(users, eq(produceListings.userId, users.id))
        .where(and(...conditions))
        .orderBy(sortOrder as any)
        .limit(input.limit)
        .offset(input.offset);
      
      return listings.map((listing) => ({
        ...listing,
        deliveryOptions: typeof listing.deliveryOptions === 'string' 
          ? JSON.parse(listing.deliveryOptions) 
          : listing.deliveryOptions,
        location: typeof listing.location === 'string' 
          ? JSON.parse(listing.location) 
          : listing.location,
        photos: typeof listing.photos === 'string' 
          ? JSON.parse(listing.photos) 
          : listing.photos,
      }));
    }),
  
  // ========================================================================
  // SHOPPING CART
  // ========================================================================
  
  // Add item to cart
  addToCart: protectedProcedure
    .input(addToCartSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;

      const [listing] = await db
        .select()
        .from(produceListings)
        .where(eq(produceListings.id, input.listingId))
        .limit(1);

      if (!listing || listing.status !== "active") {
        throw new Error("This listing is no longer available");
      }

      if (listing.userId === userId) {
        throw new Error("You cannot add your own listing to the cart");
      }
      
      // Check if item already in cart
      const [existing] = await db
        .select()
        .from(shoppingCartItems)
        .where(and(
          eq(shoppingCartItems.userId, userId),
          eq(shoppingCartItems.listingId, input.listingId)
        ))
        .limit(1);
      
      if (existing) {
        const requestedQuantity = existing.quantity + input.quantity;
        if (requestedQuantity > listing.quantity) {
          throw new Error(`Only ${listing.quantity} ${listing.unit} available for this listing`);
        }

        // Update quantity
        const [updated] = await db.update(shoppingCartItems)
          .set({ 
            quantity: requestedQuantity,
            updatedAt: new Date(),
          })
          .where(eq(shoppingCartItems.id, existing.id))
          .returning();
        return updated;
      } else {
        if (input.quantity > listing.quantity) {
          throw new Error(`Only ${listing.quantity} ${listing.unit} available for this listing`);
        }
        // Insert new cart item
        const [cartItem] = await db.insert(shoppingCartItems).values({
          userId,
          listingId: input.listingId,
          quantity: input.quantity,
        }).returning();
        return cartItem;
      }
    }),
  
  // Get user's cart
  getCart: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const cartItems = await db
        .select({
          id: shoppingCartItems.id,
          userId: shoppingCartItems.userId,
          listingId: shoppingCartItems.listingId,
          quantity: shoppingCartItems.quantity,
          createdAt: shoppingCartItems.createdAt,
          updatedAt: shoppingCartItems.updatedAt,
          listingTitle: produceListings.title,
          listingPrice: produceListings.pricePerUnit,
          listingUnit: produceListings.unit,
          listingPhotos: produceListings.photos,
          listingStatus: produceListings.status,
          listingQuantity: produceListings.quantity,
          sellerFirstName: users.firstName,
          sellerLastName: users.lastName,
        })
        .from(shoppingCartItems)
        .leftJoin(produceListings, eq(shoppingCartItems.listingId, produceListings.id))
        .leftJoin(users, eq(produceListings.userId, users.id))
        .where(eq(shoppingCartItems.userId, userId));
      
      return cartItems.map((item: Record<string, any>) => ({
        ...item,
        listingPhotos: typeof item.listingPhotos === 'string' 
          ? JSON.parse(item.listingPhotos) 
          : item.listingPhotos,
      }));
    }),
  
  updateCartItemQuantity: protectedProcedure
    .input(updateCartItemSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user.id;

      const [cartItem] = await db
        .select()
        .from(shoppingCartItems)
        .where(and(
          eq(shoppingCartItems.id, input.cartItemId),
          eq(shoppingCartItems.userId, userId)
        ))
        .limit(1);

      if (!cartItem) {
        throw new Error("Cart item not found");
      }

      const [listing] = await db
        .select()
        .from(produceListings)
        .where(eq(produceListings.id, cartItem.listingId))
        .limit(1);

      if (!listing || listing.status !== "active") {
        throw new Error("This listing is no longer available");
      }

      if (input.quantity > listing.quantity) {
        throw new Error(`Only ${listing.quantity} ${listing.unit} available for this listing`);
      }

      const [updated] = await db.update(shoppingCartItems)
        .set({ quantity: input.quantity, updatedAt: new Date() })
        .where(eq(shoppingCartItems.id, input.cartItemId))
        .returning();

      return updated;
    }),

  // Remove item from cart
  removeFromCart: protectedProcedure
    .input(z.object({ cartItemId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      await db.delete(shoppingCartItems)
        .where(and(
          eq(shoppingCartItems.id, input.cartItemId),
          eq(shoppingCartItems.userId, userId)
        ));
      
      return { success: true };
    }),
  
  // Clear cart
  clearCart: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      await db.delete(shoppingCartItems)
        .where(eq(shoppingCartItems.userId, userId));
      
      return { success: true };
    }),
  
  // ========================================================================
  // ORDERS
  // ========================================================================
  
  // Create order from cart or direct purchase
  createOrderFromCart: protectedProcedure
    .input(createOrderSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const buyerId = ctx.user.id;

      if (input.items.length === 0) {
        throw new Error("Order must contain at least one item");
      }

      if ((input.deliveryMethod === "delivery" || input.deliveryMethod === "shipping") && !input.deliveryAddress) {
        throw new Error("A delivery address is required for delivery or shipping orders");
      }
      
      // Fetch listing details
      const listingIds = input.items.map((item: Record<string, any>) => item.listingId);
      const listings = await db
        .select()
        .from(produceListings)
        .where(and(
          inArray(produceListings.id, listingIds),
          eq(produceListings.status, "active")
        ));
      
      if (listings.length !== input.items.length) {
        throw new Error("Some listings are no longer available");
      }
      
      // Calculate total and verify seller is same for all items
      let totalAmount = 0;
      const sellerId = listings[0].userId;
      
      for (const item of input.items) {
        const listing = listings.find((l) => l.id === item.listingId);
        if (!listing) throw new Error("Listing not found");
        if (listing.userId === buyerId) {
          throw new Error("You cannot purchase your own listing");
        }
        if (listing.userId !== sellerId) {
          throw new Error("All items must be from the same seller");
        }
        if (listing.quantity < item.quantity) {
          throw new Error(`Insufficient quantity for ${listing.title}`);
        }
        if (listing.availableFrom && new Date(listing.availableFrom) > new Date()) {
          throw new Error(`${listing.title} is not yet available for ordering`);
        }
        if (listing.availableUntil && new Date(listing.availableUntil) < new Date()) {
          throw new Error(`${listing.title} is no longer available for ordering`);
        }

        const deliveryOptions = typeof listing.deliveryOptions === 'string'
          ? JSON.parse(listing.deliveryOptions)
          : listing.deliveryOptions;

        if (!deliveryOptions?.[input.deliveryMethod]) {
          throw new Error(`${listing.title} does not support ${input.deliveryMethod}`);
        }

        totalAmount += listing.pricePerUnit * item.quantity;
      }
      
      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 9).toUpperCase()}`;
      
      // Create order
      const [order] = await db.insert(marketplaceOrders).values({
        buyerId,
        sellerId,
        orderNumber,
        totalAmount,
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: "card",
        deliveryMethod: input.deliveryMethod,
        deliveryAddress: input.deliveryAddress ? (JSON.stringify(input.deliveryAddress) as any) : null,
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        notes: input.notes || null,
      }).returning();
      
      // Create order items
      for (const item of input.items) {
        const listing = listings.find((l) => l.id === item.listingId)!;
        await db.insert(orderItems).values({
          orderId: order.id,
          listingId: item.listingId,
          quantity: item.quantity,
          pricePerUnit: listing.pricePerUnit,
          totalPrice: listing.pricePerUnit * item.quantity,
          productTitle: listing.title,
          productUnit: listing.unit,
        });
        
        // Update listing quantity
        await db.update(produceListings)
          .set({ 
            quantity: listing.quantity - item.quantity,
            status: listing.quantity - item.quantity === 0 ? "sold_out" : "active",
            updatedAt: new Date(),
          })
          .where(eq(produceListings.id, item.listingId));
      }
      
      // Clear cart items that were ordered
      await db.delete(shoppingCartItems)
        .where(and(
          eq(shoppingCartItems.userId, buyerId),
          inArray(shoppingCartItems.listingId, listingIds)
        ));

      // Auto-create escrow to protect buyer payment
      setImmediate(() => {
        createEscrowForOrder(order.id, buyerId, sellerId, totalAmount).catch((e) => logger.warn('[Marketplace] Escrow creation failed (non-blocking)', { err: e }));
        notifyOrderStatusChange(order.id, "placed").catch((e) => logger.warn('[Marketplace] Order notification failed (non-blocking)', { err: e }));
      });
      
      return order;
    }),
  
  // Get buyer's orders
  getMyOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const orders = await db
        .select({
          id: marketplaceOrders.id,
          buyerId: marketplaceOrders.buyerId,
          sellerId: marketplaceOrders.sellerId,
          orderNumber: marketplaceOrders.orderNumber,
          totalAmount: marketplaceOrders.totalAmount,
          status: marketplaceOrders.status,
          paymentStatus: marketplaceOrders.paymentStatus,
          deliveryMethod: marketplaceOrders.deliveryMethod,
          deliveryAddress: marketplaceOrders.deliveryAddress,
          deliveryDate: marketplaceOrders.deliveryDate,
          notes: marketplaceOrders.notes,
          createdAt: marketplaceOrders.createdAt,
          updatedAt: marketplaceOrders.updatedAt,
          confirmedAt: marketplaceOrders.confirmedAt,
          deliveredAt: marketplaceOrders.deliveredAt,
          sellerFirstName: users.firstName,
          sellerLastName: users.lastName,
          sellerEmail: users.email,
        })
        .from(marketplaceOrders)
        .leftJoin(users, eq(marketplaceOrders.sellerId, users.id))
        .where(eq(marketplaceOrders.buyerId, userId))
        .orderBy(desc(marketplaceOrders.createdAt));
      
      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id));
          
          return {
            ...order,
            deliveryAddress: typeof order.deliveryAddress === 'string' 
              ? JSON.parse(order.deliveryAddress) 
              : order.deliveryAddress,
            items,
          };
        })
      );
      
      return ordersWithItems;
    }),
  
  // Get seller's orders (sales)
  getMySales: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const orders = await db
        .select({
          id: marketplaceOrders.id,
          buyerId: marketplaceOrders.buyerId,
          sellerId: marketplaceOrders.sellerId,
          orderNumber: marketplaceOrders.orderNumber,
          totalAmount: marketplaceOrders.totalAmount,
          status: marketplaceOrders.status,
          paymentStatus: marketplaceOrders.paymentStatus,
          deliveryMethod: marketplaceOrders.deliveryMethod,
          deliveryAddress: marketplaceOrders.deliveryAddress,
          deliveryDate: marketplaceOrders.deliveryDate,
          notes: marketplaceOrders.notes,
          createdAt: marketplaceOrders.createdAt,
          updatedAt: marketplaceOrders.updatedAt,
          confirmedAt: marketplaceOrders.confirmedAt,
          deliveredAt: marketplaceOrders.deliveredAt,
          buyerFirstName: users.firstName,
          buyerLastName: users.lastName,
          buyerEmail: users.email,
        })
        .from(marketplaceOrders)
        .leftJoin(users, eq(marketplaceOrders.buyerId, users.id))
        .where(eq(marketplaceOrders.sellerId, userId))
        .orderBy(desc(marketplaceOrders.createdAt));
      
      // Fetch order items for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id));
          
          return {
            ...order,
            deliveryAddress: typeof order.deliveryAddress === 'string' 
              ? JSON.parse(order.deliveryAddress) 
              : order.deliveryAddress,
            items,
          };
        })
      );
      
      return ordersWithItems;
    }),
  
  // Update order status (seller only)
  updateOrderStatus: protectedProcedure
    .input(updateOrderStatusSchema)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      // Verify seller owns this order
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.sellerId, userId)
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found or you don't have permission to update it");
      }

      const allowedTransitions: Record<string, string[]> = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["preparing", "cancelled"],
        preparing: ["ready", "cancelled"],
        ready: order.deliveryMethod === "pickup" ? ["delivered", "cancelled"] : ["shipped", "delivered", "cancelled"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
      };

      if (order.status !== input.status && !allowedTransitions[order.status]?.includes(input.status)) {
        throw new Error(`Invalid order status transition from ${order.status} to ${input.status}`);
      }

      if (input.status === "shipped" && !input.trackingNumber && !order.trackingNumber) {
        throw new Error("A tracking number is required before marking an order as shipped");
      }
      
      const updates: Record<string, any> = { 
        status: input.status,
        updatedAt: new Date(),
      };
      
      if (input.trackingNumber) {
        updates.trackingNumber = input.trackingNumber;
      }
      
      if (input.status === "confirmed" && !order.confirmedAt) {
        updates.confirmedAt = new Date();
      } else if (input.status === "delivered") {
        updates.deliveredAt = new Date();
      }

      if (input.status === "cancelled") {
        updates.notes = [order.notes, input.cancellationReason].filter(Boolean).join("\nCancellation reason: ");
      }
      
      const [updated] = await db.update(marketplaceOrders)
        .set(updates)
        .where(eq(marketplaceOrders.id, input.orderId))
        .returning();

      // Fire-and-forget: notifications + auto-delivery handoff
      setImmediate(() => {
        notifyOrderStatusChange(input.orderId, input.status).catch((e) => logger.warn('[Marketplace] Status notification failed (non-blocking)', { err: e }));

        // Auto-request delivery when order is marked ready or shipped
        if (input.status === "ready" || input.status === "shipped") {
          const deliveryAddr = order.deliveryAddress
            ? (typeof order.deliveryAddress === "string" ? JSON.parse(order.deliveryAddress as string) : order.deliveryAddress)
            : null;
          if (deliveryAddr && order.deliveryMethod !== "pickup") {
            requestDeliveryForOrder(
              input.orderId,
              { latitude: -1.2921, longitude: 36.8219 }, // seller location (would come from farm GPS)
              deliveryAddr,
              { priority: "normal" },
            ).catch((e) => logger.warn('[Marketplace] Delivery request failed (non-blocking)', { err: e }));
          }
        }
      });
      
      return updated;
    }),

  // ============================================================================
  // REVIEWS & RATINGS
  // ============================================================================

  // Create a review
  createReview: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        revieweeId: z.number(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
        reviewType: z.enum(["buyer_to_seller", "seller_to_buyer"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify order exists and user is part of it
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(eq(marketplaceOrders.id, input.orderId))
        .limit(1);

      if (!order) {
        throw new Error("Order not found");
      }

      if (order.buyerId !== ctx.user.id && order.sellerId !== ctx.user.id) {
        throw new Error("You are not part of this order");
      }

      // Create review
      const [review] = await db
        .insert(marketplaceReviews)
        .values({
          orderId: input.orderId,
          reviewerId: ctx.user.id,
          revieweeId: input.revieweeId,
          rating: input.rating,
          comment: input.comment || null,
          reviewType: input.reviewType,
        } as any)
        .returning();

      return review;
    }),

  // Get reviews for a seller
  getSellerReviews: publicProcedure
    .input(
      z.object({
        sellerId: z.number(),
        limit: z.number().optional().default(10),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const reviews = await db
        .select()
        .from(marketplaceReviews)
        .where(
          and(
            eq(marketplaceReviews.revieweeId, input.sellerId),
            eq(marketplaceReviews.reviewType, "buyer_to_seller")
          )
        )
        .orderBy(desc(marketplaceReviews.createdAt))
        .limit(input.limit);

      return reviews;
    }),

  // Get average rating for a seller
  getSellerRating: publicProcedure
    .input(z.object({ sellerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const reviews = await db
        .select()
        .from(marketplaceReviews)
        .where(
          and(
            eq(marketplaceReviews.revieweeId, input.sellerId),
            eq(marketplaceReviews.reviewType, "buyer_to_seller")
          )
        );

      if (reviews.length === 0) {
        return { averageRating: 0, totalReviews: 0 };
      }

      const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = totalRating / reviews.length;

      return {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: reviews.length,
      };
    }),

  // ============================================================================
  // MESSAGING
  // ============================================================================

  // Send a message
  sendMessage: protectedProcedure
    .input(
      z.object({
        recipientId: z.number(),
        listingId: z.number().optional(),
        orderId: z.number().optional(),
        subject: z.string().optional(),
        message: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [message] = await db
        .insert(marketplaceMessages)
        .values({
          senderId: ctx.user.id,
          recipientId: input.recipientId,
          listingId: input.listingId || null,
          orderId: input.orderId || null,
          subject: input.subject || null,
          message: input.message,
        } as any)
        .returning();

      return message;
    }),

  // Get conversations (unique sender-recipient pairs)
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const userId = ctx.user.id;

    // Get all messages where user is sender or recipient
    const messages = await db
      .select()
      .from(marketplaceMessages)
      .where(
        or(
          eq(marketplaceMessages.senderId, userId),
          eq(marketplaceMessages.recipientId, userId)
        )
      )
      .orderBy(desc(marketplaceMessages.createdAt));

    // Group by conversation partner
    const conversationsMap = new Map<number, any>();
    
    for (const message of messages) {
      const partnerId = message.senderId === userId ? message.recipientId : message.senderId;
      
      if (!conversationsMap.has(partnerId)) {
        conversationsMap.set(partnerId, {
          partnerId,
          lastMessage: message.message,
          lastMessageAt: message.createdAt,
          unreadCount: 0,
        });
      }
      
      // Count unread messages from partner
      if (message.recipientId === userId && !message.read) {
        const conv = conversationsMap.get(partnerId)!;
        conv.unreadCount++;
      }
    }

    return Array.from(conversationsMap.values());
  }),

  // Upload image to S3
  uploadImage: protectedProcedure
    .input(
      z.object({
        imageData: z.string(), // Base64 encoded image data
        fileName: z.string(),
        contentType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();      if (!db) throw new Error("Database not available");

      try {
        // Validate base64 format
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Regex.test(input.imageData)) {
          throw new Error('Invalid base64 data format');
        }

        // Convert base64 to buffer
        const buffer = Buffer.from(input.imageData, 'base64');
        
        // Validate buffer size (must be > 0)
        if (buffer.length === 0) {
          throw new Error('Invalid base64 data: empty buffer');
        }
        
        // Generate unique file key
        const timestamp = Date.now();
        const randomSuffix = crypto.randomUUID().slice(0, 6);
        const fileExtension = input.fileName.split('.').pop() || 'jpg';
        const fileKey = `marketplace/${ctx.user.id}/${timestamp}-${randomSuffix}.${fileExtension}`;
        
        // Upload to S3 using storage service
        const { storagePut } = await import('./storage.js');
        const { url } = await storagePut(fileKey, buffer, input.contentType);
        
        // Transform to CDN URL if enabled
        const { transformToCDN, getResponsiveImageUrls } = await import('./services/cdn-service.js');
        const cdnUrl = transformToCDN(url, {
          quality: 85,
          format: 'webp',
        });
        
        // Generate responsive image URLs
        const responsiveUrls = getResponsiveImageUrls(url);
        
        return { 
          url: cdnUrl, // Primary CDN URL
          originalUrl: url, // Original S3 URL
          key: fileKey,
          responsive: responsiveUrls, // Multiple sizes
        };
      } catch (error) {
        logger.error('[Marketplace] Image upload error:', error);
        throw new Error('Failed to upload image');
      }
    }),

  // Get messages in a conversation
  getMessages: protectedProcedure
    .input(
      z.object({
        partnerId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user.id;

      const messages = await db
        .select()
        .from(marketplaceMessages)
        .where(
          or(
            and(
              eq(marketplaceMessages.senderId, userId),
              eq(marketplaceMessages.recipientId, input.partnerId)
            ),
            and(
              eq(marketplaceMessages.senderId, input.partnerId),
              eq(marketplaceMessages.recipientId, userId)
            )
          )
        )
        .orderBy(marketplaceMessages.createdAt);

      // Mark messages as read
      await db
        .update(marketplaceMessages)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            eq(marketplaceMessages.recipientId, userId),
            eq(marketplaceMessages.senderId, input.partnerId),
            eq(marketplaceMessages.read, false)
          )
        );

      return messages;
    }),

  // ============================================================================
  // PRODUCT ALIASES (for test compatibility)
  // ============================================================================

  // Alias for createListing
  createProduct: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      category: z.string(),
      price: z.number(),
      unit: z.string(),
      quantityAvailable: z.number(),
      images: z.array(z.string()).optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      // Convert price to cents (integer)
      const priceInCents = Math.round(input.price * 100);
      const totalPrice = Math.round(input.quantityAvailable * priceInCents);
      
      const [listing] = await db.insert(produceListings).values({
        userId,
        title: input.name,
        description: input.description || null,
        category: input.category as any,
        quantity: input.quantityAvailable,
        unit: input.unit as any,
        pricePerUnit: priceInCents,
        totalPrice,
        photos: (input.images ? JSON.stringify(input.images) : JSON.stringify([])) as any,
        status: "active",
      }).returning();
      
      return {
        id: listing.id,
        name: listing.title,
        description: listing.description,
        category: listing.category,
        price: listing.pricePerUnit / 100, // Convert cents back to dollars
        unit: listing.unit,
        quantityAvailable: listing.quantity,
        images: typeof listing.photos === 'string' ? JSON.parse(listing.photos) : listing.photos,
        status: listing.status,
      };
    }),

  // Alias for searchListings
  listProducts: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const listings = await db
        .select()
        .from(produceListings)
        .where(eq(produceListings.status, "active"))
        .orderBy(desc(produceListings.createdAt));
      
      return listings.map((listing) => ({
        id: listing.id,
        name: listing.title,
        description: listing.description,
        category: listing.category,
        price: listing.pricePerUnit,
        unit: listing.unit,
        quantityAvailable: listing.quantity,
        images: typeof listing.photos === 'string' ? JSON.parse(listing.photos) : listing.photos,
        status: listing.status,
      }));
    }),

  // Alias for getListing
  getProduct: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [listing] = await db
        .select()
        .from(produceListings)
        .where(eq(produceListings.id, input.id))
        .limit(1);
      
      if (!listing) {
        throw new Error("Product not found");
      }

      // Get reviews for this product by joining through orders
      const reviews = await db
        .select({ rating: marketplaceReviews.rating })
        .from(marketplaceReviews)
        .innerJoin(marketplaceOrders, eq(marketplaceReviews.orderId, marketplaceOrders.id))
        .innerJoin(orderItems, eq(marketplaceOrders.id, orderItems.orderId))
        .where(eq(orderItems.listingId, input.id));

      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0 
        ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / totalReviews
        : 0;
      
      return {
        id: listing.id,
        name: listing.title,
        description: listing.description,
        category: listing.category,
        price: listing.pricePerUnit / 100, // Convert cents back to dollars
        unit: listing.unit,
        quantityAvailable: listing.quantity,
        images: typeof listing.photos === 'string' ? JSON.parse(listing.photos) : listing.photos,
        status: listing.status,
        averageRating,
        totalReviews,
      };
    }),

  // Alias for updateListing
  updateProduct: protectedProcedure
    .input(z.object({
      id: z.number(),
      price: z.number().optional(),
      quantityAvailable: z.number().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [existing] = await db
        .select()
        .from(produceListings)
        .where(and(
          eq(produceListings.id, input.id),
          eq(produceListings.userId, userId)
        ))
        .limit(1);
      
      if (!existing) {
        throw new Error("Product not found or you don't have permission to edit it");
      }
      
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (input.price !== undefined) {
        const priceInCents = Math.round(input.price * 100);
        updates.pricePerUnit = priceInCents;
        updates.totalPrice = Math.round((input.quantityAvailable || existing.quantity) * priceInCents);
      }
      if (input.quantityAvailable !== undefined) {
        updates.quantity = input.quantityAvailable;
        const pricePerUnit = input.price !== undefined ? Math.round(input.price * 100) : existing.pricePerUnit;
        updates.totalPrice = Math.round(input.quantityAvailable * pricePerUnit);
      }
      if (input.status) updates.status = input.status;
      
      const [updated] = await db.update(produceListings)
        .set(updates)
        .where(eq(produceListings.id, input.id))
        .returning();
      
      return {
        id: updated.id,
        name: updated.title,
        price: updated.pricePerUnit / 100, // Convert cents back to dollars
        quantityAvailable: updated.quantity,
        status: updated.status,
      };
    }),

  // Search products
  searchProducts: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      keyword: z.string().optional(),
      minPrice: z.number().optional(),
      maxPrice: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      let conditions = [eq(produceListings.status, "active")];
      
      if (input.category) {
        conditions.push(eq(produceListings.category, input.category as any));
      }
      if (input.keyword) {
        conditions.push(or(
          like(produceListings.title, `%${input.keyword}%`),
          like(produceListings.description, `%${input.keyword}%`)
        ) as any);
      }
      if (input.minPrice !== undefined) {
        conditions.push(gte(produceListings.pricePerUnit, input.minPrice));
      }
      if (input.maxPrice !== undefined) {
        conditions.push(lte(produceListings.pricePerUnit, input.maxPrice));
      }
      
      const listings = await db
        .select()
        .from(produceListings)
        .where(and(...conditions))
        .orderBy(desc(produceListings.createdAt));
      
      return listings.map((listing) => ({
        id: listing.id,
        name: listing.title,
        description: listing.description,
        category: listing.category,
        price: listing.pricePerUnit,
        unit: listing.unit,
        quantityAvailable: listing.quantity,
        status: listing.status,
      }));
    }),

  // ============================================================================
  // ORDER ALIASES (for test compatibility)
  // ============================================================================

  // Override createOrder to match test expectations
  createOrder: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.number(),
        quantity: z.number(),
        price: z.number(),
      })),
      shippingAddress: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zipCode: z.string(),
        country: z.string(),
      }),
      paymentMethod: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const buyerId = ctx.user.id;
      
      // Fetch listing details (using productId as listingId)
      const listingIds = input.items.map((item: Record<string, any>) => item.productId);
      const listings = await db
        .select()
        .from(produceListings)
        .where(and(
          inArray(produceListings.id, listingIds),
          eq(produceListings.status, "active")
        ));
      
      if (listings.length !== input.items.length) {
        throw new Error("Some products are no longer available");
      }
      
      // Calculate total (convert price to cents)
      let totalAmount = 0;
      const sellerId = listings[0].userId;
      
      for (const item of input.items) {
        const listing = listings.find((l) => l.id === item.productId);
        if (!listing) throw new Error("Product not found");
        if (listing.userId !== sellerId) {
          throw new Error("All items must be from the same seller");
        }
        const priceInCents = Math.round(item.price * 100);
        totalAmount += priceInCents * item.quantity;
      }
      
      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 9).toUpperCase()}`;
      
      // Create order
      const [order] = await db.insert(marketplaceOrders).values({
        buyerId,
        sellerId,
        orderNumber,
        totalAmount,
        status: "pending",
        paymentStatus: "pending",
        deliveryMethod: "delivery",
        deliveryAddress: JSON.stringify(input.shippingAddress) as any,
      }).returning();
      
      // Create order items
      for (const item of input.items) {
        const listing = listings.find((l) => l.id === item.productId)!;
        const priceInCents = Math.round(item.price * 100);
        await db.insert(orderItems).values({
          orderId: order.id,
          listingId: item.productId,
          quantity: item.quantity,
          pricePerUnit: priceInCents,
          totalPrice: priceInCents * item.quantity,
          productTitle: listing.title,
          productUnit: listing.unit,
        });
        
        // Update listing quantity
        await db.update(produceListings)
          .set({ 
            quantity: listing.quantity - item.quantity,
            status: listing.quantity - item.quantity === 0 ? "sold_out" : "active",
            updatedAt: new Date(),
          })
          .where(eq(produceListings.id, item.productId));
      }
      
      return {
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        totalAmount: order.totalAmount / 100, // Convert cents back to dollars
        status: order.status,
        paymentStatus: order.paymentStatus,
      };
    }),

  // List orders (buyer view)
  listOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const orders = await db
        .select()
        .from(marketplaceOrders)
        .where(eq(marketplaceOrders.buyerId, userId))
        .orderBy(desc(marketplaceOrders.createdAt));
      
      return orders.map((order) => ({
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      }));
    }),

  // Get single order
  getOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.id),
          or(
            eq(marketplaceOrders.buyerId, userId),
            eq(marketplaceOrders.sellerId, userId)
          )
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found");
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      
      return {
        id: order.id,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        totalAmount: order.totalAmount / 100, // Convert cents back to dollars
        status: order.status,
        paymentStatus: order.paymentStatus,
        items: items.map((item: Record<string, any>) => ({
          id: item.id,
          productId: item.listingId,
          quantity: item.quantity,
          price: item.pricePerUnit,
        })),
      };
    }),

  // Confirm payment
  confirmPayment: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      paymentReference: z.string(),
      amount: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.buyerId, userId)
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found");
      }
      
      const [updated] = await db.update(marketplaceOrders)
        .set({ 
          paymentStatus: "paid",
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrders.id, input.orderId))
        .returning();
      
      return {
        id: updated.id,
        paymentStatus: updated.paymentStatus,
      };
    }),

  // Confirm order (seller)
  confirmOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      estimatedDeliveryDate: z.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.sellerId, userId)
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found");
      }
      
      const [updated] = await db.update(marketplaceOrders)
        .set({ 
          status: "confirmed",
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrders.id, input.orderId))
        .returning();
      
      return {
        id: updated.id,
        status: updated.status,
      };
    }),

  // Confirm delivery (buyer)
  confirmDelivery: protectedProcedure
    .input(z.object({
      orderId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.buyerId, userId)
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found");
      }
      
      const [updated] = await db.update(marketplaceOrders)
        .set({ 
          status: "delivered",
          deliveredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrders.id, input.orderId))
        .returning();
      
      return {
        id: updated.id,
        status: updated.status,
      };
    }),

  // Cancel order
  cancelOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          or(
            eq(marketplaceOrders.buyerId, userId),
            eq(marketplaceOrders.sellerId, userId)
          )
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found");
      }
      
      const [updated] = await db.update(marketplaceOrders)
        .set({ 
          status: "cancelled",
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrders.id, input.orderId))
        .returning();
      
      return {
        id: updated.id,
        status: updated.status,
      };
    }),

  // ============================================================================
  // REVIEW PROCEDURES
  // ============================================================================

  // Simplified review creation that auto-detects reviewType and revieweeId
  createSimpleReview: protectedProcedure
    .input(z.object({
      productId: z.number(),
      orderId: z.number(),
      rating: z.number().min(1).max(5),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      // Get order to determine buyer/seller relationship
      const [order] = await db
        .select()
        .from(marketplaceOrders)
        .where(eq(marketplaceOrders.id, input.orderId))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found");
      }
      
      // Get product to find seller
      const [product] = await db
        .select()
        .from(produceListings)
        .where(eq(produceListings.id, input.productId))
        .limit(1);
      
      if (!product) {
        throw new Error("Product not found");
      }
      
      const sellerId = product.userId;
      
      // Determine review type and reviewee
      let reviewType: "buyer_to_seller" | "seller_to_buyer";
      let revieweeId: number;
      
      if (userId === order.buyerId) {
        reviewType = "buyer_to_seller";
        revieweeId = sellerId;
      } else if (userId === order.sellerId) {
        reviewType = "seller_to_buyer";
        revieweeId = order.buyerId;
      } else {
        throw new Error("You are not part of this order");
      }
      
      // Create review
      const [review] = await db
        .insert(marketplaceReviews)
        .values({
          orderId: input.orderId,
          reviewerId: userId,
          revieweeId,
          rating: input.rating,
          comment: input.comment || null,
          reviewType,
        } as any)
        .returning();
      
      // Get productId from order items
      const [orderItem] = await db
        .select({ productId: orderItems.listingId })
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId))
        .limit(1);
      
      return {
        id: review.id,
        productId: orderItem?.productId || input.productId,
        orderId: review.orderId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      };
    }),

  // Get product reviews
  getProductReviews: publicProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Join through orders and order items to get reviews for this product
      const reviews = await db
        .select({
          id: marketplaceReviews.id,
          productId: orderItems.listingId,
          userId: marketplaceReviews.reviewerId,
          rating: marketplaceReviews.rating,
          comment: marketplaceReviews.comment,
          createdAt: marketplaceReviews.createdAt,
        })
        .from(marketplaceReviews)
        .innerJoin(marketplaceOrders, eq(marketplaceReviews.orderId, marketplaceOrders.id))
        .innerJoin(orderItems, eq(marketplaceOrders.id, orderItems.orderId))
        .where(eq(orderItems.listingId, input.productId))
        .orderBy(desc(marketplaceReviews.createdAt));
      
      return reviews;
    }),

  // Report review
  reportReview: protectedProcedure
    .input(z.object({
      reviewId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // For now, just return success
      // In production, this would create a moderation ticket
      return {
        success: true,
        message: "Review reported for moderation",
      };
    }),

  // ============================================================================
  // ANALYTICS PROCEDURES
  // ============================================================================

  // Get sales summary
  getSalesSummary: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const orders = await db
        .select()
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.sellerId, userId),
          sql`${marketplaceOrders.status} != 'cancelled'`
        ));
      
      const totalOrders = orders.length;
      const totalRevenue = orders.reduce((sum: number, order: { totalAmount: number }) => sum + order.totalAmount, 0);
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      
      return {
        totalOrders,
        totalRevenue,
        averageOrderValue,
      };
    }),

  // Get best selling products
  getBestSellingProducts: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const items = await db
        .select({
          listingId: orderItems.listingId,
          productTitle: orderItems.productTitle,
          totalQuantity: sql<number>`sum(${orderItems.quantity})`,
          totalRevenue: sql<number>`sum(${orderItems.totalPrice})`,
        })
        .from(orderItems)
        .innerJoin(marketplaceOrders, eq(orderItems.orderId, marketplaceOrders.id))
        .where(eq(marketplaceOrders.sellerId, userId))
        .groupBy(orderItems.listingId, orderItems.productTitle)
        .orderBy(desc(sql`sum(${orderItems.quantity})`));
      
      return items;
    }),

  // Get sales by category
  getSalesByCategory: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const sales = await db
        .select({
          category: produceListings.category,
          totalRevenue: sql<number>`sum(${orderItems.totalPrice})`,
          totalOrders: sql<number>`count(distinct ${marketplaceOrders.id})`,
        })
        .from(orderItems)
        .innerJoin(marketplaceOrders, eq(orderItems.orderId, marketplaceOrders.id))
        .innerJoin(produceListings, eq(orderItems.listingId, produceListings.id))
        .where(eq(marketplaceOrders.sellerId, userId))
        .groupBy(produceListings.category);
      
      return sales;
    }),

  // Get monthly sales
  getMonthlySales: protectedProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const sales = await db
        .select({
          month: sql<string>`to_char(${marketplaceOrders.createdAt}, 'YYYY-MM')`,
          totalRevenue: sql<number>`sum(${marketplaceOrders.totalAmount})`,
          totalOrders: sql<number>`count(*)`,
        })
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.sellerId, userId),
          gte(marketplaceOrders.createdAt, input.startDate),
          lte(marketplaceOrders.createdAt, input.endDate)
        ))
        .groupBy(sql`to_char(${marketplaceOrders.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${marketplaceOrders.createdAt}, 'YYYY-MM')`);
      
      return sales;
    }),

  // Get top products
  getTopProducts: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const products = await db
        .select({
          id: produceListings.id,
          title: produceListings.title,
          views: produceListings.views,
          totalSales: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
        })
        .from(produceListings)
        .leftJoin(orderItems, eq(produceListings.id, orderItems.listingId))
        .where(eq(produceListings.userId, userId))
        .groupBy(produceListings.id, produceListings.title, produceListings.views)
        .orderBy(desc(sql`coalesce(sum(${orderItems.quantity}), 0)`))
        .limit(10);
      
      return products;
    }),

  // Get recent orders
  getRecentOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const orders = await db
        .select()
        .from(marketplaceOrders)
        .where(eq(marketplaceOrders.sellerId, userId))
        .orderBy(desc(marketplaceOrders.createdAt))
        .limit(10);
      
      return orders;
    }),

  // Get total revenue
  getTotalRevenue: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [result] = await db
        .select({
          totalRevenue: sql<number>`coalesce(sum(${marketplaceOrders.totalAmount}), 0)`,
        })
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.sellerId, userId),
          sql`${marketplaceOrders.status} != 'cancelled'`
        ));
      
      return result;
    }),

  // ============================================================================
  // INVENTORY PROCEDURES
  // ============================================================================

  // Update inventory
  updateInventory: protectedProcedure
    .input(z.object({
      productId: z.number(),
      quantityChange: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const [listing] = await db
        .select()
        .from(produceListings)
        .where(and(
          eq(produceListings.id, input.productId),
          eq(produceListings.userId, userId)
        ))
        .limit(1);
      
      if (!listing) {
        throw new Error("Product not found");
      }
      
      const newQuantity = listing.quantity + input.quantityChange;
      
      if (newQuantity < 0) {
        throw new Error("Insufficient inventory");
      }
      
      const [updated] = await db.update(produceListings)
        .set({ 
          quantity: newQuantity,
          status: newQuantity === 0 ? "sold_out" : "active",
          updatedAt: new Date(),
        })
        .where(eq(produceListings.id, input.productId))
        .returning();
      
      return {
        id: updated.id,
        quantityAvailable: updated.quantity,
        status: updated.status,
      };
    }),

  // Get low stock products
  getLowStockProducts: protectedProcedure
    .input(z.object({
      threshold: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const userId = ctx.user.id;
      
      const products = await db
        .select()
        .from(produceListings)
        .where(and(
          eq(produceListings.userId, userId),
          lte(produceListings.quantity, input.threshold),
          sql`${produceListings.status} != 'deleted'`
        ))
        .orderBy(produceListings.quantity);
      
      return products.map((listing) => ({
        id: listing.id,
        name: listing.title,
        quantityAvailable: listing.quantity,
        status: listing.status,
      }));
    }),
});
