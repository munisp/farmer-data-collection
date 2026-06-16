import { TRPCError } from "@trpc/server";
import { getDb } from "../db.js";

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}
