import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: [
      "./drizzle/schema.ts",
      "./drizzle/schema-gps-models.ts",
      "./drizzle/financial-schema.ts",
      "./drizzle/exchange-schema.ts",
    ],
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
