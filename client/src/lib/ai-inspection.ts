/**
 * Client-side AI Inspection API utilities.
 *
 * Calls the Python AI Inspection service (PaddleOCR + VLM + Docling + Ollama-Qwen + YOLOv8 + SAM2 + DINOv2)
 * for produce quality analysis, detection, segmentation, and grade recommendation.
 */

const AI_INSPECTION_URL = import.meta.env.VITE_AI_INSPECTION_URL || "http://localhost:8110";

export interface AIInspectionRequest {
  batch_id: string;
  crop_type: string;
  quantity_kg: number;
  farmer_name: string;
  image_base64?: string;
  moisture_reading?: number;
  foreign_matter_reading?: number;
}

export interface OCRLabel {
  field: string;
  value: string;
  confidence?: number;
}

export interface DefectInfo {
  type: string;
  severity: "minor" | "moderate" | "severe";
  affected_percentage: number;
  description: string;
}

export interface GradeFactor {
  factor: string;
  value: string;
  impact: "positive" | "neutral" | "negative";
  weight: number;
}

export interface AIInspectionResult {
  batch_id: string;
  inspection_id: string;
  timestamp: string;
  crop_type: string;
  farmer_name: string;

  ocr_labels: OCRLabel[];
  ocr_certificates: OCRLabel[];

  visual_quality: {
    overall_score?: number;
    freshness?: number;
    cleanliness?: number;
    uniformity?: number;
    moisture_visual_estimate?: number;
    foreign_matter_visual_estimate?: number;
  };
  defects_detected: DefectInfo[];
  color_analysis: {
    dominant_color?: string;
    uniformity_score?: number;
    expected_color_match?: number;
    abnormal_areas?: string;
  };
  ripeness_score: number | null;

  // CV pipeline results (YOLOv8 + SAM2 + DINOv2)
  cv_detections: Array<{
    class: string;
    confidence: number;
    bbox: number[];
    bbox_normalized: number[];
  }>;
  cv_segmentation: {
    segments?: Array<{
      bbox: number[];
      mask_area_pixels: number;
      mask_percentage: number;
      score: number;
    }>;
    total_mask_area?: number;
    model?: string;
  };
  cv_grade_classification: {
    predicted_grade?: string;
    confidence?: number;
    grade_probabilities?: Record<string, number>;
    feature_vector_dim?: number;
    model?: string;
  };
  cv_summary: {
    items_detected?: number;
    defects_found?: number;
    defect_area_percentage?: number;
    predicted_grade?: string;
    grade_confidence?: number;
    models_used?: string[];
  };

  moisture_content: number | null;
  foreign_matter: number | null;

  recommended_grade: string;
  grade_confidence: number;
  grade_reasoning: string;
  grade_factors: GradeFactor[];

  processing_time_ms: number;
  models_used: string[];
}

export interface AIHealthStatus {
  status: string;
  service: string;
  version: string;
  models: Record<string, string>;
  uptime_seconds: number;
}

export async function checkAIHealth(): Promise<AIHealthStatus | null> {
  try {
    const resp = await fetch(`${AI_INSPECTION_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) return resp.json();
    return null;
  } catch (err) {
    console.warn('[AIInspection] Health check failed:', String(err));
    return null;
  }
}

export async function runAIInspection(request: AIInspectionRequest): Promise<AIInspectionResult> {
  const resp = await fetch(`${AI_INSPECTION_URL}/inspect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) {
    const error = await resp.json().catch(() => ({ detail: "AI inspection failed" }));
    throw new Error(error.detail || `AI inspection failed (${resp.status})`);
  }
  return resp.json();
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
