import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, json, index } from "drizzle-orm/pg-core";

/**
 * Distributor Network Schema
 * 
 * Enables farmers to introduce distributors who warehouse produce closer to buyers.
 * All transactions flow through the platform with configurable profit sharing.
 */

// Distributor profiles — verified entities that warehouse and sell produce
export const distributors = pgTable("distributors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // linked user account
  businessName: varchar("business_name", { length: 255 }).notNull(),
  registrationNumber: varchar("registration_number", { length: 100 }),
  contactPerson: varchar("contact_person", { length: 200 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  // Warehouse/coverage info
  warehouseAddress: text("warehouse_address").notNull(),
  warehouseCapacityKg: decimal("warehouse_capacity_kg", { precision: 12, scale: 2 }),
  coverageRegions: json("coverage_regions").$type<string[]>(), // regions they serve
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  // KYC — Personal Identity
  ninNumber: varchar("nin_number", { length: 11 }), // National Identification Number
  bvnNumber: varchar("bvn_number", { length: 11 }), // Bank Verification Number
  dateOfBirth: varchar("date_of_birth", { length: 10 }), // YYYY-MM-DD
  gender: varchar("gender", { length: 10 }),
  nationality: varchar("nationality", { length: 50 }).default("Nigerian"),
  idDocumentType: varchar("id_document_type", { length: 30 }), // passport, drivers_license, voters_card, nin_slip
  idDocumentNumber: varchar("id_document_number", { length: 50 }),
  idDocumentExpiry: varchar("id_document_expiry", { length: 10 }),
  // KYC — Business Verification
  cacNumber: varchar("cac_number", { length: 50 }), // Corporate Affairs Commission registration
  tinNumber: varchar("tin_number", { length: 20 }), // Tax Identification Number
  businessType: varchar("business_type", { length: 30 }), // sole_proprietorship, partnership, limited_company
  yearEstablished: integer("year_established"),
  numberOfEmployees: integer("number_of_employees"),
  annualRevenueRange: varchar("annual_revenue_range", { length: 30 }), // under_1m, 1m_10m, 10m_50m, 50m_100m, above_100m
  directors: json("directors").$type<Array<{ name: string; nin?: string; phone?: string; role: string }>>(),
  // KYC — Bank Account Details (for profit disbursement)
  bankName: varchar("bank_name", { length: 100 }),
  bankCode: varchar("bank_code", { length: 10 }),
  accountNumber: varchar("account_number", { length: 10 }),
  accountName: varchar("account_name", { length: 200 }),
  accountBvn: varchar("account_bvn", { length: 11 }), // BVN linked to bank account
  bankVerified: boolean("bank_verified").default(false),
  bankVerifiedAt: timestamp("bank_verified_at"),
  // KYC — Address Verification
  residentialAddress: text("residential_address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  lgaDistrict: varchar("lga_district", { length: 100 }), // Local Government Area
  postalCode: varchar("postal_code", { length: 10 }),
  // KYC — Document Uploads
  kycDocuments: json("kyc_documents").$type<Array<{
    type: string; // id_front, id_back, cac_certificate, tin_certificate, utility_bill, warehouse_proof, passport_photo, bank_statement
    url: string;
    uploadedAt: string;
    verified: boolean;
    verifiedBy?: number;
    verifiedAt?: string;
    rejectionReason?: string;
  }>>(),
  // KYC Status
  kycStatus: varchar("kyc_status", { length: 30 }).default("not_started"), // not_started, in_progress, submitted, under_review, approved, rejected
  kycSubmittedAt: timestamp("kyc_submitted_at"),
  kycReviewedAt: timestamp("kyc_reviewed_at"),
  kycReviewedBy: integer("kyc_reviewed_by"),
  kycRejectionReasons: json("kyc_rejection_reasons").$type<string[]>(),
  kycLevel: integer("kyc_level").default(0), // 0=none, 1=basic, 2=enhanced, 3=full
  // Verification
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending, kyc_required, approved, rejected, suspended
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by"),
  rejectionReason: text("rejection_reason"),
  // Documents for verification (legacy — use kycDocuments for new uploads)
  documents: json("documents").$type<Array<{ type: string; url: string; uploadedAt: string }>>(),
  // Performance metrics
  totalSalesCount: integer("total_sales_count").default(0),
  totalSalesValue: decimal("total_sales_value", { precision: 14, scale: 2 }).default("0"),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("idx_distributors_user_id").on(table.userId),
  statusIdx: index("idx_distributors_status").on(table.status),
  kycStatusIdx: index("idx_distributors_kyc_status").on(table.kycStatus),
}));

// Partnership between a farmer and a distributor with profit-split terms
export const distributorPartnerships = pgTable("distributor_partnerships", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull(),
  distributorId: integer("distributor_id").notNull(),
  // Profit split configuration (percentages must sum to 100)
  farmerSharePercent: decimal("farmer_share_percent", { precision: 5, scale: 2 }).notNull(), // e.g. 70.00
  distributorSharePercent: decimal("distributor_share_percent", { precision: 5, scale: 2 }).notNull(), // e.g. 20.00
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }).notNull(), // e.g. 10.00
  // Terms
  agreementTerms: text("agreement_terms"),
  commodities: json("commodities").$type<string[]>(), // which produce types this covers
  minimumOrderKg: decimal("minimum_order_kg", { precision: 10, scale: 2 }),
  // Status
  status: varchar("status", { length: 30 }).default("proposed").notNull(), // proposed, active, paused, terminated
  proposedBy: varchar("proposed_by", { length: 20 }).notNull(), // "farmer" or "distributor"
  acceptedAt: timestamp("accepted_at"),
  terminatedAt: timestamp("terminated_at"),
  terminationReason: text("termination_reason"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("idx_partnerships_farmer_id").on(table.farmerId),
  distributorIdx: index("idx_partnerships_distributor_id").on(table.distributorId),
  statusIdx: index("idx_partnerships_status").on(table.status),
}));

// Consignment: produce shipped from farmer to distributor warehouse
export const consignments = pgTable("consignments", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull(),
  farmerId: integer("farmer_id").notNull(),
  distributorId: integer("distributor_id").notNull(),
  // Produce details
  commodity: varchar("commodity", { length: 100 }).notNull(),
  varietyOrGrade: varchar("variety_or_grade", { length: 100 }),
  quantityKg: decimal("quantity_kg", { precision: 10, scale: 2 }).notNull(),
  remainingKg: decimal("remaining_kg", { precision: 10, scale: 2 }).notNull(), // decreases as sold
  // Pricing (set by farmer/platform)
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN").notNull(),
  // Logistics
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  expectedArrival: timestamp("expected_arrival"),
  trackingReference: varchar("tracking_reference", { length: 100 }),
  // Quality
  qualityGrade: varchar("quality_grade", { length: 20 }), // A, B, C
  qualityNotes: text("quality_notes"),
  inspectedBy: integer("inspected_by"),
  inspectedAt: timestamp("inspected_at"),
  // Status
  status: varchar("status", { length: 30 }).default("preparing").notNull(), // preparing, shipped, in_transit, received, stored, partially_sold, sold_out, spoiled, returned
  // Expiry/freshness
  harvestDate: timestamp("harvest_date"),
  expiryDate: timestamp("expiry_date"),
  storageConditions: varchar("storage_conditions", { length: 100 }), // cold_chain, dry, ambient
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  partnershipIdx: index("idx_consignments_partnership_id").on(table.partnershipId),
  farmerIdx: index("idx_consignments_farmer_id").on(table.farmerId),
  distributorIdx: index("idx_consignments_distributor_id").on(table.distributorId),
  statusIdx: index("idx_consignments_status").on(table.status),
  commodityIdx: index("idx_consignments_commodity").on(table.commodity),
}));

// Sales made by distributor from consigned produce
export const distributorSales = pgTable("distributor_sales", {
  id: serial("id").primaryKey(),
  consignmentId: integer("consignment_id").notNull(),
  distributorId: integer("distributor_id").notNull(),
  // Buyer info
  buyerName: varchar("buyer_name", { length: 200 }),
  buyerPhone: varchar("buyer_phone", { length: 20 }),
  buyerType: varchar("buyer_type", { length: 50 }), // retailer, wholesaler, restaurant, individual
  // Sale details
  quantityKg: decimal("quantity_kg", { precision: 10, scale: 2 }).notNull(),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN").notNull(),
  // Payment (flows through platform)
  paymentStatus: varchar("payment_status", { length: 30 }).default("pending").notNull(), // pending, collected, split_completed, failed
  paymentReference: varchar("payment_reference", { length: 100 }),
  paymentMethod: varchar("payment_method", { length: 30 }), // mobile_money, bank_transfer, cash_on_platform
  collectedAt: timestamp("collected_at"),
  // Timestamps
  saleDate: timestamp("sale_date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  consignmentIdx: index("idx_dist_sales_consignment_id").on(table.consignmentId),
  distributorIdx: index("idx_dist_sales_distributor_id").on(table.distributorId),
  paymentStatusIdx: index("idx_dist_sales_payment_status").on(table.paymentStatus),
}));

// Profit split records — automatic revenue distribution per sale
export const profitSplits = pgTable("profit_splits", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull(),
  consignmentId: integer("consignment_id").notNull(),
  partnershipId: integer("partnership_id").notNull(),
  // Amounts
  totalSaleAmount: decimal("total_sale_amount", { precision: 14, scale: 2 }).notNull(),
  farmerAmount: decimal("farmer_amount", { precision: 14, scale: 2 }).notNull(),
  distributorAmount: decimal("distributor_amount", { precision: 14, scale: 2 }).notNull(),
  platformAmount: decimal("platform_amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN").notNull(),
  // Split percentages (snapshot at time of sale)
  farmerPercent: decimal("farmer_percent", { precision: 5, scale: 2 }).notNull(),
  distributorPercent: decimal("distributor_percent", { precision: 5, scale: 2 }).notNull(),
  platformPercent: decimal("platform_percent", { precision: 5, scale: 2 }).notNull(),
  // Disbursement status
  farmerDisbursed: boolean("farmer_disbursed").default(false),
  farmerDisbursedAt: timestamp("farmer_disbursed_at"),
  distributorDisbursed: boolean("distributor_disbursed").default(false),
  distributorDisbursedAt: timestamp("distributor_disbursed_at"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  saleIdx: index("idx_profit_splits_sale_id").on(table.saleId),
  partnershipIdx: index("idx_profit_splits_partnership_id").on(table.partnershipId),
}));

// Platform fee configuration (configurable per partnership or global default)
export const distributorFeeConfig = pgTable("distributor_fee_config", {
  id: serial("id").primaryKey(),
  // If partnershipId is null, this is the global default
  partnershipId: integer("partnership_id"),
  platformFeePercent: decimal("platform_fee_percent", { precision: 5, scale: 2 }).notNull(),
  minFeeAmount: decimal("min_fee_amount", { precision: 10, scale: 2 }),
  maxFeeAmount: decimal("max_fee_amount", { precision: 10, scale: 2 }),
  effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  effectiveTo: timestamp("effective_to"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
