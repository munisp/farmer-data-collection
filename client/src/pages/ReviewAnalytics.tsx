import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Loader2, TrendingUp, CheckCircle, XCircle, Flag, Star, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Review Analytics Dashboard
 * Admin-only page showing review statistics and insights
 */

export default function ReviewAnalytics() {
  const { data: overview, isLoading: loadingOverview } = trpc.reviewAnalytics.getOverview.useQuery();
  const { data: verificationStats, isLoading: loadingVerification } = trpc.reviewAnalytics.getVerificationStats.useQuery();
  const { data: moderationStats, isLoading: loadingModeration } = trpc.reviewAnalytics.getModerationStats.useQuery();
  const { data: topReviewers, isLoading: loadingReviewers } = trpc.reviewAnalytics.getTopReviewers.useQuery({ limit: 10 });

  const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'];

  if (loadingOverview) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pieData = [
    { name: 'Published', value: overview?.published || 0, color: '#22c55e' },
    { name: 'Hidden', value: overview?.hidden || 0, color: '#ef4444' },
    { name: 'Flagged', value: overview?.flagged || 0, color: '#f59e0b' },
  ];

  return (
    <div role="main" aria-label="Page content" className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Review Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Insights and statistics for product reviews
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {overview?.verificationRate}% verified purchases
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.averageRating || 0}</div>
            <p className="text-xs text-muted-foreground">
              Out of 5 stars
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verified Reviews</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.verified || 0}</div>
            <p className="text-xs text-muted-foreground">
              Confirmed purchases
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Reviews</CardTitle>
            <Flag className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.flagged || 0}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting moderation
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="verification" className="space-y-4">
        <TabsList>
          <TabsTrigger value="verification">Verification Analysis</TabsTrigger>
          <TabsTrigger value="status">Status Distribution</TabsTrigger>
          <TabsTrigger value="reviewers">Top Reviewers</TabsTrigger>
        </TabsList>

        {/* Verification Analysis Tab */}
        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Verification by Rating</CardTitle>
              <CardDescription>
                Comparison of verified vs unverified reviews across ratings
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingVerification ? (
                <div className="flex items-center justify-center h-80">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={verificationStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rating" label={{ value: 'Rating (stars)', position: 'insideBottom', offset: -5 }} />
                    <YAxis label={{ value: 'Number of Reviews', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="verified" fill="#22c55e" name="Verified Purchase" />
                    <Bar dataKey="unverified" fill="#94a3b8" name="Unverified" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">With Photos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.withPhotos || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {overview?.total ? ((overview.withPhotos / overview.total) * 100).toFixed(1) : 0}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Helpful Votes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.helpful || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Reviews marked as helpful
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Unverified</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overview?.unverified || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Without purchase confirmation
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Status Distribution Tab */}
        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review Status Distribution</CardTitle>
              <CardDescription>
                Current moderation status of all reviews
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Reviewers Tab */}
        <TabsContent value="reviewers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Reviewers</CardTitle>
              <CardDescription>
                Most active reviewers on the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingReviewers ? (
                <div className="flex items-center justify-center h-80">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-4">
                  {topReviewers?.map((reviewer, index) => (
                    <div key={reviewer.userId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                          #{index + 1}
                        </div>
                        <div>
                          <p className="font-medium">
                            {reviewer.user ? `${reviewer.user.firstName} ${reviewer.user.lastName}` : 'Unknown User'}
                          </p>
                          <p className="text-sm text-muted-foreground">{reviewer.user?.email}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold">{reviewer.reviewCount}</p>
                          <p className="text-xs text-muted-foreground">Reviews</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{reviewer.verificationRate}%</p>
                          <p className="text-xs text-muted-foreground">Verified</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{reviewer.avgRating?.toFixed(1) || 0}</p>
                          <p className="text-xs text-muted-foreground">Avg Rating</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">{reviewer.totalHelpful}</p>
                          <p className="text-xs text-muted-foreground">Helpful</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
