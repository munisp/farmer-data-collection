import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Droplets, AlertTriangle, CheckCircle } from 'lucide-react';

/**
 * Soil Moisture History Chart Component
 * 
 * Displays soil moisture levels over time as an area chart
 * Shows critical thresholds and irrigation recommendations
 */

interface SoilMoistureDataPoint {
  date: string;
  moistureLevel: number; // Volumetric water content (%)
  temperature: number; // Soil temperature (°C)
  depth: number; // Measurement depth (cm)
}

interface SoilMoistureHistoryChartProps {
  data: SoilMoistureDataPoint[];
  farmName: string;
  soilType?: string;
}

export default function SoilMoistureHistoryChart({ data, farmName, soilType }: SoilMoistureHistoryChartProps) {
  // Calculate statistics
  const avgMoisture = data.length > 0
    ? data.reduce((sum, d) => sum + d.moistureLevel, 0) / data.length
    : 0;

  const currentMoisture = data[data.length - 1]?.moistureLevel || 0;
  const minMoisture = data.length > 0 ? Math.min(...data.map(d => d.moistureLevel)) : 0;
  const maxMoisture = data.length > 0 ? Math.max(...data.map(d => d.moistureLevel)) : 0;

  // Determine moisture status
  const getMoistureStatus = (level: number) => {
    if (level < 30) return { status: 'Critical', color: 'text-destructive', icon: AlertTriangle };
    if (level < 50) return { status: 'Low', color: 'text-orange-500', icon: AlertTriangle };
    if (level < 70) return { status: 'Optimal', color: 'text-green-500', icon: CheckCircle };
    return { status: 'High', color: 'text-blue-500', icon: Droplets };
  };

  const currentStatus = getMoistureStatus(currentMoisture);
  const StatusIcon = currentStatus.icon;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const status = getMoistureStatus(data.moistureLevel);
      return (
        <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border border-border">
          <p className="font-semibold">{data.date}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Moisture: <span className={`font-medium ${status.color}`}>{data.moistureLevel.toFixed(1)}%</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Temperature: <span className="font-medium text-foreground">{data.temperature.toFixed(1)}°C</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Depth: <span className="font-medium text-foreground">{data.depth}cm</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Status: <span className={`font-medium ${status.color}`}>{status.status}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-blue-500" />
              Soil Moisture History
            </CardTitle>
            <CardDescription className="mt-1">
              {farmName} {soilType && `• ${soilType} soil`}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${currentStatus.color} flex items-center gap-2 justify-end`}>
              <StatusIcon className="h-6 w-6" />
              {currentMoisture.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {currentStatus.status}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Droplets className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No soil moisture data available yet</p>
            <p className="text-xs mt-1">Data will appear after monitoring runs</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMoisture" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  label={{ value: 'Moisture Level (%)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Critical threshold line (30%) */}
                <ReferenceLine
                  y={30}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="5 5"
                  label={{ value: 'Critical (30%)', position: 'right', fontSize: 11 }}
                />
                
                {/* Optimal range lines (50-70%) */}
                <ReferenceLine
                  y={50}
                  stroke="hsl(142, 76%, 36%)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  label={{ value: 'Optimal Min', position: 'right', fontSize: 10 }}
                />
                <ReferenceLine
                  y={70}
                  stroke="hsl(142, 76%, 36%)"
                  strokeDasharray="3 3"
                  strokeOpacity={0.5}
                  label={{ value: 'Optimal Max', position: 'right', fontSize: 10 }}
                />
                
                <Area
                  type="monotone"
                  dataKey="moistureLevel"
                  stroke="hsl(221, 83%, 53%)"
                  strokeWidth={2}
                  fill="url(#colorMoisture)"
                />
              </AreaChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Average</div>
                <div className="text-lg font-semibold text-foreground mt-1">
                  {avgMoisture.toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Minimum</div>
                <div className="text-lg font-semibold text-orange-500 mt-1">
                  {minMoisture.toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Maximum</div>
                <div className="text-lg font-semibold text-blue-500 mt-1">
                  {maxMoisture.toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Readings</div>
                <div className="text-lg font-semibold text-foreground mt-1">
                  {data.length}
                </div>
              </div>
            </div>

            {currentMoisture < 30 && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Immediate Irrigation Required</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Soil moisture is critically low. Irrigate immediately to prevent crop stress.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
