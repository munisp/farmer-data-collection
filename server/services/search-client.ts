/**
 * Search Client — TypeScript connector to Rust OpenSearch proxy
 */

const SEARCH_URL = process.env.SEARCH_SERVICE_URL || "http://localhost:8104";

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  farmer_name: string;
  location: string;
  score: number;
  highlights: string[];
}

interface SearchResponse {
  total: number;
  results: SearchResult[];
  took_ms: number;
  query: string;
}

interface IndexDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  farmer_name: string;
  location: string;
  organic: boolean;
  tags: string[];
  name_yoruba?: string;
  name_hausa?: string;
  name_igbo?: string;
}

class SearchClient {
  private healthy = true;

  async search(params: {
    q: string;
    category?: string;
    min_price?: number;
    max_price?: number;
    organic?: boolean;
    location?: string;
    limit?: number;
    offset?: number;
  }): Promise<SearchResponse> {
    try {
      const qs = new URLSearchParams();
      qs.set("q", params.q);
      if (params.category) qs.set("category", params.category);
      if (params.min_price !== undefined) qs.set("min_price", String(params.min_price));
      if (params.max_price !== undefined) qs.set("max_price", String(params.max_price));
      if (params.organic !== undefined) qs.set("organic", String(params.organic));
      if (params.location) qs.set("location", params.location);
      if (params.limit) qs.set("limit", String(params.limit));
      if (params.offset) qs.set("offset", String(params.offset));

      const resp = await fetch(`${SEARCH_URL}/search?${qs}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        return { total: 0, results: [], took_ms: 0, query: params.q };
      }

      this.healthy = true;
      return resp.json();
    } catch (err) {
      this.healthy = false;
      return { total: 0, results: [], took_ms: 0, query: params.q };
    }
  }

  async index(doc: IndexDocument): Promise<boolean> {
    try {
      const resp = await fetch(`${SEARCH_URL}/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
        signal: AbortSignal.timeout(5000),
      });
      this.healthy = resp.ok;
      return resp.ok;
    } catch (err) {
      this.healthy = false;
      return false;
    }
  }

  async createIndex(): Promise<boolean> {
    try {
      const resp = await fetch(`${SEARCH_URL}/index/create`, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
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

export const searchClient = new SearchClient();
