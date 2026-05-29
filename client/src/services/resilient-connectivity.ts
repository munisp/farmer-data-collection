/**
 * Resilient Connectivity Service for Low-Bandwidth / Offline Environments
 *
 * Designed for rural Africa where connectivity is unreliable:
 * - Exponential backoff with jitter for reconnection
 * - Message queue that persists offline messages to IndexedDB
 * - Bandwidth detection and adaptive protocol switching (WS → SSE → polling)
 * - Heartbeat/keepalive with configurable intervals
 * - Offline-first architecture: queue all actions, sync when online
 * - Graceful degradation: never block the UI on network state
 */

// ── Network Quality Detection ───────────────────────────────────────────

export type NetworkQuality = "high" | "medium" | "low" | "offline";

export interface NetworkStatus {
  quality: NetworkQuality;
  effectiveType: string; // "4g" | "3g" | "2g" | "slow-2g" | "unknown"
  downlinkMbps: number;
  rtt: number; // round-trip time in ms
  online: boolean;
  saveData: boolean;
}

function detectNetworkQuality(): NetworkStatus {
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };

  const conn = nav.connection;
  const online = navigator.onLine;

  if (!online) {
    return { quality: "offline", effectiveType: "offline", downlinkMbps: 0, rtt: 0, online: false, saveData: false };
  }

  const effectiveType = conn?.effectiveType || "unknown";
  const downlink = conn?.downlink || 10;
  const rtt = conn?.rtt || 50;
  const saveData = conn?.saveData || false;

  let quality: NetworkQuality;
  if (effectiveType === "4g" && downlink > 5 && rtt < 100) {
    quality = "high";
  } else if (effectiveType === "3g" || (downlink > 1 && rtt < 300)) {
    quality = "medium";
  } else {
    quality = "low";
  }

  return { quality, effectiveType, downlinkMbps: downlink, rtt, online, saveData };
}

// ── Offline Message Queue (IndexedDB-backed) ────────────────────────────

interface QueuedMessage {
  id: string;
  channel: string;
  payload: unknown;
  timestamp: number;
  retries: number;
  priority: "high" | "normal" | "low";
}

class OfflineMessageQueue {
  private queue: QueuedMessage[] = [];
  private dbName = "farmconnect_msg_queue";
  private storeName = "messages";
  private db: IDBDatabase | null = null;
  private maxSize = 5000;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
          store.createIndex("priority", "priority", { unique: false });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        this.loadFromDB().then(resolve);
      };
      request.onerror = () => {
        console.warn("[OfflineQueue] IndexedDB unavailable, using memory queue");
        resolve();
      };
    });
  }

  private async loadFromDB(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db!.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        this.queue = request.result || [];
        resolve();
      };
      request.onerror = () => resolve();
    });
  }

  async enqueue(channel: string, payload: unknown, priority: "high" | "normal" | "low" = "normal"): Promise<void> {
    if (this.queue.length >= this.maxSize) {
      // Drop lowest priority oldest messages
      const lowPriority = this.queue.filter(m => m.priority === "low");
      if (lowPriority.length > 0) {
        const oldest = lowPriority[0];
        await this.remove(oldest.id);
      } else {
        // Drop oldest normal priority
        const normal = this.queue.filter(m => m.priority === "normal");
        if (normal.length > 0) {
          await this.remove(normal[0].id);
        }
      }
    }

    const msg: QueuedMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel,
      payload,
      timestamp: Date.now(),
      retries: 0,
      priority,
    };

    this.queue.push(msg);
    await this.saveToDB(msg);
  }

  async dequeue(): Promise<QueuedMessage | null> {
    // Priority order: high → normal → low
    const sorted = [...this.queue].sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.timestamp - b.timestamp;
    });

    if (sorted.length === 0) return null;
    const msg = sorted[0];
    return msg;
  }

  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter(m => m.id !== id);
    if (this.db) {
      const tx = this.db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).delete(id);
    }
  }

  async incrementRetry(id: string): Promise<void> {
    const msg = this.queue.find(m => m.id === id);
    if (msg) {
      msg.retries++;
      await this.saveToDB(msg);
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  private async saveToDB(msg: QueuedMessage): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(this.storeName, "readwrite");
    tx.objectStore(this.storeName).put(msg);
  }
}

// ── Exponential Backoff with Jitter ─────────────────────────────────────

class ReconnectionStrategy {
  private attempt = 0;
  private baseDelay: number;
  private maxDelay: number;
  private maxAttempts: number;

  constructor(baseDelay = 1000, maxDelay = 60000, maxAttempts = Infinity) {
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.maxAttempts = maxAttempts;
  }

  nextDelay(): number {
    if (this.attempt >= this.maxAttempts) return -1;
    // Exponential backoff: base * 2^attempt
    const exponential = this.baseDelay * Math.pow(2, this.attempt);
    // Cap at maxDelay
    const capped = Math.min(exponential, this.maxDelay);
    // Add jitter: ±25% randomization to prevent thundering herd
    const jitter = capped * (0.75 + Math.random() * 0.5);
    this.attempt++;
    return Math.round(jitter);
  }

  reset(): void {
    this.attempt = 0;
  }

  get attempts(): number {
    return this.attempt;
  }
}

// ── Transport Layer ─────────────────────────────────────────────────────

type TransportType = "websocket" | "sse" | "polling";

interface TransportConfig {
  wsUrl: string;
  sseUrl: string;
  pollingUrl: string;
  pollingInterval: number;
}

type MessageHandler = (data: unknown) => void;

// ── Resilient Connection Manager ────────────────────────────────────────

export interface ResilientConnectionConfig {
  wsUrl?: string;
  sseUrl?: string;
  pollingUrl?: string;
  heartbeatInterval?: number;       // ms between heartbeats (default: 15s for low-bandwidth)
  heartbeatTimeout?: number;        // ms to wait for heartbeat response (default: 10s)
  pollingInterval?: number;         // ms between polls when in polling mode (default: 30s)
  reconnectBaseDelay?: number;      // base reconnection delay ms (default: 1s)
  reconnectMaxDelay?: number;       // max reconnection delay ms (default: 60s)
  maxQueueSize?: number;            // max offline message queue size (default: 5000)
  bandwidthAdaptive?: boolean;      // auto-switch transport based on bandwidth (default: true)
  enableOfflineQueue?: boolean;     // persist messages when offline (default: true)
}

export type ConnectionState = "connected" | "connecting" | "reconnecting" | "disconnected" | "offline";

export interface ConnectionStatus {
  state: ConnectionState;
  transport: TransportType | "none";
  network: NetworkStatus;
  queueSize: number;
  reconnectAttempts: number;
  lastConnected: number | null;
  lastError: string | null;
}

type StatusChangeHandler = (status: ConnectionStatus) => void;

export class ResilientConnectionManager {
  private config: Required<ResilientConnectionConfig>;
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private messageQueue: OfflineMessageQueue;
  private reconnection: ReconnectionStrategy;
  private currentTransport: TransportType | "none" = "none";
  private state: ConnectionState = "disconnected";
  private lastConnected: number | null = null;
  private lastError: string | null = null;
  private clientId: string = "";

  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private statusHandlers: Set<StatusChangeHandler> = new Set();
  private networkMonitorCleanup: (() => void) | null = null;

  constructor(config: ResilientConnectionConfig = {}) {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    this.config = {
      wsUrl: config.wsUrl || `${baseUrl.replace("http", "ws")}/ws`,
      sseUrl: config.sseUrl || `${baseUrl}/api/events`,
      pollingUrl: config.pollingUrl || `${baseUrl}/api/poll`,
      heartbeatInterval: config.heartbeatInterval || 15000,
      heartbeatTimeout: config.heartbeatTimeout || 10000,
      pollingInterval: config.pollingInterval || 30000,
      reconnectBaseDelay: config.reconnectBaseDelay || 1000,
      reconnectMaxDelay: config.reconnectMaxDelay || 60000,
      maxQueueSize: config.maxQueueSize || 5000,
      bandwidthAdaptive: config.bandwidthAdaptive ?? true,
      enableOfflineQueue: config.enableOfflineQueue ?? true,
    };

    this.messageQueue = new OfflineMessageQueue();
    this.reconnection = new ReconnectionStrategy(
      this.config.reconnectBaseDelay,
      this.config.reconnectMaxDelay,
    );
  }

  // ── Public API ──────────────────────────────────────────────────────

  async connect(clientId: string): Promise<void> {
    this.clientId = clientId;
    await this.messageQueue.init();
    this.startNetworkMonitor();

    const network = detectNetworkQuality();
    if (!network.online) {
      this.setState("offline");
      return;
    }

    const transport = this.selectTransport(network);
    await this.connectTransport(transport);
  }

  disconnect(): void {
    this.stopNetworkMonitor();
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.disconnectAll();
    this.setState("disconnected");
  }

  async send(channel: string, payload: unknown, priority: "high" | "normal" | "low" = "normal"): Promise<void> {
    const message = JSON.stringify({ channel, payload, clientId: this.clientId, timestamp: Date.now() });

    if (this.state === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(message);
        return;
      } catch (err) {
        console.warn('[Resilient] WebSocket send failed, queuing:', String(err));
      }
    }

    // Queue for later delivery
    if (this.config.enableOfflineQueue) {
      await this.messageQueue.enqueue(channel, payload, priority);
      this.notifyStatusChange();
    }
  }

  onMessage(channel: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, new Set());
    }
    this.messageHandlers.get(channel)!.add(handler);
    return () => {
      this.messageHandlers.get(channel)?.delete(handler);
    };
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    // Immediately notify with current status
    handler(this.getStatus());
    return () => {
      this.statusHandlers.delete(handler);
    };
  }

  getStatus(): ConnectionStatus {
    return {
      state: this.state,
      transport: this.currentTransport,
      network: detectNetworkQuality(),
      queueSize: this.messageQueue.size,
      reconnectAttempts: this.reconnection.attempts,
      lastConnected: this.lastConnected,
      lastError: this.lastError,
    };
  }

  // ── Transport Selection ─────────────────────────────────────────────

  private selectTransport(network: NetworkStatus): TransportType {
    if (!this.config.bandwidthAdaptive) return "websocket";

    switch (network.quality) {
      case "high":
        return "websocket";
      case "medium":
        // WebSocket is still fine on 3G, but fall back faster
        return "websocket";
      case "low":
        // On 2G/slow connections, SSE is more efficient (half-duplex, less overhead)
        return "sse";
      case "offline":
        return "polling"; // Will queue; polling tries periodically
      default:
        return "websocket";
    }
  }

  private async connectTransport(transport: TransportType): Promise<void> {
    this.setState("connecting");

    switch (transport) {
      case "websocket":
        this.connectWebSocket();
        break;
      case "sse":
        this.connectSSE();
        break;
      case "polling":
        this.startPolling();
        break;
    }
  }

  // ── WebSocket Transport ─────────────────────────────────────────────

  private connectWebSocket(): void {
    try {
      const url = `${this.config.wsUrl}?clientId=${this.clientId}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.currentTransport = "websocket";
        this.setState("connected");
        this.reconnection.reset();
        this.lastConnected = Date.now();
        this.startHeartbeat();
        this.drainQueue();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") {
            this.handleHeartbeatResponse();
            return;
          }
          this.dispatchMessage(data.channel || data.type || "default", data);
        } catch (err) {
          console.warn('[Resilient] WS JSON parse failed, dispatching raw:', String(err));
          this.dispatchMessage("raw", event.data);
        }
      };

      this.ws.onclose = (event) => {
        this.currentTransport = "none";
        if (event.code !== 1000) {
          // Abnormal close — reconnect
          this.handleDisconnect("WebSocket closed abnormally");
        } else {
          this.setState("disconnected");
        }
      };

      this.ws.onerror = () => {
        this.lastError = "WebSocket connection failed";
        // Try SSE fallback
        this.ws?.close();
        this.tryFallbackTransport("websocket");
      };
    } catch (e) {
      this.lastError = `WebSocket error: ${e}`;
      this.tryFallbackTransport("websocket");
    }
  }

  // ── SSE Transport (Server-Sent Events) ──────────────────────────────

  private connectSSE(): void {
    try {
      const url = `${this.config.sseUrl}?clientId=${this.clientId}`;
      this.sse = new EventSource(url);

      this.sse.onopen = () => {
        this.currentTransport = "sse";
        this.setState("connected");
        this.reconnection.reset();
        this.lastConnected = Date.now();
        this.startHeartbeat();
        this.drainQueue();
      };

      this.sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.dispatchMessage(data.channel || data.type || "default", data);
        } catch (err) {
          console.warn('[Resilient] SSE JSON parse failed, dispatching raw:', String(err));
          this.dispatchMessage("raw", event.data);
        }
      };

      this.sse.onerror = () => {
        this.sse?.close();
        this.currentTransport = "none";
        this.tryFallbackTransport("sse");
      };
    } catch (err) {
      console.warn('[Resilient] SSE connection failed, falling back:', String(err));
      this.tryFallbackTransport("sse");
    }
  }

  // ── Polling Transport ───────────────────────────────────────────────

  private startPolling(): void {
    this.currentTransport = "polling";
    this.setState("connected");
    this.lastConnected = Date.now();

    const poll = async () => {
      try {
        const resp = await fetch(
          `${this.config.pollingUrl}?clientId=${this.clientId}&since=${this.lastConnected}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.messages)) {
            for (const msg of data.messages) {
              this.dispatchMessage(msg.channel || msg.type || "default", msg);
            }
          }
          // Try upgrading to better transport
          const network = detectNetworkQuality();
          if (network.quality !== "low" && network.quality !== "offline") {
            this.stopPolling();
            this.connectTransport(this.selectTransport(network));
          }
        }
      } catch (err) {
        console.warn('[Resilient] Poll failed, will retry:', String(err));
      }
    };

    poll();
    this.pollingTimer = setInterval(poll, this.config.pollingInterval);
    this.drainQueue();
  }

  private stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // ── Heartbeat / Keepalive ──────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
        // Set timeout for response
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.warn("[Resilient] Heartbeat timeout — connection may be dead");
          this.ws?.close();
          this.handleDisconnect("Heartbeat timeout");
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private handleHeartbeatResponse(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  // ── Reconnection & Fallback ────────────────────────────────────────

  private handleDisconnect(reason: string): void {
    this.lastError = reason;
    this.stopHeartbeat();
    this.setState("reconnecting");

    const delay = this.reconnection.nextDelay();
    if (delay < 0) {
      this.setState("disconnected");
      return;
    }

    console.warn(`[Resilient] Reconnecting in ${delay}ms (attempt ${this.reconnection.attempts})`);
    this.reconnectTimer = setTimeout(() => {
      const network = detectNetworkQuality();
      if (!network.online) {
        this.setState("offline");
        return;
      }
      const transport = this.selectTransport(network);
      this.connectTransport(transport);
    }, delay);
  }

  private tryFallbackTransport(failed: TransportType): void {
    const fallbackOrder: TransportType[] = ["websocket", "sse", "polling"];
    const failedIdx = fallbackOrder.indexOf(failed);
    const next = fallbackOrder[failedIdx + 1];

    if (next) {
      console.warn(`[Resilient] Falling back from ${failed} to ${next}`);
      this.connectTransport(next);
    } else {
      this.handleDisconnect(`All transports failed (last: ${failed})`);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Queue Drain ────────────────────────────────────────────────────

  private async drainQueue(): Promise<void> {
    if (this.state !== "connected") return;

    let drained = 0;
    const maxBatch = 50;

    while (drained < maxBatch) {
      const msg = await this.messageQueue.dequeue();
      if (!msg) break;

      try {
        await this.send(msg.channel, msg.payload, msg.priority);
        await this.messageQueue.remove(msg.id);
        drained++;
      } catch (err) {
        console.warn('[Resilient] Queue drain send failed:', String(err));
        await this.messageQueue.incrementRetry(msg.id);
        if (msg.retries >= 5) {
          await this.messageQueue.remove(msg.id);
        }
        break;
      }
    }

    if (drained > 0) {
      console.warn(`[Resilient] Drained ${drained} queued messages`);
      this.notifyStatusChange();
    }
  }

  // ── Network Monitor ────────────────────────────────────────────────

  private startNetworkMonitor(): void {
    const handleOnline = () => {
      console.warn("[Resilient] Network came online");
      if (this.state === "offline") {
        const network = detectNetworkQuality();
        const transport = this.selectTransport(network);
        this.connectTransport(transport);
      }
    };

    const handleOffline = () => {
      console.warn("[Resilient] Network went offline");
      this.disconnectAll();
      this.setState("offline");
    };

    const handleConnectionChange = () => {
      const network = detectNetworkQuality();
      if (this.config.bandwidthAdaptive && this.state === "connected") {
        const ideal = this.selectTransport(network);
        if (ideal !== this.currentTransport) {
          console.warn(`[Resilient] Bandwidth changed: ${this.currentTransport} → ${ideal}`);
          this.disconnectAll();
          this.connectTransport(ideal);
        }
      }
      this.notifyStatusChange();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const nav = navigator as Navigator & { connection?: EventTarget };
    nav.connection?.addEventListener?.("change", handleConnectionChange);

    this.networkMonitorCleanup = () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      nav.connection?.removeEventListener?.("change", handleConnectionChange);
    };
  }

  private stopNetworkMonitor(): void {
    this.networkMonitorCleanup?.();
    this.networkMonitorCleanup = null;
  }

  // ── Internal ───────────────────────────────────────────────────────

  private disconnectAll(): void {
    this.stopHeartbeat();
    this.stopPolling();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    this.currentTransport = "none";
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.notifyStatusChange();
  }

  private notifyStatusChange(): void {
    const status = this.getStatus();
    for (const handler of this.statusHandlers) {
      try {
        handler(status);
      } catch (err) {
        console.warn('[Resilient] Status handler error:', String(err));
      }
    }
  }

  private dispatchMessage(channel: string, data: unknown): void {
    const handlers = this.messageHandlers.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          console.error(`[Resilient] Handler error on channel "${channel}":`, e);
        }
      }
    }
    // Also dispatch to wildcard handlers
    const wildcardHandlers = this.messageHandlers.get("*");
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(data);
        } catch (err) {
          console.warn('[Resilient] Wildcard handler error:', String(err));
        }
      }
    }
  }
}

// ── React Hook ──────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";

const globalManager = new ResilientConnectionManager();

export function useResilientConnection(clientId?: string) {
  const [status, setStatus] = useState<ConnectionStatus>(globalManager.getStatus());
  const connectedRef = useRef(false);

  useEffect(() => {
    const unsub = globalManager.onStatusChange(setStatus);

    if (clientId && !connectedRef.current) {
      connectedRef.current = true;
      globalManager.connect(clientId);
    }

    return unsub;
  }, [clientId]);

  const send = useCallback(
    (channel: string, payload: unknown, priority?: "high" | "normal" | "low") => {
      return globalManager.send(channel, payload, priority);
    },
    [],
  );

  const subscribe = useCallback((channel: string, handler: MessageHandler) => {
    return globalManager.onMessage(channel, handler);
  }, []);

  return { status, send, subscribe, manager: globalManager };
}

// ── Bandwidth-Adaptive Fetch ────────────────────────────────────────────

export async function resilientFetch(
  url: string,
  options: RequestInit = {},
  config: { timeout?: number; retries?: number; priority?: "high" | "normal" } = {},
): Promise<Response> {
  const network = detectNetworkQuality();
  const timeout = config.timeout || (network.quality === "low" ? 30000 : network.quality === "medium" ? 15000 : 10000);
  const retries = config.retries || (network.quality === "low" ? 3 : 1);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timer);
      return response;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < retries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

export { detectNetworkQuality, OfflineMessageQueue };
