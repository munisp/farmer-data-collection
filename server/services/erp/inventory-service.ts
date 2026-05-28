/**
 * Inventory Management Service
 * 
 * Manages farm inventory including:
 * - Seeds, fertilizers, pesticides, equipment
 * - Supplier management
 * - Purchase tracking
 * - Stock levels and reorder alerts
 * - Inventory valuation (FIFO/Average Cost)
 */

import { getDb } from '../../db';
import {
  inventoryItems,
  inventoryTransactions,
  suppliers,
  type InventoryItem,
  type InventoryTransaction,
  type Supplier,
} from '../../../drizzle/financial-schema';
import { eq, and, sql, desc, lt } from 'drizzle-orm';
import { logger } from '../../logger.js';

export interface CreateInventoryItemInput {
  userId: number;
  itemType: string; // seed, fertilizer, pesticide, equipment
  itemName: string;
  category?: string;
  unit: string;
  quantityOnHand?: number;
  reorderLevel?: number;
  unitCost: number; // in cents
  supplierId?: number;
  storageLocation?: string;
  expiryDate?: Date;
  batchNumber?: string;
}

export interface InventoryTransactionInput {
  userId: number;
  itemId: number;
  transactionType: string; // purchase, usage, adjustment, transfer
  quantity: number;
  unitCost?: number; // in cents
  transactionDate: Date;
  reference?: string;
  farmId?: number;
  cropId?: number;
  notes?: string;
}

export interface CreateSupplierInput {
  userId: number;
  name: string;
  contactPerson?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  paymentTerms?: string;
  rating?: number;
}

export class InventoryService {
  /**
   * Create new inventory item
   */
  async createItem(input: CreateInventoryItemInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const [item] = await database.insert(inventoryItems).values({
      userId: input.userId,
      itemType: input.itemType,
      itemName: input.itemName,
      category: input.category,
      unit: input.unit,
      quantityOnHand: input.quantityOnHand || 0,
      reorderLevel: input.reorderLevel || 0,
      unitCost: input.unitCost,
      supplierId: input.supplierId,
      storageLocation: input.storageLocation,
      expiryDate: input.expiryDate,
      batchNumber: input.batchNumber,
    }).returning();

    logger.info(`[Inventory] Created item: ${input.itemName}`);
    return item.id;
  }

  /**
   * Record inventory transaction (purchase, usage, adjustment)
   */
  async recordTransaction(input: InventoryTransactionInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get current item
    const [item] = await database
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, input.itemId))
      .limit(1);

    if (!item) {
      throw new Error('Inventory item not found');
    }

    if (item.userId !== input.userId) {
      throw new Error('Unauthorized');
    }

    // Calculate cost
    const unitCost = input.unitCost || item.unitCost;
    const totalCost = Math.abs(input.quantity) * unitCost;

    // Create transaction
    const [transaction] = await database.insert(inventoryTransactions).values({
      userId: input.userId,
      itemId: input.itemId,
      transactionType: input.transactionType,
      quantity: input.quantity,
      unitCost,
      totalCost,
      transactionDate: input.transactionDate,
      reference: input.reference,
      farmId: input.farmId,
      cropId: input.cropId,
      notes: input.notes,
    }).returning();

    // Update item quantity
    let newQuantity = item.quantityOnHand;
    
    switch (input.transactionType) {
      case 'purchase':
        newQuantity += Math.abs(input.quantity);
        break;
      case 'usage':
        newQuantity -= Math.abs(input.quantity);
        break;
      case 'adjustment':
        newQuantity = input.quantity; // Direct set
        break;
      case 'transfer':
        newQuantity -= Math.abs(input.quantity);
        break;
    }

    if (newQuantity < 0) {
      throw new Error(`Insufficient stock. Available: ${item.quantityOnHand}, Requested: ${Math.abs(input.quantity)}`);
    }

    // Update quantity on hand
    await database.update(inventoryItems)
      .set({
        quantityOnHand: newQuantity,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, input.itemId));

    // Update unit cost for purchases (weighted average)
    if (input.transactionType === 'purchase' && input.unitCost) {
      const totalValue = (item.quantityOnHand * item.unitCost) + (Math.abs(input.quantity) * input.unitCost);
      const totalQuantity = item.quantityOnHand + Math.abs(input.quantity);
      const newUnitCost = Math.round(totalValue / totalQuantity);

      await database.update(inventoryItems)
        .set({ unitCost: newUnitCost })
        .where(eq(inventoryItems.id, input.itemId));
    }

    logger.info(`[Inventory] ${input.transactionType}: ${input.quantity} ${item.unit} of ${item.itemName}`);
    return transaction.id;
  }

  /**
   * Get items below reorder level
   */
  async getLowStockItems(userId: number): Promise<InventoryItem[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    return await database
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.userId, userId),
        sql`${inventoryItems.quantityOnHand} <= ${inventoryItems.reorderLevel}`
      ))
      .orderBy(desc(inventoryItems.reorderLevel));
  }

  /**
   * Get items expiring soon
   */
  async getExpiringSoonItems(userId: number, daysAhead: number = 30): Promise<InventoryItem[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return await database
      .select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.userId, userId),
        sql`${inventoryItems.expiryDate} IS NOT NULL`,
        lt(inventoryItems.expiryDate, futureDate)
      ))
      .orderBy(inventoryItems.expiryDate);
  }

  /**
   * Get inventory valuation
   */
  async getInventoryValuation(userId: number): Promise<unknown> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const items = await database
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.userId, userId));

    const byType: Record<string, { quantity: number; value: number; items: number }> = {};
    let totalValue = 0;

    for (const item of items) {
      const value = item.quantityOnHand * item.unitCost;
      totalValue += value;

      if (!byType[item.itemType]) {
        byType[item.itemType] = { quantity: 0, value: 0, items: 0 };
      }

      byType[item.itemType].quantity += item.quantityOnHand;
      byType[item.itemType].value += value;
      byType[item.itemType].items += 1;
    }

    return {
      totalValue,
      totalItems: items.length,
      byType,
      items: items.map(item => ({
        id: item.id,
        name: item.itemName,
        type: item.itemType,
        quantity: item.quantityOnHand,
        unit: item.unit,
        unitCost: item.unitCost,
        totalValue: item.quantityOnHand * item.unitCost,
      })),
    };
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    userId: number,
    itemId?: number,
    limit: number = 50
  ): Promise<InventoryTransaction[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (itemId) {
      return await database
        .select()
        .from(inventoryTransactions)
        .where(and(
          eq(inventoryTransactions.userId, userId),
          eq(inventoryTransactions.itemId, itemId)
        ))
        .orderBy(desc(inventoryTransactions.transactionDate))
        .limit(limit);
    }

    return await database
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.userId, userId))
      .orderBy(desc(inventoryTransactions.transactionDate))
      .limit(limit);
  }

  /**
   * Create supplier
   */
  async createSupplier(input: CreateSupplierInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const [supplier] = await database.insert(suppliers).values({
      userId: input.userId,
      name: input.name,
      contactPerson: input.contactPerson,
      phoneNumber: input.phoneNumber,
      email: input.email,
      address: input.address,
      paymentTerms: input.paymentTerms,
      rating: input.rating,
      isActive: true,
    }).returning();

    logger.info(`[Inventory] Created supplier: ${input.name}`);
    return supplier.id;
  }

  /**
   * Get all suppliers
   */
  async getSuppliers(userId: number, activeOnly: boolean = true): Promise<Supplier[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (activeOnly) {
      return await database
        .select()
        .from(suppliers)
        .where(and(
          eq(suppliers.userId, userId),
          eq(suppliers.isActive, true)
        ))
        .orderBy(desc(suppliers.createdAt));
    }

    return await database
      .select()
      .from(suppliers)
      .where(eq(suppliers.userId, userId))
      .orderBy(desc(suppliers.createdAt));
  }

  /**
   * Get all inventory items
   */
  async getItems(userId: number, itemType?: string): Promise<InventoryItem[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (itemType) {
      return await database
        .select()
        .from(inventoryItems)
        .where(and(
          eq(inventoryItems.userId, userId),
          eq(inventoryItems.itemType, itemType)
        ))
        .orderBy(desc(inventoryItems.createdAt));
    }

    return await database
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.userId, userId))
      .orderBy(desc(inventoryItems.createdAt));
  }

  /**
   * Update supplier rating
   */
  async updateSupplierRating(supplierId: number, rating: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    await database.update(suppliers)
      .set({
        rating,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId));

    logger.info(`[Inventory] Updated supplier ${supplierId} rating to ${rating}`);
  }
}

// Export singleton instance
export const inventoryService = new InventoryService();
