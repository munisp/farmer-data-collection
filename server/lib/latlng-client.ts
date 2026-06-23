/**
 * latlng Client — Real-Time Geospatial Object Engine Integration
 *
 * HTTP + WebSocket client for latlng's spatial object tracking.
 * Used for: fleet/vehicle tracking, geofencing, cold chain monitoring,
 * distributor coverage zones, real-time delivery tracking.
 */

import { logger } from "../logger.js";

const LATLNG_URL = process.env.LATLNG_URL || "http://localhost:7421";
const LATLNG_AUTH_TOKEN = process.env.LATLNG_AUTH_TOKEN || "";
const LATLNG_TIMEOUT = 5000;

export interface LatLngObject {
  id: string;
  type: "point" | "bounds" | "geojson";
  lat?: number;
  lng?: number;
  object?: Record<string, unknown>;  // GeoJSON
  fields?: Record<string, number | string>;
  meta?: Record<string, unknown>;
}

export interface LatLngNearbyResult {
  id: string;
  distance: number;
  lat: number;
  lng: number;
  fields?: Record<string, number | string>;
  object?: Record<string, unknown>;
}

export interface LatLngGeofence {
  name: string;
  collection: string;
  detect: string[];  // "enter", "exit", "inside", "outside", "cross"
  commands?: string[];
  geojson: Record<string, unknown>;
  endpoint?: string;  // Webhook URL
}

export interface LatLngEvent {
  type: "enter" | "exit" | "inside" | "outside" | "cross";
  hook: string;
  collection: string;
  id: string;
  time: string;
  lat: number;
  lng: number;
  fields?: Record<string, number | string>;
}

export interface CollectionStats {
  count: number;
  memorySize?: number;
}

type EventCallback = (event: LatLngEvent) => void;

class LatLngClient {
  private baseUrl: string;
  private authToken: string;
  private connected = false;
  private eventCallbacks: Map<string, EventCallback[]> = new Map();

  constructor(url?: string, token?: string) {
    this.baseUrl = url || LATLNG_URL;
    this.authToken = token || LATLNG_AUTH_TOKEN;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LATLNG_TIMEOUT);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "unknown error");
        throw new Error(`latlng ${method} ${path}: ${res.status} — ${text}`);
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return (await res.json()) as T;
      return (await res.text()) as unknown as T;
    } catch (err) {
      clearTimeout(timeout);
      if ((err as Error).name === "AbortError") {
        throw new Error(`latlng timeout: ${method} ${path}`);
      }
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request("GET", "/server");
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

  // ── Collection Management ────────────────────────────────────────

  async createCollection(name: string): Promise<boolean> {
    try {
      await this.request("POST", `/collections/${encodeURIComponent(name)}`, {});
      return true;
    } catch (err) {
      logger.warn(`[latlng] Create collection failed: ${(err as Error).message}`);
      return false;
    }
  }

  async dropCollection(name: string): Promise<boolean> {
    try {
      await this.request("DELETE", `/collections/${encodeURIComponent(name)}`);
      return true;
    } catch {
      return false;
    }
  }

  async getCollectionStats(name: string): Promise<CollectionStats | null> {
    try {
      return await this.request<CollectionStats>(
        "GET",
        `/collections/${encodeURIComponent(name)}/stats`,
      );
    } catch {
      return null;
    }
  }

  // ── Object Operations ────────────────────────────────────────────

  async setPoint(
    collection: string,
    id: string,
    lat: number,
    lng: number,
    fields?: Record<string, number | string>,
    meta?: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await this.request("POST", `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}`, {
        type: "point",
        lat,
        lng,
        fields,
        meta,
      });
      return true;
    } catch (err) {
      logger.warn(`[latlng] setPoint failed: ${(err as Error).message}`);
      return false;
    }
  }

  async setGeoJSON(
    collection: string,
    id: string,
    geojson: Record<string, unknown>,
    fields?: Record<string, number | string>,
  ): Promise<boolean> {
    try {
      await this.request("POST", `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}`, {
        type: "object",
        object: geojson,
        fields,
      });
      return true;
    } catch (err) {
      logger.warn(`[latlng] setGeoJSON failed: ${(err as Error).message}`);
      return false;
    }
  }

  async getObject(collection: string, id: string): Promise<LatLngObject | null> {
    try {
      return await this.request<LatLngObject>(
        "GET",
        `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}`,
      );
    } catch {
      return null;
    }
  }

  async deleteObject(collection: string, id: string): Promise<boolean> {
    try {
      await this.request("DELETE", `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}`);
      return true;
    } catch {
      return false;
    }
  }

  async setField(collection: string, id: string, field: string, value: number | string): Promise<boolean> {
    try {
      await this.request("POST", `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}/fields/${encodeURIComponent(field)}`, {
        value,
      });
      return true;
    } catch {
      return false;
    }
  }

  async setExpiry(collection: string, id: string, seconds: number): Promise<boolean> {
    try {
      await this.request("POST", `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}/expire`, {
        seconds,
      });
      return true;
    } catch {
      return false;
    }
  }

  async setJsonProperty(collection: string, id: string, path: string, value: unknown): Promise<boolean> {
    try {
      await this.request("POST", `/collections/${encodeURIComponent(collection)}/objects/${encodeURIComponent(id)}/json`, {
        path,
        value,
      });
      return true;
    } catch {
      return false;
    }
  }

  // ── Spatial Queries ──────────────────────────────────────────────

  async nearby(
    collection: string,
    lat: number,
    lng: number,
    radiusMeters: number,
    limit = 100,
  ): Promise<LatLngNearbyResult[]> {
    try {
      return await this.request<LatLngNearbyResult[]>(
        "GET",
        `/collections/${encodeURIComponent(collection)}/nearby?lat=${lat}&lng=${lng}&radius=${radiusMeters}&limit=${limit}`,
      );
    } catch (err) {
      logger.warn(`[latlng] nearby failed: ${(err as Error).message}`);
      return [];
    }
  }

  async intersects(
    collection: string,
    geojson: Record<string, unknown>,
    limit = 100,
  ): Promise<LatLngObject[]> {
    try {
      return await this.request<LatLngObject[]>(
        "POST",
        `/collections/${encodeURIComponent(collection)}/intersects?limit=${limit}`,
        { object: geojson },
      );
    } catch (err) {
      logger.warn(`[latlng] intersects failed: ${(err as Error).message}`);
      return [];
    }
  }

  async within(
    collection: string,
    geojson: Record<string, unknown>,
    limit = 100,
  ): Promise<LatLngObject[]> {
    try {
      return await this.request<LatLngObject[]>(
        "POST",
        `/collections/${encodeURIComponent(collection)}/within?limit=${limit}`,
        { object: geojson },
      );
    } catch (err) {
      logger.warn(`[latlng] within failed: ${(err as Error).message}`);
      return [];
    }
  }

  async scan(collection: string, limit = 100, cursor = 0): Promise<{ objects: LatLngObject[]; cursor: number }> {
    try {
      return await this.request<{ objects: LatLngObject[]; cursor: number }>(
        "GET",
        `/collections/${encodeURIComponent(collection)}/scan?limit=${limit}&cursor=${cursor}`,
      );
    } catch {
      return { objects: [], cursor: 0 };
    }
  }

  // ── Geofencing ───────────────────────────────────────────────────

  async createHook(geofence: LatLngGeofence): Promise<boolean> {
    try {
      await this.request("POST", `/hooks/${encodeURIComponent(geofence.name)}`, {
        collection: geofence.collection,
        detect: geofence.detect,
        commands: geofence.commands,
        object: geofence.geojson,
        endpoint: geofence.endpoint,
      });
      return true;
    } catch (err) {
      logger.warn(`[latlng] createHook failed: ${(err as Error).message}`);
      return false;
    }
  }

  async deleteHook(name: string): Promise<boolean> {
    try {
      await this.request("DELETE", `/hooks/${encodeURIComponent(name)}`);
      return true;
    } catch {
      return false;
    }
  }

  async listHooks(): Promise<LatLngGeofence[]> {
    try {
      return await this.request<LatLngGeofence[]>("GET", "/hooks");
    } catch {
      return [];
    }
  }

  async createChannel(name: string, geofence: Omit<LatLngGeofence, "name" | "endpoint">): Promise<boolean> {
    try {
      await this.request("POST", `/channels/${encodeURIComponent(name)}`, {
        collection: geofence.collection,
        detect: geofence.detect,
        commands: geofence.commands,
        object: geofence.geojson,
      });
      return true;
    } catch (err) {
      logger.warn(`[latlng] createChannel failed: ${(err as Error).message}`);
      return false;
    }
  }

  async deleteChannel(name: string): Promise<boolean> {
    try {
      await this.request("DELETE", `/channels/${encodeURIComponent(name)}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Event Subscriptions ──────────────────────────────────────────

  onEvent(channel: string, callback: EventCallback): void {
    const cbs = this.eventCallbacks.get(channel) || [];
    cbs.push(callback);
    this.eventCallbacks.set(channel, cbs);
  }

  removeEventListener(channel: string, callback: EventCallback): void {
    const cbs = this.eventCallbacks.get(channel) || [];
    this.eventCallbacks.set(channel, cbs.filter(cb => cb !== callback));
  }

  emitEvent(event: LatLngEvent): void {
    const cbs = this.eventCallbacks.get(event.hook) || [];
    for (const cb of cbs) {
      try { cb(event); } catch (err) {
        logger.error(`[latlng] Event callback error: ${(err as Error).message}`);
      }
    }
  }
}

// Singleton
let client: LatLngClient | null = null;

export function getLatLngClient(): LatLngClient {
  if (!client) {
    client = new LatLngClient();
    client.healthCheck().then((ok) => {
      if (ok) {
        logger.info(`[latlng] Connected to ${LATLNG_URL}`);
      } else {
        logger.warn(`[latlng] Not available at ${LATLNG_URL} — real-time tracking features will use PostgreSQL fallback`);
      }
    });
  }
  return client;
}

export function closeLatLng(): void {
  client = null;
}
