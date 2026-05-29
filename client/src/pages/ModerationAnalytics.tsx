import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Activity,
} from "lucide-react";

/**
 * Moderation Analytics Dashboard
 * Real-time insights into automated moderation performance
 */
export default function ModerationAnalytics() {
  const { data: overview, isLoading: overviewLoading } = trpc.moderationAnalytics.getOverview.useQuery();
  const { data: queue } = trpc.moderationAnalytics.getModerationQueue.useQuery({ limit: 10, offset: 0 });
  const { data: timeline } = trpc.moderationAnalytics.getActivityTimeline.useQuery();
  const { data: rules } = trpc.moderationAnalytics.getRuleEffectiveness.useQuery();
  const { data: accuracy } = trpc.moderationAnalytics.getAccuracyMetrics.useQuery();
  const { data: performance } = trpc.moderationAnalytics.getModeratorPerformance.useQuery();
  const { data: sentiment } = trpc.moderationAnalytics.getSentimentTrends.useQuery();

  if (overviewLoading) {
    return (
      <div role="main" aria-label="Page content" className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Moderation Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Real-time insights into automated review moderation performance
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{overview?.today.total || 0} today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auto-Approval Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.autoApprovalRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {overview?.published || 0} published
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Reviews</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.flagged || 0}</div>
            <p className="text-xs text-muted-foreground">
              {overview?.flagRate || 0}% flag rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Verification Rate</CardTitle>
            <Target className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.verificationRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {overview?.verified || 0} verified
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Moderation Queue</TabsTrigger>
          <TabsTrigger value="rules">Rule Effectiveness</TabsTrigger>
          <TabsTrigger value="accuracy">Accuracy Metrics</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Moderation Queue */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flagged Reviews Queue</CardTitle>
              <CardDescription>
                Reviews requiring manual review
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queue && queue.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Review</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Verified</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {item.comment}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.userFirstName} {item.userLastName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.rating} ⭐</Badge>
                        </TableCell>
                        <TableCell>
                          {item.verifiedPurchase ? (
                            <Badge variant="default">Verified</Badge>
                          ) : (
                            <Badge variant="secondary">Unverified</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive">
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No reviews in moderation queue
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rule Effectiveness */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Moderation Rule Performance</CardTitle>
              <CardDescription>
                Effectiveness of each automated moderation rule
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rules && rules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead>Triggered</TableHead>
                      <TableHead>False Positives</TableHead>
                      <TableHead>Accuracy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule: any) => (
                      <TableRow key={rule.ruleId}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>{rule.triggered}</TableCell>
                        <TableCell>{rule.falsePositives}</TableCell>
                        <TableCell>
                          <Badge
                            variant={rule.accuracy >= 90 ? "default" : "secondary"}
                          >
                            {rule.accuracy}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No rule data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Accuracy Metrics */}
        <TabsContent value="accuracy" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Overall Accuracy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{accuracy?.overallAccuracy || 0}%</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {accuracy?.correctDecisions || 0} / {accuracy?.totalReviewed || 0} correct
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">False Positive Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{accuracy?.falsePositiveRate || 0}%</div>
                <p className="text-xs text-muted-foreground mt-2">
                  Good reviews incorrectly flagged
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">False Negative Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{accuracy?.falseNegativeRate || 0}%</div>
                <p className="text-xs text-muted-foreground mt-2">
                  Bad reviews incorrectly approved
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Classification Metrics</CardTitle>
              <CardDescription>
                Precision, recall, and F1 score for moderation decisions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Precision</div>
                  <div className="text-2xl font-bold">{accuracy?.precision || 0}%</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Recall</div>
                  <div className="text-2xl font-bold">{accuracy?.recall || 0}%</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">F1 Score</div>
                  <div className="text-2xl font-bold">{accuracy?.f1Score || 0}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Automated Moderation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Reviews Processed</div>
                  <div className="text-2xl font-bold">{performance?.automated.reviewsProcessed || 0}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Average Time</div>
                  <div className="text-2xl font-bold">{performance?.automated.averageTime || 0}s</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Accuracy</div>
                  <div className="text-2xl font-bold">{performance?.automated.accuracy || 0}%</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Manual Moderation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Reviews Processed</div>
                  <div className="text-2xl font-bold">{performance?.manual.reviewsProcessed || 0}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Average Time</div>
                  <div className="text-2xl font-bold">{performance?.manual.averageTime || 0}s</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Accuracy</div>
                  <div className="text-2xl font-bold">{performance?.manual.accuracy || 0}%</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cost Savings</CardTitle>
              <CardDescription>
                Efficiency gains from automated moderation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Time Saved</div>
                  <div className="text-2xl font-bold">{performance?.costSavings.timesSaved || 0}h</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Cost Saved</div>
                  <div className="text-2xl font-bold">${performance?.costSavings.costSaved || 0}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Efficiency Gain</div>
                  <div className="text-2xl font-bold">{performance?.costSavings.efficiencyGain || 0}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
