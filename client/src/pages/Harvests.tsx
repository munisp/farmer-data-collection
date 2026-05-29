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
import { harvests, crops } from "@/db/schema";
import { Plus, Loader2, TrendingUp, Search, BarChart3, WifiOff, Cloud, Pencil, Trash2, CheckSquare, Square, Download, DollarSign, Package } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SavedFilters } from "@/components/SavedFilters";
import { FilterAnalytics } from "@/components/FilterAnalytics";
import { eq } from "drizzle-orm";
import { useOfflineSync, useOnlineStatus } from "@/hooks/useOfflineSync";
import { trpc } from "@/lib/trpc";

interface Harvest {
  id: number;
  cropId: number;
  harvestDate: Date;
  quantity: string;
  unit: string;
  quality: string | null;
  storageLocation: string | null;
  marketPrice: number | null;
  soldQuantity: string | null;
  revenue: number | null;
  notes: string | null;
  createdAt: Date;
}

interface Crop { id: number; cropName: string; }

export default function Harvests() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const { saveHarvest: saveOfflineHarvest, status: offlineStatus } = useOfflineSync();
  const [harvestsList, setHarvestsList] = useState<Harvest[]>([]);
  const [cropsList, setCropsList] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Harvest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [cropFilter, setCropFilter] = useState("all");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [formData, setFormData] = useState({
    cropId: "", harvestDate: "", quantity: "", unit: "", quality: "",
    storageLocation: "", marketPrice: "", soldQuantity: "", revenue: "", notes: "",
  });

  const analyticsQuery = trpc.coreHarvests.getAnalytics.useQuery(
    {}, { enabled: activeTab === "analytics" }
  );

  const updateMutation = trpc.coreHarvests.update.useMutation({
    onSuccess: () => { toast.success("Harvest updated"); setEditOpen(false); setEditingItem(null); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.coreHarvests.delete.useMutation({
    onSuccess: () => { toast.success("Harvest deleted"); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  const batchDeleteMutation = trpc.coreHarvests.batchDelete.useMutation({
    onSuccess: (result) => { toast.success(`Deleted ${result.deleted} harvest(s)`); setSelectedIds([]); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => { if (isInitialized) fetchData(); }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [harvestsData, cropsData] = await Promise.all([
        db.select().from(harvests).where(eq(harvests.userId, Number(user.id))),
        db.select({ id: crops.id, cropName: crops.cropName }).from(crops).where(eq(crops.userId, Number(user.id))),
      ]);
      setHarvestsList(harvestsData as Harvest[]);
      setCropsList(cropsData as Crop[]);
    } catch (err) {
      console.error("Failed to fetch:", err);
      toast.error("Failed to load harvests");
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cropId || !formData.harvestDate || !formData.quantity || !formData.unit) {
      toast.error("Crop, date, quantity, and unit are required"); return;
    }
    try {
      setSubmitting(true);
      if (!user) { toast.error("Not authenticated"); return; }
      const values = {
        userId: user.id,
        cropId: parseInt(formData.cropId),
        harvestDate: new Date(formData.harvestDate),
        quantity: formData.quantity,
        unit: formData.unit,
        quality: formData.quality || null,
        storageLocation: formData.storageLocation || null,
        marketPrice: formData.marketPrice ? parseInt(formData.marketPrice) : null,
        soldQuantity: formData.soldQuantity || null,
        revenue: formData.revenue ? parseInt(formData.revenue) : null,
        notes: formData.notes || null,
      };
      if (!isOnline) {
        const cropName = cropsList.find(c => c.id === parseInt(formData.cropId))?.cropName || "Unknown";
        await saveOfflineHarvest({ ...values, cropType: cropName } as any);
        toast.success("Harvest saved offline — will sync when online");
      } else {
        await db.insert(harvests).values(values);
        toast.success("Harvest recorded");
      }
      setOpen(false);
      setFormData({ cropId: "", harvestDate: "", quantity: "", unit: "", quality: "", storageLocation: "", marketPrice: "", soldQuantity: "", revenue: "", notes: "" });
      fetchData();
    } catch (err) {
      console.error("Failed to add:", err);
      toast.error("Failed to record harvest");
    } finally { setSubmitting(false); }
  };

  const handleEdit = (item: Harvest) => { setEditingItem(item); setEditOpen(true); };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      quantity: editingItem.quantity,
      unit: editingItem.unit,
      quality: editingItem.quality as any || undefined,
      storageLocation: editingItem.storageLocation || undefined,
      marketPrice: editingItem.marketPrice || undefined,
      soldQuantity: editingItem.soldQuantity || undefined,
      revenue: editingItem.revenue || undefined,
      notes: editingItem.notes || undefined,
    });
  };

  const handleDelete = (item: Harvest) => {
    if (!confirm("Delete this harvest record?")) return;
    deleteMutation.mutate({ id: item.id });
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} harvest(s)?`)) return;
    batchDeleteMutation.mutate({ ids: selectedIds });
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const getCropName = (id: number) => cropsList.find(c => c.id === id)?.cropName || "Unknown";

  const qualityBadge = (q: string | null) => {
    const colors: Record<string, string> = { excellent: "bg-green-100 text-green-800", good: "bg-blue-100 text-blue-800", fair: "bg-yellow-100 text-yellow-800", poor: "bg-red-100 text-red-800" };
    return q ? <Badge className={colors[q] || "bg-gray-100"}>{q}</Badge> : <span className="text-muted-foreground">-</span>;
  };

  const handleExport = () => {
    const csv = ["Crop,Date,Quantity,Unit,Quality,Market Price,Sold,Revenue,Notes", ...filtered.map(h =>
      `"${getCropName(h.cropId)}","${new Date(h.harvestDate).toISOString().split('T')[0]}","${h.quantity}","${h.unit}","${h.quality || ''}","${h.marketPrice || ''}","${h.soldQuantity || ''}","${h.revenue || ''}","${(h.notes || '').replace(/"/g, '""')}"`
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "harvests.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV");
  };

  const filtered = useMemo(() => {
    return harvestsList.filter(h => {
      if (cropFilter !== "all" && h.cropId !== parseInt(cropFilter)) return false;
      if (dateRangeStart && new Date(h.harvestDate) < new Date(dateRangeStart)) return false;
      if (dateRangeEnd && new Date(h.harvestDate) > new Date(dateRangeEnd)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return getCropName(h.cropId).toLowerCase().includes(q) || (h.storageLocation && h.storageLocation.toLowerCase().includes(q));
      }
      return true;
    });
  }, [harvestsList, searchQuery, cropFilter, dateRangeStart, dateRangeEnd]);

  const totalQuantity = harvestsList.reduce((s, h) => s + parseFloat(h.quantity || "0"), 0);
  const totalRevenue = harvestsList.reduce((s, h) => s + (h.revenue || 0), 0);
  const totalSold = harvestsList.reduce((s, h) => s + parseFloat(h.soldQuantity || "0"), 0);
  const analytics = analyticsQuery.data;

  if (!isInitialized || loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Harvests</h1>
            <p className="text-muted-foreground mt-2">
              Record and analyze harvest data
              {!isOnline && <Badge variant="outline" className="ml-2"><WifiOff className="w-3 h-3 mr-1" />Offline</Badge>}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Record Harvest</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Harvest</DialogTitle>
                  <DialogDescription>Add a new harvest record</DialogDescription>
                </DialogHeader>
                <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Crop *</Label>
                    <Select value={formData.cropId} onValueChange={(v) => setFormData({ ...formData, cropId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select crop" /></SelectTrigger>
                      <SelectContent>{cropsList.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.cropName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Harvest Date *</Label><Input type="date" value={formData.harvestDate} onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Quality</Label>
                      <Select value={formData.quality} onValueChange={(v) => setFormData({ ...formData, quality: v })}>
                        <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
                        <SelectContent>{["excellent", "good", "fair", "poor"].map(q => <SelectItem key={q} value={q}>{q.charAt(0).toUpperCase() + q.slice(1)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Quantity *</Label><Input type="number" step="0.01" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
                    <div className="space-y-2"><Label>Unit *</Label>
                      <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                        <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                        <SelectContent>{["kg", "tonnes", "bags", "crates", "bundles", "litres"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Market Price</Label><Input type="number" value={formData.marketPrice} onChange={(e) => setFormData({ ...formData, marketPrice: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Sold Quantity</Label><Input type="number" step="0.01" value={formData.soldQuantity} onChange={(e) => setFormData({ ...formData, soldQuantity: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Revenue</Label><Input type="number" value={formData.revenue} onChange={(e) => setFormData({ ...formData, revenue: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Storage Location</Label><Input value={formData.storageLocation} onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Record Harvest"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Harvest List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Harvests</div><div className="text-2xl font-bold">{harvestsList.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Quantity</div><div className="text-2xl font-bold">{totalQuantity.toFixed(0)}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Revenue</div><div className="text-2xl font-bold text-green-600">{(totalRevenue / 100).toLocaleString()}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Sold</div><div className="text-2xl font-bold">{totalSold.toFixed(0)}</div></CardContent></Card>
            </div>

            {/* Filters */}
            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" aria-label="Search" placeholder="Search by crop or storage..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={cropFilter} onValueChange={setCropFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Crops</SelectItem>{cropsList.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.cropName}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" className="w-[140px]" value={dateRangeStart} onChange={(e) => setDateRangeStart(e.target.value)} placeholder="From" />
              <Input type="date" className="w-[140px]" value={dateRangeEnd} onChange={(e) => setDateRangeEnd(e.target.value)} placeholder="To" />
            </div>

            {/* Batch Actions */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">{selectedIds.length} selected</span>
                <Button variant="destructive" size="sm" onClick={handleBatchDelete}><Trash2 className="w-4 h-4 mr-1" />Delete Selected</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
              </div>
            )}

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>Harvest Records ({filtered.length})</CardTitle>
                <CardDescription>View and manage all harvest data</CardDescription>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No harvest records found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]"></TableHead>
                        <TableHead>Crop</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Quality</TableHead>
                        <TableHead>Market Price</TableHead>
                        <TableHead>Sold</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => toggleSelect(h.id)}>
                              {selectedIds.includes(h.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{getCropName(h.cropId)}</TableCell>
                          <TableCell>{new Date(h.harvestDate).toLocaleDateString()}</TableCell>
                          <TableCell>{h.quantity} {h.unit}</TableCell>
                          <TableCell>{qualityBadge(h.quality)}</TableCell>
                          <TableCell>{h.marketPrice ? (h.marketPrice / 100).toLocaleString() : "-"}</TableCell>
                          <TableCell>{h.soldQuantity || "-"}</TableCell>
                          <TableCell className="font-medium text-green-600">{h.revenue ? (h.revenue / 100).toLocaleString() : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(h)}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(h)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {showAnalytics && <FilterAnalytics storageKey="harvests-saved-filters" />}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {analyticsQuery.isLoading ? (
              <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : analytics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Package className="w-4 h-4" />Total Harvested</div><div className="text-2xl font-bold">{analytics.totalQuantity.toFixed(0)}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Total Revenue</div><div className="text-2xl font-bold text-green-600">{analytics.totalRevenue.toLocaleString()}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />Quality Score</div><div className="text-2xl font-bold">{analytics.qualityScore.toFixed(0)}%</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><BarChart3 className="w-4 h-4" />Total Sold</div><div className="text-2xl font-bold">{analytics.totalSold.toFixed(0)}</div></CardContent></Card>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Yield by Crop</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow><TableHead>Crop</TableHead><TableHead>Harvests</TableHead><TableHead>Quantity</TableHead><TableHead>Revenue</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {analytics.yieldByCrop.map((y, i) => (
                            <TableRow key={i}><TableCell className="font-medium">{y.cropName}</TableCell><TableCell>{y.harvestCount}</TableCell><TableCell>{y.totalQuantity.toFixed(0)}</TableCell><TableCell className="text-green-600">{y.totalRevenue.toLocaleString()}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Quality Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.qualityDistribution.map((q, i) => (
                          <div key={i} className="flex items-center justify-between">{qualityBadge(q.quality)}<span className="font-medium">{q.count} records ({q.totalQuantity.toFixed(0)} units)</span></div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader><CardTitle>Monthly Harvest Trend</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.monthlyTrend.map((m, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{m.month}</span>
                          <div className="flex items-center gap-6">
                            <span>{m.harvestCount} harvests</span><span>{m.totalQuantity.toFixed(0)} units</span><span className="font-medium text-green-600">{m.totalRevenue.toLocaleString()}</span>
                          </div>
                        </div>
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
            <DialogHeader><DialogTitle>Edit Harvest</DialogTitle><DialogDescription>Update harvest record</DialogDescription></DialogHeader>
            {editingItem && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity</Label><Input value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input value={editingItem.unit} onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quality</Label>
                    <Select value={editingItem.quality || ""} onValueChange={(v) => setEditingItem({ ...editingItem, quality: v })}>
                      <SelectTrigger><SelectValue placeholder="Grade" /></SelectTrigger>
                      <SelectContent>{["excellent", "good", "fair", "poor"].map(q => <SelectItem key={q} value={q}>{q.charAt(0).toUpperCase() + q.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Market Price</Label><Input type="number" value={editingItem.marketPrice || ""} onChange={(e) => setEditingItem({ ...editingItem, marketPrice: parseInt(e.target.value) || null })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Sold Qty</Label><Input value={editingItem.soldQuantity || ""} onChange={(e) => setEditingItem({ ...editingItem, soldQuantity: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Revenue</Label><Input type="number" value={editingItem.revenue || ""} onChange={(e) => setEditingItem({ ...editingItem, revenue: parseInt(e.target.value) || null })} /></div>
                </div>
                <div className="space-y-2"><Label>Storage</Label><Input value={editingItem.storageLocation || ""} onChange={(e) => setEditingItem({ ...editingItem, storageLocation: e.target.value })} /></div>
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
