/**
 * Agricultural LLM Advisory Router
 * Integrates with Python agri-llm service (:8103) for Farmer.Chat-style advisory.
 * Delivery: WhatsApp, USSD, Voice/IVR, SMS, Mobile App
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, desc, and } from "drizzle-orm";
import { aiConversations } from "../../drizzle/supply-chain-schema.js";
import crypto from "crypto";
import { resilientFetch } from "../services/resilient-http.js";

const AGRI_LLM_URL = process.env.AGRI_LLM_URL || "http://localhost:8103";

export const agriLlmRouter = router({
  chat: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(2000),
      language: z.string().default("en"),
      channel: z.enum(["whatsapp", "ussd", "voice", "app", "sms"]).default("app"),
      farmId: z.number().optional(),
      crop: z.string().optional(),
      location: z.object({ lat: z.number(), lon: z.number() }).optional(),
      soilData: z.object({
        ph: z.number().optional(),
        nitrogen_ppm: z.number().optional(),
        phosphorus_ppm: z.number().optional(),
        potassium_ppm: z.number().optional(),
        organic_matter_pct: z.number().optional(),
        cec_meq_100g: z.number().optional(),
        moisture_pct: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const sessionId = crypto.randomUUID();
      const startTime = Date.now();
      const userId = ctx.user?.id ?? 1;

      let response: Record<string, unknown>;
      try {
        const res = await resilientFetch(
          "agri-llm-service",
          `${AGRI_LLM_URL}/api/v1/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: input.query,
              user_id: userId,
              farm_id: input.farmId,
              session_id: sessionId,
              language: input.language,
              crop: input.crop,
              location: input.location,
              soil_data: input.soilData,
            }),
          },
          { maxRetries: 2, timeoutMs: 30_000 },
        );
        response = await res.json() as Record<string, unknown>;
      } catch (err) {
        response = {
          response: "I'm currently offline. Please try again later or contact your local extension officer.",
          query_type: "error",
          confidence: 0,
          context_sources: [],
          model_used: "fallback",
          language: input.language,
          suggestions: [],
          inference_ms: 0,
        };
      }

      const inferenceMs = Date.now() - startTime;

      const [conversation] = await db.insert(aiConversations).values({
        userId,
        farmId: input.farmId,
        sessionId,
        channel: input.channel,
        language: input.language,
        query: input.query,
        queryType: String(response.query_type || "general"),
        response: String(response.response || ""),
        modelUsed: String(response.model_used || "agri-llm-rag-v1"),
        contextSources: JSON.stringify(response.context_sources || []),
        confidence: String(response.confidence || 0),
        inferenceMs: inferenceMs.toString(),
      }).returning();

      return {
        conversationId: conversation.id,
        response: response.response,
        queryType: response.query_type,
        confidence: response.confidence,
        sources: response.context_sources,
        suggestions: response.suggestions,
        language: response.language,
        inferenceMs,
      };
    }),

  diagnoseFromPhoto: protectedProcedure
    .input(z.object({
      crop: z.string(),
      symptoms: z.array(z.string()),
      photoAnalysis: z.object({ disease: z.string(), confidence: z.number() }).optional(),
      language: z.string().default("en"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id ?? 1;
      try {
        const res = await resilientFetch(
          "agri-llm-service",
          `${AGRI_LLM_URL}/api/v1/diagnose`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              crop: input.crop,
              symptoms: input.symptoms,
              photo_analysis: input.photoAnalysis,
              language: input.language,
            }),
          },
          { maxRetries: 2, timeoutMs: 30_000 },
        );
        return res.json() as Promise<Record<string, unknown>>;
      } catch (err) {
        return { error: "LLM service unavailable", crop: input.crop, symptoms: input.symptoms };
      }
    }),

  interpretSoilResults: protectedProcedure
    .input(z.object({
      soilData: z.object({
        ph: z.number(),
        nitrogen_ppm: z.number(),
        phosphorus_ppm: z.number(),
        potassium_ppm: z.number(),
        organic_matter_pct: z.number(),
        cec_meq_100g: z.number().optional(),
        moisture_pct: z.number().optional(),
      }),
      crop: z.string().optional(),
      language: z.string().default("en"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id ?? 1;
      try {
        const res = await resilientFetch(
          "agri-llm-service",
          `${AGRI_LLM_URL}/api/v1/soil-interpret`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              soil_data: input.soilData,
              crop: input.crop,
              language: input.language,
            }),
          },
          { maxRetries: 2, timeoutMs: 15_000 },
        );
        return res.json() as Promise<Record<string, unknown>>;
      } catch (err) {
        return { error: "LLM service unavailable" };
      }
    }),

  submitFeedback: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      rating: z.number().min(1).max(5),
      feedbackText: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(aiConversations)
        .set({
          feedbackRating: input.rating,
          feedbackText: input.feedbackText,
        })
        .where(eq(aiConversations.id, input.conversationId));
      return { status: "recorded" };
    }),

  getHistory: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      channel: z.string().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user?.id ?? 1;
      const conditions = [eq(aiConversations.userId, userId)];
      if (input.farmId) conditions.push(eq(aiConversations.farmId, input.farmId));
      if (input.channel) conditions.push(eq(aiConversations.channel, input.channel));

      return db.select()
        .from(aiConversations)
        .where(and(...conditions))
        .orderBy(desc(aiConversations.createdAt))
        .limit(input.limit);
    }),

  getLanguages: publicProcedure
    .query(async () => {
      try {
        const res = await resilientFetch("agri-llm-service", `${AGRI_LLM_URL}/api/v1/languages`);
        return res.json() as Promise<Record<string, unknown>>;
      } catch (err) {
        return { languages: ["en", "sw", "ha", "yo", "am", "fr", "hi", "bn", "ta", "th", "vi", "es", "pt", "tl"] };
      }
    }),

  getCrops: publicProcedure
    .query(async () => {
      try {
        const res = await resilientFetch("agri-llm-service", `${AGRI_LLM_URL}/api/v1/crops`);
        return res.json() as Promise<Record<string, unknown>>;
      } catch (err) {
        return { crops: ["maize", "rice", "wheat", "cassava", "tomato", "coffee", "beans", "sorghum", "tea", "potato"] };
      }
    }),
});
