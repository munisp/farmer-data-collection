import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const Channel = z.enum(["whatsapp", "ussd", "sms", "voice", "telegram"]);
const TransactionType = z.enum(["sell", "buy", "check_price", "check_balance", "pay", "request_loan", "track_delivery", "weather", "advisory"]);

interface ConversationState {
  sessionId: string;
  userId: string;
  channel: string;
  intent: string;
  entities: Record<string, any>;
  step: number;
  totalSteps: number;
  context: Record<string, any>;
  lastMessage: string;
  createdAt: string;
  language: string;
}

const sessions = new Map<string, ConversationState>();

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

function detectIntent(message: string): { intent: string; entities: Record<string, any>; confidence: number } {
  const lower = message.toLowerCase().trim();

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        const entities: Record<string, any> = {};
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

function generateResponse(intent: string, entities: Record<string, any>, step: number, language: string): { message: string; nextStep: number; complete: boolean; action?: any } {
  const responses: Record<string, (entities: Record<string, any>, step: number) => { message: string; nextStep: number; complete: boolean; action?: any }> = {
    sell: (ent, s) => {
      if (s === 0 && !ent.commodity) return { message: "What crop would you like to sell?", nextStep: 1, complete: false };
      if (s <= 1 && !ent.quantity) return { message: `How many kg of ${ent.commodity} do you want to sell?`, nextStep: 2, complete: false };
      if (s <= 2) return { message: `Finding best buyers for ${ent.quantity}${ent.unit || "kg"} of ${ent.commodity}...`, nextStep: 3, complete: false };
      return {
        message: `✅ Listed ${ent.quantity}${ent.unit || "kg"} of ${ent.commodity} at market price ₦${ent.price || 280}/kg. 3 buyers notified. You'll receive offers within 2 hours.`,
        nextStep: 4, complete: true,
        action: { type: "create_listing", commodity: ent.commodity, quantity: ent.quantity, price: ent.price || 280 },
      };
    },
    buy: (ent, s) => {
      if (s === 0 && !ent.commodity) return { message: "What would you like to buy?", nextStep: 1, complete: false };
      if (s <= 1 && !ent.quantity) return { message: `How much ${ent.commodity} do you need (in kg)?`, nextStep: 2, complete: false };
      return {
        message: `✅ Found 5 sellers with ${ent.commodity}. Best price: ₦${ent.price || 270}/kg. Reply 1 to confirm purchase of ${ent.quantity}kg for ₦${(ent.quantity || 100) * (ent.price || 270)}.`,
        nextStep: 3, complete: true,
        action: { type: "create_order", commodity: ent.commodity, quantity: ent.quantity, price: ent.price || 270 },
      };
    },
    check_price: (ent, _s) => {
      const prices: Record<string, number> = { maize: 280, rice: 450, cassava: 120, tomatoes: 400, sorghum: 250, beans: 600, yam: 350, pepper: 800 };
      const price = prices[ent.commodity?.toLowerCase()] || 200;
      return { message: `📊 ${ent.commodity || "Commodity"} prices today:\n• Market: ₦${price}/kg\n• 7-day trend: +2.1%\n• Best buy: ₦${price - 10}/kg\n• Best sell: ₦${price + 15}/kg`, nextStep: 1, complete: true };
    },
    check_balance: (_ent, _s) => ({ message: "💰 Your balances:\n• Wallet: ₦45,200\n• Escrow: ₦120,000\n• Pending: ₦35,000\n\nReply PAY to make a payment or WITHDRAW to cash out.", nextStep: 1, complete: true }),
    request_loan: (ent, s) => {
      if (s === 0 && !ent.amount) return { message: "How much would you like to borrow (in ₦)?", nextStep: 1, complete: false };
      return {
        message: `📋 Loan pre-approval:\n• Amount: ₦${ent.amount?.toLocaleString()}\n• Rate: 2.5% monthly\n• Duration: 6 months\n• Monthly payment: ₦${Math.round((ent.amount || 100000) * 1.025 / 6).toLocaleString()}\n\nReply CONFIRM to proceed.`,
        nextStep: 2, complete: true,
        action: { type: "loan_application", amount: ent.amount },
      };
    },
    track_delivery: (_ent, _s) => ({ message: "📦 Your active deliveries:\n1. 500kg Maize → Lagos (ETA: 2hrs) 🟢\n2. 200kg Rice → Kano (ETA: Tomorrow) 🟡\n\nReply 1 or 2 for details.", nextStep: 1, complete: true }),
    weather: (_ent, _s) => ({ message: "🌤️ Weather forecast (your farm):\n• Today: 28°C, 60% humidity, no rain\n• Tomorrow: 30°C, light showers (2mm)\n• This week: Good planting conditions\n\n💡 Tip: Ideal time to apply fertilizer today.", nextStep: 1, complete: true }),
    advisory: (_ent, _s) => ({ message: "🌱 Based on your farm profile:\n• Optimal: Plant maize variety WEMA-1001\n• Alert: Brown spot risk HIGH this week\n• Action: Apply fungicide within 48hrs\n• Market: Sell stored rice now (price peak)\n\nReply DETAIL for full advisory.", nextStep: 1, complete: true }),
    unknown: (_ent, _s) => ({ message: "I didn't understand that. You can:\n• SELL — list crops for sale\n• BUY — purchase inputs\n• PRICE — check market prices\n• BALANCE — view your wallet\n• LOAN — apply for credit\n• TRACK — delivery status\n• WEATHER — farm forecast\n• ADVICE — farming tips", nextStep: 0, complete: true }),
  };

  const handler = responses[intent] || responses.unknown;
  return handler(entities, step);
}

export const conversationalCommerceRouter = router({
  processMessage: protectedProcedure
    .input(z.object({ channel: Channel, message: z.string().min(1), sessionId: z.string().optional(), userId: z.string(), phoneNumber: z.string().optional() }))
    .mutation(({ input }) => {
      const { intent, entities, confidence } = detectIntent(input.message);
      const language = detectLanguage(input.message);
      const sessionId = input.sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      let session = sessions.get(sessionId);
      if (!session) {
        session = { sessionId, userId: input.userId, channel: input.channel, intent, entities, step: 0, totalSteps: 4, context: {}, lastMessage: input.message, createdAt: new Date().toISOString(), language };
        sessions.set(sessionId, session);
      } else {
        if (intent !== "unknown") { session.intent = intent; session.entities = { ...session.entities, ...entities }; }
        session.lastMessage = input.message;
      }

      const response = generateResponse(session.intent, session.entities, session.step, language);
      session.step = response.nextStep;

      logger.info("[ConversationalCommerce] Message processed", { sessionId, intent, confidence, channel: input.channel, language });

      return {
        sessionId, response: response.message, intent: session.intent, confidence,
        entities: session.entities, complete: response.complete, action: response.action,
        language, channel: input.channel,
      };
    }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => sessions.get(input.sessionId) || null),

  endSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ input }) => { sessions.delete(input.sessionId); return { success: true }; }),

  getUSSDMenu: publicProcedure
    .input(z.object({ level: z.number().default(0), selection: z.string().optional() }))
    .query(({ input }) => {
      const menus: Record<number, { title: string; options: { key: string; label: string }[] }> = {
        0: { title: "FarmConnect", options: [{ key: "1", label: "Sell Crops" }, { key: "2", label: "Buy Inputs" }, { key: "3", label: "Check Prices" }, { key: "4", label: "My Balance" }, { key: "5", label: "Apply for Loan" }, { key: "6", label: "Track Delivery" }, { key: "7", label: "Weather" }, { key: "8", label: "Advisory" }] },
        1: { title: "Select Crop", options: [{ key: "1", label: "Maize" }, { key: "2", label: "Rice" }, { key: "3", label: "Cassava" }, { key: "4", label: "Tomatoes" }, { key: "5", label: "Beans" }, { key: "0", label: "Back" }] },
        2: { title: "Enter Quantity (kg)", options: [] },
      };
      return menus[input.level] || menus[0];
    }),

  getAnalytics: protectedProcedure.query(() => {
    const allSessions = Array.from(sessions.values());
    const intentCounts: Record<string, number> = {};
    const channelCounts: Record<string, number> = {};
    const languageCounts: Record<string, number> = {};

    allSessions.forEach(s => {
      intentCounts[s.intent] = (intentCounts[s.intent] || 0) + 1;
      channelCounts[s.channel] = (channelCounts[s.channel] || 0) + 1;
      languageCounts[s.language] = (languageCounts[s.language] || 0) + 1;
    });

    return {
      totalSessions: allSessions.length, activeSessions: allSessions.filter(s => s.step < s.totalSteps).length,
      completionRate: allSessions.length > 0 ? Math.round((allSessions.filter(s => s.step >= s.totalSteps).length / allSessions.length) * 100) : 0,
      intentDistribution: intentCounts, channelDistribution: channelCounts, languageDistribution: languageCounts,
      averageSteps: allSessions.length > 0 ? Math.round(allSessions.reduce((s, sess) => s + sess.step, 0) / allSessions.length) : 0,
    };
  }),

  getSupportedLanguages: publicProcedure.query(() => [
    { code: "en", name: "English", supported: true },
    { code: "sw", name: "Kiswahili", supported: true },
    { code: "ha", name: "Hausa", supported: true },
    { code: "yo", name: "Yoruba", supported: true },
    { code: "fr", name: "French", supported: true },
    { code: "am", name: "Amharic", supported: true },
    { code: "ig", name: "Igbo", supported: false },
    { code: "zu", name: "Zulu", supported: false },
  ]),
});
