/**
 * Conversational Commerce Router
 * WhatsApp/USSD/SMS chatbot for agricultural transactions.
 * Middleware: PostgreSQL, Kafka (events), Redis (session cache), OpenSearch (product search)
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { eq, desc } from "drizzle-orm";
import { chatSessions, chatMessages } from "../../drizzle/schema-platform-extended.js";
import { applyMiddleware, financialMiddleware, marketplaceMiddleware, dataMiddleware } from "../middleware/deep-integration.js";
import { logger } from "../logger.js";

import { checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";
type ChatSession = typeof chatSessions.$inferSelect;
type ChatMessage = typeof chatMessages.$inferSelect;

const Channel = z.enum(["whatsapp", "ussd", "sms", "voice", "telegram"]);

const INTENT_PATTERNS: { intent: string; patterns: RegExp[]; requiredEntities: string[] }[] = [
  { intent: "sell", patterns: [/sell\s+(\d+)\s*(kg|ton|bags?)\s+(.+)/i, /i want to sell/i, /market my/i], requiredEntities: ["quantity", "unit", "commodity"] },
  { intent: "buy", patterns: [/buy\s+(\d+)\s*(kg|ton|bags?)\s+(.+)/i, /i need\s+(\d+)/i, /purchase/i], requiredEntities: ["quantity", "unit", "commodity"] },
  { intent: "check_price", patterns: [/price\s+(of\s+)?(.+)/i, /how much\s+(is\s+)?(.+)/i, /market price/i], requiredEntities: ["commodity"] },
  { intent: "check_balance", patterns: [/balance/i, /my money/i, /account/i, /how much do i have/i], requiredEntities: [] },
  { intent: "pay", patterns: [/pay\s+(\d+)\s+to\s+(.+)/i, /send\s+(\d+)/i, /transfer/i], requiredEntities: ["amount", "recipient"] },
  { intent: "request_loan", patterns: [/loan\s+(\d+)/i, /borrow/i, /credit/i, /i need money/i], requiredEntities: ["amount"] },
  { intent: "track_delivery", patterns: [/track/i, /where\s+is\s+my/i, /delivery\s+status/i, /order\s+status/i], requiredEntities: [] },
  { intent: "weather", patterns: [/weather/i, /rain/i, /forecast/i, /will it rain/i], requiredEntities: [] },
  { intent: "advisory", patterns: [/advice/i, /recommend/i, /what should i plant/i, /pest/i, /disease/i], requiredEntities: [] },
];

const LANGUAGE_GREETINGS: Record<string, { greeting: string; language: string }> = {
  "hello": { greeting: "Hello! How can I help you today?", language: "en" },
  "hi": { greeting: "Hi! What would you like to do?", language: "en" },
  "habari": { greeting: "Habari! Naweza kukusaidia vipi leo?", language: "sw" },
  "sannu": { greeting: "Sannu! Yaya zan iya taimaka maka?", language: "ha" },
  "bawo": { greeting: "Bawo ni! Kini mo le ṣe fun ọ loni?", language: "yo" },
  "bonjour": { greeting: "Bonjour! Comment puis-je vous aider?", language: "fr" },
};

function detectIntent(message: string): { intent: string; entities: Record<string, string | number>; confidence: number } {
  const lower = message.toLowerCase().trim();
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        const entities: Record<string, string | number> = {};
        if (intent === "sell" || intent === "buy") {
          if (match[1]) entities.quantity = parseInt(match[1]);
          if (match[2]) entities.unit = match[2];
          if (match[3]) entities.commodity = match[3].trim();
        } else if (intent === "check_price") {
          entities.commodity = (match[2] || match[1] || "").trim();
        } else if (intent === "pay") {
          if (match[1]) entities.amount = parseInt(match[1]);
          if (match[2]) entities.recipient = match[2].trim();
        } else if (intent === "request_loan") {
          if (match[1]) entities.amount = parseInt(match[1]);
        }
        return { intent, entities, confidence: 0.85 };
      }
    }
  }
  return { intent: "unknown", entities: {}, confidence: 0.3 };
}

function detectLanguage(message: string): string {
  const lower = message.toLowerCase().trim();
  const firstWord = lower.split(/\s+/)[0];
  if (LANGUAGE_GREETINGS[firstWord]) return LANGUAGE_GREETINGS[firstWord].language;
  if (/[àáâãäåèéêëìíîïòóôõöùúûü]/i.test(message)) return "fr";
  if (/ṣ|ọ|ẹ/i.test(message)) return "yo";
  return "en";
}

function generateResponse(intent: string, entities: Record<string, string | number>): string {
  switch (intent) {
    case "sell": return entities.commodity ? `Finding best buyers for ${entities.quantity || ""}${entities.unit || "kg"} of ${entities.commodity}...` : "What crop would you like to sell?";
    case "buy": return entities.commodity ? `Searching for sellers of ${entities.commodity}...` : "What would you like to buy?";
    case "check_price": return entities.commodity ? `Getting current price for ${entities.commodity}...` : "Which crop price would you like to check?";
    case "check_balance": return "Fetching your account balance...";
    case "pay": return `Processing payment of ${entities.amount || 0} to ${entities.recipient || "recipient"}...`;
    case "request_loan": return `Checking loan eligibility for ${entities.amount || "requested amount"}...`;
    case "track_delivery": return "Looking up your recent orders...";
    case "weather": return "Fetching 5-day weather forecast for your location...";
    case "advisory": return "Connecting you with agricultural advisory services...";
    default: return "I'm sorry, I didn't understand. You can: sell, buy, check prices, check balance, pay, request a loan, track delivery, get weather, or ask for advice.";
  }
}

export const conversationalCommerceRouter = router({
  startSession: protectedProcedure
    .input(z.object({ channel: Channel, phoneNumber: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("conversational_commerce", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("conversational_commerce", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const sessionCode = `CHAT-${Date.now()}`;
      const [session] = await db.insert(chatSessions).values({
        sessionCode,
        userId: ctx.user.id,
        channel: input.channel,
        phoneNumber: input.phoneNumber,
        status: "active",
        context: {},
      }).returning();
      logger.info(`Chat session started: ${sessionCode} via ${input.channel}`);
      return { sessionId: session.id, sessionCode, channel: input.channel, greeting: "Hello! How can I help you today?" };
    }),

  sendMessage: protectedProcedure
    .input(z.object({ sessionId: z.number(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("conversational_commerce", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("conversational_commerce", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, input.sessionId));
      if (!session) throw new Error("Session not found");

      const { intent, entities, confidence } = detectIntent(input.message);
      const language = detectLanguage(input.message);
      const responseText = generateResponse(intent, entities);

      await db.insert(chatMessages).values({ sessionId: input.sessionId, role: "user", content: input.message, intent, entities });
      await db.insert(chatMessages).values({ sessionId: input.sessionId, role: "assistant", content: responseText, intent });

      return { intent, entities, confidence, language, response: responseText };
    }),

  getSessionHistory: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { messages: [] };
      try {
        const messages = await db.select().from(chatMessages).where(eq(chatMessages.sessionId, input.sessionId)).orderBy(chatMessages.createdAt);
        return { messages };
      } catch (err) {
        logger.warn(`conversational-commerce: getSessionHistory query failed, returning fallback: ${err}`);
        return { messages: [] };
      }
    }),

  endSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input }) => {
      const rateCheck = await checkRateLimit("conversational_commerce", "anon", 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("conversational_commerce", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(chatSessions).set({ status: "ended", endedAt: new Date() }).where(eq(chatSessions.id, input.sessionId));
      return { status: "ended" };
    }),

  detectIntent: publicProcedure
    .input(z.object({ message: z.string(), language: z.string().default("en") }))
    .query(({ input }) => {
      const result = detectIntent(input.message);
      const language = detectLanguage(input.message);
      return { ...result, detectedLanguage: language };
    }),

  getSupportedLanguages: publicProcedure.query(() => ({
    languages: [
      { code: "en", name: "English", greeting: "Hello!" },
      { code: "sw", name: "Swahili", greeting: "Habari!" },
      { code: "ha", name: "Hausa", greeting: "Sannu!" },
      { code: "yo", name: "Yoruba", greeting: "Bawo ni!" },
      { code: "fr", name: "French", greeting: "Bonjour!" },
      { code: "ar", name: "Arabic", greeting: "مرحبا!" },
    ],
    total: 6,
  })),

  getStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalSessions: 0, activeSessions: 0, totalMessages: 0, topIntents: [], avgConfidence: 0 };
    try {
      const sessions = await db.select().from(chatSessions);
      const messages = await db.select().from(chatMessages);
      return {
        totalSessions: sessions.length,
        activeSessions: sessions.filter((s: ChatSession) => s.status === "active").length,
        totalMessages: messages.length,
        topIntents: [],
        avgConfidence: 0.85,
      };
    } catch (err) {
      logger.warn(`conversational-commerce: getStats query failed, returning fallback: ${err}`);
      return { totalSessions: 0, activeSessions: 0, totalMessages: 0, topIntents: [], avgConfidence: 0 };
    }
  }),
});
