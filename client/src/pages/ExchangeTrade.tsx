import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { trpc } from "../lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  Package,
  Clock,
  CheckCircle,
  Activity,
  Zap,
} from "lucide-react";
import { ModernCard } from "@/components/ui/modern-card";
import { cn } from "@/lib/utils";

export default function ExchangeTrade() {
  const { symbol } = useParams<{ symbol: string }>();
  const queryClient = useQueryClient();

  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const { data: commodity, isLoading: commodityLoading } = trpc.exchange.getCommodity.useQuery(
    { symbol: symbol! },
    { enabled: !!symbol }
  );

  const { data: orderBook, refetch: refetchOrderBook } = trpc.exchange.getOrderBook.useQuery(
    { commodityId: commodity?.id ?? 0, depth: 10 },
    { enabled: !!commodity?.id, refetchInterval: 5000 }
  );

  const { data: recentTrades, refetch: refetchTrades } = trpc.exchange.getRecentTrades.useQuery(
    { commodityId: commodity?.id ?? 0, limit: 20 },
    { enabled: !!commodity?.id, refetchInterval: 5000 }
  );

  const { data: traderProfile } = trpc.exchange.getMyTraderProfile.useQuery();

  const { data: myPositions } = trpc.exchange.getMyPositions.useQuery();

  const placeOrderMutation = trpc.exchange.placeOrder.useMutation({
    onSuccess: (result) => {
      toast.success(`Order #${result.order.id} has been placed successfully.`);
      setPrice("");
      setQuantity("");
      queryClient.invalidateQueries({ queryKey: ["exchange"] });
      refetchOrderBook();
      refetchTrades();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to place order");
    },
  });

  const handlePlaceOrder = () => {
    if (!commodity) return;

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    if (orderType === "limit") {
      const priceValue = parseFloat(price);
      if (isNaN(priceValue) || priceValue <= 0) {
        toast.error("Please enter a valid price for limit orders");
        return;
      }

      placeOrderMutation.mutate({
        commodityId: commodity.id,
        side: orderSide,
        orderType: "limit",
        price: Math.round(priceValue * 100), // Convert to cents
        quantity: qty,
      });
    } else {
      placeOrderMutation.mutate({
        commodityId: commodity.id,
        side: orderSide,
        orderType: "market",
        quantity: qty,
      });
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price) return "-";
    return `₦${(price / 100).toLocaleString()}`;
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString();
  };

  const myPosition = myPositions?.find(
    (p: { commodity: { id: number }; position: { quantityAvailable: number } }) => p.commodity.id === commodity?.id
  );

  if (commodityLoading) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-8">Loading...</div>
      </div>
    );
  }

  if (!commodity) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-8">Commodity not found</div>
      </div>
    );
  }

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Modern Header */}
      <div className="gradient-hero text-white py-8">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade-in">
            <div className="flex items-center gap-4">
              <Link href="/exchange">
                <Button variant="secondary" size="icon" className="rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-bold">{commodity.symbol}</h1>
                  <Badge className="bg-white/20 text-white border-white/30">
                    {commodity.deliveryType}
                  </Badge>
                </div>
                <p className="text-white/80">{commodity.name}</p>
              </div>
            </div>
            <ModernCard variant="glass" className="bg-white/10 backdrop-blur-sm border-white/20 text-white">
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-3xl font-bold">
                    {formatPrice(commodity.lastTradePrice)}
                  </div>
                  <div className="text-sm text-white/70">
                    per {commodity.unit}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/10">
                  <Activity className="w-6 h-6" />
                </div>
              </div>
            </ModernCard>
          </div>
        </div>
      </div>

      <div className="container py-8">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 -mt-8">
        {/* Order Book */}
        <ModernCard variant="elevated" className="lg:col-span-2 animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Order Book</h2>
              <p className="text-sm text-muted-foreground">Live buy and sell orders</p>
            </div>
          </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Bids (Buy Orders) */}
              <div>
                <h3 className="font-medium text-green-600 mb-2">Bids (Buy)</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderBook?.bids?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No buy orders
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderBook?.bids?.map((bid: { price: number | null; totalQuantity: number }, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-green-600 font-medium">
                            {formatPrice(bid.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {bid.totalQuantity}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Asks (Sell Orders) */}
              <div>
                <h3 className="font-medium text-red-600 mb-2">Asks (Sell)</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderBook?.asks?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-muted-foreground">
                          No sell orders
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderBook?.asks?.map((ask: { price: number | null; totalQuantity: number }, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-red-600 font-medium">
                            {formatPrice(ask.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            {ask.totalQuantity}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
        </ModernCard>

        {/* Place Order Form */}
        <ModernCard variant="elevated" className="animate-slide-up stagger-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-accent/10">
              <Zap className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Place Order</h2>
              <p className="text-sm text-muted-foreground">Buy or sell {commodity.symbol}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Account Info */}
            <div className="grid grid-cols-2 gap-2 p-4 bg-muted/50 rounded-xl text-sm">
              <div>
                <div className="text-muted-foreground">Available Cash</div>
                <div className="font-medium">
                  {formatPrice(traderProfile?.account?.cashAvailable || 0)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Position</div>
                <div className="font-medium">
                  {myPosition?.position.quantityAvailable || 0} {commodity.unit}
                </div>
              </div>
            </div>

            {/* Order Side */}
            <Tabs
              value={orderSide}
              onValueChange={(v) => setOrderSide(v as "buy" | "sell")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="buy" className="text-green-600">
                  Buy
                </TabsTrigger>
                <TabsTrigger value="sell" className="text-red-600">
                  Sell
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Order Type */}
            <div className="space-y-2">
              <Label>Order Type</Label>
              <Select
                value={orderType}
                onValueChange={(v) => setOrderType(v as "limit" | "market")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="limit">Limit Order</SelectItem>
                  <SelectItem value="market">Market Order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Price (for limit orders) */}
            {orderType === "limit" && (
              <div className="space-y-2">
                <Label>Price (₦ per {commodity.unit})</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Quantity ({commodity.unit})</Label>
              <Input
                type="number"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {/* Order Summary */}
            {quantity && (orderType === "market" || price) && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <div className="flex justify-between">
                  <span>Estimated Total</span>
                  <span className="font-medium">
                    {orderType === "limit"
                      ? `₦${(parseFloat(price) * parseInt(quantity)).toLocaleString()}`
                      : "Market Price"}
                  </span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              className={cn(
                "w-full gap-2 transition-all",
                orderSide === "buy"
                  ? "bg-success hover:bg-success/90"
                  : "bg-destructive hover:bg-destructive/90"
              )}
              onClick={handlePlaceOrder}
              disabled={placeOrderMutation.isPending}
            >
              {placeOrderMutation.isPending
                ? "Placing Order..."
                : `${orderSide === "buy" ? "Buy" : "Sell"} ${commodity.symbol}`}
            </Button>
          </div>
        </ModernCard>
      </div>

      {/* Recent Trades */}
      <ModernCard variant="elevated" className="mt-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-info/10">
            <Clock className="h-5 w-5 text-info" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Recent Trades</h2>
            <p className="text-sm text-muted-foreground">Latest executed trades</p>
          </div>
        </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTrades?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No recent trades
                  </TableCell>
                </TableRow>
              ) : (
                recentTrades?.map((trade: { id: number; tradeTime: Date | string; price: number; quantity: number; tradeValue: number }) => (
                  <TableRow key={trade.id}>
                    <TableCell className="text-muted-foreground">
                      {formatTime(trade.tradeTime)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPrice(trade.price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {trade.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(trade.tradeValue)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ModernCard>
      </div>
    </div>
  );
}
