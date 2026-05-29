import { Link } from "wouter";
import { trpc } from "../lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Activity,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

// Trade type for type safety
type TradeItem = {
  side: string;
  trade: {
    id: number;
    tradeTime: Date | string;
    price: number;
    quantity: number;
    tradeValue: number;
    settlementStatus: string;
  };
  commodity: {
    id: number;
    symbol: string;
  };
};

export default function ExchangeMyTrades() {
  const { data: trades, isLoading } = trpc.exchange.getMyTrades.useQuery({ limit: 100 });

  const { data: traderProfile } = trpc.exchange.getMyTraderProfile.useQuery();

  const formatPrice = (price: number | null) => {
    if (!price) return "-";
    return `₦${(price / 100).toLocaleString()}`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  const getSettlementBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <AlertCircle className="h-3 w-3 mr-1" />
            Processing
          </Badge>
        );
      case "settled":
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Settled
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="text-red-600 border-red-600">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate statistics
  const totalTrades = trades?.length || 0;
  const buyTrades = (trades as TradeItem[] | undefined)?.filter((t: TradeItem) => t.side === "buy") || [];
  const sellTrades = (trades as TradeItem[] | undefined)?.filter((t: TradeItem) => t.side === "sell") || [];
  const totalBuyValue = buyTrades.reduce((sum: number, t: TradeItem) => sum + t.trade.tradeValue, 0);
  const totalSellValue = sellTrades.reduce((sum: number, t: TradeItem) => sum + t.trade.tradeValue, 0);

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
            <h1 className="text-2xl font-bold">My Trades</h1>
            <p className="text-muted-foreground">
              View your executed trades and settlements
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/exchange/my-orders">
            <Button variant="outline">View Orders</Button>
          </Link>
          <Link href="/exchange">
            <Button>Place New Order</Button>
          </Link>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{totalTrades}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Buy Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{buyTrades.length}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPrice(totalBuyValue)} total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sell Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{sellTrades.length}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatPrice(totalSellValue)} total
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lifetime Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(traderProfile?.trader?.totalVolume || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trades Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Trade History
          </CardTitle>
          <CardDescription>
            All your executed trades on the exchange
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading trades...</div>
          ) : trades?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trades yet. Place an order to start trading.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Settlement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(trades as TradeItem[] | undefined)?.map(({ trade, commodity, side }: TradeItem) => (
                    <TableRow key={trade.id}>
                      <TableCell className="font-mono">#{trade.id}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(trade.tradeTime)}
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
                          variant={side === "buy" ? "default" : "destructive"}
                        >
                          {side === "buy" ? (
                            <TrendingUp className="h-3 w-3 mr-1" />
                          ) : (
                            <TrendingDown className="h-3 w-3 mr-1" />
                          )}
                          {side.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(trade.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {trade.quantity}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPrice(trade.tradeValue)}
                      </TableCell>
                      <TableCell>
                        {getSettlementBadge(trade.settlementStatus)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
