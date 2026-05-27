import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Bug, AlertTriangle, Shield } from 'lucide-react';

/**
 * Pest/Disease History Chart Component
 * 
 * Displays pest and disease risk levels over time as a bar chart
 * Color-coded by risk severity with threshold indicators
 */

interface PestDiseaseDataPoint {
  date: string;
  riskLevel: number; // Risk score (0-100)
  pestType: string; // e.g., "Fall Armyworm", "Stem Borer"
  diseaseType?: string; // e.g., "Leaf Blight", "Root Rot"
  temperature: number;
  humidity: number;
  rainfall: number;
}

interface PestDiseaseHistoryChartProps {
  data: PestDiseaseDataPoint[];
  farmName: string;
  cropName?: string;
}

export default function PestDiseaseHistoryChart({ data, farmName, cropName }: PestDiseaseHistoryChartProps) {
  // Calculate statistics
  const avgRisk = data.length > 0
    ? data.reduce((sum, d) => sum + d.riskLevel, 0) / data.length
    : 0;

  const currentRisk = data[data.length - 1]?.riskLevel || 0;
  const maxRisk = data.length > 0 ? Math.max(...data.map(d => d.riskLevel)) : 0;
  
  // Count high-risk events (>= 80)
  const highRiskEvents = data.filter(d => d.riskLevel >= 80).length;
  const criticalRiskEvents = data.filter(d => d.riskLevel >= 90).length;

  // Determine risk status and color
  const getRiskStatus = (level: number) => {
    if (level >= 90) return { status: 'Critical', color: '#dc2626', textColor: 'text-red-600' };
    if (level >= 80) return { status: 'High', color: '#ea580c', textColor: 'text-orange-600' };
    if (level >= 60) return { status: 'Moderate', color: '#f59e0b', textColor: 'text-yellow-600' };
    if (level >= 40) return { status: 'Low', color: '#3b82f6', textColor: 'text-blue-600' };
    return { status: 'Minimal', color: '#10b981', textColor: 'text-green-600' };
  };

  const currentStatus = getRiskStatus(currentRisk);

  // Get bar color based on risk level
  const getBarColor = (riskLevel: number) => {
    return getRiskStatus(riskLevel).color;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const status = getRiskStatus(data.riskLevel);
      return (
        <div className="bg-popover text-popover-foreground p-3 rounded-lg shadow-lg border border-border">
          <p className="font-semibold">{data.date}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Risk Level: <span className={`font-medium ${status.textColor}`}>{data.riskLevel}% ({status.status})</span>
          </p>
          {data.pestType && (
            <p className="text-sm text-muted-foreground">
              Pest: <span className="font-medium text-foreground">{data.pestType}</span>
            </p>
          )}
          {data.diseaseType && (
            <p className="text-sm text-muted-foreground">
              Disease: <span className="font-medium text-foreground">{data.diseaseType}</span>
            </p>
          )}
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Temp: {data.temperature}°C | Humidity: {data.humidity}% | Rainfall: {data.rainfall}mm
            </p>
          </div>
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
              <Bug className="h-5 w-5 text-orange-500" />
              Pest & Disease Risk History
            </CardTitle>
            <CardDescription className="mt-1">
              {farmName} {cropName && `• ${cropName}`}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold ${currentStatus.textColor}`}>
              {currentRisk}%
            </div>
            <div className="text-xs text-muted-foreground">
              {currentStatus.status} Risk
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No pest/disease risk data available yet</p>
            <p className="text-xs mt-1">Data will appear after risk assessments run</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                  label={{ value: 'Risk Level (%)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* High risk threshold (80%) */}
                <ReferenceLine
                  y={80}
                  stroke="#ea580c"
                  strokeDasharray="5 5"
                  label={{ value: 'High Risk (80%)', position: 'right', fontSize: 11 }}
                />
                
                {/* Critical risk threshold (90%) */}
                <ReferenceLine
                  y={90}
                  stroke="#dc2626"
                  strokeDasharray="5 5"
                  label={{ value: 'Critical (90%)', position: 'right', fontSize: 11 }}
                />
                
                <Bar dataKey="riskLevel" radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.riskLevel)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Avg Risk</div>
                <div className={`text-lg font-semibold mt-1 ${getRiskStatus(avgRisk).textColor}`}>
                  {avgRisk.toFixed(0)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Max Risk</div>
                <div className={`text-lg font-semibold mt-1 ${getRiskStatus(maxRisk).textColor}`}>
                  {maxRisk}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">High Risk Days</div>
                <div className="text-lg font-semibold text-orange-600 mt-1">
                  {highRiskEvents}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">Critical Days</div>
                <div className="text-lg font-semibold text-red-600 mt-1">
                  {criticalRiskEvents}
                </div>
              </div>
            </div>

            {currentRisk >= 80 && (
              <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-600">
                      {currentRisk >= 90 ? 'Critical Pest/Disease Risk' : 'High Pest/Disease Risk'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Immediate action recommended. Check dashboard for IPM strategies and treatment options.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Risk level legend */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#10b981' }}></div>
                <span className="text-muted-foreground">Minimal (0-39%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }}></div>
                <span className="text-muted-foreground">Low (40-59%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }}></div>
                <span className="text-muted-foreground">Moderate (60-79%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ea580c' }}></div>
                <span className="text-muted-foreground">High (80-89%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: '#dc2626' }}></div>
                <span className="text-muted-foreground">Critical (90-100%)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
