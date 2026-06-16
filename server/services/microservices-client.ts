import { logger } from '../logger.js';
/**
 * Microservices Client
 * 
 * Provides TypeScript clients for invoking Go and Python microservices.
 * All calls are idempotent and include proper error handling.
 */

// Service URLs from environment
const LOAN_ORCHESTRATOR_URL = process.env.LOAN_ORCHESTRATOR_URL || 'http://localhost:8010';
const IMAGE_SERVICE_URL = process.env.IMAGE_SERVICE_URL || 'http://localhost:8011';
const REALTIME_SERVICE_URL = process.env.REALTIME_SERVICE_URL || 'http://localhost:8012';
const LOAN_WORKER_URL = process.env.LOAN_WORKER_URL || 'http://localhost:8020';
const OLLAMA_SERVICE_URL = process.env.OLLAMA_SERVICE_URL || 'http://localhost:8021';
const LAKEHOUSE_SERVICE_URL = process.env.LAKEHOUSE_SERVICE_URL || 'http://localhost:8022';
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

// Types
export interface LoanApplication {
  id: number;
  farmerId: number;
  amount: number;
  purpose: string;
  termMonths: number;
  status: string;
  createdAt: string;
  approvedAt?: string;
  disbursedAt?: string;
}

export interface ServiceHealth {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  latency?: number;
}

// Generic HTTP client with timeout and error handling
async function httpRequest<T>(
  url: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    timeout?: number;
  } = {}
): Promise<T | null> {
  const { method = 'GET', body, timeout = 5000 } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.error(`[MicroservicesClient] HTTP ${response.status} from ${url}`);
      return null;
    }
    
    return await response.json() as T;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      logger.error(`[MicroservicesClient] Timeout calling ${url}`);
    } else {
      logger.error(`[MicroservicesClient] Error calling ${url}:`, error);
    }
    return null;
  }
}

// ============================================
// Loan Orchestrator Client (Go)
// ============================================

export const loanOrchestratorClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${LOAN_ORCHESTRATOR_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'loan-orchestrator',
      latency: Date.now() - start,
    };
  },

  /**
   * Apply for a loan (idempotent)
   */
  async applyForLoan(
    farmerId: number,
    amount: number,
    purpose: string,
    termMonths: number
  ): Promise<LoanApplication | null> {
    return httpRequest<LoanApplication>(`${LOAN_ORCHESTRATOR_URL}/loans/apply`, {
      method: 'POST',
      body: { farmerId, amount, purpose, termMonths },
    });
  },

  /**
   * Approve a loan (idempotent)
   */
  async approveLoan(applicationId: number, approverId: number): Promise<LoanApplication | null> {
    return httpRequest<LoanApplication>(`${LOAN_ORCHESTRATOR_URL}/loans/approve`, {
      method: 'POST',
      body: { applicationId, approverId },
    });
  },

  /**
   * Disburse a loan (idempotent)
   */
  async disburseLoan(applicationId: number, disburserId: number): Promise<LoanApplication | null> {
    return httpRequest<LoanApplication>(`${LOAN_ORCHESTRATOR_URL}/loans/disburse`, {
      method: 'POST',
      body: { applicationId, disburserId },
    });
  },

  /**
   * Get loan application by ID
   */
  async getLoanApplication(applicationId: number): Promise<LoanApplication | null> {
    return httpRequest<LoanApplication>(`${LOAN_ORCHESTRATOR_URL}/loans/${applicationId}`);
  },
};

// ============================================
// Image Service Client (Go)
// ============================================

export const imageServiceClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${IMAGE_SERVICE_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'image-service',
      latency: Date.now() - start,
    };
  },

  /**
   * Process an image (resize, optimize)
   */
  async processImage(
    imageUrl: string,
    options: { width?: number; height?: number; quality?: number } = {}
  ): Promise<{ url: string } | null> {
    return httpRequest<{ url: string }>(`${IMAGE_SERVICE_URL}/process`, {
      method: 'POST',
      body: { imageUrl, ...options },
    });
  },

  /**
   * Generate thumbnail
   */
  async generateThumbnail(imageUrl: string, size: number = 150): Promise<{ url: string } | null> {
    return httpRequest<{ url: string }>(`${IMAGE_SERVICE_URL}/thumbnail`, {
      method: 'POST',
      body: { imageUrl, size },
    });
  },
};

// ============================================
// Realtime Service Client (Go)
// ============================================

export const realtimeServiceClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${REALTIME_SERVICE_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'realtime-service',
      latency: Date.now() - start,
    };
  },

  /**
   * Broadcast event to connected clients
   */
  async broadcast(channel: string, event: string, data: unknown): Promise<boolean> {
    const result = await httpRequest<{ success: boolean }>(`${REALTIME_SERVICE_URL}/broadcast`, {
      method: 'POST',
      body: { channel, event, data },
    });
    return result?.success ?? false;
  },

  /**
   * Send event to specific user
   */
  async sendToUser(userId: number, event: string, data: unknown): Promise<boolean> {
    const result = await httpRequest<{ success: boolean }>(`${REALTIME_SERVICE_URL}/send`, {
      method: 'POST',
      body: { userId, event, data },
    });
    return result?.success ?? false;
  },
};

// ============================================
// Loan Worker Client (Python)
// ============================================

export const loanWorkerClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${LOAN_WORKER_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'loan-worker',
      latency: Date.now() - start,
    };
  },

  /**
   * Apply for a loan (Python implementation)
   */
  async applyForLoan(
    farmerId: number,
    amount: number,
    purpose: string,
    termMonths: number
  ): Promise<LoanApplication | null> {
    return httpRequest<LoanApplication>(`${LOAN_WORKER_URL}/loans/apply`, {
      method: 'POST',
      body: { farmer_id: farmerId, amount, purpose, term_months: termMonths },
    });
  },
};

// ============================================
// Ollama Service Client (Python)
// ============================================

export const ollamaServiceClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${OLLAMA_SERVICE_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'ollama-service',
      latency: Date.now() - start,
    };
  },

  /**
   * Generate text completion
   */
  async generate(prompt: string, model: string = 'llama2'): Promise<{ response: string } | null> {
    return httpRequest<{ response: string }>(`${OLLAMA_SERVICE_URL}/generate`, {
      method: 'POST',
      body: { prompt, model },
      timeout: 30000, // LLM calls can be slow
    });
  },

  /**
   * Analyze agricultural data
   */
  async analyzeAgricultural(data: unknown): Promise<{ analysis: string } | null> {
    return httpRequest<{ analysis: string }>(`${OLLAMA_SERVICE_URL}/analyze/agricultural`, {
      method: 'POST',
      body: { data },
      timeout: 30000,
    });
  },
};

// ============================================
// Lakehouse Service Client (Python)
// ============================================

export const lakehouseServiceClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${LAKEHOUSE_SERVICE_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'lakehouse-service',
      latency: Date.now() - start,
    };
  },

  /**
   * Ingest data into lakehouse
   */
  async ingest(table: string, data: unknown[]): Promise<{ count: number } | null> {
    return httpRequest<{ count: number }>(`${LAKEHOUSE_SERVICE_URL}/ingest`, {
      method: 'POST',
      body: { table, data },
    });
  },

  /**
   * Query data from lakehouse
   */
  async query(sql: string): Promise<{ rows: unknown[] } | null> {
    return httpRequest<{ rows: unknown[] }>(`${LAKEHOUSE_SERVICE_URL}/query`, {
      method: 'POST',
      body: { sql },
    });
  },

  /**
   * Get feature store data for ML
   */
  async getFeatures(entityType: string, entityId: number): Promise<{ features: Record<string, unknown> } | null> {
    return httpRequest<{ features: Record<string, unknown> }>(`${LAKEHOUSE_SERVICE_URL}/features/${entityType}/${entityId}`);
  },
};

// ============================================
// ML Service Client (Python)
// ============================================

export const mlServiceClient = {
  /**
   * Check service health
   */
  async health(): Promise<ServiceHealth> {
    const start = Date.now();
    const result = await httpRequest<{ status: string }>(`${ML_SERVICE_URL}/health`);
    return {
      status: result ? 'ok' : 'error',
      service: 'ml-service',
      latency: Date.now() - start,
    };
  },

  /**
   * Predict crop yield
   */
  async predictYield(
    cropType: string,
    farmSize: number,
    soilType: string,
    rainfall: number
  ): Promise<{ yield: number; confidence: number } | null> {
    return httpRequest<{ yield: number; confidence: number }>(`${ML_SERVICE_URL}/predict/yield`, {
      method: 'POST',
      body: { crop_type: cropType, farm_size: farmSize, soil_type: soilType, rainfall },
    });
  },

  /**
   * Predict price forecast
   */
  async predictPrice(
    commodity: string,
    days: number = 30
  ): Promise<{ prices: { date: string; price: number }[] } | null> {
    return httpRequest<{ prices: { date: string; price: number }[] }>(`${ML_SERVICE_URL}/predict/price`, {
      method: 'POST',
      body: { commodity, days },
    });
  },

  /**
   * Calculate credit score
   */
  async calculateCreditScore(farmerId: number): Promise<{ score: number; factors: string[] } | null> {
    return httpRequest<{ score: number; factors: string[] }>(`${ML_SERVICE_URL}/credit-score/${farmerId}`);
  },
};

// ============================================
// Aggregated Health Check
// ============================================

export async function checkAllMicroservicesHealth(): Promise<{
  overall: 'ok' | 'degraded' | 'error';
  services: ServiceHealth[];
}> {
  const healthChecks = await Promise.all([
    loanOrchestratorClient.health(),
    imageServiceClient.health(),
    realtimeServiceClient.health(),
    loanWorkerClient.health(),
    ollamaServiceClient.health(),
    lakehouseServiceClient.health(),
    mlServiceClient.health(),
  ]);

  const errorCount = healthChecks.filter(h => h.status === 'error').length;
  const degradedCount = healthChecks.filter(h => h.status === 'degraded').length;

  let overall: 'ok' | 'degraded' | 'error' = 'ok';
  if (errorCount > 0) {
    overall = errorCount === healthChecks.length ? 'error' : 'degraded';
  } else if (degradedCount > 0) {
    overall = 'degraded';
  }

  return {
    overall,
    services: healthChecks,
  };
}

// Export all clients
export const microservicesClient = {
  loanOrchestrator: loanOrchestratorClient,
  imageService: imageServiceClient,
  realtimeService: realtimeServiceClient,
  loanWorker: loanWorkerClient,
  ollamaService: ollamaServiceClient,
  lakehouseService: lakehouseServiceClient,
  mlService: mlServiceClient,
  checkHealth: checkAllMicroservicesHealth,
};

export default microservicesClient;
