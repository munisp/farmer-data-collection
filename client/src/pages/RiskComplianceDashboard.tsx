import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Shield,
  Eye,
  Search,
  FileText,
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";

function getDateBounds(range: string) {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case "24h":
      start.setDate(start.getDate() - 1);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
    default:
      start.setDate(start.getDate() - 7);
      break;
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  return new Date(date).toLocaleString();
}

function deriveSeverity(score: number): Severity {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function getSeverityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return <Badge variant="destructive">Critical</Badge>;
    case "high":
      return <Badge className="bg-orange-500">High</Badge>;
    case "medium":
      return <Badge className="bg-yellow-500">Medium</Badge>;
    case "low":
      return <Badge variant="outline">Low</Badge>;
    default:
      return <Badge variant="outline">{severity}</Badge>;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "resolved":
    case "approved":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "investigating":
    case "under_review":
    case "in_review":
      return <Eye className="h-4 w-4 text-blue-600" />;
    case "pending":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case "dismissed":
    case "rejected":
      return <XCircle className="h-4 w-4 text-gray-600" />;
    default:
      return <AlertCircle className="h-4 w-4" />;
  }
}

export default function RiskComplianceDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("7d");

  const { startDate, endDate } = useMemo(() => getDateBounds(dateRange), [dateRange]);

  const auditStatsQuery = trpc.auditTrail.getStatistics.useQuery({ startDate, endDate });
  const auditLogsQuery = trpc.auditTrail.getLogs.useQuery({
    page: 1,
    pageSize: 50,
    startDate,
    endDate,
    search: searchTerm.trim() || undefined,
  });
  const riskProfilesQuery = trpc.riskAssessment.getAllRiskProfiles.useQuery();
  const moderationOverviewQuery = trpc.moderationAnalytics.getOverview.useQuery();
  const moderationQueueQuery = trpc.moderationAnalytics.getModerationQueue.useQuery({ limit: 25, offset: 0 });
  const kycPendingQuery = trpc.kyc.getPendingReviews.useQuery({ status: "pending", limit: 100, offset: 0 });
  const kycInReviewQuery = trpc.kyc.getPendingReviews.useQuery({ status: "in_review", limit: 100, offset: 0 });
  const kycApprovedQuery = trpc.kyc.getPendingReviews.useQuery({ status: "approved", limit: 100, offset: 0 });
  const kycRejectedQuery = trpc.kyc.getPendingReviews.useQuery({ status: "rejected", limit: 100, offset: 0 });

  const isLoading =
    auditStatsQuery.isLoading ||
    auditLogsQuery.isLoading ||
    riskProfilesQuery.isLoading ||
    moderationOverviewQuery.isLoading ||
    moderationQueueQuery.isLoading ||
    kycPendingQuery.isLoading ||
    kycInReviewQuery.isLoading ||
    kycApprovedQuery.isLoading ||
    kycRejectedQuery.isLoading;

  const riskAlerts = useMemo(() => {
    const profiles = (riskProfilesQuery.data || []) as Array<any>;
    return profiles
      .map((profile, index) => ({
        id: index + 1,
        type: `${profile.riskCategory || "risk"}_borrower_risk`,
        severity: deriveSeverity(Number(profile.riskScore || 0)),
        description: `${profile.userName || `Borrower #${profile.userId}`} has a ${profile.riskCategory || "monitored"} credit-risk profile with score ${profile.riskScore || 0}.`,
        status: Number(profile.riskScore || 0) >= 70 ? "investigating" : "pending",
        createdAt: profile.lastAssessment || new Date().toISOString(),
        entityType: "borrower",
        entityId: profile.userId,
      }))
      .filter((alert) => (riskFilter === "all" ? true : alert.severity === riskFilter))
      .slice(0, 25);
  }, [riskProfilesQuery.data, riskFilter]);

  const suspiciousActivities = useMemo(() => {
    const profiles = (riskProfilesQuery.data || []) as Array<any>;
    const queue = (moderationQueueQuery.data || []) as Array<any>;

    const borrowerSignals = profiles.slice(0, 10).map((profile, index) => ({
      id: `risk-${index}`,
      type: `${profile.riskCategory || "credit"}_credit_risk`,
      description: `${profile.userName || `Borrower #${profile.userId}`} flagged by risk assessment with recommendations: ${(profile.recommendations || []).slice(0, 2).join(", ") || "manual review required"}`,
      riskScore: Number(profile.riskScore || 0),
      status: Number(profile.riskScore || 0) >= 80 ? "escalated" : "under_review",
      detectedAt: profile.lastAssessment || new Date().toISOString(),
    }));

    const moderationSignals = queue.slice(0, 10).map((item) => ({
      id: `review-${item.id}`,
      type: "flagged_review",
      description: `Review ${item.id} by ${[item.userFirstName, item.userLastName].filter(Boolean).join(" ") || item.userEmail || `User #${item.userId}`} requires moderator attention.`,
      riskScore: item.verifiedPurchase ? 62 : 78,
      status: "under_review",
      detectedAt: item.createdAt,
    }));

    return [...borrowerSignals, ...moderationSignals]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20);
  }, [riskProfilesQuery.data, moderationQueueQuery.data]);

  const auditLogs = useMemo(() => {
    const logs = (auditLogsQuery.data?.logs || []) as Array<any>;
    return logs.map((log) => ({
      id: log.id,
      action: log.eventType,
      userId: log.userId,
      userName: log.userId ? `User #${log.userId}` : "System",
      resourceType: log.entityType,
      resourceId: log.entityId,
      details: JSON.stringify(log.data || log.metadata || {}).slice(0, 120) || "No structured details",
      ipAddress: log.metadata?.ipAddress || "-",
      createdAt: log.timestamp || log.createdAt,
    }));
  }, [auditLogsQuery.data]);

  const complianceMetrics = useMemo(() => {
    const approved = Number(kycApprovedQuery.data?.total || kycApprovedQuery.data?.reviews?.length || 0);
    const pending = Number(kycPendingQuery.data?.total || kycPendingQuery.data?.reviews?.length || 0);
    const inReview = Number(kycInReviewQuery.data?.total || kycInReviewQuery.data?.reviews?.length || 0);
    const rejected = Number(kycRejectedQuery.data?.total || kycRejectedQuery.data?.reviews?.length || 0);
    const totalKyc = approved + pending + inReview + rejected;
    const verifiedRate = totalKyc > 0 ? (approved / totalKyc) * 100 : 0;
    const moderationOverview = moderationOverviewQuery.data;
    const auditStats = auditStatsQuery.data;

    return {
      totalAlerts: riskAlerts.length + (moderationOverview?.flagged || 0),
      criticalAlerts: riskAlerts.filter((alert) => alert.severity === "critical").length,
      resolvedToday: moderationOverview?.today?.published || 0,
      avgResolutionTime: moderationOverview?.flagRate ? Number((24 / Math.max(moderationOverview.flagRate, 1)).toFixed(1)) : 0,
      kycComplianceRate: Number(verifiedRate.toFixed(1)),
      amlFlagsThisMonth: moderationOverview?.flagged || 0,
      auditLogsToday: auditStats?.totalEvents || 0,
      suspiciousTransactions: suspiciousActivities.filter((item) => item.riskScore >= 80).length,
      approved,
      pending: pending + inReview,
      rejected,
      screened: moderationOverview?.total || 0,
      blocked: moderationOverview?.hidden || 0,
    };
  }, [auditStatsQuery.data, kycApprovedQuery.data, kycInReviewQuery.data, kycPendingQuery.data, kycRejectedQuery.data, moderationOverviewQuery.data, riskAlerts, suspiciousActivities]);

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="container mx-auto p-4 flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Risk & Compliance
          </h1>
          <p className="text-muted-foreground">
            Monitor live platform audit activity, borrower risk, moderation signals, and KYC compliance.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}>
            <FileText className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{complianceMetrics.totalAlerts}</div>
            <div className="text-sm text-red-600">{complianceMetrics.criticalAlerts} critical</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              KYC Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{complianceMetrics.kycComplianceRate}%</div>
            <div className="text-sm text-muted-foreground">Approved KYC profiles</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Moderation Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{complianceMetrics.amlFlagsThisMonth}</div>
            <div className="text-sm text-muted-foreground">Flagged review signals</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Audit Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{complianceMetrics.auditLogsToday}</div>
            <div className="text-sm text-muted-foreground">Events in selected period</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alerts">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Risk Alerts
          </TabsTrigger>
          <TabsTrigger value="suspicious">
            <Eye className="h-4 w-4 mr-2" />
            Suspicious Activity
          </TabsTrigger>
          <TabsTrigger value="audit">
            <FileText className="h-4 w-4 mr-2" />
            Audit Trail
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <Shield className="h-4 w-4 mr-2" />
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle>Risk Alerts</CardTitle>
                  <CardDescription>Borrower risk profiles elevated from live platform risk assessments.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={riskFilter} onValueChange={setRiskFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severities</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskAlerts.map((alert) => (
                    <TableRow key={`${alert.entityId}-${alert.id}`}>
                      <TableCell className="font-mono">#{alert.id}</TableCell>
                      <TableCell className="capitalize">{alert.type.replace(/_/g, " ")}</TableCell>
                      <TableCell>{getSeverityBadge(alert.severity)}</TableCell>
                      <TableCell className="max-w-xs truncate">{alert.description}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(alert.status)}
                          <span className="capitalize">{alert.status.replace(/_/g, " ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(alert.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspicious">
          <Card>
            <CardHeader>
              <CardTitle>Suspicious Activity Detection</CardTitle>
              <CardDescription>Combined view of high-risk borrowers and flagged marketplace moderation events.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suspiciousActivities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-mono">{activity.id}</TableCell>
                      <TableCell className="capitalize">{activity.type.replace(/_/g, " ")}</TableCell>
                      <TableCell className="max-w-xs truncate">{activity.description}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-12 h-2 rounded-full ${
                              activity.riskScore >= 80
                                ? "bg-red-500"
                                : activity.riskScore >= 60
                                ? "bg-yellow-500"
                                : "bg-green-500"
                            }`}
                          />
                          <span className="font-medium">{activity.riskScore}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={activity.status === "escalated" ? "destructive" : "outline"}>
                          {activity.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(activity.detectedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle>Audit Trail</CardTitle>
                  <CardDescription>Live audit events retrieved from the platform audit log.</CardDescription>
                </div>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Search" placeholder="Search logs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(log.createdAt)}</TableCell>
                      <TableCell>{log.userName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell>{log.resourceType} #{log.resourceId}</TableCell>
                      <TableCell className="max-w-xs truncate">{log.details}</TableCell>
                      <TableCell className="font-mono text-sm">{log.ipAddress}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>KYC Status</CardTitle>
                <CardDescription>Know Your Customer verification status from live review queues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Approved</span>
                    <span className="font-bold text-green-600">{complianceMetrics.approved}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Pending / In Review</span>
                    <span className="font-bold text-yellow-600">{complianceMetrics.pending}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Rejected</span>
                    <span className="font-bold text-red-600">{complianceMetrics.rejected}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Marketplace Moderation</CardTitle>
                <CardDescription>Live review-screening and moderation status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Reviews Screened</span>
                    <span className="font-bold">{complianceMetrics.screened}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Flagged for Review</span>
                    <span className="font-bold text-yellow-600">{complianceMetrics.amlFlagsThisMonth}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Hidden / Blocked</span>
                    <span className="font-bold text-red-600">{complianceMetrics.blocked}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Privacy</CardTitle>
                <CardDescription>Operational controls inferred from live audit and verification systems</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Consent / identity audit trail</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span>KYC review workflow</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Moderation evidence trail</span>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Operational Reporting</CardTitle>
                <CardDescription>Summary derived from live audit and moderation datasets</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Audit events in range</span>
                    <Badge variant="outline" className="text-green-600">{complianceMetrics.auditLogsToday}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Top suspicious signals</span>
                    <Badge variant="outline" className="text-yellow-600">{complianceMetrics.suspiciousTransactions}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Resolved moderation items today</span>
                    <Badge variant="outline" className="text-green-600">{complianceMetrics.resolvedToday}</Badge>
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
