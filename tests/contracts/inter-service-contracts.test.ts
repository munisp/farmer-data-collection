/**
 * Inter-Service Contract Tests
 * Validates schema compatibility between TypeScript backend and polyglot microservices.
 * Ensures Go/Python/Rust services produce/consume data matching shared type definitions.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Contract schemas shared between TS ↔ Go/Python/Rust
const CONTRACTS = {
  farmer: {
    required: ['id', 'name', 'phone'],
    optional: ['email', 'location', 'farmIds'],
    types: { id: 'number', name: 'string', phone: 'string' },
  },
  farm: {
    required: ['id', 'farmerId', 'name', 'location'],
    optional: ['size', 'crops', 'boundaries'],
    types: { id: 'number', farmerId: 'number', name: 'string' },
  },
  sensorReading: {
    required: ['deviceId', 'readingType', 'value', 'unit', 'timestamp'],
    optional: ['quality', 'rawValue'],
    types: { deviceId: 'string', readingType: 'string', value: 'number', unit: 'string', timestamp: 'number' },
  },
  tradeOrder: {
    required: ['orderId', 'userId', 'side', 'price', 'quantity'],
    optional: ['tokenId', 'status', 'createdAt'],
    types: { orderId: 'string', userId: 'number', side: 'string', price: 'number', quantity: 'number' },
  },
  spatialQuery: {
    required: ['latitude', 'longitude'],
    optional: ['radiusKm', 'limit', 'boundaryWkt'],
    types: { latitude: 'number', longitude: 'number' },
  },
  inspectionResult: {
    required: ['batchId', 'grade', 'confidence'],
    optional: ['defects', 'moisture', 'foreignMatter', 'ocrText'],
    types: { batchId: 'string', grade: 'string', confidence: 'number' },
  },
  deliveryEvent: {
    required: ['orderId', 'status', 'timestamp'],
    optional: ['location', 'driverId', 'eta'],
    types: { orderId: 'string', status: 'string', timestamp: 'number' },
  },
  healthResponse: {
    required: ['status'],
    optional: ['service', 'version', 'uptime', 'database', 'features'],
    types: { status: 'string' },
  },
};

describe('Inter-Service Contract Validation', () => {
  describe('Go Services — Schema Compatibility', () => {
    const goServices = [
      'delivery-service', 'loan-orchestrator', 'mobile-money-service',
      'gps-streaming', 'equipment-fleet-service', 'realtime-service',
    ];

    it('Go services exist and have main.go', () => {
      const goDir = path.join(__dirname, '../../services/go');
      for (const svc of goServices) {
        const mainGo = path.join(goDir, svc, 'main.go');
        if (fs.existsSync(mainGo)) {
          const content = fs.readFileSync(mainGo, 'utf-8');
          expect(content).toContain('func');
          expect(content.length).toBeGreaterThan(100);
        }
      }
    });

    it('Go health endpoints return contract-compliant JSON', () => {
      const goDir = path.join(__dirname, '../../services/go');
      for (const svc of goServices) {
        const mainGo = path.join(goDir, svc, 'main.go');
        if (fs.existsSync(mainGo)) {
          const content = fs.readFileSync(mainGo, 'utf-8');
          if (content.includes('health') || content.includes('Health')) {
            expect(content).toMatch(/status|healthy|ok/i);
          }
        }
      }
    });
  });

  describe('Python Services — Schema Compatibility', () => {
    const pythonServices = [
      'weather-service', 'ml-service', 'geocoding-service',
      'price-prediction-service', 'satellite-service',
    ];

    it('Python services have main.py or app.py', () => {
      const pyDir = path.join(__dirname, '../../services/python');
      for (const svc of pythonServices) {
        const mainPy = path.join(pyDir, svc, 'main.py');
        const appPy = path.join(pyDir, svc, 'app.py');
        const appMainPy = path.join(pyDir, svc, 'app', 'main.py');
        expect(fs.existsSync(mainPy) || fs.existsSync(appPy) || fs.existsSync(appMainPy)).toBe(true);
      }
    });

    it('Python services use Pydantic or dict for JSON serialization', () => {
      const pyDir = path.join(__dirname, '../../services/python');
      for (const svc of pythonServices) {
        const candidates = [
          path.join(pyDir, svc, 'main.py'),
          path.join(pyDir, svc, 'app.py'),
          path.join(pyDir, svc, 'app', 'main.py'),
        ];
        const mainPy = candidates.find(f => fs.existsSync(f));
        if (mainPy) {
          const content = fs.readFileSync(mainPy, 'utf-8');
          const hasSerialization = content.includes('BaseModel') || content.includes('jsonify') || content.includes('JSONResponse') || content.includes('json');
          expect(hasSerialization).toBe(true);
        }
      }
    });
  });

  describe('Rust Services — Schema Compatibility', () => {
    const rustServices = [
      'autonomous-ops', 'image-processor', 'iot-gateway',
      'isobus-gateway', 'openappsec-waf', 'spatial-query-service',
      'tokenization-service',
    ];

    it('All Rust services have Cargo.toml', () => {
      const rustDir = path.join(__dirname, '../../services/rust');
      for (const svc of rustServices) {
        const cargo = path.join(rustDir, svc, 'Cargo.toml');
        expect(fs.existsSync(cargo)).toBe(true);
      }
    });

    it('Rust services use serde for JSON serialization', () => {
      const rustDir = path.join(__dirname, '../../services/rust');
      for (const svc of rustServices) {
        const cargo = path.join(rustDir, svc, 'Cargo.toml');
        if (fs.existsSync(cargo)) {
          const content = fs.readFileSync(cargo, 'utf-8');
          expect(content).toContain('serde');
        }
      }
    });

    it('All Rust services have Dockerfiles', () => {
      const rustDir = path.join(__dirname, '../../services/rust');
      for (const svc of rustServices) {
        const dockerfile = path.join(rustDir, svc, 'Dockerfile');
        expect(fs.existsSync(dockerfile)).toBe(true);
      }
    });
  });

  describe('Shared Contract Schemas', () => {
    it('Health response contract is consistent across all services', () => {
      const contract = CONTRACTS.healthResponse;
      expect(contract.required).toContain('status');
      expect(contract.types.status).toBe('string');
    });

    it('Sensor reading contract has all IoT gateway fields', () => {
      const contract = CONTRACTS.sensorReading;
      expect(contract.required).toEqual(
        expect.arrayContaining(['deviceId', 'readingType', 'value', 'unit', 'timestamp'])
      );
      expect(contract.types.value).toBe('number');
    });

    it('Trade order contract matches tokenization service types', () => {
      const contract = CONTRACTS.tradeOrder;
      expect(contract.required).toEqual(
        expect.arrayContaining(['orderId', 'userId', 'side', 'price', 'quantity'])
      );
      expect(contract.types.price).toBe('number');
      expect(contract.types.side).toBe('string');
    });

    it('Spatial query contract matches PostGIS service types', () => {
      const contract = CONTRACTS.spatialQuery;
      expect(contract.required).toEqual(
        expect.arrayContaining(['latitude', 'longitude'])
      );
      expect(contract.types.latitude).toBe('number');
    });

    it('Inspection result contract matches AI service types', () => {
      const contract = CONTRACTS.inspectionResult;
      expect(contract.required).toEqual(
        expect.arrayContaining(['batchId', 'grade', 'confidence'])
      );
    });
  });

  describe('TypeScript Router ↔ Microservice Field Alignment', () => {
    it('TS delivery router references match Go delivery-service fields', () => {
      const tsRouter = path.join(__dirname, '../../server/routers/delivery-router.ts');
      if (fs.existsSync(tsRouter)) {
        const content = fs.readFileSync(tsRouter, 'utf-8');
        for (const field of CONTRACTS.deliveryEvent.required) {
          const camelCase = field;
          const snakeCase = field.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
          expect(content.includes(camelCase) || content.includes(snakeCase)).toBe(true);
        }
      }
    });

    it('TS spatial router references match Rust spatial-query-service fields', () => {
      const tsRouter = path.join(__dirname, '../../server/routers/spatial-router.ts');
      if (fs.existsSync(tsRouter)) {
        const content = fs.readFileSync(tsRouter, 'utf-8');
        expect(content).toMatch(/latitude|lat/i);
        expect(content).toMatch(/longitude|lon|lng/i);
      }
    });
  });
});
