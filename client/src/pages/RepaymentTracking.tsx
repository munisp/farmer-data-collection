import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar, DollarSign, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function RepaymentTracking() {
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "mobile_money" | "cash" | "check">("bank_transfer");
  const [transactionRef, setTransactionRef] = useState("");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);

  const { data: myLoans, isLoading: loansLoading } = trpc.microfinance.getMyLoans.useQuery();
  const { data: schedule, isLoading: scheduleLoading } = trpc.microfinance.getRepaymentSchedule.useQuery(
    { loanId: selectedLoanId! },
    { enabled: !!selectedLoanId }
  );

  const makePaymentMutation = trpc.microfinance.makePayment.useMutation({
    onSuccess: () => {
      toast.success("Payment recorded successfully!");
      setIsPaymentDialogOpen(false);
      setPaymentAmount("");
      setTransactionRef("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to record payment");
    },
  });

  const activeLoans = myLoans?.filter((loan) => loan.status === "active") || [];
  const selectedLoan = activeLoans.find((loan) => loan.id === selectedLoanId);

  const upcomingPayments = schedule?.schedule.filter((p: any) => !p.isPaid && !p.isOverdue) || [];
  const overduePayments = schedule?.schedule.filter((p: any) => p.isOverdue && !p.isPaid) || [];
  const paidPayments = schedule?.schedule.filter((p: any) => p.isPaid) || [];

  const handleMakePayment = () => {
    if (!selectedLoanId || !paymentAmount) {
      toast.error("Please fill in all required fields");
      return;
    }

    makePaymentMutation.mutate({
      loanId: selectedLoanId,
      amount: parseFloat(paymentAmount),
      paymentMethod,
      transactionReference: transactionRef || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Loan Repayment Tracking</h1>
          <p className="text-muted-foreground">Manage your loan payments and view payment schedules</p>
        </div>

        {/* Loan Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Loan</CardTitle>
            <CardDescription>Choose a loan to view repayment schedule</CardDescription>
          </CardHeader>
          <CardContent>
            {loansLoading ? (
              <p>Loading loans...</p>
            ) : activeLoans.length === 0 ? (
              <p className="text-muted-foreground">No active loans found</p>
            ) : (
              <Select
                value={selectedLoanId?.toString()}
                onValueChange={(value) => setSelectedLoanId(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a loan" />
                </SelectTrigger>
                <SelectContent>
                  {activeLoans.map((loan) => (
                    <SelectItem key={loan.id} value={loan.id.toString()}>
                      {loan.loanNumber} - ₦{loan.principalAmount.toLocaleString()} ({loan.lenderName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {selectedLoan && schedule && (
          <>
            {/* Loan Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Principal Amount</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">₦{selectedLoan.principalAmount.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Monthly Payment</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">₦{schedule.monthlyPayment.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Repaid</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">₦{((selectedLoan.principalAmount || 0) - (selectedLoan.outstandingBalance || 0)).toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Remaining Balance</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ₦{(selectedLoan.outstandingBalance || 0).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Overdue Payments Alert */}
            {overduePayments.length > 0 && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-5 w-5" />
                    Overdue Payments ({overduePayments.length})
                  </CardTitle>
                  <CardDescription className="text-red-600">
                    You have {overduePayments.length} overdue payment{overduePayments.length > 1 ? "s" : ""}. Please make a payment as soon as possible.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {overduePayments.map((payment: any) => (
                      <div key={payment.paymentNumber} className="flex items-center justify-between rounded-lg border border-red-200 bg-white p-3">
                        <div>
                          <p className="font-medium">Payment #{payment.paymentNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            Due: {new Date(payment.dueDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-700">₦{payment.totalAmount.toLocaleString()}</p>
                          <Badge variant="destructive">Overdue</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Payments */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Upcoming Payments</CardTitle>
                  <CardDescription>Your scheduled payments</CardDescription>
                </div>
                <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>Make Payment</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record Payment</DialogTitle>
                      <DialogDescription>
                        Record a payment for loan {selectedLoan.loanNumber}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="amount">Payment Amount (₦)</Label>
                        <Input
                          id="amount"
                          type="number"
                          placeholder="Enter amount"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="method">Payment Method</Label>
                        <Select value={paymentMethod} onValueChange={(value: any) => setPaymentMethod(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="mobile_money">Mobile Money</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="reference">Transaction Reference (Optional)</Label>
                        <Input
                          id="reference"
                          placeholder="Enter transaction reference"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handleMakePayment}
                        disabled={makePaymentMutation.isPending}
                        className="w-full"
                      >
                        {makePaymentMutation.isPending ? "Recording..." : "Record Payment"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {scheduleLoading ? (
                  <p>Loading schedule...</p>
                ) : upcomingPayments.length === 0 ? (
                  <p className="text-muted-foreground">No upcoming payments</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingPayments.map((payment: any) => (
                      <div key={payment.paymentNumber} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="font-medium">Payment #{payment.paymentNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            Due: {new Date(payment.dueDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">₦{payment.totalAmount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            Principal: ₦{payment.principalAmount.toLocaleString()} | Interest: ₦{payment.interestAmount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment History */}
            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>Your completed payments</CardDescription>
              </CardHeader>
              <CardContent>
                {paidPayments.length === 0 ? (
                  <p className="text-muted-foreground">No payments made yet</p>
                ) : (
                  <div className="space-y-2">
                    {paidPayments.map((payment: any) => (
                      <div key={payment.paymentNumber} className="flex items-center justify-between rounded-lg border bg-green-50 p-3">
                        <div>
                          <p className="font-medium">Payment #{payment.paymentNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            Paid: {payment.paidDate ? new Date(payment.paidDate).toLocaleDateString() : "N/A"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">₦{(payment.paidAmount || payment.totalAmount).toLocaleString()}</p>
                          <Badge variant="outline" className="border-green-600 text-green-600">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Paid
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
