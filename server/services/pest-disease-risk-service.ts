/**
 * Pest and Disease Risk Assessment Service
 * 
 * Calculates risk scores for common Nigerian agricultural pests and diseases
 * based on weather conditions (temperature, humidity, rainfall, wind).
 */

// Common pests and diseases in Nigerian agriculture
export const PEST_DISEASE_DATABASE = {
  fall_armyworm: {
    name: 'Fall Armyworm',
    type: 'pest' as const,
    affectedCrops: ['maize', 'sorghum', 'rice'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 30,
      humidityMin: 60,
      humidityMax: 90,
      rainfallMin: 50, // mm/week
      rainfallMax: 150,
    },
    symptoms: [
      'Holes in leaves',
      'Frass (insect droppings) on leaves',
      'Damaged growing points',
      'Larvae visible in whorl',
    ],
    controlMeasures: [
      'Scout fields regularly (2-3 times per week)',
      'Apply neem-based biopesticides early morning',
      'Use pheromone traps for monitoring',
      'Apply chemical insecticides if infestation > 20%',
      'Practice crop rotation',
    ],
  },
  late_blight: {
    name: 'Late Blight',
    type: 'disease' as const,
    affectedCrops: ['tomato', 'potato'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 15,
      tempMax: 25,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'Dark brown lesions on leaves',
      'White mold on leaf undersides',
      'Brown spots on fruits',
      'Rapid plant wilting',
    ],
    controlMeasures: [
      'Apply copper-based fungicides preventively',
      'Improve air circulation (proper spacing)',
      'Remove infected plants immediately',
      'Avoid overhead irrigation',
      'Use resistant varieties',
    ],
  },
  stem_borer: {
    name: 'Stem Borer',
    type: 'pest' as const,
    affectedCrops: ['maize', 'sorghum', 'rice'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 32,
      humidityMin: 50,
      humidityMax: 80,
      rainfallMin: 30,
      rainfallMax: 120,
    },
    symptoms: [
      'Dead heart in young plants',
      'Holes in stems',
      'Broken stems',
      'Frass at stem entry points',
    ],
    controlMeasures: [
      'Plant early to avoid peak borer season',
      'Use resistant varieties',
      'Apply granular insecticides in whorl',
      'Practice field sanitation',
      'Use push-pull technology (intercropping)',
    ],
  },
  cassava_mosaic: {
    name: 'Cassava Mosaic Disease',
    type: 'disease' as const,
    affectedCrops: ['cassava'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 25,
      tempMax: 35,
      humidityMin: 40,
      humidityMax: 70,
      rainfallMin: 20,
      rainfallMax: 100,
    },
    symptoms: [
      'Yellow and green mosaic pattern on leaves',
      'Leaf distortion and curling',
      'Stunted plant growth',
      'Reduced tuber yield',
    ],
    controlMeasures: [
      'Use disease-free planting material',
      'Plant resistant varieties',
      'Control whitefly vectors',
      'Remove infected plants',
      'Maintain field hygiene',
    ],
  },
  bacterial_wilt: {
    name: 'Bacterial Wilt',
    type: 'disease' as const,
    affectedCrops: ['tomato', 'potato', 'groundnut'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 25,
      tempMax: 35,
      humidityMin: 70,
      humidityMax: 100,
      rainfallMin: 80,
      rainfallMax: 250,
    },
    symptoms: [
      'Sudden wilting of plants',
      'No leaf yellowing initially',
      'Milky bacterial ooze from cut stems',
      'Brown discoloration of vascular tissue',
    ],
    controlMeasures: [
      'Use resistant varieties',
      'Practice crop rotation (3-4 years)',
      'Improve soil drainage',
      'Remove infected plants immediately',
      'Disinfect tools between plants',
    ],
  },
  aphids: {
    name: 'Aphids',
    type: 'pest' as const,
    affectedCrops: ['cowpea', 'soybean', 'groundnut', 'tomato'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 18,
      tempMax: 28,
      humidityMin: 50,
      humidityMax: 80,
      rainfallMin: 20,
      rainfallMax: 80,
    },
    symptoms: [
      'Curled and distorted leaves',
      'Sticky honeydew on leaves',
      'Sooty mold growth',
      'Stunted plant growth',
    ],
    controlMeasures: [
      'Use reflective mulches',
      'Spray with neem oil or soap solution',
      'Encourage natural predators (ladybugs)',
      'Apply systemic insecticides if severe',
      'Remove heavily infested plants',
    ],
  },
  rust: {
    name: 'Rust Disease',
    type: 'disease' as const,
    affectedCrops: ['maize', 'soybean', 'cowpea'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 28,
      humidityMin: 75,
      humidityMax: 100,
      rainfallMin: 60,
      rainfallMax: 200,
    },
    symptoms: [
      'Orange or brown pustules on leaves',
      'Yellowing of leaves',
      'Premature leaf drop',
      'Reduced photosynthesis',
    ],
    controlMeasures: [
      'Plant resistant varieties',
      'Apply fungicides at first sign',
      'Improve air circulation',
      'Remove crop residues',
      'Practice crop rotation',
    ],
  },
  whiteflies: {
    name: 'Whiteflies',
    type: 'pest' as const,
    affectedCrops: ['cassava', 'tomato', 'cowpea'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 32,
      humidityMin: 60,
      humidityMax: 90,
      rainfallMin: 30,
      rainfallMax: 100,
    },
    symptoms: [
      'White insects on leaf undersides',
      'Yellowing and wilting leaves',
      'Sticky honeydew on leaves',
      'Transmission of viral diseases',
    ],
    controlMeasures: [
      'Use yellow sticky traps',
      'Apply neem oil or insecticidal soap',
      'Introduce natural predators',
      'Use reflective mulches',
      'Apply systemic insecticides if needed',
    ],
  },
  // Oil Palm specific pests and diseases
  basal_stem_rot: {
    name: 'Basal Stem Rot (Ganoderma)',
    type: 'disease' as const,
    affectedCrops: ['oil_palm', 'coconut'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 25,
      tempMax: 32,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 400,
    },
    symptoms: [
      'Yellowing and wilting of older fronds',
      'Unopened spear leaves',
      'White fungal brackets at stem base',
      'Rotting tissue at stem base',
      'Reduced fruit bunch production',
    ],
    controlMeasures: [
      'Remove and destroy infected palms',
      'Apply Trichoderma-based biocontrol agents',
      'Improve drainage in affected areas',
      'Avoid mechanical damage to roots',
      'Apply fungicides to surrounding palms',
      'Maintain proper spacing (9x9m triangular)',
    ],
  },
  bud_rot: {
    name: 'Bud Rot',
    type: 'disease' as const,
    affectedCrops: ['oil_palm', 'coconut'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 30,
      humidityMin: 85,
      humidityMax: 100,
      rainfallMin: 200,
      rainfallMax: 500,
    },
    symptoms: [
      'Rotting of unopened spear leaf',
      'Foul smell from crown',
      'Collapse of central leaves',
      'Brown discoloration of meristem',
      'Secondary bacterial infection',
    ],
    controlMeasures: [
      'Remove affected tissue and apply copper fungicide',
      'Improve drainage around palms',
      'Avoid waterlogging conditions',
      'Apply systemic fungicides preventively',
      'Monitor during prolonged wet periods',
    ],
  },
  rhinoceros_beetle: {
    name: 'Rhinoceros Beetle',
    type: 'pest' as const,
    affectedCrops: ['oil_palm', 'coconut'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 32,
      humidityMin: 70,
      humidityMax: 95,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'V-shaped cuts on fronds',
      'Holes in crown and trunk',
      'Damaged growing point',
      'Reduced frond production',
      'Entry points for secondary infections',
    ],
    controlMeasures: [
      'Remove and destroy breeding sites (decaying logs)',
      'Apply pheromone traps',
      'Use Metarhizium anisopliae biocontrol',
      'Hook out beetles from damaged palms',
      'Apply insecticides to breeding sites',
      'Maintain field sanitation',
    ],
  },
  red_palm_weevil: {
    name: 'Red Palm Weevil',
    type: 'pest' as const,
    affectedCrops: ['oil_palm', 'coconut', 'date_palm'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 25,
      tempMax: 35,
      humidityMin: 60,
      humidityMax: 90,
      rainfallMin: 50,
      rainfallMax: 200,
    },
    symptoms: [
      'Wilting of inner fronds',
      'Holes in trunk with fibrous material',
      'Fermented smell from trunk',
      'Crown collapse in severe cases',
      'Larvae tunneling in trunk',
    ],
    controlMeasures: [
      'Use pheromone traps for monitoring',
      'Inject insecticides into infested trunks',
      'Remove and destroy heavily infested palms',
      'Avoid pruning during peak weevil activity',
      'Apply preventive trunk treatments',
    ],
  },
  bagworms: {
    name: 'Bagworms',
    type: 'pest' as const,
    affectedCrops: ['oil_palm', 'cocoa', 'coconut'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 30,
      humidityMin: 70,
      humidityMax: 90,
      rainfallMin: 100,
      rainfallMax: 250,
    },
    symptoms: [
      'Bag-like cases on fronds',
      'Skeletonized leaves',
      'Reduced photosynthesis',
      'Yield reduction up to 40%',
      'Defoliation in severe cases',
    ],
    controlMeasures: [
      'Manual collection and destruction of bags',
      'Apply Bacillus thuringiensis (Bt)',
      'Encourage natural predators (birds, parasitoids)',
      'Apply selective insecticides if severe',
      'Maintain barn owl populations',
    ],
  },
  pestalotiopsis_leaf_spot: {
    name: 'Pestalotiopsis Leaf Spot',
    type: 'disease' as const,
    affectedCrops: ['oil_palm'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 30,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 350,
    },
    symptoms: [
      'Gray-brown leaf spots with dark margins',
      'Lesions on young fronds',
      'Premature frond senescence',
      'Reduced photosynthetic area',
    ],
    controlMeasures: [
      'Remove and destroy infected fronds',
      'Apply copper-based fungicides',
      'Improve air circulation',
      'Maintain balanced nutrition',
      'Avoid overhead irrigation',
    ],
  },
  // Cocoa specific pests and diseases
  black_pod_disease: {
    name: 'Black Pod Disease',
    type: 'disease' as const,
    affectedCrops: ['cocoa'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 28,
      humidityMin: 85,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 400,
    },
    symptoms: [
      'Black lesions on pods',
      'Rapid pod rot',
      'White fungal growth in humid conditions',
      'Mummified pods on tree',
      'Yield losses up to 80%',
    ],
    controlMeasures: [
      'Remove infected pods weekly',
      'Apply copper-based fungicides preventively',
      'Improve canopy management for air flow',
      'Harvest pods promptly when ripe',
      'Use resistant varieties',
    ],
  },
  cocoa_swollen_shoot: {
    name: 'Cocoa Swollen Shoot Virus',
    type: 'disease' as const,
    affectedCrops: ['cocoa'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 32,
      humidityMin: 60,
      humidityMax: 85,
      rainfallMin: 50,
      rainfallMax: 150,
    },
    symptoms: [
      'Swelling of shoots and roots',
      'Red vein banding on leaves',
      'Leaf chlorosis and distortion',
      'Reduced pod production',
      'Tree death within 2-3 years',
    ],
    controlMeasures: [
      'Remove and destroy infected trees',
      'Control mealybug vectors',
      'Use virus-free planting material',
      'Maintain isolation from infected areas',
      'Plant resistant varieties',
    ],
  },
  cocoa_mirids: {
    name: 'Cocoa Mirids (Capsids)',
    type: 'pest' as const,
    affectedCrops: ['cocoa'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 30,
      humidityMin: 70,
      humidityMax: 90,
      rainfallMin: 80,
      rainfallMax: 200,
    },
    symptoms: [
      'Lesions on pods and shoots',
      'Dieback of branches',
      'Canker formation',
      'Reduced flowering and fruiting',
      'Secondary fungal infections',
    ],
    controlMeasures: [
      'Apply systemic insecticides at peak season',
      'Prune and destroy infested branches',
      'Maintain proper shade management',
      'Use pheromone traps for monitoring',
      'Apply contact insecticides to hotspots',
    ],
  },
  // Coffee specific pests and diseases
  coffee_berry_disease: {
    name: 'Coffee Berry Disease',
    type: 'disease' as const,
    affectedCrops: ['coffee_arabica', 'coffee_robusta'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 15,
      tempMax: 22,
      humidityMin: 85,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 350,
    },
    symptoms: [
      'Dark sunken lesions on berries',
      'Premature berry drop',
      'Mummified berries on branches',
      'Yield losses up to 80%',
    ],
    controlMeasures: [
      'Apply copper fungicides preventively',
      'Remove mummified berries',
      'Improve air circulation through pruning',
      'Use resistant varieties',
      'Time fungicide applications with flowering',
    ],
  },
  coffee_leaf_rust: {
    name: 'Coffee Leaf Rust',
    type: 'disease' as const,
    affectedCrops: ['coffee_arabica', 'coffee_robusta'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 18,
      tempMax: 25,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'Orange-yellow powdery spots on leaf undersides',
      'Premature leaf drop',
      'Reduced photosynthesis',
      'Branch dieback',
      'Yield reduction up to 50%',
    ],
    controlMeasures: [
      'Apply copper or triazole fungicides',
      'Use resistant varieties',
      'Maintain proper shade levels',
      'Improve plant nutrition',
      'Remove heavily infected leaves',
    ],
  },
  coffee_berry_borer: {
    name: 'Coffee Berry Borer',
    type: 'pest' as const,
    affectedCrops: ['coffee_arabica', 'coffee_robusta'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 30,
      humidityMin: 70,
      humidityMax: 95,
      rainfallMin: 80,
      rainfallMax: 200,
    },
    symptoms: [
      'Small holes in berries',
      'Tunneling inside beans',
      'Premature berry drop',
      'Reduced bean quality',
      'Secondary fungal infections',
    ],
    controlMeasures: [
      'Harvest berries promptly and completely',
      'Use Beauveria bassiana biocontrol',
      'Deploy ethanol-methanol traps',
      'Remove fallen berries from ground',
      'Apply approved insecticides if severe',
    ],
  },
  // Rubber specific pests and diseases
  white_root_disease: {
    name: 'White Root Disease',
    type: 'disease' as const,
    affectedCrops: ['rubber', 'oil_palm', 'cocoa'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 32,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 400,
    },
    symptoms: [
      'Yellowing and wilting of leaves',
      'White fungal rhizomorphs on roots',
      'Reduced latex yield',
      'Tree death if untreated',
    ],
    controlMeasures: [
      'Remove and destroy infected roots',
      'Apply fungicides to collar region',
      'Improve drainage',
      'Avoid planting in previously infected areas',
      'Use Trichoderma biocontrol',
    ],
  },
  pink_disease: {
    name: 'Pink Disease',
    type: 'disease' as const,
    affectedCrops: ['rubber', 'cocoa', 'citrus'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 28,
      humidityMin: 85,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 350,
    },
    symptoms: [
      'Pink encrustation on branches',
      'Branch dieback',
      'Gum exudation',
      'Reduced canopy',
    ],
    controlMeasures: [
      'Prune and destroy infected branches',
      'Apply copper fungicides',
      'Improve air circulation',
      'Avoid wounds during wet season',
    ],
  },
  // Banana specific pests and diseases
  panama_disease: {
    name: 'Panama Disease (Fusarium Wilt)',
    type: 'disease' as const,
    affectedCrops: ['banana'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 24,
      tempMax: 32,
      humidityMin: 70,
      humidityMax: 95,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'Yellowing of older leaves',
      'Splitting of pseudostem base',
      'Brown discoloration of vascular tissue',
      'Wilting and plant death',
    ],
    controlMeasures: [
      'Use disease-free planting material',
      'Plant resistant varieties',
      'Avoid movement of soil from infected areas',
      'Improve drainage',
      'Practice crop rotation',
    ],
  },
  banana_weevil: {
    name: 'Banana Weevil',
    type: 'pest' as const,
    affectedCrops: ['banana'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 30,
      humidityMin: 70,
      humidityMax: 95,
      rainfallMin: 100,
      rainfallMax: 250,
    },
    symptoms: [
      'Tunneling in corm and pseudostem',
      'Yellowing and wilting',
      'Reduced bunch weight',
      'Plant toppling',
    ],
    controlMeasures: [
      'Use clean planting material',
      'Apply pheromone traps',
      'Remove crop residues',
      'Apply entomopathogenic fungi',
      'Use pseudostem traps',
    ],
  },
  // Citrus specific pests and diseases
  citrus_greening: {
    name: 'Citrus Greening (HLB)',
    type: 'disease' as const,
    affectedCrops: ['citrus'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 30,
      humidityMin: 60,
      humidityMax: 85,
      rainfallMin: 50,
      rainfallMax: 150,
    },
    symptoms: [
      'Asymmetric leaf yellowing',
      'Lopsided, bitter fruits',
      'Premature fruit drop',
      'Twig dieback',
      'Tree decline over years',
    ],
    controlMeasures: [
      'Control Asian citrus psyllid vectors',
      'Remove infected trees',
      'Use certified disease-free nursery stock',
      'Apply systemic insecticides',
      'Maintain tree nutrition',
    ],
  },
  citrus_canker: {
    name: 'Citrus Canker',
    type: 'disease' as const,
    affectedCrops: ['citrus'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 35,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'Raised corky lesions on leaves and fruit',
      'Yellow halo around lesions',
      'Premature leaf and fruit drop',
      'Reduced fruit quality',
    ],
    controlMeasures: [
      'Apply copper bactericides preventively',
      'Use windbreaks to reduce spread',
      'Remove infected plant material',
      'Avoid working in wet conditions',
      'Use resistant varieties',
    ],
  },
  // Ginger and Turmeric specific diseases
  rhizome_rot: {
    name: 'Rhizome Rot (Soft Rot)',
    type: 'disease' as const,
    affectedCrops: ['ginger', 'turmeric'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 25,
      tempMax: 32,
      humidityMin: 85,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 400,
    },
    symptoms: [
      'Water-soaked lesions on rhizomes',
      'Foul smell from rotting tissue',
      'Yellowing and wilting of shoots',
      'Complete plant collapse',
    ],
    controlMeasures: [
      'Use disease-free seed rhizomes',
      'Treat rhizomes with fungicide before planting',
      'Improve drainage',
      'Practice crop rotation',
      'Remove infected plants immediately',
    ],
  },
  leaf_spot_ginger: {
    name: 'Leaf Spot (Phyllosticta)',
    type: 'disease' as const,
    affectedCrops: ['ginger', 'turmeric'],
    severity: 'medium' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 30,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'Oval spots with gray centers',
      'Dark brown margins on spots',
      'Premature leaf senescence',
      'Reduced rhizome yield',
    ],
    controlMeasures: [
      'Apply mancozeb or copper fungicides',
      'Remove infected leaves',
      'Improve air circulation',
      'Avoid overhead irrigation',
    ],
  },
  // Avocado and Mango specific diseases
  anthracnose: {
    name: 'Anthracnose',
    type: 'disease' as const,
    affectedCrops: ['avocado', 'mango', 'banana', 'cocoa'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 22,
      tempMax: 30,
      humidityMin: 85,
      humidityMax: 100,
      rainfallMin: 100,
      rainfallMax: 300,
    },
    symptoms: [
      'Dark sunken lesions on fruits',
      'Leaf spots and blight',
      'Flower blight',
      'Post-harvest fruit rot',
    ],
    controlMeasures: [
      'Apply copper or mancozeb fungicides',
      'Prune for air circulation',
      'Harvest at proper maturity',
      'Hot water treatment post-harvest',
      'Cold storage to slow disease',
    ],
  },
  phytophthora_root_rot: {
    name: 'Phytophthora Root Rot',
    type: 'disease' as const,
    affectedCrops: ['avocado', 'citrus', 'cocoa'],
    severity: 'high' as const,
    optimalConditions: {
      tempMin: 20,
      tempMax: 28,
      humidityMin: 80,
      humidityMax: 100,
      rainfallMin: 150,
      rainfallMax: 400,
    },
    symptoms: [
      'Wilting despite adequate moisture',
      'Small pale leaves',
      'Branch dieback',
      'Dark rotted roots',
      'Tree decline and death',
    ],
    controlMeasures: [
      'Improve drainage',
      'Apply phosphonate fungicides',
      'Use resistant rootstocks',
      'Mulch to reduce soil splash',
      'Avoid overwatering',
    ],
  },
} as const;

export type PestDiseaseKey = keyof typeof PEST_DISEASE_DATABASE;

export interface WeatherConditions {
  temperature: number; // °C (average)
  humidity: number; // % (relative humidity)
  rainfall: number; // mm (weekly total)
  windSpeed?: number; // km/h
}

export interface RiskScore {
  pestOrDisease: string;
  type: 'pest' | 'disease';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
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

/**
 * Calculate risk score for a specific pest/disease based on weather conditions
 */
export function calculateRiskScore(
  pestDiseaseKey: PestDiseaseKey,
  weather: WeatherConditions
): RiskScore {
  const pestDisease = PEST_DISEASE_DATABASE[pestDiseaseKey];
  const optimal = pestDisease.optimalConditions;
  
  // Calculate individual factor scores (0-100)
  let tempScore = 0;
  let humidityScore = 0;
  let rainfallScore = 0;
  
  // Temperature score
  if (weather.temperature >= optimal.tempMin && weather.temperature <= optimal.tempMax) {
    // Within optimal range
    const midpoint = (optimal.tempMin + optimal.tempMax) / 2;
    const range = optimal.tempMax - optimal.tempMin;
    const deviation = Math.abs(weather.temperature - midpoint);
    tempScore = 100 - (deviation / range) * 50; // 50-100 within range
  } else if (weather.temperature < optimal.tempMin) {
    // Below optimal
    const deviation = optimal.tempMin - weather.temperature;
    tempScore = Math.max(0, 50 - deviation * 5); // Decrease 5 points per degree
  } else {
    // Above optimal
    const deviation = weather.temperature - optimal.tempMax;
    tempScore = Math.max(0, 50 - deviation * 5);
  }
  
  // Humidity score
  if (weather.humidity >= optimal.humidityMin && weather.humidity <= optimal.humidityMax) {
    const midpoint = (optimal.humidityMin + optimal.humidityMax) / 2;
    const range = optimal.humidityMax - optimal.humidityMin;
    const deviation = Math.abs(weather.humidity - midpoint);
    humidityScore = 100 - (deviation / range) * 50;
  } else if (weather.humidity < optimal.humidityMin) {
    const deviation = optimal.humidityMin - weather.humidity;
    humidityScore = Math.max(0, 50 - deviation * 2);
  } else {
    const deviation = weather.humidity - optimal.humidityMax;
    humidityScore = Math.max(0, 50 - deviation * 2);
  }
  
  // Rainfall score
  if (weather.rainfall >= optimal.rainfallMin && weather.rainfall <= optimal.rainfallMax) {
    const midpoint = (optimal.rainfallMin + optimal.rainfallMax) / 2;
    const range = optimal.rainfallMax - optimal.rainfallMin;
    const deviation = Math.abs(weather.rainfall - midpoint);
    rainfallScore = 100 - (deviation / range) * 50;
  } else if (weather.rainfall < optimal.rainfallMin) {
    const deviation = optimal.rainfallMin - weather.rainfall;
    rainfallScore = Math.max(0, 50 - deviation * 1);
  } else {
    const deviation = weather.rainfall - optimal.rainfallMax;
    rainfallScore = Math.max(0, 50 - deviation * 0.5);
  }
  
  // Weight factors based on pest/disease type
  let tempWeight = 0.35;
  let humidityWeight = 0.35;
  let rainfallWeight = 0.30;
  
  if (pestDisease.type === 'disease') {
    // Diseases are more sensitive to humidity and rainfall
    humidityWeight = 0.40;
    rainfallWeight = 0.35;
    tempWeight = 0.25;
  }
  
  // Calculate overall risk score
  const riskScore = Math.round(
    tempScore * tempWeight +
    humidityScore * humidityWeight +
    rainfallScore * rainfallWeight
  );
  
  // Determine risk level
  let riskLevel: RiskScore['riskLevel'];
  if (riskScore >= 80) {
    riskLevel = 'critical';
  } else if (riskScore >= 60) {
    riskLevel = 'high';
  } else if (riskScore >= 40) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }
  
  // Determine weather factor favorability
  const weatherFactors = {
    temperature: (tempScore >= 70 ? 'favorable' : tempScore >= 40 ? 'neutral' : 'unfavorable') as 'favorable' | 'neutral' | 'unfavorable',
    humidity: (humidityScore >= 70 ? 'favorable' : humidityScore >= 40 ? 'neutral' : 'unfavorable') as 'favorable' | 'neutral' | 'unfavorable',
    rainfall: (rainfallScore >= 70 ? 'favorable' : rainfallScore >= 40 ? 'neutral' : 'unfavorable') as 'favorable' | 'neutral' | 'unfavorable',
  };
  
  // Generate recommendation
  let recommendation = '';
  if (riskLevel === 'critical') {
    recommendation = `🚨 CRITICAL RISK: Immediate action required. ${pestDisease.name} conditions are highly favorable. Implement all control measures immediately.`;
  } else if (riskLevel === 'high') {
    recommendation = `⚠️ HIGH RISK: ${pestDisease.name} outbreak likely. Begin preventive measures and monitor fields daily.`;
  } else if (riskLevel === 'medium') {
    recommendation = `⚡ MODERATE RISK: Conditions moderately favorable for ${pestDisease.name}. Monitor fields regularly and prepare control measures.`;
  } else {
    recommendation = `✅ LOW RISK: Current conditions not favorable for ${pestDisease.name}. Continue routine monitoring.`;
  }
  
  return {
    pestOrDisease: pestDisease.name,
    type: pestDisease.type,
    riskLevel,
    riskScore,
    affectedCrops: [...pestDisease.affectedCrops],
    severity: pestDisease.severity,
    symptoms: [...pestDisease.symptoms],
    controlMeasures: [...pestDisease.controlMeasures],
    weatherFactors,
    recommendation,
  };
}

/**
 * Calculate risk scores for all pests/diseases affecting a specific crop
 */
export function calculateCropRisks(
  cropType: string,
  weather: WeatherConditions
): RiskScore[] {
  const risks: RiskScore[] = [];
  
  for (const [key, pestDisease] of Object.entries(PEST_DISEASE_DATABASE)) {
    if ((pestDisease.affectedCrops as readonly string[]).includes(cropType)) {
      const risk = calculateRiskScore(key as PestDiseaseKey, weather);
      risks.push(risk);
    }
  }
  
  // Sort by risk score (highest first)
  return risks.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Calculate risk scores for all pests/diseases
 */
export function calculateAllRisks(weather: WeatherConditions): RiskScore[] {
  const risks: RiskScore[] = [];
  
  for (const key of Object.keys(PEST_DISEASE_DATABASE)) {
    const risk = calculateRiskScore(key as PestDiseaseKey, weather);
    risks.push(risk);
  }
  
  // Sort by risk score (highest first)
  return risks.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * Get high-priority alerts (high and critical risks only)
 */
export function getHighPriorityAlerts(weather: WeatherConditions): RiskScore[] {
  const allRisks = calculateAllRisks(weather);
  return allRisks.filter((risk) => risk.riskLevel === 'high' || risk.riskLevel === 'critical');
}

/**
 * Calculate risk trend over time
 */
export function calculateRiskTrend(
  pestDiseaseKey: PestDiseaseKey,
  weatherHistory: WeatherConditions[]
): {
  current: RiskScore;
  trend: 'increasing' | 'stable' | 'decreasing';
  changePercent: number;
  forecast: string;
} {
  if (weatherHistory.length < 2) {
    const current = calculateRiskScore(pestDiseaseKey, weatherHistory[0]);
    return {
      current,
      trend: 'stable',
      changePercent: 0,
      forecast: 'Insufficient data for trend analysis.',
    };
  }
  
  const current = calculateRiskScore(pestDiseaseKey, weatherHistory[weatherHistory.length - 1]);
  const previous = calculateRiskScore(pestDiseaseKey, weatherHistory[weatherHistory.length - 2]);
  
  const changePercent = ((current.riskScore - previous.riskScore) / previous.riskScore) * 100;
  
  let trend: 'increasing' | 'stable' | 'decreasing';
  if (changePercent > 10) {
    trend = 'increasing';
  } else if (changePercent < -10) {
    trend = 'decreasing';
  } else {
    trend = 'stable';
  }
  
  let forecast = '';
  if (trend === 'increasing' && current.riskLevel === 'high') {
    forecast = 'Risk is increasing rapidly. Take immediate preventive action.';
  } else if (trend === 'increasing') {
    forecast = 'Risk is increasing. Monitor closely and prepare control measures.';
  } else if (trend === 'decreasing') {
    forecast = 'Risk is decreasing. Continue current management practices.';
  } else {
    forecast = 'Risk is stable. Maintain routine monitoring.';
  }
  
  return {
    current,
    trend,
    changePercent: Math.round(changePercent * 10) / 10,
    forecast,
  };
}

/**
 * Generate integrated pest management (IPM) recommendations
 */
export function generateIPMRecommendations(
  cropType: string,
  weather: WeatherConditions,
  currentGrowthStage: string
): {
  preventiveMeasures: string[];
  monitoringSchedule: string;
  culturalPractices: string[];
  chemicalControls: string[];
  biologicalControls: string[];
} {
  const risks = calculateCropRisks(cropType, weather);
  const highRisks = risks.filter((r) => r.riskLevel === 'high' || r.riskLevel === 'critical');
  
  const preventiveMeasures: string[] = [
    'Conduct field scouting 2-3 times per week',
    'Maintain field hygiene and remove crop residues',
    'Ensure proper plant spacing for air circulation',
  ];
  
  const culturalPractices: string[] = [
    'Practice crop rotation to break pest/disease cycles',
    'Use certified disease-free seeds or planting material',
    'Maintain optimal soil fertility and pH',
  ];
  
  const biologicalControls: string[] = [
    'Encourage natural predators (ladybugs, parasitic wasps)',
    'Apply neem-based biopesticides',
    'Use Bacillus thuringiensis (Bt) for caterpillar pests',
  ];
  
  const chemicalControls: string[] = [];
  
  if (highRisks.length > 0) {
    preventiveMeasures.push('Increase monitoring frequency to daily inspections');
    
    highRisks.forEach((risk) => {
      if (risk.type === 'pest') {
        chemicalControls.push(`Apply appropriate insecticide for ${risk.pestOrDisease} if threshold exceeded`);
      } else {
        chemicalControls.push(`Apply fungicide for ${risk.pestOrDisease} prevention`);
      }
    });
  }
  
  let monitoringSchedule = 'Scout fields 2-3 times per week';
  if (currentGrowthStage === 'flowering' || currentGrowthStage === 'fruiting') {
    monitoringSchedule = 'Scout fields daily during critical growth stages';
  } else if (highRisks.length > 0) {
    monitoringSchedule = 'Scout fields daily due to high pest/disease risk';
  }
  
  return {
    preventiveMeasures,
    monitoringSchedule,
    culturalPractices,
    biologicalControls,
    chemicalControls: chemicalControls.length > 0 ? chemicalControls : ['No chemical controls recommended at this time'],
  };
}
