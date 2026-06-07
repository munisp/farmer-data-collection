/**
 * CEA (Controlled Environment Agriculture) AI Router — DB-backed
 * Indoor/vertical farming management, grow recipes, environment optimization.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { indoorFarms, growRecipes } from "../../drizzle/platform-extensions-schema.js";

export const ceaAIRouter = router({
  listIndoorFarms: protectedProcedure
    .input(z.object({
      ownerId: z.number().optional(), farmType: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.ownerId) conds.push(eq(indoorFarms.ownerId, input.ownerId));
      if (input?.farmType) conds.push(eq(indoorFarms.farmType, input.farmType));
      const rows = await db.select().from(indoorFarms)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(indoorFarms.createdAt)).limit(input?.limit ?? 50);
      return rows.map(r => ({ ...r, squareMeters: Number(r.squareMeters) }));
    }),

  getFarm: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(indoorFarms).where(eq(indoorFarms.id, input.farmId));
      if (!row) return null;
      return { ...row, squareMeters: Number(row.squareMeters) };
    }),

  createFarm: protectedProcedure
    .input(z.object({
      name: z.string(), ownerId: z.number(), farmType: z.string(),
      growSystem: z.string(), squareMeters: z.number(), rackLevels: z.number().optional(),
      lightingType: z.string().optional(), location: z.string(),
      environmentParams: z.record(z.string(), z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(indoorFarms).values({
        name: input.name, ownerId: input.ownerId, farmType: input.farmType,
        growSystem: input.growSystem, squareMeters: String(input.squareMeters),
        rackLevels: input.rackLevels, lightingType: input.lightingType,
        location: input.location, environmentParams: input.environmentParams,
      }).returning();
      logger.info("[CEA] Farm created", { id: created.id, name: input.name, type: input.farmType });
      return { success: true, farm: created };
    }),

  listGrowRecipes: publicProcedure
    .input(z.object({ cropType: z.string().optional(), limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.cropType) conds.push(eq(growRecipes.cropType, input.cropType));
      const rows = await db.select().from(growRecipes)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(growRecipes.cropType).limit(input?.limit ?? 50);
      return rows.map(r => ({
        ...r,
        lightHoursPerDay: Number(r.lightHoursPerDay),
        temperatureMinC: Number(r.temperatureMinC), temperatureMaxC: Number(r.temperatureMaxC),
        humidityMinPct: Number(r.humidityMinPct), humidityMaxPct: Number(r.humidityMaxPct),
        phMin: Number(r.phMin), phMax: Number(r.phMax),
        expectedYieldKgPerSqm: Number(r.expectedYieldKgPerSqm),
      }));
    }),

  getRecipe: publicProcedure
    .input(z.object({ recipeId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(growRecipes).where(eq(growRecipes.id, input.recipeId));
      if (!row) return null;
      return {
        ...row,
        lightHoursPerDay: Number(row.lightHoursPerDay),
        temperatureMinC: Number(row.temperatureMinC), temperatureMaxC: Number(row.temperatureMaxC),
        humidityMinPct: Number(row.humidityMinPct), humidityMaxPct: Number(row.humidityMaxPct),
        phMin: Number(row.phMin), phMax: Number(row.phMax),
        expectedYieldKgPerSqm: Number(row.expectedYieldKgPerSqm),
      };
    }),

  createRecipe: protectedProcedure
    .input(z.object({
      cropType: z.string(), recipeName: z.string(),
      lightHoursPerDay: z.number(), temperatureMinC: z.number(), temperatureMaxC: z.number(),
      humidityMinPct: z.number(), humidityMaxPct: z.number(),
      nutrientSolution: z.record(z.string(), z.number()), phMin: z.number(), phMax: z.number(),
      growthDays: z.number(), expectedYieldKgPerSqm: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(growRecipes).values({
        cropType: input.cropType, recipeName: input.recipeName,
        lightHoursPerDay: String(input.lightHoursPerDay),
        temperatureMinC: String(input.temperatureMinC), temperatureMaxC: String(input.temperatureMaxC),
        humidityMinPct: String(input.humidityMinPct), humidityMaxPct: String(input.humidityMaxPct),
        nutrientSolution: input.nutrientSolution,
        phMin: String(input.phMin), phMax: String(input.phMax),
        growthDays: input.growthDays, expectedYieldKgPerSqm: String(input.expectedYieldKgPerSqm),
      }).returning();
      logger.info("[CEA] Recipe created", { id: created.id, crop: input.cropType });
      return { success: true, recipe: created };
    }),

  optimizeEnvironment: protectedProcedure
    .input(z.object({ farmId: z.number(), cropType: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [farm] = await db.select().from(indoorFarms).where(eq(indoorFarms.id, input.farmId));
      const recipes = await db.select().from(growRecipes).where(eq(growRecipes.cropType, input.cropType));
      if (!farm || recipes.length === 0) return null;
      const recipe = recipes[0];
      const envParams = farm.environmentParams as Record<string, number> ?? {};
      const recommendations = [];
      if (envParams.targetTempC && (envParams.targetTempC < Number(recipe.temperatureMinC) || envParams.targetTempC > Number(recipe.temperatureMaxC))) {
        recommendations.push({ param: "temperature", current: envParams.targetTempC, recommended: `${recipe.temperatureMinC}-${recipe.temperatureMaxC}°C` });
      }
      if (envParams.targetHumidityPct && (envParams.targetHumidityPct < Number(recipe.humidityMinPct) || envParams.targetHumidityPct > Number(recipe.humidityMaxPct))) {
        recommendations.push({ param: "humidity", current: envParams.targetHumidityPct, recommended: `${recipe.humidityMinPct}-${recipe.humidityMaxPct}%` });
      }
      const estimatedYield = Number(recipe.expectedYieldKgPerSqm) * Number(farm.squareMeters) * (farm.rackLevels ?? 1);
      return { farm: farm.name, crop: input.cropType, recipe: recipe.recipeName, estimatedYieldKg: estimatedYield, growthDays: recipe.growthDays, recommendations };
    }),

  getFarmTypes: publicProcedure.query(() => [
    { type: "vertical", name: "Vertical Farm", description: "Multi-tier rack growing in buildings" },
    { type: "container", name: "Container Farm", description: "Shipping container converted to growing space" },
    { type: "greenhouse", name: "Smart Greenhouse", description: "Climate-controlled greenhouse with automation" },
    { type: "rooftop", name: "Rooftop Farm", description: "Urban rooftop growing systems" },
  ]),
});
