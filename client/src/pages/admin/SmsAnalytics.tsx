import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  TrendingDown, 
  Send, 
  CheckCircle, 
  XCircle, 
  DollarSign,
  Users,
  Clock,
  BarChart3,
  PieChart
} from "lucide-react";
import { format, subDays } from "date-fns";

export default function SmsAnalytics() {
  const [dateRange, setDateRange] = useState("30");
  const [trendGroupBy, setTrendGroupBy] = useState<"hour" | "day" | "week" | "month">("day");

  const startDate = subDays(new Date(), parseInt(dateRange)).toISOString();
  const endDate = new Date().toISOString();

  // Queries
  const { data: overallStats, isLoading: loadingStats } = trpc.smsAnalytics.getOverallStats.useQuery({
    startDate,
    endDate,
  });

  const { data: deliveryTrends = [] } = trpc.smsAnalytics.getDeliveryTrends.useQuery({
    startDate,
    endDate,
    groupBy: trendGroupBy,
  });

  const { data: messageTypeBreakdown = [] } = trpc.smsAnalytics.getMessageTypeBreakdown.useQuery({
    startDate,
    endDate,
  });

  const { data: recipientEngagement = [] } = trpc.smsAnalytics.getRecipientEngagement.useQuery({
    startDate,
    endDate,
    limit: 20,
  });

  const { data: templateUsageStats = [] } = trpc.smsAnalytics.getTemplateUsageStats.useQuery();

  const { data: scheduledStats } = trpc.smsAnalytics.getScheduledStats.useQuery();

  const { data: costProjections } = trpc.smsAnalytics.getCostProjections.useQuery({
    days: parseInt(dateRange),
  });

  const { data: hourlyDelivery = [] } = trpc.smsAnalytics.getDeliveryByHourOfDay.useQuery({
    startDate,
    endDate,
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return `₦${(amount / 100).toFixed(2)}`;
  };

  // Format percentage
  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">SMS Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive analytics for SMS delivery, costs, and engagement
          </p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Stats */}
      {loadingStats ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="py-8 text-center text-muted-foreground">
                Loading...
              </CardContent>
            </Card>
          ))}
        </div>
      ) : overallStats ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <Send className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallStats.totalMessages.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {overallStats.deliveredMessages} delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(overallStats.deliveryRate)}</div>
              <p className="text-xs text-muted-foreground">
                {overallStats.failedMessages} failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(overallStats.totalCost)}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(overallStats.averageCostPerMessage)} per message
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failure Rate</CardTitle>
              <XCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercent(overallStats.failureRate)}</div>
              <p className="text-xs text-muted-foreground">
                {overallStats.pendingMessages} pending
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Tabs for different analytics views */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Delivery Trends</TabsTrigger>
          <TabsTrigger value="types">Message Types</TabsTrigger>
          <TabsTrigger value="recipients">Recipients</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
        </TabsList>

        {/* Delivery Trends */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Delivery Trends</CardTitle>
                  <CardDescription>Message delivery over time</CardDescription>
                </div>
                <Select value={trendGroupBy} onValueChange={(v) => setTrendGroupBy(v as any)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Hourly</SelectItem>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {deliveryTrends.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No delivery data available for the selected period
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveryTrends.map((trend: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell>{format(new Date(trend.period), "MMM dd, yyyy")}</TableCell>
                        <TableCell>{trend.totalMessages}</TableCell>
                        <TableCell className="text-green-600">{trend.deliveredMessages}</TableCell>
                        <TableCell className="text-destructive">{trend.failedMessages}</TableCell>
                        <TableCell>{formatCurrency(trend.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Hourly Delivery Pattern */}
          <Card>
            <CardHeader>
              <CardTitle>Delivery Success by Hour of Day</CardTitle>
              <CardDescription>Best times to send messages</CardDescription>
            </CardHeader>
            <CardContent>
              {hourlyDelivery.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No hourly data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hour</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Success Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hourlyDelivery.map((hour: any) => {
                      const successRate = hour.totalMessages > 0 
                        ? (hour.deliveredMessages / hour.totalMessages) * 100 
                        : 0;
                      return (
                        <TableRow key={hour.hour}>
                          <TableCell>{hour.hour}:00</TableCell>
                          <TableCell>{hour.totalMessages}</TableCell>
                          <TableCell>{hour.deliveredMessages}</TableCell>
                          <TableCell>
                            <Badge variant={successRate >= 90 ? "default" : "secondary"}>
                              {formatPercent(successRate)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Message Types */}
        <TabsContent value="types">
          <Card>
            <CardHeader>
              <CardTitle>Message Type Breakdown</CardTitle>
              <CardDescription>Performance by message category</CardDescription>
            </CardHeader>
            <CardContent>
              {messageTypeBreakdown.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No message type data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Message Type</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Success Rate</TableHead>
                      <TableHead>Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messageTypeBreakdown.map((type: any) => {
                      const successRate = type.count > 0 
                        ? (type.deliveredCount / type.count) * 100 
                        : 0;
                      return (
                        <TableRow key={type.messageType}>
                          <TableCell className="font-medium">{type.messageType}</TableCell>
                          <TableCell>{type.count}</TableCell>
                          <TableCell>{type.deliveredCount}</TableCell>
                          <TableCell>
                            <Badge variant={successRate >= 90 ? "default" : "secondary"}>
                              {formatPercent(successRate)}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatCurrency(type.totalCost)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recipients */}
        <TabsContent value="recipients">
          <Card>
            <CardHeader>
              <CardTitle>Top Recipients</CardTitle>
              <CardDescription>Most frequently messaged recipients</CardDescription>
            </CardHeader>
            <CardContent>
              {recipientEngagement.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No recipient data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Total Messages</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Last Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipientEngagement.map((recipient: any) => (
                      <TableRow key={recipient.recipientPhone}>
                        <TableCell className="font-medium">{recipient.recipientPhone}</TableCell>
                        <TableCell>{recipient.totalMessages}</TableCell>
                        <TableCell className="text-green-600">{recipient.deliveredMessages}</TableCell>
                        <TableCell className="text-destructive">{recipient.failedMessages}</TableCell>
                        <TableCell>{formatCurrency(recipient.totalCost)}</TableCell>
                        <TableCell>{format(new Date(recipient.lastMessageDate), "MMM dd, yyyy")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Template Usage Statistics</CardTitle>
              <CardDescription>Most used message templates</CardDescription>
            </CardHeader>
            <CardContent>
              {templateUsageStats.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No template usage data available
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Usage Count</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Default</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templateUsageStats.map((template: any) => (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">{template.name}</TableCell>
                        <TableCell>{template.type}</TableCell>
                        <TableCell>{template.usageCount}</TableCell>
                        <TableCell>
                          {template.isActive ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {template.isDefault && <Badge variant="outline">Default</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scheduled Messages */}
        <TabsContent value="scheduled">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Messages Overview</CardTitle>
                <CardDescription>Status of scheduled messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scheduledStats && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Pending</span>
                      <Badge variant="secondary">
                        <Clock className="mr-1 h-3 w-3" />
                        {scheduledStats.pending}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Sent</span>
                      <Badge variant="default">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {scheduledStats.sent}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Failed</span>
                      <Badge variant="destructive">
                        <XCircle className="mr-1 h-3 w-3" />
                        {scheduledStats.failed}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Cancelled</span>
                      <Badge variant="outline">
                        <XCircle className="mr-1 h-3 w-3" />
                        {scheduledStats.cancelled}
                      </Badge>
                    </div>
                    <div className="pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Total Cost (Sent)</span>
                        <span className="text-lg font-bold">{formatCurrency(scheduledStats.totalCost)}</span>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scheduling Tips</CardTitle>
                <CardDescription>Optimize your message delivery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600 mt-1" />
                  <div>
                    <p className="text-sm font-medium">Best delivery times</p>
                    <p className="text-xs text-muted-foreground">
                      Schedule messages between 9 AM - 5 PM for better engagement
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-blue-600 mt-1" />
                  <div>
                    <p className="text-sm font-medium">Avoid peak hours</p>
                    <p className="text-xs text-muted-foreground">
                      Early morning (6-8 AM) messages have lower delivery rates
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-purple-600 mt-1" />
                  <div>
                    <p className="text-sm font-medium">Batch scheduling</p>
                    <p className="text-xs text-muted-foreground">
                      Use templates for bulk messages to save time
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cost Analysis */}
        <TabsContent value="costs">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cost Projections</CardTitle>
                <CardDescription>Based on last {dateRange} days</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {costProjections && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Average Daily Cost</span>
                      <span className="text-lg font-bold">{formatCurrency(costProjections.avgDailyCost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Projected Weekly</span>
                      <span className="text-lg font-bold">{formatCurrency(costProjections.projectedWeeklyCost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Projected Monthly</span>
                      <span className="text-lg font-bold">{formatCurrency(costProjections.projectedMonthlyCost)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t">
                      <span className="text-sm font-medium">Projected Yearly</span>
                      <span className="text-xl font-bold text-primary">
                        {formatCurrency(costProjections.projectedYearlyCost)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cost Optimization Tips</CardTitle>
                <CardDescription>Reduce SMS expenses</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-green-600 mt-1" />
                  <div>
                    <p className="text-sm font-medium">Keep messages concise</p>
                    <p className="text-xs text-muted-foreground">
                      Messages under 160 characters cost less (1 SMS segment)
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <PieChart className="h-4 w-4 text-blue-600 mt-1" />
                  <div>
                    <p className="text-sm font-medium">Use templates</p>
                    <p className="text-xs text-muted-foreground">
                      Pre-approved templates reduce errors and failed deliveries
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-purple-600 mt-1" />
                  <div>
                    <p className="text-sm font-medium">Monitor delivery rates</p>
                    <p className="text-xs text-muted-foreground">
                      Invalid numbers waste money - clean your contact list regularly
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
