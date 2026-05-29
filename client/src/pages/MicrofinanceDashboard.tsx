import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Plus, FileText, CreditCard, TrendingUp, RefreshCw } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function MicrofinanceDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("loans");
  
  // Loan Application Form State
  const [selectedLenderId, setSelectedLenderId] = useState<number | null>(null);
  const [loanType, setLoanType] = useState<"agricultural" | "equipment" | "working_capital" | "emergency">("agricultural");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [repaymentPeriod, setRepaymentPeriod] = useState("");
  const [collateral, setCollateral] = useState("");
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorPhone, setGuarantorPhone] = useState("");
  
  // Repayment Form State
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "mobile_money" | "check">("mobile_money");
  const [transactionRef, setTransactionRef] = useState("");

  // Queries
  const { data: lenders, isLoading: lendersLoading } = trpc.microfinance.getAllLenders.useQuery();
  const { data: loans, isLoading: loansLoading, refetch: refetchLoans } = trpc.microfinance.getMyLoans.useQuery();
  const { data: creditScore, isLoading: creditScoreLoading, refetch: refetchCreditScore } = trpc.microfinance.getMyCreditScore.useQuery();
  const { data: creditBreakdown } = trpc.microfinance.getCreditScoreBreakdown.useQuery();
  const { data: creditHistory } = trpc.microfinance.getCreditScoreHistory.useQuery();

  // Mutations
  const applyForLoan = trpc.microfinance.applyForLoan.useMutation({
    onSuccess: () => {
      toast.success("Loan application submitted successfully");
      setRequestedAmount("");
      setPurpose("");
      setRepaymentPeriod("");
      setCollateral("");
      setGuarantorName("");
      setGuarantorPhone("");
      refetchLoans();
    },
    onError: (error) => {
      toast.error(`Loan application failed: ${error.message}`);
    },
  });

  const makeRepayment = trpc.microfinance.makeRepayment.useMutation({
    onSuccess: () => {
      toast.success("Repayment recorded successfully");
      setRepaymentAmount("");
      setTransactionRef("");
      refetchLoans();
    },
    onError: (error: any) => {
      toast.error(`Repayment failed: ${error.message}`);
    },
  });

  const refreshCreditScore = trpc.microfinance.refreshCreditScore.useMutation({
    onSuccess: () => {
      toast.success("Credit score refreshed successfully");
      refetchCreditScore();
    },
    onError: (error) => {
      toast.error(`Failed to refresh credit score: ${error.message}`);
    },
  });

  const handleApplyForLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLenderId || !requestedAmount || !purpose || !repaymentPeriod) {
      toast.error("Please fill all required fields");
      return;
    }
    applyForLoan.mutate({
      lenderId: selectedLenderId,
      principalAmount: parseFloat(requestedAmount) * 100,
      termMonths: parseInt(repaymentPeriod),
      purpose,
    });
  };

  const handleMakeRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoanId || !repaymentAmount) {
      toast.error("Please fill all required fields");
      return;
    }
    makeRepayment.mutate({
      loanId: selectedLoanId,
      amount: parseFloat(repaymentAmount),
      paymentMethod,
      transactionReference: transactionRef,
    });
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p>Please log in to access microfinance features.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Microfinance & Loans</h1>
          <p className="text-muted-foreground">
            Apply for loans, manage repayments, and track your credit score
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="loans">
              <FileText className="w-4 h-4 mr-2" />
              My Loans
            </TabsTrigger>
            <TabsTrigger value="apply">
              <Plus className="w-4 h-4 mr-2" />
              Apply for Loan
            </TabsTrigger>
            <TabsTrigger value="repayment">
              <CreditCard className="w-4 h-4 mr-2" />
              Make Repayment
            </TabsTrigger>
            <TabsTrigger value="credit-score">
              <TrendingUp className="w-4 h-4 mr-2" />
              Credit Score
            </TabsTrigger>
          </TabsList>

          {/* My Loans Tab */}
          <TabsContent value="loans" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>My Loan Applications</CardTitle>
                <CardDescription>View and track your loan applications</CardDescription>
              </CardHeader>
              <CardContent>
                {loansLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : loans && loans.length > 0 ? (
                  <div className="space-y-4">
                    {loans.map((loan) => (
                      <div key={loan.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold">
                              ₦{(loan.principalAmount / 100).toLocaleString()}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {loan.loanType} • {loan.termMonths} months
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Loan #{loan.loanNumber}
                            </p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${
                            loan.status === 'approved' || loan.status === 'disbursed' || loan.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : loan.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : loan.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {loan.status}
                          </span>
                        </div>
                        <div className="text-sm space-y-1">
                          <p><span className="text-muted-foreground">Purpose:</span> {loan.purpose}</p>
                          <p><span className="text-muted-foreground">Applied:</span> {loan.applicationDate ? new Date(loan.applicationDate).toLocaleDateString() : 'N/A'}</p>
                          {loan.interestRate && (
                            <p><span className="text-muted-foreground">Interest Rate:</span> {(loan.interestRate / 100).toFixed(2)}%</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No loan applications yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Apply for Loan Tab */}
          <TabsContent value="apply" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Apply for a Loan</CardTitle>
                <CardDescription>Submit a new loan application</CardDescription>
              </CardHeader>
              <CardContent>
                <form aria-label="Submit form" onSubmit={handleApplyForLoan} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="lender">Lender *</Label>
                    <Select 
                      value={selectedLenderId?.toString() || ""} 
                      onValueChange={(value) => setSelectedLenderId(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select lender" />
                      </SelectTrigger>
                      <SelectContent>
                        {lenders?.map((lender) => (
                          <SelectItem key={lender.id} value={lender.id.toString()}>
                            {lender.name} ({lender.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="loanType">Loan Type</Label>
                      <Select value={loanType} onValueChange={(value: any) => setLoanType(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agricultural">Agricultural</SelectItem>
                          <SelectItem value="equipment">Equipment</SelectItem>
                          <SelectItem value="working_capital">Working Capital</SelectItem>
                          <SelectItem value="emergency">Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="requestedAmount">Requested Amount (NGN) *</Label>
                      <Input
                        id="requestedAmount"
                        type="number"
                        step="0.01"
                        value={requestedAmount}
                        onChange={(e) => setRequestedAmount(e.target.value)}
                        placeholder="50000.00"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repaymentPeriod">Repayment Period (Months) *</Label>
                    <Input
                      id="repaymentPeriod"
                      type="number"
                      value={repaymentPeriod}
                      onChange={(e) => setRepaymentPeriod(e.target.value)}
                      placeholder="12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purpose">Purpose *</Label>
                    <Textarea
                      id="purpose"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      placeholder="Describe the purpose of the loan..."
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="collateral">Collateral (Optional)</Label>
                    <Textarea
                      id="collateral"
                      value={collateral}
                      onChange={(e) => setCollateral(e.target.value)}
                      placeholder="Describe any collateral you can provide..."
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="guarantorName">Guarantor Name (Optional)</Label>
                      <Input
                        id="guarantorName"
                        value={guarantorName}
                        onChange={(e) => setGuarantorName(e.target.value)}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guarantorPhone">Guarantor Phone (Optional)</Label>
                      <Input
                        id="guarantorPhone"
                        value={guarantorPhone}
                        onChange={(e) => setGuarantorPhone(e.target.value)}
                        placeholder="+2348012345678"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={applyForLoan.isPending}>
                    {applyForLoan.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Submit Application
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Lenders Information */}
            <Card>
              <CardHeader>
                <CardTitle>Available Lenders</CardTitle>
                <CardDescription>Browse microfinance institutions</CardDescription>
              </CardHeader>
              <CardContent>
                {lendersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : lenders && lenders.length > 0 ? (
                  <div className="space-y-4">
                    {lenders.map((lender) => (
                      <div key={lender.id} className="border rounded-lg p-4">
                        <h3 className="font-semibold">{lender.name}</h3>
                        <p className="text-sm text-muted-foreground">{lender.type}</p>
                        {lender.interestRateRange && (
                          <p className="text-sm mt-2">
                            <span className="text-muted-foreground">Interest Rate:</span> {lender.interestRateRange}
                          </p>
                        )}
                        {(lender.minLoanAmount || lender.maxLoanAmount) && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Loan Range:</span>{' '}
                            {lender.minLoanAmount ? `₦${(lender.minLoanAmount / 100).toLocaleString()}` : 'N/A'} - {' '}
                            {lender.maxLoanAmount ? `₦${(lender.maxLoanAmount / 100).toLocaleString()}` : 'N/A'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No lenders available
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Make Repayment Tab */}
          <TabsContent value="repayment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Make Loan Repayment</CardTitle>
                <CardDescription>Record a payment towards your loan</CardDescription>
              </CardHeader>
              <CardContent>
                <form aria-label="Submit form" onSubmit={handleMakeRepayment} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="loanId">Select Loan *</Label>
                    <Select 
                      value={selectedLoanId?.toString() || ""} 
                      onValueChange={(value) => setSelectedLoanId(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select loan" />
                      </SelectTrigger>
                      <SelectContent>
                        {loans?.filter(l => l.status === 'active' || l.status === 'disbursed').map((loan) => (
                          <SelectItem key={loan.id} value={loan.id.toString()}>
                            Loan #{loan.loanNumber} - ₦{(loan.principalAmount / 100).toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="repaymentAmount">Payment Amount (NGN) *</Label>
                    <Input
                      id="repaymentAmount"
                      type="number"
                      step="0.01"
                      value={repaymentAmount}
                      onChange={(e) => setRepaymentAmount(e.target.value)}
                      placeholder="5000.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="mojaloop">Mojaloop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transactionRef">Transaction Reference (Optional)</Label>
                    <Input
                      id="transactionRef"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      placeholder="TXN123456"
                    />
                  </div>
                  <Button type="submit" disabled={makeRepayment.isPending}>
                    {makeRepayment.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Record Payment
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Credit Score Tab */}
          <TabsContent value="credit-score" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>Your Credit Score</CardTitle>
                    <CardDescription>Track your creditworthiness</CardDescription>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => refreshCreditScore.mutate()}
                    disabled={refreshCreditScore.isPending}
                  >
                    {refreshCreditScore.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {creditScoreLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : creditScore ? (
                  <div className="space-y-6">
                    <div className="text-center">
                      <div className="text-6xl font-bold text-primary mb-2">
                        {creditScore.score}
                      </div>
                      <p className="text-lg text-muted-foreground">
                        Risk Category: <span className={`font-semibold ${
                          creditScore.riskCategory === 'low' ? 'text-green-600' :
                          creditScore.riskCategory === 'medium' ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {creditScore.riskCategory.toUpperCase()}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Last updated: {new Date(creditScore.calculatedAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Credit Score Breakdown */}
                    {creditBreakdown && (
                      <div className="space-y-4">
                        <h3 className="font-semibold">Score Breakdown</h3>
                        {creditBreakdown.factors.map((factor) => (
                          <div key={factor.name} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>{factor.name} ({factor.weight}%)</span>
                              <span className="font-semibold">{factor.score}/100</span>
                            </div>
                            <Progress value={factor.score} className="h-2" />
                            <p className="text-xs text-muted-foreground">{factor.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No credit score available yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Credit Score History */}
            <Card>
              <CardHeader>
                <CardTitle>Credit Score History</CardTitle>
                <CardDescription>Track your credit score over time</CardDescription>
              </CardHeader>
              <CardContent>
                {creditHistory && creditHistory.length > 0 ? (
                  <div className="space-y-4">
                    {creditHistory.map((record) => (
                      <div key={record.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                          <p className="font-semibold">{record.score}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(record.calculatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          record.rating === 'low' ? 'bg-green-100 text-green-800' :
                          record.rating === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {record.rating}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No credit score history yet
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
