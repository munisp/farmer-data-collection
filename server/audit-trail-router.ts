import { z } from 'zod';
import { publicProcedure, router } from './_core/trpc-base.js';
import { getDb } from './db';
import { auditLogs } from '../drizzle/schema.js';
import { desc, eq, and, gte, lte, like, or, sql } from 'drizzle-orm';

export const auditTrailRouter = router({
  // Get audit logs with pagination and filters
  getLogs: publicProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(50),
      eventType: z.string().optional(),
      entityType: z.string().optional(),
      userId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }: { input: { page: number; pageSize: number; eventType?: string; entityType?: string; userId?: number; startDate?: string; endDate?: string; search?: string } }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const { page, pageSize, eventType, entityType, userId, startDate, endDate, search } = input;
      const offset = (page - 1) * pageSize;

      // Build where conditions
      const conditions = [];
      
      if (eventType) {
        conditions.push(eq(auditLogs.eventType, eventType));
      }
      
      if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
      }
      
      if (userId) {
        conditions.push(eq(auditLogs.userId, userId));
      }
      
      if (startDate) {
        conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
      }
      
      if (endDate) {
        conditions.push(lte(auditLogs.timestamp, new Date(endDate)));
      }
      
      if (search) {
        conditions.push(
          or(
            like(auditLogs.entityId, `%${search}%`),
            like(auditLogs.eventId, `%${search}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereClause);
      
      const total = totalResult[0]?.count || 0;

      // Get paginated logs
      const logs = await db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.timestamp))
        .limit(pageSize)
        .offset(offset);

      return {
        logs,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }),

  // Get audit log by ID
  getLogById: publicProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }: { input: { id: number } }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const [log] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.id, input.id))
        .limit(1);

      if (!log) {
        throw new Error('Audit log not found');
      }

      return log;
    }),

  // Get audit statistics
  getStatistics: publicProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }: { input: { startDate?: string; endDate?: string } }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const { startDate, endDate } = input;
      
      const conditions = [];
      if (startDate) {
        conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
      }
      if (endDate) {
        conditions.push(lte(auditLogs.timestamp, new Date(endDate)));
      }
      
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Get all logs for the period
      const logs = await db
        .select()
        .from(auditLogs)
        .where(whereClause);

      // Calculate statistics
      const eventTypeCounts: Record<string, number> = {};
      const entityTypeCounts: Record<string, number> = {};
      const userActivityCounts: Record<number, number> = {};

      for (const log of logs) {
        // Count by event type
        eventTypeCounts[log.eventType] = (eventTypeCounts[log.eventType] || 0) + 1;
        
        // Count by entity type
        entityTypeCounts[log.entityType] = (entityTypeCounts[log.entityType] || 0) + 1;
        
        // Count by user
        userActivityCounts[log.userId] = (userActivityCounts[log.userId] || 0) + 1;
      }

      return {
        totalEvents: logs.length,
        eventTypeCounts,
        entityTypeCounts,
        userActivityCounts,
        topUsers: Object.entries(userActivityCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([userId, count]) => ({ userId: parseInt(userId), count })),
      };
    }),

  // Get user activity timeline
  getUserActivity: publicProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }: { input: { userId: number; limit: number } }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, input.userId))
        .orderBy(desc(auditLogs.timestamp))
        .limit(input.limit);

      return logs;
    }),

  // Get entity change history
  getEntityHistory: publicProcedure
    .input(z.object({
      entityType: z.string(),
      entityId: z.string(),
    }))
    .query(async ({ input }: { input: { entityType: string; entityId: string } }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, input.entityType),
            eq(auditLogs.entityId, input.entityId)
          )
        )
        .orderBy(desc(auditLogs.timestamp));

      return logs;
    }),
});
