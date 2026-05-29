/**
 * Comprehensive Test Suite for Messaging Services
 * 
 * Tests all USSD/SMS/WhatsApp functionality including:
 * - User authentication and registration
 * - Harvest recording
 * - Expense tracking
 * - Marketplace operations
 * - Financial reports
 * - Order management
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb } from "../db.js";
import { users, phoneUserMapping } from "../../drizzle/schema.js";
import { eq, sql } from "drizzle-orm";
import * as MessagingService from "../services/messaging-service.js";

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

describe("Messaging Service - Authentication", () => {
  let testUserId: number;
  const testPhone = "+2348012345678";
  const testName = "Test Farmer";

  beforeAll(async () => {
    // Clean up test data before tests
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, testPhone));
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
  });

  afterAll(async () => {
    // Clean up test data after all tests
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, testPhone));
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
  });

  it("should register new user by phone number", async () => {
    const result = await MessagingService.registerUserByPhone(testPhone, testName);
    
    expect(result).toHaveProperty("userId");
    expect(result).toHaveProperty("verificationCode");
    expect(result.verificationCode).toMatch(/^\d{6}$/);
    
    testUserId = result.userId;
  });

  it("should prevent duplicate phone registration", async () => {
    await expect(
      MessagingService.registerUserByPhone(testPhone, testName)
    ).rejects.toThrow("Phone number already registered");
  });

  it("should get user ID by phone number", async () => {
    const userId = await MessagingService.getUserByPhone(testPhone);
    expect(userId).toBe(testUserId);
  });

  it("should return null for unregistered phone", async () => {
    // Use a timestamp-based unique phone number that definitely doesn't exist
    const uniquePhone = `+234${Date.now().toString().slice(-10)}`;
    const userId = await MessagingService.getUserByPhone(uniquePhone);
    expect(userId).toBeNull();
  });

  it("should verify phone number with correct OTP", async () => {
    // Get verification code
    const code = await MessagingService.resendVerificationCode(testPhone);
    
    // Verify with code
    const verified = await MessagingService.verifyPhoneNumber(testPhone, code);
    expect(verified).toBe(true);
  });

  it("should reject invalid verification code", async () => {
    // First ensure there's a fresh verification code (not already verified)
    await MessagingService.resendVerificationCode(testPhone);
    const verified = await MessagingService.verifyPhoneNumber(testPhone, "000000");
    expect(verified).toBe(false);
  });

  it("should normalize phone numbers correctly", async () => {
    // Test various formats
    const formats = [
      "+2348012345678",
      "2348012345678",
      "08012345678",
      "8012345678",
    ];

    // All should resolve to same user
    for (const format of formats) {
      const userId = await MessagingService.getUserByPhone(format);
      expect(userId).toBe(testUserId);
    }
  });
});

describe("Messaging Service - Harvest Operations", () => {
  let testUserId: number;
  const testPhone = "+2348011111111";

  beforeAll(async () => {
    // Clean up before creating test user
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, testPhone));
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
    
    // Create test user
    const result = await MessagingService.registerUserByPhone(
      testPhone,
      "Harvest Test User"
    );
    testUserId = result.userId;
    await MessagingService.verifyPhoneNumber(testPhone, result.verificationCode);
  });

  afterAll(async () => {
    // Clean up test data
    const db = await getDb();
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should create harvest record", async () => {
    const result = await MessagingService.createHarvest(testUserId, {
      cropName: "Maize",
      quantity: 100,
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("message");
    expect(result.message).toContain("Maize");
    expect(result.message).toContain("100");
  });

  it("should create harvest with custom unit", async () => {
    const result = await MessagingService.createHarvest(testUserId, {
      cropName: "Rice",
      quantity: 50,
      unit: "bags",
    });

    expect(result.message).toContain("Rice");
    expect(result.message).toContain("50");
    expect(result.message).toContain("bags");
  });

  it("should retrieve recent harvests", async () => {
    const harvests = await MessagingService.getRecentHarvests(testUserId, 5);

    expect(Array.isArray(harvests)).toBe(true);
    expect(harvests.length).toBeGreaterThan(0);
    expect(harvests[0]).toHaveProperty("cropName");
    expect(harvests[0]).toHaveProperty("quantity");
    expect(harvests[0]).toHaveProperty("unit");
    expect(harvests[0]).toHaveProperty("date");
  });

  it("should handle multiple harvests for same crop", async () => {
    await MessagingService.createHarvest(testUserId, {
      cropName: "Beans",
      quantity: 30,
    });

    await MessagingService.createHarvest(testUserId, {
      cropName: "Beans",
      quantity: 40,
    });

    const harvests = await MessagingService.getRecentHarvests(testUserId, 10);
    const beansHarvests = harvests.filter((h) => h.cropName === "Beans");
    
    expect(beansHarvests.length).toBe(2);
  });
});

describe("Messaging Service - Expense Operations", () => {
  let testUserId: number;
  const testPhone = "+2348022222222";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, testPhone));
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
    
    const result = await MessagingService.registerUserByPhone(
      testPhone,
      "Expense Test User"
    );
    testUserId = result.userId;
    await MessagingService.verifyPhoneNumber(testPhone, result.verificationCode);
  });

  afterAll(async () => {
    const db = await getDb();
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should create expense record", async () => {
    const result = await MessagingService.createExpense(testUserId, {
      type: "Seeds",
      amount: 5000,
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("message");
    expect(result.message).toContain("Seeds");
    expect(result.message).toContain("5000");
  });

  it("should create expense with description", async () => {
    const result = await MessagingService.createExpense(testUserId, {
      type: "Fertilizer",
      amount: 10000,
      description: "NPK fertilizer for maize farm",
    });

    expect(result.message).toContain("Fertilizer");
    expect(result.message).toContain("10000");
  });

  it("should retrieve recent expenses", async () => {
    const expenses = await MessagingService.getRecentExpenses(testUserId, 5);

    expect(Array.isArray(expenses)).toBe(true);
    expect(expenses.length).toBeGreaterThan(0);
    expect(expenses[0]).toHaveProperty("category");
    expect(expenses[0]).toHaveProperty("amount");
    expect(expenses[0]).toHaveProperty("date");
  });

  it("should handle various expense categories", async () => {
    const categories = ["Labor", "Equipment", "Transportation", "Other"];

    for (const category of categories) {
      const result = await MessagingService.createExpense(testUserId, {
        type: category,
        amount: 1000,
      });
      expect(result.message).toContain(category);
    }

    const expenses = await MessagingService.getRecentExpenses(testUserId, 10);
    expect(expenses.length).toBeGreaterThanOrEqual(categories.length);
  });
});

describe("Messaging Service - Financial Reports", () => {
  let testUserId: number;
  const testPhone = "+2348033333333";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, testPhone));
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
    
    const result = await MessagingService.registerUserByPhone(
      testPhone,
      "Finance Test User"
    );
    testUserId = result.userId;
    await MessagingService.verifyPhoneNumber(testPhone, result.verificationCode);

    // Add some test data
    await MessagingService.createExpense(testUserId, {
      type: "Seeds",
      amount: 5000,
    });
    await MessagingService.createExpense(testUserId, {
      type: "Fertilizer",
      amount: 10000,
    });
  });

  it("should generate monthly financial summary", async () => {
    const summary = await MessagingService.getFinancialSummary(testUserId, "month");

    expect(summary).toHaveProperty("totalRevenue");
    expect(summary).toHaveProperty("totalExpenses");
    expect(summary).toHaveProperty("netProfit");
    expect(summary).toHaveProperty("period");
    expect(summary.period).toBe("This Month");
    expect(summary.totalExpenses).toBeGreaterThanOrEqual(15000);
  });

  it("should generate weekly financial summary", async () => {
    const summary = await MessagingService.getFinancialSummary(testUserId, "week");

    expect(summary.period).toBe("This Week");
    expect(typeof summary.totalRevenue).toBe("number");
    expect(typeof summary.totalExpenses).toBe("number");
    expect(typeof summary.netProfit).toBe("number");
  });

  it("should generate yearly financial summary", async () => {
    const summary = await MessagingService.getFinancialSummary(testUserId, "year");

    expect(summary.period).toBe("This Year");
    expect(summary.totalExpenses).toBeGreaterThanOrEqual(15000);
  });

  it("should calculate net profit correctly", async () => {
    const summary = await MessagingService.getFinancialSummary(testUserId, "month");

    expect(summary.netProfit).toBe(summary.totalRevenue - summary.totalExpenses);
  });

  afterAll(async () => {
    const db = await getDb();
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });
});

describe("Messaging Service - Marketplace Operations", () => {
  let sellerUserId: number;
  let buyerUserId: number;
  let testListingId: number;
  const sellerPhone = "+2348044444444";
  const buyerPhone = "+2348055555555";

  beforeAll(async () => {
    const db = await getDb();
    // Clean up before creating test users
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, sellerPhone));
    await db.delete(users).where(eq(users.email, `${sellerPhone}@phone.local`));
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, buyerPhone));
    await db.delete(users).where(eq(users.email, `${buyerPhone}@phone.local`));
    
    // Create seller
    const sellerResult = await MessagingService.registerUserByPhone(
      sellerPhone,
      "Seller User"
    );
    sellerUserId = sellerResult.userId;
    await MessagingService.verifyPhoneNumber(
      sellerPhone,
      sellerResult.verificationCode
    );

    // Create buyer
    const buyerResult = await MessagingService.registerUserByPhone(
      buyerPhone,
      "Buyer User"
    );
    buyerUserId = buyerResult.userId;
    await MessagingService.verifyPhoneNumber(
      buyerPhone,
      buyerResult.verificationCode
    );
  });

  afterAll(async () => {
    const db = await getDb();
    if (sellerUserId) {
      await db.delete(users).where(eq(users.id, sellerUserId));
    }
    if (buyerUserId) {
      await db.delete(users).where(eq(users.id, buyerUserId));
    }
  });

  it("should create marketplace listing", async () => {
    const result = await MessagingService.createListing(sellerUserId, {
      cropName: "Maize",
      quantity: 100,
      pricePerKg: 50,
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("message");
    expect(result.message).toContain("Maize");
    expect(result.message).toContain("100");
    expect(result.message).toContain("50");

    testListingId = result.id;
  });

  it("should create listing with description", async () => {
    const result = await MessagingService.createListing(sellerUserId, {
      cropName: "Rice",
      quantity: 50,
      pricePerKg: 75,
      description: "Premium quality white rice",
    });

    expect(result.message).toContain("Rice");
  });

  it("should retrieve marketplace listings", async () => {
    const listings = await MessagingService.getMarketplaceListings(10);

    expect(Array.isArray(listings)).toBe(true);
    expect(listings.length).toBeGreaterThan(0);
    expect(listings[0]).toHaveProperty("id");
    expect(listings[0]).toHaveProperty("title");
    expect(listings[0]).toHaveProperty("quantity");
    expect(listings[0]).toHaveProperty("pricePerUnit");
    expect(listings[0]).toHaveProperty("sellerName");
  });

  it("should get listing by ID", async () => {
    const listing = await MessagingService.getListingById(testListingId);

    expect(listing).not.toBeNull();
    expect(listing?.id).toBe(testListingId);
    expect(listing?.title).toContain("Maize");
    expect(listing).toHaveProperty("sellerPhone");
  });

  it("should return null for non-existent listing", async () => {
    const listing = await MessagingService.getListingById(999999);
    expect(listing).toBeNull();
  });

  it("should create order", async () => {
    const result = await MessagingService.createOrder(buyerUserId, {
      listingId: testListingId,
      quantity: 10,
      deliveryAddress: "123 Test Street, Lagos",
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("totalAmount");
    expect(result.totalAmount).toBe(500); // 10kg * 50/kg
  });

  it("should reject order for insufficient quantity", async () => {
    await expect(
      MessagingService.createOrder(buyerUserId, {
        listingId: testListingId,
        quantity: 1000, // More than available
        deliveryAddress: "123 Test Street",
      })
    ).rejects.toThrow("Insufficient quantity available");
  });

  it("should reject order for non-existent listing", async () => {
    await expect(
      MessagingService.createOrder(buyerUserId, {
        listingId: 999999,
        quantity: 10,
        deliveryAddress: "123 Test Street",
      })
    ).rejects.toThrow("Listing not found");
  });

  it("should retrieve buyer orders", async () => {
    const orders = await MessagingService.getMyOrders(buyerUserId, 10);

    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThan(0);
    expect(orders[0]).toHaveProperty("id");
    expect(orders[0]).toHaveProperty("totalAmount");
    expect(orders[0]).toHaveProperty("status");
  });

  it("should update listing quantity after order", async () => {
    // Get initial quantity
    const listingBefore = await MessagingService.getListingById(testListingId);
    const initialQuantity = listingBefore?.quantity || 0;

    // Create order
    await MessagingService.createOrder(buyerUserId, {
      listingId: testListingId,
      quantity: 5,
      deliveryAddress: "456 Test Avenue",
    });

    // Check updated quantity
    const listingAfter = await MessagingService.getListingById(testListingId);
    expect(listingAfter?.quantity).toBe(initialQuantity - 5);
  });
});

describe("Messaging Service - Edge Cases", () => {
  const testPhones = ["+2348066666666", "+2348077777777", "+2348088888888"];

  beforeAll(async () => {
    const db = await getDb();
    for (const phone of testPhones) {
      await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, phone));
      await db.delete(users).where(eq(users.email, `${phone}@phone.local`));
    }
  });

  afterAll(async () => {
    const db = await getDb();
    for (const phone of testPhones) {
      await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, phone));
      await db.delete(users).where(eq(users.email, `${phone}@phone.local`));
    }
  });

  it("should handle empty phone number", async () => {
    const userId = await MessagingService.getUserByPhone("");
    expect(userId).toBeNull();
  });

  it("should handle invalid phone formats gracefully", async () => {
    const userId = await MessagingService.getUserByPhone("invalid");
    expect(userId).toBeNull();
  });

  it("should handle zero quantity harvest", async () => {
    const result = await MessagingService.registerUserByPhone(
      "+2348066666666",
      "Edge Case User"
    );
    const userId = result.userId;

    const harvest = await MessagingService.createHarvest(userId, {
      cropName: "Test",
      quantity: 0,
    });

    expect(harvest).toHaveProperty("id");
  });

  it("should handle negative expense amount", async () => {
    const result = await MessagingService.registerUserByPhone(
      "+2348077777777",
      "Negative Test User"
    );
    const userId = result.userId;

    const expense = await MessagingService.createExpense(userId, {
      type: "Test",
      amount: -1000,
    });

    expect(expense).toHaveProperty("id");
  });

  it("should handle very long crop names", async () => {
    const result = await MessagingService.registerUserByPhone(
      "+2348088888888",
      "Long Name User"
    );
    const userId = result.userId;

    // Crop names are limited to 100 characters in the database
    // This test verifies that very long names are rejected
    const longName = "A".repeat(200);
    
    await expect(
      MessagingService.createHarvest(userId, {
        cropName: longName,
        quantity: 10,
      })
    ).rejects.toThrow();
  });
});

describe("Messaging Service - Performance", () => {
  let testUserId: number;
  const testPhone = "+2348099999999";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(phoneUserMapping).where(eq(phoneUserMapping.phoneNumber, testPhone));
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
    
    const result = await MessagingService.registerUserByPhone(
      testPhone,
      "Performance Test User"
    );
    testUserId = result.userId;
    await MessagingService.verifyPhoneNumber(testPhone, result.verificationCode);
  });

  afterAll(async () => {
    const db = await getDb();
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should handle bulk harvest creation", async () => {
    const startTime = Date.now();

    for (let i = 0; i < 10; i++) {
      await MessagingService.createHarvest(testUserId, {
        cropName: `Crop${i}`,
        quantity: i * 10,
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in reasonable time (< 5 seconds)
    expect(duration).toBeLessThan(5000);
  });

  it("should handle bulk expense creation", async () => {
    const startTime = Date.now();

    for (let i = 0; i < 10; i++) {
      await MessagingService.createExpense(testUserId, {
        type: `Expense${i}`,
        amount: i * 1000,
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(5000);
  });

  it("should retrieve large result sets efficiently", async () => {
    const startTime = Date.now();

    const harvests = await MessagingService.getRecentHarvests(testUserId, 100);
    const expenses = await MessagingService.getRecentExpenses(testUserId, 100);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(2000);
    expect(Array.isArray(harvests)).toBe(true);
    expect(Array.isArray(expenses)).toBe(true);
  });
});
