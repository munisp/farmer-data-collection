/**
 * Land Suitability Assessment Service
 * 
 * Helps farmers determine if their land is suitable for specific crops
 * by analyzing soil properties, climate conditions, and topography.
 * 
 * Features:
 * - Crop-soil matching for 25+ crops
 * - Suitability scoring (0-100)
 * - Climate compatibility analysis
 * - Soil amendment recommendations
 * - Investment ROI projections
 */

// ============================================================================
// CROP REQUIREMENTS DATABASE
// ============================================================================

export interface CropRequirements {
  name: string;
  scientificName: string;
  category: 'tree_crop' | 'cereal' | 'legume' | 'tuber' | 'vegetable' | 'fruit' | 'spice' | 'industrial';
  
  // Soil requirements
  soil: {
    phMin: number;
    phMax: number;
    phOptimal: number;
    textures: ('sandy' | 'loamy' | 'clay' | 'silty' | 'sandy_loam' | 'clay_loam')[];
    organicMatterMin: number; // percentage
    drainageRequirement: 'well_drained' | 'moderate' | 'poor' | 'waterlogged';
    depthMin: number; // cm - minimum soil depth
    salinityTolerance: 'low' | 'moderate' | 'high';
  };
  
  // Climate requirements
  climate: {
    tempMin: number; // °C
    tempMax: number;
    tempOptimal: number;
    rainfallMin: number; // mm/year
    rainfallMax: number;
    rainfallOptimal: number;
    humidityMin: number; // percentage
    humidityMax: number;
    frostTolerance: boolean;
    droughtTolerance: 'low' | 'moderate' | 'high';
  };
  
  // Topography
  topography: {
    slopeMax: number; // percentage
    altitudeMin: number; // meters
    altitudeMax: number;
    floodTolerance: boolean;
  };
  
  // Economic factors
  economics: {
    establishmentCostPerHa: number; // USD
    yearsToFirstHarvest: number;
    productiveLifeYears: number;
    averageYieldPerHa: number; // kg
    pricePerKg: number; // USD
  };
  
  // Additional notes
  notes: string[];
}

export const CROP_REQUIREMENTS: Record<string, CropRequirements> = {
  // TREE CROPS
  palm_oil: {
    name: "Oil Palm",
    scientificName: "Elaeis guineensis",
    category: "tree_crop",
    soil: {
      phMin: 4.0,
      phMax: 6.5,
      phOptimal: 5.5,
      textures: ["loamy", "clay_loam", "sandy_loam"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 100,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 22,
      tempMax: 33,
      tempOptimal: 27,
      rainfallMin: 1800,
      rainfallMax: 4000,
      rainfallOptimal: 2500,
      humidityMin: 75,
      humidityMax: 95,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 12,
      altitudeMin: 0,
      altitudeMax: 500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 3500,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 25,
      averageYieldPerHa: 20000,
      pricePerKg: 0.15,
    },
    notes: [
      "Requires consistent moisture throughout the year",
      "Sensitive to water stress during flowering",
      "Best planted in areas with no distinct dry season",
    ],
  },
  
  cocoa: {
    name: "Cocoa",
    scientificName: "Theobroma cacao",
    category: "tree_crop",
    soil: {
      phMin: 5.0,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "clay_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 150,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 18,
      tempMax: 32,
      tempOptimal: 25,
      rainfallMin: 1500,
      rainfallMax: 2500,
      rainfallOptimal: 2000,
      humidityMin: 70,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 800,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 2500,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 30,
      averageYieldPerHa: 800,
      pricePerKg: 2.50,
    },
    notes: [
      "Requires shade during establishment",
      "Sensitive to wind - needs windbreaks",
      "Benefits from intercropping with plantain/banana",
    ],
  },
  
  coffee_arabica: {
    name: "Coffee (Arabica)",
    scientificName: "Coffea arabica",
    category: "tree_crop",
    soil: {
      phMin: 5.0,
      phMax: 6.5,
      phOptimal: 6.0,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 120,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 15,
      tempMax: 24,
      tempOptimal: 20,
      rainfallMin: 1500,
      rainfallMax: 2500,
      rainfallOptimal: 1800,
      humidityMin: 60,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 30,
      altitudeMin: 1000,
      altitudeMax: 2000,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 3000,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 25,
      averageYieldPerHa: 1500,
      pricePerKg: 3.00,
    },
    notes: [
      "Requires distinct dry season for flowering",
      "Altitude is critical for quality",
      "Shade-grown coffee often commands premium prices",
    ],
  },
  
  coffee_robusta: {
    name: "Coffee (Robusta)",
    scientificName: "Coffea canephora",
    category: "tree_crop",
    soil: {
      phMin: 4.5,
      phMax: 6.5,
      phOptimal: 5.5,
      textures: ["loamy", "clay_loam", "sandy_loam"],
      organicMatterMin: 2.5,
      drainageRequirement: "well_drained",
      depthMin: 100,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 20,
      tempMax: 30,
      tempOptimal: 26,
      rainfallMin: 1500,
      rainfallMax: 3000,
      rainfallOptimal: 2000,
      humidityMin: 70,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 25,
      altitudeMin: 0,
      altitudeMax: 800,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 2500,
      yearsToFirstHarvest: 2,
      productiveLifeYears: 20,
      averageYieldPerHa: 2000,
      pricePerKg: 1.80,
    },
    notes: [
      "More disease resistant than Arabica",
      "Higher caffeine content",
      "Tolerates lower altitudes and higher temperatures",
    ],
  },
  
  rubber: {
    name: "Rubber",
    scientificName: "Hevea brasiliensis",
    category: "tree_crop",
    soil: {
      phMin: 4.5,
      phMax: 6.0,
      phOptimal: 5.0,
      textures: ["loamy", "sandy_loam", "clay_loam"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 150,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 20,
      tempMax: 34,
      tempOptimal: 28,
      rainfallMin: 1800,
      rainfallMax: 3000,
      rainfallOptimal: 2500,
      humidityMin: 75,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 20,
      altitudeMin: 0,
      altitudeMax: 600,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 2000,
      yearsToFirstHarvest: 7,
      productiveLifeYears: 30,
      averageYieldPerHa: 1500,
      pricePerKg: 1.50,
    },
    notes: [
      "Long gestation period before first harvest",
      "Requires skilled labor for tapping",
      "Can be intercropped during early years",
    ],
  },
  
  cashew: {
    name: "Cashew",
    scientificName: "Anacardium occidentale",
    category: "tree_crop",
    soil: {
      phMin: 5.0,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["sandy", "sandy_loam", "loamy"],
      organicMatterMin: 1.5,
      drainageRequirement: "well_drained",
      depthMin: 100,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 20,
      tempMax: 38,
      tempOptimal: 27,
      rainfallMin: 600,
      rainfallMax: 2000,
      rainfallOptimal: 1200,
      humidityMin: 40,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "high",
    },
    topography: {
      slopeMax: 25,
      altitudeMin: 0,
      altitudeMax: 700,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 1500,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 40,
      averageYieldPerHa: 1000,
      pricePerKg: 2.00,
    },
    notes: [
      "Highly drought tolerant once established",
      "Good for marginal lands",
      "Both nut and apple have commercial value",
    ],
  },
  
  mango: {
    name: "Mango",
    scientificName: "Mangifera indica",
    category: "fruit",
    soil: {
      phMin: 5.5,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam", "clay_loam"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 150,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 15,
      tempMax: 40,
      tempOptimal: 27,
      rainfallMin: 500,
      rainfallMax: 2500,
      rainfallOptimal: 1200,
      humidityMin: 40,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "high",
    },
    topography: {
      slopeMax: 20,
      altitudeMin: 0,
      altitudeMax: 1200,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 2000,
      yearsToFirstHarvest: 4,
      productiveLifeYears: 40,
      averageYieldPerHa: 10000,
      pricePerKg: 0.50,
    },
    notes: [
      "Requires dry period for flowering",
      "Alternate bearing tendency",
      "Many improved varieties available",
    ],
  },
  
  avocado: {
    name: "Avocado",
    scientificName: "Persea americana",
    category: "fruit",
    soil: {
      phMin: 5.0,
      phMax: 7.0,
      phOptimal: 6.0,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 100,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 10,
      tempMax: 33,
      tempOptimal: 25,
      rainfallMin: 1000,
      rainfallMax: 2000,
      rainfallOptimal: 1500,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 25,
      altitudeMin: 0,
      altitudeMax: 2500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 4000,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 30,
      averageYieldPerHa: 12000,
      pricePerKg: 1.50,
    },
    notes: [
      "Very sensitive to waterlogging",
      "Root rot (Phytophthora) is major concern",
      "High export demand",
    ],
  },
  
  citrus: {
    name: "Citrus (Orange/Lemon)",
    scientificName: "Citrus spp.",
    category: "fruit",
    soil: {
      phMin: 5.5,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 100,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 10,
      tempMax: 35,
      tempOptimal: 25,
      rainfallMin: 900,
      rainfallMax: 2000,
      rainfallOptimal: 1200,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 20,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 3000,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 25,
      averageYieldPerHa: 25000,
      pricePerKg: 0.40,
    },
    notes: [
      "Requires good drainage",
      "Sensitive to citrus greening disease",
      "Multiple harvests per year possible",
    ],
  },
  
  banana: {
    name: "Banana/Plantain",
    scientificName: "Musa spp.",
    category: "fruit",
    soil: {
      phMin: 5.5,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "clay_loam", "sandy_loam"],
      organicMatterMin: 2.5,
      drainageRequirement: "well_drained",
      depthMin: 60,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 15,
      tempMax: 35,
      tempOptimal: 27,
      rainfallMin: 1200,
      rainfallMax: 3000,
      rainfallOptimal: 2000,
      humidityMin: 60,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 1500,
      yearsToFirstHarvest: 1,
      productiveLifeYears: 10,
      averageYieldPerHa: 30000,
      pricePerKg: 0.30,
    },
    notes: [
      "Fast growing - harvest within 12-18 months",
      "Good for intercropping",
      "Requires wind protection",
    ],
  },
  
  // SPICES
  ginger: {
    name: "Ginger",
    scientificName: "Zingiber officinale",
    category: "spice",
    soil: {
      phMin: 5.5,
      phMax: 6.5,
      phOptimal: 6.0,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 40,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 19,
      tempMax: 30,
      tempOptimal: 25,
      rainfallMin: 1500,
      rainfallMax: 3000,
      rainfallOptimal: 2000,
      humidityMin: 70,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 20,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 2000,
      yearsToFirstHarvest: 0.75,
      productiveLifeYears: 1,
      averageYieldPerHa: 15000,
      pricePerKg: 1.00,
    },
    notes: [
      "Annual crop - 8-10 months to harvest",
      "Requires partial shade",
      "Good for intercropping under tree crops",
    ],
  },
  
  turmeric: {
    name: "Turmeric",
    scientificName: "Curcuma longa",
    category: "spice",
    soil: {
      phMin: 5.0,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam", "clay_loam"],
      organicMatterMin: 2.5,
      drainageRequirement: "well_drained",
      depthMin: 45,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 20,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 1500,
      rainfallMax: 2500,
      rainfallOptimal: 2000,
      humidityMin: 70,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 1200,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 1800,
      yearsToFirstHarvest: 0.75,
      productiveLifeYears: 1,
      averageYieldPerHa: 20000,
      pricePerKg: 0.80,
    },
    notes: [
      "Similar requirements to ginger",
      "Can be grown as intercrop",
      "High demand for organic turmeric",
    ],
  },
  
  pepper_black: {
    name: "Black Pepper",
    scientificName: "Piper nigrum",
    category: "spice",
    soil: {
      phMin: 5.5,
      phMax: 6.5,
      phOptimal: 6.0,
      textures: ["loamy", "clay_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 100,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 20,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 1500,
      rainfallMax: 3000,
      rainfallOptimal: 2500,
      humidityMin: 70,
      humidityMax: 95,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 25,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 4000,
      yearsToFirstHarvest: 3,
      productiveLifeYears: 20,
      averageYieldPerHa: 2500,
      pricePerKg: 4.00,
    },
    notes: [
      "Climbing vine - needs support",
      "Often grown on living standards",
      "High value crop",
    ],
  },
  
  // CEREALS
  maize: {
    name: "Maize (Corn)",
    scientificName: "Zea mays",
    category: "cereal",
    soil: {
      phMin: 5.5,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam", "clay_loam"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 50,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 15,
      tempMax: 35,
      tempOptimal: 25,
      rainfallMin: 500,
      rainfallMax: 1500,
      rainfallOptimal: 800,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 3000,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 500,
      yearsToFirstHarvest: 0.33,
      productiveLifeYears: 0.33,
      averageYieldPerHa: 5000,
      pricePerKg: 0.25,
    },
    notes: [
      "Short growing season (90-120 days)",
      "Responds well to fertilizer",
      "Many improved varieties available",
    ],
  },
  
  rice: {
    name: "Rice",
    scientificName: "Oryza sativa",
    category: "cereal",
    soil: {
      phMin: 5.0,
      phMax: 7.0,
      phOptimal: 6.0,
      textures: ["clay", "clay_loam", "silty"],
      organicMatterMin: 2.0,
      drainageRequirement: "poor",
      depthMin: 30,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 20,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 1000,
      rainfallMax: 2500,
      rainfallOptimal: 1500,
      humidityMin: 60,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 5,
      altitudeMin: 0,
      altitudeMax: 2000,
      floodTolerance: true,
    },
    economics: {
      establishmentCostPerHa: 600,
      yearsToFirstHarvest: 0.33,
      productiveLifeYears: 0.33,
      averageYieldPerHa: 4000,
      pricePerKg: 0.40,
    },
    notes: [
      "Requires standing water for paddy rice",
      "Upland rice varieties available for rainfed areas",
      "Labor intensive",
    ],
  },
  
  sorghum: {
    name: "Sorghum",
    scientificName: "Sorghum bicolor",
    category: "cereal",
    soil: {
      phMin: 5.5,
      phMax: 8.5,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam", "clay_loam", "clay"],
      organicMatterMin: 1.5,
      drainageRequirement: "moderate",
      depthMin: 40,
      salinityTolerance: "high",
    },
    climate: {
      tempMin: 15,
      tempMax: 40,
      tempOptimal: 28,
      rainfallMin: 400,
      rainfallMax: 1000,
      rainfallOptimal: 600,
      humidityMin: 30,
      humidityMax: 70,
      frostTolerance: false,
      droughtTolerance: "high",
    },
    topography: {
      slopeMax: 20,
      altitudeMin: 0,
      altitudeMax: 2500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 400,
      yearsToFirstHarvest: 0.33,
      productiveLifeYears: 0.33,
      averageYieldPerHa: 2500,
      pricePerKg: 0.20,
    },
    notes: [
      "Excellent drought tolerance",
      "Good for semi-arid regions",
      "Can be ratooned for second harvest",
    ],
  },
  
  millet: {
    name: "Pearl Millet",
    scientificName: "Pennisetum glaucum",
    category: "cereal",
    soil: {
      phMin: 5.0,
      phMax: 8.0,
      phOptimal: 6.5,
      textures: ["sandy", "sandy_loam", "loamy"],
      organicMatterMin: 1.0,
      drainageRequirement: "well_drained",
      depthMin: 30,
      salinityTolerance: "high",
    },
    climate: {
      tempMin: 20,
      tempMax: 40,
      tempOptimal: 30,
      rainfallMin: 250,
      rainfallMax: 800,
      rainfallOptimal: 500,
      humidityMin: 20,
      humidityMax: 60,
      frostTolerance: false,
      droughtTolerance: "high",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 1800,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 300,
      yearsToFirstHarvest: 0.25,
      productiveLifeYears: 0.25,
      averageYieldPerHa: 1500,
      pricePerKg: 0.25,
    },
    notes: [
      "Most drought tolerant cereal",
      "Grows on poor sandy soils",
      "Short growing season (60-90 days)",
    ],
  },
  
  // LEGUMES
  cowpea: {
    name: "Cowpea",
    scientificName: "Vigna unguiculata",
    category: "legume",
    soil: {
      phMin: 5.5,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["sandy", "sandy_loam", "loamy"],
      organicMatterMin: 1.5,
      drainageRequirement: "well_drained",
      depthMin: 30,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 20,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 400,
      rainfallMax: 1000,
      rainfallOptimal: 700,
      humidityMin: 40,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "high",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 350,
      yearsToFirstHarvest: 0.25,
      productiveLifeYears: 0.25,
      averageYieldPerHa: 1200,
      pricePerKg: 0.80,
    },
    notes: [
      "Fixes nitrogen in soil",
      "Good for crop rotation",
      "Both grain and leaves edible",
    ],
  },
  
  groundnut: {
    name: "Groundnut (Peanut)",
    scientificName: "Arachis hypogaea",
    category: "legume",
    soil: {
      phMin: 5.5,
      phMax: 7.0,
      phOptimal: 6.5,
      textures: ["sandy", "sandy_loam"],
      organicMatterMin: 1.5,
      drainageRequirement: "well_drained",
      depthMin: 40,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 20,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 500,
      rainfallMax: 1200,
      rainfallOptimal: 800,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 10,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 500,
      yearsToFirstHarvest: 0.33,
      productiveLifeYears: 0.33,
      averageYieldPerHa: 2000,
      pricePerKg: 0.70,
    },
    notes: [
      "Requires loose sandy soil for pod development",
      "Calcium important for pod filling",
      "Good rotation crop",
    ],
  },
  
  soybean: {
    name: "Soybean",
    scientificName: "Glycine max",
    category: "legume",
    soil: {
      phMin: 6.0,
      phMax: 7.0,
      phOptimal: 6.5,
      textures: ["loamy", "clay_loam", "sandy_loam"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 50,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 15,
      tempMax: 30,
      tempOptimal: 25,
      rainfallMin: 500,
      rainfallMax: 1500,
      rainfallOptimal: 900,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 2000,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 450,
      yearsToFirstHarvest: 0.33,
      productiveLifeYears: 0.33,
      averageYieldPerHa: 2500,
      pricePerKg: 0.45,
    },
    notes: [
      "Requires inoculation with Rhizobium",
      "Day-length sensitive",
      "High protein content",
    ],
  },
  
  // TUBERS
  cassava: {
    name: "Cassava",
    scientificName: "Manihot esculenta",
    category: "tuber",
    soil: {
      phMin: 4.5,
      phMax: 8.0,
      phOptimal: 6.0,
      textures: ["sandy", "sandy_loam", "loamy"],
      organicMatterMin: 1.0,
      drainageRequirement: "well_drained",
      depthMin: 40,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 18,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 500,
      rainfallMax: 2000,
      rainfallOptimal: 1200,
      humidityMin: 50,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "high",
    },
    topography: {
      slopeMax: 20,
      altitudeMin: 0,
      altitudeMax: 2000,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 400,
      yearsToFirstHarvest: 1,
      productiveLifeYears: 1,
      averageYieldPerHa: 15000,
      pricePerKg: 0.10,
    },
    notes: [
      "Very tolerant of poor soils",
      "Can be left in ground as food reserve",
      "Processing required for some varieties",
    ],
  },
  
  yam: {
    name: "Yam",
    scientificName: "Dioscorea spp.",
    category: "tuber",
    soil: {
      phMin: 5.5,
      phMax: 7.0,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 60,
      salinityTolerance: "low",
    },
    climate: {
      tempMin: 20,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 1000,
      rainfallMax: 2000,
      rainfallOptimal: 1500,
      humidityMin: 60,
      humidityMax: 90,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 1500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 1500,
      yearsToFirstHarvest: 0.75,
      productiveLifeYears: 0.75,
      averageYieldPerHa: 12000,
      pricePerKg: 0.40,
    },
    notes: [
      "Requires fertile soil",
      "Labor intensive (staking required)",
      "High cultural importance in West Africa",
    ],
  },
  
  sweet_potato: {
    name: "Sweet Potato",
    scientificName: "Ipomoea batatas",
    category: "tuber",
    soil: {
      phMin: 5.5,
      phMax: 6.5,
      phOptimal: 6.0,
      textures: ["sandy", "sandy_loam", "loamy"],
      organicMatterMin: 2.0,
      drainageRequirement: "well_drained",
      depthMin: 30,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 15,
      tempMax: 35,
      tempOptimal: 25,
      rainfallMin: 750,
      rainfallMax: 1500,
      rainfallOptimal: 1000,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 2500,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 500,
      yearsToFirstHarvest: 0.33,
      productiveLifeYears: 0.33,
      averageYieldPerHa: 15000,
      pricePerKg: 0.20,
    },
    notes: [
      "Fast growing (3-5 months)",
      "Orange-fleshed varieties high in Vitamin A",
      "Vines can be used as animal feed",
    ],
  },
  
  // VEGETABLES
  tomato: {
    name: "Tomato",
    scientificName: "Solanum lycopersicum",
    category: "vegetable",
    soil: {
      phMin: 5.5,
      phMax: 7.5,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 3.0,
      drainageRequirement: "well_drained",
      depthMin: 40,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 15,
      tempMax: 30,
      tempOptimal: 25,
      rainfallMin: 400,
      rainfallMax: 1200,
      rainfallOptimal: 800,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "low",
    },
    topography: {
      slopeMax: 10,
      altitudeMin: 0,
      altitudeMax: 2000,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 3000,
      yearsToFirstHarvest: 0.25,
      productiveLifeYears: 0.5,
      averageYieldPerHa: 40000,
      pricePerKg: 0.50,
    },
    notes: [
      "High value crop",
      "Requires staking and pruning",
      "Disease management critical",
    ],
  },
  
  pepper_chili: {
    name: "Chili Pepper",
    scientificName: "Capsicum spp.",
    category: "vegetable",
    soil: {
      phMin: 5.5,
      phMax: 7.0,
      phOptimal: 6.5,
      textures: ["loamy", "sandy_loam"],
      organicMatterMin: 2.5,
      drainageRequirement: "well_drained",
      depthMin: 40,
      salinityTolerance: "moderate",
    },
    climate: {
      tempMin: 18,
      tempMax: 35,
      tempOptimal: 28,
      rainfallMin: 600,
      rainfallMax: 1500,
      rainfallOptimal: 1000,
      humidityMin: 50,
      humidityMax: 80,
      frostTolerance: false,
      droughtTolerance: "moderate",
    },
    topography: {
      slopeMax: 15,
      altitudeMin: 0,
      altitudeMax: 2000,
      floodTolerance: false,
    },
    economics: {
      establishmentCostPerHa: 2500,
      yearsToFirstHarvest: 0.25,
      productiveLifeYears: 1,
      averageYieldPerHa: 15000,
      pricePerKg: 1.00,
    },
    notes: [
      "Multiple harvests possible",
      "Can be dried for longer storage",
      "High export potential",
    ],
  },
};

// ============================================================================
// SUITABILITY ASSESSMENT
// ============================================================================

export interface SoilData {
  ph: number;
  texture: string;
  organicMatter: number; // percentage
  drainage: 'well_drained' | 'moderate' | 'poor' | 'waterlogged';
  depth: number; // cm
  salinity: 'low' | 'moderate' | 'high';
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
}

export interface ClimateData {
  avgTemperature: number;
  minTemperature: number;
  maxTemperature: number;
  annualRainfall: number;
  avgHumidity: number;
  hasFrost: boolean;
  drySeasonMonths: number;
}

export interface TopographyData {
  slope: number; // percentage
  altitude: number; // meters
  floodRisk: boolean;
}

export interface SuitabilityScore {
  overall: number; // 0-100
  soil: number;
  climate: number;
  topography: number;
  category: 'highly_suitable' | 'suitable' | 'moderately_suitable' | 'marginally_suitable' | 'not_suitable';
}

export interface SoilAmendment {
  parameter: string;
  currentValue: number | string;
  requiredValue: number | string;
  recommendation: string;
  estimatedCost: number; // USD per hectare
  priority: 'high' | 'medium' | 'low';
}

export interface LandSuitabilityResult {
  cropName: string;
  cropId: string;
  score: SuitabilityScore;
  amendments: SoilAmendment[];
  limitations: string[];
  advantages: string[];
  economics: {
    establishmentCost: number;
    yearsToFirstHarvest: number;
    expectedYield: number;
    expectedRevenue: number;
    roi5Year: number;
  };
  recommendations: string[];
}

/**
 * Calculate soil suitability score for a crop
 */
function calculateSoilScore(soil: SoilData, requirements: CropRequirements['soil']): { score: number; amendments: SoilAmendment[]; limitations: string[] } {
  let score = 100;
  const amendments: SoilAmendment[] = [];
  const limitations: string[] = [];
  
  // pH assessment
  if (soil.ph < requirements.phMin) {
    const deficit = requirements.phMin - soil.ph;
    score -= deficit * 15;
    amendments.push({
      parameter: 'pH (too acidic)',
      currentValue: soil.ph,
      requiredValue: requirements.phOptimal,
      recommendation: `Apply agricultural lime at ${Math.round(deficit * 2000)} kg/ha to raise pH`,
      estimatedCost: deficit * 100,
      priority: deficit > 1 ? 'high' : 'medium',
    });
    limitations.push(`Soil pH (${soil.ph}) is below optimal range`);
  } else if (soil.ph > requirements.phMax) {
    const excess = soil.ph - requirements.phMax;
    score -= excess * 15;
    amendments.push({
      parameter: 'pH (too alkaline)',
      currentValue: soil.ph,
      requiredValue: requirements.phOptimal,
      recommendation: `Apply sulfur or acidifying fertilizers to lower pH`,
      estimatedCost: excess * 150,
      priority: excess > 1 ? 'high' : 'medium',
    });
    limitations.push(`Soil pH (${soil.ph}) is above optimal range`);
  }
  
  // Texture assessment
  const normalizedTexture = soil.texture.toLowerCase().replace(' ', '_') as any;
  if (!requirements.textures.includes(normalizedTexture)) {
    score -= 20;
    limitations.push(`Soil texture (${soil.texture}) is not ideal for this crop`);
    amendments.push({
      parameter: 'Soil texture',
      currentValue: soil.texture,
      requiredValue: requirements.textures.join(' or '),
      recommendation: 'Consider adding organic matter to improve soil structure',
      estimatedCost: 200,
      priority: 'medium',
    });
  }
  
  // Organic matter assessment
  if (soil.organicMatter < requirements.organicMatterMin) {
    const deficit = requirements.organicMatterMin - soil.organicMatter;
    score -= deficit * 10;
    amendments.push({
      parameter: 'Organic matter',
      currentValue: `${soil.organicMatter}%`,
      requiredValue: `${requirements.organicMatterMin}%`,
      recommendation: `Apply compost or manure at ${Math.round(deficit * 5)} tons/ha`,
      estimatedCost: deficit * 100,
      priority: deficit > 1 ? 'high' : 'medium',
    });
    limitations.push(`Organic matter (${soil.organicMatter}%) is below recommended level`);
  }
  
  // Drainage assessment
  if (soil.drainage !== requirements.drainageRequirement) {
    if (requirements.drainageRequirement === 'well_drained' && (soil.drainage === 'poor' || soil.drainage === 'waterlogged')) {
      score -= 25;
      amendments.push({
        parameter: 'Drainage',
        currentValue: soil.drainage,
        requiredValue: requirements.drainageRequirement,
        recommendation: 'Install drainage system or create raised beds',
        estimatedCost: 500,
        priority: 'high',
      });
      limitations.push('Poor drainage may cause root rot');
    } else if (requirements.drainageRequirement === 'poor' && soil.drainage === 'well_drained') {
      score -= 15;
      limitations.push('Soil drains too quickly for this crop');
    }
  }
  
  // Soil depth assessment
  if (soil.depth < requirements.depthMin) {
    const deficit = requirements.depthMin - soil.depth;
    score -= (deficit / requirements.depthMin) * 30;
    limitations.push(`Soil depth (${soil.depth}cm) is insufficient - crop needs ${requirements.depthMin}cm`);
  }
  
  return { score: Math.max(0, score), amendments, limitations };
}

/**
 * Calculate climate suitability score for a crop
 */
function calculateClimateScore(climate: ClimateData, requirements: CropRequirements['climate']): { score: number; limitations: string[] } {
  let score = 100;
  const limitations: string[] = [];
  
  // Temperature assessment
  if (climate.avgTemperature < requirements.tempMin) {
    score -= (requirements.tempMin - climate.avgTemperature) * 5;
    limitations.push(`Average temperature (${climate.avgTemperature}°C) is too low`);
  } else if (climate.avgTemperature > requirements.tempMax) {
    score -= (climate.avgTemperature - requirements.tempMax) * 5;
    limitations.push(`Average temperature (${climate.avgTemperature}°C) is too high`);
  }
  
  // Rainfall assessment
  if (climate.annualRainfall < requirements.rainfallMin) {
    const deficit = ((requirements.rainfallMin - climate.annualRainfall) / requirements.rainfallMin) * 100;
    score -= deficit * 0.4;
    limitations.push(`Annual rainfall (${climate.annualRainfall}mm) is below minimum requirement`);
    if (requirements.droughtTolerance === 'low') {
      score -= 10;
      limitations.push('This crop has low drought tolerance - irrigation will be essential');
    }
  } else if (climate.annualRainfall > requirements.rainfallMax) {
    const excess = ((climate.annualRainfall - requirements.rainfallMax) / requirements.rainfallMax) * 100;
    score -= excess * 0.3;
    limitations.push(`Annual rainfall (${climate.annualRainfall}mm) exceeds maximum - may cause disease issues`);
  }
  
  // Humidity assessment
  if (climate.avgHumidity < requirements.humidityMin) {
    score -= (requirements.humidityMin - climate.avgHumidity) * 0.5;
    limitations.push(`Humidity (${climate.avgHumidity}%) is below optimal range`);
  } else if (climate.avgHumidity > requirements.humidityMax) {
    score -= (climate.avgHumidity - requirements.humidityMax) * 0.3;
    limitations.push(`High humidity (${climate.avgHumidity}%) may increase disease pressure`);
  }
  
  // Frost assessment
  if (climate.hasFrost && !requirements.frostTolerance) {
    score -= 30;
    limitations.push('Frost risk - this crop is not frost tolerant');
  }
  
  return { score: Math.max(0, score), limitations };
}

/**
 * Calculate topography suitability score for a crop
 */
function calculateTopographyScore(topography: TopographyData, requirements: CropRequirements['topography']): { score: number; limitations: string[] } {
  let score = 100;
  const limitations: string[] = [];
  
  // Slope assessment
  if (topography.slope > requirements.slopeMax) {
    const excess = topography.slope - requirements.slopeMax;
    score -= excess * 3;
    limitations.push(`Slope (${topography.slope}%) exceeds maximum - erosion risk`);
  }
  
  // Altitude assessment
  if (topography.altitude < requirements.altitudeMin) {
    score -= 20;
    limitations.push(`Altitude (${topography.altitude}m) is below minimum requirement`);
  } else if (topography.altitude > requirements.altitudeMax) {
    score -= 20;
    limitations.push(`Altitude (${topography.altitude}m) exceeds maximum for this crop`);
  }
  
  // Flood risk assessment
  if (topography.floodRisk && !requirements.floodTolerance) {
    score -= 25;
    limitations.push('Flood risk - this crop does not tolerate waterlogging');
  }
  
  return { score: Math.max(0, score), limitations };
}

/**
 * Get suitability category based on score
 */
function getSuitabilityCategory(score: number): SuitabilityScore['category'] {
  if (score >= 80) return 'highly_suitable';
  if (score >= 65) return 'suitable';
  if (score >= 50) return 'moderately_suitable';
  if (score >= 35) return 'marginally_suitable';
  return 'not_suitable';
}

/**
 * Assess land suitability for a specific crop
 */
export function assessLandSuitability(
  cropId: string,
  soil: SoilData,
  climate: ClimateData,
  topography: TopographyData,
  fieldAreaHa: number = 1
): LandSuitabilityResult | null {
  const crop = CROP_REQUIREMENTS[cropId];
  if (!crop) {
    return null;
  }
  
  // Calculate component scores
  const soilResult = calculateSoilScore(soil, crop.soil);
  const climateResult = calculateClimateScore(climate, crop.climate);
  const topographyResult = calculateTopographyScore(topography, crop.topography);
  
  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    soilResult.score * 0.40 +
    climateResult.score * 0.40 +
    topographyResult.score * 0.20
  );
  
  // Combine limitations
  const allLimitations = [
    ...soilResult.limitations,
    ...climateResult.limitations,
    ...topographyResult.limitations,
  ];
  
  // Identify advantages
  const advantages: string[] = [];
  if (soilResult.score >= 80) advantages.push('Excellent soil conditions');
  if (climateResult.score >= 80) advantages.push('Ideal climate for this crop');
  if (topographyResult.score >= 80) advantages.push('Suitable terrain');
  if (soil.organicMatter >= crop.soil.organicMatterMin * 1.5) advantages.push('High organic matter content');
  if (climate.annualRainfall >= crop.climate.rainfallOptimal * 0.9 && 
      climate.annualRainfall <= crop.climate.rainfallOptimal * 1.1) {
    advantages.push('Optimal rainfall conditions');
  }
  
  // Calculate economics
  const yieldFactor = overallScore / 100;
  const expectedYield = Math.round(crop.economics.averageYieldPerHa * yieldFactor * fieldAreaHa);
  const expectedRevenue = expectedYield * crop.economics.pricePerKg;
  const totalEstablishmentCost = crop.economics.establishmentCostPerHa * fieldAreaHa +
    soilResult.amendments.reduce((sum, a) => sum + a.estimatedCost * fieldAreaHa, 0);
  
  // Calculate 5-year ROI
  const annualRevenue = expectedRevenue;
  const annualCosts = totalEstablishmentCost * 0.15; // Maintenance costs
  const yearsProducing = Math.max(0, 5 - crop.economics.yearsToFirstHarvest);
  const totalRevenue5Year = annualRevenue * yearsProducing;
  const totalCosts5Year = totalEstablishmentCost + (annualCosts * 5);
  const roi5Year = ((totalRevenue5Year - totalCosts5Year) / totalCosts5Year) * 100;
  
  // Generate recommendations
  const recommendations: string[] = [];
  if (overallScore >= 65) {
    recommendations.push(`${crop.name} is a good choice for this land`);
  } else if (overallScore >= 50) {
    recommendations.push(`${crop.name} can be grown with some management adjustments`);
  } else {
    recommendations.push(`Consider alternative crops better suited to your conditions`);
  }
  
  if (soilResult.amendments.length > 0) {
    recommendations.push('Address soil amendments before planting');
  }
  
  crop.notes.forEach(note => recommendations.push(note));
  
  return {
    cropName: crop.name,
    cropId,
    score: {
      overall: overallScore,
      soil: Math.round(soilResult.score),
      climate: Math.round(climateResult.score),
      topography: Math.round(topographyResult.score),
      category: getSuitabilityCategory(overallScore),
    },
    amendments: soilResult.amendments,
    limitations: allLimitations,
    advantages,
    economics: {
      establishmentCost: Math.round(totalEstablishmentCost),
      yearsToFirstHarvest: crop.economics.yearsToFirstHarvest,
      expectedYield: expectedYield,
      expectedRevenue: Math.round(expectedRevenue),
      roi5Year: Math.round(roi5Year),
    },
    recommendations,
  };
}

/**
 * Get all suitable crops for given land conditions
 */
export function findSuitableCrops(
  soil: SoilData,
  climate: ClimateData,
  topography: TopographyData,
  fieldAreaHa: number = 1,
  minScore: number = 50
): LandSuitabilityResult[] {
  const results: LandSuitabilityResult[] = [];
  
  for (const cropId of Object.keys(CROP_REQUIREMENTS)) {
    const result = assessLandSuitability(cropId, soil, climate, topography, fieldAreaHa);
    if (result && result.score.overall >= minScore) {
      results.push(result);
    }
  }
  
  // Sort by overall score (descending)
  results.sort((a, b) => b.score.overall - a.score.overall);
  
  return results;
}

/**
 * Get crop categories
 */
export function getCropCategories(): { category: string; crops: { id: string; name: string }[] }[] {
  const categories: Record<string, { id: string; name: string }[]> = {};
  
  for (const [id, crop] of Object.entries(CROP_REQUIREMENTS)) {
    if (!categories[crop.category]) {
      categories[crop.category] = [];
    }
    categories[crop.category].push({ id, name: crop.name });
  }
  
  return Object.entries(categories).map(([category, crops]) => ({
    category: category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    crops,
  }));
}

/**
 * Get crop details
 */
export function getCropDetails(cropId: string): CropRequirements | null {
  return CROP_REQUIREMENTS[cropId] || null;
}

/**
 * Get all available crops
 */
export function getAllCrops(): { id: string; name: string; category: string }[] {
  return Object.entries(CROP_REQUIREMENTS).map(([id, crop]) => ({
    id,
    name: crop.name,
    category: crop.category,
  }));
}
