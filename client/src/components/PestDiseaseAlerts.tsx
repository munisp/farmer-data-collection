import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Bug, CheckCircle, Info, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PestDiseaseAlert {
  id: number;
  pestDiseaseName: string;
  pestDiseaseType: 'pest' | 'disease';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  temperatureFactor: number;
  humidityFactor: number;
  rainfallFactor: number;
  windFactor: number;
  recommendation: string;
  actionRequired: boolean;
  detectedAt: Date;
  expiresAt: Date;
  acknowledged: boolean;
}

interface PestDiseaseAlertsProps {
  cropName: string;
  farmName?: string;
  alerts: PestDiseaseAlert[];
  onAcknowledge?: (alertId: number) => void;
  onDismiss?: (alertId: number) => void;
}

export function PestDiseaseAlerts({
  cropName,
  farmName,
  alerts,
  onAcknowledge,
  onDismiss,
}: PestDiseaseAlertsProps) {
  const [expandedAlerts, setExpandedAlerts] = useState<Set<number>>(new Set());

  const toggleExpand = (alertId: number) => {
    const newExpanded = new Set(expandedAlerts);
    if (newExpanded.has(alertId)) {
      newExpanded.delete(alertId);
    } else {
      newExpanded.add(alertId);
    }
    setExpandedAlerts(newExpanded);
  };

  const handleAcknowledge = (alertId: number) => {
    if (onAcknowledge) {
      onAcknowledge(alertId);
      toast.success("Alert acknowledged");
    }
  };

  const handleDismiss = (alertId: number) => {
    if (onDismiss) {
      onDismiss(alertId);
      toast.success("Alert dismissed");
    }
  };

  // Get risk level styling
  const getRiskStyle = (riskLevel: string) => {
    switch (riskLevel) {
      case "critical":
        return {
          color: "destructive",
          bgColor: "bg-red-50",
          borderColor: "border-red-200",
          textColor: "text-red-900",
          icon: AlertTriangle,
          iconColor: "text-red-500",
        };
      case "high":
        return {
          color: "destructive",
          bgColor: "bg-orange-50",
          borderColor: "border-orange-200",
          textColor: "text-orange-900",
          icon: AlertTriangle,
          iconColor: "text-orange-500",
        };
      case "medium":
        return {
          color: "default",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-200",
          textColor: "text-yellow-900",
          icon: Info,
          iconColor: "text-yellow-500",
        };
      case "low":
        return {
          color: "secondary",
          bgColor: "bg-green-50",
          borderColor: "border-green-200",
          textColor: "text-green-900",
          icon: CheckCircle,
          iconColor: "text-green-500",
        };
      default:
        return {
          color: "secondary",
          bgColor: "bg-gray-50",
          borderColor: "border-gray-200",
          textColor: "text-gray-900",
          icon: Info,
          iconColor: "text-gray-500",
        };
    }
  };

  // Filter active (non-acknowledged) alerts
  const activeAlerts = alerts.filter(a => !a.acknowledged);
  const acknowledgedAlerts = alerts.filter(a => a.acknowledged);

  // Sort by risk score (highest first)
  const sortedActiveAlerts = [...activeAlerts].sort((a, b) => b.riskScore - a.riskScore);

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <CardTitle>Pest & Disease Alerts</CardTitle>
          </div>
          <CardDescription>
            No active pest or disease risks detected for {cropName}
            {farmName && ` at ${farmName}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>All clear! Continue routine monitoring.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-orange-500" />
            <CardTitle>Pest & Disease Alerts</CardTitle>
          </div>
          <Badge variant={activeAlerts.length > 0 ? "destructive" : "secondary"}>
            {activeAlerts.length} Active
          </Badge>
        </div>
        <CardDescription>
          Weather-based risk assessments for {cropName}
          {farmName && ` at ${farmName}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Active Alerts */}
        {sortedActiveAlerts.length > 0 && (
          <div className="space-y-3">
            {sortedActiveAlerts.map((alert) => {
              const style = getRiskStyle(alert.riskLevel);
              const Icon = style.icon;
              const TypeIcon = Bug; // Use Bug icon for both pest and disease types
              const isExpanded = expandedAlerts.has(alert.id);

              return (
                <div
                  key={alert.id}
                  className={`border rounded-lg p-4 ${style.bgColor} ${style.borderColor}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 mt-0.5 ${style.iconColor}`} />
                    <div className="flex-1 space-y-2">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold ${style.textColor}`}>
                              {alert.pestDiseaseName}
                            </span>
                            <Badge variant={style.color as 'default' | 'destructive' | 'secondary' | 'outline'}>
                              {alert.riskLevel.toUpperCase()} Risk
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <TypeIcon className="h-3 w-3" />
                              <span>{alert.pestDiseaseType}</span>
                            </div>
                          </div>
                          <div className="text-sm font-medium mt-1">
                            Risk Score: {alert.riskScore.toFixed(1)}%
                          </div>
                        </div>
                        {onDismiss && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDismiss(alert.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Recommendation */}
                      <p className="text-sm">{alert.recommendation}</p>

                      {/* Risk Factors (Expandable) */}
                      <div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(alert.id)}
                          className="h-auto p-0 text-xs"
                        >
                          {isExpanded ? "Hide Details" : "Show Risk Factors"}
                        </Button>

                        {isExpanded && (
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="font-medium">Temperature:</span>{" "}
                              <span className={alert.temperatureFactor > 0.7 ? "text-red-600 font-semibold" : ""}>
                                {(alert.temperatureFactor * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">Humidity:</span>{" "}
                              <span className={alert.humidityFactor > 0.7 ? "text-red-600 font-semibold" : ""}>
                                {(alert.humidityFactor * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">Rainfall:</span>{" "}
                              <span className={alert.rainfallFactor > 0.7 ? "text-red-600 font-semibold" : ""}>
                                {(alert.rainfallFactor * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">Wind:</span>{" "}
                              <span className={alert.windFactor > 0.7 ? "text-red-600 font-semibold" : ""}>
                                {(alert.windFactor * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="col-span-2 text-xs text-muted-foreground mt-2">
                              Detected: {new Date(alert.detectedAt).toLocaleString()}
                              <br />
                              Expires: {new Date(alert.expiresAt).toLocaleDateString()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {alert.actionRequired && onAcknowledge && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant={alert.riskLevel === 'critical' ? 'destructive' : 'default'}
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            Acknowledge & Take Action
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Acknowledged Alerts (Collapsed) */}
        {acknowledgedAlerts.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {acknowledgedAlerts.length} Acknowledged Alert{acknowledgedAlerts.length > 1 ? 's' : ''}
              </summary>
              <div className="mt-2 space-y-2">
                {acknowledgedAlerts.map((alert) => (
                  <div key={alert.id} className="text-xs text-muted-foreground">
                    ✓ {alert.pestDiseaseName} ({alert.riskLevel} risk) - Acknowledged
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Info Footer */}
        <div className="border-t pt-3 mt-3">
          <div className="bg-blue-50 p-3 rounded-md text-xs text-blue-900">
            <strong>💡 How it works:</strong> Risk scores are calculated from current weather conditions
            (temperature, humidity, rainfall, wind) and compared to optimal conditions for each pest/disease.
            Alerts are updated daily and expire after 7 days.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
