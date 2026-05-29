import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Calendar, FileDown } from "lucide-react";
import { generateFinancialReportPDF } from "@/lib/pdfExport";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FFC658", "#FF6B9D"];

export default function FinancialReports() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { user } = useAuth();

  // Fetch data
  const { data: expenseByCategory, isLoading: loadingCategory } = trpc.financialReports.getExpenseByCategory.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: monthlyTrends, isLoading: loadingTrends } = trpc.financialReports.getMonthlyTrends.useQuery({
    months: 12,
  });

  const { data: revenueVsExpense, isLoading: loadingComparison } = trpc.financialReports.getRevenueVsExpense.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: summary, isLoading: loadingSummary } = trpc.financialReports.getFinancialSummary.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const isLoading = loadingCategory || loadingTrends || loadingComparison || loadingSummary;

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  // Export to PDF
  const exportToPDF = () => {
    if (!expenseByCategory || !monthlyTrends || !revenueVsExpense || !summary) {
      alert("No data available to export");
      return;
    }

    generateFinancialReportPDF({
      expenseByCategory,
      monthlyTrends,
      revenueVsExpense,
      summary,
      dateRange: {
        startDate,
        endDate,
      },
      userName: user ? `${user.firstName} ${user.lastName}` : undefined,
    });
  };

  // Export to CSV
  const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((row) => Object.values(row).join(",")).join("\n");
    const csv = `${headers}\n${rows}`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Financial Reports</h1>
          <p className="text-muted-foreground">Comprehensive financial analysis and insights</p>
        </div>
        <Button onClick={exportToPDF} className="gap-2">
          <FileDown className="h-4 w-4" />
          Export to PDF
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.totalExpenses || 0)}</div>
            <p className="text-xs text-muted-foreground">{summary?.count || 0} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(revenueVsExpense?.totalRevenue || 0)}</div>
            <p className="text-xs text-muted-foreground">{revenueVsExpense?.revenueCount || 0} harvests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            {(revenueVsExpense?.profit || 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                (revenueVsExpense?.profit || 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(revenueVsExpense?.profit || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {revenueVsExpense?.profitMargin.toFixed(1)}% margin
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Expense</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary?.avgExpense || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Range: {formatCurrency(summary?.minExpense || 0)} - {formatCurrency(summary?.maxExpense || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expense by Category - Bar Chart */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Expenses by Category</CardTitle>
              <CardDescription>Total expenses grouped by category</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(expenseByCategory || [], "expenses-by-category.csv")}
            >
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {expenseByCategory && expenseByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={expenseByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="totalAmount" fill="#8884d8" name="Total Amount" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No expense data available</div>
          )}
        </CardContent>
      </Card>

      {/* Expense by Category - Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Category Distribution</CardTitle>
          <CardDescription>Expense distribution across categories</CardDescription>
        </CardHeader>
        <CardContent>
          {expenseByCategory && expenseByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expenseByCategory}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ category, percent }) => `${category}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="totalAmount"
                >
                  {expenseByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No expense data available</div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Trends - Line Chart */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Monthly Expense Trends</CardTitle>
              <CardDescription>Expense trends over the last 12 months</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(monthlyTrends || [], "monthly-trends.csv")}
            >
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {monthlyTrends && monthlyTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalExpenses"
                  stroke="#8884d8"
                  strokeWidth={2}
                  name="Total Expenses"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No monthly data available</div>
          )}
        </CardContent>
      </Card>

      {/* Revenue vs Expense Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue vs Expense Comparison</CardTitle>
          <CardDescription>Compare total revenue and expenses</CardDescription>
        </CardHeader>
        <CardContent>
          {revenueVsExpense ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  {
                    name: "Financial Overview",
                    Revenue: revenueVsExpense.totalRevenue,
                    Expenses: revenueVsExpense.totalExpenses,
                    Profit: revenueVsExpense.profit,
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="Revenue" fill="#00C49F" />
                <Bar dataKey="Expenses" fill="#FF8042" />
                <Bar dataKey="Profit" fill="#8884D8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No comparison data available</div>
          )}
        </CardContent>
      </Card>
      </div>
    </DashboardLayout>
  );
}
