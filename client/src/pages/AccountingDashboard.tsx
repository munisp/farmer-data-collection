import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, FileText, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { format } from "date-fns";

export default function AccountingDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [reportStartDate, setReportStartDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd"));
  const [reportEndDate, setReportEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Fetch data
  const { data: journalEntries, isLoading: entriesLoading } = trpc.accounting.getJournalEntries.useQuery({ limit: 20 });
  const { data: profitLoss, isLoading: plLoading } = trpc.accounting.getProfitAndLoss.useQuery({
    startDate: reportStartDate,
    endDate: reportEndDate,
  });
  const { data: balanceSheet, isLoading: bsLoading } = trpc.accounting.getBalanceSheet.useQuery({
    asOfDate: reportEndDate,
  });
  const { data: cashFlow, isLoading: cfLoading } = trpc.accounting.getCashFlow.useQuery({
    startDate: reportStartDate,
    endDate: reportEndDate,
  });

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Accounting & Finance</h1>
            <p className="text-muted-foreground">Double-entry bookkeeping and financial reports</p>
          </div>
          <CreateJournalEntryDialog />
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {bsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">
                  ₦{(Number(balanceSheet?.totalAssets || 0) / 100).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {bsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold">
                  ₦{(Number(balanceSheet?.totalLiabilities || 0) / 100).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-2xl font-bold text-green-600">
                  ₦{(Number(profitLoss?.totalRevenue || 0) / 100).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Income</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <div className={`text-2xl font-bold ${Number(profitLoss?.netIncome || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ₦{(Number(profitLoss?.netIncome || 0) / 100).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="journal">Journal Entries</TabsTrigger>
            <TabsTrigger value="reports">Financial Reports</TabsTrigger>
            <TabsTrigger value="help">Help & Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Journal Entries</CardTitle>
                <CardDescription>Latest accounting transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {entriesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : journalEntries && journalEntries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entry #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journalEntries.map((entry: any) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">{entry.entryNumber}</TableCell>
                          <TableCell>{format(new Date(entry.entryDate), "MMM dd, yyyy")}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell>{entry.reference || "-"}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              entry.status === "posted" ? "bg-green-100 text-green-800" :
                              entry.status === "draft" ? "bg-yellow-100 text-yellow-800" :
                              "bg-red-100 text-red-800"
                            }`}>
                              {entry.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No journal entries found. Create your first entry to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="journal" className="space-y-4">
            <JournalEntriesTab entries={journalEntries} loading={entriesLoading} />
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <FinancialReportsTab
              reportStartDate={reportStartDate}
              reportEndDate={reportEndDate}
              setReportStartDate={setReportStartDate}
              setReportEndDate={setReportEndDate}
              profitLoss={profitLoss}
              balanceSheet={balanceSheet}
              cashFlow={cashFlow}
              plLoading={plLoading}
              bsLoading={bsLoading}
              cfLoading={cfLoading}
            />
          </TabsContent>

          <TabsContent value="help" className="space-y-4">
            <HelpGuideTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function CreateJournalEntryDialog() {
  const [open, setOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState([
    { accountCode: "", debit: 0, credit: 0, description: "" },
    { accountCode: "", debit: 0, credit: 0, description: "" },
  ]);

  const utils = trpc.useUtils();
  const createEntry = trpc.accounting.createJournalEntry.useMutation({
    onSuccess: () => {
      toast.success("Journal entry created successfully");
      utils.accounting.getJournalEntries.invalidate();
      utils.accounting.getProfitAndLoss.invalidate();
      utils.accounting.getBalanceSheet.invalidate();
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create journal entry");
    },
  });

  const resetForm = () => {
    setEntryDate(format(new Date(), "yyyy-MM-dd"));
    setDescription("");
    setReference("");
    setLines([
      { accountCode: "", debit: 0, credit: 0, description: "" },
      { accountCode: "", debit: 0, credit: 0, description: "" },
    ]);
  };

  const addLine = () => {
    setLines([...lines, { accountCode: "", debit: 0, credit: 0, description: "" }]);
  };

  const updateLine = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const removeLine = (index: number) => {
    if (lines.length > 2) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = () => {
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast.error(`Debits (₦${totalDebit}) and credits (₦${totalCredit}) must balance`);
      return;
    }

    createEntry.mutate({
      entryDate,
      description,
      reference,
      lines: lines.map(line => ({
        accountCode: line.accountCode,
        debit: Number(line.debit),
        credit: Number(line.credit),
        description: line.description,
      })),
    });
  };

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Journal Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Journal Entry</DialogTitle>
          <DialogDescription>Record a new accounting transaction with double-entry bookkeeping</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryDate">Entry Date</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference (Optional)</Label>
              <Input
                id="reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Invoice #, Receipt #, etc."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this transaction"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Journal Lines</Label>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground">
                <div className="col-span-3">Account Code</div>
                <div className="col-span-2 text-right">Debit (₦)</div>
                <div className="col-span-2 text-right">Credit (₦)</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-1"></div>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3">
                    <Input
                      placeholder="e.g., 1010"
                      value={line.accountCode}
                      onChange={(e) => updateLine(index, "accountCode", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={line.debit || ""}
                      onChange={(e) => updateLine(index, "debit", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={line.credit || ""}
                      onChange={(e) => updateLine(index, "credit", e.target.value)}
                    />
                  </div>
                  <div className="col-span-4">
                    <Input
                      placeholder="Line description"
                      value={line.description}
                      onChange={(e) => updateLine(index, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                      disabled={lines.length <= 2}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  Add Line
                </Button>
                <div className="text-sm space-x-4">
                  <span>Total Debit: <strong>₦{totalDebit.toFixed(2)}</strong></span>
                  <span>Total Credit: <strong>₦{totalCredit.toFixed(2)}</strong></span>
                  {!isBalanced && totalDebit + totalCredit > 0 && (
                    <span className="text-red-600 font-medium">⚠ Not Balanced</span>
                  )}
                  {isBalanced && totalDebit > 0 && (
                    <span className="text-green-600 font-medium">✓ Balanced</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createEntry.isPending || !isBalanced}>
            {createEntry.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JournalEntriesTab({ entries, loading }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>All Journal Entries</CardTitle>
        <CardDescription>Complete transaction history</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries && entries.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entry #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry: any) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono">{entry.entryNumber}</TableCell>
                  <TableCell>{format(new Date(entry.entryDate), "MMM dd, yyyy")}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>{entry.reference || "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      entry.status === "posted" ? "bg-green-100 text-green-800" :
                      entry.status === "draft" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {entry.status}
                    </span>
                  </TableCell>
                  <TableCell>{entry.createdBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No journal entries found
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FinancialReportsTab({ reportStartDate, reportEndDate, setReportStartDate, setReportEndDate, profitLoss, balanceSheet, cashFlow, plLoading, bsLoading, cfLoading }: any) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Report Period</CardTitle>
          <CardDescription>Select date range for financial reports</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Profit & Loss Statement</CardTitle>
            <CardDescription>Income and expenses for the period</CardDescription>
          </CardHeader>
          <CardContent>
            {plLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : profitLoss ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Revenue</h3>
                  <div className="text-2xl font-bold text-green-600">
                    ₦{((profitLoss.totalRevenue || 0) / 100).toLocaleString()}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Expenses</h3>
                  <div className="text-2xl font-bold text-red-600">
                    ₦{((profitLoss.totalExpenses || 0) / 100).toLocaleString()}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Net Income</h3>
                  <div className={`text-3xl font-bold ${(profitLoss.netIncome || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ₦{((profitLoss.netIncome || 0) / 100).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Balance Sheet</CardTitle>
            <CardDescription>Financial position as of {format(new Date(reportEndDate), "MMM dd, yyyy")}</CardDescription>
          </CardHeader>
          <CardContent>
            {bsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : balanceSheet ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Assets</h3>
                  <div className="text-2xl font-bold">
                    ₦{((balanceSheet.totalAssets || 0) / 100).toLocaleString()}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Liabilities</h3>
                  <div className="text-2xl font-bold">
                    ₦{((balanceSheet.totalLiabilities || 0) / 100).toLocaleString()}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Total Equity</h3>
                  <div className="text-3xl font-bold text-blue-600">
                    ₦{((balanceSheet.totalEquity || 0) / 100).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Statement</CardTitle>
          <CardDescription>Cash movements for the period</CardDescription>
        </CardHeader>
        <CardContent>
          {cfLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : cashFlow ? (
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Operating Activities</h3>
                <div className="text-xl font-bold">
                  ₦{((cashFlow.operatingActivities || 0) / 100).toLocaleString()}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Investing Activities</h3>
                <div className="text-xl font-bold">
                  ₦{((cashFlow.investingActivities || 0) / 100).toLocaleString()}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Financing Activities</h3>
                <div className="text-xl font-bold">
                  ₦{((cashFlow.financingActivities || 0) / 100).toLocaleString()}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HelpGuideTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Getting Started with Accounting</CardTitle>
          <CardDescription>Learn the basics of double-entry bookkeeping</CardDescription>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <h3>What is Double-Entry Bookkeeping?</h3>
          <p>
            Double-entry bookkeeping is a system where every transaction affects at least two accounts. 
            For every debit entry, there must be an equal credit entry. This ensures your books always balance.
          </p>

          <h3>Common Account Codes</h3>
          <ul>
            <li><strong>1000-1999:</strong> Assets (Cash, Bank, Inventory, Equipment)</li>
            <li><strong>2000-2999:</strong> Liabilities (Loans, Accounts Payable)</li>
            <li><strong>3000-3999:</strong> Equity (Owner's Capital, Retained Earnings)</li>
            <li><strong>4000-4999:</strong> Revenue (Sales, Service Income)</li>
            <li><strong>5000-5999:</strong> Expenses (Rent, Salaries, Supplies)</li>
          </ul>

          <h3>Example Transactions</h3>
          
          <h4>1. Recording a Cash Sale</h4>
          <p>When you sell produce for ₦10,000 cash:</p>
          <ul>
            <li>Debit: Cash (1010) - ₦10,000</li>
            <li>Credit: Sales Revenue (4010) - ₦10,000</li>
          </ul>

          <h4>2. Purchasing Fertilizer on Credit</h4>
          <p>When you buy ₦5,000 worth of fertilizer on credit:</p>
          <ul>
            <li>Debit: Fertilizer Expense (5020) - ₦5,000</li>
            <li>Credit: Accounts Payable (2010) - ₦5,000</li>
          </ul>

          <h4>3. Paying Employee Wages</h4>
          <p>When you pay ₦15,000 in wages:</p>
          <ul>
            <li>Debit: Wages Expense (5010) - ₦15,000</li>
            <li>Credit: Cash (1010) - ₦15,000</li>
          </ul>

          <h3>Tips for Success</h3>
          <ul>
            <li>Always ensure debits equal credits before posting</li>
            <li>Use clear, descriptive transaction descriptions</li>
            <li>Keep reference numbers (invoice #, receipt #) for audit trails</li>
            <li>Review your financial reports monthly</li>
            <li>Reconcile your bank accounts regularly</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
