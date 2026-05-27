import { integer, pgEnum, pgTable, text, timestamp, varchar, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./schema.js";

/**
 * AI/ML Model Management Schema
 * 
 * This schema supports:
 * 1. Pre-trained Model Library - Downloadable model packs
 * 2. Hybrid Mode - Local inference with cloud sync
 * 3. Accuracy Benchmarking - Model performance tracking
 * 4. Community Model Sharing - User-contributed models
 * 5. Edge Optimization - Model variants for different devices
 */

// Model types
export const modelTypeEnum = pgEnum("model_type", [
  "disease_detection",
  "pest_identification",
  "yield_prediction",
  "price_forecasting",
  "crop_recommendation",
  "soil_analysis",
  "weed_detection",
  "quality_assessment",
  "growth_stage",
  "nutrient_deficiency"
]);

// Model status
export const modelStatusEnum = pgEnum("model_status", [
  "draft",
  "training",
  "testing",
  "published",
  "deprecated",
  "archived"
]);

// Model variant types
export const modelVariantEnum = pgEnum("model_variant", [
  "full",        // Full model (server/desktop)
  "quantized",   // INT8 quantized (mobile)
  "pruned",      // Pruned model (edge devices)
  "compressed",  // Compressed model (low bandwidth)
  "distilled"    // Knowledge distilled (ultra-light)
]);

// Device capability levels
export const deviceCapabilityEnum = pgEnum("device_capability", [
  "high",      // Desktop/Server (8GB+ RAM, GPU)
  "medium",    // Modern smartphone (4-8GB RAM)
  "low",       // Budget smartphone (2-4GB RAM)
  "minimal"    // Feature phone/very low-end (< 2GB RAM)
]);

/**
 * ML Models Table
 * Stores metadata for all AI/ML models (pre-trained, community, custom)
 */
export const mlModels = pgTable("ml_models", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  // Model identification
  name: varchar("name", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 50 }).notNull(), // e.g., "1.0.0", "2.1.3"
  
  // Model type and status
  type: modelTypeEnum("type").notNull(),
  status: modelStatusEnum("status").notNull().default("draft"),
  
  // Model variant
  variant: modelVariantEnum("variant").notNull().default("full"),
  targetDevice: deviceCapabilityEnum("target_device").notNull().default("high"),
  
  // Model files
  modelPath: text("model_path").notNull(), // S3 path or local path
  modelSize: integer("model_size").notNull(), // Size in bytes
  checksum: varchar("checksum", { length: 64 }).notNull(), // SHA-256 hash
  
  // Model configuration
  framework: varchar("framework", { length: 50 }).notNull(), // "ollama", "tensorflow", "pytorch", "onnx"
  inputShape: jsonb("input_shape"), // e.g., {"width": 224, "height": 224, "channels": 3}
  outputShape: jsonb("output_shape"), // e.g., {"classes": 10}
  
  // Training metadata
  trainedOn: jsonb("trained_on"), // Dataset info: {name, size, crops, regions}
  trainingMetrics: jsonb("training_metrics"), // {accuracy, loss, f1_score, etc.}
  hyperparameters: jsonb("hyperparameters"), // Training hyperparameters
  
  // Supported crops and regions
  supportedCrops: jsonb("supported_crops").$type<string[]>(), // ["maize", "cassava", "rice"]
  supportedRegions: jsonb("supported_regions").$type<string[]>(), // ["west_africa", "east_africa"]
  supportedLanguages: jsonb("supported_languages").$type<string[]>(), // ["en", "ha", "yo", "ig"]
  
  // Performance requirements
  minRamMb: integer("min_ram_mb").notNull().default(512),
  minStorageMb: integer("min_storage_mb").notNull(),
  avgInferenceMs: integer("avg_inference_ms"), // Average inference time in milliseconds
  
  // Ownership
  isOfficial: boolean("is_official").notNull().default(false), // Official pre-trained model
  authorId: integer("author_id").references(() => users.id), // Community model author
  
  // Usage statistics
  downloadCount: integer("download_count").notNull().default(0),
  usageCount: integer("usage_count").notNull().default(0),
  rating: integer("rating").default(0), // Average rating (0-5 stars × 100)
  ratingCount: integer("rating_count").notNull().default(0),
  
  // Metadata
  tags: jsonb("tags").$type<string[]>(), // ["beginner-friendly", "high-accuracy", "offline"]
  license: varchar("license", { length: 100 }), // "MIT", "Apache-2.0", "Proprietary"
  documentation: text("documentation"), // Markdown documentation
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
  deprecatedAt: timestamp("deprecated_at"),
}, (table) => ({
  nameVersionIdx: index("ml_models_name_version_idx").on(table.name, table.version),
  typeIdx: index("ml_models_type_idx").on(table.type),
  statusIdx: index("ml_models_status_idx").on(table.status),
  variantIdx: index("ml_models_variant_idx").on(table.variant),
  authorIdx: index("ml_models_author_idx").on(table.authorId),
  officialIdx: index("ml_models_official_idx").on(table.isOfficial),
}));

/**
 * Model Downloads Table
 * Tracks model downloads for analytics and usage patterns
 */
export const modelDownloads = pgTable("model_downloads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  modelId: integer("model_id").references(() => mlModels.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Download metadata
  downloadedAt: timestamp("downloaded_at").defaultNow().notNull(),
  deviceInfo: jsonb("device_info"), // {os, ram, storage, cpu}
  downloadDurationMs: integer("download_duration_ms"),
  
  // Installation status
  installed: boolean("installed").notNull().default(false),
  installedAt: timestamp("installed_at"),
  installationError: text("installation_error"),
  
  // Usage tracking
  firstUsedAt: timestamp("first_used_at"),
  lastUsedAt: timestamp("last_used_at"),
  usageCount: integer("usage_count").notNull().default(0),
}, (table) => ({
  modelIdx: index("model_downloads_model_idx").on(table.modelId),
  userIdx: index("model_downloads_user_idx").on(table.userId),
  downloadedAtIdx: index("model_downloads_downloaded_at_idx").on(table.downloadedAt),
}));

/**
 * Model Benchmarks Table
 * Stores accuracy and performance benchmarks for models
 */
export const modelBenchmarks = pgTable("model_benchmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  modelId: integer("model_id").references(() => mlModels.id, { onDelete: "cascade" }).notNull(),
  
  // Benchmark metadata
  benchmarkName: varchar("benchmark_name", { length: 255 }).notNull(), // "Plantix Comparison", "Field Test Nigeria"
  datasetName: varchar("dataset_name", { length: 255 }).notNull(),
  datasetSize: integer("dataset_size").notNull(), // Number of samples
  
  // Accuracy metrics
  accuracy: integer("accuracy").notNull(), // Accuracy × 10000 (e.g., 9250 = 92.50%)
  precision: integer("precision"), // Precision × 10000
  recall: integer("recall"), // Recall × 10000
  f1Score: integer("f1_score"), // F1 Score × 10000
  
  // Performance metrics
  avgInferenceMs: integer("avg_inference_ms").notNull(),
  p50InferenceMs: integer("p50_inference_ms"),
  p95InferenceMs: integer("p95_inference_ms"),
  p99InferenceMs: integer("p99_inference_ms"),
  
  // Resource usage
  peakMemoryMb: integer("peak_memory_mb"),
  avgCpuPercent: integer("avg_cpu_percent"),
  
  // Comparison metrics (vs competitors)
  comparisonTarget: varchar("comparison_target", { length: 100 }), // "Plantix", "FieldView"
  comparisonAccuracy: integer("comparison_accuracy"), // Competitor accuracy × 10000
  accuracyDelta: integer("accuracy_delta"), // Difference × 10000 (positive = better)
  
  // Detailed results
  confusionMatrix: jsonb("confusion_matrix"), // Confusion matrix data
  perClassMetrics: jsonb("per_class_metrics"), // Metrics per crop/disease class
  failureCases: jsonb("failure_cases"), // Examples of failure cases
  
  // Test environment
  deviceInfo: jsonb("device_info"), // Device used for benchmark
  testConditions: jsonb("test_conditions"), // {lighting, image_quality, etc.}
  
  // Metadata
  conductedBy: integer("conducted_by").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  modelIdx: index("model_benchmarks_model_idx").on(table.modelId),
  accuracyIdx: index("model_benchmarks_accuracy_idx").on(table.accuracy),
  createdAtIdx: index("model_benchmarks_created_at_idx").on(table.createdAt),
}));

/**
 * Community Models Table
 * Additional metadata for community-contributed models
 */
export const communityModels = pgTable("community_models", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  modelId: integer("model_id").references(() => mlModels.id, { onDelete: "cascade" }).notNull().unique(),
  
  // Submission metadata
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  submittedBy: integer("submitted_by").references(() => users.id).notNull(),
  
  // Review status
  reviewStatus: varchar("review_status", { length: 50 }).notNull().default("pending"), // pending, approved, rejected
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Community feedback
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  reportCount: integer("report_count").notNull().default(0),
  
  // Featured status
  isFeatured: boolean("is_featured").notNull().default(false),
  featuredAt: timestamp("featured_at"),
  featuredUntil: timestamp("featured_until"),
  
  // Training details
  trainingDuration: integer("training_duration"), // Hours
  trainingCost: integer("training_cost"), // Cost in cents
  trainingDataSource: text("training_data_source"),
  
  // Metadata
  changelog: text("changelog"), // Version changelog
  knownIssues: text("known_issues"),
}, (table) => ({
  modelIdx: index("community_models_model_idx").on(table.modelId),
  submittedByIdx: index("community_models_submitted_by_idx").on(table.submittedBy),
  reviewStatusIdx: index("community_models_review_status_idx").on(table.reviewStatus),
  featuredIdx: index("community_models_featured_idx").on(table.isFeatured),
}));

/**
 * Model Sync Queue Table
 * Manages hybrid sync between local models and cloud updates
 */
export const modelSyncQueue = pgTable("model_sync_queue", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  modelId: integer("model_id").references(() => mlModels.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  
  // Sync metadata
  syncType: varchar("sync_type", { length: 50 }).notNull(), // "download", "update", "delete"
  priority: integer("priority").notNull().default(5), // 1 (highest) to 10 (lowest)
  
  // Sync status
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, in_progress, completed, failed
  progress: integer("progress").notNull().default(0), // Progress percentage (0-100)
  
  // Version control
  currentVersion: varchar("current_version", { length: 50 }),
  targetVersion: varchar("target_version", { length: 50 }).notNull(),
  
  // Network requirements
  requiresWifi: boolean("requires_wifi").notNull().default(true),
  estimatedSizeMb: integer("estimated_size_mb"),
  
  // Retry logic
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextAttemptAt: timestamp("next_attempt_at"),
  
  // Error handling
  errorMessage: text("error_message"),
  errorCode: varchar("error_code", { length: 50 }),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  modelUserIdx: index("model_sync_queue_model_user_idx").on(table.modelId, table.userId),
  statusIdx: index("model_sync_queue_status_idx").on(table.status),
  priorityIdx: index("model_sync_queue_priority_idx").on(table.priority),
  nextAttemptIdx: index("model_sync_queue_next_attempt_idx").on(table.nextAttemptAt),
}));

/**
 * Model Ratings Table
 * User ratings and reviews for models
 */
export const modelRatings = pgTable("model_ratings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  modelId: integer("model_id").references(() => mlModels.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  
  // Rating
  rating: integer("rating").notNull(), // 1-5 stars
  review: text("review"),
  
  // Feedback categories
  accuracyRating: integer("accuracy_rating"), // 1-5
  speedRating: integer("speed_rating"), // 1-5
  easeOfUseRating: integer("ease_of_use_rating"), // 1-5
  
  // Usage context
  usedFor: varchar("used_for", { length: 100 }), // "disease_detection", "yield_prediction"
  cropsTested: jsonb("crops_tested").$type<string[]>(),
  deviceUsed: jsonb("device_used"), // Device info
  
  // Helpfulness
  helpfulCount: integer("helpful_count").notNull().default(0),
  notHelpfulCount: integer("not_helpful_count").notNull().default(0),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  modelUserIdx: index("model_ratings_model_user_idx").on(table.modelId, table.userId),
  ratingIdx: index("model_ratings_rating_idx").on(table.rating),
  createdAtIdx: index("model_ratings_created_at_idx").on(table.createdAt),
}));

// Type exports
export type MlModel = typeof mlModels.$inferSelect;
export type InsertMlModel = typeof mlModels.$inferInsert;

export type ModelDownload = typeof modelDownloads.$inferSelect;
export type InsertModelDownload = typeof modelDownloads.$inferInsert;

export type ModelBenchmark = typeof modelBenchmarks.$inferSelect;
export type InsertModelBenchmark = typeof modelBenchmarks.$inferInsert;

export type CommunityModel = typeof communityModels.$inferSelect;
export type InsertCommunityModel = typeof communityModels.$inferInsert;

export type ModelSyncQueue = typeof modelSyncQueue.$inferSelect;
export type InsertModelSyncQueue = typeof modelSyncQueue.$inferInsert;

export type ModelRating = typeof modelRatings.$inferSelect;
export type InsertModelRating = typeof modelRatings.$inferInsert;
