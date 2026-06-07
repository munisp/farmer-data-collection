import { trpc } from "@/lib/trpc";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList
} from "recharts";
import { TrendingUp, Users, ShoppingCart, DollarSign, Calendar } from "lucide-react";

export default function AdvancedAnalytics() {
  const [timeRange, setTimeRange] = useState("30");
  const [comparisonRegion, setComparisonRegion] = useState("all");

  // User engagement trend data
  const engagementData = [
    { date: "Jan 1", activeUsers: 120, newUsers: 15, sessions: 340 },
    { date: "Jan 8", activeUsers: 145, newUsers: 22, sessions: 420 },
    { date: "Jan 15", activeUsers: 168, newUsers: 18, sessions: 480 },
    { date: "Jan 22", activeUsers: 192, newUsers: 25, sessions: 550 },
    { date: "Jan 29", activeUsers: 215, newUsers: 30, sessions: 620 },
    { date: "Feb 5", activeUsers: 238, newUsers: 28, sessions: 680 },
    { date: "Feb 12", activeUsers: 265, newUsers: 32, sessions: 750 },
  ];

  // Crop yield comparison by region
  const yieldComparisonData = [
    { region: "Northern", maize: 4500, rice: 3200, wheat: 2800, sorghum: 2100 },
    { region: "Southern", maize: 3800, rice: 4100, wheat: 1900, sorghum: 1500 },
    { region: "Eastern", maize: 4200, rice: 3600, wheat: 2400, sorghum: 1800 },
    { region: "Western", maize: 3900, rice: 3900, wheat: 2200, sorghum: 1700 },
    { region: "Central", maize: 4300, rice: 3400, wheat: 2600, sorghum: 2000 },
  ];

  // Marketplace conversion funnel
  const conversionFunnelData = [
    { stage: "Visitors", value: 10000, fill: "#8884d8" },
    { stage: "Product Views", value: 6500, fill: "#83a6ed" },
    { stage: "Add to Cart", value: 3200, fill: "#8dd1e1" },
    { stage: "Checkout", value: 1800, fill: "#82ca9d" },
    { stage: "Purchase", value: 1200, fill: "#a4de6c" },
  ];

  // Seasonal pattern analysis
  const seasonalData = [
    { month: "Jan", vegetables: 2400, fruits: 1398, grains: 3200, dairy: 1800 },
    { month: "Feb", vegetables: 2210, fruits: 1480, grains: 3100, dairy: 1900 },
    { month: "Mar", vegetables: 2290, fruits: 1520, grains: 3300, dairy: 2000 },
    { month: "Apr", vegetables: 2000, fruits: 1680, grains: 2900, dairy: 2100 },
    { month: "May", vegetables: 2181, fruits: 1890, grains: 3100, dairy: 2200 },
    { month: "Jun", vegetables: 2500, fruits: 2100, grains: 3400, dairy: 2300 },
    { month: "Jul", vegetables: 2100, fruits: 2300, grains: 3200, dairy: 2400 },
    { month: "Aug", vegetables: 2400, fruits: 2200, grains: 3500, dairy: 2500 },
    { month: "Sep", vegetables: 2600, fruits: 2000, grains: 3600, dairy: 2400 },
    { month: "Oct", vegetables: 2800, fruits: 1800, grains: 3800, dairy: 2300 },
    { month: "Nov", vegetables: 2900, fruits: 1600, grains: 4000, dairy: 2200 },
    { month: "Dec", vegetables: 3000, fruits: 1400, grains: 4200, dairy: 2100 },
  ];

  // Revenue by category
  const revenueByCategory = [
    { name: "Vegetables", value: 35, color: "#0088FE" },
    { name: "Fruits", value: 25, color: "#00C49F" },
    { name: "Grains", value: 20, color: "#FFBB28" },
    { name: "Dairy", value: 12, color: "#FF8042" },
    { name: "Eggs", value: 8, color: "#8884D8" },
  ];

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Advanced Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Deep insights into user engagement, crop yields, and marketplace performance
            </p>
          </div>
          <div className="flex gap-3">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">Export Report</Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">68.4%</div>
              <p className="text-xs text-green-600 mt-1">+12.3% from last period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Session Duration</CardTitle>
              <Users className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8m 42s</div>
              <p className="text-xs text-blue-600 mt-1">+1m 15s from last period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <ShoppingCart className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12.0%</div>
              <p className="text-xs text-purple-600 mt-1">+2.1% from last period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
              <DollarSign className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₦3,450</div>
              <p className="text-xs text-orange-600 mt-1">+₦280 from last period</p>
            </CardContent>
          </Card>
        </div>

        {/* User Engagement Trends */}
        <Card>
          <CardHeader>
            <CardTitle>User Engagement Trends</CardTitle>
            <CardDescription>Track active users, new registrations, and session counts over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="activeUsers" stackId="1" stroke="#8884d8" fill="#8884d8" name="Active Users" />
                <Area type="monotone" dataKey="newUsers" stackId="1" stroke="#82ca9d" fill="#82ca9d" name="New Users" />
                <Area type="monotone" dataKey="sessions" stackId="2" stroke="#ffc658" fill="#ffc658" name="Sessions" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Crop Yield Comparison */}
          <Card>
            <CardHeader>
              <CardTitle>Crop Yield Comparison by Region</CardTitle>
              <CardDescription>Compare average yields (kg/hectare) across regions</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={yieldComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="region" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="maize" fill="#8884d8" name="Maize" />
                  <Bar dataKey="rice" fill="#82ca9d" name="Rice" />
                  <Bar dataKey="wheat" fill="#ffc658" name="Wheat" />
                  <Bar dataKey="sorghum" fill="#ff8042" name="Sorghum" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Revenue Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Distribution by Category</CardTitle>
              <CardDescription>Breakdown of total revenue across product categories</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={revenueByCategory}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {revenueByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Marketplace Conversion Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Marketplace Conversion Funnel</CardTitle>
            <CardDescription>Track user journey from visit to purchase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                Overall Conversion Rate: <span className="font-bold text-foreground">12.0%</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Drop-off Rate: <span className="font-bold text-red-600">88.0%</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <FunnelChart>
                <Tooltip />
                <Funnel dataKey="value" data={conversionFunnelData}>
                  <LabelList position="right" fill="#000" stroke="none" dataKey="stage" />
                  <LabelList position="inside" fill="#fff" stroke="none" dataKey="value" />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Seasonal Patterns */}
        <Card>
          <CardHeader>
            <CardTitle>Seasonal Pattern Analysis</CardTitle>
            <CardDescription>Identify trends and seasonality in product categories</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={seasonalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="vegetables" stroke="#0088FE" strokeWidth={2} name="Vegetables" />
                <Line type="monotone" dataKey="fruits" stroke="#00C49F" strokeWidth={2} name="Fruits" />
                <Line type="monotone" dataKey="grains" stroke="#FFBB28" strokeWidth={2} name="Grains" />
                <Line type="monotone" dataKey="dairy" stroke="#FF8042" strokeWidth={2} name="Dairy" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Insights Summary */}
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>User Engagement:</strong> Active users increased by 12.3% this period, with average session duration up to 8m 42s</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Regional Performance:</strong> Northern region leads in maize and wheat yields, while Southern excels in rice production</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Conversion Optimization:</strong> 12% conversion rate with major drop-off at "Add to Cart" stage - consider cart abandonment campaigns</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span><strong>Seasonal Trends:</strong> Grain sales peak in Q4 (Oct-Dec), while vegetables show consistent growth throughout the year</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
