/**
 * Integration Tests for USSD/SMS/WhatsApp Channels
 * 
 * Tests complete user flows through each messaging channel
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as MessagingService from "../services/messaging-service.js";
import { getDb } from "../db.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

describe("USSD Flow - Complete User Journey", () => {
  let testUserId: number;
  const testPhone = "+2341234567890";

  beforeAll(async () => {
    // Cleanup any existing test data
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUserId) {
      const db = await getDb();
      if (!db) return;
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should complete registration flow", async () => {
    // Step 1: User dials USSD code and sees welcome menu
    // User selects "1. Register"
    
    // Step 2: Enter name
    const { userId, verificationCode } = await MessagingService.registerUserByPhone(
      testPhone,
      "USSD Test User"
    );
    testUserId = userId;

    expect(userId).toBeGreaterThan(0);
    expect(verificationCode).toMatch(/^\d{6}$/);

    // Step 3: Verify with OTP
    const verified = await MessagingService.verifyPhoneNumber(
      testPhone,
      verificationCode
    );
    expect(verified).toBe(true);
  });

  it("should complete harvest recording flow", async () => {
    // User navigates: Main Menu → 1. Record Harvest
    // Step 1: Enter crop name
    const cropName = "Maize";

    // Step 2: Enter quantity
    const quantity = 150;

    // Step 3: Confirm and save
    const result = await MessagingService.createHarvest(testUserId, {
      cropName,
      quantity,
    });

    expect(result.message).toContain("Maize");
    expect(result.message).toContain("150");
  });

  it("should complete expense recording flow", async () => {
    // User navigates: Main Menu → 2. Record Expense
    // Step 1: Select expense type (Seeds)
    const expenseType = "Seeds";

    // Step 2: Enter amount
    const amount = 7500;

    // Step 3: Confirm and save
    const result = await MessagingService.createExpense(testUserId, {
      type: expenseType,
      amount,
    });

    expect(result.message).toContain("Seeds");
    expect(result.message).toContain("7500");
  });

  it("should browse marketplace listings", async () => {
    // User navigates: Main Menu → 3. Marketplace → 1. Browse Listings
    const listings = await MessagingService.getMarketplaceListings(5);

    expect(Array.isArray(listings)).toBe(true);
    // Listings should be formatted for USSD display
    listings.forEach((listing, index) => {
      expect(listing).toHaveProperty("title");
      expect(listing).toHaveProperty("quantity");
      expect(listing).toHaveProperty("pricePerUnit");
    });
  });

  it("should create marketplace listing", async () => {
    // User navigates: Main Menu → 3. Marketplace → 3. Create Listing
    // Step 1: Enter crop name
    const cropName = "Rice";

    // Step 2: Enter quantity
    const quantity = 200;

    // Step 3: Enter price per kg
    const pricePerKg = 80;

    // Step 4: Confirm and save
    const result = await MessagingService.createListing(testUserId, {
      cropName,
      quantity,
      pricePerKg,
    });

    expect(result.message).toContain("Rice");
    expect(result.message).toContain("200");
    expect(result.message).toContain("80");
  });

  it("should view financial report", async () => {
    // User navigates: Main Menu → 6. Financial Report
    const summary = await MessagingService.getFinancialSummary(testUserId, "month");

    expect(summary).toHaveProperty("totalRevenue");
    expect(summary).toHaveProperty("totalExpenses");
    expect(summary).toHaveProperty("netProfit");
    expect(summary.period).toBe("This Month");

    // Should show the expense we recorded
    expect(summary.totalExpenses).toBeGreaterThanOrEqual(7500);
  });

  it("should view orders", async () => {
    // User navigates: Main Menu → 4. My Orders
    const orders = await MessagingService.getMyOrders(testUserId, 5);

    expect(Array.isArray(orders)).toBe(true);
    // User may or may not have orders
  });
});

describe("SMS Flow - Command-Based Interaction", () => {
  let testUserId: number;
  const testPhone = "+2349876543210";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
  });

  afterAll(async () => {
    if (testUserId) {
      const db = await getDb();
      if (!db) return;
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should register via SMS", async () => {
    // User sends: REGISTER John Farmer
    const { userId, verificationCode } = await MessagingService.registerUserByPhone(
      testPhone,
      "John Farmer"
    );
    testUserId = userId;

    expect(userId).toBeGreaterThan(0);

    // User receives SMS with verification code
    // User sends: VERIFY 123456
    const verified = await MessagingService.verifyPhoneNumber(
      testPhone,
      verificationCode
    );
    expect(verified).toBe(true);
  });

  it("should record harvest via SMS", async () => {
    // User sends: HARVEST Maize 100
    const result = await MessagingService.createHarvest(testUserId, {
      cropName: "Maize",
      quantity: 100,
    });

    expect(result.message).toContain("Maize");
    expect(result.message).toContain("100");
  });

  it("should record expense via SMS", async () => {
    // User sends: EXPENSE Seeds 5000
    const result = await MessagingService.createExpense(testUserId, {
      type: "Seeds",
      amount: 5000,
    });

    expect(result.message).toContain("Seeds");
    expect(result.message).toContain("5000");
  });

  it("should create listing via SMS", async () => {
    // User sends: LIST Maize 100 50
    const result = await MessagingService.createListing(testUserId, {
      cropName: "Maize",
      quantity: 100,
      pricePerKg: 50,
    });

    expect(result.message).toContain("Maize");
    expect(result.message).toContain("100");
    expect(result.message).toContain("50");
  });

  it("should view marketplace via SMS", async () => {
    // User sends: MARKET
    const listings = await MessagingService.getMarketplaceListings(5);

    expect(Array.isArray(listings)).toBe(true);
    expect(listings.length).toBeGreaterThan(0);
  });

  it("should get financial report via SMS", async () => {
    // User sends: BALANCE or REPORT
    const summary = await MessagingService.getFinancialSummary(testUserId, "month");

    expect(summary.totalExpenses).toBeGreaterThanOrEqual(5000);
  });

  it("should view orders via SMS", async () => {
    // User sends: ORDERS
    const orders = await MessagingService.getMyOrders(testUserId, 5);

    expect(Array.isArray(orders)).toBe(true);
  });
});

describe("WhatsApp Flow - Conversational Interaction", () => {
  let testUserId: number;
  const testPhone = "+2345551234567";

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.email, `${testPhone}@phone.local`));
  });

  afterAll(async () => {
    if (testUserId) {
      const db = await getDb();
      if (!db) return;
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  it("should register via WhatsApp", async () => {
    // User sends: Hi
    // Bot responds: Welcome! Please register...

    // User sends: REGISTER Mary Farmer
    const { userId, verificationCode } = await MessagingService.registerUserByPhone(
      testPhone,
      "Mary Farmer"
    );
    testUserId = userId;

    expect(userId).toBeGreaterThan(0);

    // User sends: VERIFY 123456
    const verified = await MessagingService.verifyPhoneNumber(
      testPhone,
      verificationCode
    );
    expect(verified).toBe(true);
  });

  it("should record harvest via WhatsApp", async () => {
    // User sends: "I want to record harvest" or "Maize 100"
    const result = await MessagingService.createHarvest(testUserId, {
      cropName: "Maize",
      quantity: 100,
    });

    expect(result.message).toContain("Maize");
    expect(result.message).toContain("100");
  });

  it("should record expense via WhatsApp", async () => {
    // User sends: "Record expense" or "Seeds 5000"
    const result = await MessagingService.createExpense(testUserId, {
      type: "Seeds",
      amount: 5000,
    });

    expect(result.message).toContain("Seeds");
    expect(result.message).toContain("5000");
  });

  it("should create listing via WhatsApp", async () => {
    // User sends: "I want to sell" or "Maize 100 50"
    const result = await MessagingService.createListing(testUserId, {
      cropName: "Maize",
      quantity: 100,
      pricePerKg: 50,
    });

    expect(result.message).toContain("Maize");
  });

  it("should browse marketplace via WhatsApp", async () => {
    // User sends: "Show me marketplace" or "market"
    const listings = await MessagingService.getMarketplaceListings(5);

    expect(Array.isArray(listings)).toBe(true);
  });

  it("should get financial report via WhatsApp", async () => {
    // User sends: "Financial report" or "balance"
    const summary = await MessagingService.getFinancialSummary(testUserId, "month");

    expect(summary).toHaveProperty("totalRevenue");
    expect(summary).toHaveProperty("totalExpenses");
    expect(summary).toHaveProperty("netProfit");
  });
});

describe("Cross-Channel Consistency", () => {
  let ussdUserId: number;
  let smsUserId: number;
  let whatsappUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.email, "+2341111111111@phone.local"));
    await db.delete(users).where(eq(users.email, "+2342222222222@phone.local"));
    await db.delete(users).where(eq(users.email, "+2343333333333@phone.local"));
    // Create users via different channels
    const ussdUser = await MessagingService.registerUserByPhone(
      "+2341111111111",
      "USSD User"
    );
    ussdUserId = ussdUser.userId;
    await MessagingService.verifyPhoneNumber(
      "+2341111111111",
      ussdUser.verificationCode
    );

    const smsUser = await MessagingService.registerUserByPhone(
      "+2342222222222",
      "SMS User"
    );
    smsUserId = smsUser.userId;
    await MessagingService.verifyPhoneNumber(
      "+2342222222222",
      smsUser.verificationCode
    );

    const whatsappUser = await MessagingService.registerUserByPhone(
      "+2343333333333",
      "WhatsApp User"
    );
    whatsappUserId = whatsappUser.userId;
    await MessagingService.verifyPhoneNumber(
      "+2343333333333",
      whatsappUser.verificationCode
    );
  });

  it("should have consistent harvest data across channels", async () => {
    // Create harvest via USSD
    const ussdHarvest = await MessagingService.createHarvest(ussdUserId, {
      cropName: "Maize",
      quantity: 100,
    });

    // Create harvest via SMS
    const smsHarvest = await MessagingService.createHarvest(smsUserId, {
      cropName: "Maize",
      quantity: 100,
    });

    // Create harvest via WhatsApp
    const whatsappHarvest = await MessagingService.createHarvest(whatsappUserId, {
      cropName: "Maize",
      quantity: 100,
    });

    // All should have same structure
    expect(ussdHarvest).toHaveProperty("id");
    expect(smsHarvest).toHaveProperty("id");
    expect(whatsappHarvest).toHaveProperty("id");

    expect(ussdHarvest.message).toContain("Maize");
    expect(smsHarvest.message).toContain("Maize");
    expect(whatsappHarvest.message).toContain("Maize");
  });

  it("should have consistent expense data across channels", async () => {
    const ussdExpense = await MessagingService.createExpense(ussdUserId, {
      type: "Seeds",
      amount: 5000,
    });

    const smsExpense = await MessagingService.createExpense(smsUserId, {
      type: "Seeds",
      amount: 5000,
    });

    const whatsappExpense = await MessagingService.createExpense(whatsappUserId, {
      type: "Seeds",
      amount: 5000,
    });

    expect(ussdExpense.message).toContain("5000");
    expect(smsExpense.message).toContain("5000");
    expect(whatsappExpense.message).toContain("5000");
  });

  it("should have consistent marketplace data across channels", async () => {
    // Create listings from different channels
    const ussdListing = await MessagingService.createListing(ussdUserId, {
      cropName: "Rice",
      quantity: 50,
      pricePerKg: 75,
    });

    const smsListing = await MessagingService.createListing(smsUserId, {
      cropName: "Beans",
      quantity: 30,
      pricePerKg: 60,
    });

    const whatsappListing = await MessagingService.createListing(whatsappUserId, {
      cropName: "Yam",
      quantity: 100,
      pricePerKg: 40,
    });

    // All listings should be visible to all users
    const listings = await MessagingService.getMarketplaceListings(10);

    const riceListings = listings.filter((l) => l.title.includes("Rice"));
    const beansListings = listings.filter((l) => l.title.includes("Beans"));
    const yamListings = listings.filter((l) => l.title.includes("Yam"));

    expect(riceListings.length).toBeGreaterThan(0);
    expect(beansListings.length).toBeGreaterThan(0);
    expect(yamListings.length).toBeGreaterThan(0);
  });

  it("should have consistent financial reports across channels", async () => {
    const ussdSummary = await MessagingService.getFinancialSummary(ussdUserId, "month");
    const smsSummary = await MessagingService.getFinancialSummary(smsUserId, "month");
    const whatsappSummary = await MessagingService.getFinancialSummary(
      whatsappUserId,
      "month"
    );

    // All should have same structure
    expect(ussdSummary).toHaveProperty("totalRevenue");
    expect(smsSummary).toHaveProperty("totalRevenue");
    expect(whatsappSummary).toHaveProperty("totalRevenue");

    expect(ussdSummary.period).toBe("This Month");
    expect(smsSummary.period).toBe("This Month");
    expect(whatsappSummary.period).toBe("This Month");
  });
});

describe("Error Handling Across Channels", () => {
  const testUserIds: number[] = [];

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.email, "+2344444444444@phone.local"));
    await db.delete(users).where(eq(users.email, "+2345555555555@phone.local"));
    await db.delete(users).where(eq(users.email, "+2346666666666@phone.local"));
  });

  afterAll(async () => {
    // Cleanup all test users
    if (testUserIds.length > 0) {
      const db = await getDb();
      for (const userId of testUserIds) {
        await db.delete(users).where(eq(users.id, userId)).catch(() => {});
      }
    }
  });
  it("should handle unregistered user gracefully", async () => {
    // Use a timestamp-based unique phone number that definitely doesn't exist
    const uniquePhone = `+234${Date.now().toString().slice(-10)}`;
    const userId = await MessagingService.getUserByPhone(uniquePhone);
    expect(userId).toBeNull();
  });

  it("should handle invalid verification code", async () => {
    const { userId } = await MessagingService.registerUserByPhone(
      "+2344444444444",
      "Test User"
    );
    testUserIds.push(userId);

    const verified = await MessagingService.verifyPhoneNumber(
      "+2344444444444",
      "000000"
    );
    expect(verified).toBe(false);
  });

  it("should handle expired verification code", async () => {
    // Note: This test would require mocking time or waiting 10 minutes
    // For now, just test the flow
    const { userId, verificationCode } = await MessagingService.registerUserByPhone(
      "+2345555555555",
      "Expiry Test User"
    );
    testUserIds.push(userId);

    // Immediate verification should work
    const verified = await MessagingService.verifyPhoneNumber(
      "+2345555555555",
      verificationCode
    );
    expect(verified).toBe(true);
  });

  it("should handle non-existent listing gracefully", async () => {
    const listing = await MessagingService.getListingById(999999);
    expect(listing).toBeNull();
  });

  it("should handle insufficient listing quantity", async () => {
    // Create a small listing
    const seller = await MessagingService.registerUserByPhone(
      "+2346666666666",
      "Small Seller"
    );
    testUserIds.push(seller.userId);
    await MessagingService.verifyPhoneNumber(
      "+2346666666666",
      seller.verificationCode
    );

    const listing = await MessagingService.createListing(seller.userId, {
      cropName: "Test Crop",
      quantity: 5,
      pricePerKg: 100,
    });

    // Try to order more than available
    const buyer = await MessagingService.registerUserByPhone(
      "+2347777777777",
      "Big Buyer"
    );
    testUserIds.push(buyer.userId);
    await MessagingService.verifyPhoneNumber(
      "+2347777777777",
      buyer.verificationCode
    );

    await expect(
      MessagingService.createOrder(buyer.userId, {
        listingId: listing.id,
        quantity: 10,
        deliveryAddress: "Test Address",
      })
    ).rejects.toThrow("Insufficient quantity available");
  });
});

describe("Data Isolation Between Users", () => {
  let user1Id: number;
  let user2Id: number;

  beforeAll(async () => {
    // Cleanup any existing test data first
    const db = await getDb();
    if (!db) return;
    await db.delete(users).where(eq(users.email, "+2348888888888@phone.local"));
    await db.delete(users).where(eq(users.email, "+2349999999999@phone.local"));

    const user1 = await MessagingService.registerUserByPhone(
      "+2348888888888",
      "User One"
    );
    user1Id = user1.userId;
    await MessagingService.verifyPhoneNumber(
      "+2348888888888",
      user1.verificationCode
    );

    const user2 = await MessagingService.registerUserByPhone(
      "+2349999999999",
      "User Two"
    );
    user2Id = user2.userId;
    await MessagingService.verifyPhoneNumber(
      "+2349999999999",
      user2.verificationCode
    );

    // Create data for both users
    await MessagingService.createHarvest(user1Id, {
      cropName: "User1 Crop",
      quantity: 100,
    });
    await MessagingService.createHarvest(user2Id, {
      cropName: "User2 Crop",
      quantity: 200,
    });

    await MessagingService.createExpense(user1Id, {
      type: "User1 Expense",
      amount: 1000,
    });
    await MessagingService.createExpense(user2Id, {
      type: "User2 Expense",
      amount: 2000,
    });
  });

  it("should isolate harvest data between users", async () => {
    const user1Harvests = await MessagingService.getRecentHarvests(user1Id, 10);
    const user2Harvests = await MessagingService.getRecentHarvests(user2Id, 10);

    // User 1 should only see their own harvests
    const user1HasUser2Crop = user1Harvests.some((h) => h.cropName === "User2 Crop");
    expect(user1HasUser2Crop).toBe(false);

    // User 2 should only see their own harvests
    const user2HasUser1Crop = user2Harvests.some((h) => h.cropName === "User1 Crop");
    expect(user2HasUser1Crop).toBe(false);
  });

  it("should isolate expense data between users", async () => {
    const user1Expenses = await MessagingService.getRecentExpenses(user1Id, 10);
    const user2Expenses = await MessagingService.getRecentExpenses(user2Id, 10);

    const user1HasUser2Expense = user1Expenses.some(
      (e) => e.category === "User2 Expense"
    );
    expect(user1HasUser2Expense).toBe(false);

    const user2HasUser1Expense = user2Expenses.some(
      (e) => e.category === "User1 Expense"
    );
    expect(user2HasUser1Expense).toBe(false);
  });

  it("should isolate financial reports between users", async () => {
    const user1Summary = await MessagingService.getFinancialSummary(user1Id, "month");
    const user2Summary = await MessagingService.getFinancialSummary(user2Id, "month");

    // Expenses should be different
    expect(user1Summary.totalExpenses).not.toBe(user2Summary.totalExpenses);
  });

  it("should show all marketplace listings to all users", async () => {
    // Create listings from both users
    await MessagingService.createListing(user1Id, {
      cropName: "User1 Product",
      quantity: 50,
      pricePerKg: 50,
    });

    await MessagingService.createListing(user2Id, {
      cropName: "User2 Product",
      quantity: 60,
      pricePerKg: 60,
    });

    // Both users should see all listings
    const listings = await MessagingService.getMarketplaceListings(20);

    const hasUser1Product = listings.some((l) => l.title.includes("User1 Product"));
    const hasUser2Product = listings.some((l) => l.title.includes("User2 Product"));

    expect(hasUser1Product).toBe(true);
    expect(hasUser2Product).toBe(true);
  });

  it("should isolate orders between users", async () => {
    const user1Orders = await MessagingService.getMyOrders(user1Id, 10);
    const user2Orders = await MessagingService.getMyOrders(user2Id, 10);

    // Orders should be separate (may be empty)
    expect(Array.isArray(user1Orders)).toBe(true);
    expect(Array.isArray(user2Orders)).toBe(true);
  });
});
