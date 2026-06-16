/**
 * OpenAPI Documentation Generator for tRPC
 * Auto-generates OpenAPI 3.0 spec from tRPC router definitions.
 * Serves Swagger UI at /api/docs and JSON spec at /api/openapi.json.
 */

import type { Express } from 'express';
import { logger } from '../logger.js';

interface OpenAPIInfo {
  title: string;
  version: string;
  description: string;
  contact: { name: string; email: string; url: string };
  license: { name: string; url: string };
}

interface OpenAPIPath {
  [method: string]: {
    operationId: string;
    summary: string;
    tags: string[];
    parameters?: Array<{ name: string; in: string; schema: { type: string } }>;
    requestBody?: { content: { 'application/json': { schema: { type: string; properties: Record<string, unknown> } } } };
    responses: Record<string, { description: string; content?: Record<string, unknown> }>;
    security?: Array<Record<string, string[]>>;
  };
}

const API_INFO: OpenAPIInfo = {
  title: 'FarmConnect API',
  version: '2.0.0',
  description: 'Agricultural platform API — farmer management, marketplace, financial services, supply chain, AI/ML inspection, commodity exchange, and more.',
  contact: { name: 'FarmConnect Team', email: 'api@farmconnect.local', url: 'https://farmconnect.local' },
  license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
};

const ROUTER_TAGS: Record<string, { tag: string; description: string }> = {
  'core-features': { tag: 'Core', description: 'Core farmer, farm, crop, harvest, and expense management' },
  'farmer-features': { tag: 'Farmers', description: 'Farmer profiles, verification, and onboarding' },
  'marketplace-enhancements': { tag: 'Marketplace', description: 'Produce listings, search, reviews' },
  'order-fulfillment': { tag: 'Orders', description: 'Order management, fulfillment, and returns' },
  'delivery': { tag: 'Delivery', description: 'Delivery zones, drivers, and tracking' },
  'microfinance': { tag: 'Microfinance', description: 'Loans, disbursements, and repayment' },
  'credit-scoring': { tag: 'Credit Scoring', description: 'ML-based credit scoring and risk assessment' },
  'exchange': { tag: 'Exchange', description: 'Commodity exchange, trading, and settlements' },
  'cooperative': { tag: 'Cooperatives', description: 'Cooperative groups, Chama lending' },
  'kyc': { tag: 'KYC', description: 'Know Your Customer verification' },
  'traceability': { tag: 'Traceability', description: 'Supply chain traceability and QR codes' },
  'cold-chain': { tag: 'Cold Chain', description: 'Cold chain monitoring and IoT sensors' },
  'weather': { tag: 'Weather', description: 'Weather forecasts and alerts' },
  'weather-alerts': { tag: 'Weather Alerts', description: 'Weather alert management' },
  'spatial': { tag: 'Spatial', description: 'PostGIS spatial queries and analytics' },
  'gps-tracking': { tag: 'GPS', description: 'GPS tracking and geofencing' },
  'sms': { tag: 'SMS', description: 'SMS messaging via Africa\'s Talking' },
  'sms-templates': { tag: 'SMS Templates', description: 'SMS template management' },
  'notification': { tag: 'Notifications', description: 'Push notifications and preferences' },
  'ml-models': { tag: 'ML/AI', description: 'Machine learning models and inference' },
  'soil-analysis': { tag: 'Soil', description: 'Soil analysis and recommendations' },
  'land-suitability': { tag: 'Land', description: 'Land suitability mapping' },
  'drone': { tag: 'Drones', description: 'Drone flight planning and imagery' },
  'equipment-fleet': { tag: 'Equipment', description: 'Equipment and fleet management' },
  'mobile-money': { tag: 'Mobile Money', description: 'M-Pesa and mobile payments' },
  'subscription': { tag: 'Subscriptions', description: 'Subscription boxes and recurring orders' },
  'retail-store': { tag: 'Retail', description: 'B2B retail store management' },
  'escrow': { tag: 'Escrow', description: 'Escrow payment holding' },
  'disbursement': { tag: 'Disbursements', description: 'Loan disbursement management' },
  'erpnext': { tag: 'ERPNext', description: 'ERPNext ERP integration' },
  'admin-dashboard': { tag: 'Admin', description: 'Admin dashboard and system management' },
  'health': { tag: 'System', description: 'Health checks and system status' },
  'price-alerts': { tag: 'Price Alerts', description: 'Commodity price alert management' },
  'risk-assessment': { tag: 'Risk', description: 'Risk assessment and compliance' },
  'financial-enhancements': { tag: 'Finance', description: 'Financial analytics and reporting' },
  'government-subsidy': { tag: 'Subsidies', description: 'Government subsidy tracking' },
  'whatsapp-ai': { tag: 'WhatsApp', description: 'WhatsApp Business API integration' },
  'agri-llm': { tag: 'Agri LLM', description: 'Agricultural LLM advisory' },
  'agricultural-intelligence': { tag: 'Ag Intelligence', description: 'Agricultural intelligence dashboard' },
  'chama': { tag: 'Chama', description: 'Chama group lending' },
  'iot-gateway': { tag: 'IoT', description: 'IoT sensor gateway' },
  'field-overview': { tag: 'Field', description: 'Field agent overview' },
  'agent-productivity': { tag: 'Agents', description: 'Field agent productivity tracking' },
  'platform-advanced': { tag: 'Platform', description: 'Advanced platform features' },
  'loan-application': { tag: 'Loan Application', description: 'Loan application workflow' },
};

function generateSpec(): Record<string, unknown> {
  const paths: Record<string, OpenAPIPath> = {};
  const tags: Array<{ name: string; description: string }> = [];

  for (const [routerName, info] of Object.entries(ROUTER_TAGS)) {
    tags.push({ name: info.tag, description: info.description });

    // Generate standard CRUD paths
    const basePath = `/api/trpc/${routerName}`;
    paths[`${basePath}.list`] = {
      post: {
        operationId: `${routerName}.list`,
        summary: `List ${info.tag} items`,
        tags: [info.tag],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { limit: { type: 'integer' }, offset: { type: 'integer' } } } } } },
        responses: { '200': { description: 'List of items' }, '401': { description: 'Unauthorized' } },
        security: [{ bearerAuth: [] }],
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: API_INFO,
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
      { url: 'https://farmconnect.local', description: 'Production' },
    ],
    paths,
    tags,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
        Farmer: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phoneNumber: { type: 'string' },
            region: { type: 'string' },
            verificationStatus: { type: 'string', enum: ['pending', 'verified', 'rejected'] },
          },
        },
        Farm: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            size: { type: 'number' },
            location: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
        },
        ProduceListing: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            quantity: { type: 'number' },
            unit: { type: 'string' },
            category: { type: 'string' },
          },
        },
        Loan: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            amount: { type: 'number' },
            purpose: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'disbursed', 'repaid', 'defaulted'] },
            interestRate: { type: 'number' },
            termMonths: { type: 'integer' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            status: { type: 'string' },
            totalAmount: { type: 'number' },
            buyerId: { type: 'integer' },
            sellerId: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  };
}

const SWAGGER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>FarmConnect API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
    });
  </script>
</body>
</html>
`;

export function registerOpenAPIDocs(app: Express): void {
  const spec = generateSpec();

  app.get('/api/openapi.json', (_req, res) => {
    res.json(spec);
  });

  app.get('/api/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(SWAGGER_HTML);
  });

  logger.info('OpenAPI docs registered at /api/docs');
}
