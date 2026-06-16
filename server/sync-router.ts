import { z } from "zod";
import { eq, gt, and } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import { getDb } from "./db";
import * as schema from "../drizzle/schema";
import { getWebSocketServer } from "./websocket-server.js";
import { 
  publishFarmerCreated, 
  publishFarmerUpdated, 
  publishFarmerDeleted 
} from "./event-producers.js";
import { logger } from './logger.js';
import {
  publishFarmCreated,
  publishFarmUpdated,
  publishFarmDeleted,
  publishCropCreated,
  publishCropUpdated,
  publishCropDeleted,
  publishLivestockCreated,
  publishLivestockUpdated,
  publishLivestockDeleted,
  publishHarvestCreated,
  publishHarvestUpdated,
  publishHarvestDeleted,
  publishExpenseCreated,
  publishExpenseUpdated,
  publishExpenseDeleted
} from "./event-producers-extended.js";

// ============================================================================
// Idempotency Key Support
// ============================================================================

// In-memory idempotency store (in production, use Redis)
const idempotencyStore = new Map<string, { result: unknown; expiresAt: Date }>();

// Clean up expired idempotency keys every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [key, value] of idempotencyStore.entries()) {
    if (value.expiresAt < now) {
      idempotencyStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Generate idempotency key from operation parameters
function generateIdempotencyKey(clientId: string, table: string, recordId: string | number, operation: string): string {
  const data = `${clientId}:${table}:${recordId}:${operation}`;
  return createHash('sha256').update(data).digest('hex');
}

// Check if operation was already processed
function checkIdempotency(key: string): { exists: boolean; result?: unknown } {
  const record = idempotencyStore.get(key);
  if (!record) {
    return { exists: false };
  }
  if (record.expiresAt < new Date()) {
    idempotencyStore.delete(key);
    return { exists: false };
  }
  return { exists: true, result: record.result };
}

// Record idempotency key after successful operation
function recordIdempotency(key: string, result: unknown, ttlHours: number = 24): void {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);
  idempotencyStore.set(key, { result, expiresAt });
}

// ============================================================================
// Ledger Recording for Audit Trail
// ============================================================================

interface LedgerEntry {
  id: string;
  transactionId: string;
  operation: string;
  entityType: string;
  entityId: string | number;
  userId: number;
  clientId: string;
  version: number;
  checksum: string;
  data: Record<string, unknown>;
  timestamp: Date;
  status: string;
}

// In-memory ledger (in production, use TigerBeetle or PostgreSQL)
const syncLedger: LedgerEntry[] = [];

function recordInLedger(entry: Omit<LedgerEntry, 'id' | 'transactionId' | 'checksum' | 'timestamp' | 'status'>): void {
  const transactionId = randomUUID();
  const checksum = createHash('sha256').update(JSON.stringify(entry.data)).digest('hex');
  
  const ledgerEntry: LedgerEntry = {
    ...entry,
    id: randomUUID(),
    transactionId,
    checksum,
    timestamp: new Date(),
    status: 'committed',
  };
  
  syncLedger.push(ledgerEntry);
  
  // Keep only last 10000 entries in memory
  if (syncLedger.length > 10000) {
    syncLedger.shift();
  }
  
  logger.info(`[Ledger] Recorded: ${entry.entityType}/${entry.entityId} ${entry.operation} (tx: ${transactionId})`);
}

// Get ledger entries for a user
export function getLedgerEntries(userId: number, limit: number = 100): LedgerEntry[] {
  return syncLedger
    .filter(entry => entry.userId === userId)
    .slice(-limit);
}

// Generic sync record schema
const syncRecordSchema = z.object({
  id: z.number().optional(),
  version: z.number(),
  clientId: z.string(),
  updatedAt: z.date(),
});

// Sync request schema
const syncRequestSchema = z.object({
  table: z.enum(["farmers", "farms", "crops", "livestock", "farmInputs", "harvests", "expenses"]),
  records: z.array(z.record(z.string(), z.any())),
  clientId: z.string(),
  lastSyncTime: z.date().optional(),
});

// Pull changes schema
const pullChangesSchema = z.object({
  table: z.enum(["farmers", "farms", "crops", "livestock", "farmInputs", "harvests", "expenses"]),
  lastSyncTime: z.date().optional(),
  clientId: z.string(),
});

export interface SyncRouter {
  pushChanges: (input: z.infer<typeof syncRequestSchema>) => Promise<{
    success: boolean;
    conflicts: Array<Record<string, unknown>>;
    synced: number;
  }>;
  pullChanges: (input: z.infer<typeof pullChangesSchema>) => Promise<{
    records: Array<Record<string, unknown>>;
    serverTime: Date;
  }>;
}

export async function pushChanges(input: z.infer<typeof syncRequestSchema>, userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const conflicts: Array<Record<string, unknown>> = [];
  let synced = 0;
  const skippedDueToIdempotency: string[] = [];

  const tableMap: Record<string, any> = {
    farmers: schema.farmers,
    farms: schema.farms,
    crops: schema.crops,
    livestock: schema.livestock,
    farmInputs: schema.farmInputs,
    harvests: schema.harvests,
    expenses: schema.expenses,
  };

  const table = tableMap[input.table];
  if (!table) {
    throw new Error(`Unknown table: ${input.table}`);
  }

  for (const record of input.records) {
    try {
      // Generate idempotency key for this operation
      const recordId = record.id || `new-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
      const operation = record.id ? 'update' : 'create';
      const idempotencyKey = generateIdempotencyKey(input.clientId, input.table, recordId, operation);
      
      // Check if this operation was already processed (idempotency check)
      const idempotencyCheck = checkIdempotency(idempotencyKey);
      if (idempotencyCheck.exists) {
        logger.info(`[Sync] Idempotent operation detected, skipping: ${input.table}/${recordId}`);
        skippedDueToIdempotency.push(String(recordId));
        synced++; // Count as synced since it was already processed
        continue;
      }

      if (record.id) {
        // Update existing record
        const existing = await db.select().from(table).where(eq(table.id, record.id)).limit(1);
        
        if (existing.length > 0) {
          const existingRecord = existing[0];
          
          // Check for conflicts (version mismatch)
          const recordVersion = typeof record.version === 'number' ? record.version : 1;
          if (existingRecord.version !== recordVersion - 1) {
            conflicts.push({
              id: record.id,
              clientVersion: record.version,
              serverVersion: existingRecord.version,
              record: existingRecord,
            });
            continue;
          }
        }

        // Update with incremented version
        await db
          .update(table)
          .set({
            ...record,
            version: record.version,
            updatedAt: new Date(),
            clientId: input.clientId,
          })
          .where(eq(table.id, record.id));
        
        // Record in ledger for audit trail
        recordInLedger({
          operation: 'update',
          entityType: input.table,
          entityId: record.id,
          userId,
          clientId: input.clientId,
          version: record.version,
          data: record,
        });
        
        // Record idempotency key after successful operation
        recordIdempotency(idempotencyKey, { success: true, recordId: record.id });
        
        // Publish update event
        await publishEventForTable(input.table, 'updated', { ...record, id: record.id });
        
        synced++;
      } else {
        // Insert new record
        const { id, ...recordWithoutId } = record;
        const finalInsertData = {
          ...recordWithoutId,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          clientId: input.clientId,
        };
        
        const insertResult = await db.insert(table).values(finalInsertData as any).returning();
        const insertedRecord = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        
        // Record in ledger for audit trail
        recordInLedger({
          operation: 'create',
          entityType: input.table,
          entityId: insertedRecord.id,
          userId,
          clientId: input.clientId,
          version: 1,
          data: insertedRecord,
        });
        
        // Record idempotency key after successful operation
        recordIdempotency(idempotencyKey, { success: true, recordId: insertedRecord.id });
        
        // Publish create event
        await publishEventForTable(input.table, 'created', insertedRecord);
        
        synced++;
      }
    } catch (error) {
      logger.error(`Error syncing record:`, error);
      conflicts.push({
        id: record.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    success: conflicts.length === 0,
    conflicts,
    synced,
    skippedDueToIdempotency,
  };
}

export async function pullChanges(input: z.infer<typeof pullChangesSchema>, userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const tableMap: Record<string, any> = {
    farmers: schema.farmers,
    farms: schema.farms,
    crops: schema.crops,
    livestock: schema.livestock,
    farmInputs: schema.farmInputs,
    harvests: schema.harvests,
    expenses: schema.expenses,
  };

  const table = tableMap[input.table];
  if (!table) {
    throw new Error(`Unknown table: ${input.table}`);
  }

  // Build query with userId filter
  let conditions = [eq(table.userId, userId)];

  // Only fetch records updated after lastSyncTime
  if (input.lastSyncTime) {
    conditions.push(gt(table.updatedAt, input.lastSyncTime));
  }

  const query = db.select().from(table).where(and(...conditions));
  const records = await query;

  return {
    records,
    serverTime: new Date(),
  };
}

// Helper function to emit WebSocket events for real-time sync
function emitWebSocketSyncEvent(userId: number, entityType: string, entityId: number, action: string, data: Record<string, unknown>, clientId: string) {
  try {
    const wsServer = getWebSocketServer();
    if (wsServer) {
      wsServer.emitToUser(userId, {
        type: action === 'created' ? 'farmer_created' : 
              action === 'updated' ? 'farmer_updated' : 'notification',
        userId,
        data: {
          entityType,
          entityId,
          action,
          record: data,
          clientId,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
      logger.info(`[WebSocket] Emitted sync event: ${entityType}/${entityId} ${action} to user ${userId}`);
    }
  } catch (error) {
    logger.error(`[WebSocket] Failed to emit sync event:`, error);
    // Don't throw - WebSocket emission should not block sync operations
  }
}

// Helper function to publish events based on table name
async function publishEventForTable(table: string, action: 'created' | 'updated' | 'deleted', data: Record<string, any>) {
  try {
    const entityId = data.id || 0;
    const userId = data.userId || 0;
    
    // Emit WebSocket event for real-time sync
    emitWebSocketSyncEvent(userId, table, entityId, action, data, data.clientId || '');
    
    switch (table) {
      case 'farmers':
        if (action === 'created') await publishFarmerCreated(entityId, userId, data);
        else if (action === 'updated') await publishFarmerUpdated(entityId, userId, data);
        else if (action === 'deleted') await publishFarmerDeleted(entityId, userId);
        break;
      case 'farms':
        if (action === 'created') await publishFarmCreated(entityId, userId, data);
        else if (action === 'updated') await publishFarmUpdated(entityId, userId, data);
        else if (action === 'deleted') await publishFarmDeleted(entityId, userId, data);
        break;
      case 'crops':
        if (action === 'created') await publishCropCreated(entityId, userId, data);
        else if (action === 'updated') await publishCropUpdated(entityId, userId, data);
        else if (action === 'deleted') await publishCropDeleted(entityId, userId, data);
        break;
      case 'livestock':
        if (action === 'created') await publishLivestockCreated(entityId, userId, data);
        else if (action === 'updated') await publishLivestockUpdated(entityId, userId, data);
        else if (action === 'deleted') await publishLivestockDeleted(entityId, userId, data);
        break;
      case 'harvests':
        if (action === 'created') await publishHarvestCreated(entityId, userId, data);
        else if (action === 'updated') await publishHarvestUpdated(entityId, userId, data);
        else if (action === 'deleted') await publishHarvestDeleted(entityId, userId, data);
        break;
      case 'expenses':
        if (action === 'created') await publishExpenseCreated(entityId, userId, data);
        else if (action === 'updated') await publishExpenseUpdated(entityId, userId, data);
        else if (action === 'deleted') await publishExpenseDeleted(entityId, userId, data);
        break;
      case 'farmInputs':
        // Farm inputs can be published as farm events or create a separate producer
        logger.info(`[Event] FarmInput ${action}:`, data.id);
        break;
      default:
        logger.warn(`[Event] No event producer for table: ${table}`);
    }
  } catch (error) {
    logger.error(`[Event] Failed to publish ${action} event for ${table}:`, error);
    // Don't throw - event publishing should not block sync operations
  }
}

export const syncRequestSchemaExport = syncRequestSchema;
export const pullChangesSchemaExport = pullChangesSchema;
