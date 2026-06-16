import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDatabase } from "@/hooks/useDatabase";
import { expenses, farms, crops } from "@/db/schema";
import { Plus, Loader2, Receipt, Trash2, Download, CheckSquare, Square, Search, BarChart3, WifiOff, Pencil, DollarSign, TrendingDown, PieChart } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq } from "drizzle-orm";
import { useOfflineSync, useOnlineStatus } from "@/hooks/useOfflineSync";
import { trpc } from "@/lib/trpc";

interface Expense {
  id: number; farmId: number; cropId: number | null; category: string; description: string;
  amount: number; expenseDate: Date; paymentMethod: string | null; receipt: string | null;
  notes: string | null; createdAt: Date;
}
interface Farm { id: number; farmName: string; }
interface Crop { id: number; cropName: string; }

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
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Expense | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");

  const [formData, setFormData] = useState({
    farmId: "", cropId: "", category: "", description: "", amount: "",
    expenseDate: "", paymentMethod: "", notes: "",
  });

  const analyticsQuery = trpc.coreExpenses.getAnalytics.useQuery({}, { enabled: activeTab === "analytics" });

  const updateMutation = trpc.coreExpenses.update.useMutation({
    onSuccess: () => { toast.success("Expense updated"); setEditOpen(false); setEditingItem(null); fetchData(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.coreExpenses.delete.useMutation({
    onSuccess: () => { toast.success("Expense deleted"); fetchData(); },
    onError: (err) => toast.error(err.message),
  });
  const batchDeleteMutation = trpc.coreExpenses.batchDelete.useMutation({
    onSuccess: (r) => { toast.success(`Deleted ${r.deleted} expense(s)`); setSelectedIds([]); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => { if (isInitialized) fetchData(); }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setSelectedIds([]);
      const [expensesData, farmsData, cropsData] = await Promise.all([
        db.select().from(expenses).where(eq(expenses.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
        db.select({ id: crops.id, cropName: crops.cropName }).from(crops).where(eq(crops.userId, Number(user.id))),
      ]);
      setExpensesList(expensesData as Expense[]);
      setFarmsList(farmsData as Farm[]);
      setCropsList(cropsData as Crop[]);
    } catch (err) {
      toast.error("Failed to load expenses");
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.category || !formData.description || !formData.amount || !formData.expenseDate) {
      toast.error("Farm, category, description, amount, and date are required"); return;
    }
    try {
      setSubmitting(true);
      if (!user) { toast.error("Not authenticated"); return; }
      const values = {
        userId: user.id,
        farmId: parseInt(formData.farmId),
        cropId: formData.cropId ? parseInt(formData.cropId) : null,
        category: formData.category,
        description: formData.description,
        amount: parseInt(formData.amount),
        expenseDate: new Date(formData.expenseDate),
        paymentMethod: formData.paymentMethod || undefined,
        notes: formData.notes || undefined,
      };
      if (!isOnline) {
        await saveOfflineExpense({ ...values, expenseDate: formData.expenseDate } as any);
        toast.success("Expense saved offline");
      } else {
        await db.insert(expenses).values(values);
        toast.success("Expense recorded");
      }
      setOpen(false);
      setFormData({ farmId: "", cropId: "", category: "", description: "", amount: "", expenseDate: "", paymentMethod: "", notes: "" });
      fetchData();
    } catch (err) {
      toast.error("Failed to add expense");
    } finally { setSubmitting(false); }
  };

  const handleEdit = (item: Expense) => { setEditingItem(item); setEditOpen(true); };
  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id, category: editingItem.category, description: editingItem.description,
      amount: editingItem.amount, paymentMethod: editingItem.paymentMethod || undefined, notes: editingItem.notes || undefined,
    });
  };
  const handleDelete = (item: Expense) => { if (confirm("Delete this expense?")) deleteMutation.mutate({ id: item.id }); };
  const handleBatchDelete = () => { if (selectedIds.length > 0 && confirm(`Delete ${selectedIds.length} expense(s)?`)) batchDeleteMutation.mutate({ ids: selectedIds }); };
  const toggleSelect = (id: number) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };

  const getFarmName = (id: number) => farmsList.find(f => f.id === id)?.farmName || "Unknown";
  const categories = useMemo(() => [...new Set(expensesList.map(e => e.category))], [expensesList]);

  const handleExport = () => {
    const csv = ["Farm,Category,Description,Amount,Date,Payment Method,Notes", ...expensesList.map(e =>
      `"${getFarmName(e.farmId)}","${e.category}","${e.description}","${e.amount}","${new Date(e.expenseDate).toISOString().split('T')[0]}","${e.paymentMethod || ''}","${(e.notes || '').replace(/"/g, '""')}"`
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "expenses.csv"; a.click();
    toast.success("Exported to CSV");
  };

  const filtered = useMemo(() => {
    return expensesList.filter(e => {
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (dateRangeStart && new Date(e.expenseDate) < new Date(dateRangeStart)) return false;
      if (dateRangeEnd && new Date(e.expenseDate) > new Date(dateRangeEnd)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || getFarmName(e.farmId).toLowerCase().includes(q);
      }
      return true;
    });
  }, [expensesList, searchQuery, categoryFilter, dateRangeStart, dateRangeEnd]);

  const totalAmount = expensesList.reduce((s, e) => s + e.amount, 0);
  const analytics = analyticsQuery.data;

  if (!isInitialized || loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Expenses</h1>
            <p className="text-muted-foreground mt-2">Track and analyze farm expenses {!isOnline && <Badge variant="outline" className="ml-2"><WifiOff className="w-3 h-3 mr-1" />Offline</Badge>}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Expense</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add Expense</DialogTitle><DialogDescription>Record a new farm expense</DialogDescription></DialogHeader>
                <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2"><Label>Farm *</Label>
                    <Select value={formData.farmId} onValueChange={(v) => setFormData({ ...formData, farmId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select farm" /></SelectTrigger>
                      <SelectContent>{farmsList.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.farmName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Category *</Label>
                      <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{["Seeds", "Fertilizer", "Pesticides", "Labor", "Equipment", "Fuel", "Transport", "Marketing", "Rent", "Utilities", "Veterinary", "Feed", "Insurance", "Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Amount *</Label><Input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required /></div>
                  </div>
                  <div className="space-y-2"><Label>Description *</Label><Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Date *</Label><Input type="date" value={formData.expenseDate} onChange={(e) => setFormData({ ...formData, expenseDate: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Payment Method</Label>
                      <Select value={formData.paymentMethod} onValueChange={(v) => setFormData({ ...formData, paymentMethod: v })}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{["Cash", "Mobile Money", "Bank Transfer", "Card", "Credit", "Cheque"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2"><Label>Crop (optional)</Label>
                    <Select value={formData.cropId} onValueChange={(v) => setFormData({ ...formData, cropId: v })}>
                      <SelectTrigger><SelectValue placeholder="Link to crop" /></SelectTrigger>
                      <SelectContent><SelectItem value="">None</SelectItem>{cropsList.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.cropName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Add Expense"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="list">Expense List</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Expenses</div><div className="text-2xl font-bold">{expensesList.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Amount</div><div className="text-2xl font-bold text-red-600">{(totalAmount / 100).toLocaleString()}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Categories</div><div className="text-2xl font-bold">{categories.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Avg/Expense</div><div className="text-2xl font-bold">{expensesList.length > 0 ? ((totalAmount / 100) / expensesList.length).toFixed(0) : 0}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-10" aria-label="Search" placeholder="Search expenses..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
              <Input type="date" className="w-[140px]" value={dateRangeStart} onChange={(e) => setDateRangeStart(e.target.value)} />
              <Input type="date" className="w-[140px]" value={dateRangeEnd} onChange={(e) => setDateRangeEnd(e.target.value)} />
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">{selectedIds.length} selected</span>
                <Button variant="destructive" size="sm" onClick={handleBatchDelete}><Trash2 className="w-4 h-4 mr-1" />Delete Selected</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle>Expense Records ({filtered.length})</CardTitle></CardHeader>
              <CardContent>
                {filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">No expenses found</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-[40px]"></TableHead><TableHead>Farm</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filtered.map(e => (
                        <TableRow key={e.id}>
                          <TableCell><Button variant="ghost" size="icon" onClick={() => toggleSelect(e.id)}>{selectedIds.includes(e.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}</Button></TableCell>
                          <TableCell>{getFarmName(e.farmId)}</TableCell>
                          <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                          <TableCell className="max-w-[200px] truncate">{e.description}</TableCell>
                          <TableCell className="font-medium text-red-600">{(e.amount / 100).toLocaleString()}</TableCell>
                          <TableCell>{new Date(e.expenseDate).toLocaleDateString()}</TableCell>
                          <TableCell>{e.paymentMethod ? <Badge variant="secondary">{e.paymentMethod}</Badge> : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(e)}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(e)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {analyticsQuery.isLoading ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : analytics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Receipt className="w-4 h-4" />Total Expenses</div><div className="text-2xl font-bold">{analytics.totalExpenses}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Total Amount</div><div className="text-2xl font-bold text-red-600">{analytics.totalAmount.toLocaleString()}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown className="w-4 h-4" />Average</div><div className="text-2xl font-bold">{analytics.avgAmount.toFixed(0)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><PieChart className="w-4 h-4" />Max Expense</div><div className="text-2xl font-bold">{analytics.maxAmount.toLocaleString()}</div></CardContent></Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.categoryBreakdown.map((c, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><Badge variant="outline">{c.category}</Badge><span className="text-sm text-muted-foreground">{c.count} items</span></div>
                            <div className="text-right"><div className="font-medium text-red-600">{c.totalAmount.toLocaleString()}</div><div className="text-xs text-muted-foreground">{c.percentage.toFixed(1)}%</div></div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.paymentMethods.map((p, i) => (
                          <div key={i} className="flex items-center justify-between"><Badge variant="secondary">{p.method}</Badge><span className="font-medium">{p.totalAmount.toLocaleString()} ({p.count})</span></div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>Monthly Expense Trend</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.monthlyTrend.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{m.month}</span><div className="flex items-center gap-4"><span>{m.count} expenses</span><span className="font-medium text-red-600">{m.totalAmount.toLocaleString()}</span></div></div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Expense by Farm</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Farm</TableHead><TableHead>Expenses</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {analytics.farmBreakdown.map((f, i) => (
                          <TableRow key={i}><TableCell className="font-medium">{f.farmName}</TableCell><TableCell>{f.count}</TableCell><TableCell className="text-red-600">{f.totalAmount.toLocaleString()}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            ) : <Card><CardContent className="p-8 text-center text-muted-foreground">No analytics available</CardContent></Card>}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
            {editingItem && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Category</Label>
                    <Select value={editingItem.category} onValueChange={(v) => setEditingItem({ ...editingItem, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["Seeds", "Fertilizer", "Pesticides", "Labor", "Equipment", "Fuel", "Transport", "Marketing", "Rent", "Utilities", "Veterinary", "Feed", "Insurance", "Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Amount</Label><Input type="number" value={editingItem.amount} onChange={(e) => setEditingItem({ ...editingItem, amount: parseInt(e.target.value) || 0 })} /></div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Input value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} /></div>
                <div className="space-y-2"><Label>Payment Method</Label>
                  <Select value={editingItem.paymentMethod || ""} onValueChange={(v) => setEditingItem({ ...editingItem, paymentMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["Cash", "Mobile Money", "Bank Transfer", "Card", "Credit", "Cheque"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea value={editingItem.notes || ""} onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })} rows={2} /></div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateMutation.isPending}>{updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
