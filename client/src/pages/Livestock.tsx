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
import { livestock, farms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Plus, Loader2, Search, Pencil, Trash2, Heart, TrendingUp, PieChart, DollarSign, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

interface LivestockItem {
  id: number;
  farmId: number;
  animalType: string;
  breed: string | null;
  quantity: number;
  purpose: string | null;
  acquisitionDate: Date | null;
  acquisitionCost: number | null;
  currentValue: number | null;
  healthStatus: string | null;
  notes: string | null;
  createdAt: Date;
}

interface Farm { id: number; farmName: string; }

export default function Livestock() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [items, setItems] = useState<LivestockItem[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LivestockItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");

  const [formData, setFormData] = useState({
    farmId: "", animalType: "", breed: "", quantity: "1", purpose: "",
    acquisitionDate: "", acquisitionCost: "", currentValue: "", healthStatus: "healthy", notes: "",
  });

  const analyticsQuery = trpc.coreLivestock.getAnalytics.useQuery(
    {}, { enabled: activeTab === "analytics" }
  );

  const updateMutation = trpc.coreLivestock.update.useMutation({
    onSuccess: () => { toast.success("Livestock updated"); setEditOpen(false); setEditingItem(null); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.coreLivestock.delete.useMutation({
    onSuccess: () => { toast.success("Livestock deleted"); fetchData(); },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => { if (isInitialized) fetchData(); }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [livestockData, farmsData] = await Promise.all([
        db.select().from(livestock).where(eq(livestock.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
      ]);
      setItems(livestockData as LivestockItem[]);
      setFarmsList(farmsData as Farm[]);
    } catch (err) {
      console.error("Failed to fetch:", err);
      toast.error("Failed to load livestock");
    } finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmId || !formData.animalType || !formData.quantity) {
      toast.error("Farm, animal type, and quantity are required"); return;
    }
    try {
      setSubmitting(true);
      if (!user) { toast.error("Not authenticated"); return; }
      await db.insert(livestock).values({
        userId: user.id,
        farmId: parseInt(formData.farmId),
        animalType: formData.animalType,
        breed: formData.breed || null,
        quantity: parseInt(formData.quantity),
        purpose: formData.purpose || null,
        acquisitionDate: formData.acquisitionDate ? new Date(formData.acquisitionDate) : null,
        acquisitionCost: formData.acquisitionCost ? parseInt(formData.acquisitionCost) : null,
        currentValue: formData.currentValue ? parseInt(formData.currentValue) : null,
        healthStatus: formData.healthStatus || "healthy",
        notes: formData.notes || null,
      });
      toast.success("Livestock added");
      setOpen(false);
      setFormData({ farmId: "", animalType: "", breed: "", quantity: "1", purpose: "", acquisitionDate: "", acquisitionCost: "", currentValue: "", healthStatus: "healthy", notes: "" });
      fetchData();
    } catch (err) {
      console.error("Failed to add:", err);
      toast.error("Failed to add livestock");
    } finally { setSubmitting(false); }
  };

  const handleEdit = (item: LivestockItem) => { setEditingItem(item); setEditOpen(true); };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      animalType: editingItem.animalType,
      breed: editingItem.breed || undefined,
      quantity: editingItem.quantity,
      purpose: editingItem.purpose || undefined,
      acquisitionCost: editingItem.acquisitionCost || undefined,
      currentValue: editingItem.currentValue || undefined,
      healthStatus: editingItem.healthStatus as any || undefined,
      notes: editingItem.notes || undefined,
    });
  };

  const handleDelete = (item: LivestockItem) => {
    if (!confirm(`Delete ${item.quantity} ${item.animalType}? This cannot be undone.`)) return;
    deleteMutation.mutate({ id: item.id });
  };

  const getFarmName = (id: number) => farmsList.find(f => f.id === id)?.farmName || "Unknown";

  const healthBadge = (status: string | null) => {
    const colors: Record<string, string> = {
      healthy: "bg-green-100 text-green-800", sick: "bg-red-100 text-red-800",
      recovering: "bg-yellow-100 text-yellow-800", quarantined: "bg-purple-100 text-purple-800",
      deceased: "bg-gray-100 text-gray-800",
    };
    return <Badge className={colors[status || "healthy"] || "bg-gray-100"}>{status || "healthy"}</Badge>;
  };

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (typeFilter !== "all" && i.animalType !== typeFilter) return false;
      if (healthFilter !== "all" && i.healthStatus !== healthFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return i.animalType.toLowerCase().includes(q) || (i.breed && i.breed.toLowerCase().includes(q));
      }
      return true;
    });
  }, [items, searchQuery, typeFilter, healthFilter]);

  const animalTypes = useMemo(() => [...new Set(items.map(i => i.animalType))], [items]);
  const totalAnimals = items.reduce((s, i) => s + i.quantity, 0);
  const totalValue = items.reduce((s, i) => s + (i.currentValue || 0), 0);
  const healthyCount = items.filter(i => i.healthStatus === "healthy").reduce((s, i) => s + i.quantity, 0);
  const sickCount = items.filter(i => i.healthStatus === "sick").reduce((s, i) => s + i.quantity, 0);
  const analytics = analyticsQuery.data;

  if (!isInitialized || loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-96"><Loader2 className="w-12 h-12 animate-spin text-primary" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Livestock</h1>
            <p className="text-muted-foreground mt-2">Manage livestock records, health tracking, and analytics</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={farmsList.length === 0}><Plus className="w-4 h-4 mr-2" />Add Livestock</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Livestock</DialogTitle>
                <DialogDescription>Record new livestock on your farm</DialogDescription>
              </DialogHeader>
              <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Farm *</Label>
                  <Select value={formData.farmId} onValueChange={(v) => setFormData({ ...formData, farmId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select farm" /></SelectTrigger>
                    <SelectContent>
                      {farmsList.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.farmName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Animal Type *</Label>
                    <Select value={formData.animalType} onValueChange={(v) => setFormData({ ...formData, animalType: v })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {["Cattle", "Goats", "Sheep", "Poultry", "Pigs", "Rabbits", "Fish", "Bees", "Donkeys", "Camels"].map(t =>
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Breed</Label>
                    <Input value={formData.breed} onChange={(e) => setFormData({ ...formData, breed: e.target.value })} placeholder="e.g., Friesian" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Select value={formData.purpose} onValueChange={(v) => setFormData({ ...formData, purpose: v })}>
                      <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                      <SelectContent>
                        {["Dairy", "Meat", "Breeding", "Eggs", "Wool", "Draft", "Honey", "Dual Purpose"].map(p =>
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Acquisition Cost</Label>
                    <Input type="number" value={formData.acquisitionCost} onChange={(e) => setFormData({ ...formData, acquisitionCost: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Current Value</Label>
                    <Input type="number" value={formData.currentValue} onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Acquisition Date</Label>
                    <Input type="date" value={formData.acquisitionDate} onChange={(e) => setFormData({ ...formData, acquisitionDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Health Status</Label>
                    <Select value={formData.healthStatus} onValueChange={(v) => setFormData({ ...formData, healthStatus: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["healthy", "sick", "recovering", "quarantined"].map(s =>
                          <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add Livestock"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Livestock List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Records</div>
                <div className="text-2xl font-bold">{items.length}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Animals</div>
                <div className="text-2xl font-bold">{totalAnimals}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total Value</div>
                <div className="text-2xl font-bold text-green-600">{(totalValue / 100).toLocaleString()}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-1 text-sm text-muted-foreground"><Heart className="w-3 h-3 text-green-500" />Healthy</div>
                <div className="text-2xl font-bold text-green-600">{healthyCount}</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="flex items-center gap-1 text-sm text-muted-foreground"><AlertTriangle className="w-3 h-3 text-red-500" />Sick</div>
                <div className="text-2xl font-bold text-red-600">{sickCount}</div>
              </CardContent></Card>
            </div>

            {/* Search & Filters */}
            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" aria-label="Search" placeholder="Search by animal type or breed..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {animalTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={healthFilter} onValueChange={setHealthFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Health</SelectItem>
                  {["healthy", "sick", "recovering", "quarantined", "deceased"].map(s =>
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>Livestock Records ({filtered.length})</CardTitle>
                <CardDescription>View and manage all livestock</CardDescription>
              </CardHeader>
              <CardContent>
                {filtered.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No livestock records found</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Animal Type</TableHead>
                        <TableHead>Breed</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Farm</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>Health</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.animalType}</TableCell>
                          <TableCell>{item.breed || "-"}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{getFarmName(item.farmId)}</TableCell>
                          <TableCell>{item.purpose ? <Badge variant="outline">{item.purpose}</Badge> : "-"}</TableCell>
                          <TableCell>{healthBadge(item.healthStatus)}</TableCell>
                          <TableCell>{item.currentValue ? (item.currentValue / 100).toLocaleString() : "-"}</TableCell>
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
            {analyticsQuery.isLoading ? (
              <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : analytics ? (
              <>
                {/* Overview Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card><CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><PieChart className="w-4 h-4" />Total Animals</div>
                    <div className="text-2xl font-bold">{analytics.totalAnimals}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Current Value</div>
                    <div className="text-2xl font-bold text-green-600">{analytics.totalCurrentValue.toLocaleString()}</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />Appreciation</div>
                    <div className={`text-2xl font-bold ${analytics.valueAppreciation >= 0 ? "text-green-600" : "text-red-600"}`}>{analytics.valueAppreciation.toFixed(1)}%</div>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><Heart className="w-4 h-4" />Healthy %</div>
                    <div className="text-2xl font-bold">{analytics.healthyPercentage.toFixed(0)}%</div>
                  </CardContent></Card>
                </div>

                {/* Herd Composition */}
                <Card>
                  <CardHeader><CardTitle>Herd Composition</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Animal Type</TableHead>
                          <TableHead>Total Count</TableHead>
                          <TableHead>Breeds</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.herdComposition.map((h, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{h.animalType}</TableCell>
                            <TableCell>{h.totalCount}</TableCell>
                            <TableCell>{h.breeds}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Health & Valuation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Health Distribution</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.healthDistribution.map((h, i) => (
                          <div key={i} className="flex items-center justify-between">
                            {healthBadge(h.status)}
                            <span className="font-medium">{h.totalAnimals} animals ({h.count} records)</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Valuation by Type</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analytics.valuationByType.map((v, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="font-medium">{v.animalType}</span>
                            <div className="text-right">
                              <div className="text-green-600">{v.currentValue.toLocaleString()}</div>
                              <div className="text-xs text-muted-foreground">Avg: {v.avgValuePerUnit.toLocaleString()}/unit</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Purpose Breakdown */}
                <Card>
                  <CardHeader><CardTitle>Purpose Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4">
                      {analytics.purposeBreakdown.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
                          <span className="font-medium">{p.purpose}</span>
                          <Badge>{p.totalCount}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Failed to load analytics</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Livestock</DialogTitle>
              <DialogDescription>Update livestock record</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Animal Type</Label>
                    <Input value={editingItem.animalType} onChange={(e) => setEditingItem({ ...editingItem, animalType: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Breed</Label>
                    <Input value={editingItem.breed || ""} onChange={(e) => setEditingItem({ ...editingItem, breed: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantity</Label>
                    <Input type="number" min="1" value={editingItem.quantity} onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 1 })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Input value={editingItem.purpose || ""} onChange={(e) => setEditingItem({ ...editingItem, purpose: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Current Value</Label>
                    <Input type="number" value={editingItem.currentValue || ""} onChange={(e) => setEditingItem({ ...editingItem, currentValue: parseInt(e.target.value) || null })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Health Status</Label>
                    <Select value={editingItem.healthStatus || "healthy"} onValueChange={(v) => setEditingItem({ ...editingItem, healthStatus: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["healthy", "sick", "recovering", "quarantined", "deceased"].map(s =>
                          <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={editingItem.notes || ""} onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })} rows={2} />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
