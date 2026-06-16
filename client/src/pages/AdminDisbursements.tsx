import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, CheckCircle, XCircle, Clock, DollarSign, Search } from "lucide-react";
import LoanFilters, { LoanFilterState } from "@/components/LoanFilters";
import { useMemo } from "react";

type DisbursementStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
type DisbursementMethod = "bank_transfer" | "mobile_money" | "cash" | "check";

export default function AdminDisbursements() {
  const [filters, setFilters] = useState<LoanFilterState>({
    search: "",
    lenderId: "",
    status: "",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });
  const [methodFilter, setMethodFilter] = useState<DisbursementMethod | "all">("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedDisbursement, setSelectedDisbursement] = useState<any>(null);
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [transactionReference, setTransactionReference] = useState("");
  const [processingNotes, setProcessingNotes] = useState("");

  // Fetch data - note: getAll returns only pending by default
  // We need to enhance this to get all statuses and join with loan/user data
  const { data: pendingDisbursements, isLoading: loadingAll, refetch: refetchAll } = 
    trpc.disbursement.getAll.useQuery();
  
  // Fetch lenders for filter dropdown
  const { data: lenders } = trpc.microfinance.getAllLenders.useQuery();
  
  // Map disbursements with proper data from joined query
  const rawDisbursements = pendingDisbursements?.map((d: any) => ({
    ...d,
    amount: d.amount / 100, // Convert from kobo to naira
  })) || [];

  // Apply filters
  const allDisbursements = useMemo(() => {
    return rawDisbursements.filter((disbursement) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          disbursement.loanNumber?.toLowerCase().includes(searchLower) ||
          disbursement.borrowerName?.toLowerCase().includes(searchLower) ||
          disbursement.lenderName?.toLowerCase().includes(searchLower) ||
          disbursement.transactionReference?.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Lender filter
      if (filters.lenderId && filters.lenderId !== "all") {
        if (disbursement.lenderId !== parseInt(filters.lenderId)) return false;
      }

      // Status filter
      if (filters.status && filters.status !== "all") {
        if (disbursement.status !== filters.status) return false;
      }

      // Amount range filter
      const amount = disbursement.amount;
      if (filters.minAmount && amount < parseFloat(filters.minAmount)) return false;
      if (filters.maxAmount && amount > parseFloat(filters.maxAmount)) return false;

      // Date range filter
      if (filters.startDate || filters.endDate) {
        const disbursementDate = disbursement.scheduledDate ? new Date(disbursement.scheduledDate) : null;
        if (!disbursementDate) return false;
        
        if (filters.startDate && disbursementDate < new Date(filters.startDate)) return false;
        if (filters.endDate && disbursementDate > new Date(filters.endDate)) return false;
      }

      // Method filter
      if (methodFilter !== "all" && disbursement.method !== methodFilter) return false;

      return true;
    });
  }, [rawDisbursements, filters, methodFilter]);
  
  const { data: pendingLoansData, isLoading: loadingLoans } = 
    trpc.microfinance.getAllPendingLoans.useQuery();

  // Extract approved loans from pending loans data
  const approvedLoans = pendingLoansData?.map((item) => ({
    ...item,
    approvedAmount: item.principalAmount ? item.principalAmount / 100 : 0,
  })) || [];

  // Mutations
  const createDisbursement = trpc.disbursement.create.useMutation({
    onSuccess: () => {
      toast.success("Disbursement created successfully");
      setCreateDialogOpen(false);
      setSelectedLoanId(null);
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`Failed to create disbursement: ${error.message}`);
    },
  });

  const processDisbursement = trpc.disbursement.process.useMutation({
    onSuccess: () => {
      toast.success("Disbursement processed successfully");
      setProcessDialogOpen(false);
      setSelectedDisbursement(null);
      setTransactionReference("");
      setProcessingNotes("");
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`Failed to process disbursement: ${error.message}`);
    },
  });

  const cancelDisbursement = trpc.disbursement.cancel.useMutation({
    onSuccess: () => {
      toast.success("Disbursement cancelled");
      refetchAll();
    },
    onError: (error: any) => {
      toast.error(`Failed to cancel disbursement: ${error.message}`);
    },
  });

  // allDisbursements is already filtered by the useMemo above

  // Get status badge variant
  const getStatusBadge = (status: DisbursementStatus) => {
    const variants: Record<DisbursementStatus, { variant: any; icon: any }> = {
      pending: { variant: "secondary", icon: Clock },
      processing: { variant: "default", icon: Loader2 },
      completed: { variant: "default", icon: CheckCircle },
      failed: { variant: "destructive", icon: XCircle },
      cancelled: { variant: "outline", icon: XCircle },
    };
    const { variant, icon: Icon } = variants[status];
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount);
  };

  // Handle create disbursement
  const handleCreateDisbursement = () => {
    if (!selectedLoanId) {
      toast.error("Please select a loan");
      return;
    }

    // Find the selected loan to get details
    const selectedLoan = approvedLoans.find((l: any) => l.id === selectedLoanId);
    if (!selectedLoan) {
      toast.error("Loan not found");
      return;
    }

    createDisbursement.mutate({
      loanId: selectedLoanId,
      userId: selectedLoan.userId,
      amount: selectedLoan.approvedAmount * 100, // Convert to kobo
      method: "bank_transfer",
    });
  };

  // Handle process disbursement
  const handleProcessDisbursement = () => {
    if (!selectedDisbursement) return;
    if (!transactionReference.trim()) {
      toast.error("Please enter transaction reference");
      return;
    }

    processDisbursement.mutate({
      disbursementId: selectedDisbursement.id,
      transactionReference,
      notes: processingNotes,
    });
  };

  // Summary stats
  const stats = {
    total: allDisbursements?.length || 0,
    pending: allDisbursements?.filter((d: any) => d.status === "pending").length || 0,
    processing: allDisbursements?.filter((d: any) => d.status === "processing").length || 0,
    completed: allDisbursements?.filter((d: any) => d.status === "completed").length || 0,
    totalAmount: allDisbursements?.reduce((sum: number, d: any) => sum + d.amount, 0) || 0,
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Loan Disbursements</h1>
            <p className="text-muted-foreground">Manage loan disbursements and track payments</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Disbursement
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Disbursements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <LoanFilters
          filters={filters}
          onFilterChange={setFilters}
          lenders={lenders}
          showLenderFilter={true}
        />
        
        {/* Additional Method Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Payment Method</Label>
                <Select
                  value={methodFilter}
                  onValueChange={(value) => setMethodFilter(value as DisbursementMethod | "all")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="check">Check</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disbursements Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Disbursements ({allDisbursements.length})</CardTitle>
            <CardDescription>View and manage all loan disbursements</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAll ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : allDisbursements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No disbursements found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan Number</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transaction Ref</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allDisbursements.map((disbursement: any) => (
                    <TableRow key={disbursement.id}>
                      <TableCell className="font-medium">{disbursement.loanNumber}</TableCell>
                      <TableCell>{disbursement.borrowerName}</TableCell>
                      <TableCell>{formatCurrency(disbursement.amount)}</TableCell>
                      <TableCell className="capitalize">{disbursement.method.replace("_", " ")}</TableCell>
                      <TableCell>{getStatusBadge(disbursement.status)}</TableCell>
                      <TableCell>{disbursement.transactionReference || "-"}</TableCell>
                      <TableCell>{new Date(disbursement.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {disbursement.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedDisbursement(disbursement);
                                setProcessDialogOpen(true);
                              }}
                            >
                              Process
                            </Button>
                          )}
                          {(disbursement.status === "pending" || disbursement.status === "processing") && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (confirm("Are you sure you want to cancel this disbursement?")) {
                                  cancelDisbursement.mutate({ disbursementId: disbursement.id, reason: "Cancelled by admin" });
                                }
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Create Disbursement Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Disbursement</DialogTitle>
              <DialogDescription>
                Select an approved loan to create a disbursement
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Approved Loan</Label>
                <Select
                  value={selectedLoanId?.toString()}
                  onValueChange={(value) => setSelectedLoanId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a loan" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedLoans?.filter((loan) => loan.status === "approved").map((loan) => (
                      <SelectItem key={loan.id} value={loan.id.toString()}>
                        {loan.loanNumber} - {formatCurrency(loan.approvedAmount || 0)} - {loan.lenderName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateDisbursement} disabled={createDisbursement.isPending}>
                {createDisbursement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Disbursement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Process Disbursement Dialog */}
        <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Disbursement</DialogTitle>
              <DialogDescription>
                Enter transaction details to complete the disbursement
              </DialogDescription>
            </DialogHeader>
            {selectedDisbursement && (
              <div className="space-y-4">
                <div>
                  <Label>Loan Number</Label>
                  <Input value={selectedDisbursement.loanNumber} disabled />
                </div>
                <div>
                  <Label>Borrower</Label>
                  <Input value={selectedDisbursement.borrowerName} disabled />
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input value={formatCurrency(selectedDisbursement.amount)} disabled />
                </div>
                <div>
                  <Label>Transaction Reference *</Label>
                  <Input
                    placeholder="Enter bank/mobile money transaction reference"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    placeholder="Add any additional notes..."
                    value={processingNotes}
                    onChange={(e) => setProcessingNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setProcessDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleProcessDisbursement} disabled={processDisbursement.isPending}>
                {processDisbursement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Disbursement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
