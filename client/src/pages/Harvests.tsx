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
import { harvests, crops } from "@/db/schema";
import { Plus, Loader2, TrendingUp, Search, BarChart3, WifiOff, Cloud } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { SavedFilters } from "@/components/SavedFilters";
import { FilterAnalytics } from "@/components/FilterAnalytics";
import { eq } from "drizzle-orm";
import { useOfflineSync, useOnlineStatus } from "@/hooks/useOfflineSync";

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

interface Crop {
  id: number;
  cropName: string;
}

export default function Harvests() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const { saveHarvest: saveOfflineHarvest, status: offlineStatus } = useOfflineSync();
  const [harvestsList, setHarvestsList] = useState<Harvest[]>([]);
  const [cropsList, setCropsList] = useState<Crop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [cropFilter, setCropFilter] = useState("all");
  const [dateRangeStart, setDateRangeStart] = useState("");
  const [dateRangeEnd, setDateRangeEnd] = useState("");
  const [minQuantity, setMinQuantity] = useState("");
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [formData, setFormData] = useState({
    cropId: "",
    harvestDate: "",
    quantity: "",
    unit: "",
    quality: "",
    storageLocation: "",
    marketPrice: "",
    soldQuantity: "",
    revenue: "",
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
      const [harvestsData, cropsData] = await Promise.all([
        db.select().from(harvests).where(eq(harvests.userId, Number(user.id))),
        db.select({ id: crops.id, cropName: crops.cropName }).from(crops).where(eq(crops.userId, Number(user.id))),
      ]);
      setHarvestsList(harvestsData as Harvest[]);
      setCropsList(cropsData as Crop[]);
    } catch (err) {
      console.error("Failed to fetch data:", err);
      toast.error("Failed to load harvests");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.cropId || !formData.harvestDate || !formData.quantity || !formData.unit) {
      toast.error("Crop, harvest date, quantity, and unit are required");
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
        const cropName = getCropName(parseInt(formData.cropId));
        await saveOfflineHarvest({
          cropType: cropName,
          quantity: parseFloat(formData.quantity),
          unit: formData.unit,
          harvestDate: formData.harvestDate,
          notes: formData.notes || undefined,
        });
        
        toast.success("Harvest saved offline. Will sync when back online.", {
          icon: <WifiOff className="w-4 h-4" />,
        });
      } else {
        // Online - save directly to database
        await db.insert(harvests).values({
          userId: user.id,
          cropId: parseInt(formData.cropId),
          harvestDate: new Date(formData.harvestDate),
          quantity: formData.quantity,
          unit: formData.unit,
          quality: formData.quality || null,
          storageLocation: formData.storageLocation || null,
          marketPrice: formData.marketPrice ? Math.round(parseFloat(formData.marketPrice) * 100) : null,
          soldQuantity: formData.soldQuantity || null,
          revenue: formData.revenue ? Math.round(parseFloat(formData.revenue) * 100) : null,
          notes: formData.notes || null,
        });

        toast.success("Harvest record added successfully");
      }
      
      setOpen(false);
      setFormData({
        cropId: "",
        harvestDate: "",
        quantity: "",
        unit: "",
        quality: "",
        storageLocation: "",
        marketPrice: "",
        soldQuantity: "",
        revenue: "",
        notes: "",
      });
      fetchData();
    } catch (err) {
      console.error("Failed to add harvest:", err);
      toast.error("Failed to add harvest record");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter harvests based on search and filters
  const filteredHarvests = harvestsList.filter((harvest) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        getCropName(harvest.cropId).toLowerCase().includes(query) ||
        (harvest.storageLocation && harvest.storageLocation.toLowerCase().includes(query)) ||
        (harvest.quality && harvest.quality.toLowerCase().includes(query)) ||
        (harvest.notes && harvest.notes.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Crop filter
    if (cropFilter !== "all" && harvest.cropId.toString() !== cropFilter) {
      return false;
    }

    // Date range filter
    if (dateRangeStart) {
      const harvestDate = new Date(harvest.harvestDate);
      const startDate = new Date(dateRangeStart);
      if (harvestDate < startDate) return false;
    }
    if (dateRangeEnd) {
      const harvestDate = new Date(harvest.harvestDate);
      const endDate = new Date(dateRangeEnd);
      if (harvestDate > endDate) return false;
    }

    // Minimum quantity filter
    if (minQuantity) {
      const quantity = parseFloat(harvest.quantity);
      const min = parseFloat(minQuantity);
      if (isNaN(quantity) || quantity < min) return false;
    }

    return true;
  });

  const getCropName = (cropId: number) => {
    const crop = cropsList.find((c) => c.id === cropId);
    return crop ? crop.cropName : "Unknown";
  };

  const formatCurrency = (cents: number | null) => {
    if (!cents) return "-";
    return `$${(cents / 100).toFixed(2)}`;
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
            <h1 className="text-3xl font-bold text-foreground">Harvests</h1>
            <p className="text-muted-foreground mt-2">Record and track harvest yields and sales</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={cropsList.length === 0}>
                <Plus className="w-4 h-4 mr-2" />
                Add Harvest
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Harvest Record</DialogTitle>
                <DialogDescription>
                  Record a new harvest from your crops
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cropId">Crop *</Label>
                  <Select value={formData.cropId} onValueChange={(value) => setFormData({ ...formData, cropId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a crop" />
                    </SelectTrigger>
                    <SelectContent>
                      {cropsList.map((crop) => (
                        <SelectItem key={crop.id} value={crop.id.toString()}>
                          {crop.cropName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="harvestDate">Harvest Date *</Label>
                  <Input
                    id="harvestDate"
                    type="date"
                    value={formData.harvestDate}
                    onChange={(e) => setFormData({ ...formData, harvestDate: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit *</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      placeholder="e.g., kg, tons, bags"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quality">Quality</Label>
                    <Select value={formData.quality} onValueChange={(value) => setFormData({ ...formData, quality: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select quality" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="fair">Fair</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="storageLocation">Storage Location</Label>
                    <Input
                      id="storageLocation"
                      value={formData.storageLocation}
                      onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marketPrice">Market Price Per Unit ($)</Label>
                  <Input
                    id="marketPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.marketPrice}
                    onChange={(e) => setFormData({ ...formData, marketPrice: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="soldQuantity">Sold Quantity</Label>
                    <Input
                      id="soldQuantity"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.soldQuantity}
                      onChange={(e) => setFormData({ ...formData, soldQuantity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="revenue">Total Revenue ($)</Label>
                    <Input
                      id="revenue"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.revenue}
                      onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
                    />
                  </div>
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
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Add Harvest
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filters */}
        {harvestsList.length > 0 && (
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
                      placeholder="Search by crop, storage location, quality, or notes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Crop Filter */}
                <div>
                  <Label htmlFor="crop-filter">Crop</Label>
                  <Select value={cropFilter} onValueChange={setCropFilter}>
                    <SelectTrigger id="crop-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Crops</SelectItem>
                      {cropsList.map((crop) => (
                        <SelectItem key={crop.id} value={crop.id.toString()}>
                          {crop.cropName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Saved Filters */}
                <div className="flex items-end">
                  <SavedFilters
                    storageKey="harvests-saved-filters"
                    currentFilters={{
                      searchQuery,
                      cropFilter,
                      dateRangeStart,
                      dateRangeEnd,
                      minQuantity,
                    }}
                    onLoadFilter={(filters) => {
                      setSearchQuery(filters.searchQuery || "");
                      setCropFilter(filters.cropFilter || "all");
                      setDateRangeStart(filters.dateRangeStart || "");
                      setDateRangeEnd(filters.dateRangeEnd || "");
                      setMinQuantity(filters.minQuantity || "");
                    }}
                  />
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setCropFilter("all");
                      setDateRangeStart("");
                      setDateRangeEnd("");
                      setMinQuantity("");
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
                  <FilterAnalytics storageKey="harvests-saved-filters" />
                </div>
              )}

              {/* Date Range and Quantity */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div>
                  <Label htmlFor="date-start">Harvest Date From</Label>
                  <Input
                    id="date-start"
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="date-end">Harvest Date To</Label>
                  <Input
                    id="date-end"
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="min-quantity">Min Quantity</Label>
                  <Input
                    id="min-quantity"
                    type="number"
                    placeholder="Minimum quantity"
                    value={minQuantity}
                    onChange={(e) => setMinQuantity(e.target.value)}
                  />
                </div>
              </div>

              {/* Results Count */}
              <div className="mt-4 text-sm text-muted-foreground">
                Showing {filteredHarvests.length} of {harvestsList.length} harvests
              </div>
            </CardContent>
          </Card>
        )}

        {cropsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Crops Available</CardTitle>
              <CardDescription>
                You need to add crops before recording harvests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Crops section to add your first crop.
              </p>
            </CardContent>
          </Card>
        ) : harvestsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Harvests Recorded</CardTitle>
              <CardDescription>
                Get started by recording your first harvest
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the "Add Harvest" button above to start tracking harvests.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Harvest Records ({harvestsList.length})</CardTitle>
              <CardDescription>View and manage all harvest records</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crop</TableHead>
                    <TableHead>Harvest Date</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Market Price</TableHead>
                    <TableHead>Sold Quantity</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHarvests.map((harvest) => (
                    <TableRow key={harvest.id}>
                      <TableCell className="font-medium">{getCropName(harvest.cropId)}</TableCell>
                      <TableCell>
                        {new Date(harvest.harvestDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {harvest.quantity} {harvest.unit}
                      </TableCell>
                      <TableCell className="capitalize">{harvest.quality || "-"}</TableCell>
                      <TableCell>{formatCurrency(harvest.marketPrice)}</TableCell>
                      <TableCell>
                        {harvest.soldQuantity ? `${harvest.soldQuantity} ${harvest.unit}` : "-"}
                      </TableCell>
                      <TableCell>{formatCurrency(harvest.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
