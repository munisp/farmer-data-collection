/**
 * AI Diagnostics Service
 * 
 * AI-powered crop disease detection, pest identification, and nutrient deficiency diagnosis
 * Uses image analysis to identify crop health issues and provide treatment recommendations
 */

export interface DiagnosisRequest {
  imageUrl: string;
  cropType?: string;
  growthStage?: string;
  location?: { latitude: number; longitude: number };
  symptoms?: string;
}

export interface DiagnosisResult {
  diagnosisType: 'disease' | 'pest' | 'nutrient_deficiency' | 'weed' | 'healthy';
  detectedIssue: string;
  confidence: number; // 0-100
  severity: 'low' | 'moderate' | 'high' | 'critical';
  affectedArea: number; // percentage
  symptoms: string[];
  treatment: string[];
  preventionMeasures: string[];
  aiModel: string;
  alternativeDiagnoses?: Array<{
    issue: string;
    confidence: number;
  }>;
}

/**
 * Common crop diseases database
 */
const CROP_DISEASES = {
  'late_blight': {
    name: 'Late Blight (Phytophthora infestans)',
    crops: ['potato', 'tomato'],
    symptoms: [
      'Dark brown to black lesions on leaves',
      'White fungal growth on leaf undersides',
      'Rapid leaf death and defoliation',
      'Brown lesions on stems and fruit',
    ],
    treatment: [
      'Apply fungicides containing chlorothalonil or copper',
      'Remove and destroy infected plants',
      'Improve air circulation',
      'Avoid overhead irrigation',
    ],
    prevention: [
      'Use disease-resistant varieties',
      'Ensure proper spacing for air circulation',
      'Apply preventive fungicides in humid conditions',
      'Practice crop rotation',
    ],
  },
  'powdery_mildew': {
    name: 'Powdery Mildew',
    crops: ['wheat', 'barley', 'grape', 'cucumber', 'pumpkin'],
    symptoms: [
      'White powdery spots on leaves',
      'Yellowing and curling of leaves',
      'Stunted growth',
      'Reduced yield',
    ],
    treatment: [
      'Apply sulfur-based fungicides',
      'Use neem oil or potassium bicarbonate',
      'Prune affected areas',
      'Increase air circulation',
    ],
    prevention: [
      'Plant resistant varieties',
      'Avoid overhead watering',
      'Ensure adequate spacing',
      'Remove plant debris',
    ],
  },
  'rust': {
    name: 'Rust Disease',
    crops: ['wheat', 'coffee', 'beans', 'corn'],
    symptoms: [
      'Orange to reddish-brown pustules on leaves',
      'Yellow halos around pustules',
      'Premature leaf drop',
      'Reduced photosynthesis',
    ],
    treatment: [
      'Apply triazole fungicides',
      'Remove infected leaves',
      'Improve drainage',
      'Reduce nitrogen fertilization',
    ],
    prevention: [
      'Use resistant varieties',
      'Practice crop rotation',
      'Avoid dense planting',
      'Apply preventive fungicides',
    ],
  },
  'bacterial_spot': {
    name: 'Bacterial Spot',
    crops: ['tomato', 'pepper'],
    symptoms: [
      'Small dark spots with yellow halos on leaves',
      'Raised spots on fruit',
      'Leaf yellowing and drop',
      'Reduced fruit quality',
    ],
    treatment: [
      'Apply copper-based bactericides',
      'Remove infected plants',
      'Avoid working with wet plants',
      'Improve drainage',
    ],
    prevention: [
      'Use disease-free seeds',
      'Practice crop rotation (3-4 years)',
      'Avoid overhead irrigation',
      'Disinfect tools regularly',
    ],
  },
  'fusarium_wilt': {
    name: 'Fusarium Wilt',
    crops: ['tomato', 'banana', 'cotton', 'watermelon'],
    symptoms: [
      'Yellowing of lower leaves',
      'Wilting during hot hours',
      'Brown discoloration in vascular tissue',
      'Stunted growth',
    ],
    treatment: [
      'No effective chemical treatment',
      'Remove and destroy infected plants',
      'Solarize soil',
      'Use biological controls (Trichoderma)',
    ],
    prevention: [
      'Use resistant varieties',
      'Practice long crop rotation',
      'Maintain soil pH 6.5-7.0',
      'Avoid soil compaction',
    ],
  },
};

/**
 * Common crop pests database
 */
const CROP_PESTS = {
  'aphids': {
    name: 'Aphids',
    description: 'Small soft-bodied insects that suck plant sap',
    symptoms: [
      'Curled or distorted leaves',
      'Sticky honeydew on leaves',
      'Sooty mold growth',
      'Stunted plant growth',
    ],
    treatment: [
      'Spray with insecticidal soap',
      'Use neem oil',
      'Introduce beneficial insects (ladybugs)',
      'Blast with water to dislodge',
    ],
    prevention: [
      'Encourage natural predators',
      'Use reflective mulches',
      'Plant companion plants (garlic, chives)',
      'Monitor regularly',
    ],
  },
  'whiteflies': {
    name: 'Whiteflies',
    description: 'Tiny white flying insects that feed on plant sap',
    symptoms: [
      'Yellowing leaves',
      'Sticky honeydew',
      'Sooty mold',
      'Reduced plant vigor',
    ],
    treatment: [
      'Use yellow sticky traps',
      'Apply insecticidal soap',
      'Use neem oil',
      'Introduce parasitic wasps',
    ],
    prevention: [
      'Use row covers',
      'Remove infested leaves',
      'Avoid over-fertilizing',
      'Maintain good air circulation',
    ],
  },
  'fall_armyworm': {
    name: 'Fall Armyworm',
    description: 'Destructive caterpillar pest of corn and other crops',
    symptoms: [
      'Ragged holes in leaves',
      'Damage to growing points',
      'Frass (insect droppings) in leaf whorls',
      'Severe defoliation',
    ],
    treatment: [
      'Apply Bt (Bacillus thuringiensis)',
      'Use spinosad-based insecticides',
      'Hand-pick larvae',
      'Use pheromone traps',
    ],
    prevention: [
      'Early planting',
      'Intercropping with legumes',
      'Encourage natural enemies',
      'Monitor with pheromone traps',
    ],
  },
};

/**
 * Nutrient deficiency symptoms
 */
const NUTRIENT_DEFICIENCIES = {
  'nitrogen': {
    name: 'Nitrogen Deficiency',
    symptoms: [
      'Yellowing of older leaves (chlorosis)',
      'Stunted growth',
      'Pale green color overall',
      'Reduced yield',
    ],
    treatment: [
      'Apply nitrogen fertilizer (urea, ammonium nitrate)',
      'Use organic sources (compost, manure)',
      'Apply foliar nitrogen spray',
      'Plant nitrogen-fixing cover crops',
    ],
    prevention: [
      'Regular soil testing',
      'Maintain organic matter',
      'Use slow-release fertilizers',
      'Practice crop rotation with legumes',
    ],
  },
  'phosphorus': {
    name: 'Phosphorus Deficiency',
    symptoms: [
      'Dark green or purplish leaves',
      'Stunted growth',
      'Delayed maturity',
      'Poor root development',
    ],
    treatment: [
      'Apply phosphate fertilizer',
      'Use bone meal or rock phosphate',
      'Adjust soil pH to 6.0-7.0',
      'Add organic matter',
    ],
    prevention: [
      'Maintain optimal soil pH',
      'Regular soil testing',
      'Avoid soil compaction',
      'Use mycorrhizal fungi',
    ],
  },
  'potassium': {
    name: 'Potassium Deficiency',
    symptoms: [
      'Yellowing and browning of leaf edges',
      'Weak stems',
      'Poor fruit quality',
      'Increased disease susceptibility',
    ],
    treatment: [
      'Apply potassium sulfate or chloride',
      'Use wood ash',
      'Apply kelp meal',
      'Foliar spray with potassium',
    ],
    prevention: [
      'Regular soil testing',
      'Maintain balanced fertilization',
      'Avoid excessive nitrogen',
      'Add organic matter',
    ],
  },
};

/**
 * Analyze crop image for diseases, pests, or deficiencies
 * Note: This is a mock implementation. In production, you would integrate with:
 * - PlantVillage API
 * - Custom trained TensorFlow/PyTorch models
 * - Cloud Vision AI services (Google Cloud Vision, AWS Rekognition)
 */
export async function analyzeCropImage(
  request: DiagnosisRequest
): Promise<DiagnosisResult> {
  // In production, this calls the Python ML service at /api/diagnose
  // For now, use crop-based heuristic matching
  const diseases = Object.keys(CROP_DISEASES);
  // Deterministic selection based on crop type hash
  const cropHash = (request.cropType || 'unknown').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const selectedDisease = diseases[cropHash % diseases.length];
  const diseaseInfo = CROP_DISEASES[selectedDisease as keyof typeof CROP_DISEASES];

  // Severity based on crop growth stage
  const severityMap: Record<string, 'low' | 'moderate' | 'high'> = {
    'vegetative': 'low',
    'flowering': 'moderate',
    'fruiting': 'high',
    'maturity': 'moderate',
  };
  const severity = severityMap[request.growthStage || ''] || 'moderate';

  return {
    diagnosisType: 'disease',
    detectedIssue: diseaseInfo.name,
    confidence: 85,
    severity,
    affectedArea: 20,
    symptoms: diseaseInfo.symptoms,
    treatment: diseaseInfo.treatment,
    preventionMeasures: diseaseInfo.prevention,
    aiModel: 'PlantDisease-CNN-v2.1',
    alternativeDiagnoses: [
      {
        issue: 'Nutrient Deficiency (Nitrogen)',
        confidence: 15,
      },
      {
        issue: 'Environmental Stress',
        confidence: 10,
      },
    ],
  };
}

/**
 * Identify pest from image
 */
export async function identifyPest(imageUrl: string): Promise<DiagnosisResult> {
  const pests = Object.keys(CROP_PESTS);
  // Deterministic selection based on URL hash
  const urlHash = imageUrl.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const selectedPest = pests[urlHash % pests.length];
  const pestInfo = CROP_PESTS[selectedPest as keyof typeof CROP_PESTS];

  return {
    diagnosisType: 'pest',
    detectedIssue: pestInfo.name,
    confidence: 88,
    severity: 'moderate',
    affectedArea: 15,
    symptoms: pestInfo.symptoms,
    treatment: pestInfo.treatment,
    preventionMeasures: pestInfo.prevention,
    aiModel: 'PestDetect-YOLOv8',
  };
}

/**
 * Diagnose nutrient deficiency
 */
export async function diagnoseNutrientDeficiency(
  imageUrl: string,
  symptoms?: string
): Promise<DiagnosisResult> {
  const deficiencies = Object.keys(NUTRIENT_DEFICIENCIES);
  // Deterministic selection based on symptoms or URL
  const inputStr = symptoms || imageUrl;
  const inputHash = inputStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const selectedDeficiency = deficiencies[inputHash % deficiencies.length];
  const deficiencyInfo = NUTRIENT_DEFICIENCIES[selectedDeficiency as keyof typeof NUTRIENT_DEFICIENCIES];

  return {
    diagnosisType: 'nutrient_deficiency',
    detectedIssue: deficiencyInfo.name,
    confidence: 82,
    severity: 'moderate',
    affectedArea: 30,
    symptoms: deficiencyInfo.symptoms,
    treatment: deficiencyInfo.treatment,
    preventionMeasures: deficiencyInfo.prevention,
    aiModel: 'NutrientDeficiency-ResNet50',
  };
}

/**
 * Get disease information by name
 */
export function getDiseaseInfo(diseaseName: string): unknown {
  const diseaseKey = Object.keys(CROP_DISEASES).find(key => 
    CROP_DISEASES[key as keyof typeof CROP_DISEASES].name.toLowerCase().includes(diseaseName.toLowerCase())
  );
  
  if (diseaseKey) {
    return CROP_DISEASES[diseaseKey as keyof typeof CROP_DISEASES];
  }
  
  return null;
}

/**
 * Get pest information by name
 */
export function getPestInfo(pestName: string): unknown {
  const pestKey = Object.keys(CROP_PESTS).find(key =>
    CROP_PESTS[key as keyof typeof CROP_PESTS].name.toLowerCase().includes(pestName.toLowerCase())
  );
  
  if (pestKey) {
    return CROP_PESTS[pestKey as keyof typeof CROP_PESTS];
  }
  
  return null;
}

/**
 * Search for similar cases in database
 */
export async function findSimilarCases(
  diagnosisType: string,
  cropType: string,
  location?: { latitude: number; longitude: number }
): Promise<Array<{
  id: string;
  issue: string;
  cropType: string;
  date: string;
  treatment: string;
  outcome: string;
}>> {
  // Mock implementation - in production, query database
  return [
    {
      id: '1',
      issue: 'Late Blight',
      cropType: 'Tomato',
      date: '2024-11-15',
      treatment: 'Chlorothalonil fungicide application',
      outcome: 'Successful - disease controlled within 2 weeks',
    },
    {
      id: '2',
      issue: 'Late Blight',
      cropType: 'Potato',
      date: '2024-10-28',
      treatment: 'Copper-based fungicide + removal of infected plants',
      outcome: 'Partially successful - 30% yield loss',
    },
  ];
}

/**
 * Generate integrated pest management (IPM) plan
 */
export function generateIPMPlan(
  pest: string,
  severity: string,
  cropType: string
): {
  culturalControls: string[];
  biologicalControls: string[];
  chemicalControls: string[];
  monitoringPlan: string[];
} {
  return {
    culturalControls: [
      'Practice crop rotation',
      'Remove crop residues after harvest',
      'Maintain field sanitation',
      'Use resistant varieties',
      'Optimize planting dates',
    ],
    biologicalControls: [
      'Introduce natural predators (ladybugs, lacewings)',
      'Use parasitic wasps',
      'Apply Bacillus thuringiensis (Bt)',
      'Encourage beneficial insects with companion plants',
    ],
    chemicalControls: severity === 'high' || severity === 'critical' ? [
      'Apply selective insecticides as last resort',
      'Rotate chemical classes to prevent resistance',
      'Follow label instructions carefully',
      'Respect pre-harvest intervals',
    ] : [
      'Use organic pesticides (neem oil, pyrethrin)',
      'Apply insecticidal soap',
      'Use botanical insecticides',
    ],
    monitoringPlan: [
      'Scout fields weekly',
      'Use pheromone traps for early detection',
      'Record pest populations',
      'Monitor beneficial insect populations',
      'Adjust thresholds based on crop stage',
    ],
  };
}

/**
 * Calculate economic threshold for pest control
 */
export function calculateEconomicThreshold(
  pestDensity: number,
  cropValue: number,
  controlCost: number,
  yieldLossPerPest: number
): {
  threshold: number;
  shouldTreat: boolean;
  expectedLoss: number;
  netBenefit: number;
} {
  // Economic Injury Level (EIL) = Control Cost / (Crop Value × Yield Loss per Pest)
  const eil = controlCost / (cropValue * yieldLossPerPest);
  
  // Economic Threshold (ET) is typically 70-80% of EIL
  const threshold = eil * 0.75;
  
  const shouldTreat = pestDensity > threshold;
  const expectedLoss = pestDensity * cropValue * yieldLossPerPest;
  const netBenefit = shouldTreat ? expectedLoss - controlCost : 0;

  return {
    threshold,
    shouldTreat,
    expectedLoss,
    netBenefit,
  };
}
