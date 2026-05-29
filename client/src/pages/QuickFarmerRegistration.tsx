import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MapView } from "@/components/Map";
import maplibregl from "maplibre-gl";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers, farms } from "@/db/schema";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { MapPin, User, Phone, Mail, Home, CheckCircle2, Loader2, Navigation } from "lucide-react";
import { PhotoUpload } from "@/components/PhotoUpload";
import { useLocation } from "wouter";

interface FormData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  address: string;
  village: string;
  district: string;
  region: string;
  nationalId: string;
  photoUrl: string | null;
  farmName: string;
  farmSize: string;
  latitude: number | null;
  longitude: number | null;
}

export default function QuickFarmerRegistration() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [marker, setMarker] = useState<maplibregl.Marker | null>(null);
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    email: "",
    address: "",
    village: "",
    district: "",
    region: "",
    nationalId: "",
    photoUrl: null,
    farmName: "",
    farmSize: "",
    latitude: null,
    longitude: null,
  });

  // Offline queue management
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSubmissions, setPendingSubmissions] = useState<FormData[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Load pending submissions from localStorage
    const pending = localStorage.getItem('pendingFarmerSubmissions');
    if (pending) {
      setPendingSubmissions(JSON.parse(pending));
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingSubmissions.length > 0) {
      syncPendingSubmissions();
    }
  }, [isOnline]);

  const syncPendingSubmissions = async () => {
    if (!isInitialized || !db || !user) return;

    for (const submission of pendingSubmissions) {
      try {
        await submitFarmerData(submission, true);
      } catch (error) {
        console.error('Failed to sync submission:', error);
      }
    }
    
    setPendingSubmissions([]);
    localStorage.removeItem('pendingFarmerSubmissions');
    toast.success(`Synced ${pendingSubmissions.length} pending submission(s)`);
  };

  const handleMapReady = (map: maplibregl.Map) => {
    setMapReady(true);

    const attachDragHandler = (activeMarker: maplibregl.Marker) => {
      activeMarker.on("dragend", () => {
        const position = activeMarker.getLngLat();
        setFormData((prev) => ({
          ...prev,
          latitude: position.lat,
          longitude: position.lng,
        }));
      });
    };

    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          map.setCenter([pos.lng, pos.lat]);
          map.setZoom(15);

          const newMarker = new maplibregl.Marker({
            draggable: true,
            color: "#16a34a",
          })
            .setLngLat([pos.lng, pos.lat])
            .addTo(map);

          attachDragHandler(newMarker);
          setMarker((previousMarker) => {
            previousMarker?.remove();
            return newMarker;
          });
          setFormData((prev) => ({
            ...prev,
            latitude: pos.lat,
            longitude: pos.lng,
          }));
        },
        () => {
          toast.error("Could not get your location");
        }
      );
    }

    // Allow clicking on map to set location
    map.on("click", (e) => {
      const lngLat = e.lngLat;
      if (!lngLat) return;

      if (marker) {
        marker.setLngLat([lngLat.lng, lngLat.lat]);
      } else {
        const newMarker = new maplibregl.Marker({
          draggable: true,
          color: "#16a34a",
        })
          .setLngLat([lngLat.lng, lngLat.lat])
          .addTo(map);
        attachDragHandler(newMarker);
        setMarker(newMarker);
      }

      setFormData((prev) => ({
        ...prev,
        latitude: lngLat.lat,
        longitude: lngLat.lng,
      }));
    });
  };

  const handleInputChange = (field: keyof FormData, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const validateStep = (currentStep: number): boolean => {
    switch (currentStep) {
      case 1:
        if (!formData.firstName || !formData.lastName || !formData.phoneNumber) {
          toast.error("Please fill in all required fields");
          return false;
        }
        // Validate phone number format
        if (!/^[0-9+\-\s()]+$/.test(formData.phoneNumber)) {
          toast.error("Please enter a valid phone number");
          return false;
        }
        return true;
      case 2:
        if (!formData.village || !formData.district || !formData.region) {
          toast.error("Please fill in all location fields");
          return false;
        }
        return true;
      case 3:
        if (!formData.farmName || !formData.latitude || !formData.longitude) {
          toast.error("Please provide farm name and select location on map");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const submitFarmerData = async (data: FormData, isSync = false) => {
    if (!isInitialized || !db || !user) {
      throw new Error("Database not initialized");
    }

    // Insert farmer
    const farmerResult = await db.insert(farmers).values({
      userId: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      email: data.email || null,
      address: data.address || null,
      village: data.village,
      district: data.district,
      region: data.region,
      nationalId: data.nationalId || null,
      photoUrl: data.photoUrl || null,
      clientId: isSync ? undefined : `offline-${Date.now()}`,
    }).returning();

    const farmer = farmerResult[0];

    // Insert farm
    await db.insert(farms).values({
      userId: user.id,
      farmerId: farmer.id,
      farmName: data.farmName,
      farmSize: data.farmSize || null,
      farmSizeUnit: "acres",
      latitude: data.latitude?.toString() || null,
      longitude: data.longitude?.toString() || null,
      location: `${data.latitude}, ${data.longitude}`,
      clientId: isSync ? undefined : `offline-${Date.now()}`,
    });

    return farmer;
  };

  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    setLoading(true);

    try {
      if (!isOnline) {
        // Save to offline queue
        const updated = [...pendingSubmissions, formData];
        setPendingSubmissions(updated);
        localStorage.setItem('pendingFarmerSubmissions', JSON.stringify(updated));
        toast.success("Saved offline. Will sync when online.");
        resetForm();
        return;
      }

      await submitFarmerData(formData);
      toast.success("Farmer registered successfully!");
      setStep(4);
      
      // Reset form after 2 seconds
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (error) {
      console.error('Error registering farmer:', error);
      toast.error("Failed to register farmer. Saved offline.");
      
      // Save to offline queue as fallback
      const updated = [...pendingSubmissions, formData];
      setPendingSubmissions(updated);
      localStorage.setItem('pendingFarmerSubmissions', JSON.stringify(updated));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      phoneNumber: "",
      email: "",
      address: "",
      village: "",
      district: "",
      region: "",
      nationalId: "",
      photoUrl: null,
      farmName: "",
      farmSize: "",
      latitude: null,
      longitude: null,
    });
    setStep(1);
    if (marker) {
      marker.remove();
      setMarker(null);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s === step
                ? "bg-primary text-primary-foreground"
                : s < step
                ? "bg-green-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
          </div>
          {s < 3 && (
            <div
              className={`w-12 h-1 mx-1 ${
                s < step ? "bg-green-500" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="container max-w-2xl py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Quick Farmer Registration</h1>
            <p className="text-muted-foreground">
              Fast and easy farmer data collection
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="destructive">Offline</Badge>
            )}
            {pendingSubmissions.length > 0 && (
              <Badge variant="secondary">
                {pendingSubmissions.length} pending
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {step === 1 && "Personal Information"}
              {step === 2 && "Location Details"}
              {step === 3 && "Farm Information"}
              {step === 4 && "Registration Complete!"}
            </CardTitle>
            <CardDescription>
              {step === 1 && "Enter farmer's basic details"}
              {step === 2 && "Provide address and location"}
              {step === 3 && "Add farm details and location"}
              {step === 4 && "Farmer has been registered successfully"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step < 4 && renderStepIndicator()}

            {step === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">
                      First Name <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="firstName"
                        placeholder="John"
                        className="pl-9"
                        value={formData.firstName}
                        onChange={(e) => handleInputChange("firstName", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">
                      Last Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) => handleInputChange("lastName", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">
                    Phone Number <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phoneNumber"
                      type="tel"
                      placeholder="+1234567890"
                      className="pl-9"
                      value={formData.phoneNumber}
                      onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email (Optional)</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="john@example.com"
                      className="pl-9"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationalId">National ID (Optional)</Label>
                  <Input
                    id="nationalId"
                    placeholder="ID Number"
                    value={formData.nationalId}
                    onChange={(e) => handleInputChange("nationalId", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Farmer Photo (Optional)</Label>
                  <PhotoUpload
                    currentPhotoUrl={formData.photoUrl || undefined}
                    onPhotoChange={(url) => handleInputChange("photoUrl", url)}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address</Label>
                  <div className="relative">
                    <Home className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Textarea
                      id="address"
                      placeholder="Enter street address"
                      className="pl-9"
                      value={formData.address}
                      onChange={(e) => handleInputChange("address", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="village">
                    Village <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="village"
                    placeholder="Village name"
                    value={formData.village}
                    onChange={(e) => handleInputChange("village", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="district">
                      District <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="district"
                      placeholder="District"
                      value={formData.district}
                      onChange={(e) => handleInputChange("district", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="region">
                      Region <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="region"
                      placeholder="Region"
                      value={formData.region}
                      onChange={(e) => handleInputChange("region", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="farmName">
                    Farm Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="farmName"
                    placeholder="e.g., Green Valley Farm"
                    value={formData.farmName}
                    onChange={(e) => handleInputChange("farmName", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="farmSize">Farm Size (acres)</Label>
                  <Input
                    id="farmSize"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 5.5"
                    value={formData.farmSize}
                    onChange={(e) => handleInputChange("farmSize", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    Farm Location <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    Click on the map or drag the marker to set farm location
                  </p>
                  {formData.latitude && formData.longitude && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                      </span>
                    </div>
                  )}
                  <div className="h-[400px] rounded-lg overflow-hidden border">
                    <MapView onMapReady={handleMapReady} />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="text-center py-8">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  Registration Successful!
                </h3>
                <p className="text-muted-foreground mb-6">
                  {formData.firstName} {formData.lastName} has been registered
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={resetForm}>
                    Register Another Farmer
                  </Button>
                  <Button variant="outline" onClick={() => navigate("/farmers")}>
                    View All Farmers
                  </Button>
                </div>
              </div>
            )}

            {step < 4 && (
              <div className="flex justify-between mt-6 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={step === 1}
                >
                  Previous
                </Button>
                {step < 3 ? (
                  <Button onClick={nextStep}>
                    Next
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
