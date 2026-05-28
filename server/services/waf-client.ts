/**
 * WAF Security Client — TypeScript connector to Rust WAF/OpenAppSec service
 * Provides input sanitization and request inspection middleware
 */
import { logger } from "../logger.js";

const WAF_URL = process.env.WAF_SERVICE_URL || "http://localhost:8105";

interface SanitizeResult {
  fields: Record<string, string>;
  sanitized_count: number;
  threats_found: Array<{
    field: string;
    threat_type: string;
    original: string;
    sanitized: string;
  }>;
}

interface InspectResult {
  allowed: boolean;
  risk_score: number;
  threats: string[];
  action: "allow" | "block" | "challenge";
}

class WAFClient {
  private healthy = true;

  async sanitize(fields: Record<string, string>): Promise<SanitizeResult> {
    try {
      const resp = await fetch(`${WAF_URL}/sanitize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
        signal: AbortSignal.timeout(3000),
      });

      if (!resp.ok) {
        return { fields, sanitized_count: 0, threats_found: [] };
      }

      this.healthy = true;
      return resp.json();
    } catch (err) {
      this.healthy = false;
      return { fields, sanitized_count: 0, threats_found: [] };
    }
  }

  async inspect(request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
    source_ip?: string;
  }): Promise<InspectResult> {
    try {
      const resp = await fetch(`${WAF_URL}/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(2000),
      });

      if (!resp.ok) {
        return { allowed: true, risk_score: 0, threats: [], action: "allow" };
      }

      this.healthy = true;
      return resp.json();
    } catch (err) {
      this.healthy = false;
      return { allowed: true, risk_score: 0, threats: [], action: "allow" };
    }
  }

  /**
   * Sanitize all string values in a tRPC input object recursively
   */
  async sanitizeInput<T extends Record<string, unknown>>(input: T): Promise<T> {
    const stringFields: Record<string, string> = {};
    const paths: string[] = [];

    // Extract string fields
    function extract(obj: Record<string, unknown>, prefix = "") {
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") {
          stringFields[path] = value;
          paths.push(path);
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          extract(value as Record<string, unknown>, path);
        }
      }
    }

    extract(input);

    if (paths.length === 0) return input;

    const result = await this.sanitize(stringFields);

    if (result.threats_found.length > 0) {
      logger.warn("WAF detected threats in input", {
        threats: result.threats_found.map((t) => `${t.field}:${t.threat_type}`).join(", "),
      });
    }

    // Apply sanitized values back
    const output = JSON.parse(JSON.stringify(input));
    for (const path of paths) {
      const sanitized = result.fields[path];
      if (sanitized !== undefined) {
        const parts = path.split(".");
        let current = output;
        for (let i = 0; i < parts.length - 1; i++) {
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = sanitized;
      }
    }

    return output;
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}

export const wafClient = new WAFClient();
