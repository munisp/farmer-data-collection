import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentTimeline } from "@/components/PaymentTimeline";
import { Bell, CreditCard, Settings, TrendingUp } from "lucide-react";
import { toast } from "sonner";

const formatCurrencyFromCents = (amountInCents: number | null | undefined) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format((amountInCents || 0) / 100);
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  return `${value.toFixed(0)}%`;
};

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function BorrowerDashboard() {
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null);
  const [smsPreferences, setSmsPreferences] = useState({
    smsEnabled: true,
    paymentReminders: true,
    loanApprovalNotifications: true,
    loanDisbursementNotifications: true,
    overdueNotifications: true,
    marketingMessages: false,
    reminderDaysBefore: 3,
  });

  const loansQuery = trpc.microfinance.getMyLoans.useQuery();
  const preferencesQuery = trpc.sms.getNotificationPreferences.useQuery();
  const updatePreferences = trpc.sms.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      toast.success("Notification preferences saved successfully");
      preferencesQuery.refetch();
    },
    onError: (error) => {
      toast.error(`Failed to save preferences: ${error.message}`);
    },
  });

  useEffect(() => {
    if (preferencesQuery.data) {
      setSmsPreferences({
        smsEnabled: preferencesQuery.data.smsEnabled,
        paymentReminders: preferencesQuery.data.paymentReminders,
        loanApprovalNotifications: preferencesQuery.data.loanApprovalNotifications,
        loanDisbursementNotifications: preferencesQuery.data.loanDisbursementNotifications,
        overdueNotifications: preferencesQuery.data.overdueNotifications,
        marketingMessages: preferencesQuery.data.marketingMessages,
        reminderDaysBefore: preferencesQuery.data.reminderDaysBefore,
      });
    }
  }, [preferencesQuery.data]);

  useEffect(() => {
    if (!selectedLoanId && loansQuery.data && loansQuery.data.length > 0) {
      const preferred = loansQuery.data.find((loan) => ["active", "disbursed", "approved", "pending"].includes(loan.status));
      setSelectedLoanId(preferred?.id ?? loansQuery.data[0].id);
    }
  }, [loansQuery.data, selectedLoanId]);

  const selectedLoan = useMemo(
    () => loansQuery.data?.find((loan) => loan.id === selectedLoanId) ?? loansQuery.data?.[0] ?? null,
    [loansQuery.data, selectedLoanId]
  );

  const repaymentScheduleQuery = trpc.microfinance.getRepaymentSchedule.useQuery(
    { loanId: selectedLoan?.id ?? 0 },
    { enabled: !!selectedLoan }
  );

  const repaymentTimeline = useMemo(() => {
    const now = new Date();
    return (repaymentScheduleQuery.data?.schedule ?? []).map((payment) => {
      const dueDate = new Date(payment.dueDate);
      const paidDate = "paidDate" in payment && payment.paidDate ? new Date(payment.paidDate) : null;
      const derivedStatus = payment.status === "paid"
        ? "paid"
        : paidDate
          ? "paid"
          : dueDate.getTime() < now.getTime()
            ? "overdue"
            : "pending";

      return {
        id: "id" in payment ? payment.id : payment.paymentNumber,
        paymentNumber: payment.paymentNumber,
        dueDate,
        paidDate,
        principalAmount: payment.principalAmount,
        interestAmount: payment.interestAmount,
        totalAmount: payment.totalAmount,
        paidAmount: "paidAmount" in payment ? payment.paidAmount ?? 0 : 0,
        status: derivedStatus as "pending" | "paid" | "overdue",
        paymentMethod: null,
      };
    });
  }, [repaymentScheduleQuery.data]);

  const nextPayment = useMemo(() => {
    return repaymentTimeline
      .filter((payment) => payment.status !== "paid")
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;
  }, [repaymentTimeline]);

  const handleSavePreferences = () => {
    updatePreferences.mutate({
      smsEnabled: smsPreferences.smsEnabled,
      paymentReminders: smsPreferences.paymentReminders,
      loanApprovals: smsPreferences.loanApprovalNotifications,
      disbursements: smsPreferences.loanDisbursementNotifications,
      overdueNotifications: smsPreferences.overdueNotifications,
      marketingMessages: smsPreferences.marketingMessages,
      reminderDaysBefore: smsPreferences.reminderDaysBefore,
    });
  };

  const progress = repaymentScheduleQuery.data?.totalAmount
    ? Math.max(
        0,
        Math.min(
          100,
          repaymentTimeline.reduce((sum, payment) => sum + (payment.paidAmount || 0), 0) /
            repaymentScheduleQuery.data.totalAmount *
            100
        )
      )
    : repaymentTimeline.length > 0
      ? (repaymentTimeline.filter((payment) => payment.status === "paid").length / repaymentTimeline.length) * 100
      : 0;

  if (loansQuery.isLoading) {
    return (
      <div role="main" aria-label="Page content" className="container py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Borrower Dashboard</h1>
          <p className="text-muted-foreground mt-2">Loading your live loans and repayment data.</p>
        </div>
      </div>
    );
  }

  if (!selectedLoan) {
    return (
      <div className="container py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Borrower Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage your loans, payments, and notification preferences.</p>
        </div>
        <EmptyState
          title="No borrower loan found"
          description="No live borrower loan records are available for the authenticated user. The dashboard no longer falls back to a sample amortization schedule."
        />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Borrower Dashboard</h1>
          <p className="text-muted-foreground mt-2">Manage your live loans, repayments, and notification preferences.</p>
        </div>

        <div className="w-full max-w-sm">
          <Label htmlFor="loan-selector" className="mb-2 block">Selected Loan</Label>
          <Select value={String(selectedLoan.id)} onValueChange={(value) => setSelectedLoanId(Number(value))}>
            <SelectTrigger id="loan-selector">
              <SelectValue placeholder="Select a loan" />
            </SelectTrigger>
            <SelectContent>
              {(loansQuery.data ?? []).map((loan) => (
                <SelectItem key={loan.id} value={String(loan.id)}>
                  {loan.loanNumber} · {loan.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Loan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrencyFromCents(selectedLoan.principalAmount)}</div>
            <p className="text-xs text-muted-foreground">
              {selectedLoan.interestRate ? `${selectedLoan.interestRate}% interest` : "Interest not available"} • {selectedLoan.termMonths || 0} months
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {repaymentTimeline.filter((payment) => payment.status === "paid").length}/{repaymentTimeline.length}
            </div>
            <p className="text-xs text-muted-foreground">{formatPercent(progress)} completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Payment</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {nextPayment ? formatCurrencyFromCents(nextPayment.totalAmount) : "No unpaid installment"}
            </div>
            <p className="text-xs text-muted-foreground">
              {nextPayment ? `Due ${nextPayment.dueDate.toLocaleDateString("en-NG", { month: "short", day: "numeric" })}` : `Status: ${selectedLoan.status}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="timeline">Payment Timeline</TabsTrigger>
          <TabsTrigger value="settings">Notification Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loan Status</CardTitle>
                <CardDescription>Current servicing state for the selected borrower loan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium capitalize">{selectedLoan.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Disbursement Date</span>
                  <span className="font-medium">{selectedLoan.disbursedAt ? new Date(selectedLoan.disbursedAt).toLocaleDateString("en-NG") : "Not disbursed"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Outstanding Balance</span>
                  <span className="font-medium">{formatCurrencyFromCents(selectedLoan.outstandingBalance)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Loan Summary</CardTitle>
                <CardDescription>Live aggregate values from the microfinance backend.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Due</span>
                  <span className="font-medium">{repaymentScheduleQuery.data ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(repaymentScheduleQuery.data.totalAmount) : "Loading..."}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Repaid</span>
                  <span className="font-medium">{new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(repaymentTimeline.reduce((sum, payment) => sum + (payment.paidAmount || 0), 0))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Remaining Balance</span>
                  <span className="font-medium">{selectedLoan.outstandingBalance !== null && selectedLoan.outstandingBalance !== undefined ? formatCurrencyFromCents(selectedLoan.outstandingBalance) : "Not available"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Repayment Activity</CardTitle>
                <CardDescription>Derived directly from persisted repayment records.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Paid Installments</span>
                  <span className="font-medium">{repaymentTimeline.filter((payment) => payment.status === "paid").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Open Installments</span>
                  <span className="font-medium">{repaymentTimeline.filter((payment) => payment.status !== "paid").length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Overdue Installments</span>
                  <span className="font-medium">{repaymentTimeline.filter((payment) => payment.status === "overdue").length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <PaymentTimeline payments={repaymentTimeline} loanNumber={selectedLoan.loanNumber} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                <CardTitle>SMS Notification Preferences</CardTitle>
              </div>
              <CardDescription>Manage how you receive payment reminders and loan updates via SMS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="sms-enabled" className="text-base font-medium">Enable SMS Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive all SMS notifications.</p>
                </div>
                <Switch
                  id="sms-enabled"
                  checked={smsPreferences.smsEnabled}
                  onCheckedChange={(checked) => setSmsPreferences({ ...smsPreferences, smsEnabled: checked })}
                />
              </div>

              <div className="border-t pt-6 space-y-4">
                <h4 className="font-medium">Notification Types</h4>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="payment-reminders">Payment Reminders</Label>
                    <p className="text-sm text-muted-foreground">Get reminded before your payment is due.</p>
                  </div>
                  <Switch
                    id="payment-reminders"
                    checked={smsPreferences.paymentReminders}
                    disabled={!smsPreferences.smsEnabled}
                    onCheckedChange={(checked) => setSmsPreferences({ ...smsPreferences, paymentReminders: checked })}
                  />
                </div>

                {smsPreferences.paymentReminders ? (
                  <div className="ml-6 space-y-2">
                    <Label htmlFor="reminder-days">Remind me (days before due date)</Label>
                    <Input
                      id="reminder-days"
                      type="number"
                      min="1"
                      max="7"
                      value={smsPreferences.reminderDaysBefore}
                      onChange={(e) =>
                        setSmsPreferences({
                          ...smsPreferences,
                          reminderDaysBefore: Number.parseInt(e.target.value, 10) || 3,
                        })
                      }
                      className="w-24"
                      disabled={!smsPreferences.smsEnabled}
                    />
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="loan-approval">Loan Approval Notifications</Label>
                    <p className="text-sm text-muted-foreground">Get notified when your loan is approved.</p>
                  </div>
                  <Switch
                    id="loan-approval"
                    checked={smsPreferences.loanApprovalNotifications}
                    disabled={!smsPreferences.smsEnabled}
                    onCheckedChange={(checked) =>
                      setSmsPreferences({ ...smsPreferences, loanApprovalNotifications: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="loan-disbursement">Loan Disbursement Notifications</Label>
                    <p className="text-sm text-muted-foreground">Get notified when funds are disbursed.</p>
                  </div>
                  <Switch
                    id="loan-disbursement"
                    checked={smsPreferences.loanDisbursementNotifications}
                    disabled={!smsPreferences.smsEnabled}
                    onCheckedChange={(checked) =>
                      setSmsPreferences({ ...smsPreferences, loanDisbursementNotifications: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="overdue">Overdue Payment Notifications</Label>
                    <p className="text-sm text-muted-foreground">Get notified about overdue payments.</p>
                  </div>
                  <Switch
                    id="overdue"
                    checked={smsPreferences.overdueNotifications}
                    disabled={!smsPreferences.smsEnabled}
                    onCheckedChange={(checked) => setSmsPreferences({ ...smsPreferences, overdueNotifications: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="marketing">Marketing Messages</Label>
                    <p className="text-sm text-muted-foreground">Receive promotional offers and updates.</p>
                  </div>
                  <Switch
                    id="marketing"
                    checked={smsPreferences.marketingMessages}
                    disabled={!smsPreferences.smsEnabled}
                    onCheckedChange={(checked) => setSmsPreferences({ ...smsPreferences, marketingMessages: checked })}
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <Button onClick={handleSavePreferences} className="w-full" disabled={updatePreferences.isPending}>
                  {updatePreferences.isPending ? "Saving..." : "Save Preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
