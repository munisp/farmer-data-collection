import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ShoppingCart, Leaf, MapPin, Calendar, Package, Truck, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import ReviewsList from "@/components/ReviewsList";

export default function ProductDetail() {
  const [, params] = useRoute("/marketplace/:id");
  const listingId = params?.id ? parseInt(params.id) : 0;
  const [quantity, setQuantity] = useState(1);

  const { data: listing, isLoading } = trpc.marketplace.getListing.useQuery({ id: listingId });

  const addToCartMutation = trpc.marketplace.addToCart.useMutation({
    onSuccess: () => {
      toast.success("Added to cart!");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleAddToCart = () => {
    if (quantity < 1 || quantity > (listing?.quantity || 0)) {
      toast.error("Invalid quantity");
      return;
    }
    addToCartMutation.mutate({ listingId, quantity });
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading product details...</p>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Product not found</h2>
          <p className="text-muted-foreground mb-4">This listing may have been removed or is no longer available.</p>
          <Link href="/marketplace">
            <Button>Back to Marketplace</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        {/* Back Button */}
        <Link href="/marketplace">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Marketplace
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Images */}
          <div>
            {listing.photos && listing.photos.length > 0 ? (
              <div className="space-y-4">
                <img
                  src={listing.photos[0]}
                  alt={listing.title}
                  className="w-full h-96 object-cover rounded-lg"
                />
                {listing.photos.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {listing.photos.slice(1, 5).map((photo: string, idx: number) => (
                      <img
                        key={idx}
                        src={photo}
                        alt={`${listing.title} ${idx + 2}`}
                        className="w-full h-24 object-cover rounded-md cursor-pointer hover:opacity-80"
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center">
                <Leaf className="h-24 w-24 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{listing.title}</h1>
              <div className="flex gap-2 mb-4">
                {listing.organic && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    <Leaf className="h-3 w-3 mr-1" />
                    Organic
                  </Badge>
                )}
                <Badge variant="outline">{listing.category}</Badge>
                {listing.certification && (
                  <Badge variant="secondary">{listing.certification}</Badge>
                )}
              </div>
            </div>

            {/* Price */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-4xl font-bold">{formatPrice(listing.pricePerUnit)}</span>
                  <span className="text-xl text-muted-foreground">/ {listing.unit}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-4">
                  <Package className="inline h-4 w-4 mr-1" />
                  {listing.quantity} {listing.unit} available
                </div>

                {/* Quantity Selector */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Quantity</label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 text-center"
                        min={1}
                        max={listing.quantity}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantity(Math.min(listing.quantity, quantity + 1))}
                      >
                        +
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-muted-foreground">Subtotal:</span>
                    <span className="text-2xl font-bold">
                      {formatPrice(listing.pricePerUnit * quantity)}
                    </span>
                  </div>

                  <Button
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending || quantity > listing.quantity}
                    className="w-full"
                    size="lg"
                  >
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Delivery Options */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Delivery Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {listing.deliveryOptions?.pickup && (
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span>Farm Pickup Available</span>
                  </div>
                )}
                {listing.deliveryOptions?.delivery && (
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span>Local Delivery Available</span>
                  </div>
                )}
                {listing.deliveryOptions?.shipping && (
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span>Shipping Available</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Description and Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {listing.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Availability */}
            <Card>
              <CardHeader>
                <CardTitle>Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {listing.availableFrom && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Available from: {new Date(listing.availableFrom).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {listing.availableUntil && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Available until: {new Date(listing.availableUntil).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reviews */}
            <Card>
              <CardHeader>
                <CardTitle>Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                <ReviewsList sellerId={listing.userId} />
              </CardContent>
            </Card>
          </div>

          {/* Seller Info */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Seller Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-semibold text-lg">
                    {listing.userFirstName} {listing.userLastName}
                  </p>
                  {listing.location && listing.location.city && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3" />
                      {listing.location.city}, {listing.location.state}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Contact seller for more information or to arrange pickup/delivery.
                  </p>
                </div>

                <div className="text-xs text-muted-foreground">
                  Listed on {new Date(listing.createdAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
