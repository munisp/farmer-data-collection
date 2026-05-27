import { getDb } from "../db.js";
import { mlModels, modelDownloads, type InsertMlModel, type MlModel } from "../../drizzle/schema-ml-models.js";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import crypto from "crypto";

/**
 * Model Registry Service
 * 
 * Manages pre-trained model library with:
 * - Model registration and versioning
 * - Download tracking and analytics
 * - Model pack creation (crops, diseases, pests)
 * - Checksum verification
 * - Installation management
 */

export interface ModelPack {
  name: string;
  displayName: string;
  description: string;
  models: InsertMlModel[];
  totalSize: number;
  estimatedDownloadTime: string;
}

export class ModelRegistryService {
  /**
   * Register a new model in the registry
   */
  async registerModel(model: InsertMlModel): Promise<MlModel> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [newModel] = await db.insert(mlModels).values(model).returning();
    return newModel;
  }

  /**
   * Get model by ID
   */
  async getModel(modelId: number): Promise<MlModel | undefined> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [model] = await db
      .select()
      .from(mlModels)
      .where(eq(mlModels.id, modelId))
      .limit(1);
    return model;
  }

  /**
   * Get model by name and version
   */
  async getModelByVersion(name: string, version: string): Promise<MlModel | undefined> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [model] = await db
      .select()
      .from(mlModels)
      .where(and(eq(mlModels.name, name), eq(mlModels.version, version)))
      .limit(1);
    return model;
  }

  /**
   * List all published official models
   */
  async listOfficialModels(filters?: {
    type?: string;
    variant?: string;
    targetDevice?: string;
  }): Promise<MlModel[]> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    let query = db
      .select()
      .from(mlModels)
      .where(and(eq(mlModels.isOfficial, true), eq(mlModels.status, "published")))
      .$dynamic();

    if (filters?.type) {
      query = query.where(eq(mlModels.type, filters.type as any));
    }
    if (filters?.variant) {
      query = query.where(eq(mlModels.variant, filters.variant as any));
    }
    if (filters?.targetDevice) {
      query = query.where(eq(mlModels.targetDevice, filters.targetDevice as any));
    }

    return await query.orderBy(desc(mlModels.downloadCount));
  }

  /**
   * Get popular models (by download count)
   */
  async getPopularModels(limit: number = 10): Promise<MlModel[]> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return await db
      .select()
      .from(mlModels)
      .where(and(eq(mlModels.isOfficial, true), eq(mlModels.status, "published")))
      .orderBy(desc(mlModels.downloadCount))
      .limit(limit);
  }

  /**
   * Get recommended models for a crop
   */
  async getRecommendedModelsForCrop(cropName: string): Promise<MlModel[]> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return await db
      .select()
      .from(mlModels)
      .where(
        and(
          eq(mlModels.isOfficial, true),
          eq(mlModels.status, "published"),
          sql`${mlModels.supportedCrops} @> ${JSON.stringify([cropName])}`
        )
      )
      .orderBy(desc(mlModels.rating))
      .limit(5);
  }

  /**
   * Calculate checksum for model file
   */
  calculateChecksum(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Verify model checksum
   */
  async verifyModelChecksum(modelId: number, fileBuffer: Buffer): Promise<boolean> {
    const model = await this.getModel(modelId);
    if (!model) return false;

    const calculatedChecksum = this.calculateChecksum(fileBuffer);
    return calculatedChecksum === model.checksum;
  }

  /**
   * Track model download
   */
  async trackDownload(
    modelId: number,
    userId: number | null,
    deviceInfo?: any
  ): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    // Insert download record
    const [download] = await db
      .insert(modelDownloads)
      .values({
        modelId,
        userId,
        deviceInfo,
        downloadedAt: new Date(),
      })
      .returning();

    // Increment download count
    await db
      .update(mlModels)
      .set({
        downloadCount: sql`${mlModels.downloadCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(mlModels.id, modelId));

    return download.id;
  }

  /**
   * Mark model as installed
   */
  async markAsInstalled(downloadId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
      .update(modelDownloads)
      .set({
        installed: true,
        installedAt: new Date(),
      })
      .where(eq(modelDownloads.id, downloadId));
  }

  /**
   * Record installation error
   */
  async recordInstallationError(downloadId: number, error: string): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    await db
      .update(modelDownloads)
      .set({
        installed: false,
        installationError: error,
      })
      .where(eq(modelDownloads.id, downloadId));
  }

  /**
   * Update model usage statistics
   */
  async updateUsageStats(modelId: number, userId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    // Update model usage count
    await db
      .update(mlModels)
      .set({
        usageCount: sql`${mlModels.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(mlModels.id, modelId));

    // Update download usage stats
    await db
      .update(modelDownloads)
      .set({
        usageCount: sql`${modelDownloads.usageCount} + 1`,
        lastUsedAt: new Date(),
        firstUsedAt: sql`COALESCE(${modelDownloads.firstUsedAt}, NOW())`,
      })
      .where(and(eq(modelDownloads.modelId, modelId), eq(modelDownloads.userId, userId)));
  }

  /**
   * Create pre-defined model packs
   */
  async getModelPacks(): Promise<ModelPack[]> {
    const allModels = await this.listOfficialModels();

    // Disease Detection Pack
    const diseaseModels = allModels.filter((m) => m.type === "disease_detection");
    const diseasePack: ModelPack = {
      name: "disease_detection_pack",
      displayName: "Crop Disease Detection Pack",
      description:
        "Complete set of disease detection models for maize, cassava, rice, and other major crops. Identifies 50+ common diseases with 92%+ accuracy.",
      models: diseaseModels,
      totalSize: diseaseModels.reduce((sum, m) => sum + m.modelSize, 0),
      estimatedDownloadTime: this.estimateDownloadTime(
        diseaseModels.reduce((sum, m) => sum + m.modelSize, 0)
      ),
    };

    // Pest Identification Pack
    const pestModels = allModels.filter((m) => m.type === "pest_identification");
    const pestPack: ModelPack = {
      name: "pest_identification_pack",
      displayName: "Pest Identification Pack",
      description:
        "Identify 30+ common agricultural pests affecting crops in Africa. Includes fall armyworm, locusts, aphids, and more.",
      models: pestModels,
      totalSize: pestModels.reduce((sum, m) => sum + m.modelSize, 0),
      estimatedDownloadTime: this.estimateDownloadTime(
        pestModels.reduce((sum, m) => sum + m.modelSize, 0)
      ),
    };

    // Yield Prediction Pack
    const yieldModels = allModels.filter((m) => m.type === "yield_prediction");
    const yieldPack: ModelPack = {
      name: "yield_prediction_pack",
      displayName: "Yield Prediction Pack",
      description:
        "Predict crop yields based on growth stage, weather, and farm inputs. Helps with harvest planning and market decisions.",
      models: yieldModels,
      totalSize: yieldModels.reduce((sum, m) => sum + m.modelSize, 0),
      estimatedDownloadTime: this.estimateDownloadTime(
        yieldModels.reduce((sum, m) => sum + m.modelSize, 0)
      ),
    };

    // Crop Recommendation Pack
    const cropRecModels = allModels.filter((m) => m.type === "crop_recommendation");
    const cropRecPack: ModelPack = {
      name: "crop_recommendation_pack",
      displayName: "Crop Recommendation Pack",
      description:
        "Get personalized crop recommendations based on soil type, climate, and market conditions. Optimize farm profitability.",
      models: cropRecModels,
      totalSize: cropRecModels.reduce((sum, m) => sum + m.modelSize, 0),
      estimatedDownloadTime: this.estimateDownloadTime(
        cropRecModels.reduce((sum, m) => sum + m.modelSize, 0)
      ),
    };

    // Soil Analysis Pack
    const soilModels = allModels.filter((m) => m.type === "soil_analysis");
    const soilPack: ModelPack = {
      name: "soil_analysis_pack",
      displayName: "Soil Analysis Pack",
      description:
        "Analyze soil health from photos. Detect nutrient deficiencies, pH levels, and get fertilizer recommendations.",
      models: soilModels,
      totalSize: soilModels.reduce((sum, m) => sum + m.modelSize, 0),
      estimatedDownloadTime: this.estimateDownloadTime(
        soilModels.reduce((sum, m) => sum + m.modelSize, 0)
      ),
    };

    // Essential Pack (most popular models)
    const essentialModels = await this.getPopularModels(5);
    const essentialPack: ModelPack = {
      name: "essential_pack",
      displayName: "Essential Pack",
      description:
        "Top 5 most popular models for offline farming. Perfect starter pack for new users.",
      models: essentialModels,
      totalSize: essentialModels.reduce((sum, m) => sum + m.modelSize, 0),
      estimatedDownloadTime: this.estimateDownloadTime(
        essentialModels.reduce((sum, m) => sum + m.modelSize, 0)
      ),
    };

    return [diseasePack, pestPack, yieldPack, cropRecPack, soilPack, essentialPack];
  }

  /**
   * Estimate download time based on file size
   * Assumes 3G connection (1 Mbps = 125 KB/s)
   */
  private estimateDownloadTime(sizeInBytes: number): string {
    const sizeInMB = sizeInBytes / (1024 * 1024);
    const downloadSpeedMBps = 0.125; // 1 Mbps = 0.125 MB/s
    const timeInSeconds = sizeInMB / downloadSpeedMBps;

    if (timeInSeconds < 60) {
      return `${Math.ceil(timeInSeconds)}s`;
    } else if (timeInSeconds < 3600) {
      return `${Math.ceil(timeInSeconds / 60)}m`;
    } else {
      const hours = Math.floor(timeInSeconds / 3600);
      const minutes = Math.ceil((timeInSeconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Get download statistics for a model
   */
  async getDownloadStats(modelId: number): Promise<{
    totalDownloads: number;
    installedCount: number;
    activeUsers: number;
    avgUsageCount: number;
  }> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const stats = await db
      .select({
        totalDownloads: sql<number>`COUNT(*)`,
        installedCount: sql<number>`COUNT(*) FILTER (WHERE ${modelDownloads.installed} = true)`,
        activeUsers: sql<number>`COUNT(DISTINCT ${modelDownloads.userId}) FILTER (WHERE ${modelDownloads.lastUsedAt} > NOW() - INTERVAL '30 days')`,
        avgUsageCount: sql<number>`AVG(${modelDownloads.usageCount})`,
      })
      .from(modelDownloads)
      .where(eq(modelDownloads.modelId, modelId));

    return stats[0] || { totalDownloads: 0, installedCount: 0, activeUsers: 0, avgUsageCount: 0 };
  }

  /**
   * Bulk download models (for model packs)
   */
  async bulkDownload(
    modelIds: number[],
    userId: number | null,
    deviceInfo?: any
  ): Promise<number[]> {
    const downloadIds: number[] = [];

    for (const modelId of modelIds) {
      const downloadId = await this.trackDownload(modelId, userId, deviceInfo);
      downloadIds.push(downloadId);
    }

    return downloadIds;
  }

  /**
   * Get user's downloaded models
   */
  async getUserDownloads(userId: number): Promise<
    Array<{
      model: MlModel;
      download: typeof modelDownloads.$inferSelect;
    }>
  > {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const downloads = await db
      .select({
        model: mlModels,
        download: modelDownloads,
      })
      .from(modelDownloads)
      .innerJoin(mlModels, eq(modelDownloads.modelId, mlModels.id))
      .where(eq(modelDownloads.userId, userId))
      .orderBy(desc(modelDownloads.downloadedAt));

    return downloads;
  }

  /**
   * Check if user has downloaded a model
   */
  async hasUserDownloaded(userId: number, modelId: number): Promise<boolean> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [download] = await db
      .select()
      .from(modelDownloads)
      .where(and(eq(modelDownloads.userId, userId), eq(modelDownloads.modelId, modelId)))
      .limit(1);

    return !!download;
  }

  /**
   * Get models needing updates for a user
   */
  async getModelsNeedingUpdate(userId: number): Promise<
    Array<{
      currentModel: MlModel;
      latestModel: MlModel;
    }>
  > {
    // Get user's downloaded models
    const userDownloads = await this.getUserDownloads(userId);

    const updates: Array<{ currentModel: MlModel; latestModel: MlModel }> = [];

    for (const { model: currentModel } of userDownloads) {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      // Find latest version of this model
      const [latestModel] = await db
        .select()
        .from(mlModels)
        .where(
          and(
            eq(mlModels.name, currentModel.name),
            eq(mlModels.status, "published"),
            eq(mlModels.variant, currentModel.variant)
          )
        )
        .orderBy(desc(mlModels.version))
        .limit(1);

      if (latestModel && latestModel.version !== currentModel.version) {
        updates.push({ currentModel, latestModel });
      }
    }

    return updates;
  }
}

// Export singleton instance
export const modelRegistry = new ModelRegistryService();
