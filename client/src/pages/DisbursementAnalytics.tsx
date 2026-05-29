import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { TrendingUp, TrendingDown, DollarSign, Clock, CheckCircle, XCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export default function DisbursementAnalytics() {
  const { data: analytics, isLoading } = trpc.disbursement.getAnalytics.useQuery();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!analytics) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No analytics data available</p>
        </div>
      </DashboardLayout>
    );
  }

  const { summary, monthlyVolume, successRateByMethod, processingTimeTrend } = analytics;

  // Format monthly volume for chart
  const monthlyVolumeData = monthlyVolume.map((m) => ({
    month: m.month,
    count: m.count,
    amount: m.amount / 100, // Convert from kobo to naira
  }));

  // Format success rate by method for chart
  const methodData = successRateByMethod.map((m) => ({
    method: m.method.replace(/_/g, " ").toUpperCase(),
    successRate: Math.round(m.successRate * 100) / 100,
    total: m.total,
  }));

  // Format processing time trend for chart
  const processingTimeData = processingTimeTrend.map((t) => ({
    month: t.month,
    avgDays: Math.round(t.avgDays * 100) / 100,
  }));

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Disbursement Analytics</h1>
          <p className="text-muted-foreground">
            Track disbursement performance, trends, and success rates
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Disbursements</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.completed}</div>
              <p className="text-xs text-muted-foreground">Successfully processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{summary.failed}</div>
              <p className="text-xs text-muted-foreground">Processing failures</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.successRate}%</div>
              <p className="text-xs text-muted-foreground">Overall performance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.avgProcessingTime}</div>
              <p className="text-xs text-muted-foreground">Days</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Tabs defaultValue="volume" className="space-y-4">
          <TabsList>
            <TabsTrigger value="volume">Monthly Volume</TabsTrigger>
            <TabsTrigger value="success">Success Rate by Method</TabsTrigger>
            <TabsTrigger value="processing">Processing Time Trend</TabsTrigger>
          </TabsList>

          {/* Monthly Volume Chart */}
          <TabsContent value="volume" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Monthly Disbursement Volume</CardTitle>
                <CardDescription>Number of disbursements and total amount per month (last 12 months)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={monthlyVolumeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      formatter={(value: any, name: string) => {
                        if (name === "amount") return formatCurrency(value);
                        return value;
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Count" />
                    <Bar yAxisId="right" dataKey="amount" fill="#82ca9d" name="Amount (₦)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Success Rate by Method Chart */}
          <TabsContent value="success" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Success Rate by Payment Method</CardTitle>
                <CardDescription>Completion rate for each disbursement method</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={methodData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="method" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: any, name: string) => {
                        if (name === "successRate") return `${value}%`;
                        return value;
                      }}
                    />
                    <Legend />
                    <Bar dataKey="successRate" fill="#0088FE" name="Success Rate (%)" />
                  </BarChart>
                </ResponsiveContainer>
                
                {/* Method Details Table */}
                <div className="mt-6">
                  <h3 className="text-sm font-semibold mb-2">Method Details</h3>
                  <div className="grid gap-2">
                    {methodData.map((method, index) => (
                      <div key={method.method} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="font-medium">{method.method}</span>
                        </div>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>{method.total} total</span>
                          <span className="font-semibold text-foreground">{method.successRate}% success</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Processing Time Trend Chart */}
          <TabsContent value="processing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Average Processing Time Trend</CardTitle>
                <CardDescription>How processing time has changed over the last 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={processingTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: any) => `${value} days`} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="avgDays" 
                      stroke="#8884d8" 
                      strokeWidth={2}
                      name="Avg Days"
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
