import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Snowflake, ArrowRight, Thermometer, AlertTriangle, CheckCircle } from "lucide-react";

export function ColdChainWidget() {
  const sensors = [
    { id: "SEN-001", location: "Hub A - Ibadan", temp: 4.2, status: "normal", crop: "Tomatoes" },
    { id: "SEN-002", location: "Hub B - Lagos", temp: -1.5, status: "normal", crop: "Fish" },
    { id: "SEN-003", location: "Transit - Kano", temp: 8.7, status: "warning", crop: "Plantain" },
  ];

  const violations = sensors.filter(s => s.status === "warning").length;

  return (
    <Card className="shadow-lg dark:bg-gray-900" role="region" aria-label="Cold chain monitoring summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-cyan-600" />
            Cold Chain
          </span>
          <a href="/cold-chain">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Monitor <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-cyan-50 dark:bg-cyan-950/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{sensors.length}</div>
            <div className="text-xs text-cyan-600 dark:text-cyan-500">Active Sensors</div>
          </div>
          <div className={`rounded-lg p-3 text-center ${violations > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-green-50 dark:bg-green-950/30"}`}>
            <div className={`text-2xl font-bold ${violations > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              {violations}
            </div>
            <div className={`text-xs ${violations > 0 ? "text-red-600 dark:text-red-500" : "text-green-600 dark:text-green-500"}`}>
              {violations > 0 ? "Alerts" : "All Clear"}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {sensors.map((sensor) => (
            <div key={sensor.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                {sensor.status === "warning" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                )}
                <span className="truncate max-w-[120px]">{sensor.crop}</span>
              </div>
              <div className="flex items-center gap-2">
                <Thermometer className="w-3 h-3 text-muted-foreground" />
                <Badge variant={sensor.status === "warning" ? "destructive" : "outline"} className="text-xs">
                  {sensor.temp}°C
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
