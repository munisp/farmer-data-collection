import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { farmInputs, farms, crops } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Plus, Loader2, Search, Pencil, Trash2, Package, DollarSign, TrendingUp, Calendar, Droplets } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

interface FarmInput {
  id: number; farmId: number; cropId: number | null; inputType: string; inputName: string;
  quantity: string; unit: string; costPerUnit: number | null; totalCost: number | null;
  supplier: string | null; purchaseDate: Date | null; applicationDate: Date | null;
  notes: string | null; createdAt: Date;
}
interface Farm { id: number; farmName: string; }
interface Crop { id: number; cropName: string; }

export default function FarmInputs() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [items, setItems] = useState<FarmInput[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [cropsList, setCropsList] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FarmInput | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [formData, setFormData] = useState({
    farmId: "", cropId: "", inputType: "", inputName: "", quantity: "", unit: "",
    costPerUnit: "", totalCost: "", supplier: "", purchaseDate: "", applicationDate: "", notes: "",
  });

  const analyticsQuery = trpc.coreFarmInputs.getAnalytics.useQuery({}, { enabled: activeTab === "analytics" });

  const updateMutation = trpc.coreFarmInputs.update.useMutation({
    onSuccess: () => { toast.success("Input updated"); setEditOpen(false); setEditingItem(null); fetchData(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.coreFarmInputs.delete.useMutation({
    onSuccess: () => { toast.success("Input deleted"); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => { if (isInitialized) fetchData(); }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [inputsData, farmsData, cropsData] = await Promise.all([
        db.select().from(farmInputs).where(eq(farmInputs.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
        db.select({ id: crops.id, cropName: crops.cropName }).from(crops).where(eq(crops.userId, Number(user.id))),
      ]);
      setItems(inputsData as FarmInput[]);
      setFarmsList(farmsData as Farm[]);
      setCropsList(cropsData as Crop[]);
    } catch (err) { toast.error("Failed to load farm inputs"); } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.inputType || !formData.inputName || !formData.quantity || !formData.unit) {
      toast.error("Farm, input type, name, quantity, and unit are required"); return;
    }
    try {
      setSubmitting(true);
      if (!user) { toast.error("Not authenticated"); return; }
      await db.insert(farmInputs).values({
        userId: user.id, farmId: parseInt(formData.farmId),
        cropId: formData.cropId ? parseInt(formData.cropId) : null,
        inputType: formData.inputType, inputName: formData.inputName,
        quantity: formData.quantity, unit: formData.unit,
        costPerUnit: formData.costPerUnit ? parseInt(formData.costPerUnit) : null,
        totalCost: formData.totalCost ? parseInt(formData.totalCost) : null,
        supplier: formData.supplier || null,
        purchaseDate: formData.purchaseDate ? new Date(formData.purchaseDate) : null,
        applicationDate: formData.applicationDate ? new Date(formData.applicationDate) : null,
        notes: formData.notes || null,
      });
      toast.success("Farm input added");
      setOpen(false);
      setFormData({ farmId: "", cropId: "", inputType: "", inputName: "", quantity: "", unit: "", costPerUnit: "", totalCost: "", supplier: "", purchaseDate: "", applicationDate: "", notes: "" });
      fetchData();
    } catch (err) { toast.error("Failed to add input"); } finally { setSubmitting(false); }
  };

  const handleEdit = (item: FarmInput) => { setEditingItem(item); setEditOpen(true); };
  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id, inputName: editingItem.inputName,
      quantity: editingItem.quantity, unit: editingItem.unit,
      costPerUnit: editingItem.costPerUnit || undefined, totalCost: editingItem.totalCost || undefined,
      supplier: editingItem.supplier || undefined, notes: editingItem.notes || undefined,
    });
  };
  const handleDelete = (item: FarmInput) => { if (confirm(`Delete "${item.inputName}"?`)) deleteMutation.mutate({ id: item.id }); };

  const getFarmName = (id: number) => farmsList.find(f => f.id === id)?.farmName || "Unknown";
  const getCropName = (id: number | null) => id ? cropsList.find(c => c.id === id)?.cropName || "Unknown" : "-";
  const inputTypes = useMemo(() => [...new Set(items.map(i => i.inputType))], [items]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (typeFilter !== "all" && i.inputType !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return i.inputName.toLowerCase().includes(q) || i.inputType.toLowerCase().includes(q) || (i.supplier && i.supplier.toLowerCase().includes(q));
      }
      return true;
    });
  }, [items, searchQuery, typeFilter]);

  const totalCost = items.reduce((s, i) => s + (i.totalCost || 0), 0);
  const pendingApplications = items.filter(i => i.applicationDate === null).length;
  const analytics = analyticsQuery.data;

  if (!isInitialized || loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Farm Inputs</h1>
            <p className="text-muted-foreground mt-2">Manage seeds, fertilizers, pesticides, and other inputs</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Input</Button></DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Farm Input</DialogTitle><DialogDescription>Record a new farm input purchase</DialogDescription></DialogHeader>
              <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Farm *</Label>
                  <Select value={formData.farmId} onValueChange={(v) => setFormData({ ...formData, farmId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select farm" /></SelectTrigger>
                    <SelectContent>{farmsList.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.farmName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Input Type *</Label>
                    <Select value={formData.inputType} onValueChange={(v) => setFormData({ ...formData, inputType: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Seeds", "Fertilizer", "Pesticide", "Herbicide", "Fungicide", "Growth Regulator", "Soil Amendment", "Water", "Fuel", "Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Input Name *</Label><Input value={formData.inputName} onChange={(e) => setFormData({ ...formData, inputName: e.target.value })} placeholder="e.g., NPK 15-15-15" required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity *</Label><Input type="number" step="0.01" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Unit *</Label>
                    <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["kg", "litres", "bags", "packets", "tonnes", "gallons", "units"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Cost per Unit</Label><Input type="number" value={formData.costPerUnit} onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Total Cost</Label><Input type="number" value={formData.totalCost} onChange={(e) => setFormData({ ...formData, totalCost: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Supplier</Label><Input value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Linked Crop</Label>
                    <Select value={formData.cropId} onValueChange={(v) => setFormData({ ...formData, cropId: v })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent><SelectItem value="">None</SelectItem>{cropsList.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.cropName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Purchase Date</Label><Input type="date" value={formData.purchaseDate} onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Application Date</Label><Input type="date" value={formData.applicationDate} onChange={(e) => setFormData({ ...formData, applicationDate: e.target.value })} /></div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add Input"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="list">Input List</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Inputs</div><div className="text-2xl font-bold">{items.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Cost</div><div className="text-2xl font-bold text-red-600">{(totalCost / 100).toLocaleString()}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Input Types</div><div className="text-2xl font-bold">{inputTypes.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-1 text-sm text-muted-foreground"><Calendar className="w-3 h-3" />Pending Apply</div><div className="text-2xl font-bold text-yellow-600">{pendingApplications}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-10" aria-label="Search" placeholder="Search by name, type, or supplier..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
              <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Types</SelectItem>{inputTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            </div>

            <Card>
              <CardHeader><CardTitle>Farm Input Records ({filtered.length})</CardTitle></CardHeader>
              <CardContent>
                {filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">No farm inputs found</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Type</TableHead><TableHead>Name</TableHead><TableHead>Farm</TableHead><TableHead>Crop</TableHead><TableHead>Qty</TableHead><TableHead>Cost</TableHead><TableHead>Supplier</TableHead><TableHead>Applied</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filtered.map(item => (
                        <TableRow key={item.id}>
                          <TableCell><Badge variant="outline">{item.inputType}</Badge></TableCell>
                          <TableCell className="font-medium">{item.inputName}</TableCell>
                          <TableCell>{getFarmName(item.farmId)}</TableCell>
                          <TableCell>{getCropName(item.cropId)}</TableCell>
                          <TableCell>{item.quantity} {item.unit}</TableCell>
                          <TableCell>{item.totalCost ? (item.totalCost / 100).toLocaleString() : "-"}</TableCell>
                          <TableCell>{item.supplier || "-"}</TableCell>
                          <TableCell>{item.applicationDate ? <Badge className="bg-green-100 text-green-800">Applied</Badge> : <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(item)}><Trash2 className="w-4 h-4" /></Button>
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
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Package className="w-4 h-4" />Total Inputs</div><div className="text-2xl font-bold">{analytics.totalInputs}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Total Spend</div><div className="text-2xl font-bold text-red-600">{analytics.totalCost.toLocaleString()}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Droplets className="w-4 h-4" />Suppliers</div><div className="text-2xl font-bold">{analytics.supplierBreakdown.length}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="w-4 h-4" />Pending Apply</div><div className="text-2xl font-bold text-yellow-600">{analytics.pendingApplications}</div></CardContent></Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Cost by Input Type</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.costByType.map((c, i) => (
                          <div key={i} className="flex items-center justify-between"><Badge variant="outline">{c.inputType}</Badge><div className="text-right"><div className="font-medium text-red-600">{c.totalCost.toLocaleString()}</div><div className="text-xs text-muted-foreground">{c.count} items, avg {(c.totalCost / (c.count || 1)).toFixed(0)}</div></div></div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Supplier Breakdown</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.supplierBreakdown.map((s, i) => (
                          <div key={i} className="flex items-center justify-between"><span className="font-medium">{s.supplier}</span><div className="text-right"><div className="font-medium">{s.totalCost.toLocaleString()}</div><div className="text-xs text-muted-foreground">{s.count} orders</div></div></div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>Monthly Spend Trend</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.monthlySpend.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{m.month}</span><div className="flex items-center gap-4"><span>{m.count} purchases</span><span className="font-medium text-red-600">{m.totalCost.toLocaleString()}</span></div></div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : <Card><CardContent className="p-8 text-center text-muted-foreground">No analytics available</CardContent></Card>}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Farm Input</DialogTitle></DialogHeader>
            {editingItem && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2"><Label>Input Name</Label><Input value={editingItem.inputName} onChange={(e) => setEditingItem({ ...editingItem, inputName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity</Label><Input value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input value={editingItem.unit} onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Cost per Unit</Label><Input type="number" value={editingItem.costPerUnit || ""} onChange={(e) => setEditingItem({ ...editingItem, costPerUnit: parseInt(e.target.value) || null })} /></div>
                  <div className="space-y-2"><Label>Total Cost</Label><Input type="number" value={editingItem.totalCost || ""} onChange={(e) => setEditingItem({ ...editingItem, totalCost: parseInt(e.target.value) || null })} /></div>
                </div>
                <div className="space-y-2"><Label>Supplier</Label><Input value={editingItem.supplier || ""} onChange={(e) => setEditingItem({ ...editingItem, supplier: e.target.value })} /></div>
                <div className="space-y-2"><Label>Notes</Label><Input value={editingItem.notes || ""} onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })} /></div>
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
