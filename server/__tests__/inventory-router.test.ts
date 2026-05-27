import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../trpc.js";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db.js";
import { inventoryItems, inventoryTransactions } from "../../drizzle/financial-schema.js";
import { eq } from "drizzle-orm";

/**
 * Inventory Router Test Suite
 * 
 * Tests inventory transactions, stock movements, valuation methods,
 * reorder points, and transaction integrity.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Cleanup function to remove test data
async function cleanupTestData(userId: number) {
  const db = await getDb();
  if (db) {
    await db.delete(inventoryTransactions).where(eq(inventoryTransactions.userId, userId));
    await db.delete(inventoryItems).where(eq(inventoryItems.userId, userId));
  }
}

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `user${userId}@test.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Inventory Router - Item Management", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
  });
  it("should create inventory item", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.inventory.createItem({
      itemCode: "ITEM001",
      name: "Fertilizer NPK 17-17-17",
      category: "Farm Inputs",
      unit: "kg",
      reorderLevel: 100,
      reorderQuantity: 500,
      unitCost: 150,
      sellingPrice: 200,
    });

    expect(result.success).toBe(true);
    expect(result.itemId).toBeDefined();
  });

  it("should reject duplicate item code", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create first item
    await caller.inventory.createItem({
      itemCode: "ITEM002",
      name: "Seeds - Maize Hybrid",
      category: "Seeds",
      unit: "kg",
      reorderLevel: 50,
      reorderQuantity: 200,
      unitCost: 300,
      sellingPrice: 400,
    });

    // Try to create duplicate
    try {
      await caller.inventory.createItem({
        itemCode: "ITEM002", // Duplicate
        name: "Another Item",
        category: "Other",
        unit: "kg",
        reorderLevel: 10,
        reorderQuantity: 50,
        unitCost: 100,
        sellingPrice: 150,
      });
      expect.fail("Should have thrown error for duplicate item code");
    } catch (error: any) {
      expect(error.message).toContain("already exists");
    }
  });

  it("should list items with filters", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const items = await caller.inventory.getItems({
      category: "Farm Inputs",
    });

    expect(Array.isArray(items)).toBe(true);
    items.forEach((item) => {
      expect(item.category).toBe("Farm Inputs");
    });
  });
});

describe("Inventory Router - Stock Transactions", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
  });
  it("should record stock receipt", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-RECEIPT-001",
      name: "Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    // Record receipt
    const result = await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 100,
      unitCost: 100,
      reference: "PO-001",
      notes: "Initial stock",
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();

    // Verify stock level
    const item = await caller.inventory.getItem({
      itemId: itemResult.itemId!,
    });

    expect(item.currentStock).toBe(100);
  });

  it("should record stock issue", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item with initial stock
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-ISSUE-001",
      name: "Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 100,
      unitCost: 100,
      reference: "PO-002",
    });

    // Issue stock
    const result = await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "issue",
      quantity: 30,
      reference: "SALE-001",
      notes: "Customer sale",
    });

    expect(result.success).toBe(true);

    // Verify stock level
    const item = await caller.inventory.getItem({
      itemId: itemResult.itemId!,
    });

    expect(item.currentStock).toBe(70);
  });

  it("should reject issue when insufficient stock", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item with low stock
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-INSUF-001",
      name: "Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 10,
      unitCost: 100,
      reference: "PO-003",
    });

    // Try to issue more than available
    try {
      await caller.inventory.recordTransaction({
        itemId: itemResult.itemId!,
        type: "issue",
        quantity: 20, // More than available
        reference: "SALE-002",
      });
      expect.fail("Should have thrown error for insufficient stock");
    } catch (error: any) {
      expect(error.message).toContain("insufficient stock");
    }
  });

  it("should record stock adjustment", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item with initial stock
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-ADJ-001",
      name: "Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 100,
      unitCost: 100,
      reference: "PO-004",
    });

    // Adjust stock (physical count)
    const result = await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "adjustment",
      quantity: -5, // Found 5 less than expected
      reference: "ADJ-001",
      notes: "Physical count adjustment",
    });

    expect(result.success).toBe(true);

    // Verify stock level
    const item = await caller.inventory.getItem({
      itemId: itemResult.itemId!,
    });

    expect(item.currentStock).toBe(95);
  });
});

describe("Inventory Router - Valuation Methods", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
  });
  it("should calculate FIFO cost correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-FIFO-001",
      name: "FIFO Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
      valuationMethod: "fifo",
    });

    // Receipt 1: 50 units @ 100
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 50,
      unitCost: 100,
      reference: "PO-FIFO-001",
    });

    // Receipt 2: 50 units @ 120
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 50,
      unitCost: 120,
      reference: "PO-FIFO-002",
    });

    // Issue 60 units (should use 50 @ 100 and 10 @ 120)
    const issueResult = await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "issue",
      quantity: 60,
      reference: "SALE-FIFO-001",
    });

    // Cost should be (50 * 100) + (10 * 120) = 6200
    expect(issueResult.totalCost).toBe(6200);
  });

  it("should calculate weighted average cost correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-AVG-001",
      name: "Average Cost Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
      valuationMethod: "average",
    });

    // Receipt 1: 50 units @ 100
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 50,
      unitCost: 100,
      reference: "PO-AVG-001",
    });

    // Receipt 2: 50 units @ 120
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 50,
      unitCost: 120,
      reference: "PO-AVG-002",
    });

    // Average cost should be (50*100 + 50*120) / 100 = 110
    const item = await caller.inventory.getItem({
      itemId: itemResult.itemId!,
    });

    expect(item.averageCost).toBe(110);
  });
});

describe("Inventory Router - Reorder Alerts", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
  });
  it("should trigger reorder alert when stock below reorder level", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create item with reorder level
    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-REORDER-001",
      name: "Reorder Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 20,
      reorderQuantity: 100,
      unitCost: 100,
      sellingPrice: 150,
    });

    // Add stock below reorder level
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 15, // Below reorder level of 20
      unitCost: 100,
      reference: "PO-REORDER-001",
    });

    // Get reorder alerts
    const alerts = await caller.inventory.getReorderAlerts({});

    const alert = alerts.find((a) => a.itemCode === "ITEM-REORDER-001");
    expect(alert).toBeDefined();
    expect(alert!.currentStock).toBe(15);
    expect(alert!.reorderLevel).toBe(20);
  });

  it("should calculate suggested reorder quantity", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-SUGGEST-001",
      name: "Suggestion Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 20,
      reorderQuantity: 100,
      unitCost: 100,
      sellingPrice: 150,
    });

    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 10,
      unitCost: 100,
      reference: "PO-SUGGEST-001",
    });

    const suggestion = await caller.inventory.getSuggestedReorderQuantity({
      itemId: itemResult.itemId!,
    });

    expect(suggestion.quantity).toBe(100); // Configured reorder quantity
  });
});

describe("Inventory Router - Stock Reports", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
  });
  it("should generate stock valuation report", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const report = await caller.inventory.getStockValuation({});

    expect(Array.isArray(report)).toBe(true);
    report.forEach((item) => {
      expect(item.itemCode).toBeDefined();
      expect(item.currentStock).toBeDefined();
      expect(typeof item.totalValue).toBe("number");
    });
  });

  it("should generate stock movement report", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const report = await caller.inventory.getStockMovements({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });

    expect(Array.isArray(report)).toBe(true);
    report.forEach((movement) => {
      expect(movement.itemCode).toBeDefined();
      expect(movement.type).toBeDefined();
      expect(typeof movement.quantity).toBe("number");
    });
  });

  it("should calculate inventory turnover ratio", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-TURN-001",
      name: "Turnover Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    // Add transactions
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 100,
      unitCost: 100,
      reference: "PO-TURN-001",
    });

    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "issue",
      quantity: 80,
      reference: "SALE-TURN-001",
    });

    const turnover = await caller.inventory.getInventoryTurnover({
      itemId: itemResult.itemId!,
      startDate: "2025-01-01",
      endDate: "2025-12-31",
    });

    expect(typeof turnover.ratio).toBe("number");
    expect(turnover.ratio).toBeGreaterThan(0);
  });
});

describe("Inventory Router - Transaction Integrity", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
  });
  it("should maintain transaction audit trail", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-AUDIT-001",
      name: "Audit Test Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    // Record multiple transactions
    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "receipt",
      quantity: 100,
      unitCost: 100,
      reference: "PO-AUDIT-001",
    });

    await caller.inventory.recordTransaction({
      itemId: itemResult.itemId!,
      type: "issue",
      quantity: 30,
      reference: "SALE-AUDIT-001",
    });

    // Get transaction history
    const history = await caller.inventory.getTransactionHistory({
      itemId: itemResult.itemId!,
    });

    expect(history.length).toBeGreaterThanOrEqual(2);
    history.forEach((txn) => {
      expect(txn.createdBy).toBeDefined();
      expect(txn.createdAt).toBeDefined();
    });
  });

  it("should prevent negative stock", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const itemResult = await caller.inventory.createItem({
      itemCode: "ITEM-NEG-001",
      name: "Negative Stock Test",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    // Try to issue without any stock
    try {
      await caller.inventory.recordTransaction({
        itemId: itemResult.itemId!,
        type: "issue",
        quantity: 10,
        reference: "SALE-NEG-001",
      });
      expect.fail("Should have thrown error for negative stock");
    } catch (error: any) {
      expect(error.message).toContain("insufficient stock");
    }
  });
});

describe("Inventory Router - User Isolation", () => {
  beforeEach(async () => {
    await cleanupTestData(1);
    await cleanupTestData(2);
  });
  it("should isolate inventory by organization", async () => {
    const ctx1 = createAuthContext(1);
    const ctx2 = createAuthContext(2);
    const caller1 = appRouter.createCaller(ctx1);
    const caller2 = appRouter.createCaller(ctx2);

    // User 1 creates item
    await caller1.inventory.createItem({
      itemCode: "ORG1-ITEM-001",
      name: "Org1 Item",
      category: "Test",
      unit: "pcs",
      reorderLevel: 10,
      reorderQuantity: 50,
      unitCost: 100,
      sellingPrice: 150,
    });

    // User 2 should not see User 1's items
    const user2Items = await caller2.inventory.getItems({});

    const org1Item = user2Items.find((i) => i.itemCode === "ORG1-ITEM-001");
    expect(org1Item).toBeUndefined();
  });
});
