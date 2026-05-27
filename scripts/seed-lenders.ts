import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { lenders } from "../drizzle/financial-schema.js";

/**
 * Seed script for Nigerian microfinance lenders
 * 
 * This script populates the database with realistic Nigerian microfinance institutions
 * offering agricultural loans to smallholder farmers.
 * 
 * Usage: npx tsx scripts/seed-lenders.ts
 */

const sampleLenders = [
  {
    name: "LAPO Microfinance Bank",
    type: "microfinance",
    contactPerson: "Customer Service Manager",
    phoneNumber: "+234-1-280-2470",
    email: "info@lapo-nigeria.org",
    address: "LAPO House, 15 Ikorodu Road, Maryland, Lagos, Nigeria",
    interestRateRange: "24-30% per annum",
    minLoanAmount: 5000000, // ₦50,000 in cents
    maxLoanAmount: 500000000, // ₦5,000,000 in cents
    isActive: true,
  },
  {
    name: "Accion Microfinance Bank",
    type: "microfinance",
    contactPerson: "MSME Loan Officer",
    phoneNumber: "+234-700-2224-6622",
    email: "customercare@accionmfb.com",
    address: "4th Floor, Elizade Plaza, 322A Ikorodu Road, Anthony, Lagos, Nigeria",
    interestRateRange: "20-24% per annum",
    minLoanAmount: 10000000, // ₦100,000 in cents
    maxLoanAmount: 1000000000, // ₦10,000,000 in cents
    isActive: true,
  },
  {
    name: "Grooming Centre Microfinance Bank",
    type: "microfinance",
    contactPerson: "Rural Banking Manager",
    phoneNumber: "+234-803-456-7890",
    email: "info@groomingmfb.com",
    address: "Plot 123, Ahmadu Bello Way, Kaduna, Nigeria",
    interestRateRange: "30-36% per annum",
    minLoanAmount: 3000000, // ₦30,000 in cents
    maxLoanAmount: 300000000, // ₦3,000,000 in cents
    isActive: true,
  },
  {
    name: "AB Microfinance Bank",
    type: "microfinance",
    contactPerson: "Agricultural Loans Specialist",
    phoneNumber: "+234-809-123-4567",
    email: "loans@abmicrofinance.ng",
    address: "15 Market Road, Ibadan, Oyo State, Nigeria",
    interestRateRange: "22-26% per annum",
    minLoanAmount: 7500000, // ₦75,000 in cents
    maxLoanAmount: 750000000, // ₦7,500,000 in cents
    isActive: true,
  },
  {
    name: "Fortis Microfinance Bank",
    type: "microfinance",
    contactPerson: "Digital Banking Manager",
    phoneNumber: "+234-700-367-8471",
    email: "support@fortismfb.com",
    address: "Tech Hub Building, Lekki Phase 1, Lagos, Nigeria",
    interestRateRange: "28-34% per annum",
    minLoanAmount: 5000000, // ₦50,000 in cents
    maxLoanAmount: 500000000, // ₦5,000,000 in cents
    isActive: true,
  },
  {
    name: "Nirsal Microfinance Bank",
    type: "bank",
    contactPerson: "Agricultural Finance Director",
    phoneNumber: "+234-1-631-6200",
    email: "info@nirsalmfb.com",
    address: "NIRSAL House, Plot 1311 Tigris Crescent, Maitama, Abuja, Nigeria",
    interestRateRange: "15-18% per annum",
    minLoanAmount: 10000000, // ₦100,000 in cents
    maxLoanAmount: 1500000000, // ₦15,000,000 in cents
    isActive: true,
  },
  {
    name: "Seedvest Microfinance",
    type: "ngo",
    contactPerson: "Youth Programs Coordinator",
    phoneNumber: "+234-802-345-6789",
    email: "hello@seedvest.ng",
    address: "Agric Innovation Center, Enugu, Nigeria",
    interestRateRange: "35-42% per annum",
    minLoanAmount: 2500000, // ₦25,000 in cents
    maxLoanAmount: 200000000, // ₦2,000,000 in cents
    isActive: true,
  },
  {
    name: "AgriCapital Finance",
    type: "bank",
    contactPerson: "Commercial Lending Head",
    phoneNumber: "+234-1-888-9999",
    email: "commercial@agricapital.ng",
    address: "AgriCapital Tower, Victoria Island, Lagos, Nigeria",
    interestRateRange: "18-22% per annum",
    minLoanAmount: 100000000, // ₦1,000,000 in cents
    maxLoanAmount: 2000000000, // ₦20,000,000 in cents (max int32 is ~2.1B)
    isActive: true,
  },
];

async function seedLenders() {
  // Use local PostgreSQL database (same as server/db.ts)
  const databaseUrl = "postgresql://postgres:postgres@localhost:5432/farmer_data";

  console.log("🌱 Starting lender seeding process...");
  console.log(`📊 Database: localhost:5432/farmer_data`);

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: false, // Disable SSL for local PostgreSQL
  });

  const db = drizzle(pool);

  try {
    console.log(`\n📝 Inserting ${sampleLenders.length} Nigerian microfinance lenders...`);

    for (const lender of sampleLenders) {
      await db.insert(lenders).values(lender);
      const minNaira = lender.minLoanAmount / 100;
      const maxNaira = lender.maxLoanAmount / 100;
      console.log(`  ✅ ${lender.name} - ₦${minNaira.toLocaleString()} to ₦${maxNaira.toLocaleString()} @ ${lender.interestRateRange}`);
    }

    console.log("\n✨ Lender seeding completed successfully!");
    console.log("\n📋 Summary:");
    console.log(`  Total lenders: ${sampleLenders.length}`);
    const minLoanNaira = Math.min(...sampleLenders.map(l => l.minLoanAmount)) / 100;
    const maxLoanNaira = Math.max(...sampleLenders.map(l => l.maxLoanAmount)) / 100;
    console.log(`  Lender types: ${[...new Set(sampleLenders.map(l => l.type))].join(", ")}`);
    console.log(`  Loan range: ₦${minLoanNaira.toLocaleString()} - ₦${maxLoanNaira.toLocaleString()}`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error seeding lenders:", error);
    process.exit(1);
  }
}

seedLenders();
