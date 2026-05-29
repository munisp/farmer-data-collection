import { useState } from "react";
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
import { Plus, Loader2, Search, Pencil, Trash2, Wrench, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";

export default function EquipmentTracker() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formData, setFormData] = useState({
    itemName: "", category: "", quantityOnHand: "1", unitCost: "", storageLocation: "",
  });

  const listQuery = trpc.coreEquipment.list.useQuery({
    search: searchQuery || undefined, limit: 100, offset: 0,
  });

  const analyticsQuery = trpc.coreEquipment.getAnalytics.useQuery(
    undefined, { enabled: activeTab === "analytics" }
  );

  const createMutation = trpc.coreEquipment.create.useMutation({
    onSuccess: () => { toast.success("Equipment added"); setOpen(false); resetForm(); listQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.coreEquipment.update.useMutation({
    onSuccess: () => { toast.success("Equipment updated"); setEditOpen(false); listQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.coreEquipment.delete.useMutation({
    onSuccess: () => { toast.success("Equipment deleted"); listQuery.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [editingItem, setEditingItem] = useState<any>(null);

  const resetForm = () => {
    setFormData({ itemName: "", category: "", quantityOnHand: "1", unitCost: "", storageLocation: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemName || !formData.unitCost) {
      toast.error("Name and unit cost are required"); return;
    }
    createMutation.mutate({
      userId: Number(user?.id || 1),
      itemName: formData.itemName,
      category: formData.category || undefined,
      quantityOnHand: parseInt(formData.quantityOnHand) || 1,
      unitCost: parseFloat(formData.unitCost) || 0,
      storageLocation: formData.storageLocation || undefined,
    });
  };

  const handleEdit = (item: any) => { setEditingItem(item); setEditOpen(true); };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.id,
      itemName: editingItem.itemName,
      quantityOnHand: editingItem.quantityOnHand,
      unitCost: editingItem.unitCostFormatted || undefined,
      storageLocation: editingItem.storageLocation || undefined,
    });
  };

  const handleDelete = (item: any) => {
    if (!confirm(`Delete "${item.itemName}"?`)) return;
    deleteMutation.mutate({ id: item.id });
  };

  const items = listQuery.data?.items || [];
  const total = listQuery.data?.total || 0;
  const analytics = analyticsQuery.data;

  const filteredItems = categoryFilter === "all" ? items : items.filter((i: any) => i.category === categoryFilter);
  const categories = [...new Set(items.map((i: any) => i.category).filter(Boolean))] as string[];
  const totalValue = items.reduce((s: number, i: any) => s + (i.unitCostFormatted * i.quantityOnHand), 0);

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Equipment Tracker</h1>
            <p className="text-muted-foreground mt-2">
              Manage farm equipment, maintenance, and utilization
              <Link href="/equipment-fleet"><a className="ml-2 text-primary hover:underline text-xs">(Fleet Dashboard)</a></Link>
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Add Equipment</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Add Equipment</DialogTitle><DialogDescription>Register new farm equipment</DialogDescription></DialogHeader>
              <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Equipment Name *</Label><Input value={formData.itemName} onChange={(e) => setFormData({ ...formData, itemName: e.target.value })} placeholder="e.g., John Deere 5050D" required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Category</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{["Tractor", "Harvester", "Irrigation", "Sprayer", "Plough", "Seeder", "Trailer", "Generator", "Pump", "Drone", "GPS Unit", "Other"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="1" value={formData.quantityOnHand} onChange={(e) => setFormData({ ...formData, quantityOnHand: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Unit Cost *</Label><Input type="number" step="0.01" value={formData.unitCost} onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Storage Location</Label><Input value={formData.storageLocation} onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })} placeholder="e.g., Shed A" /></div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : "Add Equipment"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList><TabsTrigger value="list">Equipment List</TabsTrigger><TabsTrigger value="analytics">Analytics</TabsTrigger></TabsList>

          <TabsContent value="list" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><div className="flex items-center gap-1 text-sm text-muted-foreground"><Wrench className="w-3 h-3" />Total Equipment</div><div className="text-2xl font-bold">{total}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-1 text-sm text-muted-foreground"><DollarSign className="w-3 h-3" />Total Value</div><div className="text-2xl font-bold text-green-600">{totalValue.toLocaleString()}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-1 text-sm text-muted-foreground"><AlertTriangle className="w-3 h-3" />Low Stock</div><div className="text-2xl font-bold text-red-600">{items.filter((i: any) => i.quantityOnHand <= i.reorderLevel).length}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Categories</div><div className="text-2xl font-bold">{categories.length}</div></CardContent></Card>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input className="pl-10" aria-label="Search" placeholder="Search equipment..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>

            {listQuery.isLoading ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : (
              <Card>
                <CardHeader><CardTitle>Equipment Registry ({filteredItems.length})</CardTitle><CardDescription>All farm equipment with real-time tracking</CardDescription></CardHeader>
                <CardContent>
                  {filteredItems.length === 0 ? <p className="text-center text-muted-foreground py-8">No equipment found. Add your first piece of equipment above.</p> : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Qty</TableHead><TableHead>Location</TableHead><TableHead>Unit Cost</TableHead><TableHead className="text-right">Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {filteredItems.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell><Badge variant="outline">{item.category || "-"}</Badge></TableCell>
                            <TableCell>{item.quantityOnHand}</TableCell>
                            <TableCell>{item.storageLocation || "-"}</TableCell>
                            <TableCell>{item.unitCostFormatted.toLocaleString()}</TableCell>
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
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {analyticsQuery.isLoading ? <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : analytics ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Wrench className="w-4 h-4" />Total Equipment</div><div className="text-2xl font-bold">{analytics.totalEquipment}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Total Value</div><div className="text-2xl font-bold text-green-600">{analytics.totalValue.toLocaleString()}</div></CardContent></Card>
                  <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />Categories</div><div className="text-2xl font-bold">{analytics.categoryBreakdown.length}</div></CardContent></Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>Equipment by Category</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Count</TableHead><TableHead>Total Qty</TableHead><TableHead>Total Value</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {analytics.categoryBreakdown.map((c: any, i: number) => (
                          <TableRow key={i}><TableCell className="font-medium"><Badge variant="outline">{c.category}</Badge></TableCell><TableCell>{c.count}</TableCell><TableCell>{c.totalQuantity}</TableCell><TableCell className="text-green-600">{c.totalValue.toLocaleString()}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {analytics.maintenanceCosts.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Maintenance Costs (Monthly)</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Total Cost</TableHead><TableHead>Transactions</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {analytics.maintenanceCosts.map((m: any, i: number) => (
                            <TableRow key={i}><TableCell>{m.month}</TableCell><TableCell>{m.totalCost.toLocaleString()}</TableCell><TableCell>{m.transactionCount}</TableCell></TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : <Card><CardContent className="p-8 text-center text-muted-foreground">No analytics available</CardContent></Card>}
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit Equipment</DialogTitle></DialogHeader>
            {editingItem && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={editingItem.itemName} onChange={(e) => setEditingItem({ ...editingItem, itemName: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity</Label><Input type="number" min="1" value={editingItem.quantityOnHand} onChange={(e) => setEditingItem({ ...editingItem, quantityOnHand: parseInt(e.target.value) || 1 })} /></div>
                  <div className="space-y-2"><Label>Unit Cost</Label><Input type="number" step="0.01" value={editingItem.unitCostFormatted || ""} onChange={(e) => setEditingItem({ ...editingItem, unitCostFormatted: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <div className="space-y-2"><Label>Storage Location</Label><Input value={editingItem.storageLocation || ""} onChange={(e) => setEditingItem({ ...editingItem, storageLocation: e.target.value })} /></div>
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
