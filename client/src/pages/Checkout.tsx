import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Package, Truck, WifiOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useOfflineSync, useOnlineStatus } from "@/hooks/useOfflineSync";

export default function Checkout() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const isOnline = useOnlineStatus();
  const { saveOrder: saveOfflineOrder } = useOfflineSync();
  const { data: cartItems, isLoading: loadingCart } = trpc.marketplace.getCart.useQuery();

  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "delivery" | "shipping">("pickup");
  const [address, setAddress] = useState({
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "Nigeria",
  });
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  const validCartItems = useMemo(
    () => (cartItems ?? []).filter((item: any) => item.listingStatus === "active" && item.quantity <= item.listingQuantity),
    [cartItems]
  );
  const hasInvalidItems = (cartItems?.length ?? 0) !== validCartItems.length;

  const createCheckoutSessionMutation = trpc.stripeMarketplace.createCheckoutSession.useMutation();
  const createOrderMutation = trpc.marketplace.createOrderFromCart.useMutation({
    onSuccess: async (order) => {
      try {
        const { checkoutUrl } = await createCheckoutSessionMutation.mutateAsync({ orderId: order.id });
        toast.success("Order placed. Redirecting to payment...");
        if (checkoutUrl) {
          window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        }
        await utils.marketplace.getCart.invalidate();
        setTimeout(() => setLocation("/my-orders"), 1200);
      } catch (error: any) {
        toast.error(error?.message || "Order created, but payment setup failed.");
        setLocation("/my-orders");
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const calculateTotal = () => validCartItems.reduce((total: number, item: any) => total + item.listingPrice * item.quantity, 0);
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const requiresAddress = deliveryMethod === "delivery" || deliveryMethod === "shipping";
  const availableMethods = useMemo(() => {
    const methods = { pickup: true, delivery: true, shipping: true };
    for (const item of validCartItems) {
      const raw = (item as any).listingDeliveryOptions;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object") {
        methods.pickup = methods.pickup && !!parsed.pickup;
        methods.delivery = methods.delivery && !!parsed.delivery;
        methods.shipping = methods.shipping && !!parsed.shipping;
      }
    }
    return methods;
  }, [validCartItems]);

  const handlePlaceOrder = async () => {
    if (validCartItems.length === 0) {
      toast.error("Your cart is empty or contains only invalid items.");
      return;
    }

    if (hasInvalidItems) {
      toast.error("Please resolve unavailable or over-quantity cart items before checkout.");
      return;
    }

    if (!availableMethods[deliveryMethod]) {
      toast.error(`The selected items do not support ${deliveryMethod}.`);
      return;
    }

    if (requiresAddress && (!address.street || !address.city || !address.state || !address.zip || !address.country)) {
      toast.error("Please complete the delivery address.");
      return;
    }

    const items = validCartItems.map((item: any) => ({
      listingId: item.listingId,
      quantity: item.quantity,
    }));

    if (!isOnline) {
      try {
        await saveOfflineOrder({
          items: validCartItems.map((item: any) => ({
            productId: String(item.listingId),
            quantity: item.quantity,
            price: item.listingPrice / 100,
          })),
          totalAmount: calculateTotal() / 100,
          shippingAddress: requiresAddress
            ? {
                street: address.street,
                city: address.city,
                state: address.state,
                zipCode: address.zip,
                country: address.country,
              }
            : undefined,
          notes: notes || undefined,
          status: "pending_sync",
        });

        toast.success("Order saved offline. It will sync when connectivity is restored.", {
          icon: <WifiOff className="w-4 h-4" />,
        });
        setLocation("/my-orders");
      } catch (error) {
        console.error("Failed to save order offline:", error);
        toast.error("Failed to save order offline.");
      }
      return;
    }

    createOrderMutation.mutate({
      items,
      deliveryMethod,
      deliveryAddress: requiresAddress
        ? {
            street: address.street,
            city: address.city,
            state: address.state,
            zip: address.zip,
            country: address.country,
          }
        : undefined,
      deliveryDate: deliveryDate || undefined,
      notes: notes || undefined,
    });
  };

  if (loadingCart) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!cartItems || cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
          <p className="text-muted-foreground mb-4">Add items to your cart before checking out.</p>
          <Button onClick={() => setLocation("/marketplace")}>Browse Marketplace</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        {!isOnline && (
          <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900">
            <WifiOff className="h-4 w-4" />
            <AlertDescription>
              You are offline. Your order can still be captured locally and queued for synchronization.
            </AlertDescription>
          </Alert>
        )}

        {hasInvalidItems && (
          <Alert className="mb-6" variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Some cart items are no longer purchasable. Return to the cart to correct them before placing the order.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Method</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={deliveryMethod} onValueChange={(value: any) => setDeliveryMethod(value)}>
                  <div className={`flex items-center space-x-2 p-4 border rounded-lg ${!availableMethods.pickup ? "opacity-50" : "cursor-pointer hover:bg-accent"}`}>
                    <RadioGroupItem value="pickup" id="pickup" disabled={!availableMethods.pickup} />
                    <Label htmlFor="pickup" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        <div>
                          <div className="font-semibold">Farm Pickup</div>
                          <div className="text-sm text-muted-foreground">Pick up directly from the farm.</div>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className={`flex items-center space-x-2 p-4 border rounded-lg ${!availableMethods.delivery ? "opacity-50" : "cursor-pointer hover:bg-accent"}`}>
                    <RadioGroupItem value="delivery" id="delivery" disabled={!availableMethods.delivery} />
                    <Label htmlFor="delivery" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        <div>
                          <div className="font-semibold">Local Delivery</div>
                          <div className="text-sm text-muted-foreground">Seller delivers to your address.</div>
                        </div>
                      </div>
                    </Label>
                  </div>

                  <div className={`flex items-center space-x-2 p-4 border rounded-lg ${!availableMethods.shipping ? "opacity-50" : "cursor-pointer hover:bg-accent"}`}>
                    <RadioGroupItem value="shipping" id="shipping" disabled={!availableMethods.shipping} />
                    <Label htmlFor="shipping" className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        <div>
                          <div className="font-semibold">Shipping</div>
                          <div className="text-sm text-muted-foreground">Carrier-based delivery to your address.</div>
                        </div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {requiresAddress && (
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Address</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="street">Street Address *</Label>
                    <Input id="street" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="123 Market Road" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="city">City *</Label>
                      <Input id="city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="Abuja" />
                    </div>
                    <div>
                      <Label htmlFor="state">State *</Label>
                      <Input id="state" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} placeholder="FCT" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="zip">Postal Code *</Label>
                      <Input id="zip" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} placeholder="900001" />
                    </div>
                    <div>
                      <Label htmlFor="country">Country *</Label>
                      <Input id="country" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} placeholder="Nigeria" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Preferred Fulfilment Date</CardTitle>
              </CardHeader>
              <CardContent>
                <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} min={new Date().toISOString().split("T")[0]} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions or fulfilment notes for the seller..." rows={4} />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {validCartItems.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm gap-3">
                      <span className="text-muted-foreground">{item.listingTitle} × {item.quantity}</span>
                      <span>{formatPrice(item.listingPrice * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Items</span>
                  <span>{formatPrice(calculateTotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="text-muted-foreground">Calculated by seller/payment flow</span>
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPrice(calculateTotal())}</span>
                </div>
              </CardContent>
              <CardContent>
                <Button className="w-full" size="lg" onClick={handlePlaceOrder} disabled={createOrderMutation.isPending || validCartItems.length === 0 || hasInvalidItems}>
                  {createOrderMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Place Order"
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
