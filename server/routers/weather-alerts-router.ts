import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { farmers, users, weatherStations } from "../../drizzle/schema.js";
import { eq, sql, and } from "drizzle-orm";
import { resilientFetch } from "../services/resilient-http.js";

const AFRICASTALKING_API_KEY = process.env.AFRICASTALKING_API_KEY || "";
const AFRICASTALKING_USERNAME = process.env.AFRICASTALKING_USERNAME || "sandbox";
const AFRICASTALKING_URL = "https://api.africastalking.com/version1/messaging";

interface WeatherAlert {
  id: string;
  type: "frost" | "heavy_rain" | "heatwave" | "drought" | "flood" | "hail" | "strong_wind";
  severity: "advisory" | "warning" | "emergency";
  title: string;
  description: string;
  region: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  validFrom: string;
  validUntil: string;
  source: string;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const ALERT_TEMPLATES: Record<string, Record<string, string>> = {
  frost: {
    en: "FROST WARNING: Temperatures expected to drop below 2°C in {region}. Cover sensitive crops. Protect seedlings.",
    sw: "ONYO LA BARIDI KALI: Joto linatarajiwa kushuka chini ya 2°C katika {region}. Funika mazao.",
  },
  heavy_rain: {
    en: "HEAVY RAIN ALERT: {region} expects heavy rainfall. Secure harvested produce. Check drainage.",
    sw: "ONYO LA MVUA KUBWA: {region} inatarajiwa mvua kubwa. Hakikisha mifereji inafanya kazi.",
  },
  heatwave: {
    en: "HEATWAVE WARNING: Extreme heat expected in {region}. Irrigate crops early morning/evening. Provide shade for livestock.",
    sw: "ONYO LA JOTO KALI: Joto kali linatarajiwa katika {region}. Mwagilia asubuhi/jioni.",
  },
  drought: {
    en: "DROUGHT ADVISORY: Low rainfall forecast for {region}. Conserve water. Consider drought-resistant crops.",
    sw: "USHAURI WA UKAME: Mvua kidogo inatarajiwa katika {region}. Hifadhi maji.",
  },
  flood: {
    en: "FLOOD WARNING: Flooding risk in {region}. Move livestock to high ground. Protect stored grain.",
    sw: "ONYO LA MAFURIKO: Hatari ya mafuriko katika {region}. Hamisha mifugo.",
  },
  hail: {
    en: "HAIL WARNING: Hailstorm expected in {region}. Protect greenhouse covers and young crops.",
    sw: "ONYO LA MVUA YA MAWE: Mvua ya mawe inatarajiwa katika {region}.",
  },
  strong_wind: {
    en: "STRONG WIND ALERT: High winds expected in {region}. Secure structures and tall crops.",
    sw: "ONYO LA UPEPO MKALI: Upepo mkali unatarajiwa katika {region}.",
  },
};

export const weatherAlertsRouter = router({
  broadcastWeatherAlert: protectedProcedure
    .input(z.object({
      type: z.enum(["frost", "heavy_rain", "heatwave", "drought", "flood", "hail", "strong_wind"]),
      severity: z.enum(["advisory", "warning", "emergency"]),
      region: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().min(1).max(500).default(50),
      description: z.string().optional(),
      language: z.string().default("en"),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      const allFarmers = await db.select({
        phoneNumber: farmers.phoneNumber,
        latitude: sql<string>`COALESCE(${farmers.village}, '')`,
        region: farmers.region,
      }).from(farmers)
        .innerJoin(users, eq(farmers.userId, users.id))
        .where(eq(users.isActive, true));

      const farmersInZone = allFarmers.filter(f => {
        if (f.region && f.region.toLowerCase().includes(input.region.toLowerCase())) return true;
        return false;
      });

      const template = ALERT_TEMPLATES[input.type]?.[input.language] ?? ALERT_TEMPLATES[input.type]?.["en"] ?? input.description ?? "";
      const message = template.replace("{region}", input.region);

      const phoneNumbers = farmersInZone
        .map(f => f.phoneNumber)
        .filter((p): p is string => Boolean(p));

      let smsDelivered = 0;
      if (AFRICASTALKING_API_KEY && phoneNumbers.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < phoneNumbers.length; i += batchSize) {
          const batch = phoneNumbers.slice(i, i + batchSize);
          try {
            await resilientFetch("africastalking", AFRICASTALKING_URL, {
              method: "POST",
              headers: {
                apiKey: AFRICASTALKING_API_KEY,
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
              },
              body: new URLSearchParams({
                username: AFRICASTALKING_USERNAME,
                to: batch.join(","),
                message: `[FarmConnect ${input.severity.toUpperCase()}] ${message}`,
              }),
            }, { maxRetries: 2, timeoutMs: 15_000 });
            smsDelivered += batch.length;
          } catch (err) {
            // SMS delivery failure is non-fatal
          }
        }
      }

      return {
        alertType: input.type,
        severity: input.severity,
        region: input.region,
        farmersInZone: farmersInZone.length,
        smsQueued: phoneNumbers.length,
        smsDelivered,
        message,
      };
    }),

  getActiveAlerts: publicProcedure
    .input(z.object({ region: z.string().optional() }))
    .query(async () => {
      return [] as WeatherAlert[];
    }),

  registerWeatherStation: protectedProcedure
    .input(z.object({
      stationId: z.string(),
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      region: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [station] = await db.insert(weatherStations).values({
        stationId: input.stationId,
        name: input.name,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        region: input.region,
        ownerId: ctx.user.id,
        status: "active",
        createdAt: new Date(),
      }).returning();
      return station;
    }),

  getNearbyStations: publicProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().default(50),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const stations = await db.select().from(weatherStations)
        .where(eq(weatherStations.status, "active"));

      return stations.filter(s => {
        const lat = parseFloat(s.latitude);
        const lon = parseFloat(s.longitude);
        if (isNaN(lat) || isNaN(lon)) return false;
        return haversineDistance(input.latitude, input.longitude, lat, lon) <= input.radiusKm;
      }).map(s => ({
        ...s,
        distanceKm: haversineDistance(
          input.latitude, input.longitude,
          parseFloat(s.latitude), parseFloat(s.longitude)
        ),
      }));
    }),
});
