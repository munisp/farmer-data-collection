/**
 * Agent Productivity Router
 * Task management, route planning, and visit tracking for field agents
 */

import { router, protectedProcedure } from '../_core/trpc-base.js';
import { z } from 'zod';
import { getDb } from '../db.js';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  agentTasks,
  agentVisits,
  agentRoutes,
  agentPerformanceMetrics,
  agentTerritories,
} from '../../drizzle/agent-productivity-schema.js';

export const agentProductivityRouter = router({
  // Get tasks for agent
  getTasks: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue']).optional(),
      date: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: (ReturnType<typeof eq> | ReturnType<typeof gte> | ReturnType<typeof lte>)[] = [eq(agentTasks.agentId, input.agentId)];
      
      if (input.status) {
        conditions.push(eq(agentTasks.status, input.status));
      }
      
      if (input.date) {
        const dateStart = new Date(input.date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(input.date);
        dateEnd.setHours(23, 59, 59, 999);
        conditions.push(gte(agentTasks.scheduledDate, dateStart));
        conditions.push(lte(agentTasks.scheduledDate, dateEnd));
      }
      
      const tasks = await db
        .select()
        .from(agentTasks)
        .where(and(...conditions))
        .orderBy(agentTasks.scheduledDate, agentTasks.priority)
        .limit(input.limit)
        .offset(input.offset);
      
      return tasks;
    }),

  // Get today's tasks
  getTodaysTasks: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const tasks = await db
        .select()
        .from(agentTasks)
        .where(and(
          eq(agentTasks.agentId, input.agentId),
          gte(agentTasks.scheduledDate, today),
          lte(agentTasks.scheduledDate, tomorrow)
        ))
        .orderBy(agentTasks.scheduledTime, agentTasks.priority);
      
      return tasks;
    }),

  // Get task by ID
  getTaskById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [task] = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.id, input.id));
      
      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      
      // Get visits for this task
      const visits = await db
        .select()
        .from(agentVisits)
        .where(eq(agentVisits.taskId, input.id))
        .orderBy(desc(agentVisits.visitDate));
      
      return { ...task, visits };
    }),

  // Create task
  createTask: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      assignedBy: z.number().optional(),
      taskType: z.enum(['farmer_registration', 'farm_visit', 'loan_assessment', 'loan_disbursement', 'repayment_collection', 'harvest_verification', 'quality_inspection', 'training_delivery', 'cooperative_meeting', 'follow_up', 'complaint_resolution', 'kyc_verification', 'other']),
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
      targetFarmerId: z.number().optional(),
      targetFarmId: z.number().optional(),
      targetCooperativeId: z.number().optional(),
      locationName: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      scheduledDate: z.string().optional(),
      scheduledTime: z.string().optional(),
      dueDate: z.string().optional(),
      estimatedDuration: z.number().optional(),
      relatedLoanId: z.number().optional(),
      relatedOrderId: z.number().optional(),
      isOfflineCreated: z.boolean().default(false),
      offlineId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [task] = await db
        .insert(agentTasks)
        .values({
          ...input,
          taskCode: `TASK-${Date.now()}`,
          status: 'assigned',
          latitude: input.latitude ? String(input.latitude) : undefined,
          longitude: input.longitude ? String(input.longitude) : undefined,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        })
        .returning();
      
      return task;
    }),

  // Update task status
  updateTaskStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue']),
      outcome: z.enum(['successful', 'farmer_absent', 'rescheduled', 'partial', 'unsuccessful', 'cancelled']).optional(),
      outcomeNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { id, ...data } = input;
      
      const updateData: Record<string, unknown> = {
        ...data,
        updatedAt: new Date(),
      };
      
      if (input.status === 'in_progress') {
        updateData.startedAt = new Date();
      }
      
      if (input.status === 'completed') {
        updateData.completedAt = new Date();
      }
      
      const [updated] = await db
        .update(agentTasks)
        .set(updateData)
        .where(eq(agentTasks.id, id))
        .returning();
      
      return updated;
    }),

  // Record visit
  recordVisit: protectedProcedure
    .input(z.object({
      taskId: z.number().optional(),
      agentId: z.number(),
      farmerId: z.number().optional(),
      farmId: z.number().optional(),
      checkInLatitude: z.number().optional(),
      checkInLongitude: z.number().optional(),
      checkInTime: z.string().optional(),
      checkOutLatitude: z.number().optional(),
      checkOutLongitude: z.number().optional(),
      checkOutTime: z.string().optional(),
      distanceFromTarget: z.number().optional(),
      outcome: z.enum(['successful', 'farmer_absent', 'rescheduled', 'partial', 'unsuccessful', 'cancelled']),
      notes: z.string().optional(),
      dataCollected: z.any().optional(),
      photoUrls: z.array(z.string()).optional(),
      farmerSignature: z.string().optional(),
      agentSignature: z.string().optional(),
      requiresFollowUp: z.boolean().default(false),
      followUpDate: z.string().optional(),
      followUpNotes: z.string().optional(),
      isOfflineCreated: z.boolean().default(false),
      offlineId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [visit] = await db
        .insert(agentVisits)
        .values({
          ...input,
          checkInLatitude: input.checkInLatitude ? String(input.checkInLatitude) : undefined,
          checkInLongitude: input.checkInLongitude ? String(input.checkInLongitude) : undefined,
          checkInTime: input.checkInTime ? new Date(input.checkInTime) : undefined,
          checkOutLatitude: input.checkOutLatitude ? String(input.checkOutLatitude) : undefined,
          checkOutLongitude: input.checkOutLongitude ? String(input.checkOutLongitude) : undefined,
          checkOutTime: input.checkOutTime ? new Date(input.checkOutTime) : undefined,
          distanceFromTarget: input.distanceFromTarget ? String(input.distanceFromTarget) : undefined,
          photoUrls: input.photoUrls ? JSON.stringify(input.photoUrls) : undefined,
          followUpDate: input.followUpDate ? new Date(input.followUpDate) : undefined,
        })
        .returning();
      
      // Update task if linked
      if (input.taskId) {
        await db
          .update(agentTasks)
          .set({
            status: input.outcome === 'successful' ? 'completed' : 'in_progress',
            outcome: input.outcome,
            outcomeNotes: input.notes,
            completedAt: input.outcome === 'successful' ? new Date() : undefined,
            updatedAt: new Date(),
          })
          .where(eq(agentTasks.id, input.taskId));
      }
      
      return visit;
    }),

  // Get visits
  getVisits: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: (ReturnType<typeof eq> | ReturnType<typeof gte> | ReturnType<typeof lte>)[] = [eq(agentVisits.agentId, input.agentId)];
      
      if (input.startDate) {
        conditions.push(gte(agentVisits.visitDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(agentVisits.visitDate, new Date(input.endDate)));
      }
      
      const visits = await db
        .select()
        .from(agentVisits)
        .where(and(...conditions))
        .orderBy(desc(agentVisits.visitDate))
        .limit(input.limit);
      
      return visits;
    }),

  // Get/create route for date
  getRoute: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      date: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const routeDate = new Date(input.date);
      routeDate.setHours(0, 0, 0, 0);
      
      const [route] = await db
        .select()
        .from(agentRoutes)
        .where(and(
          eq(agentRoutes.agentId, input.agentId),
          eq(agentRoutes.routeDate, routeDate)
        ));
      
      return route;
    }),

  // Create/update route
  saveRoute: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      routeDate: z.string(),
      routeName: z.string().optional(),
      plannedStops: z.any(),
      totalDistance: z.number().optional(),
      estimatedDuration: z.number().optional(),
      optimizedOrder: z.array(z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const routeDate = new Date(input.routeDate);
      routeDate.setHours(0, 0, 0, 0);
      
      // Check if route exists
      const [existing] = await db
        .select()
        .from(agentRoutes)
        .where(and(
          eq(agentRoutes.agentId, input.agentId),
          eq(agentRoutes.routeDate, routeDate)
        ));
      
      if (existing) {
        const [updated] = await db
          .update(agentRoutes)
          .set({
            routeName: input.routeName,
            plannedStops: input.plannedStops,
            totalDistance: input.totalDistance ? String(input.totalDistance) : undefined,
            estimatedDuration: input.estimatedDuration,
            optimizedOrder: input.optimizedOrder ? JSON.stringify(input.optimizedOrder) : undefined,
            updatedAt: new Date(),
          })
          .where(eq(agentRoutes.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db
          .insert(agentRoutes)
          .values({
            agentId: input.agentId,
            routeDate,
            routeName: input.routeName,
            plannedStops: input.plannedStops,
            totalDistance: input.totalDistance ? String(input.totalDistance) : undefined,
            estimatedDuration: input.estimatedDuration,
            optimizedOrder: input.optimizedOrder ? JSON.stringify(input.optimizedOrder) : undefined,
            status: 'planned',
          })
          .returning();
        return created;
      }
    }),

  // Start route
  startRoute: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(agentRoutes)
        .set({
          status: 'in_progress',
          actualStartTime: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentRoutes.id, input.id))
        .returning();
      
      return updated;
    }),

  // End route
  endRoute: protectedProcedure
    .input(z.object({
      id: z.number(),
      actualDistance: z.number().optional(),
      stopsCompleted: z.number(),
      stopsSkipped: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [updated] = await db
        .update(agentRoutes)
        .set({
          status: 'completed',
          actualEndTime: new Date(),
          actualDistance: input.actualDistance ? String(input.actualDistance) : undefined,
          stopsCompleted: input.stopsCompleted,
          stopsSkipped: input.stopsSkipped,
          updatedAt: new Date(),
        })
        .where(eq(agentRoutes.id, input.id))
        .returning();
      
      return updated;
    }),

  // Get performance metrics
  getPerformanceMetrics: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      periodType: z.enum(['daily', 'weekly', 'monthly']).default('monthly'),
      limit: z.number().default(12),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const metrics = await db
        .select()
        .from(agentPerformanceMetrics)
        .where(and(
          eq(agentPerformanceMetrics.agentId, input.agentId),
          eq(agentPerformanceMetrics.periodType, input.periodType)
        ))
        .orderBy(desc(agentPerformanceMetrics.periodStart))
        .limit(input.limit);
      
      return metrics;
    }),

  // Calculate performance metrics
  calculateMetrics: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      periodType: z.enum(['daily', 'weekly', 'monthly']),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const startDate = new Date(input.periodStart);
      const endDate = new Date(input.periodEnd);
      
      // Get tasks in period
      const tasks = await db
        .select()
        .from(agentTasks)
        .where(and(
          eq(agentTasks.agentId, input.agentId),
          gte(agentTasks.scheduledDate, startDate),
          lte(agentTasks.scheduledDate, endDate)
        ));
      
      // Get visits in period
      const visits = await db
        .select()
        .from(agentVisits)
        .where(and(
          eq(agentVisits.agentId, input.agentId),
          gte(agentVisits.visitDate, startDate),
          lte(agentVisits.visitDate, endDate)
        ));
      
      // Calculate metrics
      const tasksAssigned = tasks.length;
      const tasksCompleted = tasks.filter(t => t.status === 'completed').length;
      const tasksOverdue = tasks.filter(t => t.status === 'overdue').length;
      const taskCompletionRate = tasksAssigned > 0 ? (tasksCompleted / tasksAssigned) * 100 : 0;
      
      const visitsPlanned = visits.length;
      const visitsCompleted = visits.filter(v => v.outcome === 'successful').length;
      const visitSuccessRate = visitsPlanned > 0 ? (visitsCompleted / visitsPlanned) * 100 : 0;
      
      // Count registrations
      const farmersRegistered = tasks.filter(t => t.taskType === 'farmer_registration' && t.status === 'completed').length;
      
      const [metric] = await db
        .insert(agentPerformanceMetrics)
        .values({
          agentId: input.agentId,
          periodType: input.periodType,
          periodStart: startDate,
          periodEnd: endDate,
          tasksAssigned,
          tasksCompleted,
          tasksOverdue,
          taskCompletionRate: String(taskCompletionRate),
          visitsPlanned,
          visitsCompleted,
          visitSuccessRate: String(visitSuccessRate),
          farmersRegistered,
        })
        .returning();
      
      return metric;
    }),

  // Get agent territory
  getTerritory: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [territory] = await db
        .select()
        .from(agentTerritories)
        .where(and(
          eq(agentTerritories.agentId, input.agentId),
          eq(agentTerritories.isActive, true)
        ));
      
      return territory;
    }),

  // Assign territory
  assignTerritory: protectedProcedure
    .input(z.object({
      agentId: z.number(),
      territoryName: z.string(),
      villages: z.array(z.string()).optional(),
      districts: z.array(z.string()).optional(),
      regions: z.array(z.string()).optional(),
      boundaryPolygon: z.any().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Deactivate existing territories
      await db
        .update(agentTerritories)
        .set({ isActive: false })
        .where(eq(agentTerritories.agentId, input.agentId));
      
      const [territory] = await db
        .insert(agentTerritories)
        .values({
          agentId: input.agentId,
          territoryName: input.territoryName,
          villages: input.villages ? JSON.stringify(input.villages) : undefined,
          districts: input.districts ? JSON.stringify(input.districts) : undefined,
          regions: input.regions ? JSON.stringify(input.regions) : undefined,
          boundaryPolygon: input.boundaryPolygon,
          isActive: true,
        })
        .returning();
      
      return territory;
    }),

  // Get dashboard stats
  getDashboardStats: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Today's tasks
      const [todayStats] = await db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`count(*) filter (where status = 'completed')`,
          pending: sql<number>`count(*) filter (where status in ('pending', 'assigned'))`,
          inProgress: sql<number>`count(*) filter (where status = 'in_progress')`,
        })
        .from(agentTasks)
        .where(and(
          eq(agentTasks.agentId, input.agentId),
          gte(agentTasks.scheduledDate, today),
          lte(agentTasks.scheduledDate, tomorrow)
        ));
      
      // This week's visits
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const [weekStats] = await db
        .select({
          totalVisits: sql<number>`count(*)`,
          successfulVisits: sql<number>`count(*) filter (where outcome = 'successful')`,
        })
        .from(agentVisits)
        .where(and(
          eq(agentVisits.agentId, input.agentId),
          gte(agentVisits.visitDate, weekStart),
          lte(agentVisits.visitDate, weekEnd)
        ));
      
      // Overdue tasks
      const [overdueCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentTasks)
        .where(and(
          eq(agentTasks.agentId, input.agentId),
          eq(agentTasks.status, 'overdue')
        ));
      
      return {
        today: {
          total: todayStats?.total || 0,
          completed: todayStats?.completed || 0,
          pending: todayStats?.pending || 0,
          inProgress: todayStats?.inProgress || 0,
        },
        week: {
          totalVisits: weekStats?.totalVisits || 0,
          successfulVisits: weekStats?.successfulVisits || 0,
        },
        overdue: overdueCount?.count || 0,
      };
    }),
});
