import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Calendar, Clock, Send, Users, Filter } from "lucide-react";
import { format } from "date-fns";

interface BulkSmsSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BulkSmsScheduler({ open, onOpenChange }: BulkSmsSchedulerProps) {
  const [selectedLoanIds, setSelectedLoanIds] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [dueDateFrom, setDueDateFrom] = useState<string>("");
  const [dueDateTo, setDueDateTo] = useState<string>("");

  // Queries
  const { data: activeLoans = [] } = trpc.microfinance.getActiveLoans.useQuery();
  const { data: templates = [] } = trpc.smsTemplates.list.useQuery({ isActive: true });

  // Mutation
  const scheduleBulkMutation = trpc.smsTemplates.scheduleBulk.useMutation({
    onSuccess: (result) => {
      toast.success(`Scheduled ${result.successCount} messages successfully!`);
      if (result.failureCount > 0) {
        toast.warning(`${result.failureCount} messages failed to schedule`);
      }
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to schedule messages: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSelectedLoanIds(new Set());
    setSelectAll(false);
    setSelectedTemplateId("");
    setScheduledFor("");
    setShowPreview(false);
  };

  // Filter loans based on criteria
  const filteredLoans = useMemo(() => {
    return activeLoans.filter((loan: any) => {
      // Status filter
      if (statusFilter !== "all" && loan.status !== statusFilter) {
        return false;
      }

      // Amount filter
      if (minAmount && loan.amount < parseFloat(minAmount) * 100) {
        return false;
      }
      if (maxAmount && loan.amount > parseFloat(maxAmount) * 100) {
        return false;
      }

      // Due date filter
      if (dueDateFrom && loan.nextPaymentDate) {
        if (new Date(loan.nextPaymentDate) < new Date(dueDateFrom)) {
          return false;
        }
      }
      if (dueDateTo && loan.nextPaymentDate) {
        if (new Date(loan.nextPaymentDate) > new Date(dueDateTo)) {
          return false;
        }
      }

      return true;
    });
  }, [activeLoans, statusFilter, minAmount, maxAmount, dueDateFrom, dueDateTo]);

  const handleToggleSelectAll = () => {
    if (selectAll) {
      setSelectedLoanIds(new Set());
    } else {
      setSelectedLoanIds(new Set(filteredLoans.map((loan: any) => loan.id)));
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
    setSelectAll(newSelected.size === filteredLoans.length && filteredLoans.length > 0);
  };

  const handleSchedule = () => {
    if (selectedLoanIds.size === 0) {
      toast.error("Please select at least one loan");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("Please select a template");
      return;
    }
    if (!scheduledFor) {
      toast.error("Please select a date and time");
      return;
    }

    scheduleBulkMutation.mutate({
      templateId: parseInt(selectedTemplateId),
      loanIds: Array.from(selectedLoanIds),
      scheduledFor,
    });
  };

  const selectedLoansData = useMemo(() => {
    return filteredLoans.filter((loan: any) => selectedLoanIds.has(loan.id));
  }, [filteredLoans, selectedLoanIds]);

  const totalSelectedAmount = useMemo(() => {
    return selectedLoansData.reduce((sum: number, loan: any) => sum + loan.amount, 0);
  }, [selectedLoansData]);

  const selectedTemplate = templates.find((t: any) => t.id.toString() === selectedTemplateId);

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Bulk SMS Scheduling
            </DialogTitle>
            <DialogDescription>
              Select multiple loans and schedule SMS reminders to be sent at a specific time
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Template and Schedule Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bulkTemplate">SMS Template *</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger id="bulkTemplate">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template: any) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <p className="font-semibold mb-1">Preview:</p>
                    <p className="text-muted-foreground">{selectedTemplate.body}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduledFor">Schedule For *</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">
                  Messages will be sent at this date and time
                </p>
              </div>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Filter Loans
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Amount Range</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={minAmount}
                        onChange={(e) => setMinAmount(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="Max"
                        value={maxAmount}
                        onChange={(e) => setMaxAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Due Date Range</Label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={dueDateFrom}
                        onChange={(e) => setDueDateFrom(e.target.value)}
                      />
                      <Input
                        type="date"
                        value={dueDateTo}
                        onChange={(e) => setDueDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Selection Summary */}
            {selectedLoanIds.size > 0 && (
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-lg">
                      {selectedLoanIds.size} {selectedLoanIds.size === 1 ? "Loan" : "Loans"} Selected
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Total amount: ₦{(totalSelectedAmount / 100).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    onClick={() => setShowPreview(true)}
                    variant="outline"
                    size="sm"
                  >
                    Preview Messages
                  </Button>
                </div>
              </div>
            )}

            {/* Loan Selection Table */}
            <div className="rounded-md border max-h-96 overflow-y-auto">
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
                  {filteredLoans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No loans match the selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLoans.map((loan: any) => (
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
                          <Badge variant={loan.status === "active" ? "default" : "destructive"}>
                            {loan.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={scheduleBulkMutation.isPending || selectedLoanIds.size === 0}
            >
              {scheduleBulkMutation.isPending ? (
                <>Scheduling...</>
              ) : (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  Schedule {selectedLoanIds.size} Messages
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Scheduled Messages</DialogTitle>
            <DialogDescription>
              Review the messages that will be sent to {selectedLoanIds.size} borrowers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedLoansData.map((loan: any) => {
              const message = selectedTemplate?.body
                .replace(/\{\{borrower_name\}\}/g, loan.borrowerName)
                .replace(/\{\{amount\}\}/g, `₦${(loan.amount / 100).toLocaleString()}`)
                .replace(/\{\{loan_number\}\}/g, loan.loanNumber)
                .replace(/\{\{due_date\}\}/g, loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : "N/A");

              return (
                <Card key={loan.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      {loan.borrowerName} - {loan.borrowerPhone}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{message}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Back to Selection
            </Button>
            <Button onClick={handleSchedule} disabled={scheduleBulkMutation.isPending}>
              {scheduleBulkMutation.isPending ? (
                <>Scheduling...</>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Confirm & Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
