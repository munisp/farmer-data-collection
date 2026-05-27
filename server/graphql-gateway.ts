/**
 * GraphQL Gateway Layer
 * 
 * Provides a GraphQL API on top of the tRPC router for flexible client queries.
 * Reduces over-fetching on mobile and allows third-party integrations via standard GraphQL.
 * 
 * Endpoint: /graphql
 * Playground: /graphql (browser)
 */

import { z } from "zod";

interface GraphQLField {
  type: string;
  description: string;
  args?: Record<string, { type: string; required?: boolean }>;
}

interface GraphQLType {
  name: string;
  description: string;
  fields: Record<string, GraphQLField>;
}

const SCHEMA_TYPES: GraphQLType[] = [
  {
    name: "Farmer",
    description: "Registered farmer profile",
    fields: {
      id: { type: "Int!", description: "Farmer ID" },
      userId: { type: "Int!", description: "User ID reference" },
      name: { type: "String!", description: "Full name" },
      phoneNumber: { type: "String", description: "Phone number" },
      location: { type: "Location", description: "GPS coordinates" },
      farms: { type: "[Farm!]!", description: "Farmer's farms" },
      crops: { type: "[Crop!]!", description: "Active crops" },
      creditScore: { type: "CreditScore", description: "Credit score info" },
    },
  },
  {
    name: "ProduceListing",
    description: "Marketplace listing",
    fields: {
      id: { type: "Int!", description: "Listing ID" },
      title: { type: "String!", description: "Product title" },
      cropType: { type: "String!", description: "Crop type" },
      quantity: { type: "Float!", description: "Available quantity" },
      unit: { type: "String!", description: "Unit of measurement" },
      pricePerUnit: { type: "Float!", description: "Price per unit" },
      currency: { type: "String!", description: "Currency code" },
      seller: { type: "Farmer!", description: "Seller info" },
      qualityGrade: { type: "String", description: "Quality grade" },
      location: { type: "Location", description: "Farm location" },
      bulkDiscounts: { type: "[BulkDiscount!]", description: "Volume discounts" },
      offers: { type: "[NegotiationOffer!]", description: "Buyer offers" },
    },
  },
  {
    name: "Delivery",
    description: "Delivery tracking",
    fields: {
      id: { type: "Int!", description: "Delivery ID" },
      orderId: { type: "Int!", description: "Order reference" },
      status: { type: "DeliveryStatus!", description: "Current status" },
      driver: { type: "Driver", description: "Assigned driver" },
      route: { type: "Route", description: "Delivery route" },
      currentLocation: { type: "Location", description: "Current GPS" },
      estimatedArrival: { type: "DateTime", description: "ETA" },
      temperature: { type: "Float", description: "Cold chain temp" },
    },
  },
  {
    name: "Loan",
    description: "Microfinance loan",
    fields: {
      id: { type: "Int!", description: "Loan ID" },
      borrowerId: { type: "Int!", description: "Borrower farmer ID" },
      amount: { type: "Float!", description: "Loan amount" },
      currency: { type: "String!", description: "Currency" },
      interestRate: { type: "Float!", description: "Interest rate %" },
      status: { type: "LoanStatus!", description: "Loan status" },
      nextPaymentDate: { type: "DateTime", description: "Next payment" },
      outstandingBalance: { type: "Float!", description: "Remaining balance" },
    },
  },
  {
    name: "WeatherAlert",
    description: "Hyperlocal weather alert",
    fields: {
      id: { type: "Int!", description: "Alert ID" },
      alertType: { type: "AlertType!", description: "Type (frost, flood, etc)" },
      region: { type: "String!", description: "Affected region" },
      severity: { type: "String!", description: "Severity level" },
      message: { type: "String!", description: "Alert message" },
      affectedArea: { type: "GeoJSON", description: "Geofenced area" },
    },
  },
];

const QUERIES: Record<string, { returnType: string; args: Record<string, string>; description: string }> = {
  farmer: { returnType: "Farmer", args: { id: "Int!" }, description: "Get farmer by ID" },
  farmers: { returnType: "[Farmer!]!", args: { limit: "Int", offset: "Int", region: "String" }, description: "List farmers" },
  listing: { returnType: "ProduceListing", args: { id: "Int!" }, description: "Get listing by ID" },
  listings: { returnType: "[ProduceListing!]!", args: { crop: "String", minPrice: "Float", maxPrice: "Float", region: "String" }, description: "Search listings" },
  delivery: { returnType: "Delivery", args: { id: "Int!" }, description: "Track delivery" },
  myLoans: { returnType: "[Loan!]!", args: {}, description: "Get authenticated user's loans" },
  weatherAlerts: { returnType: "[WeatherAlert!]!", args: { region: "String!", active: "Boolean" }, description: "Get weather alerts for region" },
  cropPrice: { returnType: "PriceInfo!", args: { crop: "String!", region: "String" }, description: "Get current crop price" },
  soilHealth: { returnType: "SoilHealthPassport!", args: { farmId: "Int!" }, description: "Get soil health data" },
};

const MUTATIONS: Record<string, { returnType: string; args: Record<string, string>; description: string }> = {
  createListing: { returnType: "ProduceListing!", args: { input: "CreateListingInput!" }, description: "Create marketplace listing" },
  makeOffer: { returnType: "NegotiationOffer!", args: { listingId: "Int!", price: "Float!", quantity: "Int!" }, description: "Make offer on listing" },
  requestDelivery: { returnType: "Delivery!", args: { orderId: "Int!", zoneId: "Int!" }, description: "Request delivery" },
  applyForLoan: { returnType: "LoanApplication!", args: { input: "LoanApplicationInput!" }, description: "Apply for loan" },
  triggerMobilePayment: { returnType: "PaymentResult!", args: { provider: "String!", phone: "String!", amount: "Float!" }, description: "Initiate mobile money" },
};

export function generateGraphQLSchema(): string {
  let schema = "";

  for (const t of SCHEMA_TYPES) {
    schema += `type ${t.name} {\n`;
    for (const [fname, f] of Object.entries(t.fields)) {
      schema += `  """${f.description}"""\n  ${fname}: ${f.type}\n`;
    }
    schema += `}\n\n`;
  }

  schema += `type Query {\n`;
  for (const [name, q] of Object.entries(QUERIES)) {
    const args = Object.entries(q.args).map(([k, v]) => `${k}: ${v}`).join(", ");
    schema += `  """${q.description}"""\n  ${name}${args ? `(${args})` : ""}: ${q.returnType}\n`;
  }
  schema += `}\n\n`;

  schema += `type Mutation {\n`;
  for (const [name, m] of Object.entries(MUTATIONS)) {
    const args = Object.entries(m.args).map(([k, v]) => `${k}: ${v}`).join(", ");
    schema += `  """${m.description}"""\n  ${name}(${args}): ${m.returnType}\n`;
  }
  schema += `}\n`;

  return schema;
}

export function createGraphQLResolvers() {
  return {
    Query: {
      async farmer(_: unknown, args: { id: number }) {
        const { requireDb } = await import("./utils/require-db.js");
        const { farmers } = await import("../drizzle/schema.js");
        const { eq } = await import("drizzle-orm");
        const db = await requireDb();
        const [farmer] = await db.select().from(farmers).where(eq(farmers.id, args.id)).limit(1);
        return farmer ?? null;
      },
      async listings(_: unknown, args: { crop?: string; minPrice?: number; maxPrice?: number }) {
        const { requireDb } = await import("./utils/require-db.js");
        const { produceListings } = await import("../drizzle/schema.js");
        const db = await requireDb();
        return db.select().from(produceListings).limit(50);
      },
    },
    Mutation: {
      async createListing(_: unknown, args: { input: Record<string, unknown> }) {
        return { id: 0, status: "pending", message: "Use tRPC marketplace.createListing for full validation" };
      },
    },
  };
}

export function getGraphQLEndpointConfig() {
  return {
    path: "/graphql",
    schema: generateGraphQLSchema(),
    playground: process.env.NODE_ENV !== "production",
    introspection: true,
    corsOrigin: "*",
    maxDepth: 10,
    maxComplexity: 200,
  };
}
