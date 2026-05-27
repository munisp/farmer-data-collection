import { getDb } from "../db";
import { users, farms, crops, produceListings, marketplaceOrders } from "../../drizzle/schema";
import { gte, lte, count, sum, sql } from "drizzle-orm";

/**
 * Automated Reporting Service
 * Generates scheduled reports for platform statistics, user growth, and revenue
 */

export interface PlatformStats {
  totalUsers: number;
  activeUsers: number;
  newUsersThisWeek: number;
  totalFarms: number;
  totalCrops: number;
  totalListings: number;
  activeListings: number;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
}

export interface UserGrowthMetrics {
  period: string;
  newUsers: number;
  activeUsers: number;
  retentionRate: number;
  churnRate: number;
}

export interface RevenueMetrics {
  period: string;
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  topCategories: Array<{ category: string; revenue: number; count: number }>;
}

/**
 * Get platform statistics for a given date range
 */
export async function getPlatformStats(
  startDate: Date,
  endDate: Date
): Promise<PlatformStats> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total users
  const totalUsersResult = await db.select({ count: count() }).from(users);
  const totalUsers = totalUsersResult[0]?.count || 0;

  // New users this week
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const newUsersResult = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.createdAt, oneWeekAgo));
  const newUsersThisWeek = newUsersResult[0]?.count || 0;

  // Active users (users with activity in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const activeUsersResult = await db
    .select({ count: count() })
    .from(users)
    .where(gte(users.updatedAt, thirtyDaysAgo));
  const activeUsers = activeUsersResult[0]?.count || 0;

  // Total farms
  const totalFarmsResult = await db.select({ count: count() }).from(farms);
  const totalFarms = totalFarmsResult[0]?.count || 0;

  // Total crops
  const totalCropsResult = await db.select({ count: count() }).from(crops);
  const totalCrops = totalCropsResult[0]?.count || 0;

  // Total listings
  const totalListingsResult = await db.select({ count: count() }).from(produceListings);
  const totalListings = totalListingsResult[0]?.count || 0;

  // Active listings (status = 'active')
  const activeListingsResult = await db
    .select({ count: count() })
    .from(produceListings)
    .where(sql`${produceListings.status} = 'active'`);
  const activeListings = activeListingsResult[0]?.count || 0;

  // Total orders
  const totalOrdersResult = await db.select({ count: count() }).from(marketplaceOrders);
  const totalOrders = totalOrdersResult[0]?.count || 0;

  // Completed orders
  const completedOrdersResult = await db
    .select({ count: count() })
    .from(marketplaceOrders)
    .where(sql`${marketplaceOrders.status} = 'completed'`);
  const completedOrders = completedOrdersResult[0]?.count || 0;

  // Total revenue
  const totalRevenueResult = await db
    .select({ total: sum(marketplaceOrders.totalAmount) })
    .from(marketplaceOrders)
    .where(sql`${marketplaceOrders.paymentStatus} = 'completed'`);
  const totalRevenue = Number(totalRevenueResult[0]?.total || 0);

  // Revenue this week
  const revenueThisWeekResult = await db
    .select({ total: sum(marketplaceOrders.totalAmount) })
    .from(marketplaceOrders)
    .where(
      sql`${marketplaceOrders.paymentStatus} = 'completed' AND ${marketplaceOrders.createdAt} >= ${oneWeekAgo}`
    );
  const revenueThisWeek = Number(revenueThisWeekResult[0]?.total || 0);

  // Revenue this month
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  
  const revenueThisMonthResult = await db
    .select({ total: sum(marketplaceOrders.totalAmount) })
    .from(marketplaceOrders)
    .where(
      sql`${marketplaceOrders.paymentStatus} = 'completed' AND ${marketplaceOrders.createdAt} >= ${oneMonthAgo}`
    );
  const revenueThisMonth = Number(revenueThisMonthResult[0]?.total || 0);

  return {
    totalUsers,
    activeUsers,
    newUsersThisWeek,
    totalFarms,
    totalCrops,
    totalListings,
    activeListings,
    totalOrders,
    completedOrders,
    totalRevenue,
    revenueThisWeek,
    revenueThisMonth,
  };
}

/**
 * Get user growth metrics for reporting
 */
export async function getUserGrowthMetrics(
  startDate: Date,
  endDate: Date
): Promise<UserGrowthMetrics> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // New users in period
  const newUsersResult = await db
    .select({ count: count() })
    .from(users)
    .where(sql`${users.createdAt} >= ${startDate} AND ${users.createdAt} <= ${endDate}`);
  const newUsers = newUsersResult[0]?.count || 0;

  // Active users in period
  const activeUsersResult = await db
    .select({ count: count() })
    .from(users)
    .where(sql`${users.updatedAt} >= ${startDate} AND ${users.updatedAt} <= ${endDate}`);
  const activeUsers = activeUsersResult[0]?.count || 0;

  // Calculate retention rate (simplified)
  const totalUsersResult = await db.select({ count: count() }).from(users);
  const totalUsers = totalUsersResult[0]?.count || 1;
  const retentionRate = (activeUsers / totalUsers) * 100;

  // Calculate churn rate
  const churnRate = 100 - retentionRate;

  const period = `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;

  return {
    period,
    newUsers,
    activeUsers,
    retentionRate: Math.round(retentionRate * 100) / 100,
    churnRate: Math.round(churnRate * 100) / 100,
  };
}

/**
 * Get revenue metrics for reporting
 */
export async function getRevenueMetrics(
  startDate: Date,
  endDate: Date
): Promise<RevenueMetrics> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Total revenue in period
  const revenueResult = await db
    .select({ total: sum(marketplaceOrders.totalAmount) })
    .from(marketplaceOrders)
    .where(
      sql`${marketplaceOrders.paymentStatus} = 'completed' AND ${marketplaceOrders.createdAt} >= ${startDate} AND ${marketplaceOrders.createdAt} <= ${endDate}`
    );
  const totalRevenue = Number(revenueResult[0]?.total || 0);

  // Order count in period
  const orderCountResult = await db
    .select({ count: count() })
    .from(marketplaceOrders)
    .where(
      sql`${marketplaceOrders.paymentStatus} = 'completed' AND ${marketplaceOrders.createdAt} >= ${startDate} AND ${marketplaceOrders.createdAt} <= ${endDate}`
    );
  const orderCount = orderCountResult[0]?.count || 0;

  // Average order value
  const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  // Top categories (mock data - would need to join with listings)
  const topCategories = [
    { category: "Vegetables", revenue: totalRevenue * 0.35, count: Math.floor(orderCount * 0.35) },
    { category: "Fruits", revenue: totalRevenue * 0.25, count: Math.floor(orderCount * 0.25) },
    { category: "Grains", revenue: totalRevenue * 0.20, count: Math.floor(orderCount * 0.20) },
    { category: "Dairy", revenue: totalRevenue * 0.12, count: Math.floor(orderCount * 0.12) },
    { category: "Eggs", revenue: totalRevenue * 0.08, count: Math.floor(orderCount * 0.08) },
  ];

  const period = `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`;

  return {
    period,
    totalRevenue,
    orderCount,
    averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    topCategories,
  };
}

/**
 * Generate weekly report data
 */
export async function generateWeeklyReport() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const stats = await getPlatformStats(startDate, endDate);
  const userGrowth = await getUserGrowthMetrics(startDate, endDate);
  const revenue = await getRevenueMetrics(startDate, endDate);

  return {
    reportType: "weekly",
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    platformStats: stats,
    userGrowth,
    revenue,
  };
}

/**
 * Generate monthly report data
 */
export async function generateMonthlyReport() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 1);

  const stats = await getPlatformStats(startDate, endDate);
  const userGrowth = await getUserGrowthMetrics(startDate, endDate);
  const revenue = await getRevenueMetrics(startDate, endDate);

  return {
    reportType: "monthly",
    generatedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    platformStats: stats,
    userGrowth,
    revenue,
  };
}

/**
 * Format currency for reports
 */
export function formatCurrency(cents: number): string {
  return `₦${(cents / 100).toFixed(2)}`;
}

/**
 * Format percentage for reports
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`;
}
