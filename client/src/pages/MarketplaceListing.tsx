import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { CameraUpload } from "@/components/CameraUpload";
import { toast } from "sonner";
import { compressImage, formatFileSize } from "@/lib/imageCompression";

export default function MarketplaceListing() {
  const [, params] = useRoute("/marketplace/edit/:id");
  const [, setLocation] = useLocation();
  const listingId = params?.id ? parseInt(params.id) : null;
  const isEdit = !!listingId;

  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const uploadImageMutation = trpc.marketplace.uploadImage.useMutation();

    const [formData, setFormData] = useState({
      title: "",
      description: "",
      category: "vegetables",
      quantity: "",
      unit: "kg",
      pricePerUnit: "",
      organic: false,
      certification: "",
      availableFrom: "",
      availableUntil: "",
      deliveryPickup: true,
      deliveryDelivery: false,
      deliveryShipping: false,
      locationAddress: "",
      locationCity: "",
      locationState: "",
      locationZip: "",
          // Meat/Livestock specific fields
          animalType: "",
          servingType: "",
          allowGroupBuying: false,
          minBuyers: "",
          maxBuyers: "",
          butcheringIncluded: false,
          // Delivery scheduling fields
          pickupDays: "",
          pickupTimeSlot: "",
          deliveryRadius: "",
          deliveryFee: "",
          minOrderDelivery: "",
          shippingFee: "",
          coldChainRequired: false,
        });

  const handleImageCapture = async (imageData: string, file: File) => {
    try {
      setUploadingPhoto(true);
      
      // Compress image before upload
      const compressed = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
        maxSizeMB: 2,
        outputFormat: 'image/jpeg',
      });
      
      // Show compression stats
      const savings = compressed.compressionRatio.toFixed(1);
      console.warn(`Image compressed: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)} (${savings}% reduction)`);
      
      // Add compressed photo to photos array for preview
      setPhotos(prev => [...prev, compressed.dataUrl]);
      
      // Upload compressed image to S3 storage
      const result = await uploadImageMutation.mutateAsync({
        imageData: compressed.dataUrl.split(',')[1], // Remove data:image/... prefix
        fileName: compressed.compressedFile.name,
        contentType: compressed.compressedFile.type,
      });
      
      // Store the S3 URL for form submission
      setPhotos(prev => {
        const newPhotos = [...prev];
        newPhotos[newPhotos.length - 1] = result.url;
        return newPhotos;
      });
      
      toast.success(`Photo uploaded (${savings}% smaller)`);
    } catch (error) {
      toast.error("Failed to upload photo. Please try again.");
      console.error("Photo upload error:", error);
      // Remove the failed photo from preview
      setPhotos(prev => prev.slice(0, -1));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const { data: existingListing, isLoading: loadingListing } = trpc.marketplace.getListing.useQuery(
    { id: listingId! },
    { enabled: isEdit }
  );

  useEffect(() => {
    if (existingListing) {
      setFormData({
        title: existingListing.title,
        description: existingListing.description || "",
        category: existingListing.category,
        quantity: existingListing.quantity.toString(),
        unit: existingListing.unit,
        pricePerUnit: (existingListing.pricePerUnit / 100).toString(),
        organic: existingListing.organic ?? false,
        certification: existingListing.certification || "",
        availableFrom: existingListing.availableFrom
          ? new Date(existingListing.availableFrom).toISOString().split("T")[0]
          : "",
        availableUntil: existingListing.availableUntil
          ? new Date(existingListing.availableUntil).toISOString().split("T")[0]
          : "",
        deliveryPickup: existingListing.deliveryOptions?.pickup ?? false,
        deliveryDelivery: existingListing.deliveryOptions?.delivery ?? false,
        deliveryShipping: existingListing.deliveryOptions?.shipping ?? false,
        locationAddress: existingListing.location?.address || "",
        locationCity: existingListing.location?.city || "",
        locationState: existingListing.location?.state || "",
        locationZip: existingListing.location?.zip || "",
        animalType: "",
        servingType: "",
        allowGroupBuying: false,
        minBuyers: "",
        maxBuyers: "",
        butcheringIncluded: false,
        pickupDays: "",
        pickupTimeSlot: "",
        deliveryRadius: "",
        deliveryFee: "",
        minOrderDelivery: "",
        shippingFee: "",
        coldChainRequired: false,
      });
    }
  }, [existingListing]);

  const createMutation = trpc.marketplace.createListing.useMutation({
    onSuccess: () => {
      toast.success("Listing created successfully!");
      setLocation("/my-listings");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.marketplace.updateListing.useMutation({
    onSuccess: () => {
      toast.success("Listing updated successfully!");
      setLocation("/my-listings");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.quantity || !formData.pricePerUnit) {
      toast.error("Please fill in all required fields");
      return;
    }

    const quantity = parseFloat(formData.quantity);
    const pricePerUnit = Math.round(parseFloat(formData.pricePerUnit) * 100); // Convert to cents

    if (quantity <= 0 || pricePerUnit <= 0) {
      toast.error("Quantity and price must be positive numbers");
      return;
    }

    const payload: any = {
      title: formData.title,
      description: formData.description || undefined,
      category: formData.category as any,
      quantity,
      unit: formData.unit as any,
      pricePerUnit,
      organic: formData.organic,
      certification: formData.certification || undefined,
      availableFrom: formData.availableFrom || undefined,
      availableUntil: formData.availableUntil || undefined,
      deliveryOptions: {
        pickup: formData.deliveryPickup,
        delivery: formData.deliveryDelivery,
        shipping: formData.deliveryShipping,
      },
      location: {
        address: formData.locationAddress || undefined,
        city: formData.locationCity || undefined,
        state: formData.locationState || undefined,
        zip: formData.locationZip || undefined,
      },
      photos: photos.length > 0 ? photos : undefined,
    };

    if (isEdit) {
      updateMutation.mutate({
        id: listingId!,
        ...payload,
      });
    } else {
      createMutation.mutate(payload);
    }
  };

  if (isEdit && loadingListing) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 max-w-4xl">
        <Button variant="ghost" className="mb-6" onClick={() => setLocation("/my-listings")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to My Listings
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{isEdit ? "Edit Listing" : "Create New Listing"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>

                <div>
                  <Label htmlFor="title">Product Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Fresh Organic Tomatoes"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your product..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger id="category">
                        <SelectValue />
                      </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="vegetables">Vegetables</SelectItem>
                                              <SelectItem value="fruits">Fruits</SelectItem>
                                              <SelectItem value="grains">Grains</SelectItem>
                                              <SelectItem value="dairy">Dairy</SelectItem>
                                              <SelectItem value="meat">Meat & Livestock</SelectItem>
                                              <SelectItem value="poultry">Poultry</SelectItem>
                                              <SelectItem value="eggs">Eggs</SelectItem>
                                              <SelectItem value="honey">Honey</SelectItem>
                                              <SelectItem value="services">Farm Services</SelectItem>
                                              <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2 pt-8">
                    <Checkbox
                      id="organic"
                      checked={formData.organic}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, organic: checked as boolean })
                      }
                    />
                    <Label htmlFor="organic" className="cursor-pointer">
                      Organic Product
                    </Label>
                  </div>
                </div>

                              {formData.organic && (
                                <div>
                                  <Label htmlFor="certification">Certification (Optional)</Label>
                                  <Input
                                    id="certification"
                                    value={formData.certification}
                                    onChange={(e) => setFormData({ ...formData, certification: e.target.value })}
                                    placeholder="e.g., USDA Organic"
                                  />
                                </div>
                              )}

                              {/* Meat/Livestock Specific Options */}
                              {(formData.category === "meat" || formData.category === "poultry") && (
                                <div className="p-4 bg-orange-50 rounded-lg border border-orange-200 space-y-4">
                                  <h4 className="font-medium text-orange-800 flex items-center gap-2">
                                    <span>Meat & Livestock Options</span>
                                  </h4>
                    
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <Label htmlFor="animalType">Animal Type</Label>
                                      <Select
                                        value={formData.animalType || ""}
                                        onValueChange={(value) => setFormData({ ...formData, animalType: value })}
                                      >
                                        <SelectTrigger id="animalType">
                                          <SelectValue placeholder="Select animal type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="goat">Goat</SelectItem>
                                          <SelectItem value="cow">Cow/Beef</SelectItem>
                                          <SelectItem value="sheep">Sheep/Lamb</SelectItem>
                                          <SelectItem value="pig">Pig/Pork</SelectItem>
                                          <SelectItem value="chicken">Chicken</SelectItem>
                                          <SelectItem value="turkey">Turkey</SelectItem>
                                          <SelectItem value="duck">Duck</SelectItem>
                                          <SelectItem value="fish">Fish</SelectItem>
                                          <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>

                                    <div>
                                      <Label htmlFor="servingType">Serving Type</Label>
                                      <Select
                                        value={formData.servingType || ""}
                                        onValueChange={(value) => setFormData({ ...formData, servingType: value })}
                                      >
                                        <SelectTrigger id="servingType">
                                          <SelectValue placeholder="How is it sold?" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="whole">Whole Animal</SelectItem>
                                          <SelectItem value="half">Half Animal</SelectItem>
                                          <SelectItem value="quarter">Quarter Animal</SelectItem>
                                          <SelectItem value="cuts">Individual Cuts</SelectItem>
                                          <SelectItem value="ground">Ground/Minced</SelectItem>
                                          <SelectItem value="live">Live Animal</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="allowGroupBuying"
                                      checked={formData.allowGroupBuying || false}
                                      onCheckedChange={(checked) =>
                                        setFormData({ ...formData, allowGroupBuying: checked as boolean })
                                      }
                                    />
                                    <Label htmlFor="allowGroupBuying" className="cursor-pointer">
                                      Allow Group Buying (let multiple buyers share this animal)
                                    </Label>
                                  </div>

                                  {formData.allowGroupBuying && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                      <div>
                                        <Label htmlFor="minBuyers">Minimum Buyers</Label>
                                        <Input
                                          id="minBuyers"
                                          type="number"
                                          value={formData.minBuyers || ""}
                                          onChange={(e) => setFormData({ ...formData, minBuyers: e.target.value })}
                                          placeholder="e.g., 4"
                                          min="2"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="maxBuyers">Maximum Buyers</Label>
                                        <Input
                                          id="maxBuyers"
                                          type="number"
                                          value={formData.maxBuyers || ""}
                                          onChange={(e) => setFormData({ ...formData, maxBuyers: e.target.value })}
                                          placeholder="e.g., 8"
                                          min="2"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="butcheringIncluded"
                                      checked={formData.butcheringIncluded || false}
                                      onCheckedChange={(checked) =>
                                        setFormData({ ...formData, butcheringIncluded: checked as boolean })
                                      }
                                    />
                                    <Label htmlFor="butcheringIncluded" className="cursor-pointer">
                                      Butchering/Processing Included
                                    </Label>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Pricing & Quantity */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Pricing & Quantity</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder="100"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <Label htmlFor="unit">Unit *</Label>
                    <Select
                      value={formData.unit}
                      onValueChange={(value) => setFormData({ ...formData, unit: value })}
                    >
                      <SelectTrigger id="unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">Kilograms (kg)</SelectItem>
                        <SelectItem value="lbs">Pounds (lbs)</SelectItem>
                        <SelectItem value="units">Units</SelectItem>
                        <SelectItem value="dozens">Dozens</SelectItem>
                        <SelectItem value="liters">Liters</SelectItem>
                        <SelectItem value="grams">Grams</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="pricePerUnit">Price per Unit ($) *</Label>
                    <Input
                      id="pricePerUnit"
                      type="number"
                      value={formData.pricePerUnit}
                      onChange={(e) => setFormData({ ...formData, pricePerUnit: e.target.value })}
                      placeholder="5.99"
                      required
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              {/* Availability */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Availability</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="availableFrom">Available From</Label>
                    <Input
                      id="availableFrom"
                      type="date"
                      value={formData.availableFrom}
                      onChange={(e) => setFormData({ ...formData, availableFrom: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label htmlFor="availableUntil">Available Until</Label>
                    <Input
                      id="availableUntil"
                      type="date"
                      value={formData.availableUntil}
                      onChange={(e) => setFormData({ ...formData, availableUntil: e.target.value })}
                    />
                  </div>
                </div>
              </div>

                            {/* Delivery Options */}
                            <div className="space-y-4">
                              <h3 className="text-lg font-semibold">Delivery Options</h3>

                              <div className="space-y-4">
                                {/* Farm Pickup */}
                                <div className="p-3 border rounded-lg space-y-3">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="deliveryPickup"
                                      checked={formData.deliveryPickup}
                                      onCheckedChange={(checked) =>
                                        setFormData({ ...formData, deliveryPickup: checked as boolean })
                                      }
                                    />
                                    <Label htmlFor="deliveryPickup" className="cursor-pointer font-medium">
                                      Farm Pickup
                                    </Label>
                                  </div>
                    
                                  {formData.deliveryPickup && (
                                    <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor="pickupDays" className="text-sm">Available Days</Label>
                                        <Select
                                          value={formData.pickupDays || ""}
                                          onValueChange={(value) => setFormData({ ...formData, pickupDays: value })}
                                        >
                                          <SelectTrigger id="pickupDays">
                                            <SelectValue placeholder="Select days" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="weekdays">Weekdays Only</SelectItem>
                                            <SelectItem value="weekends">Weekends Only</SelectItem>
                                            <SelectItem value="all">Any Day</SelectItem>
                                            <SelectItem value="saturday">Saturdays Only</SelectItem>
                                            <SelectItem value="custom">By Appointment</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label htmlFor="pickupTimeSlot" className="text-sm">Time Slot</Label>
                                        <Select
                                          value={formData.pickupTimeSlot || ""}
                                          onValueChange={(value) => setFormData({ ...formData, pickupTimeSlot: value })}
                                        >
                                          <SelectTrigger id="pickupTimeSlot">
                                            <SelectValue placeholder="Select time" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="morning">Morning (8am-12pm)</SelectItem>
                                            <SelectItem value="afternoon">Afternoon (12pm-5pm)</SelectItem>
                                            <SelectItem value="evening">Evening (5pm-8pm)</SelectItem>
                                            <SelectItem value="flexible">Flexible</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Local Delivery */}
                                <div className="p-3 border rounded-lg space-y-3">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="deliveryDelivery"
                                      checked={formData.deliveryDelivery}
                                      onCheckedChange={(checked) =>
                                        setFormData({ ...formData, deliveryDelivery: checked as boolean })
                                      }
                                    />
                                    <Label htmlFor="deliveryDelivery" className="cursor-pointer font-medium">
                                      Local Delivery
                                    </Label>
                                  </div>
                    
                                  {formData.deliveryDelivery && (
                                    <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor="deliveryRadius" className="text-sm">Delivery Radius</Label>
                                        <Select
                                          value={formData.deliveryRadius || ""}
                                          onValueChange={(value) => setFormData({ ...formData, deliveryRadius: value })}
                                        >
                                          <SelectTrigger id="deliveryRadius">
                                            <SelectValue placeholder="Select radius" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="5">Within 5 km</SelectItem>
                                            <SelectItem value="10">Within 10 km</SelectItem>
                                            <SelectItem value="25">Within 25 km</SelectItem>
                                            <SelectItem value="50">Within 50 km</SelectItem>
                                            <SelectItem value="100">Within 100 km</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label htmlFor="deliveryFee" className="text-sm">Delivery Fee ($)</Label>
                                        <Input
                                          id="deliveryFee"
                                          type="number"
                                          value={formData.deliveryFee || ""}
                                          onChange={(e) => setFormData({ ...formData, deliveryFee: e.target.value })}
                                          placeholder="0 for free delivery"
                                          min="0"
                                          step="0.01"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="minOrderDelivery" className="text-sm">Min Order for Delivery ($)</Label>
                                        <Input
                                          id="minOrderDelivery"
                                          type="number"
                                          value={formData.minOrderDelivery || ""}
                                          onChange={(e) => setFormData({ ...formData, minOrderDelivery: e.target.value })}
                                          placeholder="e.g., 50"
                                          min="0"
                                          step="0.01"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Shipping */}
                                <div className="p-3 border rounded-lg space-y-3">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="deliveryShipping"
                                      checked={formData.deliveryShipping}
                                      onCheckedChange={(checked) =>
                                        setFormData({ ...formData, deliveryShipping: checked as boolean })
                                      }
                                    />
                                    <Label htmlFor="deliveryShipping" className="cursor-pointer font-medium">
                                      Shipping (Nationwide)
                                    </Label>
                                  </div>
                    
                                  {formData.deliveryShipping && (
                                    <div className="ml-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div>
                                        <Label htmlFor="shippingFee" className="text-sm">Shipping Fee ($)</Label>
                                        <Input
                                          id="shippingFee"
                                          type="number"
                                          value={formData.shippingFee || ""}
                                          onChange={(e) => setFormData({ ...formData, shippingFee: e.target.value })}
                                          placeholder="Flat rate shipping"
                                          min="0"
                                          step="0.01"
                                        />
                                      </div>
                                      <div className="flex items-center space-x-2 pt-6">
                                        <Checkbox
                                          id="coldChainRequired"
                                          checked={formData.coldChainRequired || false}
                                          onCheckedChange={(checked) =>
                                            setFormData({ ...formData, coldChainRequired: checked as boolean })
                                          }
                                        />
                                        <Label htmlFor="coldChainRequired" className="cursor-pointer text-sm">
                                          Requires Cold Chain
                                        </Label>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

              {/* Location */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Location (Optional)</h3>

                <div>
                  <Label htmlFor="locationAddress">Address</Label>
                  <Input
                    id="locationAddress"
                    value={formData.locationAddress}
                    onChange={(e) => setFormData({ ...formData, locationAddress: e.target.value })}
                    placeholder="123 Farm Road"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="locationCity">City</Label>
                    <Input
                      id="locationCity"
                      value={formData.locationCity}
                      onChange={(e) => setFormData({ ...formData, locationCity: e.target.value })}
                      placeholder="Springfield"
                    />
                  </div>

                  <div>
                    <Label htmlFor="locationState">State</Label>
                    <Input
                      id="locationState"
                      value={formData.locationState}
                      onChange={(e) => setFormData({ ...formData, locationState: e.target.value })}
                      placeholder="CA"
                    />
                  </div>

                  <div>
                    <Label htmlFor="locationZip">ZIP Code</Label>
                    <Input
                      id="locationZip"
                      value={formData.locationZip}
                      onChange={(e) => setFormData({ ...formData, locationZip: e.target.value })}
                      placeholder="12345"
                    />
                  </div>
                </div>
             </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label>Product Photos</Label>
            <CameraUpload
              onImageCapture={handleImageCapture}
              maxSizeMB={3}
              quality={0.85}
            />
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}             <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Save className="h-4 w-4 mr-2" />
                  {isEdit ? "Update Listing" : "Create Listing"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/my-listings")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
