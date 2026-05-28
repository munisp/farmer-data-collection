/**
 * OpenAPI/Swagger Documentation Generator
 * 
 * Auto-generates OpenAPI 3.1 spec from tRPC router definitions.
 * Serves Swagger UI at /docs and JSON spec at /docs/openapi.json
 */

export function generateOpenAPISpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "FarmConnect API",
      version: "2.0.0",
      description: "Farm-to-table marketplace platform for developing countries. Polyglot microservices with USSD, SMS, WhatsApp, mobile, and web channels.",
      contact: { name: "FarmConnect", email: "api@farmconnect.co" },
      license: { name: "MIT" },
    },
    servers: [
      { url: "http://localhost:3000", description: "Development" },
      { url: "https://api.farmconnect.co", description: "Production" },
    ],
    tags: [
      { name: "Marketplace", description: "Browse, buy, sell farm produce" },
      { name: "Delivery", description: "Supply chain, fleet, last-mile delivery" },
      { name: "Financial", description: "Loans, savings, mobile money, escrow" },
      { name: "Weather", description: "Alerts, forecasts, climate intelligence" },
      { name: "Agriculture", description: "Crop diagnostics, soil health, yield prediction" },
      { name: "Cooperative", description: "Group lending, collective selling, equipment" },
      { name: "USSD", description: "Feature phone marketplace, payments, alerts" },
      { name: "Identity", description: "KYC, DID, verifiable credentials" },
      { name: "Admin", description: "Tenant management, subsidy distribution" },
    ],
    paths: {
      "/api/trpc/marketplace.getListings": {
        get: {
          tags: ["Marketplace"],
          summary: "Browse marketplace listings",
          parameters: [
            { name: "input", in: "query", required: false, schema: { type: "string" }, description: "JSON-encoded filter: {json: {limit, offset, crop, minPrice, maxPrice}}" },
          ],
          responses: {
            200: { description: "List of produce listings", content: { "application/json": { schema: { $ref: "#/components/schemas/ListingsResponse" } } } },
          },
        },
      },
      "/api/trpc/marketplace.createListing": {
        post: {
          tags: ["Marketplace"],
          summary: "Create a new produce listing",
          security: [{ bearerAuth: [] }],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/CreateListingInput" } } } },
          responses: { 200: { description: "Created listing" }, 401: { description: "Unauthorized" } },
        },
      },
      "/api/trpc/marketplaceEnhancements.makeOffer": {
        post: {
          tags: ["Marketplace"],
          summary: "Make a negotiation offer on a listing",
          security: [{ bearerAuth: [] }],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MakeOfferInput" } } } },
          responses: { 200: { description: "Offer submitted" } },
        },
      },
      "/api/trpc/marketplaceEnhancements.getSeasonalPriceRecommendation": {
        get: {
          tags: ["Marketplace"],
          summary: "Get seasonal price recommendation for a crop",
          parameters: [
            { name: "input", in: "query", required: true, schema: { type: "string" }, description: '{json: {crop: "maize", region: "kenya"}}' },
          ],
          responses: { 200: { description: "Price recommendation with seasonal multiplier" } },
        },
      },
      "/api/trpc/delivery.requestDelivery": {
        post: {
          tags: ["Delivery"],
          summary: "Request delivery for an order",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Delivery created with driver assignment" } },
        },
      },
      "/api/trpc/delivery.calculateRoute": {
        get: {
          tags: ["Delivery"],
          summary: "Calculate optimal delivery route (PostGIS)",
          parameters: [
            { name: "input", in: "query", required: true, schema: { type: "string" }, description: '{json: {originLat, originLng, destLat, destLng}}' },
          ],
          responses: { 200: { description: "Route with distance, time, waypoints" } },
        },
      },
      "/api/trpc/mobileMoney.initiatePayment": {
        post: {
          tags: ["Financial"],
          summary: "Initiate M-Pesa/MTN MoMo payment",
          security: [{ bearerAuth: [] }],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/MobilePaymentInput" } } } },
          responses: { 200: { description: "Payment initiated, STK push sent" } },
        },
      },
      "/api/trpc/escrow.createEscrow": {
        post: {
          tags: ["Financial"],
          summary: "Create escrow for marketplace transaction",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Escrow account created in TigerBeetle" } },
        },
      },
      "/api/trpc/financialEnhancements.getReceiptLoanEligibility": {
        get: {
          tags: ["Financial"],
          summary: "Check crop receipt financing eligibility (70% LTV)",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Loan eligibility with max amount" } },
        },
      },
      "/api/trpc/chama.createGroup": {
        post: {
          tags: ["Cooperative"],
          summary: "Create a Chama/VSLA savings group",
          responses: { 200: { description: "Group created" } },
        },
      },
      "/api/trpc/cooperative.createCollectiveListing": {
        post: {
          tags: ["Cooperative"],
          summary: "Create collective selling listing (aggregate member harvests)",
          responses: { 200: { description: "Collective listing created" } },
        },
      },
      "/api/trpc/weatherAlerts.broadcastWeatherAlert": {
        post: {
          tags: ["Weather"],
          summary: "Broadcast geofenced weather alert via SMS",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Alert broadcast to farmers in zone" } },
        },
      },
      "/api/trpc/whatsappAi.diagnoseFromPhoto": {
        post: {
          tags: ["Agriculture"],
          summary: "AI crop disease diagnosis from photo",
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/DiagnoseInput" } } } },
          responses: { 200: { description: "Disease diagnosis with treatment in local language" } },
        },
      },
      "/api/trpc/financialEnhancements.getSoilHealthPassport": {
        get: {
          tags: ["Agriculture"],
          summary: "Get soil health passport with NPK scoring",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Soil health score (0-100) with recommendations" } },
        },
      },
      "/api/trpc/financialEnhancements.getCropRecommendations": {
        get: {
          tags: ["Agriculture"],
          summary: "Climate-adaptive crop recommendations based on rainfall/elevation",
          responses: { 200: { description: "Top 5 recommended crops with suitability scores" } },
        },
      },
      "/api/trpc/governmentSubsidy.applyForSubsidy": {
        post: {
          tags: ["Admin"],
          summary: "Apply for government agricultural subsidy",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Application submitted" } },
        },
      },
      "/api/trpc/platformAdvanced.createDID": {
        post: {
          tags: ["Identity"],
          summary: "Create decentralized identity for unbanked farmer",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "DID document created" } },
        },
      },
      "/api/trpc/platformAdvanced.createTenant": {
        post: {
          tags: ["Admin"],
          summary: "Create white-label tenant for NGO/government",
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Tenant created with API key" } },
        },
      },
      "/api/ussd": {
        post: {
          tags: ["USSD"],
          summary: "USSD callback endpoint (Africa's Talking)",
          requestBody: {
            content: { "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  sessionId: { type: "string" },
                  phoneNumber: { type: "string" },
                  text: { type: "string" },
                  serviceCode: { type: "string" },
                },
              },
            } },
          },
          responses: { 200: { description: "USSD response (CON for continue, END for terminate)" } },
        },
      },
      "/health": {
        get: {
          tags: ["Admin"],
          summary: "Health check",
          responses: { 200: { description: "Service healthy" } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Keycloak JWT token",
        },
      },
      schemas: {
        CreateListingInput: {
          type: "object",
          properties: {
            title: { type: "string" }, cropType: { type: "string" },
            quantity: { type: "number" }, unit: { type: "string" },
            pricePerUnit: { type: "number" }, currency: { type: "string", default: "NGN" },
            description: { type: "string" },
          },
          required: ["title", "cropType", "quantity", "unit", "pricePerUnit"],
        },
        MakeOfferInput: {
          type: "object",
          properties: {
            listingId: { type: "integer" },
            offerPricePerUnit: { type: "number" },
            quantity: { type: "integer" },
            message: { type: "string" },
          },
          required: ["listingId", "offerPricePerUnit", "quantity"],
        },
        MobilePaymentInput: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["mpesa", "mtn_momo", "airtel_money"] },
            phoneNumber: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            reference: { type: "string" },
          },
          required: ["provider", "phoneNumber", "amount"],
        },
        DiagnoseInput: {
          type: "object",
          properties: {
            imageUrl: { type: "string" },
            cropType: { type: "string" },
            symptoms: { type: "string" },
            language: { type: "string", default: "en" },
          },
        },
        ListingsResponse: {
          type: "object",
          properties: {
            result: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    json: { type: "array", items: { $ref: "#/components/schemas/ProduceListing" } },
                  },
                },
              },
            },
          },
        },
        ProduceListing: {
          type: "object",
          properties: {
            id: { type: "integer" }, title: { type: "string" },
            cropType: { type: "string" }, quantity: { type: "number" },
            pricePerUnit: { type: "number" }, currency: { type: "string" },
            status: { type: "string" },
          },
        },
      },
    },
  };
}

export function getSwaggerUIHTML(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FarmConnect API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specUrl}",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
    });
  </script>
</body>
</html>`;
}
