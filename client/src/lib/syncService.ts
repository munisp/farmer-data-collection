import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import type { LocalDb } from "@/db/localDb";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/trpc";

export interface SyncResult {
  success: boolean;
  pulled: number;
  pushed: number;
  conflicts: any[];
  error?: string;
}

export class SyncService {
  private db: any | null = null;
  private clientId: string;
  private lastSyncTimes: Map<string, Date> = new Map();

  constructor() {
    // Generate or retrieve client ID for this browser
    this.clientId = this.getOrCreateClientId();
  }

  private getOrCreateClientId(): string {
    let clientId = localStorage.getItem("clientId");
    if (!clientId) {
      clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem("clientId", clientId);
    }
    return clientId;
  }

  async initialize() {
    this.db = await getDb();
    
    // Load last sync times from localStorage
    const savedSyncTimes = localStorage.getItem("lastSyncTimes");
    if (savedSyncTimes) {
      try {
        const parsed = JSON.parse(savedSyncTimes);
        Object.entries(parsed).forEach(([table, time]) => {
          this.lastSyncTimes.set(table, new Date(time as string));
        });
      } catch (e) {
        console.error("Failed to parse last sync times:", e);
      }
    }
  }

  private saveSyncTimes() {
    const obj: Record<string, string> = {};
    this.lastSyncTimes.forEach((time, table) => {
      obj[table] = time.toISOString();
    });
    localStorage.setItem("lastSyncTimes", JSON.stringify(obj));
  }

  async syncAll(): Promise<SyncResult> {
    if (!this.db) {
      await this.initialize();
    }

    const tables = ["farmers", "farms", "crops", "livestock", "farmInputs", "harvests", "expenses"];
    let totalPulled = 0;
    let totalPushed = 0;
    const allConflicts: any[] = [];

    try {
      // First, push local changes to server
      for (const table of tables) {
        const pushResult = await this.pushTable(table);
        totalPushed += pushResult.synced;
        allConflicts.push(...pushResult.conflicts);
      }

      // Then, pull server changes to local
      for (const table of tables) {
        const pullResult = await this.pullTable(table);
        totalPulled += pullResult.records.length;
      }

      return {
        success: true,
        pulled: totalPulled,
        pushed: totalPushed,
        conflicts: allConflicts,
      };
    } catch (error) {
      console.error("Sync error:", error);
      return {
        success: false,
        pulled: totalPulled,
        pushed: totalPushed,
        conflicts: allConflicts,
        error: error instanceof Error ? error.message : "Unknown sync error",
      };
    }
  }

  private async pushTable(table: string): Promise<{ synced: number; conflicts: any[] }> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Get all local records that need to be pushed
      // In a real implementation, you'd track which records are dirty/modified
      const localRecords = await this.db.execute(
        sql.raw(`SELECT * FROM ${table} WHERE client_id = '${this.clientId}' OR client_id IS NULL`)
      );

      if (localRecords.rows.length === 0) {
        return { synced: 0, conflicts: [] };
      }

      // Call server sync API via tRPC
      const response = await fetch("/api/trpc/sync.push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          table,
          records: localRecords.rows,
          clientId: this.clientId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.result.data;
    } catch (error) {
      console.error(`Failed to push ${table}:`, error);
      return { synced: 0, conflicts: [] };
    }
  }

  private async pullTable(table: string): Promise<{ records: any[]; serverTime: Date }> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      const lastSyncTime = this.lastSyncTimes.get(table);

      // Build tRPC query URL
      const params = new URLSearchParams({
        input: JSON.stringify({
          table,
          lastSyncTime: lastSyncTime?.toISOString(),
          clientId: this.clientId,
        }),
      });

      // Call server sync API via tRPC (GET for queries)
      const response = await fetch(`/api/trpc/sync.pull?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.statusText}`);
      }

      const result = await response.json();
      const { records, serverTime } = result.result.data;

      // Insert or update records in local database
      for (const record of records) {
        await this.upsertRecord(table, record);
      }

      // Update last sync time
      this.lastSyncTimes.set(table, new Date(serverTime));
      this.saveSyncTimes();

      return { records, serverTime: new Date(serverTime) };
    } catch (error) {
      console.error(`Failed to pull ${table}:`, error);
      return { records: [], serverTime: new Date() };
    }
  }

  private async upsertRecord(table: string, record: any) {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Check if record exists
      const existing = await this.db.execute(
        sql.raw(`SELECT id, version FROM ${table} WHERE id = ${record.id}`)
      );

      if (existing.rows.length > 0) {
        // Update existing record
        const columns = Object.keys(record)
          .filter(k => k !== 'id')
          .map(k => `${k} = '${record[k]}'`)
          .join(', ');
        
        await this.db.execute(
          sql.raw(`UPDATE ${table} SET ${columns} WHERE id = ${record.id}`)
        );
      } else {
        // Insert new record
        const columns = Object.keys(record).join(', ');
        const values = Object.values(record)
          .map(v => typeof v === 'string' ? `'${v}'` : v)
          .join(', ');
        
        await this.db.execute(
          sql.raw(`INSERT INTO ${table} (${columns}) VALUES (${values})`)
        );
      }
    } catch (error) {
      console.error(`Failed to upsert record in ${table}:`, error);
      throw error;
    }
  }

  async getStatus() {
    const lastSyncTime = Array.from(this.lastSyncTimes.values())
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;

    return {
      lastSyncTime,
      clientId: this.clientId,
      isOnline: navigator.onLine,
    };
  }
}

// Singleton instance
let syncServiceInstance: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SyncService();
  }
  return syncServiceInstance;
}
