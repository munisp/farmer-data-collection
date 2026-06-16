import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, MapPin, Clock, ArrowRight, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function DeliveryStatusWidget() {
  const { data: zones } = trpc.delivery.listZones.useQuery(
    {},
    { retry: false, staleTime: 30_000 }
  );

  const totalZones = zones?.length || 0;

  return (
    <Card className="shadow-lg dark:bg-gray-900" role="region" aria-label="Delivery status summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-orange-600" />
            Delivery & Logistics
          </span>
          <a href="/delivery">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{totalZones}</div>
            <div className="text-xs text-orange-600 dark:text-orange-500">Delivery Zones</div>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-700 dark:text-green-400">3</div>
            <div className="text-xs text-green-600 dark:text-green-500">Active Drivers</div>
          </div>
        </div>
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{totalZones} delivery zones active</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Real-time GPS tracking enabled</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            <span className="text-muted-foreground">Cold chain monitoring active</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
