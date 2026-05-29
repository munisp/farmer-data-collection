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
import { crops, farms } from "@/db/schema";
import { Plus, Loader2, Sprout, Trash2, Download, CheckSquare, Square, Search, BarChart3, Pencil, Calendar, DollarSign, TrendingUp, Leaf } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SavedFilters } from "@/components/SavedFilters";
import { FilterAnalytics } from "@/components/FilterAnalytics";
import { eq } from "drizzle-orm";
import { DataPagination } from "@/components/DataPagination";
import { trpc } from "@/lib/trpc";

interface CropItem {
  id: number; farmId: number; cropName: string; variety: string | null;
  plantingDate: Date | null; expectedHarvestDate: Date | null; actualArea: string | null;
  areaUnit: string | null; status: string | null; pricePerUnit: number | null;
  estimatedYield: string | null; notes: string | null; createdAt: Date;
}
interface Farm { id: number; farmName: string; }

export default function Crops() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [cropsList, setCropsList] = useState<CropItem[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CropItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [formData, setFormData] = useState({
    farmId: "", cropName: "", variety: "", plantingDate: "", expectedHarvestDate: "",
    actualArea: "", areaUnit: "acres", status: "planted", pricePerUnit: "", estimatedYield: "", notes: "",
  });

  const analyticsQuery = trpc.coreCrops.getAnalytics.useQuery({}, { enabled: activeTab === "analytics" });

  const updateMutation = trpc.coreCrops.update.useMutation({
    onSuccess: () => { toast.success("Crop updated"); setEditOpen(false); setEditingItem(null); fetchData(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.coreCrops.delete.useMutation({
    onSuccess: () => { toast.success("Crop deleted"); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => { if (isInitialized) fetchData(); }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setSelectedIds([]);
      const [cropsData, farmsData] = await Promise.all([
        db.select().from(crops).where(eq(crops.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
      ]);
      setCropsList(cropsData as CropItem[]);
      setFarmsList(farmsData as Farm[]);
    } catch (err) { toast.error("Failed to load crops"); } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.cropName) { toast.error("Farm and crop name are required"); return; }
    try {
      setSubmitting(true);
      if (!user) { toast.error("Not authenticated"); return; }
      await db.insert(crops).values({
        userId: user.id, farmId: parseInt(formData.farmId), cropName: formData.cropName,
        variety: formData.variety || null,
        plantingDate: formData.plantingDate ? new Date(formData.plantingDate) : null,
        expectedHarvestDate: formData.expectedHarvestDate ? new Date(formData.expectedHarvestDate) : null,
        actualArea: formData.actualArea || null, areaUnit: formData.areaUnit || "acres",
        status: formData.status || "planted",
        pricePerUnit: formData.pricePerUnit ? parseInt(formData.pricePerUnit) : null,
        estimatedYield: formData.estimatedYield || null, notes: formData.notes || null,
      });
      toast.success("Crop added");
      setOpen(false);
      setFormData({ farmId: "", cropName: "", variety: "", plantingDate: "", expectedHarvestDate: "", actualArea: "", areaUnit: "acres", status: "planted", pricePerUnit: "", estimatedYield: "", notes: "" });
      fetchData();
    } catch (err) { toast.error("Failed to add crop"); } finally { setSubmitting(false); }
  };

  const handleEdit = (item: CropItem) => { setEditingItem(item); setEditOpen(true); };
  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id, cropName: editingItem.cropName, cropVariety: editingItem.variety || undefined,
      areaPlanted: editingItem.actualArea || undefined, areaUnit: editingItem.areaUnit || undefined,
      status: editingItem.status as any || undefined, pricePerUnit: editingItem.pricePerUnit || undefined,
      notes: editingItem.notes || undefined,
    });
  };
  const handleDelete = (item: CropItem) => { if (confirm(`Delete "${item.cropName}"?`)) deleteMutation.mutate({ id: item.id }); };
  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} crop(s)?`)) return;
    selectedIds.forEach(id => deleteMutation.mutate({ id }));
    setSelectedIds([]);
  };
  const toggleSelect = (id: number) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const getFarmName = (id: number) => farmsList.find(f => f.id === id)?.farmName || "Unknown";

  const statusBadge = (s: string | null) => {
    const colors: Record<string, string> = {
      planted: "bg-blue-100 text-blue-800", growing: "bg-green-100 text-green-800",
      flowering: "bg-purple-100 text-purple-800", fruiting: "bg-orange-100 text-orange-800",
      harvested: "bg-gray-100 text-gray-800", failed: "bg-red-100 text-red-800",
    };
    return <Badge className={colors[s || "planted"] || "bg-gray-100"}>{s || "planted"}</Badge>;
  };

  const handleExport = () => {
    const csv = ["Farm,Crop,Variety,Status,Area,Planting Date,Expected Harvest,Est. Yield,Price/Unit", ...cropsList.map(c =>
      `"${getFarmName(c.farmId)}","${c.cropName}","${c.variety || ''}","${c.status || ''}","${c.actualArea || ''} ${c.areaUnit || ''}","${c.plantingDate ? new Date(c.plantingDate).toISOString().split('T')[0] : ''}","${c.expectedHarvestDate ? new Date(c.expectedHarvestDate).toISOString().split('T')[0] : ''}","${c.estimatedYield || ''}","${c.pricePerUnit || ''}"`
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crops.csv"; a.click();
    toast.success("Exported to CSV");
  };

  const filtered = useMemo(() => {
    return cropsList.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return c.cropName.toLowerCase().includes(q) || (c.variety && c.variety.toLowerCase().includes(q));
      }
      return true;
    });
  }, [cropsList, searchQuery, statusFilter]);

  const totalArea = cropsList.reduce((s, c) => s + (parseFloat(c.actualArea || "0") || 0), 0);
  const analytics = analyticsQuery.data;
  const statuses = useMemo(() => [...new Set(cropsList.map(c => c.status).filter(Boolean))], [cropsList]);

  if (!isInitialized || loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Crops</h1>
            <p className="text-muted-foreground mt-2">Manage crop cultivation, track growth stages, and analyze performance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Crop</Button></DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add Crop</DialogTitle><DialogDescription>Register a new crop cultivation</DialogDescription></DialogHeader>
                <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2"><Label>Farm *</Label>
                    <Select value={formData.farmId} onValueChange={(v) => setFormData({ ...formData, farmId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select farm" /></SelectTrigger>
                      <SelectContent>{farmsList.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.farmName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Crop Name *</Label><Input value={formData.cropName} onChange={(e) => setFormData({ ...formData, cropName: e.target.value })} placeholder="e.g., Maize" required /></div>
                    <div className="space-y-2"><Label>Variety</Label><Input value={formData.variety} onChange={(e) => setFormData({ ...formData, variety: e.target.value })} placeholder="e.g., DUMA 43" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Planting Date</Label><Input type="date" value={formData.plantingDate} onChange={(e) => setFormData({ ...formData, plantingDate: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Expected Harvest</Label><Input type="date" value={formData.expectedHarvestDate} onChange={(e) => setFormData({ ...formData, expectedHarvestDate: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Area</Label><Input type="number" step="0.01" value={formData.actualArea} onChange={(e) => setFormData({ ...formData, actualArea: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Status</Label>
                      <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["planted", "growing", "flowering", "fruiting", "harvested", "failed"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Price per Unit</Label><Input type="number" value={formData.pricePerUnit} onChange={(e) => setFormData({ ...formData, pricePerUnit: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Estimated Yield</Label><Input value={formData.estimatedYield} onChange={(e) => setFormData({ ...formData, estimatedYield: e.target.value })} placeholder="e.g., 2000 kg" /></div>
                  </div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={submitting}>{submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add Crop"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="list">Crop List</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Crops</div><div className="text-2xl font-bold">{cropsList.length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Total Area</div><div className="text-2xl font-bold">{totalArea.toFixed(1)} acres</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Growing</div><div className="text-2xl font-bold text-green-600">{cropsList.filter(c => c.status === "growing" || c.status === "flowering" || c.status === "fruiting").length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Varieties</div><div className="text-2xl font-bold">{new Set(cropsList.map(c => c.cropName)).size}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-10" aria-label="Search" placeholder="Search crops..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{statuses.map(s => <SelectItem key={s!} value={s!}>{s!.charAt(0).toUpperCase() + s!.slice(1)}</SelectItem>)}</SelectContent></Select>
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium">{selectedIds.length} selected</span>
                <Button variant="destructive" size="sm" onClick={handleBatchDelete}><Trash2 className="w-4 h-4 mr-1" />Delete Selected</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle>Crop Records ({filtered.length})</CardTitle></CardHeader>
              <CardContent>
                {filtered.length === 0 ? <p className="text-center text-muted-foreground py-8">No crops found</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-[40px]"></TableHead><TableHead>Crop</TableHead><TableHead>Variety</TableHead><TableHead>Farm</TableHead><TableHead>Status</TableHead><TableHead>Area</TableHead><TableHead>Planted</TableHead><TableHead>Expected Harvest</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(c => (
                        <TableRow key={c.id}>
                          <TableCell><Button variant="ghost" size="icon" onClick={() => toggleSelect(c.id)}>{selectedIds.includes(c.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}</Button></TableCell>
                          <TableCell className="font-medium"><Sprout className="w-4 h-4 inline mr-1" />{c.cropName}</TableCell>
                          <TableCell>{c.variety || "-"}</TableCell>
                          <TableCell>{getFarmName(c.farmId)}</TableCell>
                          <TableCell>{statusBadge(c.status)}</TableCell>
                          <TableCell>{c.actualArea ? `${c.actualArea} ${c.areaUnit}` : "-"}</TableCell>
                          <TableCell>{c.plantingDate ? new Date(c.plantingDate).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>{c.expectedHarvestDate ? new Date(c.expectedHarvestDate).toLocaleDateString() : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(c)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {filtered.length > pageSize && (
                  <DataPagination currentPage={currentPage} totalPages={Math.ceil(filtered.length / pageSize)} pageSize={pageSize} totalItems={filtered.length} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {analyticsQuery.isLoading ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : analytics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Sprout className="w-4 h-4" />Varieties</div><div className="text-2xl font-bold">{analytics.varietyPerformance.length}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Leaf className="w-4 h-4" />Top Crops</div><div className="text-2xl font-bold text-green-600">{analytics.topCrops.length}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Statuses</div><div className="text-2xl font-bold">{analytics.statusDistribution.length}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />Seasons</div><div className="text-2xl font-bold">{analytics.seasonalYield.length}</div></CardContent></Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Variety Performance</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow><TableHead>Crop</TableHead><TableHead>Planted</TableHead><TableHead>Area</TableHead><TableHead>Harvested</TableHead><TableHead>Avg Price</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {analytics.varietyPerformance.map((v, i) => (
                            <TableRow key={i}><TableCell className="font-medium">{v.cropName}</TableCell><TableCell>{v.totalPlanted}</TableCell><TableCell>{v.totalArea.toFixed(1)}</TableCell><TableCell>{v.harvestedCount}</TableCell><TableCell>{v.avgPricePerUnit.toFixed(0)}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.statusDistribution.map((s, i) => (
                          <div key={i} className="flex items-center justify-between">{statusBadge(s.status)}<span className="font-medium">{s.count} crops</span></div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>Seasonal Yield Tracking</CardTitle></CardHeader>
                  <CardContent>
                    {analytics.seasonalYield.length === 0 ? <p className="text-muted-foreground">No seasonal data available</p> : (
                      <div className="space-y-2">
                        {analytics.seasonalYield.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{s.season}</span><div className="flex items-center gap-4"><span>{s.cropCount} crops</span><span className="text-green-600">{s.totalArea.toFixed(1)} acres</span></div></div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : <Card><CardContent className="p-8 text-center text-muted-foreground">No analytics available</CardContent></Card>}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Crop</DialogTitle></DialogHeader>
            {editingItem && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Crop Name</Label><Input value={editingItem.cropName} onChange={(e) => setEditingItem({ ...editingItem, cropName: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Variety</Label><Input value={editingItem.variety || ""} onChange={(e) => setEditingItem({ ...editingItem, variety: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Area</Label><Input type="number" step="0.01" value={editingItem.actualArea || ""} onChange={(e) => setEditingItem({ ...editingItem, actualArea: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Status</Label>
                    <Select value={editingItem.status || "planted"} onValueChange={(v) => setEditingItem({ ...editingItem, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["planted", "growing", "flowering", "fruiting", "harvested", "failed"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Price per Unit</Label><Input type="number" value={editingItem.pricePerUnit || ""} onChange={(e) => setEditingItem({ ...editingItem, pricePerUnit: parseInt(e.target.value) || null })} /></div>
                  <div className="space-y-2"><Label>Estimated Yield</Label><Input value={editingItem.estimatedYield || ""} onChange={(e) => setEditingItem({ ...editingItem, estimatedYield: e.target.value })} /></div>
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
