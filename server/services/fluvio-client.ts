/**
 * Fluvio Streaming Client — TypeScript connector to Rust Fluvio service
 */

const FLUVIO_URL = process.env.FLUVIO_SERVICE_URL || "http://localhost:8106";

interface StreamEvent {
  id: string;
  topic: string;
  key: string;
  payload: Record<string, unknown>;
  timestamp: string;
  partition: number;
}

class FluvioClient {
  private healthy = true;

  async produce(topic: string, key: string, payload: Record<string, unknown>, partition?: number): Promise<string | null> {
    try {
      const resp = await fetch(`${FLUVIO_URL}/produce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, key, payload, partition }),
        signal: AbortSignal.timeout(3000),
      });

      if (!resp.ok) return null;

      const result = await resp.json() as { event_id: string };
      this.healthy = true;
      return result.event_id;
    } catch (err) {
      this.healthy = false;
      return null;
    }
  }

  async produceBatch(events: Array<{ topic: string; key: string; payload: Record<string, unknown>; partition?: number }>): Promise<{ produced: number; errors: number }> {
    try {
      const resp = await fetch(`${FLUVIO_URL}/produce/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(events),
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return { produced: 0, errors: events.length };

      this.healthy = true;
      return resp.json();
    } catch (err) {
      this.healthy = false;
      return { produced: 0, errors: events.length };
    }
  }

  async consume(topic: string, limit = 50, offset = 0, partition?: number): Promise<StreamEvent[]> {
    try {
      const params = new URLSearchParams({ topic, limit: String(limit), offset: String(offset) });
      if (partition !== undefined) params.set("partition", String(partition));

      const resp = await fetch(`${FLUVIO_URL}/consume?${params}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) return [];

      const data = await resp.json() as { events: StreamEvent[] };
      this.healthy = true;
      return data.events;
    } catch (err) {
      this.healthy = false;
      return [];
    }
  }

  async listTopics(): Promise<Array<{ name: string; partitions: number; event_count: number; description: string }>> {
    try {
      const resp = await fetch(`${FLUVIO_URL}/topics`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) return [];
      this.healthy = true;
      return resp.json();
    } catch (err) {
      this.healthy = false;
      return [];
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }
}

export const fluvioClient = new FluvioClient();
