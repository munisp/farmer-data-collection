import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Send, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Users } from "lucide-react";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";

export default function SmsManagement() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [messageType, setMessageType] = useState<"payment_reminder" | "loan_approval" | "disbursement" | "overdue_alert">("payment_reminder");
  const [customMessage, setCustomMessage] = useState("");
  const [selectedLoanId, setSelectedLoanId] = useState<string>("");
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templatePreview, setTemplatePreview] = useState<string>("");

  // Fetch active loans for payment reminders
  const { data: activeLoans = [] } = trpc.microfinance.getActiveLoans.useQuery();
  
  // Fetch SMS templates
  const { data: templates = [] } = trpc.smsTemplates.getAll.useQuery();
  
  // Fetch SMS delivery logs
  const { data: smsLogs = [], refetch: refetchLogs } = trpc.sms.getDeliveryLogs.useQuery({
    limit: 50,
    offset: 0
  });

  // Fetch SMS statistics
  const { data: smsStats } = trpc.sms.getStatistics.useQuery();

  // Manual send mutation
  const sendManualSms = trpc.sms.sendManualMessage.useMutation({
    onSuccess: () => {
      toast.success("SMS sent successfully!");
      setPhoneNumber("");
      setCustomMessage("");
      refetchLogs();
    },
    onError: (error) => {
      toast.error(`Failed to send SMS: ${error.message}`);
    }
  });

  // Send payment reminder mutation
  const sendPaymentReminder = trpc.sms.sendPaymentReminderManual.useMutation({
    onSuccess: () => {
      toast.success("Payment reminder sent!");
      setSelectedLoanId("");
      refetchLogs();
    },
    onError: (error) => {
      toast.error(`Failed to send reminder: ${error.message}`);
    }
  });

  // Bulk send payment reminders mutation
  const sendBulkReminders = trpc.sms.sendBulkPaymentReminders.useMutation({
    onSuccess: (result) => {
      toast.success(`Sent ${result.successCount} reminders successfully!`);
      if (result.failureCount > 0) {
        toast.warning(`${result.failureCount} reminders failed to send`);
      }
      setSelectedLoanIds(new Set());
      setSelectAll(false);
      refetchLogs();
    },
    onError: (error) => {
      toast.error(`Failed to send bulk reminders: ${error.message}`);
    }
  });

  const handleSendManual = () => {
    if (!phoneNumber || !customMessage) {
      toast.error("Phone number and message are required");
      return;
    }

    sendManualSms.mutate({
      phoneNumber,
      messageType,
      message: customMessage
    });
  };

  const handleSendPaymentReminder = () => {
    if (!selectedLoanId) {
      toast.error("Please select a loan");
      return;
    }

    sendPaymentReminder.mutate({
      loanId: parseInt(selectedLoanId)
    });
  };

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedLoanIds(new Set());
    } else {
      setSelectedLoanIds(new Set(activeLoans.map((loan: any) => loan.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleToggleLoan = (loanId: number) => {
    const newSelected = new Set(selectedLoanIds);
    if (newSelected.has(loanId)) {
      newSelected.delete(loanId);
    } else {
      newSelected.add(loanId);
    }
    setSelectedLoanIds(newSelected);
    setSelectAll(newSelected.size === activeLoans.length);
  };

  const handleSendBulkReminders = () => {
    if (selectedLoanIds.size === 0) {
      toast.error("Please select at least one loan");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("Please select an SMS template");
      return;
    }

    sendBulkReminders.mutate({
      loanIds: Array.from(selectedLoanIds),
      templateId: parseInt(selectedTemplateId)
    });
  };

  const selectedLoansData = useMemo(() => {
    return activeLoans.filter((loan: any) => selectedLoanIds.has(loan.id));
  }, [activeLoans, selectedLoanIds]);

  const totalSelectedAmount = useMemo(() => {
    return selectedLoansData.reduce((sum: number, loan: any) => sum + loan.amount, 0);
  }, [selectedLoansData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Delivered</Badge>;
      case "sent":
        return <Badge className="bg-blue-500"><Send className="w-3 h-3 mr-1" />Sent</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getMessageTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      payment_reminder: "bg-orange-500",
      loan_approval: "bg-green-500",
      disbursement: "bg-blue-500",
      overdue_alert: "bg-red-500"
    };
    return <Badge className={colors[type] || "bg-gray-500"}>{type.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">SMS Management</h1>
          <p className="text-muted-foreground">Send and track SMS notifications</p>
        </div>

        {/* Statistics Cards */}
        {smsStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Sent</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{smsStats.totalSent}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{smsStats.delivered}</div>
                <p className="text-xs text-muted-foreground">
                  {smsStats.totalSent > 0 ? ((smsStats.delivered / smsStats.totalSent) * 100).toFixed(1) : 0}% success rate
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{smsStats.failed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₦{smsStats.totalCost.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="send" className="space-y-6">
          <TabsList>
            <TabsTrigger value="send">Send SMS</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Reminders</TabsTrigger>
            <TabsTrigger value="logs">Delivery Logs</TabsTrigger>
          </TabsList>

          {/* Send SMS Tab */}
          <TabsContent value="send" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Manual SMS */}
              <Card>
                <CardHeader>
                  <CardTitle>Send Manual SMS</CardTitle>
                  <CardDescription>Send a custom SMS message to any phone number</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="+234803XXXXXXX"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Include country code (e.g., +234 for Nigeria)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template">Use Template (Optional)</Label>
                    <Select value={selectedTemplateId} onValueChange={(value) => {
                      setSelectedTemplateId(value);
                      if (value) {
                        const template = templates.find((t: any) => t.id.toString() === value);
                        if (template) {
                          setCustomMessage(template.body);
                          setMessageType(template.type as any);
                          setTemplatePreview(template.body);
                        }
                      } else {
                        setTemplatePreview("");
                      }
                    }}>
                      <SelectTrigger id="template">
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Template (Custom Message)</SelectItem>
                        {templates.map((template: any) => (
                          <SelectItem key={template.id} value={template.id.toString()}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="messageType">Message Type</Label>
                    <Select value={messageType} onValueChange={(value: any) => setMessageType(value)}>
                      <SelectTrigger id="messageType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="payment_reminder">Payment Reminder</SelectItem>
                        <SelectItem value="loan_approval">Loan Approval</SelectItem>
                        <SelectItem value="disbursement">Disbursement</SelectItem>
                        <SelectItem value="overdue_alert">Overdue Alert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      placeholder="Enter your message here..."
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      rows={4}
                      maxLength={160}
                    />
                    <p className="text-xs text-muted-foreground">
                      {customMessage.length}/160 characters
                    </p>
                  </div>

                  <Button
                    onClick={handleSendManual}
                    disabled={sendManualSms.isPending}
                    className="w-full"
                  >
                    {sendManualSms.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send SMS
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Payment Reminder */}
              <Card>
                <CardHeader>
                  <CardTitle>Send Payment Reminder</CardTitle>
                  <CardDescription>Send automated payment reminder for a specific loan</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="loan">Select Loan</Label>
                    <Select value={selectedLoanId} onValueChange={setSelectedLoanId}>
                      <SelectTrigger id="loan">
                        <SelectValue placeholder="Choose a loan..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeLoans.map((loan: any) => (
                          <SelectItem key={loan.id} value={loan.id.toString()}>
                            {loan.loanNumber} - {loan.borrowerName} (₦{(loan.amount / 100).toLocaleString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedLoanId && (() => {
                    const loan = activeLoans.find((l: any) => l.id === parseInt(selectedLoanId));
                    return loan ? (
                      <div className="p-4 bg-muted rounded-lg space-y-2">
                        <h4 className="font-semibold">Loan Details</h4>
                        <div className="text-sm space-y-1">
                          <p><span className="text-muted-foreground">Borrower:</span> {loan.borrowerName}</p>
                          <p><span className="text-muted-foreground">Amount:</span> ₦{(loan.amount / 100).toLocaleString()}</p>
                          <p><span className="text-muted-foreground">Phone:</span> {loan.borrowerPhone}</p>
                          <p><span className="text-muted-foreground">Next Payment:</span> {loan.nextPaymentDate ? format(new Date(loan.nextPaymentDate), "MMM dd, yyyy") : "N/A"}</p>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div className="text-sm text-blue-900 dark:text-blue-100">
                        <p className="font-semibold mb-1">Preview Message</p>
                        <p className="text-blue-700 dark:text-blue-300">
                          "Dear [Borrower], your payment of ₦[Amount] for loan [Loan Number] is due on [Date]. Please ensure timely payment to avoid penalties."
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleSendPaymentReminder}
                    disabled={sendPaymentReminder.isPending || !selectedLoanId}
                    className="w-full"
                  >
                    {sendPaymentReminder.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Payment Reminder
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Bulk Payment Reminders Tab */}
          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Bulk Payment Reminders
                </CardTitle>
                <CardDescription>
                  Select multiple loans and send payment reminders in batch
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Template Selection */}
                <div className="space-y-2">
                  <Label htmlFor="bulkTemplate">SMS Template</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger id="bulkTemplate">
                      <SelectValue placeholder="Select a template for bulk sending" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.filter((t: any) => t.messageType === 'payment_reminder').map((template: any) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplateId && (() => {
                    const template = templates.find((t: any) => t.id.toString() === selectedTemplateId);
                    return template ? (
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-semibold mb-1">Preview:</p>
                        <p className="text-muted-foreground">{template.body}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Variables like {'{'}borrower_name{'}'}, {'{'}amount{'}'}, {'{'}due_date{'}'} will be auto-filled
                        </p>
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Selection Summary */}
                {selectedLoanIds.size > 0 && (
                  <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-semibold text-lg">
                          {selectedLoanIds.size} {selectedLoanIds.size === 1 ? "Loan" : "Loans"} Selected
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Total amount: ₦{(totalSelectedAmount / 100).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        onClick={handleSendBulkReminders}
                        disabled={sendBulkReminders.isPending}
                        size="lg"
                      >
                        {sendBulkReminders.isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Sending {selectedLoanIds.size} reminders...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send {selectedLoanIds.size} Reminders
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Progress indicator */}
                    {sendBulkReminders.isPending && (
                      <div className="space-y-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary animate-pulse" style={{ width: "60%" }} />
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          Sending reminders... This may take a moment.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Loan Selection Table */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectAll}
                            onCheckedChange={handleToggleSelectAll}
                            aria-label="Select all loans"
                          />
                        </TableHead>
                        <TableHead>Loan Number</TableHead>
                        <TableHead>Borrower</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Next Payment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeLoans.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No active loans found
                          </TableCell>
                        </TableRow>
                      ) : (
                        activeLoans.map((loan: any) => (
                          <TableRow key={loan.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedLoanIds.has(loan.id)}
                                onCheckedChange={() => handleToggleLoan(loan.id)}
                                aria-label={`Select loan ${loan.loanNumber}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{loan.loanNumber}</TableCell>
                            <TableCell>{loan.borrowerName}</TableCell>
                            <TableCell>{loan.borrowerPhone}</TableCell>
                            <TableCell>₦{(loan.amount / 100).toLocaleString()}</TableCell>
                            <TableCell>
                              {loan.nextPaymentDate
                                ? format(new Date(loan.nextPaymentDate), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{loan.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Info Message */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="text-sm text-blue-900 dark:text-blue-100">
                      <p className="font-semibold mb-1">Bulk Reminder Information</p>
                      <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 space-y-1">
                        <li>Select loans using checkboxes</li>
                        <li>Each borrower will receive a personalized payment reminder</li>
                        <li>Only borrowers with SMS notifications enabled will receive messages</li>
                        <li>Progress will be shown during sending</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Delivery Logs Tab */}
          <TabsContent value="logs">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>SMS Delivery Logs</CardTitle>
                  <CardDescription>Track all sent SMS messages and their delivery status</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smsLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No SMS logs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        smsLogs.map((log: any) => (
                          <TableRow key={log.id}>
                            <TableCell className="font-medium">
                              {format(new Date(log.createdAt), "MMM dd, yyyy HH:mm")}
                            </TableCell>
                            <TableCell>{log.phoneNumber}</TableCell>
                            <TableCell>{getMessageTypeBadge(log.messageType)}</TableCell>
                            <TableCell className="max-w-xs truncate" title={log.messageContent}>
                              {log.messageContent}
                            </TableCell>
                            <TableCell>{getStatusBadge(log.status)}</TableCell>
                            <TableCell className="text-right">
                              {log.costAmount ? `₦${log.costAmount.toFixed(2)}` : "-"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
