import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base";
import { getDb } from "./db";
import { crops, expenses, harvests, farms } from "../drizzle/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export const exportRouter = router({
  // Export crops to CSV
  exportCrops: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      const conditions = [eq(crops.userId, userId)];
      
      if (input.startDate) {
        conditions.push(gte(crops.plantingDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(crops.plantingDate, new Date(input.endDate)));
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const query = db
        .select()
        .from(crops)
        .where(and(...conditions))
        .orderBy(desc(crops.plantingDate));

      const data = await query;

      if (input.format === "csv") {
        const headers = [
          "ID",
          "Crop Name",
          "Variety",
          "Planting Date",
          "Status",
          "Price Per Unit",
          "Area Planted",
          "Season",
        ];
        const rows = data.map((crop) => [
          crop.id,
          crop.cropName,
          crop.cropVariety || "",
          crop.plantingDate?.toISOString().split("T")[0] || "",
          crop.status || "",
          crop.pricePerUnit || "",
          crop.areaPlanted || "",
          crop.season || "",
        ]);
        
        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, contentType: "text/csv", filename: `crops_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(data, null, 2), contentType: "application/json", filename: `crops_${Date.now()}.json` };
    }),

  // Export expenses to CSV
  exportExpenses: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      const conditions = [eq(expenses.userId, userId)];
      
      if (input.startDate) {
        conditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const query = db
        .select()
        .from(expenses)
        .where(and(...conditions))
        .orderBy(desc(expenses.expenseDate));

      const data = await query;

      if (input.format === "csv") {
        const headers = [
          "ID",
          "Description",
          "Category",
          "Amount",
          "Date",
          "Payment Method",
        ];
        const rows = data.map((expense) => [
          expense.id,
          expense.description || "",
          expense.category || "",
          expense.amount,
          expense.expenseDate?.toISOString().split("T")[0] || "",
          expense.paymentMethod || "",
        ]);
        
        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, contentType: "text/csv", filename: `expenses_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(data, null, 2), contentType: "application/json", filename: `expenses_${Date.now()}.json` };
    }),

  // Export harvests to CSV
  exportHarvests: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      const conditions = [eq(harvests.userId, userId)];
      
      if (input.startDate) {
        conditions.push(gte(harvests.harvestDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(harvests.harvestDate, new Date(input.endDate)));
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const query = db
        .select()
        .from(harvests)
        .where(and(...conditions))
        .orderBy(desc(harvests.harvestDate));

      const data = await query;

      if (input.format === "csv") {
        const headers = [
          "ID",
          "Crop ID",
          "Harvest Date",
          "Quantity",
          "Quality",
          "Market Price",
          "Revenue",
        ];
        const rows = data.map((harvest) => [
          harvest.id,
          harvest.cropId,
          harvest.harvestDate?.toISOString().split("T")[0] || "",
          harvest.quantity || "",
          harvest.quality || "",
          harvest.marketPrice || "",
          harvest.revenue || "",
        ]);
        
        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, contentType: "text/csv", filename: `harvests_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(data, null, 2), contentType: "application/json", filename: `harvests_${Date.now()}.json` };
    }),

  // Export financial summary
  exportFinancialSummary: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      
      // Get expenses
      const expenseConditions = [eq(expenses.userId, userId)];
      
      if (input.startDate) {
        expenseConditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        expenseConditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const expenseQuery = db
        .select()
        .from(expenses)
        .where(and(...expenseConditions));

      const expenseData = await expenseQuery;
      const totalExpenses = expenseData.reduce((sum: number, e: { amount: string | number | null }) => sum + Number(e.amount), 0);

      // Get harvests
      const harvestConditions = [eq(harvests.userId, userId)];
      
      if (input.startDate) {
        harvestConditions.push(gte(harvests.harvestDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        harvestConditions.push(lte(harvests.harvestDate, new Date(input.endDate)));
      }

      const harvestQuery = db
        .select()
        .from(harvests)
        .where(and(...harvestConditions));

      const harvestData = await harvestQuery;
      const totalRevenue = harvestData.reduce((sum: number, h: { revenue: string | number | null }) => sum + Number(h.revenue || 0), 0);

      const netProfit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : "0.00";

      const summary = {
        period: {
          start: input.startDate || "All time",
          end: input.endDate || "Present",
        },
        totalRevenue: totalRevenue / 100, // Convert cents to dollars
        totalExpenses: totalExpenses / 100,
        netProfit: netProfit / 100,
        profitMargin: `${profitMargin}%`,
        expenseCount: expenseData.length,
        harvestCount: harvestData.length,
      };

      if (input.format === "csv") {
        const csv = [
          "Metric,Value",
          `Period Start,${summary.period.start}`,
          `Period End,${summary.period.end}`,
          `Total Revenue,$${summary.totalRevenue.toFixed(2)}`,
          `Total Expenses,$${summary.totalExpenses.toFixed(2)}`,
          `Net Profit,$${summary.netProfit.toFixed(2)}`,
          `Profit Margin,${summary.profitMargin}`,
          `Number of Expenses,${summary.expenseCount}`,
          `Number of Harvests,${summary.harvestCount}`,
        ].join("\n");
        
        return { data: csv, contentType: "text/csv", filename: `financial_summary_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(summary, null, 2), contentType: "application/json", filename: `financial_summary_${Date.now()}.json` };
    }),

  // Export marketplace listings
  exportListings: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { produceListings } = await import("../drizzle/schema");
      
      const conditions = [eq(produceListings.userId, userId)];
      
      if (input.startDate) {
        conditions.push(gte(produceListings.createdAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(produceListings.createdAt, new Date(input.endDate)));
      }

      const data = await db
        .select()
        .from(produceListings)
        .where(and(...conditions))
        .orderBy(desc(produceListings.createdAt));

      if (input.format === "csv") {
        const headers = [
          "ID",
          "Title",
          "Category",
          "Quantity",
          "Unit",
          "Price Per Unit",
          "Total Price",
          "Organic",
          "Status",
          "Created At",
        ];
        const rows = data.map((listing) => [
          listing.id,
          listing.title,
          listing.category,
          listing.quantity,
          listing.unit,
          (listing.pricePerUnit / 100).toFixed(2),
          (listing.totalPrice / 100).toFixed(2),
          listing.organic ? "Yes" : "No",
          listing.status,
          listing.createdAt?.toISOString().split("T")[0] || "",
        ]);
        
        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, contentType: "text/csv", filename: `listings_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(data, null, 2), contentType: "application/json", filename: `listings_${Date.now()}.json` };
    }),

  // Export sales/orders
  exportSales: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { marketplaceOrders } = await import("../drizzle/schema");
      
      const conditions = [eq(marketplaceOrders.sellerId, userId)];
      
      if (input.startDate) {
        conditions.push(gte(marketplaceOrders.createdAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(marketplaceOrders.createdAt, new Date(input.endDate)));
      }

      const data = await db
        .select()
        .from(marketplaceOrders)
        .where(and(...conditions))
        .orderBy(desc(marketplaceOrders.createdAt));

      if (input.format === "csv") {
        const headers = [
          "Order ID",
          "Buyer ID",
          "Total Amount",
          "Status",
          "Payment Method",
          "Payment Status",
          "Delivery Method",
          "Created At",
        ];
        const rows = data.map((order) => [
          order.id,
          order.buyerId,
          (order.totalAmount / 100).toFixed(2),
          order.status,
          order.paymentMethod || "N/A",
          order.paymentStatus || "N/A",
          order.deliveryMethod || "N/A",
          order.createdAt?.toISOString().split("T")[0] || "",
        ]);
        
        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, contentType: "text/csv", filename: `sales_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(data, null, 2), contentType: "application/json", filename: `sales_${Date.now()}.json` };
    }),

  // Export transactions (purchases)
  exportTransactions: protectedProcedure
    .input(
      z.object({
        format: z.enum(["csv", "json"]),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { marketplaceOrders } = await import("../drizzle/schema");
      
      const conditions = [eq(marketplaceOrders.buyerId, userId)];
      
      if (input.startDate) {
        conditions.push(gte(marketplaceOrders.createdAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(marketplaceOrders.createdAt, new Date(input.endDate)));
      }

      const data = await db
        .select()
        .from(marketplaceOrders)
        .where(and(...conditions))
        .orderBy(desc(marketplaceOrders.createdAt));

      if (input.format === "csv") {
        const headers = [
          "Order ID",
          "Seller ID",
          "Total Amount",
          "Status",
          "Payment Method",
          "Payment Status",
          "Delivery Method",
          "Created At",
        ];
        const rows = data.map((order) => [
          order.id,
          order.sellerId,
          (order.totalAmount / 100).toFixed(2),
          order.status,
          order.paymentMethod || "N/A",
          order.paymentStatus || "N/A",
          order.deliveryMethod || "N/A",
          order.createdAt?.toISOString().split("T")[0] || "",
        ]);
        
        const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
        return { data: csv, contentType: "text/csv", filename: `transactions_${Date.now()}.csv` };
      }

      return { data: JSON.stringify(data, null, 2), contentType: "application/json", filename: `transactions_${Date.now()}.json` };
    }),
});
