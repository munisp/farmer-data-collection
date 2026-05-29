import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";

// Commodity type for type safety
type CommodityItem = {
  id: number;
  symbol: string;
  name: string;
  cropName: string;
  grade: string | null;
  lastTradePrice: number | null;
  previousClose: number | null;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  dailyVolume: number | null;
};
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  TrendingUp,
  TrendingDown,
  Search,
  ArrowUpDown,
  BarChart3,
  Wallet,
  Package,
  Activity,
  Repeat,
  Shield,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCard, StatsGrid } from "@/components/ui/stats-card";
import { ModernCard } from "@/components/ui/modern-card";

export default function ExchangeDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [cropFilter, setCropFilter] = useState<string>("all");

  const { data: commodities, isLoading } = trpc.exchange.listCommodities.useQuery({});

  const { data: traderProfile } = trpc.exchange.getMyTraderProfile.useQuery();

  const filteredCommodities = (commodities as CommodityItem[] | undefined)?.filter((c: CommodityItem) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.symbol.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCrop = cropFilter === "all" || c.cropName === cropFilter;
    return matchesSearch && matchesCrop;
  });

  const uniqueCrops = Array.from(new Set((commodities as CommodityItem[] | undefined)?.map((c: CommodityItem) => c.cropName) || []));

  const formatPrice = (price: number | null) => {
    if (!price) return "-";
    return `₦${(price / 100).toLocaleString()}`;
  };

  const formatChange = (current: number | null, previous: number | null) => {
    if (!current || !previous) return null;
    const change = ((current - previous) / previous) * 100;
    return change;
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background">
      {/* Modern Hero Header */}
      <div className="gradient-hero text-white py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-fade-in">
            <div>
              <Badge className="bg-white/20 text-white border-white/30 mb-3">
                <Repeat className="w-3 h-3 mr-1" />
                Live Trading
              </Badge>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">Commodity Exchange</h1>
              <p className="text-lg opacity-90">
                Trade agricultural commodities with real-time pricing
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/exchange/my-orders">
                <Button variant="secondary" className="gap-2">
                  <Package className="h-4 w-4" />
                  My Orders
                </Button>
              </Link>
              <Link href="/exchange/my-trades">
                <Button variant="secondary" className="gap-2">
                  <Activity className="h-4 w-4" />
                  My Trades
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Account Summary - Modern Stats */}
        <div className="-mt-16 relative z-10 mb-8">
          <StatsGrid columns={4}>
            <StatsCard
              title="Account Balance"
              value={formatPrice(traderProfile?.account?.cashBalance || 0)}
              icon={<Wallet className="w-5 h-5" />}
              variant="primary"
              className="animate-slide-up stagger-1"
            />
            <StatsCard
              title="Available Balance"
              value={formatPrice(traderProfile?.account?.cashAvailable || 0)}
              icon={<Zap className="w-5 h-5" />}
              trend={{ value: 0, label: "Ready to trade" }}
              className="animate-slide-up stagger-2"
            />
            <StatsCard
              title="Reserved"
              value={formatPrice(traderProfile?.account?.cashReserved || 0)}
              icon={<Shield className="w-5 h-5" />}
              description="In open orders"
              className="animate-slide-up stagger-3"
            />
            <ModernCard className="animate-slide-up stagger-4" variant="elevated">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Verification</p>
                  <Badge
                    className={`mt-2 ${
                      traderProfile?.trader?.verificationStatus === "verified"
                        ? "bg-success text-success-foreground"
                        : "bg-warning text-warning-foreground"
                    }`}
                  >
                    {traderProfile?.trader?.verificationStatus || "Not Registered"}
                  </Badge>
                </div>
                <div className="p-3 rounded-xl bg-muted">
                  <Shield className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            </ModernCard>
          </StatsGrid>
        </div>

        {/* Search and Filters */}
        <ModernCard variant="elevated" className="animate-fade-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-primary/10">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Commodities</h2>
              <p className="text-sm text-muted-foreground">Browse and trade agricultural commodities</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Search" placeholder="Search commodities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background"
              />
            </div>
            <Select value={cropFilter} onValueChange={setCropFilter}>
              <SelectTrigger className="w-full md:w-[200px] bg-background">
                <SelectValue placeholder="Filter by crop" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Crops</SelectItem>
                {uniqueCrops.map((crop) => (
                  <SelectItem key={crop} value={crop}>
                    {crop}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading commodities...</div>
          ) : filteredCommodities?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No commodities found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Last Price</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Bid</TableHead>
                    <TableHead className="text-right">Ask</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCommodities?.map((commodity: CommodityItem) => {
                    const change = formatChange(
                      commodity.lastTradePrice,
                      commodity.previousClose
                    );
                    return (
                      <TableRow key={commodity.id}>
                        <TableCell className="font-mono font-medium">
                          {commodity.symbol}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{commodity.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {commodity.cropName} - {commodity.grade || "Standard"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(commodity.lastTradePrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          {change !== null ? (
                            <div
                              className={`flex items-center justify-end gap-1 ${
                                change >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {change >= 0 ? (
                                <TrendingUp className="h-4 w-4" />
                              ) : (
                                <TrendingDown className="h-4 w-4" />
                              )}
                              {Math.abs(change).toFixed(2)}%
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatPrice(commodity.bestBidPrice)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatPrice(commodity.bestAskPrice)}
                        </TableCell>
                        <TableCell className="text-right">
                          {commodity.dailyVolume?.toLocaleString() || 0}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/exchange/${commodity.symbol}`}>
                            <Button size="sm">
                              <ArrowUpDown className="h-4 w-4 mr-1" />
                              Trade
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </ModernCard>
      </div>
    </div>
  );
}
