import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, TrendingUp, Eye, ShoppingCart, DollarSign, Star, Package, BarChart3 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function SellerAnalytics() {
  const [timeRange, setTimeRange] = useState("30");

  // Fetch seller's listings
  const { data: listings, isLoading: listingsLoading } = trpc.marketplace.getMyListings.useQuery();

  // Fetch seller's sales/orders
  const { data: sales, isLoading: salesLoading } = trpc.marketplace.getMySales.useQuery();

  if (listingsLoading || salesLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // Calculate metrics
  const totalListings = listings?.length || 0;
  const activeListings = listings?.filter((l: any) => l.status === 'active').length || 0;
  const totalSales = sales?.length || 0;
  
  // Calculate total revenue
  const totalRevenue = sales?.reduce((sum: number, sale: any) => {
    return sum + (sale.totalAmount || 0);
  }, 0) || 0;

  // Calculate average order value
  const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

  // Calculate conversion rate (orders / total views)
  const totalViews = listings?.reduce((sum: number, listing: any) => sum + (listing.views || 0), 0) || 0;
  const conversionRate = totalViews > 0 ? (totalSales / totalViews) * 100 : 0;

  // Prepare revenue trend data (mock data for demo)
  const revenueTrendData = [
    { date: 'Week 1', revenue: totalRevenue * 0.15 },
    { date: 'Week 2', revenue: totalRevenue * 0.22 },
    { date: 'Week 3', revenue: totalRevenue * 0.28 },
    { date: 'Week 4', revenue: totalRevenue * 0.35 },
  ];

  // Prepare category distribution data
  const categoryData = listings?.reduce((acc: any, listing: any) => {
    const cat = listing.category || 'Other';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {}) || {};

  const categoryChartData = Object.entries(categoryData).map(([name, value]) => ({
    name,
    value: value as number,
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Top performing products
  const topProducts = listings
    ?.map((listing: any) => ({
      ...listing,
      salesCount: sales?.filter((s: any) => s.listingId === listing.id).length || 0,
      revenue: sales
        ?.filter((s: any) => s.listingId === listing.id)
        .reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0) || 0,
    }))
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 5) || [];

  const formatCurrency = (cents: number) => {
    return `₦${(cents / 100).toFixed(2)}`;
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Seller Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Track your marketplace performance and insights
            </p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Listings</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalListings}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeListings} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSales}</div>
              <p className="text-xs text-green-600 mt-1 flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                +12% from last period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Avg: {formatCurrency(avgOrderValue)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{conversionRate.toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalViews} total views
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Trend */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Weekly revenue over the last month</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={revenueTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value)}
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    name="Revenue (₦)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Category Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Product Categories</CardTitle>
              <CardDescription>Distribution of your listings by category</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Performing Products */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Products</CardTitle>
            <CardDescription>Your best-selling listings by revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length > 0 ? (
              <div className="space-y-4">
                {topProducts.map((product: any, index: number) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{product.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {product.category} • {product.quantity} {product.unit} available
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">
                        {formatCurrency(product.revenue)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {product.salesCount} sales • {product.views || 0} views
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No sales data available yet. Start selling to see your top products!
              </div>
            )}
          </CardContent>
        </Card>

        {/* Listing Performance Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Listings Performance</CardTitle>
            <CardDescription>Detailed metrics for each of your listings</CardDescription>
          </CardHeader>
          <CardContent>
            {listings && listings.length > 0 ? (
              <div className="overflow-x-auto">
                <table role="table" aria-label="Data table" className="w-full">
                  <thead role="rowgroup">
                    <tr className="border-b">
                      <th className="text-left py-3 px-2">Product</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-right py-3 px-2">Price</th>
                      <th className="text-right py-3 px-2">Views</th>
                      <th className="text-right py-3 px-2">Sales</th>
                      <th className="text-right py-3 px-2">Revenue</th>
                      <th className="text-right py-3 px-2">Conv. Rate</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {listings.map((listing: any) => {
                      const listingSales = sales?.filter((s: any) => s.listingId === listing.id) || [];
                      const listingRevenue = listingSales.reduce((sum: number, s: any) => sum + (s.totalAmount || 0), 0);
                      const listingViews = listing.views || 0;
                      const listingConversion = listingViews > 0 ? (listingSales.length / listingViews) * 100 : 0;

                      return (
                        <tr key={listing.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <div className="font-medium">{listing.title}</div>
                            <div className="text-xs text-muted-foreground">{listing.category}</div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant={listing.status === 'active' ? 'default' : 'secondary'}>
                              {listing.status}
                            </Badge>
                          </td>
                          <td className="text-right py-3 px-2">
                            {formatCurrency(listing.pricePerUnit)}
                          </td>
                          <td className="text-right py-3 px-2">
                            <div className="flex items-center justify-end gap-1">
                              <Eye className="h-3 w-3 text-muted-foreground" />
                              {listingViews}
                            </div>
                          </td>
                          <td className="text-right py-3 px-2">
                            {listingSales.length}
                          </td>
                          <td className="text-right py-3 px-2 font-semibold">
                            {formatCurrency(listingRevenue)}
                          </td>
                          <td className="text-right py-3 px-2">
                            <span className={listingConversion > 5 ? 'text-green-600' : 'text-muted-foreground'}>
                              {listingConversion.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No listings yet. Create your first listing to start tracking performance!
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
