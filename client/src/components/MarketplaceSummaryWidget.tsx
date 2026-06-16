import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, TrendingUp, ArrowRight } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { trpc } from "@/lib/trpc";

export function MarketplaceSummaryWidget() {
  const { formatCurrency } = useLocalization();
  const { data: listings } = trpc.marketplace.searchListings.useQuery(
    { limit: 50, offset: 0 },
    { retry: false, staleTime: 30_000 }
  );

  const totalListings = listings?.length || 0;
  const activeListings = listings?.filter((l: any) => l.status === "active")?.length || 0;

  return (
    <Card className="shadow-lg dark:bg-gray-900" role="region" aria-label="Marketplace summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-green-600" />
            Marketplace
          </span>
          <a href="/marketplace">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">{activeListings}</div>
            <div className="text-xs text-green-600 dark:text-green-500">Active Listings</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{totalListings}</div>
            <div className="text-xs text-blue-600 dark:text-blue-500">Total Products</div>
          </div>
        </div>
        {listings && listings.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Top Products</p>
            {listings.slice(0, 3).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1 mr-2">{item.title}</span>
                <Badge variant="outline" className="text-xs shrink-0">
                  {formatCurrency(Number(item.pricePerUnit || 0))}/{item.unit}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
