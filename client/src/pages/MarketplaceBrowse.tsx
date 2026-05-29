import { useState, useEffect } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShoppingCart, Leaf, MapPin, DollarSign, X, ArrowUpDown, Filter, Grid3X3, List, Star, Heart, Eye } from "lucide-react";
import { useLocation as useWouterLocation } from "wouter";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { ModernCard } from "@/components/ui/modern-card";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function MarketplaceBrowse() {
  const [, setWouterLocation] = useWouterLocation();
  const { formatCurrency, getCurrencySymbol } = useLocalization();
  
  // Get URL params
  const urlParams = new URLSearchParams(window.location.search);
  
  const [searchTerm, setSearchTerm] = useState(urlParams.get('search') || "");
  const [category, setCategory] = useState<string>(urlParams.get('category') || "");
  const [location, setLocation] = useState<string>(urlParams.get('location') || "");
  const [organicOnly, setOrganicOnly] = useState<boolean | undefined>(
    urlParams.get('organic') === 'true' ? true : 
    urlParams.get('organic') === 'false' ? false : undefined
  );
  const [minPrice, setMinPrice] = useState<string>(urlParams.get('minPrice') || "");
  const [maxPrice, setMaxPrice] = useState<string>(urlParams.get('maxPrice') || "");
  const [sortBy, setSortBy] = useState<string>(urlParams.get('sort') || "newest");

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchTerm) params.set('search', searchTerm);
    if (category) params.set('category', category);
    if (location) params.set('location', location);
    if (organicOnly !== undefined) params.set('organic', String(organicOnly));
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    if (sortBy) params.set('sort', sortBy);
    
    const newUrl = params.toString() ? `?${params.toString()}` : '';
    window.history.replaceState({}, '', `/marketplace${newUrl}`);
  }, [searchTerm, category, location, organicOnly, minPrice, maxPrice, sortBy]);

  const { data: listings, isLoading, refetch } = trpc.marketplace.searchListings.useQuery({
    searchTerm: searchTerm || undefined,
    category: category || undefined,
    organic: organicOnly,
    minPrice: minPrice ? parseFloat(minPrice) * 100 : undefined, // Convert to cents
    maxPrice: maxPrice ? parseFloat(maxPrice) * 100 : undefined,
    limit: 20,
    offset: 0,
  });

  const addToCartMutation = trpc.marketplace.addToCart.useMutation({
    onSuccess: () => {
      toast.success("Added to cart!");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleAddToCart = (listingId: number) => {
    addToCartMutation.mutate({ listingId, quantity: 1 });
  };

  const formatPrice = (cents: number) => {
    return formatCurrency(cents / 100);
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Modern Hero Header */}
      <div className="gradient-hero text-white py-12 md:py-16">
        <div className="container">
          <div className="max-w-2xl animate-fade-in">
            <Badge className="bg-white/20 text-white border-white/30 mb-4">
              <Leaf className="w-3 h-3 mr-1" />
              Farm Fresh
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight">Marketplace</h1>
            <p className="text-lg md:text-xl opacity-90">
              Fresh produce directly from local farmers to your table
            </p>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Modern Search and Filters */}
        <ModernCard className="mb-8 -mt-8 relative z-10 animate-slide-up" variant="elevated">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Search & Filter</h2>
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* Search */}
              <div className="lg:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Search" placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Category */}
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="vegetables">Vegetables</SelectItem>
                  <SelectItem value="fruits">Fruits</SelectItem>
                  <SelectItem value="grains">Grains</SelectItem>
                  <SelectItem value="dairy">Dairy</SelectItem>
                  <SelectItem value="meat">Meat</SelectItem>
                  <SelectItem value="eggs">Eggs</SelectItem>
                  <SelectItem value="honey">Honey</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              {/* Organic Filter */}
              <Select
                value={organicOnly === undefined ? "all" : organicOnly ? "yes" : "no"}
                onValueChange={(value) => {
                  if (value === "all") setOrganicOnly(undefined);
                  else setOrganicOnly(value === "yes");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Organic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  <SelectItem value="yes">Organic Only</SelectItem>
                  <SelectItem value="no">Conventional</SelectItem>
                </SelectContent>
              </Select>

              {/* Location Filter */}
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  <SelectItem value="Lagos">Lagos</SelectItem>
                  <SelectItem value="Kano">Kano</SelectItem>
                  <SelectItem value="Ibadan">Ibadan</SelectItem>
                  <SelectItem value="Abuja">Abuja</SelectItem>
                  <SelectItem value="Port Harcourt">Port Harcourt</SelectItem>
                  <SelectItem value="Kaduna">Kaduna</SelectItem>
                  <SelectItem value="Enugu">Enugu</SelectItem>
                </SelectContent>
              </Select>

              {/* Price Range */}
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min $"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-20"
                />
                <Input
                  type="number"
                  placeholder="Max $"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-20"
                />
              </div>
            </div>

            {/* Sorting and Active Filters */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Sort By */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="popular">Most Popular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Active Filter Badges */}
              <div className="flex flex-wrap gap-2 ml-auto">
                {searchTerm && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Search: {searchTerm}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchTerm("")} />
                  </Badge>
                )}
                {category && category !== "all" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {category}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setCategory("")} />
                  </Badge>
                )}
                {location && location !== "all" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {location}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setLocation("")} />
                  </Badge>
                )}
                {organicOnly !== undefined && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Leaf className="h-3 w-3" />
                    {organicOnly ? "Organic" : "Conventional"}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setOrganicOnly(undefined)} />
                  </Badge>
                )}
                {(minPrice || maxPrice) && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${minPrice || "0"} - ${maxPrice || "∞"}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => { setMinPrice(""); setMaxPrice(""); }} />
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={() => refetch()}>Apply Filters</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setCategory("");
                  setLocation("");
                  setOrganicOnly(undefined);
                  setMinPrice("");
                  setMaxPrice("");
                  setSortBy("newest");
                }}
              >
                Clear All
              </Button>
            </div>
        </ModernCard>

        {/* Results */}
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading listings...</p>
          </div>
        ) : listings && listings.length > 0 ? (
          <>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Found {listings.length} product{listings.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {listings.map((listing, index: number) => (
                <ModernCard 
                  key={listing.id} 
                  className={`flex flex-col overflow-hidden group stagger-${(index % 6) + 1} animate-slide-up`}
                  padding="none"
                >
                  {/* Product Image with Overlay Actions */}
                  <div className="relative overflow-hidden">
                    {listing.photos && listing.photos.length > 0 ? (
                      <img
                        src={listing.photos[0]}
                        alt={listing.title}
                        className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-48 bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                        <Leaf className="h-12 w-12 text-primary/50" />
                      </div>
                    )}
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full">
                        <Heart className="h-4 w-4" />
                      </Button>
                      <Link href={`/marketplace/${listing.id}`}>
                        <Button size="icon" variant="secondary" className="h-10 w-10 rounded-full">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </div>
                    
                    {/* Badges on Image */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {listing.organic && (
                        <Badge className="bg-success text-success-foreground border-0">
                          <Leaf className="h-3 w-3 mr-1" />
                          Organic
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col">
                    {/* Category Badge */}
                    <Badge variant="outline" className="w-fit mb-2 text-xs">
                      {listing.category}
                    </Badge>
                    
                    <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
                      {listing.title}
                    </h3>
                    
                    {listing.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {listing.description}
                      </p>
                    )}

                    {/* Price */}
                    <div className="mt-auto">
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-2xl font-bold text-primary">
                          {formatPrice(listing.pricePerUnit)}
                        </span>
                        <span className="text-sm text-muted-foreground">/ {listing.unit}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <span>{listing.quantity} {listing.unit} available</span>
                        {listing.location && listing.location.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {listing.location.city}
                          </span>
                        )}
                      </div>

                      {/* Seller */}
                      <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-medium text-primary">
                            {listing.userFirstName?.[0]}{listing.userLastName?.[0]}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {listing.userFirstName} {listing.userLastName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="p-4 pt-0 flex gap-2">
                    <Link href={`/marketplace/${listing.id}`} className="flex-1">
                      <Button variant="outline" className="w-full" size="sm">
                        View Details
                      </Button>
                    </Link>
                    <Button
                      onClick={() => handleAddToCart(listing.id)}
                      disabled={addToCartMutation.isPending}
                      className="flex-1 btn-glow"
                      size="sm"
                    >
                      <ShoppingCart className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </ModernCard>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <Leaf className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No products found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your filters or search term
            </p>
            <Button onClick={() => {
              setSearchTerm("");
              setCategory("");
              setOrganicOnly(undefined);
              setMinPrice("");
              setMaxPrice("");
            }}>
              Clear Filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
