/**
 * Operations Service
 * 
 * Combines Work Order Management and Asset Management:
 * - Work order creation and tracking
 * - Task assignment and completion
 * - Material usage tracking
 * - Fixed asset management
 * - Depreciation calculation
 * - Maintenance scheduling
 */

import { getDb } from '../../db';
import {
  workOrders,
  workOrderItems,
  fixedAssets,
  depreciationSchedule,
  inventoryItems,
  type WorkOrder,
  type FixedAsset,
} from '../../../drizzle/financial-schema';
import { eq, and, sql, desc, between } from 'drizzle-orm';
import { logger } from '../../logger.js';

// ============================================================================
// WORK ORDER MANAGEMENT
// ============================================================================

export interface CreateWorkOrderInput {
  userId: number;
  farmId: number;
  cropId?: number;
  taskType: string; // planting, irrigation, fertilization, spraying, harvesting
  description: string;
  scheduledDate: Date;
  assignedTo?: number;
  estimatedCost?: number; // in cents
  materials?: {
    itemId: number;
    quantityPlanned: number;
  }[];
}

export interface CompleteWorkOrderInput {
  workOrderId: number;
  completedDate: Date;
  actualCost?: number;
  materialsUsed?: {
    itemId: number;
    quantityUsed: number;
  }[];
  notes?: string;
}

export class WorkOrderService {
  /**
   * Create new work order
   */
  async createWorkOrder(input: CreateWorkOrderInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Generate work order number
    const workOrderNumber = await this.generateWorkOrderNumber(input.userId);

    // Create work order
    const [workOrder] = await database.insert(workOrders).values({
      userId: input.userId,
      workOrderNumber,
      farmId: input.farmId,
      cropId: input.cropId,
      taskType: input.taskType,
      description: input.description,
      scheduledDate: input.scheduledDate,
      assignedTo: input.assignedTo,
      estimatedCost: input.estimatedCost,
      status: 'pending',
    }).returning();

    // Add materials if provided
    if (input.materials && input.materials.length > 0) {
      // Get unit costs for materials
      const itemIds = input.materials.map(m => m.itemId);
      const items = await database
        .select()
        .from(inventoryItems)
        .where(sql`id = ANY(${itemIds})`);

      const itemCosts = new Map(items.map(item => [item.id, item.unitCost]));

      await database.insert(workOrderItems).values(
        input.materials.map(material => ({
          workOrderId: workOrder.id,
          itemId: material.itemId,
          quantityPlanned: material.quantityPlanned,
          unitCost: itemCosts.get(material.itemId) || 0,
        }))
      );
    }

    logger.info(`[WorkOrder] Created ${workOrderNumber}: ${input.taskType}`);
    return workOrder.id;
  }

  /**
   * Start work order
   */
  async startWorkOrder(workOrderId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(workOrders)
      .set({
        status: 'in_progress',
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, workOrderId));

    logger.info(`[WorkOrder] Started work order ${workOrderId}`);
  }

  /**
   * Complete work order
   */
  async completeWorkOrder(input: CompleteWorkOrderInput): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Update work order
    await database.update(workOrders)
      .set({
        status: 'completed',
        completedDate: input.completedDate,
        actualCost: input.actualCost,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, input.workOrderId));

    // Update materials used
    if (input.materialsUsed && input.materialsUsed.length > 0) {
      for (const material of input.materialsUsed) {
        await database.update(workOrderItems)
          .set({ quantityUsed: material.quantityUsed })
          .where(and(
            eq(workOrderItems.workOrderId, input.workOrderId),
            eq(workOrderItems.itemId, material.itemId)
          ));
      }
    }

    logger.info(`[WorkOrder] Completed work order ${input.workOrderId}`);
  }

  /**
   * Get work orders for user
   */
  async getWorkOrders(userId: number, status?: string): Promise<WorkOrder[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (status) {
      return await database
        .select()
        .from(workOrders)
        .where(and(
          eq(workOrders.userId, userId),
          eq(workOrders.status, status)
        ))
        .orderBy(desc(workOrders.scheduledDate));
    }

    return await database
      .select()
      .from(workOrders)
      .where(eq(workOrders.userId, userId))
      .orderBy(desc(workOrders.scheduledDate));
  }

  /**
   * Generate work order number (WO-YYYY-NNNNN)
   */
  private async generateWorkOrderNumber(userId: number): Promise<string> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const year = new Date().getFullYear();
    
    const result = await database
      .select({ count: sql<number>`count(*)` })
      .from(workOrders)
      .where(eq(workOrders.userId, userId));

    const count = Number(result[0]?.count) || 0;
    const nextNumber = count + 1;
    
    return `WO-${year}-${String(nextNumber).padStart(5, '0')}`;
  }
}

// ============================================================================
// ASSET MANAGEMENT
// ============================================================================

export interface CreateAssetInput {
  userId: number;
  assetType: string; // equipment, land, building, vehicle
  assetName: string;
  description?: string;
  purchaseDate: Date;
  purchaseCost: number; // in cents
  salvageValue?: number; // in cents
  usefulLife: number; // in years
  depreciationMethod?: string;
  location?: string;
  serialNumber?: string;
  condition?: string;
}

export interface MaintenanceInput {
  assetId: number;
  maintenanceDate: Date;
  nextMaintenanceDate?: Date;
  cost?: number;
  notes?: string;
}

export class AssetService {
  /**
   * Create new fixed asset
   */
  async createAsset(input: CreateAssetInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const currentValue = input.purchaseCost;

    const [asset] = await database.insert(fixedAssets).values({
      userId: input.userId,
      assetType: input.assetType,
      assetName: input.assetName,
      description: input.description,
      purchaseDate: input.purchaseDate,
      purchaseCost: input.purchaseCost,
      salvageValue: input.salvageValue || 0,
      usefulLife: input.usefulLife,
      depreciationMethod: input.depreciationMethod || 'straight_line',
      accumulatedDepreciation: 0,
      currentValue,
      location: input.location,
      serialNumber: input.serialNumber,
      condition: input.condition || 'good',
      isActive: true,
    }).returning();

    // Generate depreciation schedule
    await this.generateDepreciationSchedule(asset.id);

    logger.info(`[Asset] Created asset: ${input.assetName}`);
    return asset.id;
  }

  /**
   * Generate depreciation schedule for asset
   */
  async generateDepreciationSchedule(assetId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const [asset] = await database
      .select()
      .from(fixedAssets)
      .where(eq(fixedAssets.id, assetId))
      .limit(1);

    if (!asset) {
      throw new Error('Asset not found');
    }

    // Calculate annual depreciation (straight-line method)
    const depreciableAmount = asset.purchaseCost - asset.salvageValue;
    const annualDepreciation = Math.round(depreciableAmount / asset.usefulLife);

    // Generate schedule for each year
    const scheduleEntries = [];
    let accumulatedDepreciation = 0;
    let bookValue = asset.purchaseCost;

    for (let year = 1; year <= asset.usefulLife; year++) {
      accumulatedDepreciation += annualDepreciation;
      bookValue -= annualDepreciation;

      // Ensure book value doesn't go below salvage value
      if (bookValue < asset.salvageValue) {
        bookValue = asset.salvageValue;
        accumulatedDepreciation = asset.purchaseCost - asset.salvageValue;
      }

      const periodDate = new Date(asset.purchaseDate);
      periodDate.setFullYear(periodDate.getFullYear() + year);

      scheduleEntries.push({
        assetId: asset.id,
        periodDate,
        depreciationAmount: annualDepreciation,
        accumulatedDepreciation,
        bookValue,
      });
    }

    // Insert schedule
    await database.insert(depreciationSchedule).values(scheduleEntries);

    logger.info(`[Asset] Generated depreciation schedule for asset ${assetId}`);
  }

  /**
   * Record depreciation for period
   */
  async recordDepreciation(assetId: number, periodDate: Date, journalEntryId?: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get schedule entry for this period
    const [scheduleEntry] = await database
      .select()
      .from(depreciationSchedule)
      .where(and(
        eq(depreciationSchedule.assetId, assetId),
        eq(depreciationSchedule.periodDate, periodDate)
      ))
      .limit(1);

    if (!scheduleEntry) {
      throw new Error('Depreciation schedule entry not found');
    }

    // Update schedule with journal entry reference
    if (journalEntryId) {
      await database.update(depreciationSchedule)
        .set({ journalEntryId })
        .where(eq(depreciationSchedule.id, scheduleEntry.id));
    }

    // Update asset accumulated depreciation and current value
    await database.update(fixedAssets)
      .set({
        accumulatedDepreciation: scheduleEntry.accumulatedDepreciation,
        currentValue: scheduleEntry.bookValue,
        updatedAt: new Date(),
      })
      .where(eq(fixedAssets.id, assetId));

    logger.info(`[Asset] Recorded depreciation for asset ${assetId}`);
  }

  /**
   * Record maintenance
   */
  async recordMaintenance(input: MaintenanceInput): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(fixedAssets)
      .set({
        lastMaintenanceDate: input.maintenanceDate,
        nextMaintenanceDate: input.nextMaintenanceDate,
        updatedAt: new Date(),
      })
      .where(eq(fixedAssets.id, input.assetId));

    logger.info(`[Asset] Recorded maintenance for asset ${input.assetId}`);
  }

  /**
   * Get assets due for maintenance
   */
  async getMaintenanceDue(userId: number): Promise<FixedAsset[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const today = new Date();

    return await database
      .select()
      .from(fixedAssets)
      .where(and(
        eq(fixedAssets.userId, userId),
        eq(fixedAssets.isActive, true),
        sql`${fixedAssets.nextMaintenanceDate} IS NOT NULL`,
        sql`${fixedAssets.nextMaintenanceDate} <= ${today}`
      ))
      .orderBy(fixedAssets.nextMaintenanceDate);
  }

  /**
   * Get all assets
   */
  async getAssets(userId: number, assetType?: string): Promise<FixedAsset[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (assetType) {
      return await database
        .select()
        .from(fixedAssets)
        .where(and(
          eq(fixedAssets.userId, userId),
          eq(fixedAssets.assetType, assetType),
          eq(fixedAssets.isActive, true)
        ))
        .orderBy(desc(fixedAssets.createdAt));
    }

    return await database
      .select()
      .from(fixedAssets)
      .where(and(
        eq(fixedAssets.userId, userId),
        eq(fixedAssets.isActive, true)
      ))
      .orderBy(desc(fixedAssets.createdAt));
  }

  /**
   * Get asset valuation summary
   */
  async getAssetValuation(userId: number): Promise<unknown> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const assets = await database
      .select()
      .from(fixedAssets)
      .where(and(
        eq(fixedAssets.userId, userId),
        eq(fixedAssets.isActive, true)
      ));

    const byType: Record<string, { count: number; purchaseCost: number; currentValue: number; depreciation: number }> = {};
    let totalPurchaseCost = 0;
    let totalCurrentValue = 0;
    let totalDepreciation = 0;

    for (const asset of assets) {
      totalPurchaseCost += asset.purchaseCost;
      totalCurrentValue += asset.currentValue;
      totalDepreciation += asset.accumulatedDepreciation;

      if (!byType[asset.assetType]) {
        byType[asset.assetType] = { count: 0, purchaseCost: 0, currentValue: 0, depreciation: 0 };
      }

      byType[asset.assetType].count += 1;
      byType[asset.assetType].purchaseCost += asset.purchaseCost;
      byType[asset.assetType].currentValue += asset.currentValue;
      byType[asset.assetType].depreciation += asset.accumulatedDepreciation;
    }

    return {
      totalAssets: assets.length,
      totalPurchaseCost,
      totalCurrentValue,
      totalDepreciation,
      depreciationRate: totalPurchaseCost > 0 ? (totalDepreciation / totalPurchaseCost) * 100 : 0,
      byType,
    };
  }

  /**
   * Dispose of asset
   */
  async disposeAsset(assetId: number, disposalDate: Date, disposalValue?: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(fixedAssets)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(fixedAssets.id, assetId));

    logger.info(`[Asset] Disposed asset ${assetId}`);
  }
}

// Export singleton instances
export const workOrderService = new WorkOrderService();
export const assetService = new AssetService();
