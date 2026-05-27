import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "../db.js";
import { pushChanges, pullChanges } from "../sync-router.js";
import * as schema from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

describe("Sync Functionality", () => {
  let testUserId: number;
  let testFarmerId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create a test user
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `test-sync-${Date.now()}@example.com`,
        password: "hashedpassword",
        firstName: "Test",
        lastName: "User",
        role: "farmer",
        isActive: true,
      })
      .returning();
    testUserId = user.id;

    // Create a test farmer
    const [farmer] = await db
      .insert(schema.farmers)
      .values({
        userId: testUserId,
        firstName: "John",
        lastName: "Doe",
        phone: "+1234567890",
        email: "john.doe@example.com",
        address: "123 Test St",
        city: "Test City",
        state: "Test State",
        country: "Test Country",
        postalCode: "12345",
        farmSize: 10.5,
        farmSizeUnit: "hectares",
        primaryCrops: ["Maize", "Beans"],
        registrationDate: new Date(),
        status: "active",
      })
      .returning();
    testFarmerId = farmer.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    if (testFarmerId) {
      await db.delete(schema.farmers).where(eq(schema.farmers.id, testFarmerId));
    }
    if (testUserId) {
      await db.delete(schema.users).where(eq(schema.users.id, testUserId));
    }
  });

  it("should pull farmers for authenticated user", async () => {
    const result = await pullChanges(
      {
        table: "farmers",
        clientId: "test-client-1",
      },
      testUserId
    );

    expect(result).toHaveProperty("records");
    expect(result).toHaveProperty("serverTime");
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records.length).toBeGreaterThan(0);
    expect(result.records[0]).toHaveProperty("id", testFarmerId);
    expect(result.records[0]).toHaveProperty("userId", testUserId);
  });

  it("should only pull records for the authenticated user", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create another user
    const [otherUser] = await db
      .insert(schema.users)
      .values({
        email: `other-user-${Date.now()}@example.com`,
        password: "hashedpassword",
        firstName: "Other",
        lastName: "User",
        role: "farmer",
        isActive: true,
      })
      .returning();

    // Create a farmer for the other user
    const [otherFarmer] = await db
      .insert(schema.farmers)
      .values({
        userId: otherUser.id,
        firstName: "Jane",
        lastName: "Smith",
        phone: "+9876543210",
        email: "jane.smith@example.com",
        address: "456 Other St",
        city: "Other City",
        state: "Other State",
        country: "Other Country",
        postalCode: "54321",
        farmSize: 5.0,
        farmSizeUnit: "hectares",
        primaryCrops: ["Rice"],
        registrationDate: new Date(),
        status: "active",
      })
      .returning();

    // Pull records for testUserId
    const result = await pullChanges(
      {
        table: "farmers",
        clientId: "test-client-2",
      },
      testUserId
    );

    // Should only get farmers for testUserId, not otherUser
    expect(result.records.every((r: any) => r.userId === testUserId)).toBe(true);
    expect(result.records.some((r: any) => r.id === otherFarmer.id)).toBe(false);

    // Clean up
    await db.delete(schema.farmers).where(eq(schema.farmers.id, otherFarmer.id));
    await db.delete(schema.users).where(eq(schema.users.id, otherUser.id));
  });

  it("should filter by lastSyncTime if provided", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Update the test farmer to ensure it has a recent updatedAt timestamp
    await db
      .update(schema.farmers)
      .set({ updatedAt: new Date() })
      .where(eq(schema.farmers.id, testFarmerId));

    const now = new Date();
    const pastTime = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago

    // Pull with a future lastSyncTime (should get no records)
    const futureResult = await pullChanges(
      {
        table: "farmers",
        lastSyncTime: new Date(now.getTime() + 1000 * 60 * 60), // 1 hour in future
        clientId: "test-client-3",
      },
      testUserId
    );

    expect(futureResult.records.length).toBe(0);

    // Pull with a past lastSyncTime (should get records updated after that time)
    const pastResult = await pullChanges(
      {
        table: "farmers",
        lastSyncTime: pastTime,
        clientId: "test-client-4",
      },
      testUserId
    );

    expect(pastResult.records.length).toBeGreaterThan(0);
  });

  it("should handle unknown table gracefully", async () => {
    await expect(
      pullChanges(
        {
          table: "nonexistent_table",
          clientId: "test-client-5",
        },
        testUserId
      )
    ).rejects.toThrow("Unknown table");
  });
});
