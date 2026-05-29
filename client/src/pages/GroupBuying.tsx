import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Users, 
  ShoppingCart, 
  Leaf, 
  MapPin, 
  Clock, 
  Share2, 
  UserPlus, 
  Package,
  Truck,
  Store,
  Beef,
  Apple,
  Wheat,
  Egg,
  Milk,
  ChevronRight,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { ModernCard } from "@/components/ui/modern-card";
import { useLocalization } from "@/contexts/LocalizationContext";

// Sample group buying listings - in production, this would come from the backend
const sampleGroupBuyings = [
  {
    id: 1,
    title: "Whole Goat - Fresh Farm Raised",
    description: "Premium farm-raised goat, perfect for sharing among families. Includes butchering into serving portions.",
    category: "meat",
    totalWeight: 25, // kg
    pricePerKg: 1500, // in cents
    totalPrice: 37500,
    minParticipants: 4,
    maxParticipants: 8,
    currentParticipants: 3,
    servingSizes: [
      { name: "Quarter (6.25kg)", weight: 6.25, price: 9375, available: 2 },
      { name: "Half (12.5kg)", weight: 12.5, price: 18750, available: 1 },
      { name: "Whole (25kg)", weight: 25, price: 37500, available: 0 },
    ],
    deliveryOptions: ["pickup", "delivery"],
    pickupLocation: "Lagos Farm Market, Ikeja",
    deliveryDate: "2025-01-05",
    seller: { name: "Adebayo Farms", rating: 4.8, verified: true },
    photos: [],
    organic: true,
    status: "open", // open, filled, completed
    participants: [
      { id: 1, name: "John O.", portion: "Quarter", paid: true },
      { id: 2, name: "Mary A.", portion: "Quarter", paid: true },
      { id: 3, name: "Samuel K.", portion: "Half", paid: false },
    ]
  },
  {
    id: 2,
    title: "Whole Cow - Premium Beef",
    description: "Grass-fed beef cow, professionally butchered into family portions. Great value for bulk buying.",
    category: "meat",
    totalWeight: 200, // kg
    pricePerKg: 2000,
    totalPrice: 400000,
    minParticipants: 8,
    maxParticipants: 16,
    currentParticipants: 6,
    servingSizes: [
      { name: "1/8 Share (25kg)", weight: 25, price: 50000, available: 4 },
      { name: "1/4 Share (50kg)", weight: 50, price: 100000, available: 2 },
      { name: "1/2 Share (100kg)", weight: 100, price: 200000, available: 1 },
    ],
    deliveryOptions: ["pickup", "delivery"],
    pickupLocation: "Kano Livestock Market",
    deliveryDate: "2025-01-10",
    seller: { name: "Northern Ranches", rating: 4.9, verified: true },
    photos: [],
    organic: false,
    status: "open",
    participants: []
  },
  {
    id: 3,
    title: "Bulk Tomatoes - 50kg Crate",
    description: "Fresh Roma tomatoes, perfect for restaurants or families who want to make paste. Share with neighbors!",
    category: "vegetables",
    totalWeight: 50,
    pricePerKg: 300,
    totalPrice: 15000,
    minParticipants: 5,
    maxParticipants: 10,
    currentParticipants: 7,
    servingSizes: [
      { name: "5kg Basket", weight: 5, price: 1500, available: 3 },
      { name: "10kg Basket", weight: 10, price: 3000, available: 2 },
      { name: "25kg Half Crate", weight: 25, price: 7500, available: 0 },
    ],
    deliveryOptions: ["pickup", "delivery"],
    pickupLocation: "Mile 12 Market, Lagos",
    deliveryDate: "2025-01-03",
    seller: { name: "Green Valley Farms", rating: 4.7, verified: true },
    photos: [],
    organic: true,
    status: "almost_full",
    participants: []
  },
  {
    id: 4,
    title: "Whole Pig - Farm Fresh Pork",
    description: "Free-range pig, butchered into your preferred cuts. Perfect for events or sharing among families.",
    category: "meat",
    totalWeight: 80,
    pricePerKg: 1800,
    totalPrice: 144000,
    minParticipants: 4,
    maxParticipants: 8,
    currentParticipants: 2,
    servingSizes: [
      { name: "Quarter (20kg)", weight: 20, price: 36000, available: 3 },
      { name: "Half (40kg)", weight: 40, price: 72000, available: 1 },
      { name: "Whole (80kg)", weight: 80, price: 144000, available: 0 },
    ],
    deliveryOptions: ["pickup"],
    pickupLocation: "Ibadan Farm Gate",
    deliveryDate: "2025-01-08",
    seller: { name: "Heritage Farms", rating: 4.6, verified: true },
    photos: [],
    organic: false,
    status: "open",
    participants: []
  },
];

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "meat": return <Beef className="h-4 w-4" />;
    case "vegetables": return <Leaf className="h-4 w-4" />;
    case "fruits": return <Apple className="h-4 w-4" />;
    case "grains": return <Wheat className="h-4 w-4" />;
    case "eggs": return <Egg className="h-4 w-4" />;
    case "dairy": return <Milk className="h-4 w-4" />;
    default: return <Package className="h-4 w-4" />;
  }
};

const getStatusBadge = (status: string, currentParticipants: number, minParticipants: number) => {
  if (status === "completed") {
    return <Badge className="bg-gray-500">Completed</Badge>;
  }
  if (status === "filled" || currentParticipants >= minParticipants) {
    return <Badge className="bg-green-500">Ready to Process</Badge>;
  }
  if (status === "almost_full") {
    return <Badge className="bg-yellow-500">Almost Full</Badge>;
  }
  return <Badge className="bg-blue-500">Open for Joining</Badge>;
};

export default function GroupBuying() {
  const { formatCurrency } = useLocalization();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedDelivery, setSelectedDelivery] = useState<string>("all");
  const [joinModalOpen, setJoinModalOpen] = useState<number | null>(null);
  const [selectedPortion, setSelectedPortion] = useState<string>("");

  const filteredListings = sampleGroupBuyings.filter(listing => {
    if (selectedCategory !== "all" && listing.category !== selectedCategory) return false;
    if (selectedDelivery !== "all" && !listing.deliveryOptions.includes(selectedDelivery)) return false;
    return true;
  });

  const handleJoinGroup = (listingId: number, portionName: string) => {
    toast.success(`You've joined the group buy for ${portionName}! Check your orders for details.`);
    setJoinModalOpen(null);
    setSelectedPortion("");
  };

  const handleShareListing = (listing: typeof sampleGroupBuyings[0]) => {
    if (navigator.share) {
      navigator.share({
        title: listing.title,
        text: `Join me in this group buy: ${listing.title}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="gradient-hero text-white py-12 md:py-16">
        <div className="container">
          <div className="max-w-2xl animate-fade-in">
            <Badge className="bg-white/20 text-white border-white/30 mb-4">
              <Users className="w-3 h-3 mr-1" />
              Community Buying
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">Group Buying</h1>
            <p className="text-lg md:text-xl opacity-90">
              Share bulk purchases with your community. Buy whole animals, large produce quantities, and save together!
            </p>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* How It Works */}
        <ModernCard className="mb-8 -mt-8 relative z-10" variant="elevated">
          <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            How Group Buying Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">1</div>
              <div>
                <h3 className="font-medium">Browse Listings</h3>
                <p className="text-sm text-muted-foreground">Find bulk products like whole animals or large produce quantities</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">2</div>
              <div>
                <h3 className="font-medium">Choose Your Portion</h3>
                <p className="text-sm text-muted-foreground">Select the serving size that fits your needs</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">3</div>
              <div>
                <h3 className="font-medium">Join the Group</h3>
                <p className="text-sm text-muted-foreground">Pay for your portion and wait for the group to fill</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">4</div>
              <div>
                <h3 className="font-medium">Pickup or Delivery</h3>
                <p className="text-sm text-muted-foreground">Get your portion delivered or pick it up on the scheduled date</p>
              </div>
            </div>
          </div>
        </ModernCard>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="meat">Meat & Livestock</SelectItem>
              <SelectItem value="vegetables">Vegetables</SelectItem>
              <SelectItem value="fruits">Fruits</SelectItem>
              <SelectItem value="grains">Grains</SelectItem>
              <SelectItem value="dairy">Dairy</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedDelivery} onValueChange={setSelectedDelivery}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Delivery" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Options</SelectItem>
              <SelectItem value="pickup">Pickup Only</SelectItem>
              <SelectItem value="delivery">Delivery Available</SelectItem>
            </SelectContent>
          </Select>

          <Link href="/marketplace/create-group">
            <Button className="ml-auto">
              <UserPlus className="w-4 h-4 mr-2" />
              Start a Group Buy
            </Button>
          </Link>
        </div>

        {/* Listings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredListings.map((listing) => (
            <ModernCard key={listing.id} className="overflow-hidden" padding="none">
              <div className="p-6">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        {getCategoryIcon(listing.category)}
                        {listing.category}
                      </Badge>
                      {listing.organic && (
                        <Badge className="bg-green-100 text-green-800 border-green-300">
                          <Leaf className="w-3 h-3 mr-1" />
                          Organic
                        </Badge>
                      )}
                      {getStatusBadge(listing.status, listing.currentParticipants, listing.minParticipants)}
                    </div>
                    <h3 className="text-xl font-semibold">{listing.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{listing.description}</p>
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {listing.currentParticipants} / {listing.minParticipants} participants (min)
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round((listing.currentParticipants / listing.minParticipants) * 100)}% filled
                    </span>
                  </div>
                  <Progress 
                    value={(listing.currentParticipants / listing.minParticipants) * 100} 
                    className="h-2"
                  />
                </div>

                {/* Serving Sizes */}
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2">Available Portions:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {listing.servingSizes.map((size, idx) => (
                      <div 
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          size.available > 0 
                            ? 'border-primary/30 bg-primary/5 cursor-pointer hover:bg-primary/10' 
                            : 'border-gray-200 bg-gray-50 opacity-50'
                        }`}
                        onClick={() => {
                          if (size.available > 0) {
                            setJoinModalOpen(listing.id);
                            setSelectedPortion(size.name);
                          }
                        }}
                      >
                        <div className="font-medium text-sm">{size.name}</div>
                        <div className="text-lg font-bold text-primary">
                          {formatCurrency(size.price / 100)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {size.available > 0 ? `${size.available} available` : 'Sold out'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Ready: {new Date(listing.deliveryDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">{listing.pickupLocation}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {listing.deliveryOptions.includes("delivery") ? (
                      <>
                        <Truck className="w-4 h-4 text-muted-foreground" />
                        <span>Delivery Available</span>
                      </>
                    ) : (
                      <>
                        <Store className="w-4 h-4 text-muted-foreground" />
                        <span>Pickup Only</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-muted-foreground" />
                    <span>{formatCurrency(listing.pricePerKg / 100)}/kg</span>
                  </div>
                </div>

                {/* Seller */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {listing.seller.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium flex items-center gap-1">
                        {listing.seller.name}
                        {listing.seller.verified && (
                          <CheckCircle2 className="w-3 h-3 text-blue-500" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Rating: {listing.seller.rating}/5
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleShareListing(listing)}
                    >
                      <Share2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => setJoinModalOpen(listing.id)}
                      disabled={listing.status === "completed"}
                    >
                      Join Group
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Join Modal */}
              {joinModalOpen === listing.id && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <Card className="w-full max-w-md">
                    <CardHeader>
                      <CardTitle>Join Group Buy</CardTitle>
                      <CardDescription>{listing.title}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Select Your Portion</label>
                        <Select value={selectedPortion} onValueChange={setSelectedPortion}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a portion size" />
                          </SelectTrigger>
                          <SelectContent>
                            {listing.servingSizes.filter(s => s.available > 0).map((size, idx) => (
                              <SelectItem key={idx} value={size.name}>
                                {size.name} - {formatCurrency(size.price / 100)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Delivery Preference</label>
                        <Select defaultValue="pickup">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pickup">
                              <div className="flex items-center gap-2">
                                <Store className="w-4 h-4" />
                                Pickup at {listing.pickupLocation}
                              </div>
                            </SelectItem>
                            {listing.deliveryOptions.includes("delivery") && (
                              <SelectItem value="delivery">
                                <div className="flex items-center gap-2">
                                  <Truck className="w-4 h-4" />
                                  Home Delivery (+fee)
                                </div>
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="bg-muted/50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 text-sm">
                          <AlertCircle className="w-4 h-4 text-yellow-500" />
                          <span>Payment will be held until the group is complete</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => {
                          setJoinModalOpen(null);
                          setSelectedPortion("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        className="flex-1"
                        disabled={!selectedPortion}
                        onClick={() => handleJoinGroup(listing.id, selectedPortion)}
                      >
                        <ShoppingCart className="w-4 h-4 mr-2" />
                        Join & Pay
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              )}
            </ModernCard>
          ))}
        </div>

        {filteredListings.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No group buys found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your filters or start your own group buy!
            </p>
            <Link href="/marketplace/create-group">
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Start a Group Buy
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
