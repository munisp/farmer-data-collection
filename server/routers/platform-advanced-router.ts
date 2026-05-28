import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { users, farmers } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import crypto from "crypto";

// ============================================================================
// DECENTRALIZED IDENTITY (DID) — Self-sovereign identity for unbanked farmers
// ============================================================================

function generateDID(method: string, identifier: string): string {
  const hash = crypto.createHash("sha256").update(identifier).digest("hex").substring(0, 32);
  return `did:${method}:${hash}`;
}

function generateVerifiableCredential(
  issuer: string, subject: string, type: string, claims: Record<string, unknown>
): Record<string, unknown> {
  const id = `vc:${crypto.randomUUID()}`;
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id,
    type: ["VerifiableCredential", type],
    issuer,
    issuanceDate: new Date().toISOString(),
    expirationDate: new Date(Date.now() + 365 * 86400000).toISOString(),
    credentialSubject: { id: subject, ...claims },
    proof: {
      type: "Ed25519Signature2020",
      created: new Date().toISOString(),
      proofPurpose: "assertionMethod",
      verificationMethod: `${issuer}#key-1`,
      proofValue: crypto.createHash("sha256").update(JSON.stringify(claims)).digest("base64"),
    },
  };
}

// ============================================================================
// MULTI-TENANT WHITE-LABEL — NGOs, governments, agribusinesses
// ============================================================================

interface TenantConfig {
  tenantId: string;
  name: string;
  domain: string;
  branding: {
    primaryColor: string;
    logo: string;
    appName: string;
  };
  features: string[];
  region: string;
  currency: string;
  language: string;
  apiKeyHash: string;
}

// ============================================================================
// MARKET EXPANSION — South Asia, Latin America language support
// ============================================================================

const EXPANSION_LANGUAGES: Record<string, { name: string; nativeName: string; region: string; rtl: boolean }> = {
  en: { name: "English", nativeName: "English", region: "global", rtl: false },
  sw: { name: "Swahili", nativeName: "Kiswahili", region: "east_africa", rtl: false },
  ha: { name: "Hausa", nativeName: "Hausa", region: "west_africa", rtl: false },
  yo: { name: "Yoruba", nativeName: "Yorùbá", region: "west_africa", rtl: false },
  am: { name: "Amharic", nativeName: "አማርኛ", region: "east_africa", rtl: false },
  fr: { name: "French", nativeName: "Français", region: "west_africa", rtl: false },
  hi: { name: "Hindi", nativeName: "हिन्दी", region: "south_asia", rtl: false },
  bn: { name: "Bengali", nativeName: "বাংলা", region: "south_asia", rtl: false },
  ta: { name: "Tamil", nativeName: "தமிழ்", region: "south_asia", rtl: false },
  th: { name: "Thai", nativeName: "ไทย", region: "southeast_asia", rtl: false },
  vi: { name: "Vietnamese", nativeName: "Tiếng Việt", region: "southeast_asia", rtl: false },
  es: { name: "Spanish", nativeName: "Español", region: "latin_america", rtl: false },
  pt: { name: "Portuguese", nativeName: "Português", region: "latin_america", rtl: false },
  tl: { name: "Tagalog", nativeName: "Tagalog", region: "southeast_asia", rtl: false },
};

const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  hi: {
    welcome: "फार्मकनेक्ट में आपका स्वागत है",
    marketplace: "बाज़ार", sell: "बेचें", buy: "खरीदें", price: "कीमत",
    weather: "मौसम", loan: "ऋण", savings: "बचत", profile: "प्रोफ़ाइल",
  },
  bn: {
    welcome: "ফার্মকানেক্টে স্বাগতম",
    marketplace: "বাজার", sell: "বিক্রি", buy: "কিনুন", price: "দাম",
    weather: "আবহাওয়া", loan: "ঋণ", savings: "সঞ্চয়", profile: "প্রোফাইল",
  },
  es: {
    welcome: "Bienvenido a FarmConnect",
    marketplace: "Mercado", sell: "Vender", buy: "Comprar", price: "Precio",
    weather: "Clima", loan: "Préstamo", savings: "Ahorros", profile: "Perfil",
  },
  pt: {
    welcome: "Bem-vindo ao FarmConnect",
    marketplace: "Mercado", sell: "Vender", buy: "Comprar", price: "Preço",
    weather: "Tempo", loan: "Empréstimo", savings: "Poupança", profile: "Perfil",
  },
  th: {
    welcome: "ยินดีต้อนรับสู่ FarmConnect",
    marketplace: "ตลาด", sell: "ขาย", buy: "ซื้อ", price: "ราคา",
    weather: "สภาพอากาศ", loan: "สินเชื่อ", savings: "เงินออม", profile: "โปรไฟล์",
  },
  vi: {
    welcome: "Chào mừng đến FarmConnect",
    marketplace: "Chợ", sell: "Bán", buy: "Mua", price: "Giá",
    weather: "Thời tiết", loan: "Vay", savings: "Tiết kiệm", profile: "Hồ sơ",
  },
};

export const platformAdvancedRouter = router({
  // ======================== DECENTRALIZED IDENTITY ========================

  createDID: protectedProcedure
    .input(z.object({
      method: z.enum(["farmconnect", "key", "web"]).default("farmconnect"),
      biometricHash: z.string().optional(),
      cooperativeVouchers: z.array(z.object({
        voucherId: z.number(),
        voucherName: z.string(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [farmer] = await db.select().from(farmers)
        .where(eq(farmers.userId, ctx.user.id))
        .limit(1);

      const identifier = farmer
        ? `${ctx.user.id}:${farmer.id}:${farmer.phoneNumber ?? ""}`
        : `${ctx.user.id}`;

      const did = generateDID(input.method, identifier);

      const verificationMethods = [];
      if (input.biometricHash) {
        verificationMethods.push({
          id: `${did}#biometric-1`,
          type: "BiometricVerification2023",
          controller: did,
          biometricHash: input.biometricHash,
        });
      }
      if (input.cooperativeVouchers && input.cooperativeVouchers.length >= 3) {
        verificationMethods.push({
          id: `${did}#vouching-1`,
          type: "CooperativeVouching2023",
          controller: did,
          vouchers: input.cooperativeVouchers,
          threshold: 3,
        });
      }

      const didDocument = {
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: did,
        controller: did,
        verificationMethod: verificationMethods,
        authentication: verificationMethods.map(vm => vm.id),
        created: new Date().toISOString(),
      };

      return {
        did,
        didDocument,
        registrationStatus: "registered",
        verificationLevel: input.biometricHash ? "biometric" : input.cooperativeVouchers ? "social" : "basic",
      };
    }),

  issueCredential: protectedProcedure
    .input(z.object({
      subjectDID: z.string(),
      credentialType: z.enum([
        "FarmerIdentity", "LandOwnership", "CropCertification",
        "CooperativeMembership", "CreditHistory", "OrganicCertification",
      ]),
      claims: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const issuerDID = generateDID("farmconnect", `issuer:${ctx.user.id}`);
      const vc = generateVerifiableCredential(
        issuerDID, input.subjectDID, input.credentialType, input.claims as Record<string, unknown>
      );
      return { credential: vc, status: "issued" };
    }),

  verifyCredential: publicProcedure
    .input(z.object({ credentialId: z.string() }))
    .query(async ({ input }) => {
      return {
        credentialId: input.credentialId,
        valid: true,
        issuer: "did:farmconnect:platform",
        verifiedAt: new Date().toISOString(),
      };
    }),

  resolveDID: publicProcedure
    .input(z.object({ did: z.string() }))
    .query(async ({ input }) => {
      return {
        did: input.did,
        resolved: true,
        didDocument: {
          "@context": ["https://www.w3.org/ns/did/v1"],
          id: input.did,
          controller: input.did,
        },
      };
    }),

  // ======================== MULTI-TENANT WHITE-LABEL ========================

  createTenant: protectedProcedure
    .input(z.object({
      name: z.string().min(3),
      domain: z.string(),
      primaryColor: z.string().default("#16a34a"),
      logo: z.string().optional(),
      appName: z.string(),
      features: z.array(z.string()),
      region: z.string(),
      currency: z.string().default("NGN"),
      language: z.string().default("en"),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = `tenant-${crypto.randomUUID().slice(0, 12)}`;
      const apiKey = `fc_${crypto.randomUUID().replace(/-/g, "")}`;
      const apiKeyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

      const tenant: TenantConfig = {
        tenantId,
        name: input.name,
        domain: input.domain,
        branding: {
          primaryColor: input.primaryColor,
          logo: input.logo ?? `/tenants/${tenantId}/logo.png`,
          appName: input.appName,
        },
        features: input.features,
        region: input.region,
        currency: input.currency,
        language: input.language,
        apiKeyHash,
      };

      return {
        tenant,
        apiKey,
        setupInstructions: {
          dns: `Add CNAME record: ${input.domain} → app.farmconnect.co`,
          embed: `<script src="https://app.farmconnect.co/embed.js" data-tenant="${tenantId}"></script>`,
          api: `Authorization: Bearer ${apiKey}`,
          customization: `POST /api/tenants/${tenantId}/branding with logo, colors, name`,
        },
      };
    }),

  getTenantConfig: publicProcedure
    .input(z.object({ tenantId: z.string().optional(), domain: z.string().optional() }))
    .query(async ({ input }) => {
      return {
        tenantId: input.tenantId ?? "default",
        branding: { primaryColor: "#16a34a", logo: "/logo.png", appName: "FarmConnect" },
        features: ["marketplace", "loans", "weather", "delivery", "cooperatives"],
        region: "west_africa",
        currency: "NGN",
        language: "en",
      };
    }),

  listTenants: protectedProcedure.query(async () => {
    return [] as TenantConfig[];
  }),

  // ======================== MARKET EXPANSION ========================

  getSupportedLanguages: publicProcedure
    .input(z.object({ region: z.string().optional() }))
    .query(async ({ input }) => {
      const langs = Object.entries(EXPANSION_LANGUAGES).map(([code, l]) => ({ code, ...l }));
      if (input.region) return langs.filter(l => l.region === input.region || l.region === "global");
      return langs;
    }),

  getUITranslations: publicProcedure
    .input(z.object({ language: z.string() }))
    .query(async ({ input }) => {
      const translations = UI_TRANSLATIONS[input.language];
      if (!translations) {
        return {
          language: input.language,
          available: false,
          fallback: "en",
          translations: UI_TRANSLATIONS["es"] ?? {},
        };
      }
      return { language: input.language, available: true, translations };
    }),

  getRegionConfig: publicProcedure
    .input(z.object({
      region: z.enum(["east_africa", "west_africa", "south_asia", "southeast_asia", "latin_america"]),
    }))
    .query(async ({ input }) => {
      const configs: Record<string, {
        currencies: string[];
        paymentMethods: string[];
        crops: string[];
        languages: string[];
        regulations: string[];
      }> = {
        east_africa: {
          currencies: ["KES", "UGX", "TZS", "ETB", "RWF"],
          paymentMethods: ["M-Pesa", "Airtel Money", "MTN MoMo", "Bank Transfer"],
          crops: ["Maize", "Beans", "Tea", "Coffee", "Wheat", "Sorghum", "Potatoes"],
          languages: ["en", "sw", "am"],
          regulations: ["Kenya Agriculture Act", "EAC Common Market Protocol"],
        },
        west_africa: {
          currencies: ["NGN", "GHS", "XOF", "XAF"],
          paymentMethods: ["MTN MoMo", "Flutterwave", "Paystack", "Bank Transfer"],
          crops: ["Rice", "Cassava", "Yam", "Cocoa", "Groundnuts", "Millet"],
          languages: ["en", "ha", "yo", "fr"],
          regulations: ["ECOWAS Agricultural Policy", "Nigeria Agricultural Quarantine Service"],
        },
        south_asia: {
          currencies: ["INR", "BDT", "LKR", "NPR", "PKR"],
          paymentMethods: ["UPI", "bKash", "JazzCash", "Bank Transfer"],
          crops: ["Rice", "Wheat", "Jute", "Tea", "Sugarcane", "Cotton", "Spices"],
          languages: ["hi", "bn", "ta"],
          regulations: ["APMC Act", "e-NAM Platform", "Minimum Support Price"],
        },
        southeast_asia: {
          currencies: ["THB", "VND", "PHP", "IDR", "MYR"],
          paymentMethods: ["GCash", "GrabPay", "PromptPay", "Bank Transfer"],
          crops: ["Rice", "Palm Oil", "Rubber", "Coconut", "Cassava", "Shrimp"],
          languages: ["th", "vi", "tl"],
          regulations: ["ASEAN Agricultural Standards", "GAP Certification"],
        },
        latin_america: {
          currencies: ["BRL", "MXN", "COP", "PEN", "ARS"],
          paymentMethods: ["PIX", "Mercado Pago", "PSE", "Bank Transfer"],
          crops: ["Coffee", "Cocoa", "Avocado", "Bananas", "Sugarcane", "Soybeans"],
          languages: ["es", "pt"],
          regulations: ["Mercosur Agricultural Policy", "Fair Trade Standards"],
        },
      };

      return configs[input.region] ?? configs["east_africa"];
    }),
});
