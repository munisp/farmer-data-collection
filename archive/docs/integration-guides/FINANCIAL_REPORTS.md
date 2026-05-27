# Financial Reports Feature

## Overview

The Financial Reports feature provides comprehensive financial analysis and insights for farmers, including expense tracking by category, monthly trends, revenue vs expense comparisons, and detailed financial summaries.

## Features Implemented

### Backend API (tRPC Procedures)

All procedures are located in `server/financial-reports-router.ts` and integrated into the main app router under `financialReports.*`.

#### 1. Get Expense By Category
- **Endpoint**: `financialReports.getExpenseByCategory`
- **Type**: Query
- **Input**: 
  - `startDate` (optional): Filter start date
  - `endDate` (optional): Filter end date
- **Output**: Array of expense categories with total amounts and counts
- **Features**:
  - Groups expenses by category
  - Calculates total amount per category
  - Counts number of transactions
  - Orders by total amount (descending)
  - User-specific filtering

#### 2. Get Monthly Trends
- **Endpoint**: `financialReports.getMonthlyTrends`
- **Type**: Query
- **Input**:
  - `months` (default: 12): Number of months to analyze
- **Output**: Array of monthly expense data
- **Features**:
  - Aggregates expenses by month (YYYY-MM format)
  - Calculates total expenses per month
  - Counts transactions per month
  - User-specific filtering
  - Configurable time range

#### 3. Get Revenue vs Expense Comparison
- **Endpoint**: `financialReports.getRevenueVsExpense`
- **Type**: Query
- **Input**:
  - `startDate` (optional): Filter start date
  - `endDate` (optional): Filter end date
- **Output**: Financial comparison object
- **Features**:
  - Calculates total expenses
  - Calculates total revenue (from harvests, $10 per unit assumed)
  - Computes net profit (revenue - expenses)
  - Calculates profit margin percentage
  - Includes transaction counts
  - User-specific filtering

#### 4. Get Financial Summary
- **Endpoint**: `financialReports.getFinancialSummary`
- **Type**: Query
- **Input**:
  - `startDate` (optional): Filter start date
  - `endDate` (optional): Filter end date
- **Output**: Statistical summary of expenses
- **Features**:
  - Total expenses
  - Average expense
  - Maximum expense
  - Minimum expense
  - Transaction count
  - User-specific filtering

### Frontend UI

Located in `client/src/pages/FinancialReports.tsx`, wrapped in `DashboardLayout` for consistent navigation.

#### Components

1. **Date Range Filter Card**
   - Start date picker
   - End date picker
   - Clear filters button
   - Real-time query updates

2. **Summary Cards** (4 cards)
   - Total Expenses: Shows total amount and transaction count
   - Total Revenue: Shows revenue from harvests and harvest count
   - Net Profit: Shows profit/loss with color coding (green/red) and margin percentage
   - Average Expense: Shows average with min-max range

3. **Expense by Category - Bar Chart**
   - Recharts BarChart visualization
   - X-axis: Category names
   - Y-axis: Total amount
   - Tooltip with currency formatting
   - CSV export button
   - Empty state message

4. **Category Distribution - Pie Chart**
   - Recharts PieChart visualization
   - Shows percentage distribution
   - Color-coded segments (8 colors)
   - Labels with category and percentage
   - Tooltip with currency formatting
   - Empty state message

5. **Monthly Expense Trends - Line Chart**
   - Recharts LineChart visualization
   - X-axis: Month (YYYY-MM format)
   - Y-axis: Total expenses
   - Line graph with 2px stroke
   - Tooltip with currency formatting
   - CSV export button
   - Empty state message

6. **Revenue vs Expense Comparison - Bar Chart**
   - Recharts BarChart visualization
   - Three bars: Revenue (green), Expenses (orange), Profit (blue)
   - Side-by-side comparison
   - Tooltip with currency formatting
   - Empty state message

#### Features

- **Real-time Data**: All charts update automatically when date filters change
- **Currency Formatting**: All monetary values formatted as USD ($)
- **Loading States**: Spinner shown while data is loading
- **Empty States**: Friendly messages when no data is available
- **Responsive Design**: Charts adapt to container width
- **CSV Export**: Export expense by category and monthly trends data
- **User-Specific Data**: All queries filtered by authenticated user

### Navigation

The Financial Reports page is accessible from:
- **Sidebar**: "Financial Reports" menu item with BarChart3 icon
- **Route**: `/financial-reports`
- **Authentication**: Requires user to be logged in (protected by DashboardLayout)

## Technical Implementation

### Database Queries

All queries use:
- **Drizzle ORM** for type-safe SQL queries
- **PostgreSQL** aggregate functions (SUM, AVG, MAX, MIN, COUNT)
- **User filtering**: `WHERE userId = ctx.user.id`
- **Date filtering**: `WHERE expenseDate >= startDate AND expenseDate <= endDate`
- **Grouping**: `GROUP BY category` or `GROUP BY month`
- **Ordering**: `ORDER BY total DESC` for categories, `ORDER BY month ASC` for trends

### Frontend State Management

- **tRPC Hooks**: `useQuery` for data fetching
- **React State**: `useState` for date filter values
- **Automatic Refetch**: Queries refetch when date filters change
- **Loading States**: `isLoading` flags for each query
- **Error Handling**: Graceful fallback to empty states

### Data Flow

1. User selects date range (optional)
2. Frontend calls tRPC procedures with date parameters
3. Backend queries PostgreSQL with user and date filters
4. Backend aggregates and formats data
5. Frontend receives typed data
6. Recharts renders visualizations
7. User can export data to CSV

## Usage

### For End Users

1. **Navigate to Financial Reports**
   - Click "Financial Reports" in the sidebar
   - Or go to `/financial-reports`

2. **View Financial Overview**
   - See summary cards with key metrics
   - View expense distribution by category
   - Analyze monthly spending trends
   - Compare revenue vs expenses

3. **Filter by Date Range**
   - Select start date
   - Select end date
   - Click "Clear Filters" to reset

4. **Export Data**
   - Click "Export CSV" on any chart
   - Data downloads as CSV file
   - Open in Excel or Google Sheets

### For Developers

#### Adding New Charts

```typescript
// 1. Create new tRPC procedure in server/financial-reports-router.ts
getNewMetric: protectedProcedure
  .input(z.object({ /* ... */ }))
  .query(async ({ ctx, input }) => {
    // Query logic
  }),

// 2. Add query hook in FinancialReports.tsx
const { data: newMetric } = trpc.financialReports.getNewMetric.useQuery({
  // params
});

// 3. Add Recharts visualization
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={newMetric}>
    {/* ... */}
  </BarChart>
</ResponsiveContainer>
```

#### Customizing Charts

```typescript
// Colors
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", ...];

// Currency formatting
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

// CSV export
const exportToCSV = (data: any[], filename: string) => {
  const headers = Object.keys(data[0]).join(",");
  const rows = data.map((row) => Object.values(row).join(",")).join("\n");
  const csv = `${headers}\n${rows}`;
  // ... download logic
};
```

## Testing

### Manual Testing Steps

1. **Test with No Data**
   - Login as new user
   - Navigate to Financial Reports
   - Verify empty state messages appear
   - Verify no errors in console

2. **Test with Sample Data**
   - Add expenses in different categories
   - Add harvests with quantities
   - Navigate to Financial Reports
   - Verify all charts render correctly
   - Verify summary cards show correct totals

3. **Test Date Filtering**
   - Select start date (e.g., 2024-01-01)
   - Verify charts update
   - Select end date (e.g., 2024-12-31)
   - Verify charts update
   - Click "Clear Filters"
   - Verify charts show all data

4. **Test CSV Export**
   - Click "Export CSV" on expense by category
   - Verify CSV file downloads
   - Open CSV and verify data
   - Repeat for monthly trends

5. **Test User Isolation**
   - Login as User A
   - Add expenses
   - Note the financial data
   - Logout
   - Login as User B
   - Navigate to Financial Reports
   - Verify User A's data is not visible

### Automated Testing

```typescript
// Example test in server/financial-reports-router.test.ts
import { describe, it, expect } from 'vitest';
import { appRouter } from './trpc';

describe('Financial Reports', () => {
  it('should return expense by category', async () => {
    const caller = appRouter.createCaller({
      user: { id: 1, /* ... */ }
    });
    
    const result = await caller.financialReports.getExpenseByCategory({});
    
    expect(result).toBeInstanceOf(Array);
    expect(result[0]).toHaveProperty('category');
    expect(result[0]).toHaveProperty('totalAmount');
    expect(result[0]).toHaveProperty('count');
  });
});
```

## Dependencies

### Backend
- `drizzle-orm`: Database ORM
- `zod`: Input validation
- `@trpc/server`: API framework

### Frontend
- `recharts`: Chart library
- `@tanstack/react-query`: Data fetching
- `@trpc/react-query`: tRPC React integration
- `lucide-react`: Icons
- `shadcn/ui`: UI components

## Future Enhancements

### Potential Features

1. **PDF Export**
   - Generate PDF reports with all charts
   - Include summary statistics
   - Add date range and user info

2. **Advanced Filtering**
   - Filter by specific categories
   - Filter by payment method
   - Filter by farm or crop

3. **Comparison Views**
   - Compare current period vs previous period
   - Year-over-year comparisons
   - Budget vs actual

4. **Additional Charts**
   - Expense trends by farm
   - Expense trends by crop
   - Payment method distribution
   - Top 10 expenses

5. **Financial Forecasting**
   - Predict future expenses based on trends
   - Budget recommendations
   - Cash flow projections

6. **Custom Reports**
   - User-defined report templates
   - Scheduled email reports
   - Shareable report links

7. **Data Insights**
   - AI-powered spending insights
   - Cost-saving recommendations
   - Anomaly detection

## Known Limitations

1. **Revenue Calculation**: Currently assumes $10 per unit for harvest revenue. This should be made configurable per crop type.

2. **Currency**: Hardcoded to USD. Should support multiple currencies based on user preferences.

3. **Date Range**: Monthly trends limited to 12 months. Should support custom ranges.

4. **Performance**: Large datasets (10,000+ transactions) may cause slow chart rendering. Consider pagination or data aggregation.

5. **Mobile**: Charts may be difficult to read on small screens. Consider responsive breakpoints or mobile-specific views.

## Deployment Notes

### Prerequisites

- PostgreSQL database with expenses and harvests tables
- User authentication system
- tRPC server running

### Environment Variables

No additional environment variables required. Uses existing:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: For user authentication

### Database Migrations

No new migrations required. Uses existing tables:
- `expenses`: Must have `userId`, `amount`, `expenseDate`, `category` columns
- `harvests`: Must have `userId`, `quantity`, `harvestDate` columns

### Monitoring

Monitor these metrics:
- Query performance (should be < 100ms for most queries)
- Chart render time (should be < 500ms)
- CSV export success rate
- User engagement (page views, exports)

## Support

For issues or questions:
1. Check browser console for errors
2. Verify database connection
3. Verify user authentication
4. Check tRPC endpoint responses
5. Review this documentation

## Changelog

### Version 1.0.0 (2024-11-24)
- Initial implementation
- 4 tRPC procedures
- 6 chart visualizations
- CSV export functionality
- Date range filtering
- User-specific data isolation
