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
import { farms, farmers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Plus, Loader2, MapPin, MapPinned, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { FarmBoundaryDrawer } from "@/components/FarmBoundaryDrawer";
import { Link } from "wouter";
import { DataPagination } from "@/components/DataPagination";

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
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
      if (!user) {
        toast.error("User not authenticated");
        return;
      }
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
      setFormData({
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
      fetchData();
    } catch (err) {
      console.error("Failed to add farm:", err);
      toast.error("Failed to add farm");
    } finally {
      setSubmitting(false);
    }
  };

  const getFarmerName = (farmerId: number) => {
    const farmer = farmersList.find((f) => f.id === farmerId);
    return farmer ? `${farmer.firstName} ${farmer.lastName}` : "Unknown";
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
            <h1 className="text-3xl font-bold text-foreground">Farms</h1>
            <p className="text-muted-foreground mt-2">Manage farm profiles and locations</p>
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
                <DialogDescription>
                  Enter the farm information to create a new farm profile
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="farmerId">Farmer *</Label>
                  <Select value={formData.farmerId} onValueChange={(value) => setFormData({ ...formData, farmerId: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a farmer" />
                    </SelectTrigger>
                    <SelectContent>
                      {farmersList.map((farmer) => (
                        <SelectItem key={farmer.id} value={farmer.id.toString()}>
                          {farmer.firstName} {farmer.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="farmName">Farm Name *</Label>
                  <Input
                    id="farmName"
                    value={formData.farmName}
                    onChange={(e) => setFormData({ ...formData, farmName: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="farmSize">Farm Size</Label>
                    <Input
                      id="farmSize"
                      type="number"
                      step="0.01"
                      value={formData.farmSize}
                      onChange={(e) => setFormData({ ...formData, farmSize: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="farmSizeUnit">Unit</Label>
                    <Select value={formData.farmSizeUnit} onValueChange={(value) => setFormData({ ...formData, farmSizeUnit: value })}>
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

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Textarea
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="latitude">Latitude</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="0.0000001"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="longitude">Longitude</Label>
                    <Input
                      id="longitude"
                      type="number"
                      step="0.0000001"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="soilType">Soil Type</Label>
                    <Input
                      id="soilType"
                      value={formData.soilType}
                      onChange={(e) => setFormData({ ...formData, soilType: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="irrigationType">Irrigation Type</Label>
                    <Input
                      id="irrigationType"
                      value={formData.irrigationType}
                      onChange={(e) => setFormData({ ...formData, irrigationType: e.target.value })}
                    />
                  </div>
                </div>

                {/* Farm Boundary Drawing Section */}
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label>Farm Boundary (Optional)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBoundaryDrawer(!showBoundaryDrawer)}
                    >
                      <MapPinned className="w-4 h-4 mr-2" />
                      {showBoundaryDrawer ? "Hide Map" : "Draw Boundary"}
                    </Button>
                  </div>
                  {showBoundaryDrawer && formData.latitude && formData.longitude && (
                    <div className="mt-2">
                      <FarmBoundaryDrawer
                        farmId={0} // Will be set after farm creation
                        initialCenter={{
                          lat: parseFloat(formData.latitude),
                          lng: parseFloat(formData.longitude)
                        }}
                        onBoundarySaved={(boundaryId) => {
                          toast.success("Boundary saved! ID: " + boundaryId);
                          setShowBoundaryDrawer(false);
                        }}
                      />
                    </div>
                  )}
                  {showBoundaryDrawer && (!formData.latitude || !formData.longitude) && (
                    <p className="text-sm text-muted-foreground">
                      Please enter latitude and longitude first to draw the farm boundary.
                    </p>
                  )}
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
                        <MapPin className="w-4 h-4 mr-2" />
                        Add Farm
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {farmersList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farmers Available</CardTitle>
              <CardDescription>
                You need to register farmers before adding farms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Farmers section to register your first farmer.
              </p>
            </CardContent>
          </Card>
        ) : farmsList.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Farms Added</CardTitle>
              <CardDescription>
                Get started by adding your first farm
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Click the "Add Farm" button above to create a new farm profile.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Registered Farms ({farmsList.length})</CardTitle>
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
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {farmsList
                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                    .map((farm) => (
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
                      <TableCell>
                        {farm.farmSize ? `${farm.farmSize} ${farm.farmSizeUnit}` : "-"}
                      </TableCell>
                      <TableCell>{farm.location || "-"}</TableCell>
                      <TableCell>{farm.soilType || "-"}</TableCell>
                      <TableCell>
                        {new Date(farm.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <DataPagination
                currentPage={currentPage}
                totalPages={Math.ceil(farmsList.length / pageSize)}
                pageSize={pageSize}
                totalItems={farmsList.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
