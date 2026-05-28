import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { crops, farms } from '../../drizzle/schema.js';
import {
  aiDiagnostics,
  cropHealthReports,
  fieldBoundaries,
  satelliteImagery,
  scoutingTasks,
  vegetationIndices,
} from '../../drizzle/precision-agriculture-schema.js';
import { workOrders } from '../../drizzle/financial-schema.js';
import { protectedProcedure, router } from '../_core/trpc-base.js';
import { getDb } from '../db.js';

const fieldSelectorInput = z.object({
  farmId: z.number(),
  fieldBoundaryId: z.number().optional(),
});

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseBoundary = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch (err) {
      return null;
    }
  }
  return null;
};

const buildTrend = (latest: number | null, previous: number | null): 'increasing' | 'decreasing' | 'stable' | 'unknown' => {
  if (latest === null || previous === null) return 'unknown';
  const delta = latest - previous;
  if (Math.abs(delta) < 0.02) return 'stable';
  return delta > 0 ? 'increasing' : 'decreasing';
};

const healthStatusFromScore = (score: number | null): 'Excellent' | 'Good' | 'Moderate' | 'Critical' | 'Unknown' => {
  if (score === null) return 'Unknown';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Moderate';
  return 'Critical';
};

export const fieldOverviewRouter = router({
  getFields: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
    }

    const userId = Number(ctx.user.id);

    const boundaryRows = await db
      .select({
        fieldBoundaryId: fieldBoundaries.id,
        farmId: farms.id,
        fieldName: fieldBoundaries.fieldName,
        areaHectares: fieldBoundaries.areaHectares,
        boundary: fieldBoundaries.boundary,
        cropType: fieldBoundaries.cropType,
        irrigationType: fieldBoundaries.irrigationType,
        soilType: fieldBoundaries.soilType,
        updatedAt: fieldBoundaries.updatedAt,
        farmName: farms.farmName,
        farmSize: farms.farmSize,
        farmBoundary: farms.boundary,
        latitude: farms.latitude,
        longitude: farms.longitude,
        location: farms.location,
      })
      .from(fieldBoundaries)
      .innerJoin(farms, eq(fieldBoundaries.farmId, farms.id))
      .where(eq(fieldBoundaries.userId, userId))
      .orderBy(desc(fieldBoundaries.updatedAt));

    const farmRows = await db
      .select({
        farmId: farms.id,
        farmName: farms.farmName,
        farmSize: farms.farmSize,
        boundary: farms.boundary,
        latitude: farms.latitude,
        longitude: farms.longitude,
        location: farms.location,
        irrigationType: farms.irrigationType,
        soilType: farms.soilType,
        updatedAt: farms.updatedAt,
      })
      .from(farms)
      .where(eq(farms.userId, userId))
      .orderBy(desc(farms.updatedAt));

    const cropRows = await db
      .select({
        farmId: crops.farmId,
        cropName: crops.cropName,
        plantingDate: crops.plantingDate,
        areaPlanted: crops.areaPlanted,
        areaUnit: crops.areaUnit,
      })
      .from(crops)
      .where(eq(crops.userId, userId))
      .orderBy(desc(crops.plantingDate));

    const latestCropByFarm = new Map<number, (typeof cropRows)[number]>();
    for (const row of cropRows) {
      if (!latestCropByFarm.has(row.farmId)) {
        latestCropByFarm.set(row.farmId, row);
      }
    }

    if (boundaryRows.length > 0) {
      return boundaryRows.map((row) => {
        const latestCrop = latestCropByFarm.get(row.farmId);
        const latitude = toNumber(row.latitude);
        const longitude = toNumber(row.longitude);
        return {
          id: `boundary-${row.fieldBoundaryId}`,
          fieldBoundaryId: row.fieldBoundaryId,
          farmId: row.farmId,
          name: row.fieldName || row.farmName,
          farmName: row.farmName,
          cropType: row.cropType || latestCrop?.cropName || null,
          plantingDate: latestCrop?.plantingDate ?? null,
          areaHectares: toNumber(row.areaHectares) ?? toNumber(row.farmSize) ?? 0,
          latitude,
          longitude,
          location: row.location,
          irrigationType: row.irrigationType || row.irrigationType || null,
          soilType: row.soilType || null,
          boundary: parseBoundary(row.boundary) || parseBoundary(row.farmBoundary),
          updatedAt: row.updatedAt,
        };
      });
    }

    return farmRows.map((row) => {
      const latestCrop = latestCropByFarm.get(row.farmId);
      return {
        id: `farm-${row.farmId}`,
        fieldBoundaryId: null,
        farmId: row.farmId,
        name: row.farmName,
        farmName: row.farmName,
        cropType: latestCrop?.cropName || null,
        plantingDate: latestCrop?.plantingDate ?? null,
        areaHectares: toNumber(row.farmSize) ?? 0,
        latitude: toNumber(row.latitude),
        longitude: toNumber(row.longitude),
        location: row.location,
        irrigationType: row.irrigationType || null,
        soilType: row.soilType || null,
        boundary: parseBoundary(row.boundary),
        updatedAt: row.updatedAt,
      };
    });
  }),

  getVegetationSummary: protectedProcedure
    .input(fieldSelectorInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const userId = Number(ctx.user.id);
      if (!input.fieldBoundaryId) {
        return {
          latest: null,
          previous: null,
          trends: {
            ndvi: 'unknown',
            ndre: 'unknown',
            evi: 'unknown',
            savi: 'unknown',
            gndvi: 'unknown',
          },
          latestImage: null,
          imageCount: 0,
        };
      }

      const samples = await db
        .select()
        .from(vegetationIndices)
        .where(and(eq(vegetationIndices.userId, userId), eq(vegetationIndices.fieldBoundaryId, input.fieldBoundaryId)))
        .orderBy(desc(vegetationIndices.measurementDate))
        .limit(2);

      const [latestImage] = await db
        .select({
          id: satelliteImagery.id,
          imageDate: satelliteImagery.imageDate,
          satelliteSource: satelliteImagery.satelliteSource,
          imageType: satelliteImagery.imageType,
          imageUrl: satelliteImagery.imageUrl,
          thumbnailUrl: satelliteImagery.thumbnailUrl,
          cloudCoverage: satelliteImagery.cloudCoverage,
          resolution: satelliteImagery.resolution,
        })
        .from(satelliteImagery)
        .where(and(eq(satelliteImagery.userId, userId), eq(satelliteImagery.fieldBoundaryId, input.fieldBoundaryId)))
        .orderBy(desc(satelliteImagery.imageDate))
        .limit(1);

      const imageCountRows = await db
        .select({ id: satelliteImagery.id })
        .from(satelliteImagery)
        .where(and(eq(satelliteImagery.userId, userId), eq(satelliteImagery.fieldBoundaryId, input.fieldBoundaryId)));

      const latest = samples[0];
      const previous = samples[1];

      const latestSummary = latest
        ? {
            measurementDate: latest.measurementDate,
            ndvi: toNumber(latest.ndvi),
            ndre: toNumber(latest.ndre),
            evi: toNumber(latest.evi),
            savi: toNumber(latest.savi),
            gndvi: toNumber(latest.gndvi),
            meanValue: toNumber(latest.meanValue),
            minValue: toNumber(latest.minValue),
            maxValue: toNumber(latest.maxValue),
            stdDev: toNumber(latest.stdDev),
          }
        : null;

      const previousSummary = previous
        ? {
            measurementDate: previous.measurementDate,
            ndvi: toNumber(previous.ndvi),
            ndre: toNumber(previous.ndre),
            evi: toNumber(previous.evi),
            savi: toNumber(previous.savi),
            gndvi: toNumber(previous.gndvi),
            meanValue: toNumber(previous.meanValue),
            minValue: toNumber(previous.minValue),
            maxValue: toNumber(previous.maxValue),
            stdDev: toNumber(previous.stdDev),
          }
        : null;

      return {
        latest: latestSummary,
        previous: previousSummary,
        trends: {
          ndvi: buildTrend(latestSummary?.ndvi ?? null, previousSummary?.ndvi ?? null),
          ndre: buildTrend(latestSummary?.ndre ?? null, previousSummary?.ndre ?? null),
          evi: buildTrend(latestSummary?.evi ?? null, previousSummary?.evi ?? null),
          savi: buildTrend(latestSummary?.savi ?? null, previousSummary?.savi ?? null),
          gndvi: buildTrend(latestSummary?.gndvi ?? null, previousSummary?.gndvi ?? null),
        },
        latestImage: latestImage
          ? {
              ...latestImage,
              cloudCoverage: toNumber(latestImage.cloudCoverage),
              resolution: toNumber(latestImage.resolution),
            }
          : null,
        imageCount: imageCountRows.length,
      };
    }),

  getFieldHealth: protectedProcedure
    .input(fieldSelectorInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const userId = Number(ctx.user.id);

      const latestHealth = input.fieldBoundaryId
        ? await db
            .select()
            .from(cropHealthReports)
            .where(and(eq(cropHealthReports.userId, userId), eq(cropHealthReports.fieldBoundaryId, input.fieldBoundaryId)))
            .orderBy(desc(cropHealthReports.reportDate))
            .limit(1)
        : [];

      const diagnostics = input.fieldBoundaryId
        ? await db
            .select()
            .from(aiDiagnostics)
            .where(and(eq(aiDiagnostics.userId, userId), eq(aiDiagnostics.fieldBoundaryId, input.fieldBoundaryId)))
            .orderBy(desc(aiDiagnostics.diagnosisDate))
            .limit(12)
        : [];

      const report = latestHealth[0] ?? null;
      const healthScore = report ? toNumber(report.healthScore) : null;
      const diseaseRisks = diagnostics.map((item) => ({
        id: item.id,
        detectedIssue: item.detectedIssue,
        diagnosisType: item.diagnosisType,
        confidence: toNumber(item.confidence) ?? 0,
        severity: item.severity || 'unknown',
        affectedArea: toNumber(item.affectedArea),
        symptoms: item.symptoms,
        treatment: item.treatment,
        preventionMeasures: item.preventionMeasures,
        diagnosisDate: item.diagnosisDate,
      }));

      if (report && diseaseRisks.length === 0 && report.stressType && ['disease', 'pest'].includes(report.stressType.toLowerCase())) {
        diseaseRisks.push({
          id: -1,
          detectedIssue: report.stressType,
          diagnosisType: report.stressType,
          confidence: healthScore ?? 0,
          severity: report.stressLevel || 'unknown',
          affectedArea: null,
          symptoms: report.observations,
          treatment: report.recommendations,
          preventionMeasures: null,
          diagnosisDate: report.reportDate,
        });
      }

      return {
        latestReport: report
          ? {
              id: report.id,
              reportDate: report.reportDate,
              growthStage: report.growthStage,
              healthScore,
              stressLevel: report.stressLevel,
              stressType: report.stressType,
              canopyCover: toNumber(report.canopyCover),
              leafAreaIndex: toNumber(report.leafAreaIndex),
              biomass: toNumber(report.biomass),
              observations: report.observations,
              recommendations: report.recommendations,
              status: healthStatusFromScore(healthScore),
            }
          : null,
        diseaseRisks,
      };
    }),

  getScoutingTasks: protectedProcedure
    .input(
      fieldSelectorInput.extend({
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const userId = Number(ctx.user.id);
      if (!input.fieldBoundaryId) {
        return [];
      }

      const tasks = await db
        .select()
        .from(scoutingTasks)
        .where(and(eq(scoutingTasks.userId, userId), eq(scoutingTasks.fieldBoundaryId, input.fieldBoundaryId)))
        .orderBy(desc(scoutingTasks.scheduledDate), desc(scoutingTasks.updatedAt))
        .limit(input.limit);

      return tasks.map((task) => ({
        id: task.id,
        taskName: task.taskName,
        taskType: task.taskType,
        priority: task.priority,
        status: task.status,
        scheduledDate: task.scheduledDate,
        completedDate: task.completedDate,
        assignedTo: task.assignedTo,
        observations: task.observations,
        recommendations: task.recommendations,
        imageCount: Array.isArray(task.images) ? task.images.length : 0,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }));
    }),

  getActivityLog: protectedProcedure
    .input(
      fieldSelectorInput.extend({
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      const userId = Number(ctx.user.id);
      const orders = await db
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.userId, userId), eq(workOrders.farmId, input.farmId)))
        .orderBy(desc(workOrders.completedDate), desc(workOrders.scheduledDate), desc(workOrders.updatedAt))
        .limit(input.limit);

      return orders.map((order) => {
        const activityDate = asDate(order.completedDate) || asDate(order.scheduledDate) || asDate(order.updatedAt) || asDate(order.createdAt);
        return {
          id: order.id,
          taskType: order.taskType,
          description: order.description,
          status: order.status,
          activityDate,
          scheduledDate: order.scheduledDate,
          completedDate: order.completedDate,
          estimatedCost: order.estimatedCost !== null && order.estimatedCost !== undefined ? order.estimatedCost / 100 : null,
          actualCost: order.actualCost !== null && order.actualCost !== undefined ? order.actualCost / 100 : null,
          notes: order.notes,
          workOrderNumber: order.workOrderNumber,
        };
      });
    }),
});
