import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingBag, Package, Truck, CheckCircle, XCircle, Clock3 } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["shipped", "delivered", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export default function MySales() {
  const { data: orders, isLoading, refetch } = trpc.marketplace.getMySales.useQuery();
  const [trackingNumbers, setTrackingNumbers] = useState<Record<number, string>>({});
  const [cancellationReasons, setCancellationReasons] = useState<Record<number, string>>({});

  const updateStatusMutation = trpc.marketplace.updateOrderStatus.useMutation({
    onSuccess: () => {
      toast.success("Order status updated");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock3 className="h-4 w-4" />;
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

  const getAllowedTransitions = (order: any) => {
    if (order.status === "ready" && order.deliveryMethod === "pickup") {
      return ["delivered", "cancelled"];
    }
    return STATUS_OPTIONS[order.status] ?? [];
  };

  const handleStatusUpdate = (order: any, nextStatus: string) => {
    if (nextStatus === order.status) {
      return;
    }

    const payload: any = {
      orderId: order.id,
      status: nextStatus,
    };

    if (nextStatus === "shipped") {
      const trackingNumber = (trackingNumbers[order.id] || order.trackingNumber || "").trim();
      if (!trackingNumber) {
        toast.error("Tracking number is required before marking an order as shipped.");
        return;
      }
      payload.trackingNumber = trackingNumber;
    }

    if (nextStatus === "cancelled") {
      payload.cancellationReason = (cancellationReasons[order.id] || "Cancelled by seller").trim();
    }

    updateStatusMutation.mutate(payload);
  };

  const sortedOrders = useMemo(() => (orders ?? []).slice().sort((a: any, b: any) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [orders]);

  if (isLoading) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading your sales...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-8">My Sales</h1>

        {!sortedOrders || sortedOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No sales yet</h3>
              <p className="text-muted-foreground">Orders from buyers will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {sortedOrders.map((order: any) => {
              const allowedTransitions = getAllowedTransitions(order);
              const currentTracking = trackingNumbers[order.id] ?? order.trackingNumber ?? "";

              return (
                <Card key={order.id}>
                  <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
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
                    <div>
                      <p className="text-sm font-medium">Buyer</p>
                      <p className="text-sm text-muted-foreground">
                        {order.buyerFirstName} {order.buyerLastName}
                      </p>
                      <p className="text-sm text-muted-foreground">{order.buyerEmail}</p>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-sm font-medium mb-2">Items</p>
                      <div className="space-y-2">
                        {order.items.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-sm gap-3">
                            <span>{item.productTitle} × {item.quantity} {item.productUnit}</span>
                            <span className="font-medium">{formatPrice(item.totalPrice)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="font-medium">Delivery Method</p>
                        <p className="text-muted-foreground capitalize">{order.deliveryMethod}</p>
                      </div>
                      {order.deliveryDate && (
                        <div>
                          <p className="font-medium">Preferred Date</p>
                          <p className="text-muted-foreground">{new Date(order.deliveryDate).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>

                    {order.deliveryAddress && (
                      <div className="text-sm">
                        <p className="font-medium">Delivery Address</p>
                        <p className="text-muted-foreground">
                          {order.deliveryAddress.street}, {order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.zip}
                        </p>
                      </div>
                    )}

                    {order.notes && (
                      <div className="text-sm">
                        <p className="font-medium">Order Notes</p>
                        <p className="text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
                      </div>
                    )}

                    <Separator />

                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Total</span>
                      <span className="text-lg font-bold">{formatPrice(order.totalAmount)}</span>
                    </div>

                    {order.deliveryMethod !== "pickup" && order.status !== "cancelled" && order.status !== "delivered" && (
                      <div className="space-y-2">
                        <Label htmlFor={`tracking-${order.id}`}>Tracking Number</Label>
                        <Input
                          id={`tracking-${order.id}`}
                          placeholder="Enter shipment tracking reference"
                          value={currentTracking}
                          onChange={(e) => setTrackingNumbers((prev) => ({ ...prev, [order.id]: e.target.value }))}
                        />
                      </div>
                    )}

                    {allowedTransitions.includes("cancelled") && (
                      <div className="space-y-2">
                        <Label htmlFor={`cancellation-${order.id}`}>Cancellation Reason</Label>
                        <Input
                          id={`cancellation-${order.id}`}
                          placeholder="Optional reason if you need to cancel this order"
                          value={cancellationReasons[order.id] ?? ""}
                          onChange={(e) => setCancellationReasons((prev) => ({ ...prev, [order.id]: e.target.value }))}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <label className="text-sm font-medium">Advance Lifecycle:</label>
                      <Select onValueChange={(value) => handleStatusUpdate(order, value)} disabled={updateStatusMutation.isPending || allowedTransitions.length === 0}>
                        <SelectTrigger className="w-full md:w-64">
                          <SelectValue placeholder={allowedTransitions.length === 0 ? "No further actions" : "Select next status"} />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedTransitions.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status.replace(/(^\w|_\w)/g, (match) => match.replace("_", " ").toUpperCase())}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>Created: {new Date(order.createdAt).toLocaleString()}</div>
                      {order.confirmedAt && <div>Confirmed: {new Date(order.confirmedAt).toLocaleString()}</div>}
                      {order.deliveredAt && <div>Delivered: {new Date(order.deliveredAt).toLocaleString()}</div>}
                      {order.updatedAt && <div>Last updated: {new Date(order.updatedAt).toLocaleString()}</div>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
