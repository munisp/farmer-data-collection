import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Calendar, TrendingUp } from 'lucide-react';

/**
 * GDD History Chart Component
 * 
 * Displays cumulative Growing Degree Days (GDD) over time for a specific crop
 * Shows daily accumulation as a line chart with area fill
 */

interface GDDDataPoint {
  date: string;
  cumulativeGDD: number;
  dailyGDD: number;
  growthStage: string;
}

interface GDDHistoryChartProps {
  data: GDDDataPoint[];
  cropName: string;
  targetGDD?: number; // Optional target GDD for harvest
}

export default function GDDHistoryChart({ data, cropName, targetGDD }: GDDHistoryChartProps) {
  // Calculate average daily GDD
  const avgDailyGDD = data.length > 0
    ? (data[data.length - 1]?.cumulativeGDD || 0) / data.length
    : 0;

  // Calculate days to target (if target provided)
  const currentGDD = data[data.length - 1]?.cumulativeGDD || 0;
  const daysToTarget = targetGDD && avgDailyGDD > 0
    ? Math.ceil((targetGDD - currentGDD) / avgDailyGDD)
    : null;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border border-border">
          <p className="font-semibold">{data.date}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cumulative GDD: <span className="font-medium text-foreground">{data.cumulativeGDD.toFixed(1)}°C</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Daily GDD: <span className="font-medium text-foreground">{data.dailyGDD.toFixed(1)}°C</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Stage: <span className="font-medium text-foreground">{data.growthStage}</span>
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
              <TrendingUp className="h-5 w-5 text-primary" />
              GDD Accumulation History
            </CardTitle>
            <CardDescription className="mt-1">
              Growing Degree Days for {cropName}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              {currentGDD.toFixed(0)}°C
            </div>
            <div className="text-xs text-muted-foreground">
              Current GDD
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No GDD data available yet</p>
            <p className="text-xs mt-1">Data will appear after daily monitoring runs</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorGDD" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  label={{ value: 'Cumulative GDD (°C)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cumulativeGDD"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorGDD)"
                />
                {targetGDD && (
                  <Line
                    type="monotone"
                    dataKey={() => targetGDD}
                    stroke="hsl(var(--destructive))"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                    name="Target GDD"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Avg Daily GDD</div>
                <div className="text-lg font-semibold text-foreground mt-1">
                  {avgDailyGDD.toFixed(1)}°C
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Days Tracked</div>
                <div className="text-lg font-semibold text-foreground mt-1">
                  {data.length}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">
                  {targetGDD ? 'Days to Target' : 'Current Stage'}
                </div>
                <div className="text-lg font-semibold text-foreground mt-1">
                  {targetGDD && daysToTarget !== null
                    ? `~${daysToTarget} days`
                    : data[data.length - 1]?.growthStage || 'N/A'}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
