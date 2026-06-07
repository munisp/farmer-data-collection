import { logger } from "../logger.js";

export interface CRDTDocument {
  id: string;
  type: string;
  version: number;
  lastModified: string;
  data: any;
  vectorClock: Record<string, number>;
  conflicts: ConflictRecord[];
}

export interface ConflictRecord {
  field: string;
  localValue: any;
  remoteValue: any;
  resolvedBy: "local_wins" | "remote_wins" | "merge" | "manual";
  resolvedAt: string;
}

export interface SyncState {
  deviceId: string;
  lastSyncedVersion: number;
  pendingChanges: number;
  syncStatus: "synced" | "syncing" | "offline" | "conflict";
  lastSyncAt: string;
}

const documents = new Map<string, CRDTDocument>();
const syncStates = new Map<string, SyncState>();

export function createDocument(id: string, type: string, data: any, deviceId: string): CRDTDocument {
  const doc: CRDTDocument = {
    id, type, version: 1, lastModified: new Date().toISOString(),
    data, vectorClock: { [deviceId]: 1 }, conflicts: [],
  };
  documents.set(id, doc);
  logger.info("[CRDT] Document created", { id, type, deviceId });
  return doc;
}

export function applyUpdate(docId: string, changes: Record<string, any>, deviceId: string): { doc: CRDTDocument; conflicts: ConflictRecord[] } {
  let doc = documents.get(docId);
  if (!doc) {
    doc = createDocument(docId, "unknown", changes, deviceId);
    return { doc, conflicts: [] };
  }

  const newConflicts: ConflictRecord[] = [];
  const currentClock = doc.vectorClock[deviceId] || 0;
  doc.vectorClock[deviceId] = currentClock + 1;

  for (const [key, value] of Object.entries(changes)) {
    if (doc.data[key] !== undefined && doc.data[key] !== value) {
      const conflict: ConflictRecord = {
        field: key, localValue: doc.data[key], remoteValue: value,
        resolvedBy: resolveConflict(key, doc.data[key], value),
        resolvedAt: new Date().toISOString(),
      };
      newConflicts.push(conflict);
      doc.conflicts.push(conflict);

      if (conflict.resolvedBy === "remote_wins" || conflict.resolvedBy === "merge") {
        doc.data[key] = value;
      }
    } else {
      doc.data[key] = value;
    }
  }

  doc.version++;
  doc.lastModified = new Date().toISOString();
  documents.set(docId, doc);

  return { doc, conflicts: newConflicts };
}

function resolveConflict(field: string, localValue: any, remoteValue: any): "local_wins" | "remote_wins" | "merge" {
  if (typeof localValue === "number" && typeof remoteValue === "number") {
    return "remote_wins";
  }
  if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
    return "merge";
  }
  if (typeof localValue === "string" && typeof remoteValue === "string") {
    return remoteValue.length > localValue.length ? "remote_wins" : "local_wins";
  }
  return "remote_wins";
}

export function mergeDocuments(localDoc: CRDTDocument, remoteDoc: CRDTDocument): CRDTDocument {
  const merged: CRDTDocument = { ...localDoc };

  for (const [device, clock] of Object.entries(remoteDoc.vectorClock)) {
    merged.vectorClock[device] = Math.max(merged.vectorClock[device] || 0, clock);
  }

  for (const [key, value] of Object.entries(remoteDoc.data)) {
    if (merged.data[key] === undefined) {
      merged.data[key] = value;
    } else if (Array.isArray(merged.data[key]) && Array.isArray(value)) {
      const mergedArr = [...new Set([...merged.data[key], ...value])];
      merged.data[key] = mergedArr;
    }
  }

  merged.version = Math.max(localDoc.version, remoteDoc.version) + 1;
  merged.lastModified = new Date().toISOString();
  documents.set(merged.id, merged);
  return merged;
}

export function getSyncState(deviceId: string): SyncState {
  return syncStates.get(deviceId) || { deviceId, lastSyncedVersion: 0, pendingChanges: 0, syncStatus: "offline", lastSyncAt: "" };
}

export function updateSyncState(deviceId: string, updates: Partial<SyncState>): SyncState {
  const current = getSyncState(deviceId);
  const updated = { ...current, ...updates };
  syncStates.set(deviceId, updated);
  return updated;
}

export function getDocumentsSince(sinceVersion: number, type?: string): CRDTDocument[] {
  const docs = Array.from(documents.values());
  let filtered = docs.filter(d => d.version > sinceVersion);
  if (type) filtered = filtered.filter(d => d.type === type);
  return filtered;
}

export function getSyncStats() {
  const docs = Array.from(documents.values());
  const states = Array.from(syncStates.values());
  return {
    totalDocuments: docs.length,
    totalConflicts: docs.reduce((s, d) => s + d.conflicts.length, 0),
    activeDevices: states.filter(s => s.syncStatus !== "offline").length,
    offlineDevices: states.filter(s => s.syncStatus === "offline").length,
    pendingSync: states.reduce((s, st) => s + st.pendingChanges, 0),
  };
}
