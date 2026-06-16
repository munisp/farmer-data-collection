/**
 * Feature Flags Client — TypeScript connector to Go Feature Flags service (Dapr-backed)
 */
import { logger } from "../logger.js";

const SERVICE_URL = process.env.FEATURE_FLAGS_SERVICE_URL || "http://localhost:8101";

interface FlagEvalResult {
  flag_name: string;
  enabled: boolean;
  variant?: string;
  reason: string;
}

interface FeatureFlag {
  name: string;
  enabled: boolean;
  percentage: number;
  description: string;
  rules?: Array<{
    attribute: string;
    operator: string;
    value: string;
    enabled: boolean;
  }>;
}

class FeatureFlagsClient {
  private cache: Map<string, { result: FlagEvalResult; expires: number }> = new Map();
  private readonly cacheTTL = 30_000; // 30s
  private healthy = true;

  async evaluate(
    flagName: string,
    context: Record<string, string> = {},
    defaultValue = false
  ): Promise<boolean> {
    const cacheKey = `${flagName}:${JSON.stringify(context)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.result.enabled;
    }

    try {
      const resp = await fetch(`${SERVICE_URL}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag_name: flagName, context, default_value: defaultValue }),
        signal: AbortSignal.timeout(3000),
      });

      if (!resp.ok) return defaultValue;

      const result: FlagEvalResult = await resp.json();
      this.cache.set(cacheKey, { result, expires: Date.now() + this.cacheTTL });
      this.healthy = true;
      return result.enabled;
    } catch (err) {
      this.healthy = false;
      return defaultValue;
    }
  }

  async evaluateBulk(
    flags: string[],
    context: Record<string, string> = {}
  ): Promise<Record<string, boolean>> {
    try {
      const resp = await fetch(`${SERVICE_URL}/evaluate/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags, context }),
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        return Object.fromEntries(flags.map((f) => [f, false]));
      }

      const results: FlagEvalResult[] = await resp.json();
      return Object.fromEntries(results.map((r) => [r.flag_name, r.enabled]));
    } catch (err) {
      return Object.fromEntries(flags.map((f) => [f, false]));
    }
  }

  async listFlags(): Promise<FeatureFlag[]> {
    try {
      const resp = await fetch(`${SERVICE_URL}/flags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return [];
      return resp.json();
    } catch (err) {
      return [];
    }
  }

  async updateFlag(flag: FeatureFlag): Promise<boolean> {
    try {
      const resp = await fetch(`${SERVICE_URL}/flags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flag),
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch (err) {
      return false;
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}

export const featureFlags = new FeatureFlagsClient();
