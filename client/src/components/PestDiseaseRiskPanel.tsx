/**
 * Pest & Disease Risk Panel Component
 * 
 * Displays risk assessments and IPM recommendations
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Bug, AlertTriangle, Shield, Leaf, Sprout } from "lucide-react";

interface RiskScore {
  pestOrDisease: string;
  type: 'pest' | 'disease';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  affectedCrops: string[];
  severity: 'low' | 'medium' | 'high';
  symptoms: string[];
  controlMeasures: string[];
  weatherFactors: {
    temperature: 'favorable' | 'neutral' | 'unfavorable';
    humidity: 'favorable' | 'neutral' | 'unfavorable';
    rainfall: 'favorable' | 'neutral' | 'unfavorable';
  };
  recommendation: string;
}

interface IPMRecommendations {
  preventiveMeasures: string[];
  monitoringSchedule: string;
  culturalPractices: string[];
  biologicalControls: string[];
  chemicalControls: string[];
}

interface PestDiseaseRiskPanelProps {
  risks: RiskScore[];
  ipmRecommendations?: IPMRecommendations;
  loading?: boolean;
  onRefresh?: () => void;
}

export function PestDiseaseRiskPanel({
  risks,
  ipmRecommendations,
  loading,
  onRefresh,
}: PestDiseaseRiskPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Pest & Disease Risk Assessment
          </CardTitle>
          <CardDescription>Loading risk data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRiskBadge = (level: string) => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      critical: 'destructive',
      high: 'default',
      medium: 'secondary',
      low: 'outline',
    };
    const colors: Record<string, string> = {
      critical: 'text-red-600',
      high: 'text-orange-600',
      medium: 'text-yellow-600',
      low: 'text-green-600',
    };
    return (
      <Badge variant={variants[level]} className={colors[level]}>
        {level.toUpperCase()}
      </Badge>
    );
  };

  const getTypeIcon = (type: string) => {
    return type === 'pest' ? (
      <Bug className="h-4 w-4" />
    ) : (
      <Leaf className="h-4 w-4" />
    );
  };

  const highPriorityRisks = risks.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical');
  const otherRisks = risks.filter(r => r.riskLevel !== 'high' && r.riskLevel !== 'critical');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Pest & Disease Risk Assessment
            </CardTitle>
            <CardDescription>
              Weather-based risk analysis and IPM recommendations
            </CardDescription>
          </div>
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" size="sm">
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="risks" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="risks">
              Risk Alerts
              {highPriorityRisks.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {highPriorityRisks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ipm">IPM Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="risks" className="space-y-4">
            {/* High Priority Risks */}
            {highPriorityRisks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <h3 className="font-semibold text-sm">High Priority Alerts</h3>
                </div>
                <ScrollArea className="h-[300px] rounded-lg border">
                  <div className="p-4 space-y-4">
                    {highPriorityRisks.map((risk, index) => (
                      <div key={index} className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(risk.type)}
                            <div>
                              <p className="font-medium">{risk.pestOrDisease}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {risk.type} • Severity: {risk.severity}
                              </p>
                            </div>
                          </div>
                          {getRiskBadge(risk.riskLevel)}
                        </div>
                        
                        <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                          <p className="text-sm">{risk.recommendation}</p>
                          
                          <div className="flex gap-4 text-xs">
                            <div>
                              <span className="font-medium">Risk Score:</span>{' '}
                              <span className="font-semibold">{risk.riskScore}/100</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="font-medium">Weather:</span>
                              <span>🌡️ {risk.weatherFactors.temperature}</span>
                              <span>💧 {risk.weatherFactors.humidity}</span>
                              <span>🌧️ {risk.weatherFactors.rainfall}</span>
                            </div>
                          </div>
                        </div>

                        {/* Symptoms */}
                        <div>
                          <p className="text-xs font-medium mb-1">Symptoms to Watch:</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {risk.symptoms.slice(0, 3).map((symptom, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span>•</span>
                                <span>{symptom}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Control Measures */}
                        <div>
                          <p className="text-xs font-medium mb-1">Immediate Actions:</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {risk.controlMeasures.slice(0, 2).map((measure, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <span>✓</span>
                                <span>{measure}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {index < highPriorityRisks.length - 1 && <Separator />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Other Risks */}
            {otherRisks.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Other Risks</h3>
                <div className="space-y-2">
                  {otherRisks.map((risk, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        {getTypeIcon(risk.type)}
                        <div>
                          <p className="text-sm font-medium">{risk.pestOrDisease}</p>
                          <p className="text-xs text-muted-foreground">
                            Score: {risk.riskScore}/100
                          </p>
                        </div>
                      </div>
                      {getRiskBadge(risk.riskLevel)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {risks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No significant pest or disease risks detected</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="ipm" className="space-y-4">
            {ipmRecommendations ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 pr-4">
                  {/* Monitoring Schedule */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Sprout className="h-4 w-4" />
                      Monitoring Schedule
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {ipmRecommendations.monitoringSchedule}
                    </p>
                  </div>

                  <Separator />

                  {/* Preventive Measures */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Preventive Measures</h3>
                    <ul className="space-y-1">
                      {ipmRecommendations.preventiveMeasures.map((measure, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span>{measure}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Separator />

                  {/* Cultural Practices */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Cultural Practices</h3>
                    <ul className="space-y-1">
                      {ipmRecommendations.culturalPractices.map((practice, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-blue-600 mt-0.5">•</span>
                          <span>{practice}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Separator />

                  {/* Biological Controls */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Biological Controls</h3>
                    <ul className="space-y-1">
                      {ipmRecommendations.biologicalControls.map((control, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">🌿</span>
                          <span>{control}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Separator />

                  {/* Chemical Controls */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-sm">Chemical Controls (Last Resort)</h3>
                    <ul className="space-y-1">
                      {ipmRecommendations.chemicalControls.map((control, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-orange-600 mt-0.5">⚠️</span>
                          <span>{control}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No IPM recommendations available</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
