import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShoppingBag, Package, Truck, CheckCircle, XCircle } from "lucide-react";

export default function MyOrders() {
  const { data: orders, isLoading } = trpc.marketplace.getMyOrders.useQuery();

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Package className="h-4 w-4" />;
      case "confirmed":
      case "preparing":
        return <Package className="h-4 w-4 text-blue-600" />;
      case "ready":
      case "shipped":
        return <Truck className="h-4 w-4 text-orange-600" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "confirmed":
      case "preparing":
        return "bg-blue-100 text-blue-800";
      case "ready":
      case "shipped":
        return "bg-orange-100 text-orange-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading your orders...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-8">My Orders</h1>

        {!orders || orders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-4">
                Start shopping to place your first order
              </p>
              <Link href="/marketplace">
                <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                  Browse Marketplace
                </button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <Card key={order.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">Order {order.orderNumber}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Placed on {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={getStatusColor(order.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(order.status)}
                        {order.status}
                      </span>
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Seller Info */}
                  <div>
                    <p className="text-sm font-medium">Seller</p>
                    <p className="text-sm text-muted-foreground">
                      {order.sellerFirstName} {order.sellerLastName}
                    </p>
                  </div>

                  <Separator />

                  {/* Order Items */}
                  <div>
                    <p className="text-sm font-medium mb-2">Items</p>
                    <div className="space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span>
                            {item.productTitle} × {item.quantity} {item.productUnit}
                          </span>
                          <span className="font-medium">{formatPrice(item.totalPrice)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Delivery Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Delivery Method</p>
                      <p className="text-muted-foreground capitalize">{order.deliveryMethod}</p>
                    </div>
                    {order.deliveryDate && (
                      <div>
                        <p className="font-medium">Delivery Date</p>
                        <p className="text-muted-foreground">
                          {new Date(order.deliveryDate).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {order.deliveryAddress && (
                    <div className="text-sm">
                      <p className="font-medium">Delivery Address</p>
                      <p className="text-muted-foreground">
                        {order.deliveryAddress.street}, {order.deliveryAddress.city},{" "}
                        {order.deliveryAddress.state} {order.deliveryAddress.zip}
                      </p>
                    </div>
                  )}

                  {order.notes && (
                    <div className="text-sm">
                      <p className="font-medium">Notes</p>
                      <p className="text-muted-foreground">{order.notes}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Total */}
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total</span>
                    <span className="text-lg font-bold">{formatPrice(order.totalAmount)}</span>
                  </div>

                  {/* Status Timeline */}
                  {order.confirmedAt && (
                    <div className="text-xs text-muted-foreground">
                      Confirmed on {new Date(order.confirmedAt).toLocaleString()}
                    </div>
                  )}
                  {order.deliveredAt && (
                    <div className="text-xs text-muted-foreground">
                      Delivered on {new Date(order.deliveredAt).toLocaleString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
