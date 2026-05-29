import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers, farms } from "@/db/schema";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq, and } from "drizzle-orm";
import {
  ArrowLeft,
  Edit,
  MapPin,
  Phone,
  Mail,
  Calendar,
  User,
  Home,
  Loader2,
  Save,
  X,
} from "lucide-react";

interface Farmer {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  village: string | null;
  district: string | null;
  region: string | null;
  nationalId: string | null;
  registrationDate: Date;
  isActive: boolean;
}

interface Farm {
  id: number;
  farmName: string;
  farmSize: string | null;
  farmSizeUnit: string | null;
  location: string | null;
  latitude: string | null;
  longitude: string | null;
  soilType: string | null;
  irrigationType: string | null;
}

export default function FarmerDetailPage() {
  const [match, params] = useRoute("/farmers/:id");
  const [, navigate] = useLocation();
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [farmerFarms, setFarmerFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<Farmer>>({});

  useEffect(() => {
    if (!isInitialized || !match) return;
    fetchFarmerDetails();
  }, [isInitialized, params?.id]);

  const fetchFarmerDetails = async () => {
    if (!user || !params?.id) return;
    
    try {
      setLoading(true);
      const farmerId = parseInt(params.id);
      
      // Fetch farmer
      const farmerResult = await db
        .select()
        .from(farmers)
        .where(and(eq(farmers.id, farmerId), eq(farmers.userId, Number(user.id))));
      
      if (farmerResult.length === 0) {
        toast.error("Farmer not found");
        navigate("/farmers-enhanced");
        return;
      }
      
      setFarmer(farmerResult[0] as Farmer);
      setEditData(farmerResult[0]);
      
      // Fetch farms
      const farmsResult = await db
        .select()
        .from(farms)
        .where(and(eq(farms.farmerId, farmerId), eq(farms.userId, Number(user.id))));
      
      setFarmerFarms(farmsResult as Farm[]);
    } catch (err) {
      console.error("Failed to fetch farmer details:", err);
      toast.error("Failed to load farmer details");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!farmer || !user) return;
    
    try {
      setSaving(true);
      await db
        .update(farmers)
        .set({
          firstName: editData.firstName,
          lastName: editData.lastName,
          phoneNumber: editData.phoneNumber,
          email: editData.email,
          address: editData.address,
          village: editData.village,
          district: editData.district,
          region: editData.region,
          nationalId: editData.nationalId,
        })
        .where(and(eq(farmers.id, farmer.id), eq(farmers.userId, Number(user.id))));
      
      toast.success("Farmer details updated successfully");
      setEditMode(false);
      fetchFarmerDetails();
    } catch (err) {
      console.error("Failed to update farmer:", err);
      toast.error("Failed to update farmer details");
    } finally {
      setSaving(false);
    }
  };

  if (!match) {
    return null;
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!farmer) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Farmer not found</p>
          <Button className="mt-4" onClick={() => navigate("/farmers-enhanced")}>
            Back to Farmers
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/farmers-enhanced")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">
                {farmer.firstName} {farmer.lastName}
              </h1>
              <p className="text-muted-foreground mt-1">
                Registered on {new Date(farmer.registrationDate).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Badge variant={farmer.isActive ? "default" : "secondary"}>
              {farmer.isActive ? "Active" : "Inactive"}
            </Badge>
            {!editMode && (
              <Button onClick={() => setEditMode(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Details
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Personal Information */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  {editMode ? "Edit farmer details" : "Farmer profile information"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {editMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name</Label>
                        <Input
                          id="firstName"
                          value={editData.firstName || ""}
                          onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name</Label>
                        <Input
                          id="lastName"
                          value={editData.lastName || ""}
                          onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <Input
                        id="phoneNumber"
                        value={editData.phoneNumber || ""}
                        onChange={(e) => setEditData({ ...editData, phoneNumber: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={editData.email || ""}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="nationalId">National ID</Label>
                      <Input
                        id="nationalId"
                        value={editData.nationalId || ""}
                        onChange={(e) => setEditData({ ...editData, nationalId: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        value={editData.address || ""}
                        onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="village">Village</Label>
                        <Input
                          id="village"
                          value={editData.village || ""}
                          onChange={(e) => setEditData({ ...editData, village: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="district">District</Label>
                        <Input
                          id="district"
                          value={editData.district || ""}
                          onChange={(e) => setEditData({ ...editData, district: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="region">Region</Label>
                        <Input
                          id="region"
                          value={editData.region || ""}
                          onChange={(e) => setEditData({ ...editData, region: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditMode(false);
                          setEditData(farmer);
                        }}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Full Name</p>
                        <p className="font-medium">
                          {farmer.firstName} {farmer.lastName}
                        </p>
                      </div>
                    </div>

                    {farmer.phoneNumber && (
                      <div className="flex items-center gap-3">
                        <Phone className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Phone Number</p>
                          <p className="font-medium">{farmer.phoneNumber}</p>
                        </div>
                      </div>
                    )}

                    {farmer.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium">{farmer.email}</p>
                        </div>
                      </div>
                    )}

                    {farmer.nationalId && (
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">National ID</p>
                          <p className="font-medium">{farmer.nationalId}</p>
                        </div>
                      </div>
                    )}

                    {farmer.address && (
                      <div className="flex items-center gap-3">
                        <Home className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Address</p>
                          <p className="font-medium">{farmer.address}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">
                          {[farmer.village, farmer.district, farmer.region]
                            .filter(Boolean)
                            .join(", ") || "Not specified"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Registration Date</p>
                        <p className="font-medium">
                          {new Date(farmer.registrationDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Farms */}
            <Card>
              <CardHeader>
                <CardTitle>Farms ({farmerFarms.length})</CardTitle>
                <CardDescription>Farms associated with this farmer</CardDescription>
              </CardHeader>
              <CardContent>
                {farmerFarms.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No farms registered yet
                  </p>
                ) : (
                  <div className="space-y-4">
                    {farmerFarms.map((farm) => (
                      <div
                        key={farm.id}
                        className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium">{farm.farmName}</h4>
                            {farm.farmSize && (
                              <p className="text-sm text-muted-foreground">
                                Size: {farm.farmSize} {farm.farmSizeUnit}
                              </p>
                            )}
                            {farm.location && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="w-3 h-3" />
                                {farm.location}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Farms</p>
                  <p className="text-2xl font-bold">{farmerFarms.length}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Farm Area</p>
                  <p className="text-2xl font-bold">
                    {farmerFarms
                      .reduce((sum, farm) => sum + (parseFloat(farm.farmSize || "0") || 0), 0)
                      .toFixed(1)}{" "}
                    acres
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={farmer.isActive ? "default" : "secondary"} className="mt-1">
                    {farmer.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
