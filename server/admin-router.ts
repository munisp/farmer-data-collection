import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db";
import { users, farmers, farms, crops, livestock, harvests, expenses, auditLogs } from "../drizzle/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { requireAdmin } from "./permify-middleware.js";

// Admin middleware - uses Permify for fine-grained authorization
const adminProcedure = protectedProcedure.use(requireAdmin());

export const adminRouter = router({
  // Get all users with pagination
  getUsers: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { page, pageSize, search } = input;
      const offset = (page - 1) * pageSize;

      const allUsers = await db
        .select()
        .from(users)
        .where(
          search
            ? sql`${users.email} ILIKE ${`%${search}%`} OR ${users.firstName} ILIKE ${`%${search}%`} OR ${users.lastName} ILIKE ${`%${search}%`}`
            : sql`1=1`
        )
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset);

      const totalCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(users);

      return {
        users: allUsers.map((u) => ({
          ...u,
          password: undefined, // Don't send passwords
        })),
        total: Number(totalCount[0]?.count || 0),
        page,
        pageSize,
      };
    }),

  // Get user details with statistics
  getUserDetails: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Get user statistics
      const farmerCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(farmers)
        .where(eq(farmers.userId, input.userId));

      const farmCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(farms)
        .where(eq(farms.userId, input.userId));

      const cropCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(crops)
        .where(eq(crops.userId, input.userId));

      const livestockCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(livestock)
        .where(eq(livestock.userId, input.userId));

      const harvestCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(harvests)
        .where(eq(harvests.userId, input.userId));

      const expenseCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(expenses)
        .where(eq(expenses.userId, input.userId));

      const totalExpenses = await db
        .select({ sum: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
        .from(expenses)
        .where(eq(expenses.userId, input.userId));

      return {
        user: {
          ...user[0],
          password: undefined,
        },
        statistics: {
          farmers: Number(farmerCount[0]?.count || 0),
          farms: Number(farmCount[0]?.count || 0),
          crops: Number(cropCount[0]?.count || 0),
          livestock: Number(livestockCount[0]?.count || 0),
          harvests: Number(harvestCount[0]?.count || 0),
          expenses: Number(expenseCount[0]?.count || 0),
          totalExpenseAmount: Number(totalExpenses[0]?.sum || 0),
        },
      };
    }),

  // Update user
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        role: z.enum(["farmer", "admin", "viewer"]).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { userId, ...updates } = input;

      const result = await db
        .update(users)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return {
        ...result[0],
        password: undefined,
      };
    }),

  // Get system analytics
  getSystemAnalytics: adminProcedure.query(async () => {
    const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Total counts
    const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
    const totalFarmers = await db.select({ count: sql<number>`count(*)` }).from(farmers);
    const totalFarms = await db.select({ count: sql<number>`count(*)` }).from(farms);
    const totalCrops = await db.select({ count: sql<number>`count(*)` }).from(crops);
    const totalLivestock = await db.select({ count: sql<number>`count(*)` }).from(livestock);
    const totalHarvests = await db.select({ count: sql<number>`count(*)` }).from(harvests);
    const totalExpenses = await db.select({ count: sql<number>`count(*)` }).from(expenses);

    // Active users (logged in within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeUsers = await db
      .select({ count: sql<number>`count(DISTINCT ${auditLogs.userId})` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.eventType, "LOGIN"),
          gte(auditLogs.timestamp, sevenDaysAgo)
        )
      );

    // New users this month
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const newUsersThisMonth = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(gte(users.createdAt, firstDayOfMonth));

    // Total expense amount
    const totalExpenseAmount = await db
      .select({ sum: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses);

    // Users by role
    const usersByRole = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .groupBy(users.role);

    return {
      totals: {
        users: Number(totalUsers[0]?.count || 0),
        farmers: Number(totalFarmers[0]?.count || 0),
        farms: Number(totalFarms[0]?.count || 0),
        crops: Number(totalCrops[0]?.count || 0),
        livestock: Number(totalLivestock[0]?.count || 0),
        harvests: Number(totalHarvests[0]?.count || 0),
        expenses: Number(totalExpenses[0]?.count || 0),
        totalExpenseAmount: Number(totalExpenseAmount[0]?.sum || 0),
      },
      activity: {
        activeUsers: Number(activeUsers[0]?.count || 0),
        newUsersThisMonth: Number(newUsersThisMonth[0]?.count || 0),
      },
      usersByRole: usersByRole.map((r) => ({
        role: r.role,
        count: Number(r.count),
      })),
    };
  }),

  // Get audit logs with filtering
  getAuditLogs: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(50),
        userId: z.number().optional(),
        eventType: z.string().optional(),
        entityType: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const { page, pageSize, userId, eventType, entityType, startDate, endDate } = input;
      const offset = (page - 1) * pageSize;

      let conditions = [];

      if (userId) {
        conditions.push(eq(auditLogs.userId, userId));
      }

      if (eventType) {
        conditions.push(eq(auditLogs.eventType, eventType));
      }

      if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
      }

      if (startDate) {
        conditions.push(gte(auditLogs.timestamp, startDate));
      }

      if (endDate) {
        conditions.push(lte(auditLogs.timestamp, endDate));
      }

      const logs = await (conditions.length > 0
        ? db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.timestamp)).limit(pageSize).offset(offset)
        : db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(pageSize).offset(offset));

      const totalCount = await (conditions.length > 0
        ? db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(and(...conditions))
        : db.select({ count: sql<number>`count(*)` }).from(auditLogs));

      return {
        logs,
        total: Number(totalCount[0]?.count || 0),
        page,
        pageSize,
      };
    }),
});
