import crypto from "crypto";
/**
 * Supply Chain Traceability Router
 * Track agricultural products from farm to buyer with QR codes
 */

import { router, protectedProcedure } from '../_core/trpc-base.js';
import { z } from 'zod';
import { getDb } from '../db.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  productBatches,
  traceabilityEvents,
  collectionCenters,
  warehouses,
  warehouseReceipts,
} from '../../drizzle/traceability-schema.js';

export const traceabilityRouter = router({
  // Get all batches
  listBatches: protectedProcedure
    .input(z.object({
      farmerId: z.number().optional(),
      status: z.string().optional(),
      cropType: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { farmerId, status, cropType, limit = 50, offset = 0 } = input || {};
      
      const conditions: ReturnType<typeof eq>[] = [];
      if (farmerId) conditions.push(eq(productBatches.farmerId, farmerId));
      if (status) conditions.push(eq(productBatches.status, status as 'created' | 'at_farm' | 'in_transit' | 'at_collection_center' | 'at_warehouse' | 'processing' | 'ready_for_sale' | 'sold' | 'delivered' | 'rejected'));
      if (cropType) conditions.push(eq(productBatches.cropType, cropType));
      
      const batches = await db
        .select()
        .from(productBatches)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(productBatches.createdAt))
        .limit(limit)
        .offset(offset);
      
      return batches;
    }),

  // Get batch by ID or code
  getBatch: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      batchCode: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      if (!input.id && !input.batchCode) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Either id or batchCode is required' });
      }
      
      const condition = input.id 
        ? eq(productBatches.id, input.id)
        : eq(productBatches.batchCode, input.batchCode!);
      
      const [batch] = await db
        .select()
        .from(productBatches)
        .where(condition);
      
      if (!batch) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Batch not found' });
      }
      
      // Get events
      const events = await db
        .select()
        .from(traceabilityEvents)
        .where(eq(traceabilityEvents.batchId, batch.id))
        .orderBy(traceabilityEvents.eventTimestamp);
      
      return { ...batch, events };
    }),

  // Create batch
  createBatch: protectedProcedure
    .input(z.object({
      cropType: z.string(),
      variety: z.string().optional(),
      quantity: z.number(),
      unit: z.string(),
      qualityGrade: z.enum(['premium', 'grade_a', 'grade_b', 'grade_c', 'rejected']).optional(),
      moistureContent: z.number().optional(),
      foreignMatter: z.number().optional(),
      farmId: z.number().optional(),
      farmerId: z.number().optional(),
      cooperativeId: z.number().optional(),
      originVillage: z.string().optional(),
      originDistrict: z.string().optional(),
      originRegion: z.string().optional(),
      originLatitude: z.number().optional(),
      originLongitude: z.number().optional(),
      harvestDate: z.string().optional(),
      isOrganic: z.boolean().default(false),
      certifications: z.array(z.string()).optional(),
      farmGatePrice: z.number().optional(),
      createdBy: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Generate batch code
      const batchCode = `BATCH-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      
      // Generate QR code data (URL to traceability page)
      const qrCode = `https://app.example.com/trace/${batchCode}`;
      
      const [batch] = await db
        .insert(productBatches)
        .values({
          ...input,
          batchCode,
          qrCode,
          currentQuantity: String(input.quantity),
          quantity: String(input.quantity),
          moistureContent: input.moistureContent ? String(input.moistureContent) : undefined,
          foreignMatter: input.foreignMatter ? String(input.foreignMatter) : undefined,
          originLatitude: input.originLatitude ? String(input.originLatitude) : undefined,
          originLongitude: input.originLongitude ? String(input.originLongitude) : undefined,
          currentLocation: input.originVillage || 'Farm',
          currentLatitude: input.originLatitude ? String(input.originLatitude) : undefined,
          currentLongitude: input.originLongitude ? String(input.originLongitude) : undefined,
          harvestDate: input.harvestDate ? new Date(input.harvestDate) : undefined,
          certifications: input.certifications ? JSON.stringify(input.certifications) : undefined,
          status: 'created',
        })
        .returning();
      
      // Record harvest event
      await db.insert(traceabilityEvents).values({
        batchId: batch.id,
        eventType: 'harvest',
        eventDescription: `Batch created from harvest of ${input.quantity} ${input.unit} of ${input.cropType}`,
        location: input.originVillage,
        latitude: input.originLatitude ? String(input.originLatitude) : undefined,
        longitude: input.originLongitude ? String(input.originLongitude) : undefined,
        quantityAfter: String(input.quantity),
        qualityGrade: input.qualityGrade,
        performedBy: input.createdBy,
      });
      
      return batch;
    }),

  // Update batch status
  updateBatchStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['created', 'at_farm', 'in_transit', 'at_collection_center', 'at_warehouse', 'processing', 'ready_for_sale', 'sold', 'delivered', 'rejected']),
      currentLocation: z.string().optional(),
      currentLatitude: z.number().optional(),
      currentLongitude: z.number().optional(),
      currentPrice: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { id, ...data } = input;
      
      const [updated] = await db
        .update(productBatches)
        .set({
          ...data,
          currentLatitude: data.currentLatitude ? String(data.currentLatitude) : undefined,
          currentLongitude: data.currentLongitude ? String(data.currentLongitude) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(productBatches.id, id))
        .returning();
      
      return updated;
    }),

  // Record traceability event
  recordEvent: protectedProcedure
    .input(z.object({
      batchId: z.number(),
      eventType: z.enum(['harvest', 'quality_check', 'collection', 'transport_start', 'transport_end', 'warehouse_receipt', 'processing_start', 'processing_end', 'packaging', 'sale', 'delivery', 'return', 'disposal']),
      eventDescription: z.string().optional(),
      location: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      quantityBefore: z.number().optional(),
      quantityAfter: z.number().optional(),
      qualityGrade: z.enum(['premium', 'grade_a', 'grade_b', 'grade_c', 'rejected']).optional(),
      qualityNotes: z.string().optional(),
      temperature: z.number().optional(),
      humidity: z.number().optional(),
      photoUrls: z.array(z.string()).optional(),
      performedBy: z.number().optional(),
      organizationName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [event] = await db
        .insert(traceabilityEvents)
        .values({
          ...input,
          latitude: input.latitude ? String(input.latitude) : undefined,
          longitude: input.longitude ? String(input.longitude) : undefined,
          quantityBefore: input.quantityBefore ? String(input.quantityBefore) : undefined,
          quantityAfter: input.quantityAfter ? String(input.quantityAfter) : undefined,
          temperature: input.temperature ? String(input.temperature) : undefined,
          humidity: input.humidity ? String(input.humidity) : undefined,
          photoUrls: input.photoUrls ? JSON.stringify(input.photoUrls) : undefined,
        })
        .returning();
      
      // Update batch current quantity and location if provided
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.quantityAfter) {
        updateData.currentQuantity = String(input.quantityAfter);
      }
      if (input.location) {
        updateData.currentLocation = input.location;
      }
      if (input.latitude) {
        updateData.currentLatitude = String(input.latitude);
      }
      if (input.longitude) {
        updateData.currentLongitude = String(input.longitude);
      }
      
      await db
        .update(productBatches)
        .set(updateData)
        .where(eq(productBatches.id, input.batchId));
      
      return event;
    }),

  // Verify event
  verifyEvent: protectedProcedure
    .input(z.object({
      id: z.number(),
      verifiedBy: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(traceabilityEvents)
        .set({
          isVerified: true,
          verifiedBy: input.verifiedBy,
          verifiedAt: new Date(),
        })
        .where(eq(traceabilityEvents.id, input.id))
        .returning();
      
      return updated;
    }),

  // Get collection centers
  listCollectionCenters: protectedProcedure
    .input(z.object({
      region: z.string().optional(),
      activeOnly: z.boolean().default(true),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { region, activeOnly = true } = input || {};
      
      const conditions: ReturnType<typeof eq>[] = [];
      if (region) conditions.push(eq(collectionCenters.region, region));
      if (activeOnly) conditions.push(eq(collectionCenters.isActive, true));
      
      const centers = await db
        .select()
        .from(collectionCenters)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(collectionCenters.name);
      
      return centers;
    }),

  // Create collection center
  createCollectionCenter: protectedProcedure
    .input(z.object({
      name: z.string(),
      code: z.string().optional(),
      address: z.string().optional(),
      village: z.string().optional(),
      district: z.string().optional(),
      region: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      managerName: z.string().optional(),
      managerId: z.number().optional(),
      storageCapacity: z.number().optional(),
      hasWeighingScale: z.boolean().default(false),
      hasMoistureReader: z.boolean().default(false),
      hasColdStorage: z.boolean().default(false),
      cooperativeId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [center] = await db
        .insert(collectionCenters)
        .values({
          ...input,
          code: input.code || `CC-${Date.now()}`,
          latitude: input.latitude ? String(input.latitude) : undefined,
          longitude: input.longitude ? String(input.longitude) : undefined,
          storageCapacity: input.storageCapacity ? String(input.storageCapacity) : undefined,
          currentStock: '0',
          isActive: true,
        })
        .returning();
      
      return center;
    }),

  // Get warehouses
  listWarehouses: protectedProcedure
    .input(z.object({
      region: z.string().optional(),
      activeOnly: z.boolean().default(true),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { region, activeOnly = true } = input || {};
      
      const conditions: ReturnType<typeof eq>[] = [];
      if (region) conditions.push(eq(warehouses.region, region));
      if (activeOnly) conditions.push(eq(warehouses.isActive, true));
      
      const warehouseList = await db
        .select()
        .from(warehouses)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(warehouses.name);
      
      return warehouseList;
    }),

  // Create warehouse
  createWarehouse: protectedProcedure
    .input(z.object({
      name: z.string(),
      code: z.string().optional(),
      warehouseType: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      totalCapacity: z.number().optional(),
      certifications: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [warehouse] = await db
        .insert(warehouses)
        .values({
          ...input,
          code: input.code || `WH-${Date.now()}`,
          latitude: input.latitude ? String(input.latitude) : undefined,
          longitude: input.longitude ? String(input.longitude) : undefined,
          totalCapacity: input.totalCapacity ? String(input.totalCapacity) : undefined,
          availableCapacity: input.totalCapacity ? String(input.totalCapacity) : undefined,
          certifications: input.certifications ? JSON.stringify(input.certifications) : undefined,
          isActive: true,
        })
        .returning();
      
      return warehouse;
    }),

  // Create warehouse receipt
  createWarehouseReceipt: protectedProcedure
    .input(z.object({
      batchId: z.number(),
      warehouseId: z.number(),
      depositorId: z.number(),
      depositorType: z.string().optional(),
      commodityType: z.string(),
      quantity: z.number(),
      unit: z.string(),
      qualityGrade: z.enum(['premium', 'grade_a', 'grade_b', 'grade_c', 'rejected']).optional(),
      estimatedValue: z.number().optional(),
      expectedReleaseDate: z.string().optional(),
      dailyStorageFee: z.number().optional(),
      issuedBy: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const receiptNumber = `WR-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      
      const [receipt] = await db
        .insert(warehouseReceipts)
        .values({
          ...input,
          receiptNumber,
          quantity: String(input.quantity),
          depositDate: new Date(),
          expectedReleaseDate: input.expectedReleaseDate ? new Date(input.expectedReleaseDate) : undefined,
          status: 'active',
          totalFeesAccrued: 0,
        })
        .returning();
      
      // Update batch status
      await db
        .update(productBatches)
        .set({
          status: 'at_warehouse',
          updatedAt: new Date(),
        })
        .where(eq(productBatches.id, input.batchId));
      
      // Record event
      await db.insert(traceabilityEvents).values({
        batchId: input.batchId,
        eventType: 'warehouse_receipt',
        eventDescription: `Warehouse receipt ${receiptNumber} issued`,
        performedBy: input.issuedBy,
      });
      
      return receipt;
    }),

  // Get warehouse receipts
  listWarehouseReceipts: protectedProcedure
    .input(z.object({
      depositorId: z.number().optional(),
      warehouseId: z.number().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { depositorId, warehouseId, status } = input || {};
      
      const conditions: ReturnType<typeof eq>[] = [];
      if (depositorId) conditions.push(eq(warehouseReceipts.depositorId, depositorId));
      if (warehouseId) conditions.push(eq(warehouseReceipts.warehouseId, warehouseId));
      if (status) conditions.push(eq(warehouseReceipts.status, status));
      
      const receipts = await db
        .select()
        .from(warehouseReceipts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(warehouseReceipts.depositDate));
      
      return receipts;
    }),

  // Pledge receipt as collateral
  pledgeReceipt: protectedProcedure
    .input(z.object({
      id: z.number(),
      loanId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(warehouseReceipts)
        .set({
          isPledged: true,
          pledgedToLoanId: input.loanId,
          status: 'pledged',
          updatedAt: new Date(),
        })
        .where(eq(warehouseReceipts.id, input.id))
        .returning();
      
      return updated;
    }),

  // Release receipt
  releaseReceipt: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(warehouseReceipts)
        .set({
          status: 'released',
          actualReleaseDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(warehouseReceipts.id, input.id))
        .returning();
      
      return updated;
    }),

  // Get traceability stats
  getStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [batchStats] = await db
        .select({
          totalBatches: sql<number>`count(*)`,
          activeBatches: sql<number>`count(*) filter (where status not in ('sold', 'delivered', 'rejected'))`,
          totalQuantity: sql<number>`coalesce(sum(cast(current_quantity as numeric)), 0)`,
        })
        .from(productBatches);
      
      const [centerStats] = await db
        .select({
          totalCenters: sql<number>`count(*)`,
          activeCenters: sql<number>`count(*) filter (where is_active = true)`,
        })
        .from(collectionCenters);
      
      const [warehouseStats] = await db
        .select({
          totalWarehouses: sql<number>`count(*)`,
          activeWarehouses: sql<number>`count(*) filter (where is_active = true)`,
        })
        .from(warehouses);
      
      const [receiptStats] = await db
        .select({
          totalReceipts: sql<number>`count(*)`,
          activeReceipts: sql<number>`count(*) filter (where status = 'active')`,
          pledgedReceipts: sql<number>`count(*) filter (where is_pledged = true)`,
        })
        .from(warehouseReceipts);
      
      return {
        batches: {
          total: batchStats?.totalBatches || 0,
          active: batchStats?.activeBatches || 0,
          totalQuantity: batchStats?.totalQuantity || 0,
        },
        collectionCenters: {
          total: centerStats?.totalCenters || 0,
          active: centerStats?.activeCenters || 0,
        },
        warehouses: {
          total: warehouseStats?.totalWarehouses || 0,
          active: warehouseStats?.activeWarehouses || 0,
        },
        receipts: {
          total: receiptStats?.totalReceipts || 0,
          active: receiptStats?.activeReceipts || 0,
          pledged: receiptStats?.pledgedReceipts || 0,
        },
      };
    }),
});
