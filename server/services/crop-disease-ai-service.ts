/**
 * AI-Powered Crop Disease Identification Service
 * 
 * Uses OpenAI Vision API to analyze crop images and identify diseases,
 * pests, and provide treatment recommendations.
 * 
 * Features:
 * - Image analysis with GPT-4 Vision
 * - Disease classification and confidence scoring
 * - Treatment recommendations
 * - Multi-language support (EN, HA, YO, IG)
 * - Fallback for unsupported crops
 */

import { getDb } from '../db.js';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CropAnalysisResult {
  cropType: string;
  healthStatus: 'healthy' | 'diseased' | 'pest_infestation' | 'nutrient_deficiency' | 'unknown';
  confidence: number; // 0-100
  diseases: DiseaseIdentification[];
  pests: PestIdentification[];
  nutrientDeficiencies: NutrientDeficiency[];
  recommendations: Recommendation[];
  overallAssessment: string;
}

export interface DiseaseIdentification {
  name: string;
  scientificName?: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  symptoms: string[];
  causes: string[];
  treatment: string[];
}

export interface PestIdentification {
  name: string;
  scientificName?: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high';
  description: string;
  controlMethods: string[];
}

export interface NutrientDeficiency {
  nutrient: string;
  confidence: number;
  symptoms: string[];
  treatment: string[];
}

export interface Recommendation {
  type: 'immediate' | 'short_term' | 'long_term' | 'preventive';
  priority: 'high' | 'medium' | 'low';
  action: string;
  description: string;
  estimatedCost?: string;
}

// ============================================================================
// AI Vision Service
// ============================================================================

/**
 * Analyze crop image using OpenAI Vision API
 */
export async function analyzeCropImage(
  imageUrl: string,
  cropType?: string,
  language: 'en' | 'ha' | 'yo' | 'ig' = 'en'
): Promise<CropAnalysisResult> {
  try {
    const apiKey = process.env.BUILT_IN_FORGE_API_KEY;
    const apiUrl = process.env.BUILT_IN_FORGE_API_URL;

    if (!apiKey || !apiUrl) {
      throw new Error('AI API credentials not configured');
    }

    // Build analysis prompt
    const prompt = buildAnalysisPrompt(cropType, language);

    // Call OpenAI Vision API
    const response = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.3, // Lower temperature for more consistent results
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error: ${error}`);
    }

    const data = await response.json();
    const analysisText = data.choices[0]?.message?.content;

    if (!analysisText) {
      throw new Error('No analysis result from AI');
    }

    // Parse AI response into structured result
    const result = parseAnalysisResult(analysisText, language);

    return result;
  } catch (error) {
    logger.error('[CropDiseaseAI] Analysis error:', error);
    throw error;
  }
}

/**
 * Build analysis prompt for AI
 */
function buildAnalysisPrompt(cropType?: string, language: 'en' | 'ha' | 'yo' | 'ig' = 'en'): string {
  const languageNames = {
    en: 'English',
    ha: 'Hausa',
    yo: 'Yoruba',
    ig: 'Igbo',
  };

  const cropInfo = cropType ? `The crop is ${cropType}.` : 'Identify the crop type.';

  return `You are an expert agricultural pathologist and crop health specialist. Analyze this crop image and provide a detailed assessment in ${languageNames[language]}.

${cropInfo}

Please provide a comprehensive analysis in the following JSON format:

{
  "cropType": "identified crop name",
  "healthStatus": "healthy|diseased|pest_infestation|nutrient_deficiency|unknown",
  "confidence": 85,
  "diseases": [
    {
      "name": "Disease name",
      "scientificName": "Scientific name (if applicable)",
      "confidence": 90,
      "severity": "low|medium|high",
      "description": "Brief description",
      "symptoms": ["symptom 1", "symptom 2"],
      "causes": ["cause 1", "cause 2"],
      "treatment": ["treatment step 1", "treatment step 2"]
    }
  ],
  "pests": [
    {
      "name": "Pest name",
      "scientificName": "Scientific name (if applicable)",
      "confidence": 85,
      "severity": "low|medium|high",
      "description": "Brief description",
      "controlMethods": ["method 1", "method 2"]
    }
  ],
  "nutrientDeficiencies": [
    {
      "nutrient": "Nitrogen|Phosphorus|Potassium|etc",
      "confidence": 80,
      "symptoms": ["symptom 1", "symptom 2"],
      "treatment": ["treatment 1", "treatment 2"]
    }
  ],
  "recommendations": [
    {
      "type": "immediate|short_term|long_term|preventive",
      "priority": "high|medium|low",
      "action": "Action title",
      "description": "Detailed description",
      "estimatedCost": "Cost estimate (optional)"
    }
  ],
  "overallAssessment": "A comprehensive summary of the crop's health and recommended actions"
}

Focus on:
1. Accurate disease/pest identification
2. Practical, affordable treatment recommendations
3. Preventive measures
4. Clear, farmer-friendly language
5. Cost-effective solutions suitable for small-scale farmers

Return ONLY the JSON object, no additional text.`;
}

/**
 * Parse AI response into structured result
 */
function parseAnalysisResult(analysisText: string, language: string): CropAnalysisResult {
  try {
    // Extract JSON from response (AI might wrap it in markdown code blocks)
    let jsonText = analysisText.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const result = JSON.parse(jsonText) as CropAnalysisResult;

    // Validate result structure
    if (!result.cropType || !result.healthStatus) {
      throw new Error('Invalid analysis result structure');
    }

    // Ensure arrays exist
    result.diseases = result.diseases || [];
    result.pests = result.pests || [];
    result.nutrientDeficiencies = result.nutrientDeficiencies || [];
    result.recommendations = result.recommendations || [];

    return result;
  } catch (error) {
    logger.error('[CropDiseaseAI] Failed to parse analysis result:', error);
    
    // Return fallback result
    return {
      cropType: 'Unknown',
      healthStatus: 'unknown',
      confidence: 0,
      diseases: [],
      pests: [],
      nutrientDeficiencies: [],
      recommendations: [
        {
          type: 'immediate',
          priority: 'high',
          action: 'Consult agricultural extension officer',
          description: 'Unable to analyze image automatically. Please consult with a local agricultural expert for proper diagnosis.',
        },
      ],
      overallAssessment: 'Unable to analyze the image. Please ensure the image is clear and shows the affected crop parts.',
    };
  }
}

/**
 * Save crop analysis to database
 */
export async function saveCropAnalysis(
  userId: number,
  imageUrl: string,
  analysis: CropAnalysisResult,
  farmId?: number,
  processingTimeMs?: number
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { cropAnalyses } = await import('../../drizzle/schema.js');

  const [result] = await db.insert(cropAnalyses).values({
    userId,
    farmId: farmId || null,
    imageUrl,
    cropType: analysis.cropType,
    healthStatus: analysis.healthStatus,
    confidence: analysis.confidence,
    diseases: analysis.diseases,
    pests: analysis.pests,
    nutrientDeficiencies: analysis.nutrientDeficiencies,
    recommendations: analysis.recommendations,
    overallAssessment: analysis.overallAssessment,
    analysisProvider: 'openai',
    processingTimeMs: processingTimeMs || null,
  }).returning({ id: cropAnalyses.id });

  logger.info('[CropDiseaseAI] Saved analysis:', {
    id: result.id,
    userId,
    farmId,
    cropType: analysis.cropType,
    healthStatus: analysis.healthStatus,
  });

  return result.id;
}

/**
 * Get crop analysis history for user
 */
export async function getCropAnalysisHistory(
  userId: number,
  limit: number = 10
): Promise<CropAnalysisResult[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const { cropAnalyses } = await import('../../drizzle/schema.js');
  const { eq, desc } = await import('drizzle-orm');

  const results = await db
    .select()
    .from(cropAnalyses)
    .where(eq(cropAnalyses.userId, userId))
    .orderBy(desc(cropAnalyses.createdAt))
    .limit(limit);

  return results.map(row => ({
    cropType: row.cropType,
    healthStatus: row.healthStatus as CropAnalysisResult['healthStatus'],
    confidence: row.confidence,
    diseases: (row.diseases || []) as DiseaseIdentification[],
    pests: (row.pests || []) as PestIdentification[],
    nutrientDeficiencies: (row.nutrientDeficiencies || []) as NutrientDeficiency[],
    recommendations: (row.recommendations || []) as Recommendation[],
    overallAssessment: row.overallAssessment || '',
  }));
}

/**
 * Format analysis result for WhatsApp message
 */
export function formatAnalysisForWhatsApp(
  analysis: CropAnalysisResult,
  language: 'en' | 'ha' | 'yo' | 'ig' = 'en'
): string {
  const translations = {
    en: {
      title: '🌾 *Crop Health Analysis*',
      crop: 'Crop',
      status: 'Health Status',
      confidence: 'Confidence',
      diseases: '🦠 *Diseases Detected*',
      pests: '🐛 *Pests Detected*',
      nutrients: '🧪 *Nutrient Deficiencies*',
      recommendations: '💡 *Recommendations*',
      assessment: '📋 *Overall Assessment*',
      severity: 'Severity',
      treatment: 'Treatment',
      control: 'Control Methods',
      healthy: '✅ Healthy',
      diseased: '⚠️ Diseased',
      pest_infestation: '🐛 Pest Infestation',
      nutrient_deficiency: '🧪 Nutrient Deficiency',
      unknown: '❓ Unknown',
      none: 'None detected',
    },
    ha: {
      title: '🌾 *Binciken Lafiyar Amfani*',
      crop: 'Amfani',
      status: 'Matsayin Lafiya',
      confidence: 'Tabbaci',
      diseases: '🦠 *Cututtuka da aka Gano*',
      pests: '🐛 *Kwari da aka Gano*',
      nutrients: '🧪 *Karancin Abinci mai Gina Jiki*',
      recommendations: '💡 *Shawarwari*',
      assessment: '📋 *Jimlar Bincike*',
      severity: 'Matsananci',
      treatment: 'Magani',
      control: 'Hanyoyin Kamewa',
      healthy: '✅ Lafiya',
      diseased: '⚠️ Cuta',
      pest_infestation: '🐛 Cutar Kwari',
      nutrient_deficiency: '🧪 Karancin Abinci',
      unknown: '❓ Ba a Sani Ba',
      none: 'Babu',
    },
    yo: {
      title: '🌾 *Ìwádìí Ìlera Irúgbìn*',
      crop: 'Irúgbìn',
      status: 'Ipò Ìlera',
      confidence: 'Ìgbẹ́kẹ̀lé',
      diseases: '🦠 *Àìsàn tí a Rí*',
      pests: '🐛 *Kòkòrò tí a Rí*',
      nutrients: '🧪 *Àìtó Èròjà Oúnjẹ*',
      recommendations: '💡 *Ìmọ̀ràn*',
      assessment: '📋 *Àkópọ̀ Ìwádìí*',
      severity: 'Ipò Líle',
      treatment: 'Ìtọ́jú',
      control: 'Ọ̀nà Ìṣàkóso',
      healthy: '✅ Ìlera',
      diseased: '⚠️ Àìsàn',
      pest_infestation: '🐛 Ìkọlù Kòkòrò',
      nutrient_deficiency: '🧪 Àìtó Èròjà',
      unknown: '❓ Àìmọ̀',
      none: 'Kò sí',
    },
    ig: {
      title: '🌾 *Nyocha Ahụike Ihe Ọkụkụ*',
      crop: 'Ihe Ọkụkụ',
      status: 'Ọnọdụ Ahụike',
      confidence: 'Ntụkwasị Obi',
      diseases: '🦠 *Ọrịa Achọpụtara*',
      pests: '🐛 *Ahụhụ Achọpụtara*',
      nutrients: '🧪 *Ụkọ Nri Ahụ*',
      recommendations: '💡 *Ndụmọdụ*',
      assessment: '📋 *Nchịkọta Nyocha*',
      severity: 'Ogo Njọ',
      treatment: 'Ọgwụgwọ',
      control: 'Ụzọ Nchịkwa',
      healthy: '✅ Ahụike Ọma',
      diseased: '⚠️ Ọrịa',
      pest_infestation: '🐛 Mwakpo Ahụhụ',
      nutrient_deficiency: '🧪 Ụkọ Nri',
      unknown: '❓ Amaghị',
      none: 'Ọ dịghị',
    },
  };

  const t = translations[language];
  let message = `${t.title}\n\n`;
  
  message += `*${t.crop}:* ${analysis.cropType}\n`;
  message += `*${t.status}:* ${(t as any)[analysis.healthStatus] || analysis.healthStatus}\n`;
  message += `*${t.confidence}:* ${analysis.confidence}%\n\n`;

  // Diseases
  if (analysis.diseases.length > 0) {
    message += `${t.diseases}\n`;
    analysis.diseases.forEach((disease, index) => {
      message += `\n${index + 1}. *${disease.name}*\n`;
      message += `   ${t.severity}: ${disease.severity}\n`;
      message += `   ${t.confidence}: ${disease.confidence}%\n`;
      if (disease.treatment.length > 0) {
        message += `   ${t.treatment}:\n`;
        disease.treatment.forEach((step) => {
          message += `   • ${step}\n`;
        });
      }
    });
    message += '\n';
  }

  // Pests
  if (analysis.pests.length > 0) {
    message += `${t.pests}\n`;
    analysis.pests.forEach((pest, index) => {
      message += `\n${index + 1}. *${pest.name}*\n`;
      message += `   ${t.severity}: ${pest.severity}\n`;
      message += `   ${t.confidence}: ${pest.confidence}%\n`;
      if (pest.controlMethods.length > 0) {
        message += `   ${t.control}:\n`;
        pest.controlMethods.forEach((method) => {
          message += `   • ${method}\n`;
        });
      }
    });
    message += '\n';
  }

  // Nutrient deficiencies
  if (analysis.nutrientDeficiencies.length > 0) {
    message += `${t.nutrients}\n`;
    analysis.nutrientDeficiencies.forEach((deficiency, index) => {
      message += `\n${index + 1}. *${deficiency.nutrient}*\n`;
      message += `   ${t.confidence}: ${deficiency.confidence}%\n`;
      if (deficiency.treatment.length > 0) {
        message += `   ${t.treatment}:\n`;
        deficiency.treatment.forEach((step) => {
          message += `   • ${step}\n`;
        });
      }
    });
    message += '\n';
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    message += `${t.recommendations}\n`;
    
    // Group by priority
    const highPriority = analysis.recommendations.filter(r => r.priority === 'high');
    const mediumPriority = analysis.recommendations.filter(r => r.priority === 'medium');
    const lowPriority = analysis.recommendations.filter(r => r.priority === 'low');

    [...highPriority, ...mediumPriority, ...lowPriority].forEach((rec, index) => {
      const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
      message += `\n${priorityEmoji} *${rec.action}*\n`;
      message += `   ${rec.description}\n`;
      if (rec.estimatedCost) {
        message += `   Cost: ${rec.estimatedCost}\n`;
      }
    });
    message += '\n';
  }

  // Overall assessment
  message += `${t.assessment}\n${analysis.overallAssessment}\n`;

  return message;
}

/**
 * Get supported crop types
 */
export function getSupportedCrops(): string[] {
  return [
    'Maize/Corn',
    'Rice',
    'Wheat',
    'Cassava',
    'Yam',
    'Potato',
    'Tomato',
    'Pepper',
    'Onion',
    'Beans',
    'Soybean',
    'Groundnut/Peanut',
    'Cotton',
    'Sugarcane',
    'Banana/Plantain',
    'Cocoa',
    'Coffee',
    'Palm Oil',
    'Vegetables (general)',
    'Fruits (general)',
  ];
}
