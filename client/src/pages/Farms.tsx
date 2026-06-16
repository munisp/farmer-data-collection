import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDatabase } from "@/hooks/useDatabase";
import { farms, farmers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Plus, Loader2, MapPin, MapPinned, ExternalLink, Pencil, Trash2, Search, BarChart3, TrendingUp, Sprout, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { FarmBoundaryDrawer } from "@/components/FarmBoundaryDrawer";
import { Link } from "wouter";
import { DataPagination } from "@/components/DataPagination";
import { trpc } from "@/lib/trpc";

interface Farm {
  id: number;
  farmerId: number;
  farmName: string;
  farmSize: string | null;
  farmSizeUnit: string | null;
  location: string | null;
  latitude: string | null;
  longitude: string | null;
  soilType: string | null;
  irrigationType: string | null;
  createdAt: Date;
}

interface Farmer {
  id: number;
  firstName: string;
  lastName: string;
}

export default function Farms() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [farmersList, setFarmersList] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [activeTab, setActiveTab] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    farmerId: "",
    farmName: "",
    farmSize: "",
    farmSizeUnit: "acres",
    location: "",
    latitude: "",
    longitude: "",
    soilType: "",
    irrigationType: "",
  });
  const [showBoundaryDrawer, setShowBoundaryDrawer] = useState(false);

  // tRPC analytics query
  const analyticsQuery = trpc.coreFarms.getAnalytics.useQuery(
    { farmId: selectedFarmId! },
    { enabled: !!selectedFarmId && activeTab === "analytics" }
  );

  const updateMutation = trpc.coreFarms.update.useMutation({
    onSuccess: () => {
      toast.success("Farm updated successfully");
      setEditOpen(false);
      setEditingFarm(null);
      fetchData();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.coreFarms.delete.useMutation({
    onSuccess: () => {
      toast.success("Farm deleted successfully");
      fetchData();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (!isInitialized) return;
    fetchData();
  }, [isInitialized, db]);

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [farmsData, farmersData] = await Promise.all([
        db.select().from(farms).where(eq(farms.userId, Number(user.id))),
        db.select({ id: farmers.id, firstName: farmers.firstName, lastName: farmers.lastName }).from(farmers).where(eq(farmers.userId, Number(user.id))),
      ]);
      setFarmsList(farmsData as Farm[]);
      setFarmersList(farmersData as Farmer[]);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to load farms");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.farmerId || !formData.farmName) {
      toast.error("Farmer and farm name are required");
      return;
    }
    try {
      setSubmitting(true);
      if (!user) { toast.error("User not authenticated"); return; }
      await db.insert(farms).values({
        userId: user.id,
        farmerId: parseInt(formData.farmerId),
        farmName: formData.farmName,
        farmSize: formData.farmSize || null,
        farmSizeUnit: formData.farmSizeUnit || "acres",
        location: formData.location || null,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        soilType: formData.soilType || null,
        irrigationType: formData.irrigationType || null,
      });
      toast.success("Farm added successfully");
      setOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      console.error("Failed to add farm:", err);
      toast.error("Failed to add farm");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ farmerId: "", farmName: "", farmSize: "", farmSizeUnit: "acres", location: "", latitude: "", longitude: "", soilType: "", irrigationType: "" });
  };

  const handleEdit = (farm: Farm) => {
    setEditingFarm(farm);
    setEditOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFarm) return;
    updateMutation.mutate({
      id: editingFarm.id,
      farmName: editingFarm.farmName,
      farmSize: editingFarm.farmSize || undefined,
      farmSizeUnit: editingFarm.farmSizeUnit || undefined,
      location: editingFarm.location || undefined,
      latitude: editingFarm.latitude || undefined,
      longitude: editingFarm.longitude || undefined,
      soilType: editingFarm.soilType || undefined,
      irrigationType: editingFarm.irrigationType || undefined,
    });
  };

  const handleDelete = (farm: Farm) => {
    if (!confirm(`Delete farm "${farm.farmName}"? This action cannot be undone.`)) return;
    deleteMutation.mutate({ id: farm.id });
  };

  const getFarmerName = (farmerId: number) => {
    const farmer = farmersList.find((f) => f.id === farmerId);
    return farmer ? `${farmer.firstName} ${farmer.lastName}` : "Unknown";
  };

  const filteredFarms = useMemo(() => {
    if (!searchQuery) return farmsList;
    const q = searchQuery.toLowerCase();
    return farmsList.filter(f =>
      f.farmName.toLowerCase().includes(q) ||
      (f.location && f.location.toLowerCase().includes(q)) ||
      (f.soilType && f.soilType.toLowerCase().includes(q))
    );
  }, [farmsList, searchQuery]);

  const analytics = analyticsQuery.data;

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
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Farms</h1>
            <p className="text-muted-foreground mt-2">Manage farm profiles, analytics, and locations</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={farmersList.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Farm
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Farm</DialogTitle>
                <DialogDescription>Enter the farm information to create a new farm profile</DialogDescription>
              </DialogHeader>
              <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="farmerId">Farmer *</Label>
                  <Select value={formData.farmerId} onValueChange={(value) => setFormData({ ...formData, farmerId: value })}>
                    <SelectTrigger><SelectValue placeholder="Select a farmer" /></SelectTrigger>
                    <SelectContent>
                      {farmersList.map((farmer) => (
                        <SelectItem key={farmer.id} value={farmer.id.toString()}>{farmer.firstName} {farmer.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="farmName">Farm Name *</Label>
                  <Input id="farmName" value={formData.farmName} onChange={(e) => setFormData({ ...formData, farmName: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Farm Size</Label>
                    <Input type="number" step="0.01" value={formData.farmSize} onChange={(e) => setFormData({ ...formData, farmSize: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={formData.farmSizeUnit} onValueChange={(value) => setFormData({ ...formData, farmSizeUnit: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acres">Acres</SelectItem>
                        <SelectItem value="hectares">Hectares</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Textarea value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input type="number" step="0.0000001" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input type="number" step="0.0000001" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Soil Type</Label>
                    <Select value={formData.soilType} onValueChange={(value) => setFormData({ ...formData, soilType: value })}>
                      <SelectTrigger><SelectValue placeholder="Select soil type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clay">Clay</SelectItem>
                        <SelectItem value="sandy">Sandy</SelectItem>
                        <SelectItem value="loam">Loam</SelectItem>
                        <SelectItem value="silt">Silt</SelectItem>
                        <SelectItem value="sandy_loam">Sandy Loam</SelectItem>
                        <SelectItem value="clay_loam">Clay Loam</SelectItem>
                        <SelectItem value="peat">Peat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Irrigation Type</Label>
                    <Select value={formData.irrigationType} onValueChange={(value) => setFormData({ ...formData, irrigationType: value })}>
                      <SelectTrigger><SelectValue placeholder="Select irrigation" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rainfed">Rainfed</SelectItem>
                        <SelectItem value="drip">Drip</SelectItem>
                        <SelectItem value="sprinkler">Sprinkler</SelectItem>
                        <SelectItem value="flood">Flood</SelectItem>
                        <SelectItem value="furrow">Furrow</SelectItem>
                        <SelectItem value="center_pivot">Center Pivot</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Farm Boundary Drawing Section */}
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label>Farm Boundary (Optional)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowBoundaryDrawer(!showBoundaryDrawer)}>
                      <MapPinned className="w-4 h-4 mr-2" />
                      {showBoundaryDrawer ? "Hide Map" : "Draw Boundary"}
                    </Button>
                  </div>
                  {showBoundaryDrawer && formData.latitude && formData.longitude && (
                    <div className="mt-2">
                      <FarmBoundaryDrawer
                        farmId={0}
                        initialCenter={{ lat: parseFloat(formData.latitude), lng: parseFloat(formData.longitude) }}
                        onBoundarySaved={(boundaryId) => { toast.success("Boundary saved! ID: " + boundaryId); setShowBoundaryDrawer(false); }}
                      />
                    </div>
                  )}
                  {showBoundaryDrawer && (!formData.latitude || !formData.longitude) && (
                    <p className="text-sm text-muted-foreground">Please enter latitude and longitude first to draw the farm boundary.</p>
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : <><MapPin className="w-4 h-4 mr-2" />Add Farm</>}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list">Farm List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" aria-label="Search" placeholder="Search farms by name, location, or soil type..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} />
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Total Farms</div>
                  <div className="text-2xl font-bold">{farmsList.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Total Area</div>
                  <div className="text-2xl font-bold">
                    {farmsList.reduce((sum, f) => sum + (parseFloat(f.farmSize || "0") || 0), 0).toFixed(1)} acres
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Soil Types</div>
                  <div className="text-2xl font-bold">{new Set(farmsList.map(f => f.soilType).filter(Boolean)).size}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">GPS Mapped</div>
                  <div className="text-2xl font-bold">{farmsList.filter(f => f.latitude && f.longitude).length}</div>
                </CardContent>
              </Card>
            </div>

            {filteredFarms.length === 0 ? (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle>{searchQuery ? "No Matching Farms" : "No Farms Added"}</CardTitle>
                  <CardDescription>{searchQuery ? "Try a different search term" : "Click 'Add Farm' to create a new farm profile"}</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Registered Farms ({filteredFarms.length})</CardTitle>
                  <CardDescription>View and manage all farm profiles</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Farm Name</TableHead>
                        <TableHead>Farmer</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Soil Type</TableHead>
                        <TableHead>Irrigation</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFarms.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((farm) => (
                        <TableRow key={farm.id}>
                          <TableCell className="font-medium">
                            <Link href={`/farms/${farm.id}`}>
                              <a className="flex items-center gap-2 hover:text-primary hover:underline cursor-pointer">
                                {farm.farmName}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </Link>
                          </TableCell>
                          <TableCell>{getFarmerName(farm.farmerId)}</TableCell>
                          <TableCell>{farm.farmSize ? `${farm.farmSize} ${farm.farmSizeUnit}` : "-"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{farm.location || "-"}</TableCell>
                          <TableCell>{farm.soilType ? <Badge variant="outline">{farm.soilType}</Badge> : "-"}</TableCell>
                          <TableCell>{farm.irrigationType ? <Badge variant="secondary">{farm.irrigationType}</Badge> : "-"}</TableCell>
                          <TableCell>{new Date(farm.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setSelectedFarmId(farm.id); setActiveTab("analytics"); }}>
                                <BarChart3 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(farm)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(farm)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <DataPagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(filteredFarms.length / pageSize)}
                    pageSize={pageSize}
                    totalItems={filteredFarms.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {!selectedFarmId ? (
              <Card>
                <CardHeader>
                  <CardTitle>Select a Farm</CardTitle>
                  <CardDescription>Click the analytics icon on any farm to view detailed analytics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {farmsList.map(f => (
                      <Button key={f.id} variant="outline" onClick={() => setSelectedFarmId(f.id)} className="justify-start">
                        <MapPin className="w-4 h-4 mr-2" />{f.farmName}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : analyticsQuery.isLoading ? (
              <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : analytics ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">{farmsList.find(f => f.id === selectedFarmId)?.farmName} — Analytics</h2>
                  <Button variant="outline" onClick={() => setSelectedFarmId(null)}>View All Farms</Button>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="w-4 h-4" />Total Revenue</div>
                      <div className="text-2xl font-bold text-green-600">{analytics.financial.totalRevenue.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><DollarSign className="w-4 h-4" />Total Expenses</div>
                      <div className="text-2xl font-bold text-red-600">{analytics.financial.totalExpenses.toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><BarChart3 className="w-4 h-4" />Net Profit</div>
                      <div className={`text-2xl font-bold ${analytics.financial.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {analytics.financial.netProfit.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Crop Allocation */}
                <Card>
                  <CardHeader><CardTitle>Crop Allocation</CardTitle></CardHeader>
                  <CardContent>
                    {analytics.cropAllocation.length === 0 ? (
                      <p className="text-muted-foreground">No crops planted on this farm yet</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Crop</TableHead>
                            <TableHead>Count</TableHead>
                            <TableHead>Total Area</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.cropAllocation.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium"><Sprout className="w-4 h-4 inline mr-2" />{c.cropName}</TableCell>
                              <TableCell>{c.count}</TableCell>
                              <TableCell>{c.totalArea.toFixed(1)} acres</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Livestock Summary */}
                {analytics.livestockSummary.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle>Livestock Summary</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Animal Type</TableHead>
                            <TableHead>Total Count</TableHead>
                            <TableHead>Total Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.livestockSummary.map((l, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{l.animalType}</TableCell>
                              <TableCell>{l.totalCount}</TableCell>
                              <TableCell>{l.totalValue.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {/* Harvest & Expense Trends */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Monthly Harvest Revenue</CardTitle></CardHeader>
                    <CardContent>
                      {analytics.harvestTrend.length === 0 ? (
                        <p className="text-muted-foreground">No harvest data available</p>
                      ) : (
                        <div className="space-y-2">
                          {analytics.harvestTrend.map((h, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{h.month}</span>
                              <div className="flex items-center gap-4">
                                <span>{h.totalQuantity.toFixed(0)} units</span>
                                <span className="font-medium text-green-600">{h.totalRevenue.toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Monthly Expenses</CardTitle></CardHeader>
                    <CardContent>
                      {analytics.expenseTrend.length === 0 ? (
                        <p className="text-muted-foreground">No expense data available</p>
                      ) : (
                        <div className="space-y-2">
                          {analytics.expenseTrend.map((e, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">{e.month}</span>
                              <div className="flex items-center gap-4">
                                <Badge variant="outline">{e.category}</Badge>
                                <span className="font-medium text-red-600">{e.totalAmount.toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Failed to load analytics</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Edit Farm Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Farm</DialogTitle>
              <DialogDescription>Update farm information</DialogDescription>
            </DialogHeader>
            {editingFarm && (
              <form aria-label="Submit form" onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Farm Name *</Label>
                  <Input value={editingFarm.farmName} onChange={(e) => setEditingFarm({ ...editingFarm, farmName: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Farm Size</Label>
                    <Input type="number" step="0.01" value={editingFarm.farmSize || ""} onChange={(e) => setEditingFarm({ ...editingFarm, farmSize: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={editingFarm.farmSizeUnit || "acres"} onValueChange={(v) => setEditingFarm({ ...editingFarm, farmSizeUnit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acres">Acres</SelectItem>
                        <SelectItem value="hectares">Hectares</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Textarea value={editingFarm.location || ""} onChange={(e) => setEditingFarm({ ...editingFarm, location: e.target.value })} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Soil Type</Label>
                    <Input value={editingFarm.soilType || ""} onChange={(e) => setEditingFarm({ ...editingFarm, soilType: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Irrigation</Label>
                    <Input value={editingFarm.irrigationType || ""} onChange={(e) => setEditingFarm({ ...editingFarm, irrigationType: e.target.value })} />
                  </div>
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
