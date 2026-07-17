/**
 * MobyDB Router — Geospatial Provenance & Spacetime Queries
 *
 * Endpoints for recording verifiable field observations, supply chain steps,
 * epoch management, and Merkle proof generation/verification.
 *
 * Architecture: MobyDB (primary) → PostgreSQL (fallback/mirror)
 * Every record is also persisted to PostgreSQL for relational queries.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { sql, eq, and, desc, gte, lte, count } from "drizzle-orm";
import {
  provenanceRecords,
  provenanceEpochs,
  provenanceKeys,
  supplyChainSteps,
} from "../../drizzle/schema-spatial-engines.js";
import { getMobyDBClient } from "../lib/mobydb-client.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";

const MAX_PAYLOAD_SIZE = 50;

function getUserId(ctx: unknown): number {
  const id = (ctx as { user?: { id: number } }).user?.id;
  if (!id) throw new TRPCError({ code: "UNAUTHORIZED" });
  return id;
}

export const mobydbRouter = router({
  // ── Health / Status ──────────────────────────────────────────────

  status: protectedProcedure.query(async () => {
    const moby = getMobyDBClient();
    const connected = await moby.healthCheck();
    const currentEpoch = connected ? await moby.getCurrentEpoch() : 0;

    const db = await requireDb();
    const [recordStats] = await db.select({ total: count() }).from(provenanceRecords);
    const [epochStats] = await db.select({ total: count() }).from(provenanceEpochs);

    return {
      mobydbConnected: connected,
      currentEpoch,
      totalRecords: recordStats?.total ?? 0,
      totalEpochs: epochStats?.total ?? 0,
      genesisHash: "26acb5d998b63d54f2ed92851c5c565db9fe0930fc06b06091d05c0ce4ff8289",
    };
  }),

  // ── Record a Provenance Event ────────────────────────────────────

  recordObservation: protectedProcedure
    .input(z.object({
      h3Cell: z.string().max(20),
      recordType: z.enum(["field_observation", "consignment", "milk_collection", "carbon_measurement", "harvest", "quality_check"]),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      payload: z.record(z.string(), z.unknown()),
      pubkeyHex: z.string().max(64).optional(),
      signatureHex: z.string().max(128).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("mobydb-write", String(userId), 30, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const db = await requireDb();
      const moby = getMobyDBClient();

      // Get or create user's provenance key
      let pubkey = input.pubkeyHex;
      if (!pubkey) {
        const [existingKey] = await db.select().from(provenanceKeys)
          .where(and(eq(provenanceKeys.userId, userId), eq(provenanceKeys.active, true)))
          .limit(1);
        pubkey = existingKey?.pubkeyHex || crypto.randomUUID().replace(/-/g, "").slice(0, 64);

        if (!existingKey) {
          await db.insert(provenanceKeys).values({
            userId,
            pubkeyHex: pubkey,
            keyType: "ed25519",
            label: "Auto-generated provenance key",
          });
        }
      }

      // Get current epoch
      let epoch = 0;
      if (moby.isConnected()) {
        epoch = await moby.getCurrentEpoch();
      } else {
        const [latestEpoch] = await db.select()
          .from(provenanceEpochs)
          .orderBy(desc(provenanceEpochs.epoch))
          .limit(1);
        epoch = (latestEpoch?.epoch ?? 0) + 1;
      }

      // Write to MobyDB if available
      let mobydbSynced = false;
      if (moby.isConnected()) {
        const result = await moby.writeRecord({
          h3_cell: input.h3Cell,
          epoch,
          pubkey,
          payload: {
            ...input.payload,
            recordType: input.recordType,
            lat: input.latitude,
            lng: input.longitude,
            userId,
          },
          signature: input.signatureHex || "",
        });
        mobydbSynced = result.ok;
      }

      // Always persist to PostgreSQL
      const [record] = await db.insert(provenanceRecords).values({
        h3Cell: input.h3Cell,
        epoch,
        pubkeyHex: pubkey,
        userId,
        recordType: input.recordType,
        payload: input.payload,
        signatureHex: input.signatureHex,
        verified: false,
        mobydbSynced,
        latitude: input.latitude,
        longitude: input.longitude,
      }).returning();

      // Ensure epoch exists
      await db.insert(provenanceEpochs).values({
        epoch,
        sealed: false,
        recordCount: 1,
      }).onConflictDoUpdate({
        target: provenanceEpochs.epoch,
        set: { recordCount: sql`${provenanceEpochs.recordCount} + 1` },
      });

      // Emit Kafka event
      try {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "mobydb.provenance.recorded",
            messages: [{
              key: `${input.h3Cell}:${epoch}`,
              value: JSON.stringify({ recordId: record.id, h3Cell: input.h3Cell, epoch, recordType: input.recordType, userId }),
            }],
          });
        }
      } catch { /* Kafka unavailable */ }

      return {
        id: record.id,
        h3Cell: input.h3Cell,
        epoch,
        pubkey,
        mobydbSynced,
        spacetimeAddress: `${input.h3Cell}/${epoch}/${pubkey}`,
      };
    }),

  // ── Nearby Provenance Query ──────────────────────────────────────

  nearbyRecords: protectedProcedure
    .input(z.object({
      h3Cell: z.string().max(20),
      rings: z.number().int().min(1).max(10).default(2),
      epochStart: z.number().int().optional(),
      epochEnd: z.number().int().optional(),
      recordType: z.string().max(50).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("mobydb-query", String(userId), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const moby = getMobyDBClient();

      // Try MobyDB first
      if (moby.isConnected()) {
        const results = await moby.nearQuery({
          cell: input.h3Cell,
          rings: input.rings,
          epochStart: input.epochStart,
          epochEnd: input.epochEnd,
          limit: input.limit,
        });

        if (results.length > 0) {
          return {
            source: "mobydb" as const,
            records: results.map(r => ({
              h3Cell: r.address.h3Cell,
              epoch: r.address.epoch,
              pubkey: r.address.pubkey,
              payload: r.payload,
              signature: r.signature,
              createdAt: r.createdAt,
            })),
            total: results.length,
          };
        }
      }

      // PostgreSQL fallback — query by H3 cell prefix for proximity
      const db = await requireDb();
      const conditions = [
        sql`${provenanceRecords.h3Cell} LIKE ${input.h3Cell.slice(0, 4) + "%"}`,
      ];
      if (input.epochStart !== undefined) conditions.push(gte(provenanceRecords.epoch, input.epochStart));
      if (input.epochEnd !== undefined) conditions.push(lte(provenanceRecords.epoch, input.epochEnd));
      if (input.recordType) conditions.push(eq(provenanceRecords.recordType, input.recordType));

      const records = await db.select()
        .from(provenanceRecords)
        .where(and(...conditions))
        .orderBy(desc(provenanceRecords.createdAt))
        .limit(input.limit);

      return {
        source: "postgresql" as const,
        records: records.map(r => ({
          id: r.id,
          h3Cell: r.h3Cell,
          epoch: r.epoch,
          pubkey: r.pubkeyHex,
          recordType: r.recordType,
          payload: r.payload,
          verified: r.verified,
          latitude: r.latitude,
          longitude: r.longitude,
          createdAt: r.createdAt,
        })),
        total: records.length,
      };
    }),

  // ── Epoch Management ─────────────────────────────────────────────

  getEpochs: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const epochs = await db.select()
        .from(provenanceEpochs)
        .orderBy(desc(provenanceEpochs.epoch))
        .limit(input.limit);
      return epochs;
    }),

  sealEpoch: protectedProcedure
    .input(z.object({ epoch: z.number().int().min(0) }))
    .mutation(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("mobydb-seal", String(userId), 5, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const db = await requireDb();
      const moby = getMobyDBClient();

      let merkleRoot: string | undefined;
      if (moby.isConnected()) {
        const result = await moby.sealEpoch(input.epoch);
        merkleRoot = result.merkleRoot;
      }

      await db.update(provenanceEpochs)
        .set({
          sealed: true,
          merkleRoot: merkleRoot || null,
          sealedAt: new Date(),
        })
        .where(eq(provenanceEpochs.epoch, input.epoch));

      // Update records with Merkle root
      if (merkleRoot) {
        await db.update(provenanceRecords)
          .set({ merkleRoot })
          .where(eq(provenanceRecords.epoch, input.epoch));
      }

      return { epoch: input.epoch, sealed: true, merkleRoot };
    }),

  // ── Merkle Proofs ────────────────────────────────────────────────

  generateProof: protectedProcedure
    .input(z.object({
      h3Cell: z.string().max(20),
      epoch: z.number().int(),
      pubkeyHex: z.string().max(64),
    }))
    .query(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("mobydb-proof", String(userId), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const moby = getMobyDBClient();

      if (moby.isConnected()) {
        const proof = await moby.generateProof(input.h3Cell, input.epoch, input.pubkeyHex);
        if (proof) return { source: "mobydb" as const, ...proof };
      }

      // PostgreSQL fallback — return record existence proof
      const db = await requireDb();
      const [record] = await db.select()
        .from(provenanceRecords)
        .where(and(
          eq(provenanceRecords.h3Cell, input.h3Cell),
          eq(provenanceRecords.epoch, input.epoch),
          eq(provenanceRecords.pubkeyHex, input.pubkeyHex),
        ))
        .limit(1);

      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Record not found at spacetime address" });

      return {
        source: "postgresql" as const,
        cell: record.h3Cell,
        epoch: record.epoch,
        pubkey: record.pubkeyHex,
        root: record.merkleRoot || "pending",
        proof: [],
        verified: record.verified ?? false,
        recordId: record.id,
        recordType: record.recordType,
        payload: record.payload,
      };
    }),

  verifyProof: protectedProcedure
    .input(z.object({
      cell: z.string().max(20),
      epoch: z.number().int(),
      pubkey: z.string().max(64),
      root: z.string().max(64),
      proof: z.array(z.string().max(64)),
    }))
    .mutation(async ({ input }) => {
      const moby = getMobyDBClient();

      if (moby.isConnected()) {
        const verified = await moby.verifyProof({
          cell: input.cell,
          epoch: input.epoch,
          pubkey: input.pubkey,
          root: input.root,
          proof: input.proof,
          verified: false,
        });

        if (verified) {
          const db = await requireDb();
          await db.update(provenanceRecords)
            .set({ verified: true })
            .where(and(
              eq(provenanceRecords.h3Cell, input.cell),
              eq(provenanceRecords.epoch, input.epoch),
              eq(provenanceRecords.pubkeyHex, input.pubkey),
            ));
        }

        return { verified };
      }

      return { verified: false, reason: "MobyDB not available for proof verification" };
    }),

  // ── Supply Chain Provenance ──────────────────────────────────────

  recordSupplyChainStep: protectedProcedure
    .input(z.object({
      chainId: z.string().max(100),
      stepType: z.enum(["harvest", "storage", "transport", "processing", "delivery"]),
      h3Cell: z.string().max(20).optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      payload: z.record(z.string(), z.unknown()),
      actorPubkey: z.string().max(64).optional(),
      actorName: z.string().max(200).optional(),
      signatureHex: z.string().max(128).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("mobydb-supply-chain", String(userId), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const db = await requireDb();

      // Get next step number
      const [lastStep] = await db.select()
        .from(supplyChainSteps)
        .where(eq(supplyChainSteps.chainId, input.chainId))
        .orderBy(desc(supplyChainSteps.stepNumber))
        .limit(1);
      const stepNumber = (lastStep?.stepNumber ?? 0) + 1;

      // Get actor's provenance key
      let actorPubkey = input.actorPubkey;
      if (!actorPubkey) {
        const [key] = await db.select().from(provenanceKeys)
          .where(and(eq(provenanceKeys.userId, userId), eq(provenanceKeys.active, true)))
          .limit(1);
        actorPubkey = key?.pubkeyHex || crypto.randomUUID().replace(/-/g, "").slice(0, 64);
      }

      // Record provenance observation
      let provenanceRecordId: number | undefined;
      if (input.h3Cell) {
        const moby = getMobyDBClient();
        let epoch = 0;
        if (moby.isConnected()) {
          epoch = await moby.getCurrentEpoch();
        }

        const [provRecord] = await db.insert(provenanceRecords).values({
          h3Cell: input.h3Cell,
          epoch,
          pubkeyHex: actorPubkey,
          userId,
          recordType: "consignment",
          payload: { ...input.payload, chainId: input.chainId, stepType: input.stepType, stepNumber },
          signatureHex: input.signatureHex,
          latitude: input.latitude,
          longitude: input.longitude,
          mobydbSynced: false,
        }).returning();
        provenanceRecordId = provRecord.id;
      }

      const [step] = await db.insert(supplyChainSteps).values({
        chainId: input.chainId,
        stepNumber,
        stepType: input.stepType,
        actorPubkey,
        actorName: input.actorName,
        h3Cell: input.h3Cell,
        latitude: input.latitude,
        longitude: input.longitude,
        payload: input.payload,
        signatureHex: input.signatureHex,
        provenanceRecordId,
      }).returning();

      // Emit Kafka event
      try {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "mobydb.supply-chain.step",
            messages: [{
              key: input.chainId,
              value: JSON.stringify({ stepId: step.id, chainId: input.chainId, stepType: input.stepType, stepNumber }),
            }],
          });
        }
      } catch { /* Kafka unavailable */ }

      return {
        stepId: step.id,
        chainId: input.chainId,
        stepNumber,
        provenanceRecordId,
      };
    }),

  getSupplyChain: protectedProcedure
    .input(z.object({ chainId: z.string().max(100) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const steps = await db.select()
        .from(supplyChainSteps)
        .where(eq(supplyChainSteps.chainId, input.chainId))
        .orderBy(supplyChainSteps.stepNumber);

      return {
        chainId: input.chainId,
        steps: steps.map(s => ({
          id: s.id,
          stepNumber: s.stepNumber,
          stepType: s.stepType,
          actorName: s.actorName,
          h3Cell: s.h3Cell,
          latitude: s.latitude,
          longitude: s.longitude,
          payload: s.payload,
          verified: !!s.verifiedAt,
          createdAt: s.createdAt,
        })),
        totalSteps: steps.length,
        complete: steps.some(s => s.stepType === "delivery"),
      };
    }),

  // ── User's Provenance Keys ──────────────────────────────────────

  getMyKeys: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserId(ctx);
    const db = await requireDb();
    return db.select()
      .from(provenanceKeys)
      .where(eq(provenanceKeys.userId, userId))
      .orderBy(desc(provenanceKeys.createdAt));
  }),

  // ── Dashboard Stats ──────────────────────────────────────────────

  dashboardStats: protectedProcedure.query(async () => {
    const db = await requireDb();
    const moby = getMobyDBClient();

    const [recordCount] = await db.select({ total: count() }).from(provenanceRecords);
    const [epochCount] = await db.select({ total: count() }).from(provenanceEpochs);
    const [sealedCount] = await db.select({ total: count() }).from(provenanceEpochs).where(eq(provenanceEpochs.sealed, true));
    const [chainCount] = await db.select({ total: sql<number>`COUNT(DISTINCT ${supplyChainSteps.chainId})` }).from(supplyChainSteps);
    const [verifiedCount] = await db.select({ total: count() }).from(provenanceRecords).where(eq(provenanceRecords.verified, true));

    return {
      mobydbConnected: moby.isConnected(),
      totalRecords: recordCount?.total ?? 0,
      totalEpochs: epochCount?.total ?? 0,
      sealedEpochs: sealedCount?.total ?? 0,
      activeChains: chainCount?.total ?? 0,
      verifiedRecords: verifiedCount?.total ?? 0,
    };
  }),
});
