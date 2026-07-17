/**
 * MobyDB Client — Geospatial-Native Database Integration
 *
 * HTTP client for MobyDB's axum API. Primary key model:
 *   (H3 cell, GEP Epoch, Ed25519 public key) = WHERE + WHEN + WHO
 *
 * Used for: field observations, supply chain provenance, dairy milk collections,
 * carbon credit verification, consignment tracking.
 */

import { logger } from "../logger.js";

const MOBYDB_URL = process.env.MOBYDB_URL || "http://localhost:7474";
const MOBYDB_TIMEOUT = 5000;

export interface SpacetimeAddress {
  h3Cell: string;      // H3 cell index (resolution 7-9)
  epoch: number;       // GEP epoch number
  pubkey: string;      // Ed25519 public key hex
}

export interface MobyRecord {
  address: SpacetimeAddress;
  payload: Record<string, unknown>;
  signature: string;   // Ed25519 signature hex
  tier?: string;
  createdAt?: string;
}

export interface MobyWriteRequest {
  h3_cell: string;
  epoch: number;
  pubkey: string;
  payload: Record<string, unknown>;
  signature: string;
  tier?: string;
}

export interface MobyNearQuery {
  cell: string;
  rings?: number;
  epochStart?: number;
  epochEnd?: number;
  tier?: string;
  limit?: number;
}

export interface MobyProof {
  cell: string;
  epoch: number;
  pubkey: string;
  root: string;
  proof: string[];
  verified: boolean;
}

export interface EpochInfo {
  epoch: number;
  sealed: boolean;
  recordCount: number;
  merkleRoot?: string;
  sealedAt?: string;
}

class MobyDBClient {
  private baseUrl: string;
  private connected = false;

  constructor(url?: string) {
    this.baseUrl = url || MOBYDB_URL;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MOBYDB_TIMEOUT);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "unknown error");
        throw new Error(`MobyDB ${method} ${path}: ${res.status} — ${text}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") {
        throw new Error(`MobyDB timeout: ${method} ${path}`);
      }
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/health");
      this.connected = true;
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Write Operations ─────────────────────────────────────────────

  async writeRecord(record: MobyWriteRequest): Promise<{ ok: boolean; key: string }> {
    try {
      const result = await this.request<{ ok: boolean; key: string }>(
        "POST",
        "/write",
        record,
      );
      return result;
    } catch (err) {
      logger.warn(`[MobyDB] Write failed: ${(err as Error).message}`);
      return { ok: false, key: "" };
    }
  }

  async writeBatch(records: MobyWriteRequest[]): Promise<{ ok: boolean; count: number }> {
    try {
      const result = await this.request<{ ok: boolean; count: number }>(
        "POST",
        "/write/batch",
        { records },
      );
      return result;
    } catch (err) {
      logger.warn(`[MobyDB] Batch write failed: ${(err as Error).message}`);
      return { ok: false, count: 0 };
    }
  }

  // ── Read Operations ──────────────────────────────────────────────

  async getRecord(cell: string, epoch: number, pubkey: string): Promise<MobyRecord | null> {
    try {
      return await this.request<MobyRecord>(
        "GET",
        `/record/${encodeURIComponent(cell)}/${epoch}/${encodeURIComponent(pubkey)}`,
      );
    } catch {
      return null;
    }
  }

  async nearQuery(query: MobyNearQuery): Promise<MobyRecord[]> {
    const params = new URLSearchParams();
    if (query.rings !== undefined) params.set("rings", String(query.rings));
    if (query.epochStart !== undefined) params.set("epoch_start", String(query.epochStart));
    if (query.epochEnd !== undefined) params.set("epoch_end", String(query.epochEnd));
    if (query.tier) params.set("tier", query.tier);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const qs = params.toString();

    try {
      return await this.request<MobyRecord[]>(
        "GET",
        `/near/${encodeURIComponent(query.cell)}${qs ? `?${qs}` : ""}`,
      );
    } catch (err) {
      logger.warn(`[MobyDB] Near query failed: ${(err as Error).message}`);
      return [];
    }
  }

  async queryByEpoch(epochStart: number, epochEnd: number, limit = 100): Promise<MobyRecord[]> {
    try {
      return await this.request<MobyRecord[]>(
        "GET",
        `/during?epoch_start=${epochStart}&epoch_end=${epochEnd}&limit=${limit}`,
      );
    } catch (err) {
      logger.warn(`[MobyDB] Epoch query failed: ${(err as Error).message}`);
      return [];
    }
  }

  async queryByPubkey(pubkey: string, limit = 100): Promise<MobyRecord[]> {
    try {
      return await this.request<MobyRecord[]>(
        "GET",
        `/by-key/${encodeURIComponent(pubkey)}?limit=${limit}`,
      );
    } catch (err) {
      logger.warn(`[MobyDB] Pubkey query failed: ${(err as Error).message}`);
      return [];
    }
  }

  // ── Epoch Management ─────────────────────────────────────────────

  async sealEpoch(epoch: number): Promise<{ ok: boolean; merkleRoot?: string }> {
    try {
      return await this.request<{ ok: boolean; merkleRoot?: string }>(
        "POST",
        `/epoch/${epoch}/seal`,
      );
    } catch (err) {
      logger.warn(`[MobyDB] Epoch seal failed: ${(err as Error).message}`);
      return { ok: false };
    }
  }

  async getEpochInfo(epoch: number): Promise<EpochInfo | null> {
    try {
      return await this.request<EpochInfo>("GET", `/epoch/${epoch}`);
    } catch {
      return null;
    }
  }

  async getCurrentEpoch(): Promise<number> {
    try {
      const info = await this.request<{ current_epoch: number }>("GET", "/epoch/current");
      return info.current_epoch;
    } catch {
      return 0;
    }
  }

  // ── Merkle Proofs ────────────────────────────────────────────────

  async generateProof(cell: string, epoch: number, pubkey: string): Promise<MobyProof | null> {
    try {
      return await this.request<MobyProof>(
        "GET",
        `/proof/${encodeURIComponent(cell)}/${epoch}/${encodeURIComponent(pubkey)}`,
      );
    } catch {
      return null;
    }
  }

  async verifyProof(proof: MobyProof): Promise<boolean> {
    try {
      const result = await this.request<{ verified: boolean }>(
        "POST",
        "/proof/verify",
        proof,
      );
      return result.verified;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let client: MobyDBClient | null = null;

export function getMobyDBClient(): MobyDBClient {
  if (!client) {
    client = new MobyDBClient();
    client.healthCheck().then((ok) => {
      if (ok) {
        logger.info(`[MobyDB] Connected to ${MOBYDB_URL}`);
      } else {
        logger.warn(`[MobyDB] Not available at ${MOBYDB_URL} — spatial provenance features will use PostgreSQL fallback`);
      }
    });
  }
  return client;
}

export function closeMobyDB(): void {
  client = null;
}
