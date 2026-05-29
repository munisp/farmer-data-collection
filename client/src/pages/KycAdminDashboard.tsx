import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  User,
  Search,
  Filter,
  Eye,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  RefreshCw,
  History,
  Loader2,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

type KycTier = "unverified" | "basic" | "standard" | "enhanced" | "premium";
type KycStatus = "pending" | "in_review" | "approved" | "rejected" | "expired" | "suspended";

type Review = {
  id: number;
  userId: number;
  currentTier: KycTier;
  status: KycStatus;
  legalFirstName?: string | null;
  legalLastName?: string | null;
  phoneVerified?: boolean | null;
  emailVerified?: boolean | null;
  idVerified?: boolean | null;
  riskScore?: number | null;
  createdAt: string;
};

const STATUSES: Array<KycStatus> = ["pending", "in_review", "approved", "rejected", "suspended"];

function fullName(review: Review) {
  const name = [review.legalFirstName, review.legalLastName].filter(Boolean).join(" ").trim();
  return name || `User #${review.userId}`;
}

export default function KycAdminDashboard() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [suspensionReason, setSuspensionReason] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);

  const pendingQuery = trpc.kyc.getPendingReviews.useQuery({ status: "pending", limit: 100, offset: 0 });
  const inReviewQuery = trpc.kyc.getPendingReviews.useQuery({ status: "in_review", limit: 100, offset: 0 });
  const approvedQuery = trpc.kyc.getPendingReviews.useQuery({ status: "approved", limit: 100, offset: 0 });
  const rejectedQuery = trpc.kyc.getPendingReviews.useQuery({ status: "rejected", limit: 100, offset: 0 });
  const suspendedQuery = trpc.kyc.getPendingReviews.useQuery({ status: "suspended", limit: 100, offset: 0 });

  const auditHistory = trpc.kyc.getAuditHistory.useQuery(
    { userId: selectedReview?.userId || 0, limit: 50 },
    { enabled: !!selectedReview }
  );

  const reviewBuckets = useMemo<Record<string, Review[]>>(() => ({
    pending: pendingQuery.data?.reviews as Review[] || [],
    in_review: inReviewQuery.data?.reviews as Review[] || [],
    approved: approvedQuery.data?.reviews as Review[] || [],
    rejected: rejectedQuery.data?.reviews as Review[] || [],
    suspended: suspendedQuery.data?.reviews as Review[] || [],
  }), [pendingQuery.data, inReviewQuery.data, approvedQuery.data, rejectedQuery.data, suspendedQuery.data]);

  const reviews = useMemo(() => {
    const source = statusFilter === "all"
      ? STATUSES.flatMap((status) => reviewBuckets[status] || [])
      : reviewBuckets[statusFilter] || [];

    return source.filter((review) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        fullName(review).toLowerCase().includes(query) ||
        String(review.userId).includes(query) ||
        review.currentTier.toLowerCase().includes(query)
      );
    });
  }, [reviewBuckets, searchQuery, statusFilter]);

  const isLoading = pendingQuery.isLoading || inReviewQuery.isLoading || approvedQuery.isLoading || rejectedQuery.isLoading || suspendedQuery.isLoading;

  const refreshAll = async () => {
    await Promise.all([
      pendingQuery.refetch(),
      inReviewQuery.refetch(),
      approvedQuery.refetch(),
      rejectedQuery.refetch(),
      suspendedQuery.refetch(),
      selectedReview ? auditHistory.refetch() : Promise.resolve(),
    ]);
  };

  const onMutationSuccess = async (message: string) => {
    toast.success(message);
    setShowApproveDialog(false);
    setShowRejectDialog(false);
    setShowSuspendDialog(false);
    setActionNotes("");
    setRejectionReason("");
    setSuspensionReason("");
    await utils.kyc.getPendingReviews.invalidate();
    if (selectedReview) {
      await utils.kyc.getAuditHistory.invalidate({ userId: selectedReview.userId, limit: 50 });
    }
    await refreshAll();
  };

  const approveMutation = trpc.kyc.approveKyc.useMutation({
    onSuccess: async () => onMutationSuccess("KYC approved successfully"),
    onError: (error) => toast.error(error.message || "Unable to approve KYC"),
  });

  const rejectMutation = trpc.kyc.rejectKyc.useMutation({
    onSuccess: async () => onMutationSuccess("KYC rejected successfully"),
    onError: (error) => toast.error(error.message || "Unable to reject KYC"),
  });

  const suspendMutation = trpc.kyc.suspendKyc.useMutation({
    onSuccess: async () => onMutationSuccess("KYC suspended successfully"),
    onError: (error) => toast.error(error.message || "Unable to suspend KYC"),
  });

  const getStatusBadge = (status: KycStatus) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case "in_review":
        return <Badge className="bg-blue-600"><Eye className="w-3 h-3 mr-1" />In Review</Badge>;
      case "suspended":
        return <Badge className="bg-orange-600"><AlertCircle className="w-3 h-3 mr-1" />Suspended</Badge>;
      case "expired":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Expired</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getTierBadge = (tier: KycTier) => {
    const colors: Record<KycTier, string> = {
      unverified: "bg-gray-500",
      basic: "bg-blue-500",
      standard: "bg-green-500",
      enhanced: "bg-purple-500",
      premium: "bg-yellow-500",
    };
    return <Badge className={colors[tier]}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Badge>;
  };

  const riskBadge = (score?: number | null) => {
    const numeric = score ?? 0;
    const label = numeric >= 75 ? "Critical" : numeric >= 50 ? "High" : numeric >= 25 ? "Medium" : "Low";
    const color = numeric >= 75 ? "bg-red-600" : numeric >= 50 ? "bg-orange-600" : numeric >= 25 ? "bg-yellow-600" : "bg-green-600";
    return <Badge className={color}>{label} ({numeric})</Badge>;
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">KYC Administration</h1>
            <p className="text-muted-foreground mt-2">Review live compliance records, approve or reject requests, and inspect audit history.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshAll()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-600">{reviewBuckets.pending.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">In Review</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-blue-600">{reviewBuckets.in_review.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{reviewBuckets.approved.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{reviewBuckets.rejected.length}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Suspended</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{reviewBuckets.suspended.length}</div></CardContent></Card>
        </div>

        <Tabs defaultValue="reviews" className="space-y-4">
          <TabsList>
            <TabsTrigger value="reviews">Review Queue</TabsTrigger>
            <TabsTrigger value="audit">Selected Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="reviews" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input className="pl-10" aria-label="Search" placeholder="Search by user name, tier, or user ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                  <div className="w-full md:w-56">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filter by status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>KYC Review Queue</CardTitle>
                <CardDescription>{reviews.length} live review record(s) found</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Current Tier</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Verification Flags</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead>Submitted</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reviews.map((review) => (
                          <TableRow key={`${review.status}-${review.userId}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                </div>
                                <div>
                                  <div className="font-medium">{fullName(review)}</div>
                                  <div className="text-xs text-muted-foreground">User #{review.userId}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{getTierBadge(review.currentTier)}</TableCell>
                            <TableCell>{getStatusBadge(review.status)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {review.phoneVerified && <Badge variant="outline">Phone</Badge>}
                                {review.emailVerified && <Badge variant="outline">Email</Badge>}
                                {review.idVerified && <Badge variant="outline">ID</Badge>}
                                {!review.phoneVerified && !review.emailVerified && !review.idVerified && <Badge variant="secondary">No checks completed</Badge>}
                              </div>
                            </TableCell>
                            <TableCell>{riskBadge(review.riskScore)}</TableCell>
                            <TableCell>{new Date(review.createdAt).toLocaleString()}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => setSelectedReview(review)}>
                                  <Eye className="w-4 h-4 mr-1" />View
                                </Button>
                                <Button size="sm" onClick={() => { setSelectedReview(review); setShowApproveDialog(true); }}>
                                  <ThumbsUp className="w-4 h-4 mr-1" />Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => { setSelectedReview(review); setShowRejectDialog(true); }}>
                                  <ThumbsDown className="w-4 h-4 mr-1" />Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Selected Review Details</CardTitle>
                <CardDescription>Choose a review from the queue to inspect its live audit history and take action.</CardDescription>
              </CardHeader>
              <CardContent>
                {!selectedReview ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No review selected yet.</div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">User</div><div className="font-medium mt-1">{fullName(selectedReview)}</div></div>
                      <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">Tier</div><div className="mt-1">{getTierBadge(selectedReview.currentTier)}</div></div>
                      <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">Status</div><div className="mt-1">{getStatusBadge(selectedReview.status)}</div></div>
                      <div className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">Risk</div><div className="mt-1">{riskBadge(selectedReview.riskScore)}</div></div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => setShowApproveDialog(true)}><ThumbsUp className="w-4 h-4 mr-2" />Approve</Button>
                      <Button variant="destructive" onClick={() => setShowRejectDialog(true)}><ThumbsDown className="w-4 h-4 mr-2" />Reject</Button>
                      <Button variant="outline" onClick={() => setShowSuspendDialog(true)}><AlertTriangle className="w-4 h-4 mr-2" />Suspend</Button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 font-medium"><History className="w-4 h-4" />Audit History</div>
                      {auditHistory.isLoading ? (
                        <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                      ) : (auditHistory.data?.history?.length || 0) === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No audit events recorded for this profile yet.</div>
                      ) : (
                        <div className="space-y-3">
                          {auditHistory.data?.history.map((entry) => (
                            <div key={entry.id} className="rounded-lg border p-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-2 font-medium">
                                  <Shield className="w-4 h-4 text-primary" />
                                  {entry.action.replace(/_/g, " ")}
                                </div>
                                <div className="text-xs text-muted-foreground">{new Date(entry.performedAt).toLocaleString()}</div>
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                Status: {entry.previousStatus || "n/a"} → {entry.newStatus || "n/a"}
                                {entry.newTier ? ` | Tier: ${entry.previousTier || "n/a"} → ${entry.newTier}` : ""}
                              </div>
                              {entry.reason && <div className="mt-2 text-sm">{entry.reason}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve KYC</DialogTitle>
            <DialogDescription>Approve the selected KYC profile and optionally promote the user to a higher tier.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Approval Notes</Label>
              <Textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="Add reviewer notes" />
            </div>
            <Button
              className="w-full"
              disabled={!selectedReview || approveMutation.isPending}
              onClick={() => selectedReview && approveMutation.mutate({ userId: selectedReview.userId, notes: actionNotes, newTier: selectedReview.currentTier })}
            >
              {approveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Approve KYC
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject KYC</DialogTitle>
            <DialogDescription>Provide a rejection reason so the user and audit trail capture the failure clearly.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Explain why this review is being rejected" />
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Textarea value={actionNotes} onChange={(e) => setActionNotes(e.target.value)} placeholder="Optional internal reviewer notes" />
            </div>
            <Button
              variant="destructive"
              className="w-full"
              disabled={!selectedReview || rejectMutation.isPending || rejectionReason.trim().length < 10}
              onClick={() => selectedReview && rejectMutation.mutate({ userId: selectedReview.userId, reason: rejectionReason, notes: actionNotes })}
            >
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Reject KYC
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend KYC</DialogTitle>
            <DialogDescription>Use suspension when a previously reviewed profile must be held pending further compliance action.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Suspension Reason</Label>
              <Textarea value={suspensionReason} onChange={(e) => setSuspensionReason(e.target.value)} placeholder="Explain the suspension reason" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={!selectedReview || suspendMutation.isPending || suspensionReason.trim().length < 10}
              onClick={() => selectedReview && suspendMutation.mutate({ userId: selectedReview.userId, reason: suspensionReason })}
            >
              {suspendMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Suspend KYC
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
