import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDatabase } from "@/hooks/useDatabase";
import { expenses, farms, crops } from "@/db/schema";
import { Plus, Loader2, Receipt, Trash2, Download, CheckSquare, Square, Search, BarChart3, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SavedFilters } from "@/components/SavedFilters";
import { FilterAnalytics } from "@/components/FilterAnalytics";
import { eq } from "drizzle-orm";
import { useOfflineSync, useOnlineStatus } from "@/hooks/useOfflineSync";

interface Expense {
  id: number;
  farmId: number;
  cropId: number | null;
  category: string;
  description: string;
  amount: number;
  expenseDate: Date;
  paymentMethod: string | null;
  receipt: string | null;
  notes: string | null;
  createdAt: Date;
}

interface Farm {
  id: number;
  farmName: string;
}

interface Crop {
  id: number;
  cropName: string;
}

export default function Expenses() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const { saveExpense: saveOfflineExpense } = useOfflineSync();
  const [expensesList, setExpensesList] = useState<Expense[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [cropsList, setCropsList] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<number[]>([]);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [formData, setFormData] = useState({
    farmId: "",
    cropId: "",
    category: "",
    description: "",
    amount: "",
    expenseDate: "",
    paymentMethod: "",
    notes: "",
  });

  useEffect(() => {
    if (!isInitialized) return;
    fetchData();
  }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setSelectedExpenses([]);
      const [expensesData, farmsData, cropsData] = await Promise.all([
        db.select().from(expenses).where(eq(expenses.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
        db.select({ id: crops.id, cropName: crops.cropName }).from(crops).where(eq(crops.userId, Number(user.id))),
      ]);
      setExpensesList(expensesData as Expense[]);
      setFarmsList(farmsData as Farm[]);
      setCropsList(cropsData as Crop[]);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.farmId || !formData.category || !formData.description || !formData.amount || !formData.expenseDate) {
      toast.error("Farm, category, description, amount, and expense date are required");
      return;
    }

    try {
      setSubmitting(true);
      if (!user) {
        toast.error("User not authenticated");
        return;
      }

      // If offline, save to IndexedDB for later sync
      if (!isOnline) {
        await saveOfflineExpense({
          category: formData.category,
          amount: parseFloat(formData.amount),
          description: formData.description,
          expenseDate: formData.expenseDate,
          notes: formData.notes || undefined,
        });
        
        toast.success("Expense saved offline. Will sync when back online.", {
          icon: <WifiOff className="w-4 h-4" />,
        });
      } else {
        // Online - save directly to database
        await db.insert(expenses).values({
          userId: user.id,
          farmId: parseInt(formData.farmId),
          cropId: formData.cropId ? parseInt(formData.cropId) : null,
          category: formData.category,
          description: formData.description,
          amount: Math.round(parseFloat(formData.amount) * 100),
          expenseDate: new Date(formData.expenseDate),
          paymentMethod: formData.paymentMethod || null,
          notes: formData.notes || null,
        });

        toast.success("Expense added successfully");
      }
      
      setOpen(false);
      setFormData({
        farmId: "",
        cropId: "",
        category: "",
        description: "",
        amount: "",
        expenseDate: "",
        paymentMethod: "",
        notes: "",
      });
      fetchData();
    } catch (err) {
      console.error("Failed to add expense:", err);
      toast.error("Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };

  const getFarmName = (farmId: number) => {
    const farm = farmsList.find((f) => f.id === farmId);
    return farm ? farm.farmName : "Unknown";
  };

  // Filter expenses based on search and filters
  const filteredExpenses = expensesList.filter((expense) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        expense.description.toLowerCase().includes(query) ||
        expense.category.toLowerCase().includes(query) ||
        getFarmName(expense.farmId).toLowerCase().includes(query) ||
        (expense.notes && expense.notes.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Category filter
    if (categoryFilter !== "all" && expense.category !== categoryFilter) {
      return false;
    }

    // Date range filter
    if (dateRangeStart) {
      const expenseDate = new Date(expense.expenseDate);
      const startDate = new Date(dateRangeStart);
      if (expenseDate < startDate) return false;
    }
    if (dateRangeEnd) {
      const expenseDate = new Date(expense.expenseDate);
      const endDate = new Date(dateRangeEnd);
      if (expenseDate > endDate) return false;
    }

    return true;
  });

  const getCropName = (cropId: number | null) => {
    if (!cropId) return "-";
    const crop = cropsList.find((c) => c.id === cropId);
    return crop ? crop.cropName : "Unknown";
  };

  // Batch operation handlers
  const handleSelectAll = () => {
    if (selectedExpenses.length === expensesList.length) {
      setSelectedExpenses([]);
    } else {
      setSelectedExpenses(expensesList.map(expense => expense.id));
    }
  };

  const toggleExpenseSelection = (expenseId: number) => {
    setSelectedExpenses(prev => 
      prev.includes(expenseId) 
        ? prev.filter(id => id !== expenseId)
        : [...prev, expenseId]
    );
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedExpenses.length} expense(s)?`)) {
      return;
    }

    try {
      for (const expenseId of selectedExpenses) {
        await db.delete(expenses).where(eq(expenses.id, expenseId));
      }
      toast.success(`Deleted ${selectedExpenses.length} expense(s)`);
      fetchData();
    } catch (err) {
      console.error("Failed to delete expenses:", err);
      toast.error("Failed to delete expenses");
    }
  };

  const handleBatchExport = () => {
    const selectedData = expensesList.filter(expense => selectedExpenses.includes(expense.id));
    
    if (selectedData.length === 0) {
      toast.error("No expenses selected");
      return;
    }

    const headers = ["Date", "Category", "Description", "Amount", "Farm", "Crop", "Payment Method", "Notes"];
    const rows = selectedData.map(expense => [
      new Date(expense.expenseDate).toLocaleDateString(),
      expense.category,
      expense.description,
      `$${(expense.amount / 100).toFixed(2)}`,
      getFarmName(expense.farmId),
      getCropName(expense.cropId),
      expense.paymentMethod || "",
      expense.notes || "",
    ]);

    const csv = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success(`Exported ${selectedData.length} expense(s)`);
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getTotalExpenses = () => {
    return expensesList.reduce((sum, expense) => sum + expense.amount, 0);
  };

  if (!isInitialized || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Expenses</h1>
            <p className="text-muted-foreground mt-2">Track and manage farm expenses</p>
            {selectedExpenses.length > 0 && (
              <p className="text-sm text-primary mt-1">{selectedExpenses.length} item(s) selected</p>
            )}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={farmsList.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
                <DialogDescription>
                  Record a new farm expense
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="farmId">Farm *</Label>
                  <Select value={formData.farmId} onValueChange={(value) => setFormData({ ...formData, farmId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a farm" />
                    </SelectTrigger>
                    <SelectContent>
                      {farmsList.map((farm) => (
                        <SelectItem key={farm.id} value={farm.id.toString()}>
                          {farm.farmName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cropId">Crop (Optional)</Label>
                  <Select value={formData.cropId} onValueChange={(value) => setFormData({ ...formData, cropId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a crop (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {cropsList.map((crop) => (
                        <SelectItem key={crop.id} value={crop.id.toString()}>
                          {crop.cropName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="utilities">Utilities</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="rent">Rent</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount ($) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expenseDate">Expense Date *</Label>
                    <Input
                      id="expenseDate"
                      type="date"
                      value={formData.expenseDate}
                      onChange={(e) => setFormData({ ...formData, expenseDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Payment Method</Label>
                  <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Receipt className="w-4 h-4 mr-2" />
                        Add Expense
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filters */}
        {expensesList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search & Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Search */}
                <div className="md:col-span-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search by description, category, farm, or notes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Category Filter */}
                <div>
                  <Label htmlFor="category-filter">Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger id="category-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="seeds">Seeds</SelectItem>
                      <SelectItem value="fertilizers">Fertilizers</SelectItem>
                      <SelectItem value="pesticides">Pesticides</SelectItem>
                      <SelectItem value="labor">Labor</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="fuel">Fuel</SelectItem>
                      <SelectItem value="water">Water</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="transportation">Transportation</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Saved Filters */}
                <div className="flex items-end">
                  <SavedFilters
                    storageKey="expenses-saved-filters"
                    currentFilters={{
                      searchQuery,
                      categoryFilter,
                      dateRangeStart,
                      dateRangeEnd,
                    }}
                    onLoadFilter={(filters) => {
                      setSearchQuery(filters.searchQuery || "");
                      setCategoryFilter(filters.categoryFilter || "all");
                      setDateRangeStart(filters.dateRangeStart || "");
                      setDateRangeEnd(filters.dateRangeEnd || "");
                    }}
                  />
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setCategoryFilter("all");
                      setDateRangeStart("");
                      setDateRangeEnd("");
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>

                {/* Analytics Toggle */}
                <div className="flex items-end">
                  <Button
                    variant={showAnalytics ? "default" : "outline"}
                    onClick={() => setShowAnalytics(!showAnalytics)}
                    className="w-full"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    {showAnalytics ? "Hide" : "Show"} Analytics
                  </Button>
                </div>
              </div>

              {/* Filter Presets */}
              <div className="mt-4">
                <Label>Quick Filters</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                      setDateRangeStart(firstDay.toISOString().split('T')[0]);
                      setDateRangeEnd(today.toISOString().split('T')[0]);
                    }}
                  >
                    This Month
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const thirtyDaysAgo = new Date(today);
                      thirtyDaysAgo.setDate(today.getDate() - 30);
                      setDateRangeStart(thirtyDaysAgo.toISOString().split('T')[0]);
                      setDateRangeEnd(today.toISOString().split('T')[0]);
                    }}
                  >
                    Last 30 Days
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const ninetyDaysAgo = new Date(today);
                      ninetyDaysAgo.setDate(today.getDate() - 90);
                      setDateRangeStart(ninetyDaysAgo.toISOString().split('T')[0]);
                      setDateRangeEnd(today.toISOString().split('T')[0]);
                    }}
                  >
                    Last 90 Days
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const firstDay = new Date(today.getFullYear(), 0, 1);
                      setDateRangeStart(firstDay.toISOString().split('T')[0]);
                      setDateRangeEnd(today.toISOString().split('T')[0]);
                    }}
                  >
                    This Year
                  </Button>
                </div>
              </div>

              {/* Filter Analytics */}
              {showAnalytics && (
                <div className="mt-4">
                  <FilterAnalytics storageKey="expenses-saved-filters" />
                </div>
              )}

              {/* Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="date-start">Expense Date From</Label>
                  <Input
                    id="date-start"
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="date-end">Expense Date To</Label>
                  <Input
                    id="date-end"
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                  />
                </div>
              </div>

              {/* Results Count */}
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {filteredExpenses.length} of {expensesList.length} expenses
              </div>
            </CardContent>
          </Card>
        )}

        {expensesList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Total Expenses</CardTitle>
              <CardDescription>Sum of all recorded expenses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-card-foreground">
                {formatCurrency(getTotalExpenses())}
              </div>
            </CardContent>
          </Card>
        )}

        {farmsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farms Available</CardTitle>
              <CardDescription>
                You need to add farms before tracking expenses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Farms section to add your first farm.
              </p>
            </CardContent>
          </Card>
        ) : expensesList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Expenses Recorded</CardTitle>
              <CardDescription>
                Get started by recording your first expense
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the "Add Expense" button above to start tracking expenses.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Expense Records ({expensesList.length})</CardTitle>
                  <CardDescription>View and manage all expense records</CardDescription>
                </div>
                {selectedExpenses.length > 0 && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBatchExport}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export Selected
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBatchDelete}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Selected
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center justify-center w-full"
                      >
                        {selectedExpenses.length === expensesList.length ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Farm</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>
                        <button
                          onClick={() => toggleExpenseSelection(expense.id)}
                          className="flex items-center justify-center w-full"
                        >
                          {selectedExpenses.includes(expense.id) ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate">
                        {expense.description}
                      </TableCell>
                      <TableCell className="capitalize">{expense.category}</TableCell>
                      <TableCell>{getFarmName(expense.farmId)}</TableCell>
                      <TableCell>{getCropName(expense.cropId)}</TableCell>
                      <TableCell>{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>
                        {new Date(expense.expenseDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="capitalize">
                        {expense.paymentMethod?.replace("_", " ") || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
