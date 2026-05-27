/**
 * Database Seeding Script for ML Models
 * 
 * Creates 10 sample ML models with realistic metadata for testing the ML system.
 * Includes models for disease detection, pest identification, and yield prediction
 * across different Nigerian crops (maize, cassava, rice, yam, cocoa).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  mlModels, 
  modelDownloads, 
  modelBenchmarks, 
  communityModels, 
  modelRatings 
} from "../drizzle/schema-ml-models.js";

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/farmer_data";
const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

// Sample models data
const sampleModels = [
  {
    name: "Maize Disease Detector v2.1",
    displayName: "Maize Disease Detector v2.1",
    description: "Advanced deep learning model for detecting common maize diseases including blight, rust, and leaf spot. Trained on 50,000+ images from Nigerian farms.",
    type: "disease_detection" as const,
    supportedCrops: ["maize"],
    version: "2.1.0",
    accuracy: 0.9250,
    modelSize: Math.round(45.6 * 1024 * 1024), // 45.6 MB in bytes
    variant: "full" as const,
    targetDevice: "high" as const,
    modelPath: "models/maize_disease_v2.1.onnx",
    framework: "TensorFlow",
    minStorageMb: 50,
    downloadUrl: "https://storage.example.com/models/maize_disease_v2.1.onnx",
    checksum: "sha256:abc123def456...",
    isPublic: true,
    tags: ["maize", "disease", "blight", "rust", "leaf-spot", "mobile-optimized"],
    metadata: {
      trainingDataset: "Nigerian Maize Disease Dataset 2024",
      trainingImages: 50000,
      classes: ["healthy", "blight", "rust", "leaf_spot", "stem_rot"],
      inputSize: [224, 224, 3],
      framework: "TensorFlow",
      license: "MIT"
    }
  },
  {
    name: "Cassava Pest Identifier",
    displayName: "Cassava Pest Identifier",
    description: "Identifies common cassava pests including mealybugs, whiteflies, and mites. Optimized for edge devices with quantization.",
    type: "pest_identification" as const,
    supportedCrops: ["cassava"],
    version: "1.5.0",
    accuracy: 0.8950,
    modelSize: Math.round(12.3 * 1024 * 1024), // 12.3 MB in bytes
    variant: "quantized" as const,
    targetDevice: "low" as const,
    modelPath: "models/cassava_pest_v1.5_quantized.onnx",
    framework: "PyTorch",
    minStorageMb: 15,
    downloadUrl: "https://storage.example.com/models/cassava_pest_v1.5_quantized.onnx",
    checksum: "sha256:def789ghi012...",
    isPublic: true,
    tags: ["cassava", "pest", "mealybug", "whitefly", "mite", "edge-device"],
    metadata: {
      trainingDataset: "West Africa Cassava Pest Dataset",
      trainingImages: 30000,
      classes: ["healthy", "mealybug", "whitefly", "mite", "grasshopper"],
      inputSize: [192, 192, 3],
      framework: "PyTorch",
      quantization: "INT8",
      license: "Apache-2.0"
    }
  },
  {
    name: "Rice Yield Predictor",
    displayName: "Rice Yield Predictor",
    description: "Predicts rice yield based on farm conditions, weather data, and crop health. Uses ensemble learning for high accuracy.",
    type: "yield_prediction" as const,
    supportedCrops: ["rice"],
    version: "3.0.0",
    accuracy: 0.9100,
    modelSize: Math.round(8.7 * 1024 * 1024), // 8.7 MB in bytes
    variant: "compressed" as const,
    targetDevice: "high" as const,
    modelPath: "models/rice_yield_v3.0_compressed.onnx",
    framework: "scikit-learn",
    minStorageMb: 10,
    downloadUrl: "https://storage.example.com/models/rice_yield_v3.0_compressed.onnx",
    checksum: "sha256:ghi345jkl678...",
    isPublic: true,
    tags: ["rice", "yield", "prediction", "weather", "ensemble", "compressed"],
    metadata: {
      trainingDataset: "Nigerian Rice Yield Dataset 2020-2024",
      trainingRecords: 100000,
      features: ["soil_type", "rainfall", "temperature", "fertilizer", "farm_size"],
      algorithm: "Random Forest + XGBoost Ensemble",
      framework: "scikit-learn",
      license: "MIT"
    }
  },
  {
    name: "Yam Disease Detector",
    displayName: "Yam Disease Detector",
    description: "Detects yam diseases including anthracnose, dry rot, and viral infections. High accuracy model for Nigerian yam varieties.",
    type: "disease_detection" as const,
    supportedCrops: ["yam"],
    version: "1.8.0",
    accuracy: 0.8850,
    modelSize: Math.round(38.2 * 1024 * 1024), // 38.2 MB in bytes
    variant: "full" as const,
    targetDevice: "high" as const,
    modelPath: "models/yam_disease_v1.8.onnx",
    framework: "TensorFlow",
    minStorageMb: 40,
    downloadUrl: "https://storage.example.com/models/yam_disease_v1.8.onnx",
    checksum: "sha256:jkl901mno234...",
    isPublic: true,
    tags: ["yam", "disease", "anthracnose", "dry-rot", "virus", "server"],
    metadata: {
      trainingDataset: "West Africa Yam Disease Dataset",
      trainingImages: 25000,
      classes: ["healthy", "anthracnose", "dry_rot", "viral_infection", "nematode"],
      inputSize: [256, 256, 3],
      framework: "TensorFlow",
      license: "MIT"
    }
  },
  {
    name: "Cocoa Pest & Disease Detector",
    displayName: "Cocoa Pest & Disease Detector",
    description: "Multi-task model detecting both pests and diseases in cocoa plants. Includes black pod disease and cocoa pod borer detection.",
    type: "disease_detection" as const,
    supportedCrops: ["cocoa"],
    version: "2.3.0",
    accuracy: 0.9050,
    modelSize: Math.round(52.1 * 1024 * 1024), // 52.1 MB in bytes
    variant: "full" as const,
    targetDevice: "high" as const,
    modelPath: "models/cocoa_multi_v2.3.onnx",
    framework: "TensorFlow",
    minStorageMb: 55,
    downloadUrl: "https://storage.example.com/models/cocoa_multi_v2.3.onnx",
    checksum: "sha256:mno567pqr890...",
    isPublic: true,
    tags: ["cocoa", "disease", "pest", "black-pod", "pod-borer", "multi-task"],
    metadata: {
      trainingDataset: "Nigerian Cocoa Disease & Pest Dataset",
      trainingImages: 40000,
      classes: ["healthy", "black_pod", "pod_borer", "mirids", "stem_canker"],
      inputSize: [224, 224, 3],
      framework: "TensorFlow",
      multitask: true,
      license: "Apache-2.0"
    }
  },
  {
    name: "Maize Yield Predictor Lite",
    displayName: "Maize Yield Predictor Lite",
    description: "Lightweight yield prediction model for maize. Optimized for feature phones with minimal resource requirements.",
    type: "yield_prediction" as const,
    supportedCrops: ["maize"],
    version: "1.2.0",
    accuracy: 0.8650,
    modelSize: Math.round(2.1 * 1024 * 1024), // 2.1 MB in bytes
    variant: "pruned" as const,
    targetDevice: "low" as const,
    modelPath: "models/maize_yield_lite_v1.2_pruned.onnx",
    framework: "scikit-learn",
    minStorageMb: 5,
    downloadUrl: "https://storage.example.com/models/maize_yield_lite_v1.2_pruned.onnx",
    checksum: "sha256:pqr123stu456...",
    isPublic: true,
    tags: ["maize", "yield", "prediction", "lite", "feature-phone", "pruned"],
    metadata: {
      trainingDataset: "Nigerian Maize Yield Dataset (Simplified)",
      trainingRecords: 50000,
      features: ["farm_size", "rainfall", "fertilizer"],
      algorithm: "Linear Regression + Decision Tree",
      framework: "scikit-learn",
      pruning: "50% weights removed",
      license: "MIT"
    }
  },
  {
    name: "Rice Pest Identifier",
    displayName: "Rice Pest Identifier",
    description: "Identifies common rice pests including stem borers, leaf folders, and planthoppers. Trained on West African rice varieties.",
    type: "pest_identification" as const,
    supportedCrops: ["rice"],
    version: "1.4.0",
    accuracy: 0.8750,
    modelSize: Math.round(15.8 * 1024 * 1024), // 15.8 MB in bytes
    variant: "quantized" as const,
    targetDevice: "high" as const,
    modelPath: "models/rice_pest_v1.4_quantized.onnx",
    framework: "PyTorch",
    minStorageMb: 18,
    downloadUrl: "https://storage.example.com/models/rice_pest_v1.4_quantized.onnx",
    checksum: "sha256:stu789vwx012...",
    isPublic: true,
    tags: ["rice", "pest", "stem-borer", "leaf-folder", "planthopper", "quantized"],
    metadata: {
      trainingDataset: "West Africa Rice Pest Dataset",
      trainingImages: 28000,
      classes: ["healthy", "stem_borer", "leaf_folder", "planthopper", "armyworm"],
      inputSize: [192, 192, 3],
      framework: "PyTorch",
      quantization: "INT8",
      license: "MIT"
    }
  },
  {
    name: "Cassava Disease Detector Pro",
    displayName: "Cassava Disease Detector Pro",
    description: "Professional-grade cassava disease detection model. Detects mosaic virus, brown streak, and bacterial blight with high precision.",
    type: "disease_detection" as const,
    supportedCrops: ["cassava"],
    version: "2.0.0",
    accuracy: 0.9350,
    modelSize: Math.round(48.9 * 1024 * 1024), // 48.9 MB in bytes
    variant: "full" as const,
    targetDevice: "high" as const,
    modelPath: "models/cassava_disease_pro_v2.0.onnx",
    framework: "TensorFlow",
    minStorageMb: 52,
    downloadUrl: "https://storage.example.com/models/cassava_disease_pro_v2.0.onnx",
    checksum: "sha256:vwx345yza678...",
    isPublic: true,
    tags: ["cassava", "disease", "mosaic-virus", "brown-streak", "bacterial-blight", "professional"],
    metadata: {
      trainingDataset: "African Cassava Disease Dataset 2024",
      trainingImages: 60000,
      classes: ["healthy", "mosaic_virus", "brown_streak", "bacterial_blight", "root_rot"],
      inputSize: [256, 256, 3],
      framework: "TensorFlow",
      ensemble: true,
      license: "Apache-2.0"
    }
  },
  {
    name: "Multi-Crop Disease Detector",
    displayName: "Multi-Crop Disease Detector",
    description: "Universal disease detection model supporting maize, cassava, rice, yam, and cocoa. Single model for multiple crops.",
    type: "disease_detection" as const,
    supportedCrops: ["maize", "cassava", "rice", "yam", "cocoa"],
    version: "1.0.0",
    accuracy: 0.8550,
    modelSize: Math.round(65.3 * 1024 * 1024), // 65.3 MB in bytes
    variant: "full" as const,
    targetDevice: "high" as const,
    modelPath: "models/multi_crop_disease_v1.0.onnx",
    framework: "TensorFlow",
    minStorageMb: 70,
    downloadUrl: "https://storage.example.com/models/multi_crop_disease_v1.0.onnx",
    checksum: "sha256:yza901bcd234...",
    isPublic: true,
    tags: ["multi-crop", "disease", "universal", "maize", "cassava", "rice", "yam", "cocoa"],
    metadata: {
      trainingDataset: "Nigerian Multi-Crop Disease Dataset",
      trainingImages: 150000,
      crops: ["maize", "cassava", "rice", "yam", "cocoa"],
      classes: 25,
      inputSize: [256, 256, 3],
      framework: "TensorFlow",
      transferLearning: "ResNet50 backbone",
      license: "MIT"
    }
  },
  {
    name: "Essential Model Pack",
    displayName: "Essential Model Pack",
    description: "Bundled model pack containing the most essential models for Nigerian farmers: maize disease, cassava pest, and rice yield prediction.",
    type: "disease_detection" as const,
    supportedCrops: ["maize", "cassava", "rice", "yam", "cocoa"],
    version: "1.0.0",
    accuracy: 0.9000,
    modelSize: Math.round(66.6 * 1024 * 1024), // 66.6 MB in bytes (sum of 3 models)
    variant: "compressed" as const,
    targetDevice: "high" as const,
    modelPath: "models/essential_pack_v1.0.zip",
    framework: "onnx",
    minStorageMb: 70,
    downloadUrl: "https://storage.example.com/models/essential_pack_v1.0.zip",
    checksum: "sha256:bcd567efg890...",
    isPublic: true,
    tags: ["model-pack", "essential", "bundle", "maize", "cassava", "rice", "starter"],
    metadata: {
      packContents: [
        "maize_disease_v2.1_compressed.onnx",
        "cassava_pest_v1.5_quantized.onnx",
        "rice_yield_v3.0_compressed.onnx"
      ],
      totalModels: 3,
      packType: "essential",
      license: "MIT"
    }
  }
];

async function seedDatabase() {
  console.log("🌱 Starting ML models database seeding...\n");

  try {
    // Insert models
    console.log("📦 Inserting sample ML models...");
    const insertedModels = await db.insert(mlModels).values(sampleModels).returning();
    console.log(`✅ Inserted ${insertedModels.length} models\n`);

    // Create benchmarks using actual model IDs
    const sampleBenchmarks = [
      {
        modelId: insertedModels[0].id, // Maize Disease Detector
    benchmarkName: "Nigerian Maize Disease Test 2024",
    datasetName: "Nigerian Maize Disease Test Set",
    datasetSize: 5000,
    accuracy: Math.round(0.9250 * 10000), // 9250 = 92.50%
    precision: Math.round(0.9180 * 10000),
    recall: Math.round(0.9310 * 10000),
    f1Score: Math.round(0.9245 * 10000),
    avgInferenceMs: 150,
    comparisonTarget: "Plantix",
    comparisonAccuracy: Math.round(0.8900 * 10000),
    accuracyDelta: Math.round((0.9250 - 0.8900) * 10000), // +350 = +3.5%
    notes: "Tested on Nigerian Maize Disease Test Set 2024. +3.5% accuracy improvement over Plantix."
  },
  {
    modelId: insertedModels[1].id, // Cassava Pest Identifier
    benchmarkName: "West Africa Cassava Pest Test 2024",
    datasetName: "West Africa Cassava Pest Test Set",
    datasetSize: 3000,
    accuracy: Math.round(0.8950 * 10000),
    precision: Math.round(0.8820 * 10000),
    recall: Math.round(0.9080 * 10000),
    f1Score: Math.round(0.8948 * 10000),
    avgInferenceMs: 80,
    comparisonTarget: "Plantix",
    comparisonAccuracy: Math.round(0.8600 * 10000),
    accuracyDelta: Math.round((0.8950 - 0.8600) * 10000),
    notes: "Edge-optimized model with minimal accuracy loss. +3.5% better than Plantix."
  },
  {
    modelId: insertedModels[2].id, // Rice Yield Predictor
    benchmarkName: "Nigerian Rice Yield Prediction Test 2024",
    datasetName: "Nigerian Rice Yield Test Set",
    datasetSize: 10000,
    accuracy: Math.round(0.9100 * 10000),
    precision: Math.round(0.9050 * 10000),
    recall: Math.round(0.9150 * 10000),
    f1Score: Math.round(0.9100 * 10000),
    avgInferenceMs: 50,
    comparisonTarget: "Climate FieldView",
    comparisonAccuracy: Math.round(0.8750 * 10000),
    accuracyDelta: Math.round((0.9100 - 0.8750) * 10000),
    notes: "Ensemble model with weather integration. +3.5% improvement over FieldView."
  },
  {
    modelId: insertedModels[4].id, // Cocoa Pest & Disease Detector
    benchmarkName: "Nigerian Cocoa Disease Test 2024",
    datasetName: "Nigerian Cocoa Disease Test Set",
    datasetSize: 4000,
    accuracy: Math.round(0.9050 * 10000),
    precision: Math.round(0.8980 * 10000),
    recall: Math.round(0.9120 * 10000),
    f1Score: Math.round(0.9050 * 10000),
    avgInferenceMs: 180,
    comparisonTarget: "Plantix",
    comparisonAccuracy: Math.round(0.8700 * 10000),
    accuracyDelta: Math.round((0.9050 - 0.8700) * 10000),
    notes: "Multi-task learning model. +3.5% accuracy advantage."
  },
  {
    modelId: insertedModels[7].id, // Cassava Disease Detector Pro
    benchmarkName: "African Cassava Disease Test 2024",
    datasetName: "African Cassava Disease Test Set",
    datasetSize: 6000,
    accuracy: Math.round(0.9350 * 10000),
    precision: Math.round(0.9280 * 10000),
    recall: Math.round(0.9420 * 10000),
    f1Score: Math.round(0.9349 * 10000),
    avgInferenceMs: 200,
    comparisonTarget: "Plantix",
    comparisonAccuracy: Math.round(0.9000 * 10000),
    accuracyDelta: Math.round((0.9350 - 0.9000) * 10000),
    notes: "Professional-grade model with ensemble learning. +3.5% improvement."
  }
];

    // Insert benchmarks
    console.log("📊 Inserting benchmark data...");
    const insertedBenchmarks = await db.insert(modelBenchmarks).values(sampleBenchmarks).returning();
    console.log(`✅ Inserted ${insertedBenchmarks.length} benchmarks\n`);

    // Skip ratings for now - they require existing users
    // Users can add ratings through the UI after logging in
    console.log("ℹ️ Skipping ratings (requires existing users)\n");

    console.log("✨ Database seeding completed successfully!\n");
    console.log("📋 Summary:");
    console.log(`   - Models: ${insertedModels.length}`);
    console.log(`   - Benchmarks: ${insertedBenchmarks.length}`);
    console.log(`   - Ratings: 0 (skipped - add through UI)`);
    console.log(`   - Total accuracy advantage: +3.5% vs Plantix`);
    console.log(`   - Crop types: maize, cassava, rice, yam, cocoa, general`);
    console.log(`   - Model variants: full, quantized, pruned, compressed`);
    console.log(`   - Device support: high, low\n`);

  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run seeding
seedDatabase()
  .then(() => {
    console.log("🎉 Seeding script finished successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Seeding script failed:", error);
    process.exit(1);
  });
