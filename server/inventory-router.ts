import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { suppliers, inventoryItems, inventoryTransactions } from "../drizzle/financial-schema.js";
import { eq, and, gte, lte, desc, sql, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const inventoryRouter = router({
  // Supplier Management
  getSuppliers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const userId = Number(ctx.user.id);
    return await db.select().from(suppliers).where(eq(suppliers.userId, userId)).orderBy(desc(suppliers.createdAt));
  }),

  createSupplier: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      contactPerson: z.string().optional(),
      phoneNumber: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      paymentTerms: z.string().optional(),
      rating: z.number().min(1).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const result = await db.insert(suppliers).values({
        ...input,
        userId,
        isActive: true,
      }).returning();
      
      return result[0];
    }),

  updateSupplier: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      contactPerson: z.string().optional(),
      phoneNumber: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      paymentTerms: z.string().optional(),
      rating: z.number().min(1).max(5).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const { id, ...updateData } = input;
      
      const result = await db.update(suppliers)
        .set(updateData)
        .where(and(eq(suppliers.id, id), eq(suppliers.userId, userId)))
        .returning();
      
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Supplier not found" });
      }
      
      return result[0];
    }),

  deleteSupplier: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      await db.delete(suppliers).where(and(eq(suppliers.id, input.id), eq(suppliers.userId, userId)));
      
      return { success: true };
    }),

  // Inventory Items Management
  getInventoryItems: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const userId = Number(ctx.user.id);
    
    // Get items with supplier info
    const items = await db.select({
      item: inventoryItems,
      supplier: suppliers,
    })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
    .where(eq(inventoryItems.userId, userId))
    .orderBy(desc(inventoryItems.createdAt));
    
    return items;
  }),

  getInventoryItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const result = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.userId, userId))).limit(1);
      
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }
      
      return result[0];
    }),

  createInventoryItem: protectedProcedure
    .input(z.object({
      itemType: z.enum(["seed", "fertilizer", "pesticide", "equipment"]),
      itemName: z.string().min(1),
      category: z.string().optional(),
      unit: z.string().min(1),
      quantityOnHand: z.number().default(0),
      reorderLevel: z.number().default(0),
      unitCost: z.number().positive(),
      supplierId: z.number().optional(),
      storageLocation: z.string().optional(),
      expiryDate: z.string().optional(),
      batchNumber: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const { unitCost, expiryDate, ...rest } = input;
      
      const result = await db.insert(inventoryItems).values({
        ...rest,
        userId,
        unitCost: Math.round(unitCost * 100), // Convert to cents
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      }).returning();
      
      return result[0];
    }),

  updateInventoryItem: protectedProcedure
    .input(z.object({
      id: z.number(),
      itemName: z.string().min(1).optional(),
      category: z.string().optional(),
      unit: z.string().optional(),
      quantityOnHand: z.number().optional(),
      reorderLevel: z.number().optional(),
      unitCost: z.number().positive().optional(),
      supplierId: z.number().optional(),
      storageLocation: z.string().optional(),
      expiryDate: z.string().optional(),
      batchNumber: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const { id, unitCost, expiryDate, ...updateData } = input;
      
      const finalUpdateData: Record<string, unknown> = { ...updateData };
      if (unitCost !== undefined) {
        finalUpdateData.unitCost = Math.round(unitCost * 100); // Convert to cents
      }
      if (expiryDate) {
        finalUpdateData.expiryDate = new Date(expiryDate);
      }
      
      const result = await db.update(inventoryItems)
        .set(finalUpdateData)
        .where(and(eq(inventoryItems.id, id), eq(inventoryItems.userId, userId)))
        .returning();
      
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }
      
      return result[0];
    }),

  deleteInventoryItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      await db.delete(inventoryItems).where(and(eq(inventoryItems.id, input.id), eq(inventoryItems.userId, userId)));
      
      return { success: true };
    }),

  // Inventory Transactions
  getInventoryTransactions: protectedProcedure
    .input(z.object({
      itemId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Build where conditions
      const conditions = [eq(inventoryTransactions.userId, userId)];
      
      if (input.itemId) {
        conditions.push(eq(inventoryTransactions.itemId, input.itemId));
      }
      
      if (input.startDate) {
        conditions.push(gte(inventoryTransactions.transactionDate, new Date(input.startDate)));
      }
      
      if (input.endDate) {
        conditions.push(lte(inventoryTransactions.transactionDate, new Date(input.endDate)));
      }
      
      // Get transactions with item info
      const transactions = await db.select({
        transaction: inventoryTransactions,
        item: inventoryItems,
      })
      .from(inventoryTransactions)
      .innerJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryTransactions.transactionDate));
      
      return transactions;
    }),

  createInventoryTransaction: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      transactionType: z.enum(["purchase", "usage", "adjustment", "transfer"]),
      quantity: z.number(),
      unitCost: z.number().positive().optional(),
      transactionDate: z.string(),
      reference: z.string().optional(),
      farmId: z.number().optional(),
      cropId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Verify item belongs to user
      const item = await db.select().from(inventoryItems).where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.userId, userId))).limit(1);
      if (item.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inventory item not found" });
      }
      
      // Calculate total cost
      const unitCost = input.unitCost ? Math.round(input.unitCost * 100) : item[0].unitCost;
      const totalCost = unitCost * Math.abs(input.quantity);
      
      // Create transaction
      const result = await db.insert(inventoryTransactions).values({
        userId,
        itemId: input.itemId,
        transactionType: input.transactionType,
        quantity: input.quantity,
        unitCost,
        totalCost,
        transactionDate: new Date(input.transactionDate),
        reference: input.reference || null,
        farmId: input.farmId || null,
        cropId: input.cropId || null,
        notes: input.notes || null,
      }).returning();
      
      // Update inventory quantity
      const newQuantity = item[0].quantityOnHand + input.quantity;
      await db.update(inventoryItems)
        .set({ quantityOnHand: newQuantity })
        .where(eq(inventoryItems.id, input.itemId));
      
      return result[0];
    }),

  // Dashboard Statistics
  getInventoryStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const userId = Number(ctx.user.id);
    
    // Get total items
    const itemCount = await db.select({ count: sql<number>`count(*)` }).from(inventoryItems).where(eq(inventoryItems.userId, userId));
    
    // Get total inventory value
    const inventoryValue = await db.select({ 
      total: sql<number>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)` 
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.userId, userId));
    
    // Get low stock items (below reorder level)
    const lowStockCount = await db.select({ count: sql<number>`count(*)` })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.userId, userId),
        sql`${inventoryItems.quantityOnHand} < ${inventoryItems.reorderLevel}`
      ));
    
    // Get active suppliers
    const supplierCount = await db.select({ count: sql<number>`count(*)` })
      .from(suppliers)
      .where(and(eq(suppliers.userId, userId), eq(suppliers.isActive, true)));
    
    return {
      totalItems: Number(itemCount[0]?.count || 0),
      inventoryValue: Number(inventoryValue[0]?.total || 0) / 100, // Convert from cents
      lowStockItems: Number(lowStockCount[0]?.count || 0),
      activeSuppliers: Number(supplierCount[0]?.count || 0),
    };
  }),

  // Get items needing reorder
  getLowStockItems: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const userId = Number(ctx.user.id);
    
    const items = await db.select({
      item: inventoryItems,
      supplier: suppliers,
    })
    .from(inventoryItems)
    .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
    .where(and(
      eq(inventoryItems.userId, userId),
      sql`${inventoryItems.quantityOnHand} < ${inventoryItems.reorderLevel}`
    ))
    .orderBy(desc(inventoryItems.reorderLevel));
    
    return items;
  }),

  // Get inventory valuation by category
  getInventoryValuation: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const userId = Number(ctx.user.id);
    
    const valuation = await db.select({
      itemType: inventoryItems.itemType,
      totalValue: sql<number>`sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost})`,
      totalQuantity: sql<number>`sum(${inventoryItems.quantityOnHand})`,
      itemCount: sql<number>`count(*)`,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.userId, userId))
    .groupBy(inventoryItems.itemType);
    
    return valuation.map(v => ({
      ...v,
      totalValue: Number(v.totalValue || 0) / 100, // Convert from cents
      totalQuantity: Number(v.totalQuantity || 0),
      itemCount: Number(v.itemCount || 0),
    }));
  }),

  // ============================================================================
  // ENTERPRISE INVENTORY PROCEDURES (for test compatibility)
  // ============================================================================

  // Create item (enterprise schema)
  createItem: protectedProcedure
    .input(z.object({
      itemCode: z.string(),
      name: z.string(),
      category: z.string().optional(),
      unit: z.string(),
      reorderLevel: z.number().optional(),
      reorderQuantity: z.number().optional(),
      unitCost: z.number(),
      sellingPrice: z.number().optional(),
      valuationMethod: z.enum(["fifo", "average", "standard"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Check for duplicate itemCode (stored in batchNumber field)
      const existing = await db.select().from(inventoryItems)
        .where(and(
          eq(inventoryItems.userId, userId),
          eq(inventoryItems.batchNumber, input.itemCode)
        ))
        .limit(1);
      
      if (existing.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Item with this code already exists" });
      }
      
      const [item] = await db.insert(inventoryItems).values({
        userId,
        itemType: input.category || "general",
        itemName: input.name,
        category: input.category,
        unit: input.unit,
        quantityOnHand: 0,
        reorderLevel: input.reorderLevel || 0,
        reorderQuantity: input.reorderQuantity || 0,
        unitCost: Math.round(input.unitCost * 100), // Convert to cents
        batchNumber: input.itemCode, // Store itemCode in batchNumber
        storageLocation: [
          input.sellingPrice ? `SP:${input.sellingPrice}` : null,
          input.valuationMethod ? `VM:${input.valuationMethod}` : null
        ].filter(Boolean).join('|') || null, // Store sellingPrice and valuationMethod
      }).returning();
      
      return { success: true, itemId: item.id };
    }),

  // Get item (enterprise schema)
  getItem: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const [item] = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.userId, userId)))
        .limit(1);
      
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      
      // Calculate average cost from receipts
      const receipts = await db.select()
        .from(inventoryTransactions)
        .where(and(
          eq(inventoryTransactions.itemId, input.itemId),
          eq(inventoryTransactions.userId, userId),
          sql`${inventoryTransactions.transactionType} = 'purchase'`,
          sql`${inventoryTransactions.quantity} > 0`
        ));
      
      let averageCost = item.unitCost / 100;
      if (receipts.length > 0) {
        let totalValue = 0;
        let totalQty = 0;
        
        for (const receipt of receipts) {
          const receiptUnitCost = receipt.unitCost || item.unitCost;
          totalValue += receipt.quantity * receiptUnitCost;
          totalQty += receipt.quantity;
        }
        
        averageCost = totalQty > 0 ? totalValue / totalQty / 100 : item.unitCost / 100;
      }
      
      return {
        itemId: item.id,
        itemCode: item.batchNumber || "",
        name: item.itemName,
        category: item.category,
        unit: item.unit,
        quantityOnHand: item.quantityOnHand,
        currentStock: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        unitCost: item.unitCost / 100,
        averageCost,
      };
    }),

  // Get items (enterprise schema)
  getItems: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const conditions = [eq(inventoryItems.userId, userId)];
      
      if (input?.category) {
        conditions.push(eq(inventoryItems.category, input.category));
      }
      
      const items = await db.select().from(inventoryItems)
        .where(and(...conditions))
        .orderBy(desc(inventoryItems.createdAt));
      
      return items.map(item => ({
        itemId: item.id,
        itemCode: item.batchNumber || "",
        name: item.itemName,
        category: item.category,
        unit: item.unit,
        quantityOnHand: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        unitCost: item.unitCost / 100,
      }));
    }),

  // Record transaction (enterprise schema)
  recordTransaction: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      type: z.enum(["receipt", "issue", "adjustment"]),
      quantity: z.number(),
      unitCost: z.number().optional(),
      reference: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Get current item
      const [item] = await db.select().from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.userId, userId)))
        .limit(1);
      
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      
      // Check for negative stock
      if (input.type === "issue" && item.quantityOnHand < input.quantity) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "insufficient stock" });
      }
      
      // Extract valuation method from storageLocation
      const valuationMethod = item.storageLocation?.match(/VM:([a-z]+)/)?.[1] || "standard";
      
      // Map type to transaction type
      const typeMap: Record<string, string> = {
        receipt: "purchase",
        issue: "usage",
        adjustment: "adjustment"
      };
      
      // Calculate quantity change
      const quantityChange = input.type === "issue" ? -input.quantity : input.quantity;
      
      let unitCost = input.unitCost ? Math.round(input.unitCost * 100) : item.unitCost;
      let totalCost = unitCost * Math.abs(quantityChange);
      
      // For issues, calculate cost based on valuation method
      if (input.type === "issue") {
        if (valuationMethod === "fifo") {
          // Get all receipt transactions ordered by date (oldest first)
          const receipts = await db.select()
            .from(inventoryTransactions)
            .where(and(
              eq(inventoryTransactions.itemId, input.itemId),
              eq(inventoryTransactions.userId, userId),
              sql`${inventoryTransactions.transactionType} = 'purchase'`,
              sql`${inventoryTransactions.quantity} > 0`
            ))
            .orderBy(inventoryTransactions.transactionDate);
          
          // Calculate FIFO cost
          let remainingQty = input.quantity;
          totalCost = 0;
          
          for (const receipt of receipts) {
            if (remainingQty <= 0) break;
            
            const receiptQty = receipt.quantity;
            const qtyToUse = Math.min(remainingQty, receiptQty);
            const receiptUnitCost = receipt.unitCost || item.unitCost;
            
            totalCost += qtyToUse * receiptUnitCost;
            remainingQty -= qtyToUse;
          }
          
          unitCost = Math.round(totalCost / input.quantity);
        } else if (valuationMethod === "average") {
          // Calculate weighted average cost
          const receipts = await db.select()
            .from(inventoryTransactions)
            .where(and(
              eq(inventoryTransactions.itemId, input.itemId),
              eq(inventoryTransactions.userId, userId),
              sql`${inventoryTransactions.transactionType} = 'purchase'`,
              sql`${inventoryTransactions.quantity} > 0`
            ));
          
          let totalValue = 0;
          let totalQty = 0;
          
          for (const receipt of receipts) {
            const receiptUnitCost = receipt.unitCost || item.unitCost;
            totalValue += receipt.quantity * receiptUnitCost;
            totalQty += receipt.quantity;
          }
          
          unitCost = totalQty > 0 ? Math.round(totalValue / totalQty) : item.unitCost;
          totalCost = unitCost * input.quantity;
        }
      }
      
      // Create transaction
      const [transaction] = await db.insert(inventoryTransactions).values({
        userId,
        itemId: input.itemId,
        transactionType: typeMap[input.type],
        quantity: quantityChange,
        unitCost,
        totalCost,
        transactionDate: new Date(),
        reference: input.reference,
        notes: input.notes,
      }).returning();
      
      // Update item quantity
      await db.update(inventoryItems)
        .set({ quantityOnHand: item.quantityOnHand + quantityChange })
        .where(eq(inventoryItems.id, input.itemId));
      
      return { 
        success: true, 
        transactionId: transaction.id,
        totalCost: totalCost / 100, // Convert back to dollars for response
      };
    }),

  // Get transaction history
  getTransactionHistory: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const transactions = await db.select()
        .from(inventoryTransactions)
        .where(and(
          eq(inventoryTransactions.userId, userId),
          eq(inventoryTransactions.itemId, input.itemId)
        ))
        .orderBy(desc(inventoryTransactions.transactionDate));
      
      return transactions.map(t => ({
        transactionId: t.id,
        type: t.transactionType,
        quantity: t.quantity,
        unitCost: t.unitCost ? t.unitCost / 100 : 0,
        date: t.transactionDate,
        reference: t.reference,
        createdBy: t.userId,
        createdAt: t.createdAt,
      }));
    }),

  // Get stock movements
  getStockMovements: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const conditions = [eq(inventoryTransactions.userId, userId)];
      
      if (input?.startDate) {
        conditions.push(gte(inventoryTransactions.transactionDate, new Date(input.startDate)));
      }
      if (input?.endDate) {
        conditions.push(lte(inventoryTransactions.transactionDate, new Date(input.endDate)));
      }
      
      const movements = await db.select({
        transaction: inventoryTransactions,
        item: inventoryItems,
      })
      .from(inventoryTransactions)
      .innerJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
      .where(and(...conditions))
      .orderBy(desc(inventoryTransactions.transactionDate));
      
      return movements.map(m => ({
        itemCode: m.item.batchNumber || "",
        itemName: m.item.itemName,
        type: m.transaction.transactionType,
        quantity: m.transaction.quantity,
        date: m.transaction.transactionDate,
      }));
    }),

  // Get reorder alerts
  getReorderAlerts: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const items = await db.select()
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.userId, userId),
          sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`
        ));
      
      return items.map(item => ({
        itemId: item.id,
        itemCode: item.batchNumber || "",
        itemName: item.itemName,
        currentStock: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        deficit: item.reorderLevel - item.quantityOnHand,
      }));
    }),

  // Get suggested reorder quantity
  getSuggestedReorderQuantity: protectedProcedure
    .input(z.object({ itemId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const [item] = await db.select()
        .from(inventoryItems)
        .where(and(eq(inventoryItems.id, input.itemId), eq(inventoryItems.userId, userId)))
        .limit(1);
      
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      
      // Use configured reorder quantity
      const suggestedQuantity = item.reorderQuantity || Math.max(0, (item.reorderLevel * 2) - item.quantityOnHand);
      
      return {
        itemId: item.id,
        currentStock: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        quantity: suggestedQuantity,
        suggestedQuantity,
      };
    }),

  // Get inventory turnover
  getInventoryTurnover: protectedProcedure
    .input(z.object({
      itemId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Get total cost of goods sold (issues) in period
      const [cogs] = await db.select({
        total: sql<number>`coalesce(sum(abs(${inventoryTransactions.totalCost})), 0)`
      })
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.userId, userId),
        eq(inventoryTransactions.itemId, input.itemId),
        eq(inventoryTransactions.transactionType, "usage"),
        gte(inventoryTransactions.transactionDate, new Date(input.startDate)),
        lte(inventoryTransactions.transactionDate, new Date(input.endDate))
      ));
      
      // Get average inventory value for this item
      const [avgInventory] = await db.select({
        total: sql<number>`${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}`
      })
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.userId, userId),
        eq(inventoryItems.id, input.itemId)
      ));
      
      const cogsValue = Number(cogs?.total || 0) / 100;
      const avgInventoryValue = Number(avgInventory?.total || 0) / 100;
      
      const turnoverRatio = avgInventoryValue > 0 ? cogsValue / avgInventoryValue : 0;
      
      return {
        ratio: turnoverRatio,
        turnoverRatio,
        costOfGoodsSold: cogsValue,
        averageInventory: avgInventoryValue,
      };
    }),

  // Get stock valuation report
  getStockValuation: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const items = await db.select()
        .from(inventoryItems)
        .where(eq(inventoryItems.userId, userId));
      
      return items.map(item => ({
        itemCode: item.batchNumber || "",
        itemName: item.itemName,
        currentStock: item.quantityOnHand,
        quantity: item.quantityOnHand,
        unitCost: item.unitCost / 100,
        totalValue: (item.quantityOnHand * item.unitCost) / 100,
      }));
    }),
});
