import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Thermometer, Droplets, Battery, AlertTriangle, CheckCircle } from "lucide-react";

export default function ColdChainMonitoring() {
  const [crop, setCrop] = useState("tomatoes");
  const [temperature, setTemperature] = useState("5");
  const sensors = trpc.coldChain.listSensors.useQuery();
  const compliance = trpc.coldChain.checkCropCompliance.useQuery(
    { crop, temperature: parseFloat(temperature) || 0 },
    { enabled: !!crop && !!temperature }
  );
  const cropReqs = trpc.coldChain.getCropRequirements.useQuery();

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Cold Chain Monitoring</h1>
          <p className="text-muted-foreground">IoT sensor data, temperature alerts, and crop compliance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Thermometer className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{sensors.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Active Sensors</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Active Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Compliant</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Battery className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Low Battery</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Crop Compliance Check</CardTitle>
              <CardDescription>Verify temperature/humidity meets cold chain requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Crop</label>
                <Input value={crop} onChange={e => setCrop(e.target.value)} placeholder="e.g. tomatoes, milk, flowers" />
              </div>
              <div>
                <label className="text-sm font-medium">Temperature (°C)</label>
                <Input type="number" value={temperature} onChange={e => setTemperature(e.target.value)} />
              </div>
              {compliance.data && !("error" in compliance.data) && (
                <div className={`p-4 rounded-lg ${(compliance.data as Record<string, unknown>).compliant ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"} border`}>
                  <div className="flex items-center gap-2">
                    {(compliance.data as Record<string, unknown>).compliant ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {(compliance.data as Record<string, unknown>).compliant ? "Compliant" : "Non-Compliant"}
                    </span>
                  </div>
                  {((compliance.data as Record<string, unknown>).issues as string[])?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {((compliance.data as Record<string, unknown>).issues as string[]).map((issue: string, i: number) => (
                        <li key={i} className="text-sm text-red-600">• {issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registered Sensors</CardTitle>
              <CardDescription>IoT temperature & humidity sensors</CardDescription>
            </CardHeader>
            <CardContent>
              {sensors.data && sensors.data.length > 0 ? (
                <div className="space-y-3">
                  {sensors.data.map((sensor: Record<string, unknown>) => (
                    <div key={sensor.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{sensor.sensorId as string}</p>
                        <p className="text-sm text-muted-foreground capitalize">{sensor.sensorType as string}</p>
                      </div>
                      <Badge variant={sensor.active ? "default" : "secondary"}>
                        {sensor.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No sensors registered</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cold Chain Requirements by Crop</CardTitle>
            <CardDescription>Optimal temperature and humidity ranges for produce storage and transport</CardDescription>
          </CardHeader>
          <CardContent>
            {cropReqs.data && (cropReqs.data as Record<string, unknown>).crops ? (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {Object.entries((cropReqs.data as Record<string, unknown>).crops as Record<string, Record<string, unknown>>).map(([name, reqs]) => (
                  <div key={name} className="p-3 border rounded-lg">
                    <p className="font-medium capitalize">{name}</p>
                    <div className="mt-1 text-sm space-y-1">
                      <p>Temp: {reqs.min as number}°C – {reqs.max as number}°C</p>
                      {reqs.max_humidity != null && <p>Humidity: max {String(reqs.max_humidity)}%</p>}
                      <p>Shelf life: {reqs.shelf_life_days as number} days</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Loading crop requirements...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
