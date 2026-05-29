import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle, Eye, DollarSign, Calendar, User, Building2, FileText } from "lucide-react";

export default function LoanApprovals() {
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [approvalForm, setApprovalForm] = useState({
    approvedAmount: 0,
    interestRate: 0,
    termMonths: 0,
    notes: "",
  });
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: pendingLoans, isLoading, refetch } = trpc.microfinance.getAllPendingLoans.useQuery();
  const approveLoanMutation = trpc.microfinance.approveLoan.useMutation();
  const rejectLoanMutation = trpc.microfinance.rejectLoan.useMutation();

  const handleViewDetails = (loanData: any) => {
    setSelectedLoan(loanData);
    // Pre-fill approval form with requested amounts
    setApprovalForm({
      approvedAmount: loanData.principalAmount / 100,
      interestRate: 15,
      termMonths: loanData.termMonths || 12,
      notes: "",
    });
  };

  const handleApprove = async () => {
    if (!selectedLoan) return;

    try {
      await approveLoanMutation.mutateAsync({
        loanId: selectedLoan.id,
        approvedAmount: approvalForm.approvedAmount,
        approvedInterestRate: approvalForm.interestRate,
        approvedTermMonths: approvalForm.termMonths,
        approvalNotes: approvalForm.notes,
      });

      toast.success("Loan approved successfully");
      setShowApproveDialog(false);
      setSelectedLoan(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to approve loan");
    }
  };

  const handleReject = async () => {
    if (!selectedLoan || !rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }

    try {
      await rejectLoanMutation.mutateAsync({
        loanId: selectedLoan.loan.id,
        rejectionReason,
      });

      toast.success("Loan rejected");
      setShowRejectDialog(false);
      setSelectedLoan(null);
      setRejectionReason("");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject loan");
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(cents / 100);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div role="main" aria-label="Page content" className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Loan Approvals</h1>
        <p className="text-muted-foreground mt-2">
          Review and approve pending loan applications from farmers
        </p>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingLoans?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requested</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                pendingLoans?.reduce((sum, item) => sum + (item.principalAmount || 0), 0) || 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">Across all applications</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Loan Size</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingLoans && pendingLoans.length > 0
                ? formatCurrency(
                    pendingLoans.reduce((sum, item) => sum + (item.principalAmount || 0), 0) /
                      pendingLoans.length
                  )
                : formatCurrency(0)}
            </div>
            <p className="text-xs text-muted-foreground">Per application</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Loans List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Pending Applications</h2>

        {!pendingLoans || pendingLoans.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No pending loan applications</p>
              <p className="text-sm text-muted-foreground">All applications have been processed</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingLoans.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5 text-muted-foreground" />
                        Loan #{item.loanNumber}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          {item.lenderName || "Unknown Lender"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          Applied: {formatDate(item.applicationDate)}
                        </span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Requested Amount</p>
                      <p className="text-lg font-semibold">{formatCurrency(item.principalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Loan Type</p>
                      <p className="text-lg font-semibold capitalize">
                        {"Agricultural"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Repayment Period</p>
                      <p className="text-lg font-semibold">
                        {item.termMonths} months
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Lender Rate Range</p>
                      <p className="text-lg font-semibold">
                        {"12-18%"}
                      </p>
                    </div>
                  </div>

                  {item.purpose && (
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground mb-1">Purpose</p>
                      <p className="text-sm">{item.purpose}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(item)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        handleViewDetails(item);
                        setShowApproveDialog(true);
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setSelectedLoan(item);
                        setShowRejectDialog(true);
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Approve Loan Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approve Loan Application</DialogTitle>
            <DialogDescription>
              Review and approve loan #{selectedLoan?.loan.loanNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="approvedAmount">Approved Amount (₦)</Label>
                <Input
                  id="approvedAmount"
                  type="number"
                  value={approvalForm.approvedAmount}
                  onChange={(e) =>
                    setApprovalForm({ ...approvalForm, approvedAmount: parseFloat(e.target.value) })
                  }
                  min={0}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Requested: {selectedLoan && formatCurrency(selectedLoan.loan.principalAmount)}
                </p>
              </div>

              <div>
                <Label htmlFor="interestRate">Annual Interest Rate (%)</Label>
                <Input
                  id="interestRate"
                  type="number"
                  value={approvalForm.interestRate}
                  onChange={(e) =>
                    setApprovalForm({ ...approvalForm, interestRate: parseFloat(e.target.value) })
                  }
                  min={0}
                  max={100}
                  step={0.1}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lender range: {selectedLoan?.lender?.interestRateRange || "N/A"}
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="termMonths">Repayment Term (months)</Label>
              <Input
                id="termMonths"
                type="number"
                value={approvalForm.termMonths}
                onChange={(e) =>
                  setApprovalForm({ ...approvalForm, termMonths: parseInt(e.target.value) })
                }
                min={1}
                max={60}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={approvalForm.notes}
                onChange={(e) => setApprovalForm({ ...approvalForm, notes: e.target.value })}
                placeholder="Add any notes about this approval..."
                rows={3}
              />
            </div>

            {/* Loan Summary */}
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Loan Summary</h4>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Principal:</span>
                  <span className="font-medium">{formatCurrency(approvalForm.approvedAmount * 100)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate:</span>
                  <span className="font-medium">{approvalForm.interestRate}% per annum</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Term:</span>
                  <span className="font-medium">{approvalForm.termMonths} months</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Monthly Payment:</span>
                  <span className="font-medium">
                    {formatCurrency(
                      (approvalForm.approvedAmount * 100 * (1 + approvalForm.interestRate / 100)) /
                        approvalForm.termMonths
                    )}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground font-semibold">Total Repayment:</span>
                  <span className="font-bold">
                    {formatCurrency(
                      approvalForm.approvedAmount * 100 * (1 + approvalForm.interestRate / 100)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approveLoanMutation.isPending}>
              {approveLoanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Approve Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Loan Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Loan Application</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting loan #{selectedLoan?.loan.loanNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="rejectionReason">Rejection Reason</Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a detailed reason for rejection..."
                rows={4}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 10 characters required
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectLoanMutation.isPending || rejectionReason.length < 10}
            >
              {rejectLoanMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
