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
import { Badge } from "@/components/ui/badge";
import { useDatabase } from "@/hooks/useDatabase";
import { crops, farms } from "@/db/schema";
import { Plus, Loader2, Sprout, Trash2, Download, CheckSquare, Square, Search, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SavedFilters } from "@/components/SavedFilters";
import { FilterAnalytics } from "@/components/FilterAnalytics";
import { eq } from "drizzle-orm";

interface Crop {
  id: number;
  farmId: number;
  cropName: string;
  cropVariety: string | null;
  plantingDate: Date;
  expectedHarvestDate: Date | null;
  actualHarvestDate: Date | null;
  areaPlanted: string | null;
  areaUnit: string | null;
  season: string | null;
  status: string | null;
  pricePerUnit: number | null;
  notes: string | null;
  createdAt: Date;
}

interface Farm {
  id: number;
  farmName: string;
}

export default function Crops() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [cropsList, setCropsList] = useState<Crop[]>([]);
  const [farmsList, setFarmsList] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCrops, setSelectedCrops] = useState<number[]>([]);
  const [showBatchActions, setShowBatchActions] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [formData, setFormData] = useState({
    farmId: "",
    cropName: "",
    cropVariety: "",
    plantingDate: "",
    expectedHarvestDate: "",
    areaPlanted: "",
    areaUnit: "acres",
    season: "",
    status: "planted",
    pricePerUnit: "10.00",
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
      setSelectedCrops([]);
      const [cropsData, farmsData] = await Promise.all([
        db.select().from(crops).where(eq(crops.userId, Number(user.id))),
        db.select({ id: farms.id, farmName: farms.farmName }).from(farms).where(eq(farms.userId, Number(user.id))),
      ]);
      setCropsList(cropsData as Crop[]);
      setFarmsList(farmsData as Farm[]);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to load crops");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.farmId || !formData.cropName || !formData.plantingDate) {
      toast.error("Farm, crop name, and planting date are required");
      return;
    }

    try {
      setSubmitting(true);
      if (!user) {
        toast.error("User not authenticated");
        return;
      }
      await db.insert(crops).values({
        userId: user.id,
        farmId: parseInt(formData.farmId),
        cropName: formData.cropName,
        cropVariety: formData.cropVariety || null,
        plantingDate: new Date(formData.plantingDate),
        expectedHarvestDate: formData.expectedHarvestDate ? new Date(formData.expectedHarvestDate) : null,
        areaPlanted: formData.areaPlanted || null,
        areaUnit: formData.areaUnit || "acres",
        season: formData.season || null,
        status: formData.status || "planted",
        pricePerUnit: Math.round(parseFloat(formData.pricePerUnit) * 100) || 1000, // Convert to cents
        notes: formData.notes || null,
      });

      toast.success("Crop added successfully");
      setOpen(false);
      setFormData({
        farmId: "",
        cropName: "",
        cropVariety: "",
        plantingDate: "",
        expectedHarvestDate: "",
        areaPlanted: "",
        areaUnit: "acres",
        season: "",
        status: "planted",
        pricePerUnit: "10.00",
        notes: "",
      });
      fetchData();
    } catch (err) {
      console.error("Failed to add crop:", err);
      toast.error("Failed to add crop");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter crops based on search and filters
  const filteredCrops = cropsList.filter((crop) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        crop.cropName.toLowerCase().includes(query) ||
        (crop.cropVariety && crop.cropVariety.toLowerCase().includes(query)) ||
        getFarmName(crop.farmId).toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (statusFilter !== "all" && crop.status !== statusFilter) {
      return false;
    }

    // Date range filter
    if (dateRangeStart) {
      const plantingDate = new Date(crop.plantingDate);
      const startDate = new Date(dateRangeStart);
      if (plantingDate < startDate) return false;
    }
    if (dateRangeEnd) {
      const plantingDate = new Date(crop.plantingDate);
      const endDate = new Date(dateRangeEnd);
      if (plantingDate > endDate) return false;
    }

    return true;
  });

  const getFarmName = (farmId: number) => {
    const farm = farmsList.find((f) => f.id === farmId);
    return farm ? farm.farmName : "Unknown";
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case "planted":
        return "bg-blue-500";
      case "growing":
        return "bg-green-500";
      case "harvested":
        return "bg-purple-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // Batch operation handlers
  const handleSelectAll = () => {
    if (selectedCrops.length === cropsList.length) {
      setSelectedCrops([]);
    } else {
      setSelectedCrops(cropsList.map(crop => crop.id));
    }
  };

  const toggleCropSelection = (cropId: number) => {
    setSelectedCrops(prev => 
      prev.includes(cropId) 
        ? prev.filter(id => id !== cropId)
        : [...prev, cropId]
    );
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedCrops.length} crop(s)?`)) {
      return;
    }

    try {
      for (const cropId of selectedCrops) {
        await db.delete(crops).where(eq(crops.id, cropId));
      }
      toast.success(`Deleted ${selectedCrops.length} crop(s)`);
      fetchData();
    } catch (err) {
      console.error("Failed to delete crops:", err);
      toast.error("Failed to delete crops");
    }
  };

  const handleBatchExport = () => {
    const selectedData = cropsList.filter(crop => selectedCrops.includes(crop.id));
    
    if (selectedData.length === 0) {
      toast.error("No crops selected");
      return;
    }

    const headers = ["Crop Name", "Variety", "Farm", "Planting Date", "Expected Harvest", "Area", "Unit", "Season", "Status", "Price Per Unit"];
    const rows = selectedData.map(crop => [
      crop.cropName,
      crop.cropVariety || "",
      getFarmName(crop.farmId),
      new Date(crop.plantingDate).toLocaleDateString(),
      crop.expectedHarvestDate ? new Date(crop.expectedHarvestDate).toLocaleDateString() : "",
      crop.areaPlanted || "",
      crop.areaUnit || "",
      crop.season || "",
      crop.status || "",
      crop.pricePerUnit ? `$${(crop.pricePerUnit / 100).toFixed(2)}` : "",
    ]);

    const csv = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crops-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success(`Exported ${selectedData.length} crop(s)`);
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
            <h1 className="text-3xl font-bold text-foreground">Crops</h1>
            <p className="text-muted-foreground mt-2">Track crop cultivation and growth</p>
            {selectedCrops.length > 0 && (
              <p className="text-sm text-primary mt-1">{selectedCrops.length} item(s) selected</p>
            )}
          </div>
          <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={farmsList.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Crop
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Crop</DialogTitle>
                <DialogDescription>
                  Record a new crop cultivation
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cropName">Crop Name *</Label>
                    <Input
                      id="cropName"
                      value={formData.cropName}
                      onChange={(e) => setFormData({ ...formData, cropName: e.target.value })}
                      placeholder="e.g., Maize, Rice, Wheat"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cropVariety">Variety</Label>
                    <Input
                      id="cropVariety"
                      value={formData.cropVariety}
                      onChange={(e) => setFormData({ ...formData, cropVariety: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="plantingDate">Planting Date *</Label>
                    <Input
                      id="plantingDate"
                      type="date"
                      value={formData.plantingDate}
                      onChange={(e) => setFormData({ ...formData, plantingDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expectedHarvestDate">Expected Harvest Date</Label>
                    <Input
                      id="expectedHarvestDate"
                      type="date"
                      value={formData.expectedHarvestDate}
                      onChange={(e) => setFormData({ ...formData, expectedHarvestDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="areaPlanted">Area Planted</Label>
                    <Input
                      id="areaPlanted"
                      type="number"
                      step="0.01"
                      value={formData.areaPlanted}
                      onChange={(e) => setFormData({ ...formData, areaPlanted: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="areaUnit">Unit</Label>
                    <Select value={formData.areaUnit} onValueChange={(value) => setFormData({ ...formData, areaUnit: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acres">Acres</SelectItem>
                        <SelectItem value="hectares">Hectares</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="season">Season</Label>
                    <Input
                      id="season"
                      value={formData.season}
                      onChange={(e) => setFormData({ ...formData, season: e.target.value })}
                      placeholder="e.g., Spring 2024"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planted">Planted</SelectItem>
                        <SelectItem value="growing">Growing</SelectItem>
                        <SelectItem value="harvested">Harvested</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pricePerUnit">Price Per Unit ($)</Label>
                  <Input
                    id="pricePerUnit"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricePerUnit}
                    onChange={(e) => setFormData({ ...formData, pricePerUnit: e.target.value })}
                    placeholder="10.00"
                  />
                  <p className="text-xs text-muted-foreground">Expected selling price per unit of harvest</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
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
                        <Sprout className="w-4 h-4 mr-2" />
                        Add Crop
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Search and Filters */}
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
                    placeholder="Search by crop name, variety, or farm..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="planted">Planted</SelectItem>
                    <SelectItem value="growing">Growing</SelectItem>
                    <SelectItem value="flowering">Flowering</SelectItem>
                    <SelectItem value="ready">Ready to Harvest</SelectItem>
                    <SelectItem value="harvested">Harvested</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Saved Filters */}
              <div className="flex items-end">
                <SavedFilters
                  storageKey="crops-saved-filters"
                  currentFilters={{
                    searchQuery,
                    statusFilter,
                    dateRangeStart,
                    dateRangeEnd,
                  }}
                  onLoadFilter={(filters) => {
                    setSearchQuery(filters.searchQuery || "");
                    setStatusFilter(filters.statusFilter || "all");
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
                    setStatusFilter("all");
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
                  This Season (90 days)
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
                <FilterAnalytics storageKey="crops-saved-filters" />
              </div>
            )}

            {/* Date Range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label htmlFor="date-start">Planting Date From</Label>
                <Input
                  id="date-start"
                  type="date"
                  value={dateRangeStart}
                  onChange={(e) => setDateRangeStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="date-end">Planting Date To</Label>
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
              Showing {filteredCrops.length} of {cropsList.length} crops
            </div>
          </CardContent>
        </Card>

        {farmsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farms Available</CardTitle>
              <CardDescription>
                You need to add farms before tracking crops
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Farms section to add your first farm.
              </p>
            </CardContent>
          </Card>
        ) : cropsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Crops Recorded</CardTitle>
              <CardDescription>
                Get started by recording your first crop
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the "Add Crop" button above to start tracking crop cultivation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Crop Records ({cropsList.length})</CardTitle>
                  <CardDescription>View and manage all crop cultivation records</CardDescription>
                </div>
                {selectedCrops.length > 0 && (
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
                        {selectedCrops.length === cropsList.length ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Farm</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Planting Date</TableHead>
                    <TableHead>Expected Harvest</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCrops.map((crop) => (
                    <TableRow key={crop.id}>
                      <TableCell>
                        <button
                          onClick={() => toggleCropSelection(crop.id)}
                          className="flex items-center justify-center w-full"
                        >
                          {selectedCrops.includes(crop.id) ? (
                            <CheckSquare className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">
                        {crop.cropName}
                        {crop.cropVariety && (
                          <span className="text-muted-foreground text-sm ml-1">
                            ({crop.cropVariety})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{getFarmName(crop.farmId)}</TableCell>
                      <TableCell>
                        {crop.areaPlanted ? `${crop.areaPlanted} ${crop.areaUnit}` : "-"}
                      </TableCell>
                      <TableCell>
                        {new Date(crop.plantingDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {crop.expectedHarvestDate
                          ? new Date(crop.expectedHarvestDate).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(crop.status)}>
                          {crop.status || "unknown"}
                        </Badge>
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
