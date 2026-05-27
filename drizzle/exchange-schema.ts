import { pgTable, serial, integer, varchar, text, timestamp, boolean, index, unique, decimal, bigint } from "drizzle-orm/pg-core";
import { users, farms, crops, harvests } from "./schema";

// ============================================================================
// COMMODITY EXCHANGE MODULE
// ============================================================================

// Exchange Commodities - Standardized tradable units
export const exchangeCommodities = pgTable("exchange_commodities", {
  id: serial("id").primaryKey(),
  symbol: varchar("symbol", { length: 50 }).notNull().unique(), // "MAIZE-G1-LAGOS-100KG"
  name: varchar("name", { length: 200 }).notNull(), // "Maize Grade A - Lagos - 100kg"
  cropName: varchar("crop_name", { length: 100 }).notNull(), // link to crops.cropName semantics
  grade: varchar("grade", { length: 20 }), // "A", "B", "Premium"
  unit: varchar("unit", { length: 20 }).notNull(), // "kg", "bag", "ton"
  lotSize: integer("lot_size").notNull().default(100), // quantity per contract
  deliveryType: varchar("delivery_type", { length: 20 }).notNull().default("physical"), // "physical" | "cash"
  defaultSettlementDays: integer("default_settlement_days").notNull().default(2), // T+2
  deliveryRegion: varchar("delivery_region", { length: 100 }), // "Lagos", "North-West"
  description: text("description"),
  
  // Price tracking (updated on each trade)
  lastTradePrice: integer("last_trade_price"), // in cents per unit
  lastTradeAt: timestamp("last_trade_at"),
  bestBidPrice: integer("best_bid_price"), // highest buy price
  bestAskPrice: integer("best_ask_price"), // lowest sell price
  dailyVolume: integer("daily_volume").default(0), // today's traded volume
  dailyHigh: integer("daily_high"), // today's highest price
  dailyLow: integer("daily_low"), // today's lowest price
  previousClose: integer("previous_close"), // yesterday's closing price
  
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  symbolIdx: index("exchange_commodities_symbol_idx").on(table.symbol),
  cropNameIdx: index("exchange_commodities_crop_name_idx").on(table.cropName),
  activeIdx: index("exchange_commodities_active_idx").on(table.active),
}));

// Exchange Traders - Trader profiles with verification and limits
export const exchangeTraders = pgTable("exchange_traders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // Trader type and verification
  traderType: varchar("trader_type", { length: 50 }).notNull().default("individual"), // "individual" | "farmer" | "institutional" | "broker"
  verificationStatus: varchar("verification_status", { length: 20 }).notNull().default("pending"), // "pending" | "verified" | "suspended"
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by").references(() => users.id),
  
  // Trading limits
  positionLimit: integer("position_limit").notNull().default(10000), // max open quantity across all commodities
  dailyTradeLimit: integer("daily_trade_limit").notNull().default(1000000), // max notional per day in cents
  maxLeverage: decimal("max_leverage", { precision: 5, scale: 2 }).notNull().default("1.00"), // 1.0 = no leverage
  
  // Risk assessment
  riskScore: integer("risk_score"), // 1-100, from credit scoring
  
  // Statistics
  totalTrades: integer("total_trades").notNull().default(0),
  totalVolume: integer("total_volume").notNull().default(0), // in cents
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("exchange_traders_user_id_idx").on(table.userId),
  verificationStatusIdx: index("exchange_traders_verification_status_idx").on(table.verificationStatus),
}));

// Exchange Accounts - Trading account balances
export const exchangeAccounts = pgTable("exchange_accounts", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => exchangeTraders.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"), // Nigerian Naira
  
  // Balance tracking (all in cents)
  cashBalance: integer("cash_balance").notNull().default(0), // total cash
  cashAvailable: integer("cash_available").notNull().default(0), // cashBalance - cashReserved
  cashReserved: integer("cash_reserved").notNull().default(0), // locked by open buy orders
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  traderIdIdx: index("exchange_accounts_trader_id_idx").on(table.traderId),
  uniqueTraderCurrency: unique().on(table.traderId, table.currency),
}));

// Exchange Positions - Physical inventory positions for selling
export const exchangePositions = pgTable("exchange_positions", {
  id: serial("id").primaryKey(),
  traderId: integer("trader_id").notNull().references(() => exchangeTraders.id, { onDelete: "cascade" }),
  commodityId: integer("commodity_id").notNull().references(() => exchangeCommodities.id, { onDelete: "cascade" }),
  
  // Quantity tracking
  quantityTotal: integer("quantity_total").notNull().default(0), // total owned
  quantityAvailable: integer("quantity_available").notNull().default(0), // free to sell
  quantityReserved: integer("quantity_reserved").notNull().default(0), // locked by open sell orders
  
  // Source tracking
  warehouseLocation: varchar("warehouse_location", { length: 200 }),
  sourceType: varchar("source_type", { length: 50 }), // "harvest" | "inventory" | "purchase"
  sourceId: integer("source_id"), // FK to harvests.id or inventory_transactions.id
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  traderIdIdx: index("exchange_positions_trader_id_idx").on(table.traderId),
  commodityIdIdx: index("exchange_positions_commodity_id_idx").on(table.commodityId),
  uniqueTraderCommodity: unique().on(table.traderId, table.commodityId),
}));

// Exchange Orders - Order book entries
export const exchangeOrders = pgTable("exchange_orders", {
  id: serial("id").primaryKey(),
  commodityId: integer("commodity_id").notNull().references(() => exchangeCommodities.id, { onDelete: "cascade" }),
  traderId: integer("trader_id").notNull().references(() => exchangeTraders.id, { onDelete: "cascade" }),
  
  // Order details
  side: varchar("side", { length: 10 }).notNull(), // "buy" | "sell"
  orderType: varchar("order_type", { length: 20 }).notNull(), // "limit" | "market" | "stop_limit"
  timeInForce: varchar("time_in_force", { length: 10 }).notNull().default("GTC"), // "GTC" | "IOC" | "FOK"
  status: varchar("status", { length: 20 }).notNull().default("open"), // "open" | "partially_filled" | "filled" | "cancelled" | "rejected"
  
  // Pricing (in cents per unit)
  price: integer("price"), // null for pure market orders
  stopPrice: integer("stop_price"), // for stop orders
  
  // Quantity
  quantity: integer("quantity").notNull(), // total quantity
  quantityFilled: integer("quantity_filled").notNull().default(0), // filled so far
  
  // Reserved amounts
  cashReserved: integer("cash_reserved").notNull().default(0), // for buy orders
  positionReserved: integer("position_reserved").notNull().default(0), // for sell orders
  
  // Client reference
  clientOrderId: varchar("client_order_id", { length: 100 }), // for idempotency
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at"),
  rejectionReason: text("rejection_reason"),
}, (table) => ({
  commodityIdIdx: index("exchange_orders_commodity_id_idx").on(table.commodityId),
  traderIdIdx: index("exchange_orders_trader_id_idx").on(table.traderId),
  statusIdx: index("exchange_orders_status_idx").on(table.status),
  // Index for matching buy orders (highest price first, then oldest)
  buyMatchIdx: index("exchange_orders_buy_match_idx").on(table.commodityId, table.side, table.status, table.price),
  // Index for matching sell orders (lowest price first, then oldest)
  sellMatchIdx: index("exchange_orders_sell_match_idx").on(table.commodityId, table.side, table.status, table.price),
}));

// Exchange Trades - Executed trades
export const exchangeTrades = pgTable("exchange_trades", {
  id: serial("id").primaryKey(),
  commodityId: integer("commodity_id").notNull().references(() => exchangeCommodities.id, { onDelete: "cascade" }),
  buyOrderId: integer("buy_order_id").notNull().references(() => exchangeOrders.id, { onDelete: "cascade" }),
  sellOrderId: integer("sell_order_id").notNull().references(() => exchangeOrders.id, { onDelete: "cascade" }),
  
  // Trade details
  price: integer("price").notNull(), // execution price per unit in cents
  quantity: integer("quantity").notNull(), // executed quantity
  tradeValue: integer("trade_value").notNull(), // price * quantity
  
  // Participants
  buyerTraderId: integer("buyer_trader_id").notNull().references(() => exchangeTraders.id, { onDelete: "cascade" }),
  sellerTraderId: integer("seller_trader_id").notNull().references(() => exchangeTraders.id, { onDelete: "cascade" }),
  
  // Settlement
  settlementStatus: varchar("settlement_status", { length: 20 }).notNull().default("pending"), // "pending" | "processing" | "settled" | "failed"
  settlementDate: timestamp("settlement_date"),
  
  tradeTime: timestamp("trade_time").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  commodityIdIdx: index("exchange_trades_commodity_id_idx").on(table.commodityId),
  buyerTraderIdIdx: index("exchange_trades_buyer_trader_id_idx").on(table.buyerTraderId),
  sellerTraderIdIdx: index("exchange_trades_seller_trader_id_idx").on(table.sellerTraderId),
  tradeTimeIdx: index("exchange_trades_trade_time_idx").on(table.tradeTime),
}));

// Exchange Settlements - Settlement records linked to accounting
export const exchangeSettlements = pgTable("exchange_settlements", {
  id: serial("id").primaryKey(),
  tradeId: integer("trade_id").notNull().unique().references(() => exchangeTrades.id, { onDelete: "cascade" }),
  
  // Accounts involved
  buyerAccountId: integer("buyer_account_id").notNull().references(() => exchangeAccounts.id, { onDelete: "cascade" }),
  sellerAccountId: integer("seller_account_id").notNull().references(() => exchangeAccounts.id, { onDelete: "cascade" }),
  
  // Amounts (in cents)
  grossAmount: integer("gross_amount").notNull(),
  feesBuyer: integer("fees_buyer").notNull().default(0),
  feesSeller: integer("fees_seller").notNull().default(0),
  netBuyerDebit: integer("net_buyer_debit").notNull(), // gross + buyer fee
  netSellerCredit: integer("net_seller_credit").notNull(), // gross - seller fee
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending" | "posted" | "failed"
  journalEntryId: integer("journal_entry_id"), // FK to journalEntries.id
  
  // Delivery tracking (for physical settlement)
  deliveryStatus: varchar("delivery_status", { length: 20 }), // "pending" | "in_transit" | "delivered"
  deliveryLocation: varchar("delivery_location", { length: 200 }),
  deliveryNotes: text("delivery_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tradeIdIdx: index("exchange_settlements_trade_id_idx").on(table.tradeId),
  statusIdx: index("exchange_settlements_status_idx").on(table.status),
}));

// Exchange Price Candles - OHLCV data for charts
export const exchangePriceCandles = pgTable("exchange_price_candles", {
  id: serial("id").primaryKey(),
  commodityId: integer("commodity_id").notNull().references(() => exchangeCommodities.id, { onDelete: "cascade" }),
  interval: varchar("interval", { length: 10 }).notNull(), // "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
  bucketStart: timestamp("bucket_start").notNull(),
  
  // OHLCV data (prices in cents)
  openPrice: integer("open_price").notNull(),
  highPrice: integer("high_price").notNull(),
  lowPrice: integer("low_price").notNull(),
  closePrice: integer("close_price").notNull(),
  volume: integer("volume").notNull().default(0), // sum of quantities
  tradeCount: integer("trade_count").notNull().default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueCommodityIntervalBucket: unique().on(table.commodityId, table.interval, table.bucketStart),
  commodityIdIdx: index("exchange_price_candles_commodity_id_idx").on(table.commodityId),
  bucketStartIdx: index("exchange_price_candles_bucket_start_idx").on(table.bucketStart),
}));

// Exchange Order Events - Audit trail for orders
export const exchangeOrderEvents = pgTable("exchange_order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => exchangeOrders.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // "created" | "updated" | "cancelled" | "filled" | "partially_filled" | "rejected"
  eventData: text("event_data"), // JSON string with event details
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orderIdIdx: index("exchange_order_events_order_id_idx").on(table.orderId),
  eventTypeIdx: index("exchange_order_events_event_type_idx").on(table.eventType),
}));

// Exchange Deposits/Withdrawals - Track cash movements
export const exchangeTransactions = pgTable("exchange_transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => exchangeAccounts.id, { onDelete: "cascade" }),
  traderId: integer("trader_id").notNull().references(() => exchangeTraders.id, { onDelete: "cascade" }),
  
  transactionType: varchar("transaction_type", { length: 20 }).notNull(), // "deposit" | "withdrawal"
  amount: integer("amount").notNull(), // in cents
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending" | "completed" | "failed"
  reference: varchar("reference", { length: 100 }), // external reference
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  accountIdIdx: index("exchange_transactions_account_id_idx").on(table.accountId),
  traderIdIdx: index("exchange_transactions_trader_id_idx").on(table.traderId),
  statusIdx: index("exchange_transactions_status_idx").on(table.status),
}));

// Type exports
export type ExchangeCommodity = typeof exchangeCommodities.$inferSelect;
export type InsertExchangeCommodity = typeof exchangeCommodities.$inferInsert;
export type ExchangeTrader = typeof exchangeTraders.$inferSelect;
export type InsertExchangeTrader = typeof exchangeTraders.$inferInsert;
export type ExchangeAccount = typeof exchangeAccounts.$inferSelect;
export type InsertExchangeAccount = typeof exchangeAccounts.$inferInsert;
export type ExchangePosition = typeof exchangePositions.$inferSelect;
export type InsertExchangePosition = typeof exchangePositions.$inferInsert;
export type ExchangeOrder = typeof exchangeOrders.$inferSelect;
export type InsertExchangeOrder = typeof exchangeOrders.$inferInsert;
export type ExchangeTrade = typeof exchangeTrades.$inferSelect;
export type InsertExchangeTrade = typeof exchangeTrades.$inferInsert;
export type ExchangeSettlement = typeof exchangeSettlements.$inferSelect;
export type InsertExchangeSettlement = typeof exchangeSettlements.$inferInsert;
export type ExchangePriceCandle = typeof exchangePriceCandles.$inferSelect;
export type InsertExchangePriceCandle = typeof exchangePriceCandles.$inferInsert;
export type ExchangeOrderEvent = typeof exchangeOrderEvents.$inferSelect;
export type InsertExchangeOrderEvent = typeof exchangeOrderEvents.$inferInsert;
export type ExchangeTransaction = typeof exchangeTransactions.$inferSelect;
export type InsertExchangeTransaction = typeof exchangeTransactions.$inferInsert;
