/**
 * Equipment Tracking and Fuel Monitoring Service
 * 
 * Manages farm equipment, GPS tracking, fuel consumption, and maintenance scheduling
 */

export interface Equipment {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  purchaseDate: Date;
  purchasePrice: number;
  currentValue: number;
  status: 'active' | 'maintenance' | 'retired';
  fuelType: 'diesel' | 'petrol' | 'electric' | 'hybrid';
  fuelCapacity: number; // liters
  hoursUsed: number;
  gpsTrackerId?: string;
  lastMaintenanceDate?: Date;
  nextMaintenanceDate?: Date;
}

export interface GPSLocation {
  latitude: number;
  longitude: number;
  timestamp: Date;
  speed?: number; // km/h
  heading?: number; // degrees
  altitude?: number; // meters
}

export interface FuelLog {
  id: string;
  equipmentId: string;
  date: Date;
  fuelType: string;
  quantity: number; // liters
  costPerUnit: number;
  totalCost: number;
  odometerReading: number; // hours or km
  fuelEfficiency?: number; // L/hr or L/100km
  location: string;
  operator: string;
  notes?: string;
}

export interface MaintenanceRecord {
  id: string;
  equipmentId: string;
  date: Date;
  type: 'routine' | 'repair' | 'inspection';
  description: string;
  cost: number;
  performedBy: string;
  partsReplaced?: string[];
  nextServiceDue?: Date;
  notes?: string;
}

export interface EquipmentUtilization {
  equipmentId: string;
  period: 'daily' | 'weekly' | 'monthly';
  hoursUsed: number;
  fuelConsumed: number;
  distanceCovered?: number;
  utilizationRate: number; // percentage
  costPerHour: number;
}

/**
 * Track equipment location in real-time
 */
export async function trackEquipmentLocation(
  equipmentId: string
): Promise<GPSLocation | null> {
  // Mock implementation - in production, integrate with GPS tracking device API
  
  // Example integrations:
  // - Trimble
  // - John Deere Operations Center
  // - Topcon
  // - Generic GPS trackers via API

  // Return null when no GPS tracker is connected — no fake coordinates
  return null;
}

/**
 * Get equipment location history
 */
export async function getEquipmentLocationHistory(
  equipmentId: string,
  startDate: Date,
  endDate: Date
): Promise<GPSLocation[]> {
  // In production, query GPS tracker API for historical positions
  // Return empty array when no tracker is configured
  const locations: GPSLocation[] = [];

  return locations;
}

/**
 * Calculate fuel efficiency
 */
export function calculateFuelEfficiency(
  fuelConsumed: number,
  hoursOperated?: number,
  distanceCovered?: number
): number {
  if (hoursOperated && hoursOperated > 0) {
    return fuelConsumed / hoursOperated; // L/hr
  } else if (distanceCovered && distanceCovered > 0) {
    return (fuelConsumed / distanceCovered) * 100; // L/100km
  }
  return 0;
}

/**
 * Predict next refueling date
 */
export function predictNextRefueling(
  currentFuelLevel: number,
  fuelCapacity: number,
  averageDailyConsumption: number
): { date: Date; daysRemaining: number } {
  const fuelRemaining = (currentFuelLevel / 100) * fuelCapacity;
  const daysRemaining = Math.floor(fuelRemaining / averageDailyConsumption);
  
  const nextRefuelDate = new Date();
  nextRefuelDate.setDate(nextRefuelDate.getDate() + daysRemaining);

  return {
    date: nextRefuelDate,
    daysRemaining,
  };
}

/**
 * Calculate equipment depreciation
 */
export function calculateDepreciation(
  purchasePrice: number,
  purchaseDate: Date,
  usefulLife: number = 10, // years
  salvageValue: number = 0
): {
  currentValue: number;
  annualDepreciation: number;
  accumulatedDepreciation: number;
} {
  const yearsOwned = (new Date().getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const annualDepreciation = (purchasePrice - salvageValue) / usefulLife;
  const accumulatedDepreciation = Math.min(annualDepreciation * yearsOwned, purchasePrice - salvageValue);
  const currentValue = Math.max(purchasePrice - accumulatedDepreciation, salvageValue);

  return {
    currentValue,
    annualDepreciation,
    accumulatedDepreciation,
  };
}

/**
 * Calculate total cost of ownership (TCO)
 */
export function calculateTCO(
  equipment: Equipment,
  fuelLogs: FuelLog[],
  maintenanceRecords: MaintenanceRecord[]
): {
  purchaseCost: number;
  fuelCost: number;
  maintenanceCost: number;
  totalCost: number;
  costPerHour: number;
} {
  const purchaseCost = equipment.purchasePrice;
  const fuelCost = fuelLogs.reduce((sum, log) => sum + log.totalCost, 0);
  const maintenanceCost = maintenanceRecords.reduce((sum, record) => sum + record.cost, 0);
  const totalCost = purchaseCost + fuelCost + maintenanceCost;
  const costPerHour = equipment.hoursUsed > 0 ? totalCost / equipment.hoursUsed : 0;

  return {
    purchaseCost,
    fuelCost,
    maintenanceCost,
    totalCost,
    costPerHour,
  };
}

/**
 * Schedule maintenance based on hours or calendar
 */
export function scheduleMainenance(
  equipment: Equipment,
  maintenanceInterval: number, // hours
  lastMaintenanceHours: number
): {
  hoursUntilMaintenance: number;
  dueDate: Date;
  isOverdue: boolean;
} {
  const hoursUntilMaintenance = maintenanceInterval - (equipment.hoursUsed - lastMaintenanceHours);
  const isOverdue = hoursUntilMaintenance < 0;

  // Estimate due date based on average daily usage (assume 8 hours/day)
  const daysUntilDue = Math.ceil(hoursUntilMaintenance / 8);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + daysUntilDue);

  return {
    hoursUntilMaintenance,
    dueDate,
    isOverdue,
  };
}

/**
 * Generate maintenance checklist
 */
export function generateMaintenanceChecklist(
  equipmentType: string,
  maintenanceType: 'routine' | 'seasonal' | 'annual'
): {
  category: string;
  items: Array<{ task: string; frequency: string }>;
}[] {
  const checklists: Record<string, any> = {
    tractor: {
      routine: [
        {
          category: 'Engine',
          items: [
            { task: 'Check engine oil level', frequency: 'Daily' },
            { task: 'Check coolant level', frequency: 'Daily' },
            { task: 'Inspect air filter', frequency: 'Weekly' },
            { task: 'Change engine oil', frequency: 'Every 100 hours' },
          ],
        },
        {
          category: 'Hydraulics',
          items: [
            { task: 'Check hydraulic fluid level', frequency: 'Weekly' },
            { task: 'Inspect hydraulic hoses', frequency: 'Weekly' },
            { task: 'Change hydraulic filter', frequency: 'Every 500 hours' },
          ],
        },
        {
          category: 'Tires & Wheels',
          items: [
            { task: 'Check tire pressure', frequency: 'Weekly' },
            { task: 'Inspect tire condition', frequency: 'Weekly' },
            { task: 'Check wheel nuts torque', frequency: 'Monthly' },
          ],
        },
      ],
      seasonal: [
        {
          category: 'Preparation',
          items: [
            { task: 'Full service and inspection', frequency: 'Start of season' },
            { task: 'Grease all fittings', frequency: 'Start of season' },
            { task: 'Test all lights and signals', frequency: 'Start of season' },
          ],
        },
      ],
    },
    harvester: {
      routine: [
        {
          category: 'Cutting System',
          items: [
            { task: 'Sharpen/replace blades', frequency: 'Daily during harvest' },
            { task: 'Check belt tension', frequency: 'Daily' },
            { task: 'Lubricate cutting bar', frequency: 'Daily' },
          ],
        },
        {
          category: 'Threshing & Cleaning',
          items: [
            { task: 'Check concave clearance', frequency: 'Weekly' },
            { task: 'Inspect sieves', frequency: 'Weekly' },
            { task: 'Clean grain tank', frequency: 'Daily' },
          ],
        },
      ],
    },
  };

  return checklists[equipmentType]?.[maintenanceType] || [];
}

/**
 * Analyze equipment utilization
 */
export function analyzeUtilization(
  equipment: Equipment,
  fuelLogs: FuelLog[],
  period: 'daily' | 'weekly' | 'monthly'
): EquipmentUtilization {
  const now = new Date();
  let periodStart = new Date();

  switch (period) {
    case 'daily':
      periodStart.setDate(now.getDate() - 1);
      break;
    case 'weekly':
      periodStart.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      periodStart.setMonth(now.getMonth() - 1);
      break;
  }

  const periodLogs = fuelLogs.filter(log => log.date >= periodStart);
  const hoursUsed = periodLogs.reduce((sum, log) => {
    const prevLog = fuelLogs[fuelLogs.indexOf(log) - 1];
    return sum + (prevLog ? log.odometerReading - prevLog.odometerReading : 0);
  }, 0);

  const fuelConsumed = periodLogs.reduce((sum, log) => sum + log.quantity, 0);

  // Calculate utilization rate (assuming 8 hours/day as 100% utilization)
  const maxHours = period === 'daily' ? 8 : period === 'weekly' ? 56 : 240;
  const utilizationRate = (hoursUsed / maxHours) * 100;

  const totalCost = periodLogs.reduce((sum, log) => sum + log.totalCost, 0);
  const costPerHour = hoursUsed > 0 ? totalCost / hoursUsed : 0;

  return {
    equipmentId: equipment.id,
    period,
    hoursUsed,
    fuelConsumed,
    utilizationRate,
    costPerHour,
  };
}

/**
 * Generate equipment performance report
 */
export function generatePerformanceReport(
  equipment: Equipment,
  fuelLogs: FuelLog[],
  maintenanceRecords: MaintenanceRecord[]
): {
  efficiency: {
    avgFuelConsumption: number;
    fuelCostPerHour: number;
  };
  reliability: {
    uptimePercentage: number;
    maintenanceFrequency: number;
    avgRepairCost: number;
  };
  economics: {
    totalCost: number;
    costPerHour: number;
    roi: number;
  };
  recommendations: string[];
} {
  const tco = calculateTCO(equipment, fuelLogs, maintenanceRecords);
  const avgFuelConsumption = fuelLogs.length > 0
    ? fuelLogs.reduce((sum, log) => sum + log.quantity, 0) / fuelLogs.length
    : 0;

  const repairs = maintenanceRecords.filter(r => r.type === 'repair');
  const avgRepairCost = repairs.length > 0
    ? repairs.reduce((sum, r) => sum + r.cost, 0) / repairs.length
    : 0;

  // Calculate uptime (assume 30 days downtime per year for maintenance)
  const uptimePercentage = ((365 - 30) / 365) * 100;

  const recommendations: string[] = [];

  if (avgFuelConsumption > 15) {
    recommendations.push('High fuel consumption detected. Consider engine tune-up or operator training.');
  }

  if (repairs.length > 5) {
    recommendations.push('Frequent repairs indicate potential reliability issues. Consider replacement.');
  }

  if (equipment.hoursUsed > 5000) {
    recommendations.push('High usage hours. Schedule comprehensive inspection.');
  }

  return {
    efficiency: {
      avgFuelConsumption,
      fuelCostPerHour: tco.costPerHour,
    },
    reliability: {
      uptimePercentage,
      maintenanceFrequency: maintenanceRecords.length,
      avgRepairCost,
    },
    economics: {
      totalCost: tco.totalCost,
      costPerHour: tco.costPerHour,
      roi: ((equipment.currentValue - tco.totalCost) / tco.totalCost) * 100,
    },
    recommendations,
  };
}

/**
 * Optimize equipment allocation across fields
 */
export function optimizeEquipmentAllocation(
  equipment: Equipment[],
  fields: Array<{ id: string; area: number; priority: number }>,
  taskDuration: number // hours per hectare
): Array<{
  equipmentId: string;
  fieldId: string;
  startTime: Date;
  endTime: Date;
  estimatedFuelCost: number;
}> {
  // Simple greedy algorithm - assign highest priority fields first
  const sortedFields = [...fields].sort((a, b) => b.priority - a.priority);
  const availableEquipment = equipment.filter(e => e.status === 'active');
  const schedule: any[] = [];

  let currentTime = new Date();

  for (const field of sortedFields) {
    if (availableEquipment.length === 0) break;

    const eq = availableEquipment[0];
    const duration = field.area * taskDuration;
    const endTime = new Date(currentTime.getTime() + duration * 60 * 60 * 1000);

    // Estimate fuel consumption (assume 10L/hour)
    const estimatedFuel = duration * 10;
    const estimatedFuelCost = estimatedFuel * 1.5; // $1.50 per liter

    schedule.push({
      equipmentId: eq.id,
      fieldId: field.id,
      startTime: new Date(currentTime),
      endTime,
      estimatedFuelCost,
    });

    currentTime = endTime;
  }

  return schedule;
}
