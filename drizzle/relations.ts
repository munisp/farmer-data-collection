/**
 * relations.ts
 * Comprehensive Drizzle ORM relations for all schemas.
 * Enables type-safe joins and query building across all tables.
 */
import { relations } from "drizzle-orm";
import { users, farms, crops, livestock, harvests, expenses } from "./schema.js";
import { chamaGroups, chamaMembers, chamaTransactions } from "./schema-platform-extended.js";
import { carbonProjects, carbonCredits } from "./schema-platform-extended.js";
import { digitalTwins, iotDevices, iotReadings, iotRules } from "./schema-platform-extended.js";
import { exportShipments, exportCertifications } from "./schema-platform-extended.js";
import { federatedModels, federatedParticipants } from "./schema-platform-extended.js";
import { insuranceProducts, insurancePolicies, insuranceClaims } from "./schema-platform-extended.js";
import { marketPrices, marketAlerts } from "./schema-platform-extended.js";
import { pipelineJobs, pipelineMetrics } from "./schema-platform-extended.js";
import { complianceRules, paymentTransactions } from "./schema-platform-extended.js";
import { soilSamples, predictions, retailStores, retailInventory } from "./schema-platform-extended.js";

// ── Users ──────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  farms: many(farms),
  chamaGroups: many(chamaGroups, { relationName: "chairperson" }),
  chamaMembers: many(chamaMembers),
  insurancePolicies: many(insurancePolicies),
  insuranceClaims: many(insuranceClaims),
  marketAlerts: many(marketAlerts),
  paymentTransactions: many(paymentTransactions),
  retailStores: many(retailStores),
  federatedParticipants: many(federatedParticipants),
}));

// ── Farms ──────────────────────────────────────────────────────────────────
export const farmsRelations = relations(farms, ({ one, many }) => ({
  owner: one(users, { fields: [farms.userId], references: [users.id] }),
  crops: many(crops),
  livestock: many(livestock),
  harvests: many(harvests),
  expenses: many(expenses),
  digitalTwin: many(digitalTwins),
  iotDevices: many(iotDevices),
  soilSamples: many(soilSamples),
  predictions: many(predictions),
}));

// ── Chama ──────────────────────────────────────────────────────────────────
export const chamaGroupsRelations = relations(chamaGroups, ({ many }) => ({
  members: many(chamaMembers),
  transactions: many(chamaTransactions),
}));

export const chamaMembersRelations = relations(chamaMembers, ({ one }) => ({
  chama: one(chamaGroups, { fields: [chamaMembers.chamaId], references: [chamaGroups.id] }),
}));

export const chamaTransactionsRelations = relations(chamaTransactions, ({ one }) => ({
  chama: one(chamaGroups, { fields: [chamaTransactions.chamaId], references: [chamaGroups.id] }),
}));

// ── Carbon Credits ─────────────────────────────────────────────────────────
export const carbonProjectsRelations = relations(carbonProjects, ({ many }) => ({
  credits: many(carbonCredits),
}));

export const carbonCreditsRelations = relations(carbonCredits, ({ one }) => ({
  project: one(carbonProjects, { fields: [carbonCredits.projectId], references: [carbonProjects.id] }),
}));

// ── Digital Twin & IoT ─────────────────────────────────────────────────────
export const iotDevicesRelations = relations(iotDevices, ({ many }) => ({
  readings: many(iotReadings),
}));

export const iotReadingsRelations = relations(iotReadings, ({ one }) => ({
  device: one(iotDevices, { fields: [iotReadings.deviceId], references: [iotDevices.id] }),
}));

// ── Export Chain ───────────────────────────────────────────────────────────
export const exportShipmentsRelations = relations(exportShipments, ({ many }) => ({
  certifications: many(exportCertifications),
}));

export const exportCertificationsRelations = relations(exportCertifications, ({ one }) => ({
  shipment: one(exportShipments, { fields: [exportCertifications.shipmentId], references: [exportShipments.id] }),
}));

// ── Federated Learning ─────────────────────────────────────────────────────
export const federatedModelsRelations = relations(federatedModels, ({ many }) => ({
  participants: many(federatedParticipants),
}));

export const federatedParticipantsRelations = relations(federatedParticipants, ({ one }) => ({
  model: one(federatedModels, { fields: [federatedParticipants.modelId], references: [federatedModels.id] }),
}));

// ── Insurance ──────────────────────────────────────────────────────────────
export const insuranceProductsRelations = relations(insuranceProducts, ({ many }) => ({
  policies: many(insurancePolicies),
}));

export const insurancePoliciesRelations = relations(insurancePolicies, ({ one, many }) => ({
  product: one(insuranceProducts, { fields: [insurancePolicies.productId], references: [insuranceProducts.id] }),
  claims: many(insuranceClaims),
}));

export const insuranceClaimsRelations = relations(insuranceClaims, ({ one }) => ({
  policy: one(insurancePolicies, { fields: [insuranceClaims.policyId], references: [insurancePolicies.id] }),
}));

// ── Pipeline ───────────────────────────────────────────────────────────────
export const pipelineJobsRelations = relations(pipelineJobs, ({ many }) => ({
  metrics: many(pipelineMetrics),
}));

export const pipelineMetricsRelations = relations(pipelineMetrics, ({ one }) => ({
  job: one(pipelineJobs, { fields: [pipelineMetrics.jobId], references: [pipelineJobs.id] }),
}));

// ── Retail ─────────────────────────────────────────────────────────────────
export const retailStoresRelations = relations(retailStores, ({ many }) => ({
  inventory: many(retailInventory),
}));

export const retailInventoryRelations = relations(retailInventory, ({ one }) => ({
  store: one(retailStores, { fields: [retailInventory.storeId], references: [retailStores.id] }),
}));
