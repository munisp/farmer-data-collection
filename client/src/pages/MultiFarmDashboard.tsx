import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Sprout, BarChart3, Building2 } from "lucide-react";
import { useDatabase } from "@/hooks/useDatabase";
import { farms, crops, expenses, harvests } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { useAuth } from "@/contexts/AuthContext";

interface FarmStats {
  farmId: number;
  farmName: string;
  totalCrops: number;
  totalExpenses: number;
  totalRevenue: number;
  netProfit: number;
  profitMargin: number;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

export default function MultiFarmDashboard() {
  const { user } = useAuth();
  const { db } = useDatabase();
  const [farmsList, setFarmsList] = useState<any[]>([]);
  const [selectedFarms, setSelectedFarms] = useState<number[]>([]);
  const [farmStats, setFarmStats] = useState<FarmStats[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch farms
  useEffect(() => {
    const fetchFarms = async () => {
      if (!db || !user) return;
      
      try {
        const userFarms = await db.select().from(farms).where(eq(farms.userId, Number(user.id)));
        setFarmsList(userFarms);
        // Select all farms by default
        setSelectedFarms(userFarms.map((f: any) => f.id));
      } catch (error) {
        console.error("Failed to fetch farms:", error);
      }
    };

    fetchFarms();
  }, [db, user]);

  // Calculate stats for each farm
  useEffect(() => {
    const calculateStats = async () => {
      if (!db || !user || selectedFarms.length === 0) {
        setFarmStats([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const stats: FarmStats[] = [];

        for (const farmId of selectedFarms) {
          const farm = farmsList.find((f: any) => f.id === farmId);
          if (!farm) continue;

          // Get crops count
          const farmCrops = await db.select().from(crops).where(
            and(
              eq(crops.userId, Number(user.id)),
              eq(crops.farmId, farmId)
            )
          );

          // Get total expenses
          const farmExpenses = await db.select().from(expenses).where(
            and(
              eq(expenses.userId, Number(user.id)),
              eq(expenses.farmId, farmId)
            )
          );
          const totalExpenses = farmExpenses.reduce((sum: number, exp: any) => sum + exp.amount, 0);

          // Get total revenue from harvests
          const farmHarvests = await db.select().from(harvests).where(
            eq(harvests.userId, Number(user.id))
          );
          // Filter harvests by crops from this farm
          const farmCropIds = farmCrops.map((c: any) => c.id);
          const relevantHarvests = farmHarvests.filter((h: any) => farmCropIds.includes(h.cropId));
          const totalRevenue = relevantHarvests.reduce((sum: number, h: any) => sum + (h.revenue || 0), 0);

          // Calculate net profit and margin
          const netProfit = totalRevenue - totalExpenses;
          const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

          stats.push({
            farmId,
            farmName: farm.farmName,
            totalCrops: farmCrops.length,
            totalExpenses,
            totalRevenue,
            netProfit,
            profitMargin,
          });
        }

        setFarmStats(stats);
        
        // Calculate monthly trends for the last 12 months
        await calculateMonthlyTrends();
      } catch (error) {
        console.error("Failed to calculate stats:", error);
      } finally {
        setLoading(false);
      }
    };

    const calculateMonthlyTrends = async () => {
      if (!db || !user || selectedFarms.length === 0) {
        setMonthlyTrends([]);
        return;
      }

      try {
        const trends: any[] = [];
        const now = new Date();
        
        // Generate last 12 months
        for (let i = 11; i >= 0; i--) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
          const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
          
          const monthName = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

          let monthRevenue = 0;
          let monthExpenses = 0;

          // Get all crops from selected farms
          const allCrops = await db.select().from(crops).where(
            and(
              eq(crops.userId, Number(user.id))
            )
          );
          const selectedFarmCropIds = allCrops
            .filter((c: any) => selectedFarms.includes(c.farmId))
            .map((c: any) => c.id);

          // Get harvests for this month
          const monthHarvests = await db.select().from(harvests).where(
            and(
              eq(harvests.userId, Number(user.id)),
              gte(harvests.harvestDate, monthStart),
              lte(harvests.harvestDate, monthEnd)
            )
          );
          
          // Filter harvests by selected farm crops
          const relevantHarvests = monthHarvests.filter((h: any) => 
            selectedFarmCropIds.includes(h.cropId)
          );
          monthRevenue = relevantHarvests.reduce((sum: number, h: any) => sum + (h.revenue || 0), 0);

          // Get expenses for this month from selected farms
          const monthExpensesData = await db.select().from(expenses).where(
            and(
              eq(expenses.userId, Number(user.id)),
              gte(expenses.expenseDate, monthStart),
              lte(expenses.expenseDate, monthEnd)
            )
          );
          
          const relevantExpenses = monthExpensesData.filter((e: any) => 
            selectedFarms.includes(e.farmId)
          );
          monthExpenses = relevantExpenses.reduce((sum: number, e: any) => sum + e.amount, 0);

          const monthProfit = monthRevenue - monthExpenses;

          trends.push({
            month: monthName,
            revenue: monthRevenue / 100,
            expenses: monthExpenses / 100,
            profit: monthProfit / 100,
          });
        }

        setMonthlyTrends(trends);
      } catch (error) {
        console.error("Failed to calculate monthly trends:", error);
      }
    };

    calculateStats();
  }, [db, user, selectedFarms, farmsList]);

  // Aggregate stats
  const aggregateStats = useMemo(() => {
    return {
      totalCrops: farmStats.reduce((sum, f) => sum + f.totalCrops, 0),
      totalExpenses: farmStats.reduce((sum, f) => sum + f.totalExpenses, 0),
      totalRevenue: farmStats.reduce((sum, f) => sum + f.totalRevenue, 0),
      totalNetProfit: farmStats.reduce((sum, f) => sum + f.netProfit, 0),
      avgProfitMargin: farmStats.length > 0
        ? farmStats.reduce((sum, f) => sum + f.profitMargin, 0) / farmStats.length
        : 0,
    };
  }, [farmStats]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

  // Toggle farm selection
  const toggleFarm = (farmId: number) => {
    setSelectedFarms(prev =>
      prev.includes(farmId)
        ? prev.filter(id => id !== farmId)
        : [...prev, farmId]
    );
  };

  // Select/deselect all farms
  const toggleAllFarms = () => {
    if (selectedFarms.length === farmsList.length) {
      setSelectedFarms([]);
    } else {
      setSelectedFarms(farmsList.map(f => f.id));
    }
  };

  // Prepare chart data
  const revenueComparisonData = farmStats.map(f => ({
    name: f.farmName,
    revenue: f.totalRevenue / 100,
    expenses: f.totalExpenses / 100,
    profit: f.netProfit / 100,
  }));

  const profitMarginData = farmStats.map(f => ({
    name: f.farmName,
    margin: f.profitMargin,
  }));

  const cropDistributionData = farmStats.map(f => ({
    name: f.farmName,
    value: f.totalCrops,
  }));

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Multi-Farm Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Compare performance across your farms
            </p>
          </div>
        </div>

        {/* Farm Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Farms</CardTitle>
            <CardDescription>
              Choose which farms to include in the analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedFarms.length === farmsList.length && farmsList.length > 0}
                  onCheckedChange={toggleAllFarms}
                />
                <Label className="font-semibold">Select All Farms</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {farmsList.map((farm) => (
                  <div key={farm.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedFarms.includes(farm.id)}
                      onCheckedChange={() => toggleFarm(farm.id)}
                    />
                    <Label>{farm.farmName}</Label>
                  </div>
                ))}
              </div>
              {farmsList.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No farms found. Create a farm to get started.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedFarms.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select at least one farm to view analytics</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Aggregate Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Crops</CardTitle>
                  <Sprout className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{aggregateStats.totalCrops}</div>
                  <p className="text-xs text-muted-foreground">
                    Across {selectedFarms.length} farm{selectedFarms.length !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(aggregateStats.totalRevenue)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Combined revenue
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                  {aggregateStats.totalNetProfit >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${aggregateStats.totalNetProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatCurrency(aggregateStats.totalNetProfit)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Combined profit
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Profit Margin</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {aggregateStats.avgProfitMargin.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Average across farms
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Revenue Comparison Chart */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Revenue vs Expenses by Farm</CardTitle>
                <CardDescription>
                  Compare financial performance across selected farms
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenueComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                    <Bar dataKey="profit" fill="#3b82f6" name="Net Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Trends - Time Series */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Monthly Trends (Last 12 Months)</CardTitle>
                <CardDescription>
                  Track revenue, expenses, and profit over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={monthlyTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="month" 
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name="Revenue" 
                      dot={{ r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="expenses" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      name="Expenses" 
                      dot={{ r: 4 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="Net Profit" 
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Profit Margin Comparison */}
              <Card>
                <CardHeader>
                  <CardTitle>Profit Margin by Farm</CardTitle>
                  <CardDescription>
                    Compare profitability across farms
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={profitMarginData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
                      <Bar dataKey="margin" fill="#8b5cf6" name="Profit Margin %" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Crop Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Crop Distribution</CardTitle>
                  <CardDescription>
                    Number of crops per farm
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={cropDistributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.name}: ${entry.value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {cropDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Farm Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Farm Performance Rankings</CardTitle>
                <CardDescription>
                  Detailed performance metrics for each farm
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table role="table" aria-label="Data table" className="w-full">
                    <thead role="rowgroup">
                      <tr className="border-b">
                        <th className="text-left p-2">Rank</th>
                        <th className="text-left p-2">Farm Name</th>
                        <th className="text-right p-2">Crops</th>
                        <th className="text-right p-2">Revenue</th>
                        <th className="text-right p-2">Expenses</th>
                        <th className="text-right p-2">Net Profit</th>
                        <th className="text-right p-2">Margin %</th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {farmStats
                        .sort((a, b) => b.netProfit - a.netProfit)
                        .map((farm, index) => (
                          <tr key={farm.farmId} className="border-b">
                            <td className="p-2">#{index + 1}</td>
                            <td className="p-2 font-medium">{farm.farmName}</td>
                            <td className="text-right p-2">{farm.totalCrops}</td>
                            <td className="text-right p-2">{formatCurrency(farm.totalRevenue)}</td>
                            <td className="text-right p-2">{formatCurrency(farm.totalExpenses)}</td>
                            <td className={`text-right p-2 font-semibold ${farm.netProfit >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {formatCurrency(farm.netProfit)}
                            </td>
                            <td className="text-right p-2">{farm.profitMargin.toFixed(1)}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
