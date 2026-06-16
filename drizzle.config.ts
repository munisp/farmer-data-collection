import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: [
      "./drizzle/schema.ts",
      "./drizzle/schema-gps-models.ts",
      "./drizzle/financial-schema.ts",
      "./drizzle/exchange-schema.ts",
      "./drizzle/kyc-schema.ts",
      "./drizzle/supply-chain-schema.ts",
      "./drizzle/cooperative-schema.ts",
      "./drizzle/credit-scoring-schema.ts",
      "./drizzle/traceability-schema.ts",
    ],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
