import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { eq, and, desc, asc, sql, gte, lte, or } from "drizzle-orm";
import {
  exchangeCommodities,
  exchangeTraders,
  exchangeAccounts,
  exchangePositions,
  exchangeOrders,
  exchangeTrades,
  exchangeSettlements,
  exchangePriceCandles,
  exchangeOrderEvents,
  exchangeTransactions,
} from "../../drizzle/exchange-schema";
import { users } from "../../drizzle/schema";
import { checkTradingKyc, checkWalletKyc } from "../middleware/kyc-enforcement.js";
import { createTigerBeetleLedger, TigerBeetleLedger } from "../services/tigerbeetle-ledger.js";
import { logger } from '../logger.js';

// TigerBeetle ledger instance (lazy initialization)
let exchangeLedger: TigerBeetleLedger | null = null;
let exchangeLedgerAttempted = false;

async function getExchangeLedger(): Promise<TigerBeetleLedger | null> {
  if (exchangeLedger) return exchangeLedger;
  if (exchangeLedgerAttempted) return null;
  
  exchangeLedgerAttempted = true;
  try {
    const ledger = createTigerBeetleLedger();
    const addresses = process.env.TIGERBEETLE_ADDRESSES?.split(',') || ['127.0.0.1:3000'];
    await ledger.connect(addresses);
    exchangeLedger = ledger;
    logger.info('[Exchange] TigerBeetle ledger connected');
    return ledger;
  } catch (error) {
    logger.warn('[Exchange] TigerBeetle not available, trades will not be recorded in ledger:', error);
    return null;
  }
}

// ============================================================================
// COMMODITY EXCHANGE ROUTER
// ============================================================================

export const exchangeRouter = router({
  // ============================================================================
  // COMMODITIES
  // ============================================================================

  // List all active commodities
  listCommodities: publicProcedure
    .input(z.object({
      cropName: z.string().optional(),
      deliveryRegion: z.string().optional(),
      active: z.boolean().optional().default(true),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (!db) throw new Error("Database not available");
      const filters = input || { active: true };
      
      let query = db.select().from(exchangeCommodities);
      
      const conditions: Array<import('drizzle-orm').SQL | undefined> = [];
      if (filters.active !== undefined) {
        conditions.push(eq(exchangeCommodities.active, filters.active));
      }
      if (filters.cropName) {
        conditions.push(eq(exchangeCommodities.cropName, filters.cropName));
      }
      if (filters.deliveryRegion) {
        conditions.push(eq(exchangeCommodities.deliveryRegion, filters.deliveryRegion));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }
      
      return query.orderBy(asc(exchangeCommodities.symbol));
    }),

  // Get single commodity by symbol
  getCommodity: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [commodity] = await db
        .select()
        .from(exchangeCommodities)
        .where(eq(exchangeCommodities.symbol, input.symbol))
        .limit(1);
      
      if (!commodity) {
        throw new Error("Commodity not found");
      }
      
      return commodity;
    }),

  // Create a new commodity (admin only)
  createCommodity: protectedProcedure
    .input(z.object({
      symbol: z.string().min(1).max(50),
      name: z.string().min(1).max(200),
      cropName: z.string().min(1).max(100),
      grade: z.string().max(20).optional(),
      unit: z.string().min(1).max(20),
      lotSize: z.number().int().positive().default(100),
      deliveryType: z.enum(["physical", "cash"]).default("physical"),
      defaultSettlementDays: z.number().int().positive().default(2),
      deliveryRegion: z.string().max(100).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [commodity] = await db
        .insert(exchangeCommodities)
        .values({
          symbol: input.symbol,
          name: input.name,
          cropName: input.cropName,
          grade: input.grade,
          unit: input.unit,
          lotSize: input.lotSize,
          deliveryType: input.deliveryType,
          defaultSettlementDays: input.defaultSettlementDays,
          deliveryRegion: input.deliveryRegion,
          description: input.description,
        })
        .returning();
      
      return commodity;
    }),

  // ============================================================================
  // TRADER PROFILE
  // ============================================================================

  // Get or create trader profile for current user
  getMyTraderProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      // Check if trader profile exists
      let [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        // Create new trader profile
        [trader] = await db
          .insert(exchangeTraders)
          .values({
            userId,
            traderType: "individual",
            verificationStatus: "pending",
          })
          .returning();
        
        // Create default NGN account
        await db.insert(exchangeAccounts).values({
          traderId: trader.id,
          currency: "NGN",
          cashBalance: 0,
          cashAvailable: 0,
          cashReserved: 0,
        });
      }
      
      // Get account balance
      const [account] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, trader.id))
        .limit(1);
      
      return { trader, account };
    }),

  // Get trader's positions
  getMyPositions: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        return [];
      }
      
      const positions = await db
        .select({
          position: exchangePositions,
          commodity: exchangeCommodities,
        })
        .from(exchangePositions)
        .innerJoin(exchangeCommodities, eq(exchangePositions.commodityId, exchangeCommodities.id))
        .where(eq(exchangePositions.traderId, trader.id));
      
      return positions;
    }),

  // Add position (for sellers to list their inventory)
  addPosition: protectedProcedure
    .input(z.object({
      commodityId: z.number().int().positive(),
      quantity: z.number().int().positive(),
      warehouseLocation: z.string().optional(),
      sourceType: z.enum(["harvest", "inventory", "purchase"]).optional(),
      sourceId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      // Get or create trader
      let [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        [trader] = await db
          .insert(exchangeTraders)
          .values({ userId, traderType: "farmer", verificationStatus: "pending" })
          .returning();
      }
      
      // Check if position exists for this commodity
      const [existingPosition] = await db
        .select()
        .from(exchangePositions)
        .where(and(
          eq(exchangePositions.traderId, trader.id),
          eq(exchangePositions.commodityId, input.commodityId)
        ))
        .limit(1);
      
      if (existingPosition) {
        // Update existing position
        const [updated] = await db
          .update(exchangePositions)
          .set({
            quantityTotal: existingPosition.quantityTotal + input.quantity,
            quantityAvailable: existingPosition.quantityAvailable + input.quantity,
            warehouseLocation: input.warehouseLocation || existingPosition.warehouseLocation,
            updatedAt: new Date(),
          })
          .where(eq(exchangePositions.id, existingPosition.id))
          .returning();
        
        return updated;
      } else {
        // Create new position
        const [position] = await db
          .insert(exchangePositions)
          .values({
            traderId: trader.id,
            commodityId: input.commodityId,
            quantityTotal: input.quantity,
            quantityAvailable: input.quantity,
            quantityReserved: 0,
            warehouseLocation: input.warehouseLocation,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
          })
          .returning();
        
        return position;
      }
    }),

  // ============================================================================
  // ACCOUNT MANAGEMENT
  // ============================================================================

    // Deposit funds to exchange account
    deposit: protectedProcedure
      .input(z.object({
        amount: z.number().int().positive(), // in cents
        reference: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const userId = ctx.user.id;
      
        // Enforce KYC requirements before deposit
        const kycCheck = await checkWalletKyc(userId, 'deposit', input.amount);
        if (!kycCheck.allowed) {
          throw new Error(kycCheck.reason || "KYC verification required for deposits");
        }
      
        // Get trader
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        throw new Error("Trader profile not found. Please create one first.");
      }
      
      // Get account
      const [account] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, trader.id))
        .limit(1);
      
      if (!account) {
        throw new Error("Exchange account not found.");
      }
      
      // Update account balance
      const [updatedAccount] = await db
        .update(exchangeAccounts)
        .set({
          cashBalance: account.cashBalance + input.amount,
          cashAvailable: account.cashAvailable + input.amount,
          updatedAt: new Date(),
        })
        .where(eq(exchangeAccounts.id, account.id))
        .returning();
      
      // Record transaction
      await db.insert(exchangeTransactions).values({
        accountId: account.id,
        traderId: trader.id,
        transactionType: "deposit",
        amount: input.amount,
        currency: "NGN",
        status: "completed",
        reference: input.reference,
      });
      
      return updatedAccount;
    }),

    // Withdraw funds from exchange account
    withdraw: protectedProcedure
      .input(z.object({
        amount: z.number().int().positive(), // in cents
        reference: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const userId = ctx.user.id;
      
        // Enforce KYC requirements before withdrawal
        const kycCheck = await checkWalletKyc(userId, 'withdraw', input.amount);
        if (!kycCheck.allowed) {
          throw new Error(kycCheck.reason || "KYC verification required for withdrawals");
        }
      
        // Get trader
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        throw new Error("Trader profile not found.");
      }
      
      // Get account
      const [account] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, trader.id))
        .limit(1);
      
      if (!account) {
        throw new Error("Exchange account not found.");
      }
      
      if (account.cashAvailable < input.amount) {
        throw new Error("Insufficient available balance.");
      }
      
      // Update account balance
      const [updatedAccount] = await db
        .update(exchangeAccounts)
        .set({
          cashBalance: account.cashBalance - input.amount,
          cashAvailable: account.cashAvailable - input.amount,
          updatedAt: new Date(),
        })
        .where(eq(exchangeAccounts.id, account.id))
        .returning();
      
      // Record transaction
      await db.insert(exchangeTransactions).values({
        accountId: account.id,
        traderId: trader.id,
        transactionType: "withdrawal",
        amount: input.amount,
        currency: "NGN",
        status: "completed",
        reference: input.reference,
      });
      
      return updatedAccount;
    }),

  // ============================================================================
  // ORDER BOOK
  // ============================================================================

  // Get order book for a commodity
  getOrderBook: publicProcedure
    .input(z.object({
      commodityId: z.number().int().positive(),
      depth: z.number().int().positive().default(10),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get buy orders (bids) - highest price first
      const bids = await db
        .select({
          price: exchangeOrders.price,
          totalQuantity: sql<number>`SUM(${exchangeOrders.quantity} - ${exchangeOrders.quantityFilled})`.as("total_quantity"),
          orderCount: sql<number>`COUNT(*)`.as("order_count"),
        })
        .from(exchangeOrders)
        .where(and(
          eq(exchangeOrders.commodityId, input.commodityId),
          eq(exchangeOrders.side, "buy"),
          eq(exchangeOrders.status, "open"),
          sql`${exchangeOrders.price} IS NOT NULL`
        ))
        .groupBy(exchangeOrders.price)
        .orderBy(desc(exchangeOrders.price))
        .limit(input.depth);
      
      // Get sell orders (asks) - lowest price first
      const asks = await db
        .select({
          price: exchangeOrders.price,
          totalQuantity: sql<number>`SUM(${exchangeOrders.quantity} - ${exchangeOrders.quantityFilled})`.as("total_quantity"),
          orderCount: sql<number>`COUNT(*)`.as("order_count"),
        })
        .from(exchangeOrders)
        .where(and(
          eq(exchangeOrders.commodityId, input.commodityId),
          eq(exchangeOrders.side, "sell"),
          eq(exchangeOrders.status, "open"),
          sql`${exchangeOrders.price} IS NOT NULL`
        ))
        .groupBy(exchangeOrders.price)
        .orderBy(asc(exchangeOrders.price))
        .limit(input.depth);
      
      return { bids, asks };
    }),

  // Get recent trades for a commodity
  getRecentTrades: publicProcedure
    .input(z.object({
      commodityId: z.number().int().positive(),
      limit: z.number().int().positive().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const trades = await db
        .select()
        .from(exchangeTrades)
        .where(eq(exchangeTrades.commodityId, input.commodityId))
        .orderBy(desc(exchangeTrades.tradeTime))
        .limit(input.limit);
      
      return trades;
    }),

  // ============================================================================
  // ORDER MANAGEMENT
  // ============================================================================

    // Place a new order
    placeOrder: protectedProcedure
      .input(z.object({
        commodityId: z.number().int().positive(),
        side: z.enum(["buy", "sell"]),
        orderType: z.enum(["limit", "market"]),
        price: z.number().int().positive().optional(), // required for limit orders
        quantity: z.number().int().positive(),
        timeInForce: z.enum(["GTC", "IOC", "FOK"]).default("GTC"),
        clientOrderId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const userId = ctx.user.id;
      
        // Enforce KYC requirements before trading
        const tradeType = input.side === 'buy' ? 'buy' : 'sell';
        const estimatedAmount = (input.price || 0) * input.quantity;
        const kycCheck = await checkTradingKyc(userId, tradeType, estimatedAmount);
        if (!kycCheck.allowed) {
          throw new Error(kycCheck.reason || "KYC verification required for trading");
        }
      
        // Validate limit order has price
      if (input.orderType === "limit" && !input.price) {
        throw new Error("Limit orders require a price.");
      }
      
      // Get trader
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        throw new Error("Trader profile not found. Please create one first.");
      }
      
      if (trader.verificationStatus === "suspended") {
        throw new Error("Your trading account is suspended.");
      }
      
      // Get account
      const [account] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, trader.id))
        .limit(1);
      
      if (!account) {
        throw new Error("Exchange account not found.");
      }
      
      // Get commodity
      const [commodity] = await db
        .select()
        .from(exchangeCommodities)
        .where(eq(exchangeCommodities.id, input.commodityId))
        .limit(1);
      
      if (!commodity || !commodity.active) {
        throw new Error("Commodity not found or not active.");
      }
      
      let cashReserved = 0;
      let positionReserved = 0;
      
      if (input.side === "buy") {
        // Calculate required cash
        const orderPrice = input.price || commodity.bestAskPrice || commodity.lastTradePrice || 0;
        if (orderPrice === 0 && input.orderType === "market") {
          throw new Error("Cannot place market order: no price available.");
        }
        
        cashReserved = orderPrice * input.quantity;
        
        if (account.cashAvailable < cashReserved) {
          throw new Error(`Insufficient funds. Required: ${cashReserved}, Available: ${account.cashAvailable}`);
        }
        
        // Reserve cash
        await db
          .update(exchangeAccounts)
          .set({
            cashAvailable: account.cashAvailable - cashReserved,
            cashReserved: account.cashReserved + cashReserved,
            updatedAt: new Date(),
          })
          .where(eq(exchangeAccounts.id, account.id));
        
      } else {
        // Sell order - check position
        const [position] = await db
          .select()
          .from(exchangePositions)
          .where(and(
            eq(exchangePositions.traderId, trader.id),
            eq(exchangePositions.commodityId, input.commodityId)
          ))
          .limit(1);
        
        if (!position || position.quantityAvailable < input.quantity) {
          throw new Error(`Insufficient position. Required: ${input.quantity}, Available: ${position?.quantityAvailable || 0}`);
        }
        
        positionReserved = input.quantity;
        
        // Reserve position
        await db
          .update(exchangePositions)
          .set({
            quantityAvailable: position.quantityAvailable - positionReserved,
            quantityReserved: position.quantityReserved + positionReserved,
            updatedAt: new Date(),
          })
          .where(eq(exchangePositions.id, position.id));
      }
      
      // Create order
      const [order] = await db
        .insert(exchangeOrders)
        .values({
          commodityId: input.commodityId,
          traderId: trader.id,
          side: input.side,
          orderType: input.orderType,
          timeInForce: input.timeInForce,
          status: "open",
          price: input.price,
          quantity: input.quantity,
          quantityFilled: 0,
          cashReserved,
          positionReserved,
          clientOrderId: input.clientOrderId,
        })
        .returning();
      
      // Record order event
      await db.insert(exchangeOrderEvents).values({
        orderId: order.id,
        eventType: "created",
        eventData: JSON.stringify({ input }),
      });
      
      // Try to match the order
      const matchedTrades = await matchOrder(db, order, trader, commodity);
      
      // Refresh order status
      const [updatedOrder] = await db
        .select()
        .from(exchangeOrders)
        .where(eq(exchangeOrders.id, order.id))
        .limit(1);
      
      return { order: updatedOrder, trades: matchedTrades };
    }),

  // Cancel an order
  cancelOrder: protectedProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      // Get trader
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        throw new Error("Trader profile not found.");
      }
      
      // Get order
      const [order] = await db
        .select()
        .from(exchangeOrders)
        .where(and(
          eq(exchangeOrders.id, input.orderId),
          eq(exchangeOrders.traderId, trader.id)
        ))
        .limit(1);
      
      if (!order) {
        throw new Error("Order not found.");
      }
      
      if (order.status !== "open" && order.status !== "partially_filled") {
        throw new Error("Order cannot be cancelled.");
      }
      
      const remainingQuantity = order.quantity - order.quantityFilled;
      
      // Release reserved funds/positions
      if (order.side === "buy") {
        const remainingCash = Math.floor((order.cashReserved * remainingQuantity) / order.quantity);
        
        const [account] = await db
          .select()
          .from(exchangeAccounts)
          .where(eq(exchangeAccounts.traderId, trader.id))
          .limit(1);
        
        if (account) {
          await db
            .update(exchangeAccounts)
            .set({
              cashAvailable: account.cashAvailable + remainingCash,
              cashReserved: account.cashReserved - remainingCash,
              updatedAt: new Date(),
            })
            .where(eq(exchangeAccounts.id, account.id));
        }
      } else {
        const [position] = await db
          .select()
          .from(exchangePositions)
          .where(and(
            eq(exchangePositions.traderId, trader.id),
            eq(exchangePositions.commodityId, order.commodityId)
          ))
          .limit(1);
        
        if (position) {
          await db
            .update(exchangePositions)
            .set({
              quantityAvailable: position.quantityAvailable + remainingQuantity,
              quantityReserved: position.quantityReserved - remainingQuantity,
              updatedAt: new Date(),
            })
            .where(eq(exchangePositions.id, position.id));
        }
      }
      
      // Update order status
      const [cancelledOrder] = await db
        .update(exchangeOrders)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(exchangeOrders.id, order.id))
        .returning();
      
      // Record event
      await db.insert(exchangeOrderEvents).values({
        orderId: order.id,
        eventType: "cancelled",
        eventData: JSON.stringify({ remainingQuantity }),
      });
      
      return cancelledOrder;
    }),

  // Get my orders
  getMyOrders: protectedProcedure
    .input(z.object({
      status: z.enum(["open", "partially_filled", "filled", "cancelled", "rejected", "all"]).default("all"),
      commodityId: z.number().int().positive().optional(),
      limit: z.number().int().positive().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        return [];
      }
      
      const conditions = [eq(exchangeOrders.traderId, trader.id)];
      
      if (input.status !== "all") {
        conditions.push(eq(exchangeOrders.status, input.status));
      }
      
      if (input.commodityId) {
        conditions.push(eq(exchangeOrders.commodityId, input.commodityId));
      }
      
      const orders = await db
        .select({
          order: exchangeOrders,
          commodity: exchangeCommodities,
        })
        .from(exchangeOrders)
        .innerJoin(exchangeCommodities, eq(exchangeOrders.commodityId, exchangeCommodities.id))
        .where(and(...conditions))
        .orderBy(desc(exchangeOrders.createdAt))
        .limit(input.limit);
      
      return orders;
    }),

  // Get my trades
  getMyTrades: protectedProcedure
    .input(z.object({
      commodityId: z.number().int().positive().optional(),
      limit: z.number().int().positive().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        return [];
      }
      
      const conditions = [
        or(
          eq(exchangeTrades.buyerTraderId, trader.id),
          eq(exchangeTrades.sellerTraderId, trader.id)
        )
      ];
      
      if (input.commodityId) {
        conditions.push(eq(exchangeTrades.commodityId, input.commodityId));
      }
      
      const trades = await db
        .select({
          trade: exchangeTrades,
          commodity: exchangeCommodities,
        })
        .from(exchangeTrades)
        .innerJoin(exchangeCommodities, eq(exchangeTrades.commodityId, exchangeCommodities.id))
        .where(and(...conditions))
        .orderBy(desc(exchangeTrades.tradeTime))
        .limit(input.limit);
      
      return trades.map(t => ({
        ...t,
        side: t.trade.buyerTraderId === trader.id ? "buy" : "sell",
      }));
    }),

  // ============================================================================
  // PRICE HISTORY
  // ============================================================================

  // Get price candles for charts
  getPriceHistory: publicProcedure
    .input(z.object({
      commodityId: z.number().int().positive(),
      interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1h"),
      from: z.date().optional(),
      to: z.date().optional(),
      limit: z.number().int().positive().default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const conditions = [
        eq(exchangePriceCandles.commodityId, input.commodityId),
        eq(exchangePriceCandles.interval, input.interval),
      ];
      
      if (input.from) {
        conditions.push(gte(exchangePriceCandles.bucketStart, input.from));
      }
      if (input.to) {
        conditions.push(lte(exchangePriceCandles.bucketStart, input.to));
      }
      
      const candles = await db
        .select()
        .from(exchangePriceCandles)
        .where(and(...conditions))
        .orderBy(desc(exchangePriceCandles.bucketStart))
        .limit(input.limit);
      
      return candles.reverse(); // Return in chronological order
    }),

  // ============================================================================
  // SETTLEMENTS
  // ============================================================================

  // Get my settlements
  getMySettlements: protectedProcedure
    .input(z.object({
      status: z.enum(["pending", "posted", "failed", "all"]).default("all"),
      limit: z.number().int().positive().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const userId = ctx.user.id;
      
      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, userId))
        .limit(1);
      
      if (!trader) {
        return [];
      }
      
      const [account] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, trader.id))
        .limit(1);
      
      if (!account) {
        return [];
      }
      
      const conditions = [
        or(
          eq(exchangeSettlements.buyerAccountId, account.id),
          eq(exchangeSettlements.sellerAccountId, account.id)
        )
      ];
      
      if (input.status !== "all") {
        conditions.push(eq(exchangeSettlements.status, input.status));
      }
      
      const settlements = await db
        .select({
          settlement: exchangeSettlements,
          trade: exchangeTrades,
          commodity: exchangeCommodities,
        })
        .from(exchangeSettlements)
        .innerJoin(exchangeTrades, eq(exchangeSettlements.tradeId, exchangeTrades.id))
        .innerJoin(exchangeCommodities, eq(exchangeTrades.commodityId, exchangeCommodities.id))
        .where(and(...conditions))
        .orderBy(desc(exchangeSettlements.createdAt))
        .limit(input.limit);
      
      return settlements.map(s => ({
        ...s,
        role: s.settlement.buyerAccountId === account.id ? "buyer" : "seller",
      }));
    }),
});

// ============================================================================
// MATCHING ENGINE
// ============================================================================

async function matchOrder(
  db: Awaited<ReturnType<typeof getDb>>,
  order: typeof exchangeOrders.$inferSelect,
  trader: typeof exchangeTraders.$inferSelect,
  commodity: typeof exchangeCommodities.$inferSelect
) {
  if (!db) throw new Error("Database not available");
  const trades: (typeof exchangeTrades.$inferSelect)[] = [];
  
  if (order.side === "buy") {
    // Match against sell orders (asks)
    const matchingOrders = await db
      .select()
      .from(exchangeOrders)
      .where(and(
        eq(exchangeOrders.commodityId, order.commodityId),
        eq(exchangeOrders.side, "sell"),
        eq(exchangeOrders.status, "open"),
        order.orderType === "limit" && order.price
          ? lte(exchangeOrders.price, order.price)
          : sql`TRUE`
      ))
      .orderBy(asc(exchangeOrders.price), asc(exchangeOrders.createdAt));
    
    let remainingQuantity = order.quantity - order.quantityFilled;
    
    for (const sellOrder of matchingOrders) {
      if (remainingQuantity <= 0) break;
      
      const sellRemaining = sellOrder.quantity - sellOrder.quantityFilled;
      const matchQuantity = Math.min(remainingQuantity, sellRemaining);
      const matchPrice = sellOrder.price!; // Sell order price
      const tradeValue = matchPrice * matchQuantity;
      
      // Create trade
      const [trade] = await db
        .insert(exchangeTrades)
        .values({
          commodityId: order.commodityId,
          buyOrderId: order.id,
          sellOrderId: sellOrder.id,
          price: matchPrice,
          quantity: matchQuantity,
          tradeValue,
          buyerTraderId: order.traderId,
          sellerTraderId: sellOrder.traderId,
          settlementStatus: "pending",
          tradeTime: new Date(),
        })
        .returning();
      
      trades.push(trade);
      
      // Update buy order
      await db
        .update(exchangeOrders)
        .set({
          quantityFilled: order.quantityFilled + matchQuantity,
          status: order.quantityFilled + matchQuantity >= order.quantity ? "filled" : "partially_filled",
          updatedAt: new Date(),
        })
        .where(eq(exchangeOrders.id, order.id));
      
      // Update sell order
      await db
        .update(exchangeOrders)
        .set({
          quantityFilled: sellOrder.quantityFilled + matchQuantity,
          status: sellOrder.quantityFilled + matchQuantity >= sellOrder.quantity ? "filled" : "partially_filled",
          updatedAt: new Date(),
        })
        .where(eq(exchangeOrders.id, sellOrder.id));
      
      // Get accounts
      const [buyerAccount] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, order.traderId))
        .limit(1);
      
      const [sellerAccount] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, sellOrder.traderId))
        .limit(1);
      
      // Create settlement
      const feeRate = 0.01; // 1% fee
      const feesBuyer = Math.floor(tradeValue * feeRate);
      const feesSeller = Math.floor(tradeValue * feeRate);
      
      await db.insert(exchangeSettlements).values({
        tradeId: trade.id,
        buyerAccountId: buyerAccount.id,
        sellerAccountId: sellerAccount.id,
        grossAmount: tradeValue,
        feesBuyer,
        feesSeller,
        netBuyerDebit: tradeValue + feesBuyer,
        netSellerCredit: tradeValue - feesSeller,
        status: "pending",
      });
      
      // Update buyer account (release reserved, deduct actual)
      const buyerCashUsed = tradeValue + feesBuyer;
      await db
        .update(exchangeAccounts)
        .set({
          cashBalance: buyerAccount.cashBalance - buyerCashUsed,
          cashReserved: buyerAccount.cashReserved - tradeValue,
          updatedAt: new Date(),
        })
        .where(eq(exchangeAccounts.id, buyerAccount.id));
      
      // Update seller account (credit proceeds)
      await db
        .update(exchangeAccounts)
        .set({
          cashBalance: sellerAccount.cashBalance + (tradeValue - feesSeller),
          cashAvailable: sellerAccount.cashAvailable + (tradeValue - feesSeller),
          updatedAt: new Date(),
        })
        .where(eq(exchangeAccounts.id, sellerAccount.id));
      
      // Update seller position (reduce reserved)
      const [sellerPosition] = await db
        .select()
        .from(exchangePositions)
        .where(and(
          eq(exchangePositions.traderId, sellOrder.traderId),
          eq(exchangePositions.commodityId, order.commodityId)
        ))
        .limit(1);
      
      if (sellerPosition) {
        await db
          .update(exchangePositions)
          .set({
            quantityTotal: sellerPosition.quantityTotal - matchQuantity,
            quantityReserved: sellerPosition.quantityReserved - matchQuantity,
            updatedAt: new Date(),
          })
          .where(eq(exchangePositions.id, sellerPosition.id));
      }
      
      // Update commodity price
      await db
        .update(exchangeCommodities)
        .set({
          lastTradePrice: matchPrice,
          lastTradeAt: new Date(),
          dailyVolume: (commodity.dailyVolume || 0) + matchQuantity,
          dailyHigh: Math.max(commodity.dailyHigh || 0, matchPrice),
          dailyLow: commodity.dailyLow ? Math.min(commodity.dailyLow, matchPrice) : matchPrice,
          updatedAt: new Date(),
        })
        .where(eq(exchangeCommodities.id, commodity.id));
      
      remainingQuantity -= matchQuantity;
    }
  } else {
    // Match against buy orders (bids)
    const matchingOrders = await db
      .select()
      .from(exchangeOrders)
      .where(and(
        eq(exchangeOrders.commodityId, order.commodityId),
        eq(exchangeOrders.side, "buy"),
        eq(exchangeOrders.status, "open"),
        order.orderType === "limit" && order.price
          ? gte(exchangeOrders.price, order.price)
          : sql`TRUE`
      ))
      .orderBy(desc(exchangeOrders.price), asc(exchangeOrders.createdAt));
    
    let remainingQuantity = order.quantity - order.quantityFilled;
    
    for (const buyOrder of matchingOrders) {
      if (remainingQuantity <= 0) break;
      
      const buyRemaining = buyOrder.quantity - buyOrder.quantityFilled;
      const matchQuantity = Math.min(remainingQuantity, buyRemaining);
      const matchPrice = buyOrder.price!; // Buy order price
      const tradeValue = matchPrice * matchQuantity;
      
      // Create trade
      const [trade] = await db
        .insert(exchangeTrades)
        .values({
          commodityId: order.commodityId,
          buyOrderId: buyOrder.id,
          sellOrderId: order.id,
          price: matchPrice,
          quantity: matchQuantity,
          tradeValue,
          buyerTraderId: buyOrder.traderId,
          sellerTraderId: order.traderId,
          settlementStatus: "pending",
          tradeTime: new Date(),
        })
        .returning();
      
      trades.push(trade);
      
      // Update sell order (current order)
      await db
        .update(exchangeOrders)
        .set({
          quantityFilled: order.quantityFilled + matchQuantity,
          status: order.quantityFilled + matchQuantity >= order.quantity ? "filled" : "partially_filled",
          updatedAt: new Date(),
        })
        .where(eq(exchangeOrders.id, order.id));
      
      // Update buy order
      await db
        .update(exchangeOrders)
        .set({
          quantityFilled: buyOrder.quantityFilled + matchQuantity,
          status: buyOrder.quantityFilled + matchQuantity >= buyOrder.quantity ? "filled" : "partially_filled",
          updatedAt: new Date(),
        })
        .where(eq(exchangeOrders.id, buyOrder.id));
      
      // Get accounts
      const [buyerAccount] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, buyOrder.traderId))
        .limit(1);
      
      const [sellerAccount] = await db
        .select()
        .from(exchangeAccounts)
        .where(eq(exchangeAccounts.traderId, order.traderId))
        .limit(1);
      
      // Create settlement
      const feeRate = 0.01; // 1% fee
      const feesBuyer = Math.floor(tradeValue * feeRate);
      const feesSeller = Math.floor(tradeValue * feeRate);
      
      await db.insert(exchangeSettlements).values({
        tradeId: trade.id,
        buyerAccountId: buyerAccount.id,
        sellerAccountId: sellerAccount.id,
        grossAmount: tradeValue,
        feesBuyer,
        feesSeller,
        netBuyerDebit: tradeValue + feesBuyer,
        netSellerCredit: tradeValue - feesSeller,
        status: "pending",
      });
      
      // Update buyer account
      const buyerCashUsed = tradeValue + feesBuyer;
      await db
        .update(exchangeAccounts)
        .set({
          cashBalance: buyerAccount.cashBalance - buyerCashUsed,
          cashReserved: buyerAccount.cashReserved - tradeValue,
          updatedAt: new Date(),
        })
        .where(eq(exchangeAccounts.id, buyerAccount.id));
      
      // Update seller account
      await db
        .update(exchangeAccounts)
        .set({
          cashBalance: sellerAccount.cashBalance + (tradeValue - feesSeller),
          cashAvailable: sellerAccount.cashAvailable + (tradeValue - feesSeller),
          updatedAt: new Date(),
        })
        .where(eq(exchangeAccounts.id, sellerAccount.id));
      
      // Update seller position
      const [sellerPosition] = await db
        .select()
        .from(exchangePositions)
        .where(and(
          eq(exchangePositions.traderId, order.traderId),
          eq(exchangePositions.commodityId, order.commodityId)
        ))
        .limit(1);
      
      if (sellerPosition) {
        await db
          .update(exchangePositions)
          .set({
            quantityTotal: sellerPosition.quantityTotal - matchQuantity,
            quantityReserved: sellerPosition.quantityReserved - matchQuantity,
            updatedAt: new Date(),
          })
          .where(eq(exchangePositions.id, sellerPosition.id));
      }
      
      // Update commodity price
      await db
        .update(exchangeCommodities)
        .set({
          lastTradePrice: matchPrice,
          lastTradeAt: new Date(),
          dailyVolume: (commodity.dailyVolume || 0) + matchQuantity,
          dailyHigh: Math.max(commodity.dailyHigh || 0, matchPrice),
          dailyLow: commodity.dailyLow ? Math.min(commodity.dailyLow, matchPrice) : matchPrice,
          updatedAt: new Date(),
        })
        .where(eq(exchangeCommodities.id, commodity.id));
      
      remainingQuantity -= matchQuantity;
    }
  }
  
  // Update best bid/ask after matching
  await updateBestPrices(db, order.commodityId);
  
  return trades;
}

async function updateBestPrices(db: Awaited<ReturnType<typeof getDb>>, commodityId: number) {
  if (!db) throw new Error("Database not available");
  // Get best bid (highest buy price)
  const [bestBid] = await db
    .select({ price: exchangeOrders.price })
    .from(exchangeOrders)
    .where(and(
      eq(exchangeOrders.commodityId, commodityId),
      eq(exchangeOrders.side, "buy"),
      eq(exchangeOrders.status, "open"),
      sql`${exchangeOrders.price} IS NOT NULL`
    ))
    .orderBy(desc(exchangeOrders.price))
    .limit(1);
  
  // Get best ask (lowest sell price)
  const [bestAsk] = await db
    .select({ price: exchangeOrders.price })
    .from(exchangeOrders)
    .where(and(
      eq(exchangeOrders.commodityId, commodityId),
      eq(exchangeOrders.side, "sell"),
      eq(exchangeOrders.status, "open"),
      sql`${exchangeOrders.price} IS NOT NULL`
    ))
    .orderBy(asc(exchangeOrders.price))
    .limit(1);
  
  await db
    .update(exchangeCommodities)
    .set({
      bestBidPrice: bestBid?.price || null,
      bestAskPrice: bestAsk?.price || null,
      updatedAt: new Date(),
    })
    .where(eq(exchangeCommodities.id, commodityId));
}
