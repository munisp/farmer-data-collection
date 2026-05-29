import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";

// Order type for type safety
type OrderItem = {
  order: {
    id: number;
    side: string;
    orderType: string;
    status: string;
    price: number | null;
    quantity: number;
    quantityFilled: number;
    createdAt: Date | string;
  };
  commodity: {
    id: number;
    symbol: string;
  };
};
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  X,
} from "lucide-react";

export default function ExchangeMyOrders() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders, isLoading } = trpc.exchange.getMyOrders.useQuery({
    status: statusFilter as "open" | "partially_filled" | "filled" | "cancelled" | "rejected" | "all" | undefined,
    limit: 100,
  });

  const cancelOrderMutation = trpc.exchange.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("Your order has been cancelled successfully.");
      queryClient.invalidateQueries({ queryKey: ["exchange"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel order");
    },
  });

  const formatPrice = (price: number | null) => {
    if (!price) return "-";
    return `₦${(price / 100).toLocaleString()}`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <Clock className="h-3 w-3 mr-1" />
            Open
          </Badge>
        );
      case "partially_filled":
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <AlertCircle className="h-3 w-3 mr-1" />
            Partial
          </Badge>
        );
      case "filled":
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Filled
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="text-gray-600 border-gray-600">
            <XCircle className="h-3 w-3 mr-1" />
            Cancelled
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openOrders = (orders as OrderItem[] | undefined)?.filter(
    (o: OrderItem) => o.order.status === "open" || o.order.status === "partially_filled"
  );
  const closedOrders = (orders as OrderItem[] | undefined)?.filter(
    (o: OrderItem) =>
      o.order.status === "filled" ||
      o.order.status === "cancelled" ||
      o.order.status === "rejected"
  );

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/exchange">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">My Orders</h1>
            <p className="text-muted-foreground">
              View and manage your exchange orders
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/exchange/my-trades">
            <Button variant="outline">View Trades</Button>
          </Link>
          <Link href="/exchange">
            <Button>Place New Order</Button>
          </Link>
        </div>
      </div>

      {/* Orders */}
      <Tabs defaultValue="open" className="space-y-4">
        <TabsList>
          <TabsTrigger value="open">
            Open Orders ({openOrders?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="history">
            Order History ({closedOrders?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Open Orders
              </CardTitle>
              <CardDescription>
                Orders waiting to be filled or partially filled
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading orders...</div>
              ) : openOrders?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No open orders
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Commodity</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Filled</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {openOrders?.map(({ order, commodity }: OrderItem) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono">
                            #{order.id}
                          </TableCell>
                          <TableCell>
                            <Link href={`/exchange/${commodity.symbol}`}>
                              <span className="font-medium hover:underline cursor-pointer">
                                {commodity.symbol}
                              </span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.side === "buy" ? "default" : "destructive"
                              }
                            >
                              {order.side.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">
                            {order.orderType}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPrice(order.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {order.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {order.quantityFilled}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(order.createdAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Cancel Order?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to cancel order #
                                    {order.id}? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Keep Order</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      cancelOrderMutation.mutate({ orderId: order.id })
                                    }
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Cancel Order
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Order History</CardTitle>
              <CardDescription>
                Completed, cancelled, and rejected orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">Loading orders...</div>
              ) : closedOrders?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No order history
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Commodity</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Filled</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closedOrders?.map(({ order, commodity }: OrderItem) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono">
                            #{order.id}
                          </TableCell>
                          <TableCell>
                            <Link href={`/exchange/${commodity.symbol}`}>
                              <span className="font-medium hover:underline cursor-pointer">
                                {commodity.symbol}
                              </span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.side === "buy" ? "default" : "destructive"
                              }
                            >
                              {order.side.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">
                            {order.orderType}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPrice(order.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {order.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {order.quantityFilled}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(order.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
