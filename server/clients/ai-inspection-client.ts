/**
 * AI Inspection Service Client
 *
 * TypeScript client for communicating with the Python AI Inspection service.
 * Combines PaddleOCR, VLM, Docling, Ollama-Qwen, YOLOv8, SAM2, and DINOv2
 * for AI-powered produce inspection, detection, segmentation, and grading.
 *
 * Service runs on port 8110 (configured via AI_INSPECTION_SERVICE_URL)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================================================
// Types
// ============================================================================

export interface InspectionRequest {
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
  severity: 'minor' | 'moderate' | 'severe';
  affected_percentage: number;
  description: string;
}

export interface GradeFactor {
  factor: string;
  value: string;
  impact: 'positive' | 'neutral' | 'negative';
  weight: number;
}

export interface InspectionResult {
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
    segments?: Array<{ bbox: number[]; mask_area_pixels: number; mask_percentage: number; score: number }>;
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

export interface DocumentParseRequest {
  document_base64: string;
  document_type: string;
}

export interface DocumentParseResult {
  document_id: string;
  document_type: string;
  extracted_fields: Record<string, string>;
  tables: Array<{ headers: string[]; rows: string[][] }>;
  raw_text: string;
  confidence: number;
  processing_time_ms: number;
}

export interface AIInspectionHealth {
  status: string;
  service: string;
  version: string;
  models: Record<string, string> & {
    paddleocr: string;
    vlm: string;
    docling: string;
    ollama_qwen: string;
  };
  uptime_seconds: number;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 3,
      resetTimeoutMs: config?.resetTimeoutMs ?? 30000,
      halfOpenRequests: config?.halfOpenRequests ?? 1,
    };
  }

  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }
    // HALF_OPEN
    return this.halfOpenAttempts < this.config.halfOpenRequests;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  getState(): string {
    return this.state;
  }
}

// ============================================================================
// AI Inspection Client
// ============================================================================

export class AIInspectionClient {
  private client: AxiosInstance;
  private baseURL: string;
  private circuitBreaker: CircuitBreaker;

  constructor(baseURL?: string, timeout: number = 60000) {
    this.baseURL = baseURL || process.env.AI_INSPECTION_SERVICE_URL || 'http://localhost:8110';
    this.circuitBreaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30000 });

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.response.use(
      response => response,
      error => this.handleError(error),
    );
  }

  private handleError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as Record<string, string>;
      throw new Error(`AI Inspection Error (${status}): ${data?.detail || data?.message || error.message}`);
    } else if (error.request) {
      throw new Error(`AI Inspection Service unavailable at ${this.baseURL}`);
    }
    throw new Error(`AI Inspection Request Error: ${error.message}`);
  }

  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.circuitBreaker.canExecute()) {
      throw new Error('AI Inspection Service circuit breaker is OPEN — service temporarily unavailable');
    }
    try {
      const result = await fn();
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    }
  }

  async healthCheck(): Promise<AIInspectionHealth> {
    return this.execute(async () => {
      const resp = await this.client.get<AIInspectionHealth>('/health');
      return resp.data;
    });
  }

  /**
   * Full AI inspection pipeline: OCR + VLM + LLM grading.
   * Accepts batch info + optional image + sensor readings.
   */
  async inspectProduce(request: InspectionRequest): Promise<InspectionResult> {
    return this.execute(async () => {
      const resp = await this.client.post<InspectionResult>('/inspect', request);
      return resp.data;
    });
  }

  /**
   * Parse a farm document (certificate, receipt, invoice) using Docling.
   */
  async parseDocument(request: DocumentParseRequest): Promise<DocumentParseResult> {
    return this.execute(async () => {
      const resp = await this.client.post<DocumentParseResult>('/document/parse', request);
      return resp.data;
    });
  }

  /**
   * Standalone LLM grade recommendation from sensor data (no image).
   */
  async recommendGrade(cropType: string, moisture?: number, foreignMatter?: number): Promise<{
    status: string;
    result: {
      grade: string;
      confidence: number;
      reasoning: string;
      factors: GradeFactor[];
    };
  }> {
    return this.execute(async () => {
      const formData = new URLSearchParams();
      formData.append('crop_type', cropType);
      if (moisture !== undefined) formData.append('moisture', String(moisture));
      if (foreignMatter !== undefined) formData.append('foreign_matter', String(foreignMatter));
      const resp = await this.client.post('/grade/recommend', formData.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      return resp.data;
    });
  }

  getCircuitState(): string {
    return this.circuitBreaker.getState();
  }
}

// Singleton instance
export const aiInspectionClient = new AIInspectionClient();
