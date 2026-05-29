import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart as CartIcon, Trash2, ArrowRight, ShoppingBag, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function ShoppingCart() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: cartItems, isLoading, refetch } = trpc.marketplace.getCart.useQuery();

  const removeFromCartMutation = trpc.marketplace.removeFromCart.useMutation({
    onSuccess: () => {
      toast.success("Item removed from cart");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateCartItemMutation = trpc.marketplace.updateCartItemQuantity.useMutation({
    onSuccess: () => {
      toast.success("Cart updated");
      utils.marketplace.getCart.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const clearCartMutation = trpc.marketplace.clearCart.useMutation({
    onSuccess: () => {
      toast.success("Cart cleared");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleRemoveItem = (cartItemId: number) => {
    removeFromCartMutation.mutate({ cartItemId });
  };

  const handleUpdateQuantity = (cartItemId: number, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(cartItemId);
      return;
    }

    updateCartItemMutation.mutate({ cartItemId, quantity });
  };

  const handleClearCart = () => {
    if (confirm("Are you sure you want to clear your cart?")) {
      clearCartMutation.mutate();
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const calculateTotal = () => {
    if (!cartItems) return 0;
    return cartItems.reduce((total: number, item: any) => total + item.listingPrice * item.quantity, 0);
  };

  const hasInvalidItems = !!cartItems?.some((item: any) => item.listingStatus !== "active" || item.quantity > item.listingQuantity);

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading cart...</p>
      </div>
    );
  }

  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-16">
          <div className="max-w-md mx-auto text-center">
            <ShoppingBag className="h-24 w-24 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">Start shopping to add items to your cart.</p>
            <Link href="/marketplace">
              <Button size="lg">Browse Marketplace</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-3">
            <CartIcon className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold">Shopping Cart</h1>
              <p className="text-sm text-muted-foreground">Review items, adjust quantities, and continue to checkout.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleClearCart}>Clear Cart</Button>
          </div>
        </div>

        {hasInvalidItems && (
          <Card className="mb-6 border-amber-300 bg-amber-50">
            <CardContent className="py-4 flex items-start gap-3 text-amber-900">
              <AlertTriangle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Some cart items need attention before checkout.</p>
                <p className="text-sm">Update quantities or remove unavailable items to continue.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cartItems.map((item: any) => {
              const itemUnavailable = item.listingStatus !== "active";
              const exceedsStock = item.quantity > item.listingQuantity;
              const maxQuantity = Math.max(1, item.listingQuantity || 1);

              return (
                <Card key={item.id}>
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      {item.listingPhotos && item.listingPhotos.length > 0 ? (
                        <img
                          src={item.listingPhotos[0]}
                          alt={item.listingTitle}
                          className="w-24 h-24 object-cover rounded-md"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2 gap-4">
                          <div>
                            <Link href={`/marketplace/${item.listingId}`}>
                              <h3 className="font-semibold hover:underline">{item.listingTitle}</h3>
                            </Link>
                            <p className="text-sm text-muted-foreground">
                              Sold by: {item.sellerFirstName} {item.sellerLastName}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.id)}
                            disabled={removeFromCartMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                          <div className="space-y-2">
                            <p className="text-sm text-muted-foreground">
                              {formatPrice(item.listingPrice)} per {item.listingUnit}
                            </p>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Quantity</span>
                              <Input
                                type="number"
                                min={1}
                                max={maxQuantity}
                                value={item.quantity}
                                onChange={(e) => handleUpdateQuantity(item.id, Number(e.target.value || 1))}
                                className="w-24"
                                disabled={itemUnavailable || updateCartItemMutation.isPending}
                              />
                              <span className="text-xs text-muted-foreground">
                                {item.listingQuantity} {item.listingUnit} available
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-lg font-bold">{formatPrice(item.listingPrice * item.quantity)}</p>
                            <p className="text-xs text-muted-foreground">Subtotal</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant={itemUnavailable ? "destructive" : "secondary"}>
                            {itemUnavailable ? "Unavailable" : "Active"}
                          </Badge>
                          {exceedsStock && <Badge variant="destructive">Exceeds available stock</Badge>}
                        </div>

                        {itemUnavailable && (
                          <div className="mt-2 text-sm text-destructive">This item is no longer available and must be removed before checkout.</div>
                        )}
                        {exceedsStock && (
                          <div className="mt-2 text-sm text-destructive">
                            Requested quantity exceeds the available stock. Reduce to {item.listingQuantity} or less.
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Items ({cartItems.length})</span>
                    <span>{formatPrice(calculateTotal())}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery</span>
                    <span className="text-muted-foreground">Calculated at checkout</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPrice(calculateTotal())}</span>
                </div>

                <p className="text-xs text-muted-foreground">Tax and delivery fees will be calculated at checkout.</p>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setLocation("/checkout")}
                  disabled={hasInvalidItems}
                >
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>

            <div className="mt-4">
              <Link href="/marketplace">
                <Button variant="outline" className="w-full">Continue Shopping</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
