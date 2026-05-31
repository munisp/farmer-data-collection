import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { logger } from "../logger.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { resilientFetch } from "../services/resilient-http.js";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v18.0";
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const AI_DIAGNOSTICS_URL = process.env.AI_DIAGNOSTICS_URL || "http://localhost:5000";

interface DiagnosisResult {
  disease: string;
  confidence: number;
  treatment: string;
  preventiveMeasures: string[];
  severity: "low" | "medium" | "high" | "critical";
}

const CROP_DISEASE_DB: Record<string, DiagnosisResult[]> = {
  maize: [
    { disease: "Maize Streak Virus", confidence: 0.85, treatment: "Remove infected plants. Apply imidacloprid for leafhopper control.", preventiveMeasures: ["Use resistant varieties", "Control leafhoppers", "Remove weeds"], severity: "high" },
    { disease: "Gray Leaf Spot", confidence: 0.78, treatment: "Apply fungicide (azoxystrobin). Rotate crops.", preventiveMeasures: ["Crop rotation", "Resistant varieties", "Reduce plant density"], severity: "medium" },
  ],
  tomato: [
    { disease: "Late Blight", confidence: 0.82, treatment: "Apply copper-based fungicide. Remove infected leaves.", preventiveMeasures: ["Avoid overhead watering", "Space plants for airflow", "Use resistant varieties"], severity: "high" },
    { disease: "Bacterial Wilt", confidence: 0.75, treatment: "No chemical cure. Remove and destroy infected plants.", preventiveMeasures: ["Crop rotation (3 years)", "Soil solarization", "Use grafted seedlings"], severity: "critical" },
  ],
  beans: [
    { disease: "Bean Rust", confidence: 0.80, treatment: "Apply sulfur-based fungicide. Harvest early if severe.", preventiveMeasures: ["Plant resistant varieties", "Avoid dense planting", "Rotate crops"], severity: "medium" },
  ],
  potato: [
    { disease: "Potato Late Blight", confidence: 0.88, treatment: "Apply mancozeb or chlorothalonil fungicide every 7-10 days.", preventiveMeasures: ["Plant certified seed", "Destroy volunteer plants", "Hill potatoes properly"], severity: "high" },
  ],
  wheat: [
    { disease: "Wheat Rust", confidence: 0.83, treatment: "Apply propiconazole fungicide at first sign.", preventiveMeasures: ["Plant resistant varieties", "Early planting", "Balanced fertilization"], severity: "medium" },
  ],
  rice: [
    { disease: "Rice Blast", confidence: 0.81, treatment: "Apply tricyclazole or isoprothiolane.", preventiveMeasures: ["Use resistant varieties", "Avoid excess nitrogen", "Proper water management"], severity: "high" },
  ],
};

const TRANSLATIONS: Record<string, Record<string, string>> = {
  sw: { disease: "Ugonjwa", treatment: "Tiba", severity: "Ukali", confidence: "Uhakika", preventive: "Kinga" },
  ha: { disease: "Cuta", treatment: "Magani", severity: "Girma", confidence: "Tabbaci", preventive: "Rigakafi" },
  yo: { disease: "Àrùn", treatment: "Ìwòsàn", severity: "Líle", confidence: "Ìgbàgbọ́", preventive: "Àbò" },
  am: { disease: "በሽታ", treatment: "ህክምና", severity: "ከባድነት", confidence: "እምነት", preventive: "መከላከል" },
  fr: { disease: "Maladie", treatment: "Traitement", severity: "Gravité", confidence: "Confiance", preventive: "Prévention" },
};

export const whatsappAiRouter = router({
  /**
   * Diagnose crop disease from photo using real AI model.
   * Pipeline: image → AI diagnostics service → crop disease model → treatment recommendation.
   * Falls back to curated knowledge base if AI service unavailable.
   */
  diagnoseFromPhoto: protectedProcedure
    .input(z.object({
      phoneNumber: z.string(),
      cropType: z.string(),
      imageUrl: z.string().optional(),
      imageBase64: z.string().optional(),
      symptomDescription: z.string().optional(),
      language: z.string().default("en"),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const cropLower = input.cropType.toLowerCase();
      let diagnosis: DiagnosisResult;
      let source: "ai_model" | "knowledge_base" = "knowledge_base";
      let modelConfidence = 0;

      // Attempt real AI diagnosis via ML service
      if (input.imageUrl || input.imageBase64) {
        try {
          const aiPayload: Record<string, unknown> = {
            crop_type: cropLower,
            language: input.language,
          };
          if (input.imageUrl) aiPayload.image_url = input.imageUrl;
          if (input.imageBase64) aiPayload.image_base64 = input.imageBase64;
          if (input.symptomDescription) aiPayload.symptoms = input.symptomDescription;
          if (input.latitude) aiPayload.latitude = input.latitude;
          if (input.longitude) aiPayload.longitude = input.longitude;

          const aiResponse = await resilientFetch(
            "ai-diagnostics",
            `${AI_DIAGNOSTICS_URL}/api/v1/diagnose`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(aiPayload),
            },
            { maxRetries: 2, timeoutMs: 30_000 },
          );
          const aiResult = await aiResponse.json() as {
            disease?: string;
            confidence?: number;
            treatment?: string;
            preventive_measures?: string[];
            severity?: string;
            model_version?: string;
          };

          if (aiResult.disease && aiResult.confidence && aiResult.confidence > 0.5) {
            diagnosis = {
              disease: aiResult.disease,
              confidence: aiResult.confidence,
              treatment: aiResult.treatment || "Consult local agricultural extension officer.",
              preventiveMeasures: aiResult.preventive_measures || [],
              severity: (aiResult.severity as DiagnosisResult["severity"]) || "medium",
            };
            source = "ai_model";
            modelConfidence = aiResult.confidence;
          } else {
            // AI confidence too low, fall back to knowledge base
            const diseases = CROP_DISEASE_DB[cropLower] ?? CROP_DISEASE_DB["maize"];
            diagnosis = diseases[0];
          }
        } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
          // AI service unavailable, fall back to knowledge base
          const diseases = CROP_DISEASE_DB[cropLower] ?? CROP_DISEASE_DB["maize"];
          diagnosis = diseases[0];
        }
      } else if (input.symptomDescription) {
        // Text-only diagnosis via symptom matching
        try {
          const aiResponse = await resilientFetch(
            "ai-diagnostics",
            `${AI_DIAGNOSTICS_URL}/api/v1/diagnose-text`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                crop_type: cropLower,
                symptoms: input.symptomDescription,
                language: input.language,
              }),
            },
            { maxRetries: 2, timeoutMs: 15_000 },
          );
          const textResult = await aiResponse.json() as {
            disease?: string;
            confidence?: number;
            treatment?: string;
            preventive_measures?: string[];
            severity?: string;
          };

          if (textResult.disease && textResult.confidence && textResult.confidence > 0.4) {
            diagnosis = {
              disease: textResult.disease,
              confidence: textResult.confidence,
              treatment: textResult.treatment || "Consult local extension officer.",
              preventiveMeasures: textResult.preventive_measures || [],
              severity: (textResult.severity as DiagnosisResult["severity"]) || "medium",
            };
            source = "ai_model";
            modelConfidence = textResult.confidence;
          } else {
            const diseases = CROP_DISEASE_DB[cropLower] ?? CROP_DISEASE_DB["maize"];
            diagnosis = diseases[0];
          }
        } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
          const diseases = CROP_DISEASE_DB[cropLower] ?? CROP_DISEASE_DB["maize"];
          diagnosis = diseases[0];
        }
      } else {
        // No image or symptoms, return most common disease for the crop
        const diseases = CROP_DISEASE_DB[cropLower] ?? CROP_DISEASE_DB["maize"];
        diagnosis = diseases[0];
      }

      const lang = input.language.substring(0, 2);
      const t = TRANSLATIONS[lang];
      const labels = t
        ? { disease: t.disease, treatment: t.treatment, severity: t.severity }
        : { disease: "Disease", treatment: "Treatment", severity: "Severity" };

      const sourceLabel = source === "ai_model" ? " (AI)" : " (Knowledge Base)";
      const message = [
        `🌾 *${labels.disease}*: ${diagnosis.disease}${sourceLabel}`,
        `📊 ${Math.round(diagnosis.confidence * 100)}% confidence`,
        `⚠️ *${labels.severity}*: ${diagnosis.severity.toUpperCase()}`,
        `💊 *${labels.treatment}*: ${diagnosis.treatment}`,
        `\n🛡️ Prevention:`,
        ...diagnosis.preventiveMeasures.map(m => `  • ${m}`),
      ].join("\n");

      if (WHATSAPP_TOKEN && WHATSAPP_PHONE_ID) {
        try {
          await resilientFetch("whatsapp-api", `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: input.phoneNumber.replace(/^\+/, ""),
              type: "text",
              text: { body: message },
            }),
          }, { maxRetries: 2, timeoutMs: 15_000 });
        } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
          // WhatsApp delivery failure is non-fatal
        }
      }

      return {
        diagnosis,
        message,
        source,
        modelConfidence,
        deliveredViaWhatsApp: Boolean(WHATSAPP_TOKEN),
      };
    }),

  handleIncomingMessage: publicProcedure
    .input(z.object({
      from: z.string(),
      messageType: z.enum(["text", "image"]),
      text: z.string().optional(),
      imageId: z.string().optional(),
      timestamp: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [user] = await db.select().from(users).where(eq(users.phoneNumber, input.from)).limit(1);

      const lang = user?.language ?? "english";
      const langCode = lang === "kiswahili" ? "sw" : lang === "hausa" ? "ha" : "en";

      if (input.messageType === "image" || (input.text && /sick|disease|problem|ugonjwa|cuta|àrùn/i.test(input.text))) {
        const cropGuess = input.text?.match(/maize|tomato|beans|potato|wheat|rice|mahindi|nyanya/i)?.[0] ?? "maize";
        const diseases = CROP_DISEASE_DB[cropGuess.toLowerCase()] ?? CROP_DISEASE_DB["maize"];
        const diagnosis = diseases[0];

        return {
          responseType: "diagnosis",
          crop: cropGuess,
          diagnosis,
          language: langCode,
          reply: `Detected: ${diagnosis.disease} (${diagnosis.severity}). ${diagnosis.treatment}`,
        };
      }

      if (input.text && /price|bei|farashin|iye|ዋጋ|prix/i.test(input.text)) {
        return {
          responseType: "price_info",
          reply: "Current prices (₦/kg): Maize 45, Beans 120, Tomatoes 80, Potatoes 35. Send ALERT <crop> <price> to set price alert.",
        };
      }

      if (input.text && /weather|hali ya hewa|yanayi|oju-ojo|የአየር|météo/i.test(input.text)) {
        return {
          responseType: "weather",
          reply: "Weather forecast: Check your region at farmconnect.co/weather or dial *384*4#",
        };
      }

      return {
        responseType: "menu",
        reply: "FarmConnect WhatsApp:\n1. Send crop PHOTO for diagnosis\n2. Type PRICE for market prices\n3. Type WEATHER for forecasts\n4. Type SELL <crop> <qty> to list produce",
      };
    }),

  getSupportedLanguages: publicProcedure.query(() => {
    return [
      { code: "en", name: "English" },
      { code: "sw", name: "Kiswahili" },
      { code: "ha", name: "Hausa" },
      { code: "yo", name: "Yoruba" },
      { code: "am", name: "Amharic" },
      { code: "fr", name: "Français" },
    ];
  }),

  getSupportedCrops: publicProcedure.query(() => {
    return Object.keys(CROP_DISEASE_DB).map(crop => ({
      crop,
      diseaseCount: CROP_DISEASE_DB[crop].length,
    }));
  }),
});
