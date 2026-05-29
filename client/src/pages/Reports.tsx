import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDatabase } from "@/hooks/useDatabase";
import { expenses, harvests } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { useAuth } from "@/contexts/AuthContext";
import { FileDown, Loader2 } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';

interface ExpenseByCategory {
  category: string;
  total: number;
}

interface HarvestByMonth {
  month: string;
  quantity: number;
}

export default function Reports() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [expenseData, setExpenseData] = useState<ExpenseByCategory[]>([]);
  const [harvestData, setHarvestByMonth] = useState<HarvestByMonth[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalHarvests, setTotalHarvests] = useState(0);

  useEffect(() => {
    if (!isInitialized || !user) return;

    const fetchReportData = async () => {
      try {
        setLoading(true);

        // Fetch expense data by category (filtered by current user)
        const expenseResults = await db
          .select({
            category: expenses.category,
            total: sql<number>`CAST(SUM(${expenses.amount}) AS INTEGER)`,
          })
          .from(expenses)
          .where(eq(expenses.userId, Number(user!.id)))
          .groupBy(expenses.category);

        setExpenseData(expenseResults.map((r: any) => ({
          category: r.category,
          total: Number(r.total) || 0
        })));

        // Calculate total expenses
        const totalExp = expenseResults.reduce((sum: number, r: any) => sum + (Number(r.total) || 0), 0);
        setTotalExpenses(totalExp);

        // Fetch harvest data by month (filtered by current user)
        const harvestResults = await db
          .select({
            month: sql<string>`strftime('%Y-%m', ${harvests.harvestDate})`,
            quantity: sql<number>`CAST(SUM(${harvests.quantity}) AS INTEGER)`,
          })
          .from(harvests)
          .where(eq(harvests.userId, Number(user!.id)))
          .groupBy(sql`strftime('%Y-%m', ${harvests.harvestDate})`)
          .orderBy(sql`strftime('%Y-%m', ${harvests.harvestDate})`);

        setHarvestByMonth(harvestResults.map((r: any) => ({
          month: r.month || 'Unknown',
          quantity: Number(r.quantity) || 0
        })));

        // Calculate total harvests
        const totalHarv = harvestResults.reduce((sum: number, r: any) => sum + (Number(r.quantity) || 0), 0);
        setTotalHarvests(totalHarv);

      } catch (err) {
        console.error("Failed to fetch report data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [isInitialized, db]);

  const generatePDF = async () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('Farm Data Collection Report', 20, 20);
    
    // Date
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 30);
    
    // Summary
    doc.setFontSize(14);
    doc.text('Summary', 20, 45);
    doc.setFontSize(10);
    doc.text(`Total Expenses: $${totalExpenses.toFixed(2)}`, 20, 55);
    doc.text(`Total Harvest Quantity: ${totalHarvests} units`, 20, 62);
    
    // Expense Breakdown
    doc.setFontSize(14);
    doc.text('Expense Breakdown by Category', 20, 80);
    doc.setFontSize(10);
    let yPos = 90;
    expenseData.forEach((item) => {
      doc.text(`${item.category}: $${item.total.toFixed(2)}`, 25, yPos);
      yPos += 7;
    });
    
    // Harvest Data
    doc.setFontSize(14);
    doc.text('Harvest by Month', 20, yPos + 10);
    doc.setFontSize(10);
    yPos += 20;
    harvestData.slice(0, 10).forEach((item) => {
      doc.text(`${item.month}: ${item.quantity} units`, 25, yPos);
      yPos += 7;
    });
    
    // Save PDF
    doc.save('farm-report.pdf');
  };

  if (!isInitialized || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading reports...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Reports & Analytics</h1>
            <p className="text-muted-foreground mt-2">
              Comprehensive insights into your farm operations
            </p>
          </div>
          <Button onClick={generatePDF} className="gap-2">
            <FileDown className="w-4 h-4" />
            Export PDF
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Expenses</CardTitle>
              <CardDescription>All recorded expenses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">${totalExpenses.toFixed(2)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Harvest</CardTitle>
              <CardDescription>All recorded harvest quantities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-foreground">{totalHarvests} units</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expense Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Breakdown</CardTitle>
              <CardDescription>Expenses by category</CardDescription>
            </CardHeader>
            <CardContent>
              {expenseData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={expenseData}
                      dataKey="total"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.category}: $${entry.total.toFixed(2)}`}
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px]">
                  <p className="text-muted-foreground">No expense data available</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Harvest Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Harvest Trends</CardTitle>
              <CardDescription>Monthly harvest quantities</CardDescription>
            </CardHeader>
            <CardContent>
              {harvestData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={harvestData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="quantity" fill="#10b981" name="Quantity (units)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px]">
                  <p className="text-muted-foreground">No harvest data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tables */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Details</CardTitle>
            <CardDescription>Breakdown of all expenses by category</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseData.length > 0 ? (
              <div className="overflow-x-auto">
                <table role="table" aria-label="Data table" className="w-full">
                  <thead role="rowgroup">
                    <tr className="border-b">
                      <th className="text-left p-2">Category</th>
                      <th className="text-right p-2">Total Amount</th>
                      <th className="text-right p-2">Percentage</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {expenseData.map((item) => (
                      <tr key={item.category} className="border-b">
                        <td className="p-2">{item.category}</td>
                        <td className="text-right p-2">${item.total.toFixed(2)}</td>
                        <td className="text-right p-2">
                          {((item.total / totalExpenses) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground">No expense data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
