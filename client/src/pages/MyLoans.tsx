import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Bell,
  Award,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import LoanFilters, { LoanFilterState } from "@/components/LoanFilters";
import { useMemo } from "react";

/**
 * Borrower Dashboard
 * 
 * Shows borrower's loans, payment schedule, payment history, and credit score
 */
export default function MyLoans() {
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [filters, setFilters] = useState<LoanFilterState>({
    search: "",
    lenderId: "",
    status: "",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });

  // Fetch user's loans
  const { data: allLoans, isLoading: loansLoading } = trpc.microfinance.getMyLoans.useQuery();
  
  // Fetch lenders for filter dropdown
  const { data: lenders } = trpc.microfinance.getAllLenders.useQuery();

  // Apply filters
  const loans = useMemo(() => {
    if (!allLoans) return [];
    
    return allLoans.filter((loan) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          loan.loanNumber.toLowerCase().includes(searchLower) ||
          (loan.purpose?.toLowerCase().includes(searchLower) ?? false) ||
          (loan.lenderName?.toLowerCase().includes(searchLower) ?? false);
        if (!matchesSearch) return false;
      }

      // Lender filter
      if (filters.lenderId && filters.lenderId !== "all") {
        if (loan.lenderId !== parseInt(filters.lenderId)) return false;
      }

      // Status filter
      if (filters.status && filters.status !== "all") {
        if (loan.status !== filters.status) return false;
      }

      // Amount range filter
      const amount = (loan.principalAmount || 0) / 100;
      if (filters.minAmount && amount < parseFloat(filters.minAmount)) return false;
      if (filters.maxAmount && amount > parseFloat(filters.maxAmount)) return false;

      // Date range filter
      if (filters.startDate || filters.endDate) {
        const loanDate = loan.applicationDate ? new Date(loan.applicationDate) : null;
        if (!loanDate) return false;
        
        if (filters.startDate && loanDate < new Date(filters.startDate)) return false;
        if (filters.endDate && loanDate > new Date(filters.endDate)) return false;
      }

      return true;
    });
  }, [allLoans, filters]);

  // Fetch disbursements for selected loan
  const { data: disbursements } = trpc.disbursement.getByLoan.useQuery(
    { loanId: selectedLoanId! },
    { enabled: !!selectedLoanId }
  );

  // Calculate summary statistics
  const totalBorrowed = loans?.reduce((sum, loan) => sum + (loan.principalAmount || 0), 0) || 0;
  const totalOutstanding = loans?.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0) || 0;
  const activeLoanCount = loans?.filter((loan) => loan.status === "active").length || 0;

  // Mock credit score (in production, this would come from backend)
  const creditScore = 720;
  const creditScoreMax = 850;
  const creditScorePercent = (creditScore / creditScoreMax) * 100;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      approved: "secondary",
      active: "default",
      rejected: "destructive",
      paid_off: "secondary",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const getDisbursementStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      processing: "secondary",
      completed: "default",
      failed: "destructive",
      cancelled: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  if (loansLoading) {
    return (
      <div role="main" aria-label="Page content" className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <Clock className="animate-spin h-8 w-8 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">My Loans</h1>
        <p className="text-muted-foreground">
          Manage your loans, track payments, and monitor your credit score
        </p>
      </div>

      {/* Filters */}
      <LoanFilters
        filters={filters}
        onFilterChange={setFilters}
        lenders={lenders}
        showLenderFilter={true}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Loans</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeLoanCount}</div>
            <p className="text-xs text-muted-foreground">
              {loans?.length || 0} total applications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Borrowed</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBorrowed)}</div>
            <p className="text-xs text-muted-foreground">Across all loans</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground">Amount remaining</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credit Score</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditScore}</div>
            <Progress value={creditScorePercent} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {creditScore >= 700 ? "Excellent" : creditScore >= 600 ? "Good" : "Fair"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Loans</TabsTrigger>
          <TabsTrigger value="all">All Loans</TabsTrigger>
          <TabsTrigger value="schedule">Payment Schedule</TabsTrigger>
          <TabsTrigger value="tips">Credit Tips</TabsTrigger>
        </TabsList>

        {/* Active Loans Tab */}
        <TabsContent value="active" className="space-y-4">
          {loans?.filter((loan) => loan.status === "active").length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No active loans</p>
                <p className="text-sm text-muted-foreground">
                  Apply for a loan to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            loans
              ?.filter((loan) => loan.status === "active")
              .map((loan) => (
                <Card key={loan.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Loan #{loan.loanNumber}</CardTitle>
                        <CardDescription>
                          {loan.lenderName || `Lender ${loan.lenderId}`} • {loan.loanType?.replace("_", " ")}
                        </CardDescription>
                      </div>
                      {getStatusBadge(loan.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Loan Progress */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Repayment Progress</span>
                        <span className="font-medium">
                          {Math.round(
                            ((loan.principalAmount - (loan.outstandingBalance || 0)) / loan.principalAmount) * 100
                          )}
                          %
                        </span>
                      </div>
                      <Progress
                        value={
                          ((loan.principalAmount - (loan.outstandingBalance || 0)) / loan.principalAmount) * 100
                        }
                      />
                    </div>

                    {/* Loan Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Loan Amount</p>
                        <p className="font-medium">{formatCurrency(loan.principalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Outstanding</p>
                        <p className="font-medium">{formatCurrency(loan.outstandingBalance || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Monthly Payment</p>
                        <p className="font-medium">{formatCurrency(loan.monthlyPayment || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Next Payment</p>
                        <p className="font-medium">
                          {loan.nextPaymentDue
                            ? new Date(loan.nextPaymentDue).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                    </div>

                    {/* Disbursement Status */}
                    {selectedLoanId === loan.id && disbursements && disbursements.length > 0 && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2">Disbursement Status</h4>
                        <div className="space-y-2">
                          {disbursements.map((disb) => (
                            <div
                              key={disb.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span>
                                {disb.disbursementNumber} • {disb.method.replace("_", " ")}
                              </span>
                              <div className="flex items-center gap-2">
                                <span>{formatCurrency(disb.amount)}</span>
                                {getDisbursementStatusBadge(disb.status)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        setSelectedLoanId(selectedLoanId === loan.id ? null : loan.id)
                      }
                    >
                      {selectedLoanId === loan.id ? "Hide" : "View"} Disbursement Details
                    </Button>
                  </CardContent>
                </Card>
              ))
          )}
        </TabsContent>

        {/* All Loans Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Loan Applications</CardTitle>
              <CardDescription>Complete history of your loan applications</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loan Number</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Applied Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans?.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">{loan.loanNumber}</TableCell>
                      <TableCell>{loan.lenderName || `Lender ${loan.lenderId}`}</TableCell>
                      <TableCell>{formatCurrency(loan.principalAmount)}</TableCell>
                      <TableCell>{getStatusBadge(loan.status)}</TableCell>
                      <TableCell>
                        {loan.createdAt ? new Date(loan.createdAt).toLocaleDateString() : "N/A"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Schedule Tab */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Payments</CardTitle>
              <CardDescription>
                Schedule of your upcoming loan payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loans
                  ?.filter((loan) => loan.status === "active" && loan.nextPaymentDue)
                  .sort(
                    (a, b) =>
                      new Date(a.nextPaymentDue!).getTime() -
                      new Date(b.nextPaymentDue!).getTime()
                  )
                  .map((loan) => (
                    <div
                      key={loan.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <Calendar className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium">Loan #{loan.loanNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {loan.lenderName || `Lender ${loan.lenderId}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatCurrency(loan.monthlyPayment || 0)}</p>
                        <p className="text-sm text-muted-foreground">
                          Due: {new Date(loan.nextPaymentDue!).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Credit Tips Tab */}
        <TabsContent value="tips">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Improve Your Credit Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Pay on time</p>
                    <p className="text-sm text-muted-foreground">
                      Consistent on-time payments are the most important factor
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Keep balances low</p>
                    <p className="text-sm text-muted-foreground">
                      Try to pay more than the minimum monthly payment
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Build credit history</p>
                    <p className="text-sm text-muted-foreground">
                      Longer credit history improves your score
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Payment Reminders
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  We'll send you reminders before your payment is due:
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-600" />
                    <span className="text-sm">7 days before due date</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-600" />
                    <span className="text-sm">3 days before due date</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-600" />
                    <span className="text-sm">1 day before due date</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Reminders are sent via SMS and email to help you stay on track.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
