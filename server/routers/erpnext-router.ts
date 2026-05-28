import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import {
  erpnextConfig,
  erpnextSyncConfig,
  erpnextSyncMapping,
  erpnextSyncLog,
} from "../../drizzle/erpnext-schema.js";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ERPNextSyncService } from "../services/erpnext/erpnext-sync-service.js";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { logger } from '../logger.js';

/**
 * ERPNext Integration Router
 * 
 * Endpoints for configuring and managing ERPNext synchronization
 */

// Encryption key derived from environment variable or default (should be set in production)
const ENCRYPTION_KEY = process.env.ERPNEXT_ENCRYPTION_KEY || 'farmer-data-collection-default-key-32';
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt sensitive data (API keys, secrets)
 */
function encryptApiKey(plaintext: string): string {
  const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Return iv:authTag:encrypted format
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data (API keys, secrets)
 */
function decryptApiKey(ciphertext: string): string {
  try {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      // Not encrypted (legacy data), return as-is
      return ciphertext;
    }
    
    const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // If decryption fails, assume it's unencrypted legacy data
    logger.warn('[ERPNext] Failed to decrypt, assuming legacy unencrypted data');
    return ciphertext;
  }
}

export const erpnextRouter = router({
  // Configuration Management
  saveConfig: protectedProcedure
    .input(
      z.object({
        erpnextUrl: z.string().url(),
        apiKey: z.string().min(1),
        apiSecret: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = Number(ctx.user.id);

      // Check if config exists
      const existing = await db
        .select()
        .from(erpnextConfig)
        .where(eq(erpnextConfig.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(erpnextConfig)
          .set({
            erpnextUrl: input.erpnextUrl,
            apiKey: encryptApiKey(input.apiKey),
            apiSecret: encryptApiKey(input.apiSecret),
            updatedAt: new Date(),
          })
          .where(eq(erpnextConfig.userId, userId));
      } else {
        // Create new
        await db.insert(erpnextConfig).values({
          userId,
          erpnextUrl: input.erpnextUrl,
          apiKey: encryptApiKey(input.apiKey),
          apiSecret: encryptApiKey(input.apiSecret),
          syncEnabled: true,
        });
      }

      return { success: true };
    }),

  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const userId = Number(ctx.user.id);

    const configs = await db
      .select()
      .from(erpnextConfig)
      .where(eq(erpnextConfig.userId, userId))
      .limit(1);

    if (configs.length === 0) {
      return null;
    }

    const config = configs[0];
    return {
      erpnextUrl: config.erpnextUrl,
      apiKey: config.apiKey.substring(0, 8) + "...", // Masked
      syncEnabled: config.syncEnabled,
      lastSyncAt: config.lastSyncAt,
    };
  }),

  testConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = Number(ctx.user.id);

    try {
      const syncService = new ERPNextSyncService();
      await syncService.initialize(userId);
      const isConnected = await syncService.testConnection();

      return {
        success: isConnected,
        message: isConnected ? "Connection successful" : "Connection failed",
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: (error instanceof Error ? error.message : String(error)),
      };
    }
  }),

  deleteConfig: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const userId = Number(ctx.user.id);

    await db.delete(erpnextConfig).where(eq(erpnextConfig.userId, userId));

    return { success: true };
  }),

  // Sync Configuration
  configureSyncEntity: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["customer", "supplier", "item", "invoice", "payment", "journal"]),
        syncEnabled: z.boolean(),
        syncDirection: z.enum(["push", "pull", "both"]).optional(),
        conflictResolution: z.enum(["erpnext_wins", "platform_wins", "manual"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = Number(ctx.user.id);

      // Check if config exists
      const existing = await db
        .select()
        .from(erpnextSyncConfig)
        .where(
          and(
            eq(erpnextSyncConfig.userId, userId),
            eq(erpnextSyncConfig.entityType, input.entityType)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        await db
          .update(erpnextSyncConfig)
          .set({
            syncEnabled: input.syncEnabled,
            syncDirection: input.syncDirection || "both",
            conflictResolution: input.conflictResolution || "erpnext_wins",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(erpnextSyncConfig.userId, userId),
              eq(erpnextSyncConfig.entityType, input.entityType)
            )
          );
      } else {
        // Create new
        await db.insert(erpnextSyncConfig).values({
          userId,
          entityType: input.entityType,
          syncEnabled: input.syncEnabled,
          syncDirection: input.syncDirection || "both",
          conflictResolution: input.conflictResolution || "erpnext_wins",
        });
      }

      return { success: true };
    }),

  getSyncConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const userId = Number(ctx.user.id);

    const configs = await db
      .select()
      .from(erpnextSyncConfig)
      .where(eq(erpnextSyncConfig.userId, userId));

    return configs;
  }),

  // Manual Sync Triggers
  triggerSync: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["customer", "supplier", "item", "invoice", "payment", "journal"]),
        direction: z.enum(["push", "pull", "both"]),
        entityId: z.number().optional(), // If specified, sync single entity
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = Number(ctx.user.id);

      try {
        const syncService = new ERPNextSyncService();
        await syncService.initialize(userId);

        let result;

        // Handle push sync (Platform → ERPNext)
        if (input.direction === 'push' || input.direction === 'both') {
          if (input.entityId) {
            // Sync single entity
            switch (input.entityType) {
              case 'customer':
                result = await syncService.pushCustomer(userId, input.entityId.toString());
                break;
              case 'supplier':
                result = await syncService.pushSupplier(userId, input.entityId.toString());
                break;
              case 'item':
                result = await syncService.pushItem(userId, input.entityId.toString());
                break;
              case 'invoice':
                result = await syncService.pushInvoice(userId, input.entityId.toString());
                break;
              case 'payment':
                result = await syncService.pushPayment(userId, input.entityId.toString());
                break;
              case 'journal':
                result = await syncService.pushJournalEntry(userId, input.entityId.toString());
                break;
            }
          }
        }

        // Handle pull sync (ERPNext → Platform)
        if (input.direction === 'pull' || input.direction === 'both') {
          switch (input.entityType) {
            case 'customer':
              result = await syncService.pullCustomers();
              break;
            case 'supplier':
              result = await syncService.pullSuppliers();
              break;
            case 'item':
              result = await syncService.pullItems();
              break;
            case 'invoice':
              result = await syncService.pullInvoices();
              break;
            case 'payment':
              result = await syncService.pullPayments();
              break;
            case 'journal':
              result = await syncService.pullJournalEntries();
              break;
          }
        }

        // Handle different return types from sync operations
        const syncResult: any = result || {};
        return {
          success: syncResult.success !== false,
          message: `Sync completed for ${input.entityType}`,
          recordsProcessed: syncResult.recordsProcessed || syncResult.count || 0,
          recordsCreated: syncResult.recordsCreated || 0,
          recordsUpdated: syncResult.recordsUpdated || 0,
          recordsFailed: syncResult.recordsFailed || 0,
          errors: syncResult.errors || (syncResult.error ? [syncResult.error] : []),
        };
      } catch (error: unknown) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }),

  // Sync Monitoring
  getSyncStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const userId = Number(ctx.user.id);

    // Get config
    const configs = await db
      .select()
      .from(erpnextConfig)
      .where(eq(erpnextConfig.userId, userId))
      .limit(1);

    if (configs.length === 0) {
      return {
        configured: false,
        syncEnabled: false,
        lastSyncAt: null,
        totalSynced: 0,
        pendingSync: 0,
        errorCount: 0,
      };
    }

    const config = configs[0];

    // Get statistics
    const logs = await db
      .select()
      .from(erpnextSyncLog)
      .where(eq(erpnextSyncLog.userId, userId));

    const totalSynced = logs.filter((log) => log.status === "success").length;
    const errorCount = logs.filter((log) => log.status === "error").length;
    
    // Calculate pending sync from sync queue (logs with pending status)
    const pendingSync = logs.filter((log) => log.status === "pending").length;

    return {
      configured: true,
      syncEnabled: config.syncEnabled,
      lastSyncAt: config.lastSyncAt,
      totalSynced,
      pendingSync,
      errorCount,
    };
  }),

  getSyncHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        entityType: z.string().optional(),
        status: z.enum(["success", "error", "pending"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = Number(ctx.user.id);

      // Build where conditions
      const conditions = [eq(erpnextSyncLog.userId, userId)];

      if (input.entityType) {
        conditions.push(eq(erpnextSyncLog.entityType, input.entityType));
      }

      if (input.status) {
        conditions.push(eq(erpnextSyncLog.status, input.status));
      }

      const logs = await db
        .select()
        .from(erpnextSyncLog)
        .where(and(...conditions))
        .orderBy(desc(erpnextSyncLog.createdAt))
        .limit(input.limit);

      return logs;
    }),

  getSyncStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const userId = Number(ctx.user.id);

    const logs = await db
      .select()
      .from(erpnextSyncLog)
      .where(eq(erpnextSyncLog.userId, userId));

    const stats = {
      customer: { success: 0, error: 0, total: 0 },
      supplier: { success: 0, error: 0, total: 0 },
      item: { success: 0, error: 0, total: 0 },
      invoice: { success: 0, error: 0, total: 0 },
      payment: { success: 0, error: 0, total: 0 },
      journal: { success: 0, error: 0, total: 0 },
    };

    logs.forEach((log) => {
      const entityType = log.entityType as keyof typeof stats;
      if (stats[entityType]) {
        stats[entityType].total++;
        if (log.status === "success") {
          stats[entityType].success++;
        } else if (log.status === "error") {
          stats[entityType].error++;
        }
      }
    });

    return stats;
  }),

  getEntityMappings: protectedProcedure
    .input(
      z.object({
        entityType: z.string(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = Number(ctx.user.id);

      const mappings = await db
        .select()
        .from(erpnextSyncMapping)
        .where(
          and(
            eq(erpnextSyncMapping.userId, userId),
            eq(erpnextSyncMapping.entityType, input.entityType)
          )
        )
        .orderBy(desc(erpnextSyncMapping.lastSyncedAt))
        .limit(input.limit);

      return mappings;
    }),

  deleteMapping: protectedProcedure
    .input(
      z.object({
        mappingId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const userId = Number(ctx.user.id);

      await db
        .delete(erpnextSyncMapping)
        .where(
          and(
            eq(erpnextSyncMapping.id, input.mappingId),
            eq(erpnextSyncMapping.userId, userId)
          )
        );

      return { success: true };
    }),
});
