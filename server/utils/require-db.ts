import { getDb } from "../db.js";

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}
