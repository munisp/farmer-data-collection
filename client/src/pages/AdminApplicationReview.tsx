import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, XCircle, Eye, FileText, Clock } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin Application Review Interface
 * 
 * Allows admins to review, approve, or reject loan applications
 */

export default function AdminApplicationReview() {
  const [selectedApp, setSelectedApp] = useState<number | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [approvedTermMonths, setApprovedTermMonths] = useState("");
  const [approvedInterestRate, setApprovedInterestRate] = useState("");

  const { data: applications, isLoading, refetch } = trpc.loanApplication.getAllApplications.useQuery();
  const updateStatus = trpc.loanApplication.updateApplicationStatus.useMutation({
    onSuccess: () => {
      toast.success("Application status updated successfully");
      setSelectedApp(null);
      setReviewAction(null);
      setReviewNotes("");
      setRejectionReason("");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  const handleReview = async () => {
    if (!selectedApp || !reviewAction) return;

    const status = reviewAction === "approve" ? "approved" : "rejected";

    await updateStatus.mutateAsync({
      applicationId: selectedApp,
      status,
      reviewNotes,
      rejectionReason: reviewAction === "reject" ? rejectionReason : undefined,
      approvedAmount: reviewAction === "approve" && approvedAmount ? parseInt(approvedAmount) * 100 : undefined,
      approvedTermMonths: reviewAction === "approve" && approvedTermMonths ? parseInt(approvedTermMonths) : undefined,
      approvedInterestRate: reviewAction === "approve" && approvedInterestRate ? parseInt(approvedInterestRate) * 100 : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case "under_review":
        return <Badge variant="default" className="flex items-center gap-1"><Eye className="h-3 w-3" /> Under Review</Badge>;
      case "approved":
        return <Badge variant="default" className="flex items-center gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading applications...</p>
        </div>
      </div>
    );
  }

  const pendingApplications = applications?.filter((app) => app.status === "pending" || app.status === "under_review") || [];
  const reviewedApplications = applications?.filter((app) => app.status === "approved" || app.status === "rejected") || [];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Loan Application Review</h1>
        <p className="text-muted-foreground">Review and process loan applications</p>
      </div>

      {/* Pending Applications */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Pending Review ({pendingApplications.length})</h2>
        {pendingApplications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No pending applications</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingApplications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Application #{app.applicationNumber}
                        {getStatusBadge(app.status)}
                      </CardTitle>
                      <CardDescription>
                        Submitted on {new Date(app.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" onClick={() => setSelectedApp(app.id)}>
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Review Application #{app.applicationNumber}</DialogTitle>
                          <DialogDescription>Review and approve or reject this loan application</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                          {/* Application Details */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Applicant</p>
                              <p className="font-semibold">{app.fullName}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Email</p>
                              <p className="font-semibold">{app.email}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Phone</p>
                              <p className="font-semibold">{app.phone}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Loan Amount</p>
                              <p className="font-semibold">₦{(app.loanAmount / 100).toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Term</p>
                              <p className="font-semibold">{app.termMonths} months</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Employment</p>
                              <p className="font-semibold capitalize">{app.employmentStatus || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Monthly Income</p>
                              <p className="font-semibold">
                                {app.monthlyIncome ? `₦${(app.monthlyIncome / 100).toLocaleString()}` : "N/A"}
                              </p>
                            </div>
                          </div>

                          <div>
                            <p className="text-muted-foreground">Purpose</p>
                            <p className="mt-1">{app.purpose}</p>
                          </div>

                          {/* Review Actions */}
                          <div className="space-y-4 border-t pt-4">
                            <div>
                              <Label>Review Action</Label>
                              <Select value={reviewAction || ""} onValueChange={(value) => setReviewAction(value as "approve" | "reject")}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select action" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approve">Approve</SelectItem>
                                  <SelectItem value="reject">Reject</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {reviewAction === "approve" && (
                              <>
                                <div>
                                  <Label>Approved Amount (₦)</Label>
                                  <Input
                                    type="number"
                                    value={approvedAmount}
                                    onChange={(e) => setApprovedAmount(e.target.value)}
                                    placeholder={`Default: ${app.loanAmount / 100}`}
                                  />
                                </div>
                                <div>
                                  <Label>Approved Term (Months)</Label>
                                  <Input
                                    type="number"
                                    value={approvedTermMonths}
                                    onChange={(e) => setApprovedTermMonths(e.target.value)}
                                    placeholder={`Default: ${app.termMonths}`}
                                  />
                                </div>
                                <div>
                                  <Label>Interest Rate (%)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={approvedInterestRate}
                                    onChange={(e) => setApprovedInterestRate(e.target.value)}
                                    placeholder="e.g., 15.5"
                                  />
                                </div>
                              </>
                            )}

                            {reviewAction === "reject" && (
                              <div>
                                <Label>Rejection Reason</Label>
                                <Textarea
                                  value={rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  placeholder="Explain why the application is being rejected..."
                                  rows={3}
                                />
                              </div>
                            )}

                            <div>
                              <Label>Review Notes (Optional)</Label>
                              <Textarea
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder="Add any additional notes..."
                                rows={3}
                              />
                            </div>

                            <div className="flex gap-2">
                              <Button
                                onClick={handleReview}
                                disabled={!reviewAction || updateStatus.isPending}
                                className="flex-1"
                              >
                                {updateStatus.isPending ? "Processing..." : reviewAction === "approve" ? "Approve Application" : "Reject Application"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Applicant</p>
                      <p className="font-semibold">{app.fullName}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Loan Amount</p>
                      <p className="font-semibold">₦{(app.loanAmount / 100).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Term</p>
                      <p className="font-semibold">{app.termMonths} months</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Employment</p>
                      <p className="font-semibold capitalize">{app.employmentStatus || "N/A"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Reviewed Applications */}
      <div>
        <h2 className="text-2xl font-semibold mb-4">Reviewed Applications ({reviewedApplications.length})</h2>
        <div className="grid gap-4">
          {reviewedApplications.map((app) => (
            <Card key={app.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Application #{app.applicationNumber}
                      {getStatusBadge(app.status)}
                    </CardTitle>
                    <CardDescription>
                      Reviewed on {app.reviewedAt ? new Date(app.reviewedAt).toLocaleDateString() : "N/A"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Applicant</p>
                    <p className="font-semibold">{app.fullName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Requested Amount</p>
                    <p className="font-semibold">₦{(app.loanAmount / 100).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">
                      {app.status === "approved" ? "Approved Amount" : "Status"}
                    </p>
                    <p className="font-semibold">
                      {app.status === "approved" && app.approvedAmount
                        ? `₦${(app.approvedAmount / 100).toLocaleString()}`
                        : app.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Term</p>
                    <p className="font-semibold">{app.termMonths} months</p>
                  </div>
                </div>

                {app.reviewNotes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-semibold">Review Notes:</p>
                    <p className="text-sm text-gray-700">{app.reviewNotes}</p>
                  </div>
                )}

                {app.status === "rejected" && app.rejectionReason && (
                  <div className="mt-4 p-3 bg-red-50 rounded-lg">
                    <p className="text-sm font-semibold text-red-800">Rejection Reason:</p>
                    <p className="text-sm text-red-700">{app.rejectionReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
