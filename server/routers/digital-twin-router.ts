import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

interface FarmTwin {
  id: string; farmId: string; farmerId: number; name: string; totalAcres: number;
  zones: FarmZone[]; sensors: SensorReading[]; lastUpdated: string;
  environment: { temperature: number; humidity: number; soilMoisture: number; rainfall24h: number; windSpeed: number };
}

interface FarmZone {
  id: string; name: string; acres: number; cropType: string; growthStage: string;
  plantedDate: string; healthScore: number; ndvi: number; soilPH: number;
  irrigationStatus: string; fertilizerApplied: boolean; pestRisk: string;
}

interface SensorReading {
  sensorId: string; type: string; value: number; unit: string; location: string; timestamp: string; status: string;
}

interface SimulationResult {
  id: string; farmId: string; scenario: string; parameters: Record<string, any>;
  predictedYield: number; yieldChange: number; costImpact: number; riskLevel: string;
  recommendations: string[];
}

const twins: FarmTwin[] = [
  {
    id: "TWIN-001", farmId: "FARM-001", farmerId: 1001, name: "Adamu's Maize Farm", totalAcres: 5,
    zones: [
      { id: "Z1", name: "North Field", acres: 2, cropType: "maize", growthStage: "flowering", plantedDate: "2026-03-15", healthScore: 88, ndvi: 0.72, soilPH: 6.2, irrigationStatus: "active", fertilizerApplied: true, pestRisk: "low" },
      { id: "Z2", name: "South Field", acres: 1.5, cropType: "maize", growthStage: "grain_filling", plantedDate: "2026-03-01", healthScore: 92, ndvi: 0.78, soilPH: 6.5, irrigationStatus: "active", fertilizerApplied: true, pestRisk: "low" },
      { id: "Z3", name: "East Plot", acres: 1.5, cropType: "beans", growthStage: "vegetative", plantedDate: "2026-04-15", healthScore: 75, ndvi: 0.55, soilPH: 5.8, irrigationStatus: "scheduled", fertilizerApplied: false, pestRisk: "medium" },
    ],
    sensors: [
      { sensorId: "S001", type: "soil_moisture", value: 42, unit: "%", location: "Z1", timestamp: "2026-05-27T10:00:00Z", status: "normal" },
      { sensorId: "S002", type: "temperature", value: 28.5, unit: "°C", location: "Z1", timestamp: "2026-05-27T10:00:00Z", status: "normal" },
      { sensorId: "S003", type: "humidity", value: 65, unit: "%", location: "Z2", timestamp: "2026-05-27T10:00:00Z", status: "normal" },
      { sensorId: "S004", type: "soil_ph", value: 6.2, unit: "pH", location: "Z3", timestamp: "2026-05-27T10:00:00Z", status: "warning" },
      { sensorId: "S005", type: "light_intensity", value: 850, unit: "lux", location: "Z1", timestamp: "2026-05-27T10:00:00Z", status: "normal" },
    ],
    lastUpdated: "2026-05-27T10:00:00Z",
    environment: { temperature: 28.5, humidity: 65, soilMoisture: 42, rainfall24h: 0, windSpeed: 8.2 },
  },
];

function runSimulation(twin: FarmTwin, scenario: string, params: Record<string, any>): SimulationResult {
  const baseYield = twin.zones.reduce((s, z) => {
    const yieldPerAcre: Record<string, number> = { maize: 1000, rice: 800, beans: 500, cassava: 3000, tomatoes: 2500 };
    return s + (yieldPerAcre[z.cropType] || 500) * z.acres * (z.healthScore / 100);
  }, 0);

  let yieldChange = 0;
  let costImpact = 0;
  let riskLevel = "low";
  const recommendations: string[] = [];

  switch (scenario) {
    case "add_fertilizer":
      yieldChange = Math.round(baseYield * 0.15);
      costImpact = (params.amount || 50) * 220 * twin.totalAcres;
      recommendations.push("Apply in split doses: 50% at planting, 50% at top-dress");
      break;
    case "increase_irrigation":
      yieldChange = Math.round(baseYield * 0.12);
      costImpact = Math.round(twin.totalAcres * 15000);
      riskLevel = "low";
      recommendations.push("Increase irrigation frequency from weekly to bi-weekly during flowering");
      break;
    case "drought_stress":
      yieldChange = -Math.round(baseYield * (params.severity || 0.3));
      costImpact = 0;
      riskLevel = params.severity > 0.5 ? "high" : "medium";
      recommendations.push("Activate drip irrigation immediately", "Apply mulch to conserve soil moisture", "Consider drought-tolerant variety next season");
      break;
    case "pest_outbreak":
      yieldChange = -Math.round(baseYield * (params.severity || 0.2));
      costImpact = Math.round(twin.totalAcres * 8000);
      riskLevel = params.severity > 0.4 ? "high" : "medium";
      recommendations.push("Scout all zones within 48 hours", "Apply targeted pesticide to affected zones", "Set up pheromone traps at field borders");
      break;
    case "expand_acreage":
      const newAcres = params.additionalAcres || 2;
      yieldChange = Math.round((baseYield / twin.totalAcres) * newAcres);
      costImpact = Math.round(newAcres * 150000);
      riskLevel = "medium";
      recommendations.push(`Additional ${newAcres} acres will require ${Math.ceil(newAcres * 25)}kg more seed`, "Consider hiring additional labor for expanded area");
      break;
    default:
      recommendations.push("No simulation model available for this scenario");
  }

  return {
    id: `SIM-${Date.now()}`, farmId: twin.farmId, scenario, parameters: params,
    predictedYield: baseYield + yieldChange, yieldChange, costImpact, riskLevel, recommendations,
  };
}

export const digitalTwinRouter = router({
  getFarmTwin: protectedProcedure
    .input(z.object({ farmId: z.string() }))
    .query(({ input }) => {
      const twin = twins.find(t => t.farmId === input.farmId);
      if (!twin) return null;
      return { ...twin, overallHealth: Math.round(twin.zones.reduce((s, z) => s + z.healthScore, 0) / twin.zones.length), avgNDVI: Math.round(twin.zones.reduce((s, z) => s + z.ndvi, 0) / twin.zones.length * 100) / 100, alertCount: twin.sensors.filter(s => s.status === "warning" || s.status === "critical").length };
    }),

  getZoneDetail: protectedProcedure
    .input(z.object({ farmId: z.string(), zoneId: z.string() }))
    .query(({ input }) => {
      const twin = twins.find(t => t.farmId === input.farmId);
      if (!twin) return null;
      const zone = twin.zones.find(z => z.id === input.zoneId);
      if (!zone) return null;
      const zoneSensors = twin.sensors.filter(s => s.location === input.zoneId);
      return { ...zone, sensors: zoneSensors, environment: twin.environment };
    }),

  runSimulation: protectedProcedure
    .input(z.object({ farmId: z.string(), scenario: z.enum(["add_fertilizer", "increase_irrigation", "drought_stress", "pest_outbreak", "expand_acreage"]), parameters: z.record(z.string(), z.any()).optional() }))
    .mutation(({ input }) => {
      const twin = twins.find(t => t.farmId === input.farmId);
      if (!twin) return { success: false, error: "Farm twin not found" };
      const result = runSimulation(twin, input.scenario, input.parameters || {});
      logger.info("[DigitalTwin] Simulation run", { farmId: input.farmId, scenario: input.scenario, yieldChange: result.yieldChange });
      return { success: true, result };
    }),

  getSensorData: protectedProcedure
    .input(z.object({ farmId: z.string(), sensorType: z.string().optional(), zone: z.string().optional() }).optional())
    .query(({ input }) => {
      const twin = twins.find(t => t.farmId === input?.farmId);
      if (!twin) return [];
      let sensors = twin.sensors;
      if (input?.sensorType) sensors = sensors.filter(s => s.type === input.sensorType);
      if (input?.zone) sensors = sensors.filter(s => s.location === input.zone);
      return sensors;
    }),

  getAlerts: protectedProcedure
    .input(z.object({ farmId: z.string() }))
    .query(({ input }) => {
      const twin = twins.find(t => t.farmId === input.farmId);
      if (!twin) return [];
      const alerts: { type: string; severity: string; zone: string; message: string; timestamp: string }[] = [];
      twin.zones.forEach(z => {
        if (z.healthScore < 70) alerts.push({ type: "health", severity: "warning", zone: z.name, message: `Zone health below threshold (${z.healthScore}/100)`, timestamp: twin.lastUpdated });
        if (z.pestRisk === "high") alerts.push({ type: "pest", severity: "critical", zone: z.name, message: "High pest risk detected", timestamp: twin.lastUpdated });
        if (z.soilPH < 5.5 || z.soilPH > 7.5) alerts.push({ type: "soil", severity: "warning", zone: z.name, message: `Soil pH out of range (${z.soilPH})`, timestamp: twin.lastUpdated });
      });
      twin.sensors.forEach(s => {
        if (s.status === "warning") alerts.push({ type: "sensor", severity: "warning", zone: s.location, message: `${s.type} reading abnormal (${s.value}${s.unit})`, timestamp: s.timestamp });
      });
      return alerts;
    }),

  compareScenarios: protectedProcedure
    .input(z.object({ farmId: z.string(), scenarios: z.array(z.object({ scenario: z.string(), parameters: z.record(z.string(), z.any()).optional() })).min(2).max(5) }))
    .query(({ input }) => {
      const twin = twins.find(t => t.farmId === input.farmId);
      if (!twin) return null;
      const results = input.scenarios.map(s => runSimulation(twin, s.scenario, s.parameters || {}));
      const best = results.reduce((best, r) => r.yieldChange > best.yieldChange ? r : best, results[0]);
      return { comparisons: results, bestScenario: best.scenario, bestYieldChange: best.yieldChange, recommendation: `Scenario "${best.scenario}" provides the best yield improvement of ${best.yieldChange}kg (+${Math.round((best.yieldChange / (best.predictedYield - best.yieldChange)) * 100)}%)` };
    }),
});
