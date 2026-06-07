import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Link } from "wouter";

export default function IoTSensorDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [devices] = useState<Array<{ id: number; name: string; type: string; protocol: string; status: string; battery: number; lat: number; lon: number; lastReading: Record<string, number> }>>([
    { id: 1, name: "Soil Sensor A1", type: "soil_sensor", protocol: "lorawan", status: "active", battery: 85, lat: -1.2801, lon: 36.8200, lastReading: { soil_moisture: 42.3, soil_temp: 24.1, soil_ec: 0.45 } },
    { id: 2, name: "Weather Station W1", type: "weather_station", protocol: "wifi", status: "active", battery: 100, lat: -1.2810, lon: 36.8220, lastReading: { temperature: 27.5, humidity: 65, wind_speed: 3.2, rainfall: 0 } },
    { id: 3, name: "Water Level L1", type: "water_level", protocol: "lorawan", status: "active", battery: 72, lat: -1.2795, lon: 36.8185, lastReading: { water_level_cm: 45, flow_rate: 12.3 } },
    { id: 4, name: "Soil Sensor A2", type: "soil_sensor", protocol: "lorawan", status: "offline", battery: 5, lat: -1.2820, lon: 36.8210, lastReading: { soil_moisture: 28.1, soil_temp: 25.5, soil_ec: 0.38 } },
  ]);

  const active = devices.filter(d => d.status === "active").length;
  const offline = devices.filter(d => d.status === "offline").length;
  const lowBattery = devices.filter(d => d.battery < 20).length;

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">📡 IoT Sensor Network</h1>
            <p className="text-sm text-gray-600">LoRaWAN, MQTT, BLE — soil sensors, weather stations, water monitoring</p>
          </div>
          <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-teal-600">{devices.length}</div><p className="text-sm text-gray-500">Total Devices</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-green-600">{active}</div><p className="text-sm text-gray-500">Active</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-red-600">{offline}</div><p className="text-sm text-gray-500">Offline</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-yellow-600">{lowBattery}</div><p className="text-sm text-gray-500">Low Battery</p></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Network Overview</TabsTrigger>
            <TabsTrigger value="soil">Soil Sensors</TabsTrigger>
            <TabsTrigger value="weather">Weather</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader><CardTitle>Sensor Devices</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {devices.map(device => (
                    <div key={device.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-semibold">{device.name}</span>
                          <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">{device.protocol.toUpperCase()}</span>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${device.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{device.status}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>🔋 {device.battery}%</span>
                        <span>📍 {device.lat.toFixed(4)}, {device.lon.toFixed(4)}</span>
                        <span>{device.type.replace("_", " ")}</span>
                      </div>
                      <div className="mt-2 text-xs text-gray-400">
                        Last: {Object.entries(device.lastReading).map(([k, v]) => `${k.replace("_", " ")}=${v}`).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="soil">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.filter(d => d.type === "soil_sensor").map(device => (
                <Card key={device.id}>
                  <CardHeader><CardTitle className="text-lg">{device.name}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div><div className="text-2xl font-bold text-blue-600">{device.lastReading.soil_moisture}%</div><p className="text-xs text-gray-500">Moisture</p></div>
                      <div><div className="text-2xl font-bold text-orange-600">{device.lastReading.soil_temp}°C</div><p className="text-xs text-gray-500">Temperature</p></div>
                      <div><div className="text-2xl font-bold text-green-600">{device.lastReading.soil_ec} dS/m</div><p className="text-xs text-gray-500">EC</p></div>
                    </div>
                    {(device.lastReading.soil_moisture ?? 100) < 35 && (
                      <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded p-2 text-sm text-yellow-800">
                        ⚠️ Soil moisture below irrigation threshold for maize (35%)
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="weather">
            <Card>
              <CardHeader><CardTitle>Weather Station Data</CardTitle></CardHeader>
              <CardContent>
                {devices.filter(d => d.type === "weather_station").map(station => (
                  <div key={station.id} className="grid grid-cols-4 gap-4 text-center">
                    <div><div className="text-3xl font-bold text-orange-600">{station.lastReading.temperature}°C</div><p className="text-sm text-gray-500">Temperature</p></div>
                    <div><div className="text-3xl font-bold text-blue-600">{station.lastReading.humidity}%</div><p className="text-sm text-gray-500">Humidity</p></div>
                    <div><div className="text-3xl font-bold text-gray-600">{station.lastReading.wind_speed} m/s</div><p className="text-sm text-gray-500">Wind Speed</p></div>
                    <div><div className="text-3xl font-bold text-cyan-600">{station.lastReading.rainfall} mm</div><p className="text-sm text-gray-500">Rainfall</p></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader><CardTitle>Active Alerts</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {devices.filter(d => d.battery < 20).map(d => (
                    <div key={d.id} className="bg-yellow-50 border-l-4 border-yellow-400 p-3">🔋 Low battery on {d.name}: {d.battery}%</div>
                  ))}
                  {devices.filter(d => d.status === "offline").map(d => (
                    <div key={d.id} className="bg-red-50 border-l-4 border-red-400 p-3">⚠️ {d.name} is offline</div>
                  ))}
                  {devices.filter(d => d.type === "soil_sensor" && (d.lastReading.soil_moisture ?? 100) < 35).map(d => (
                    <div key={d.id} className="bg-blue-50 border-l-4 border-blue-400 p-3">💧 {d.name}: Soil moisture {d.lastReading.soil_moisture}% — irrigation recommended</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
