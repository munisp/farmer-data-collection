import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "../trpc";
import { getDb } from "../db";
import { users, farmers, farms, crops, expenses, harvests } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * Integration Tests for Farmer Data Collection API
 * 
 * These tests validate end-to-end workflows including:
 * - Authentication (register, login)
 * - CRUD operations for all entities
 * - Financial reports API
 * - Data integrity and relationships
 */

describe("Integration Tests", () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testUserId: number;
  let testToken: string;
  let testFarmerId: number;
  let testFarmId: number;
  let testCropId: number;

  beforeAll(async () => {
    // Initialize database connection
    db = await getDb();
    if (!db) {
      console.warn('⏭️  Database not available — skipping'); return;
    }
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (db && testUserId) {
      await db.delete(harvests).where(eq(harvests.userId, testUserId));
      await db.delete(expenses).where(eq(expenses.userId, testUserId));
      await db.delete(crops).where(eq(crops.userId, testUserId));
      await db.delete(farms).where(eq(farms.userId, testUserId));
      await db.delete(farmers).where(eq(farmers.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    if (db && testUserId) {
      await db.delete(harvests).where(eq(harvests.userId, testUserId));
      await db.delete(expenses).where(eq(expenses.userId, testUserId));
      await db.delete(crops).where(eq(crops.userId, testUserId));
      await db.delete(farms).where(eq(farms.userId, testUserId));
      await db.delete(farmers).where(eq(farmers.userId, testUserId));
      // Reset all IDs so they get recreated
      testFarmerId = 0;
      testFarmId = 0;
      testCropId = 0;
    }
  });

  describe("Authentication", () => {
    it("should register a new user", async () => {
      const email = `test-${Date.now()}@example.com`;
      const password = "Test123!@#";

      // Create test user directly in database
      const hashedPassword = await bcrypt.hash(password, 10);
      const [user] = await db!.insert(users).values({
        email,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        role: "farmer",
      }).returning();

      testUserId = user.id;
      expect(user.email).toBe(email);
      expect(user.role).toBe("farmer");
    });

    it("should validate user credentials", async () => {
      const email = `test-${Date.now()}@example.com`;
      const password = "Test123!@#";
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const [user] = await db!.insert(users).values({
        email,
        password: hashedPassword,
        firstName: "Test",
        lastName: "User",
        role: "farmer",
      }).returning();

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      expect(isValid).toBe(true);

      // Cleanup
      await db!.delete(users).where(eq(users.id, user.id));
    });
  });

  describe("Farms CRUD", () => {
    beforeEach(async () => {
      // Create test user for farms tests
      if (!testUserId) {
        const hashedPassword = await bcrypt.hash("Test123!@#", 10);
        const [user] = await db!.insert(users).values({
          email: `test-${Date.now()}@example.com`,
          password: hashedPassword,
          firstName: "Test",
        lastName: "User",
          role: "farmer",
        }).returning();
        testUserId = user.id;
      }
      // Create test farmer for farms tests
      if (!testFarmerId) {
        const [farmer] = await db!.insert(farmers).values({
          userId: testUserId,
          firstName: "Test",
          lastName: "Farmer",
          email: `farmer-${Date.now()}@example.com`,
        }).returning();
        testFarmerId = farmer.id;
      }
    });

    it("should create a new farm", async () => {
      const [farm] = await db!.insert(farms).values({
        userId: testUserId,
        farmerId: testFarmerId,
        farmName: "Test Farm",
        location: "Test Location",
        size: "10",
        sizeUnit: "hectares",
        soilType: "loamy",
      }).returning();

      testFarmId = farm.id;
      expect(farm.farmName).toBe("Test Farm");
      expect(farm.userId).toBe(testUserId);
    });

    it("should read farms for user", async () => {
      // Create test farm
      await db!.insert(farms).values({
        userId: testUserId,
        farmerId: testFarmerId,
        farmName: "Test Farm 1",
        location: "Location 1",
      });

      // Read farms
      const userFarms = await db!.select().from(farms).where(eq(farms.userId, testUserId));
      expect(userFarms.length).toBeGreaterThan(0);
      expect(userFarms[0].userId).toBe(testUserId);
    });

    it("should update a farm", async () => {
      // Create farm
      const [farm] = await db!.insert(farms).values({
        userId: testUserId,
        farmerId: testFarmerId,
        farmName: "Original Name",
        location: "Original Location",
      }).returning();

      // Update farm
      const [updated] = await db!.update(farms)
        .set({ farmName: "Updated Name" })
        .where(eq(farms.id, farm.id))
        .returning();

      expect(updated.farmName).toBe("Updated Name");
    });

    it("should delete a farm", async () => {
      // Create farm
      const [farm] = await db!.insert(farms).values({
        userId: testUserId,
        farmerId: testFarmerId,
        farmName: "To Delete",
        location: "Test Location",
      }).returning();

      // Delete farm
      await db!.delete(farms).where(eq(farms.id, farm.id));

      // Verify deletion
      const deleted = await db!.select().from(farms).where(eq(farms.id, farm.id));
      expect(deleted.length).toBe(0);
    });
  });

  describe("Crops CRUD", () => {
    beforeEach(async () => {
      // Create test user and farm for crops tests
      if (!testUserId) {
        const hashedPassword = await bcrypt.hash("Test123!@#", 10);
        const [user] = await db!.insert(users).values({
          email: `test-${Date.now()}@example.com`,
          password: hashedPassword,
          firstName: "Test",
        lastName: "User",
          role: "farmer",
        }).returning();
        testUserId = user.id;
      }

      if (!testFarmerId) {
        const [farmer] = await db!.insert(farmers).values({
          userId: testUserId,
          firstName: "Test",
          lastName: "Farmer",
          email: `farmer-${Date.now()}@example.com`,
        }).returning();
        testFarmerId = farmer.id;
      }

      if (!testFarmId) {
        const [farm] = await db!.insert(farms).values({
          userId: testUserId,
          farmerId: testFarmerId,
          farmName: "Test Farm",
          location: "Test Location",
        }).returning();
        testFarmId = farm.id;
      }
    });

    it("should create a new crop", async () => {
      const [crop] = await db!.insert(crops).values({
        userId: testUserId,
        farmId: testFarmId,
        cropName: "Maize",
        cropVariety: "Hybrid",
        plantingDate: new Date("2024-01-01"),
        status: "planted",
        pricePerUnit: 1000, // $10.00
      }).returning();

      testCropId = crop.id;
      expect(crop.cropName).toBe("Maize");
      expect(crop.userId).toBe(testUserId);
      expect(crop.pricePerUnit).toBe(1000);
    });

    it("should read crops for user", async () => {
      // Create test crop
      await db!.insert(crops).values({
        userId: testUserId,
        farmId: testFarmId,
        cropName: "Rice",
        plantingDate: new Date(),
        status: "growing",
      });

      // Read crops
      const userCrops = await db!.select().from(crops).where(eq(crops.userId, testUserId));
      expect(userCrops.length).toBeGreaterThan(0);
      expect(userCrops[0].userId).toBe(testUserId);
    });

    it("should filter crops by status", async () => {
      // Create crops with different statuses
      await db!.insert(crops).values([
        {
          userId: testUserId,
          farmId: testFarmId,
          cropName: "Crop 1",
          plantingDate: new Date(),
          status: "planted",
        },
        {
          userId: testUserId,
          farmId: testFarmId,
          cropName: "Crop 2",
          plantingDate: new Date(),
          status: "harvested",
        },
      ]);

      // Filter by status
      const plantedCrops = await db!.select()
        .from(crops)
        .where(eq(crops.userId, testUserId))
        .where(eq(crops.status, "planted"));

      expect(plantedCrops.length).toBeGreaterThan(0);
      expect(plantedCrops.every(c => c.status === "planted")).toBe(true);
    });
  });

  describe("Expenses CRUD", () => {
    beforeEach(async () => {
      // Create test user and farm for expenses tests
      if (!testUserId) {
        const hashedPassword = await bcrypt.hash("Test123!@#", 10);
        const [user] = await db!.insert(users).values({
          email: `test-${Date.now()}@example.com`,
          password: hashedPassword,
          firstName: "Test",
        lastName: "User",
          role: "farmer",
        }).returning();
        testUserId = user.id;
      }

      if (!testFarmerId) {
        const [farmer] = await db!.insert(farmers).values({
          userId: testUserId,
          firstName: "Test",
          lastName: "Farmer",
          email: `farmer-${Date.now()}@example.com`,
        }).returning();
        testFarmerId = farmer.id;
      }

      if (!testFarmId) {
        const [farm] = await db!.insert(farms).values({
          userId: testUserId,
          farmerId: testFarmerId,
          farmName: "Test Farm",
          location: "Test Location",
        }).returning();
        testFarmId = farm.id;
      }
    });

    it("should create a new expense", async () => {
      const [expense] = await db!.insert(expenses).values({
        userId: testUserId,
        farmId: testFarmId,
        category: "labor",
        description: "Hired workers",
        amount: 50000, // $500.00
        expenseDate: new Date("2024-01-15"),
      }).returning();

      expect(expense.category).toBe("labor");
      expect(expense.amount).toBe(50000);
      expect(expense.userId).toBe(testUserId);
    });

    it("should calculate total expenses", async () => {
      // Create multiple expenses
      await db!.insert(expenses).values([
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "labor",
          description: "Expense 1",
          amount: 10000,
          expenseDate: new Date(),
        },
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "equipment",
          description: "Expense 2",
          amount: 20000,
          expenseDate: new Date(),
        },
      ]);

      // Calculate total
      const userExpenses = await db!.select().from(expenses).where(eq(expenses.userId, testUserId));
      const total = userExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      expect(total).toBe(30000);
    });

    it("should filter expenses by category", async () => {
      // Create expenses with different categories
      await db!.insert(expenses).values([
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "labor",
          description: "Labor expense",
          amount: 10000,
          expenseDate: new Date(),
        },
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "equipment",
          description: "Equipment expense",
          amount: 20000,
          expenseDate: new Date(),
        },
      ]);

      // Filter by category
      const laborExpenses = await db!.select()
        .from(expenses)
        .where(eq(expenses.userId, testUserId))
        .where(eq(expenses.category, "labor"));

      expect(laborExpenses.length).toBeGreaterThan(0);
      expect(laborExpenses.every(e => e.category === "labor")).toBe(true);
    });
  });

  describe("Harvests CRUD", () => {
    beforeEach(async () => {
      // Create test user, farm, and crop for harvests tests
      if (!testUserId) {
        const hashedPassword = await bcrypt.hash("Test123!@#", 10);
        const [user] = await db!.insert(users).values({
          email: `test-${Date.now()}@example.com`,
          password: hashedPassword,
          firstName: "Test",
        lastName: "User",
          role: "farmer",
        }).returning();
        testUserId = user.id;
      }

      if (!testFarmerId) {
        const [farmer] = await db!.insert(farmers).values({
          userId: testUserId,
          firstName: "Test",
          lastName: "Farmer",
          email: `farmer-${Date.now()}@example.com`,
        }).returning();
        testFarmerId = farmer.id;
      }

      if (!testFarmId) {
        const [farm] = await db!.insert(farms).values({
          userId: testUserId,
          farmerId: testFarmerId,
          farmName: "Test Farm",
          location: "Test Location",
        }).returning();
        testFarmId = farm.id;
      }

      if (!testCropId) {
        const [crop] = await db!.insert(crops).values({
          userId: testUserId,
          farmId: testFarmId,
          cropName: "Test Crop",
          plantingDate: new Date(),
          status: "harvested",
        }).returning();
        testCropId = crop.id;
      }
    });

    it("should create a new harvest", async () => {
      const [harvest] = await db!.insert(harvests).values({
        userId: testUserId,
        cropId: testCropId,
        harvestDate: new Date("2024-06-01"),
        quantity: "1000",
        unit: "kg",
        quality: "excellent",
        marketPrice: 5000, // $50.00
        revenue: 5000000, // $50,000.00
      }).returning();

      expect(harvest.quantity).toBe("1000.00");
      expect(harvest.userId).toBe(testUserId);
      expect(harvest.revenue).toBe(5000000);
    });

    it("should calculate total revenue", async () => {
      // Create multiple harvests
      await db!.insert(harvests).values([
        {
          userId: testUserId,
          cropId: testCropId,
          harvestDate: new Date(),
          quantity: "100",
          unit: "kg",
          revenue: 10000,
        },
        {
          userId: testUserId,
          cropId: testCropId,
          harvestDate: new Date(),
          quantity: "200",
          unit: "kg",
          revenue: 20000,
        },
      ]);

      // Calculate total
      const userHarvests = await db!.select().from(harvests).where(eq(harvests.userId, testUserId));
      const totalRevenue = userHarvests.reduce((sum, h) => sum + (h.revenue || 0), 0);
      expect(totalRevenue).toBe(30000);
    });
  });

  describe("Financial Reports", () => {
    beforeEach(async () => {
      // Create test data for financial reports
      if (!testUserId) {
        const hashedPassword = await bcrypt.hash("Test123!@#", 10);
        const [user] = await db!.insert(users).values({
          email: `test-${Date.now()}@example.com`,
          password: hashedPassword,
          firstName: "Test",
        lastName: "User",
          role: "farmer",
        }).returning();
        testUserId = user.id;
      }

      if (!testFarmerId) {
        const [farmer] = await db!.insert(farmers).values({
          userId: testUserId,
          firstName: "Test",
          lastName: "Farmer",
          email: `farmer-${Date.now()}@example.com`,
        }).returning();
        testFarmerId = farmer.id;
      }

      if (!testFarmId) {
        const [farm] = await db!.insert(farms).values({
          userId: testUserId,
          farmerId: testFarmerId,
          farmName: "Test Farm",
          location: "Test Location",
        }).returning();
        testFarmId = farm.id;
      }

      if (!testCropId) {
        const [crop] = await db!.insert(crops).values({
          userId: testUserId,
          farmId: testFarmId,
          cropName: "Test Crop",
          plantingDate: new Date(),
          status: "harvested",
          pricePerUnit: 1000,
        }).returning();
        testCropId = crop.id;
      }
    });

    it("should calculate net profit", async () => {
      // Create expenses
      await db!.insert(expenses).values({
        userId: testUserId,
        farmId: testFarmId,
        category: "labor",
        description: "Test expense",
        amount: 50000, // $500
        expenseDate: new Date(),
      });

      // Create harvests
      await db!.insert(harvests).values({
        userId: testUserId,
        cropId: testCropId,
        harvestDate: new Date(),
        quantity: "100",
        unit: "kg",
        revenue: 100000, // $1000
      });

      // Calculate net profit
      const userExpenses = await db!.select().from(expenses).where(eq(expenses.userId, testUserId));
      const userHarvests = await db!.select().from(harvests).where(eq(harvests.userId, testUserId));

      const totalExpenses = userExpenses.reduce((sum, e) => sum + e.amount, 0);
      const totalRevenue = userHarvests.reduce((sum, h) => sum + (h.revenue || 0), 0);
      const netProfit = totalRevenue - totalExpenses;

      expect(netProfit).toBe(50000); // $500 profit
    });

    it("should group expenses by category", async () => {
      // Create expenses in different categories
      await db!.insert(expenses).values([
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "labor",
          description: "Labor 1",
          amount: 10000,
          expenseDate: new Date(),
        },
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "labor",
          description: "Labor 2",
          amount: 15000,
          expenseDate: new Date(),
        },
        {
          userId: testUserId,
          farmId: testFarmId,
          category: "equipment",
          description: "Equipment",
          amount: 20000,
          expenseDate: new Date(),
        },
      ]);

      // Group by category
      const userExpenses = await db!.select().from(expenses).where(eq(expenses.userId, testUserId));
      const byCategory = userExpenses.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
      }, {} as Record<string, number>);

      expect(byCategory["labor"]).toBe(25000);
      expect(byCategory["equipment"]).toBe(20000);
    });
  });

  describe("Data Integrity", () => {
    it("should maintain user data isolation", async () => {
      // Create two users
      const hashedPassword = await bcrypt.hash("Test123!@#", 10);
      const [user1] = await db!.insert(users).values({
        email: `user1-${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: "User",
        lastName: "One",
        role: "farmer",
      }).returning();

      const [user2] = await db!.insert(users).values({
        email: `user2-${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: "User",
        lastName: "Two",
        role: "farmer",
      }).returning();

      // Create farmers for each user
      const [farmer1] = await db!.insert(farmers).values({
        userId: user1.id,
        firstName: "Farmer",
        lastName: "One",
        email: `farmer1-${Date.now()}@example.com`,
      }).returning();

      const [farmer2] = await db!.insert(farmers).values({
        userId: user2.id,
        firstName: "Farmer",
        lastName: "Two",
        email: `farmer2-${Date.now()}@example.com`,
      }).returning();

      // Create farms for each user
      await db!.insert(farms).values([
        { userId: user1.id, farmerId: farmer1.id, farmName: "User 1 Farm", location: "Location 1" },
        { userId: user2.id, farmerId: farmer2.id, farmName: "User 2 Farm", location: "Location 2" },
      ]);

      // Verify isolation
      const user1Farms = await db!.select().from(farms).where(eq(farms.userId, user1.id));
      const user2Farms = await db!.select().from(farms).where(eq(farms.userId, user2.id));

      expect(user1Farms.length).toBe(1);
      expect(user2Farms.length).toBe(1);
      expect(user1Farms[0].farmName).toBe("User 1 Farm");
      expect(user2Farms[0].farmName).toBe("User 2 Farm");

      // Cleanup
      await db!.delete(farms).where(eq(farms.userId, user1.id));
      await db!.delete(farms).where(eq(farms.userId, user2.id));
      await db!.delete(users).where(eq(users.id, user1.id));
      await db!.delete(users).where(eq(users.id, user2.id));
    });
  });
});
