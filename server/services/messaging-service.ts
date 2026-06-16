/**
 * Messaging Service Layer
 * 
 * Provides complete database integration for USSD/SMS/WhatsApp channels
 * Handles authentication, data operations, and business logic
 */

import { getDb } from "../db.js";
import {
  users,
  farmers,
  farms,
  crops,
  livestock,
  farmInputs,
  harvests,
  expenses,
  produceListings,
  marketplaceOrders,
  orderItems,
  phoneUserMapping,
  messagingSessions,
  messageLogs,
} from "../../drizzle/schema.js";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import crypto from "crypto";

// ============================================================================
// AUTHENTICATION & USER MANAGEMENT
// ============================================================================

/**
 * Get or create user by phone number
 * Returns userId if user exists, null if not registered
 */
export async function getUserByPhone(phoneNumber: string): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizePhoneNumber(phoneNumber);

  const [mapping] = await db
    .select()
    .from(phoneUserMapping)
    .where(eq(phoneUserMapping.phoneNumber, normalized))
    .limit(1);

  return mapping?.userId || null;
}

/**
 * Register new user via phone number
 * Creates user account and phone mapping
 */
export async function registerUserByPhone(
  phoneNumber: string,
  name: string
): Promise<{ userId: number; verificationCode: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizePhoneNumber(phoneNumber);

  // Check if phone already registered
  const existing = await getUserByPhone(normalized);
  if (existing) {
    throw new Error("Phone number already registered");
  }

  // Generate verification code
  const verificationCode = generateOTP();
  const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Create user account
  const [user] = await db
    .insert(users)
    .values({
      email: `${normalized}@phone.local`, // Placeholder email
      password: crypto.randomBytes(32).toString("hex"), // Random password (not used)
      firstName: name.split(" ")[0] || name,
      lastName: name.split(" ")[1] || "",
      role: "farmer",
      isActive: true,
    } as any)
    .returning();

  // Create phone mapping
  await db.insert(phoneUserMapping).values({
    phoneNumber: normalized,
    userId: user.id,
    verificationCode,
    verificationExpiresAt,
    isVerified: false,
  } as any);

  // Create farmer profile automatically
  await db.insert(farmers).values({
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: normalized,
    address: "Not specified",
    village: "Not specified",
    district: "Not specified",
    region: "Not specified",
  } as any);

  return { userId: user.id, verificationCode };
}

/**
 * Verify phone number with OTP code
 */
export async function verifyPhoneNumber(
  phoneNumber: string,
  code: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizePhoneNumber(phoneNumber);

  const [mapping] = await db
    .select()
    .from(phoneUserMapping)
    .where(eq(phoneUserMapping.phoneNumber, normalized))
    .limit(1);

  if (!mapping) return false;
  if (mapping.verified) return true; // Already verified

  // Check code and expiration
  if (
    mapping.verificationCode === code &&
    mapping.verificationExpiresAt &&
    mapping.verificationExpiresAt > new Date()
  ) {
    await db
      .update(phoneUserMapping)
      .set({ verified: true, verificationCode: null, verificationExpiresAt: null })
      .where(eq(phoneUserMapping.phoneNumber, normalized));
    return true;
  }

  return false;
}

/**
 * Resend verification code
 */
export async function resendVerificationCode(
  phoneNumber: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalized = normalizePhoneNumber(phoneNumber);
  const verificationCode = generateOTP();
  const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db
    .update(phoneUserMapping)
    .set({ verificationCode, verificationExpiresAt, verified: false })
    .where(eq(phoneUserMapping.phoneNumber, normalized));

  return verificationCode;
}

// ============================================================================
// HARVEST OPERATIONS
// ============================================================================

export async function createHarvest(
  userId: number,
  data: {
    cropName: string;
    quantity: number;
    unit?: string;
    farmId?: number;
  }
): Promise<{ id: number; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get or create farmer profile
  const farmer = await getOrCreateFarmer(userId);

  // Get or create farm
  let farmId = data.farmId;
  if (!farmId) {
    const [farm] = await db
      .select()
      .from(farms)
      .where(eq(farms.userId, userId))
      .limit(1);

    if (farm) {
      farmId = farm.id;
    } else {
      const [newFarm] = await db
        .insert(farms)
        .values({
          userId,
          farmerId: farmer.id,
          farmName: "Default Farm",
          location: "Not specified",
          farmSize: "0",
          farmSizeUnit: "hectares",
        } as any)
        .returning();
      farmId = newFarm.id;
    }
  }

  // Get or create crop
  const [crop] = await db
    .select()
    .from(crops)
    .where(
      and(
        eq(crops.userId, userId),
        eq(crops.farmId, farmId),
        eq(crops.cropName, data.cropName)
      )
    )
    .limit(1);

  let cropId: number;
  if (crop) {
    cropId = crop.id;
  } else {
    const [newCrop] = await db
      .insert(crops)
      .values({
        userId,
        farmId,
        cropName: data.cropName,
        cropVariety: "Standard",
        plantingDate: new Date(),
        expectedHarvestDate: new Date(),
        areaPlanted: "0",
        areaUnit: "hectares",
      } as any)
      .returning();
    cropId = newCrop.id;
  }

  // Create harvest record
  const [harvest] = await db
    .insert(harvests)
    .values({
      userId,
      farmId,
      cropId,
      harvestDate: new Date(),
      quantity: data.quantity,
      unit: data.unit || "kg",
      quality: "Good",
    } as any)
    .returning();

  return {
    id: harvest.id,
    message: `Harvest recorded: ${data.cropName} ${data.quantity}${data.unit || "kg"}`,
  };
}

export async function getRecentHarvests(
  userId: number,
  limit: number = 5
): Promise<Array<{ cropName: string; quantity: number; unit: string; date: Date }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      cropName: crops.cropName,
      quantity: sql<number>`CAST(${harvests.quantity} AS INTEGER)`,
      unit: harvests.unit,
      date: harvests.harvestDate,
    })
    .from(harvests)
    .innerJoin(crops, eq(harvests.cropId, crops.id))
    .where(eq(harvests.userId, userId))
    .orderBy(desc(harvests.harvestDate))
    .limit(limit);

  return results;
}

// ============================================================================
// EXPENSE OPERATIONS
// ============================================================================

export async function createExpense(
  userId: number,
  data: {
    type: string;
    amount: number;
    description?: string;
    farmId?: number;
  }
): Promise<{ id: number; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get or create farmer profile
  const farmer = await getOrCreateFarmer(userId);

  // Get or create farm
  let farmId = data.farmId;
  if (!farmId) {
    const [farm] = await db
      .select()
      .from(farms)
      .where(eq(farms.userId, userId))
      .limit(1);

    if (farm) {
      farmId = farm.id;
    } else {
      const [newFarm] = await db
        .insert(farms)
        .values({
          userId,
          farmerId: farmer.id,
          farmName: "Default Farm",
          location: "Not specified",
          farmSize: "0",
          farmSizeUnit: "hectares",
        } as any)
        .returning();
      farmId = newFarm.id;
    }
  }

  // Create expense record
  const [expense] = await db
    .insert(expenses)
    .values({
      userId,
      farmId,
      expenseDate: new Date(),
      category: data.type,
      amount: data.amount,
      description: data.description || data.type,
      paymentMethod: "Cash",
    } as any)
    .returning();

  return {
    id: expense.id,
    message: `Expense recorded: ${data.type} ₦${data.amount}`,
  };
}

export async function getRecentExpenses(
  userId: number,
  limit: number = 5
): Promise<Array<{ category: string; amount: number; date: Date }>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      category: expenses.category,
      amount: expenses.amount,
      date: expenses.expenseDate,
    })
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.expenseDate))
    .limit(limit);

  return results;
}

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

export async function getFinancialSummary(
  userId: number,
  period: "week" | "month" | "year" = "month"
): Promise<{
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  period: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  let periodLabel: string;

  switch (period) {
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      periodLabel = "This Week";
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      periodLabel = "This Year";
      break;
    case "month":
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      periodLabel = "This Month";
  }

  // Calculate total expenses
  const expenseResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, startDate)
      )
    );

  const totalExpenses = Number(expenseResult[0]?.total || 0);

  // Calculate total revenue from completed orders
  const revenueResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(${marketplaceOrders.totalAmount}), 0)`,
    })
    .from(marketplaceOrders)
    .where(
      and(
        eq(marketplaceOrders.sellerId, userId),
        eq(marketplaceOrders.status, "completed"),
        gte(marketplaceOrders.createdAt, startDate)
      )
    );

  const totalRevenue = Number(revenueResult[0]?.total || 0);

  return {
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    period: periodLabel,
  };
}

// ============================================================================
// MARKETPLACE OPERATIONS
// ============================================================================

export async function createListing(
  userId: number,
  data: {
    cropName: string;
    quantity: number;
    pricePerKg: number;
    description?: string;
  }
): Promise<{ id: number; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const totalPrice = data.quantity * data.pricePerKg;
  const [listing] = await db
    .insert(produceListings)
    .values({
      userId,
      title: data.cropName,
      description: data.description || `Fresh ${data.cropName} for sale`,
      category: "crops",
      quantity: data.quantity,
      unit: "kg",
      pricePerUnit: data.pricePerKg,
      totalPrice,
      location: { address: "Nigeria" },
      status: "active",
    })
    .returning();

  return {
    id: listing.id,
    message: `Listing created: ${data.cropName} ${data.quantity}kg at ₦${data.pricePerKg}/kg`,
  };
}

export async function getMarketplaceListings(
  limit: number = 10,
  offset: number = 0
): Promise<
  Array<{
    id: number;
    title: string;
    quantity: number;
    unit: string;
    pricePerUnit: number;
    sellerName: string;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      id: produceListings.id,
      title: produceListings.title,
      quantity: produceListings.quantity,
      unit: produceListings.unit,
      pricePerUnit: produceListings.pricePerUnit,
      sellerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(produceListings)
    .innerJoin(users, eq(produceListings.userId, users.id))
    .where(eq(produceListings.status, "active"))
    .orderBy(desc(produceListings.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

export async function getListingById(
  listingId: number
): Promise<{
  id: number;
  title: string;
  description: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  sellerName: string;
  sellerPhone: string;
} | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .select({
      id: produceListings.id,
      title: produceListings.title,
      description: produceListings.description,
      quantity: produceListings.quantity,
      unit: produceListings.unit,
      pricePerUnit: produceListings.pricePerUnit,
      sellerName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
      userId: produceListings.userId,
    })
    .from(produceListings)
    .innerJoin(users, eq(produceListings.userId, users.id))
    .where(eq(produceListings.id, listingId))
    .limit(1);

  if (!result) return null;

  // Get seller phone
  const [phoneMapping] = await db
    .select()
    .from(phoneUserMapping)
    .where(eq(phoneUserMapping.userId, result.userId))
    .limit(1);

  return {
    ...result,
    description: result.description || "",
    sellerPhone: phoneMapping?.phoneNumber || "N/A",
  };
}

export async function createOrder(
  buyerUserId: number,
  data: {
    listingId: number;
    quantity: number;
    deliveryAddress: string;
  }
): Promise<{ id: number; message: string; totalAmount: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get listing details
  const [listing] = await db
    .select()
    .from(produceListings)
    .where(eq(produceListings.id, data.listingId))
    .limit(1);

  if (!listing) {
    throw new Error("Listing not found");
  }

  if (listing.quantity < data.quantity) {
    throw new Error("Insufficient quantity available");
  }

  const totalAmount = listing.pricePerUnit * data.quantity;

  // Create order
  const [order] = await db
    .insert(marketplaceOrders)
    .values({
      buyerId: buyerUserId,
      sellerId: listing.userId,
      orderNumber: `ORD-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      totalAmount,
      deliveryAddress: data.deliveryAddress as any,
      status: "pending",
      paymentStatus: "pending",
    } as any)
    .returning();

  // Create order item
  await db
    .insert(orderItems)
    .values({
      orderId: order.id,
      listingId: data.listingId,
      quantity: data.quantity,
      pricePerUnit: listing.pricePerUnit,
      totalPrice: totalAmount,
      productTitle: listing.title,
      productUnit: listing.unit,
    } as any);

  // Update listing quantity
  await db
    .update(produceListings)
    .set({ quantity: listing.quantity - data.quantity })
    .where(eq(produceListings.id, data.listingId));

  return {
    id: order.id,
    message: `Order placed successfully! Total: ₦${totalAmount}`,
    totalAmount,
  };
}

export async function getMyOrders(
  userId: number,
  limit: number = 10
): Promise<
  Array<{
    id: number;
    listingTitle: string;
    quantity: number;
    totalAmount: number;
    status: string;
    date: Date;
  }>
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const results = await db
    .select({
      id: marketplaceOrders.id,
      listingTitle: sql<string>`'Order'`,
      quantity: sql<number>`1`,
      totalAmount: marketplaceOrders.totalAmount,
      status: marketplaceOrders.status,
      date: marketplaceOrders.createdAt,
    })
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.buyerId, userId))
    .orderBy(desc(marketplaceOrders.createdAt))
    .limit(limit);

  return results;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getOrCreateFarmer(userId: number): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [farmer] = await db
    .select()
    .from(farmers)
    .where(eq(farmers.userId, userId))
    .limit(1);

  if (farmer) return farmer;

  // Get user info
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Create farmer profile
  const [newFarmer] = await db
    .insert(farmers)
    .values({
      userId,
      firstName: user?.firstName || "Farmer",
      lastName: user?.lastName || "",
      phoneNumber: "N/A",
      address: "Not specified",
      village: "Not specified",
      district: "Not specified",
      region: "Not specified",
    } as any)
    .returning();

  return newFarmer;
}

function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, "");

  // Handle Nigerian numbers
  if (normalized.startsWith("234")) {
    // Already has country code
    return `+${normalized}`;
  } else if (normalized.startsWith("0")) {
    // Local format (0801234567 → +2348012345678)
    return `+234${normalized.substring(1)}`;
  } else if (normalized.length === 10) {
    // Without leading zero (8012345678 → +2348012345678)
    return `+234${normalized}`;
  }

  // Return as-is with + prefix
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}
