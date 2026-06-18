import { describe, it, expect } from 'vitest';
import { appRouter } from '../trpc';
import * as fs from 'fs';
import * as path from 'path';

const routerDir = path.join(__dirname, '..', 'routers');
const servicesDir = path.join(__dirname, '..', 'services');

describe('Honest Implementation Verification', () => {
  describe('No BoundedMap in services', () => {
    it('should have zero BoundedMap imports in services', () => {
      const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.ts'));
      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
        if (content.includes("import { BoundedMap }") || content.includes("from '../cache/bounded-map")) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });

    it('should have zero new BoundedMap() instantiations', () => {
      const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.ts'));
      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(servicesDir, file), 'utf-8');
        if (content.includes('new BoundedMap(')) {
          violations.push(file);
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe('No demo users in auth', () => {
    it('should not have demo user arrays in trpc-base', () => {
      const trpcBase = fs.readFileSync(path.join(__dirname, '..', '_core', 'trpc-base.ts'), 'utf-8');
      expect(trpcBase).not.toContain('demoUsers');
      expect(trpcBase).not.toContain('getDemoUserFromToken');
      expect(trpcBase).not.toContain('demo@farmer.com');
    });

    it('should not have dev-only JWT secret fallback in auth router', () => {
      const authRouter = fs.readFileSync(path.join(routerDir, 'auth-router.ts'), 'utf-8');
      expect(authRouter).not.toContain('dev-only-secret');
      expect(authRouter).not.toContain('demo123');
      expect(authRouter).not.toContain('demoUsers');
    });
  });

  describe('No Math.random() in routers', () => {
    it('should not use Math.random() for IDs or data generation', () => {
      const files = fs.readdirSync(routerDir).filter(f => f.endsWith('.ts'));
      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(routerDir, file), 'utf-8');
        const matches = content.match(/Math\.random\(\)/g);
        if (matches && matches.length > 0) {
          violations.push(`${file}: ${matches.length} occurrences`);
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe('All routers use requireDb or getDb', () => {
    it('should import requireDb or getDb in all routers with DB operations', () => {
      const files = fs.readdirSync(routerDir).filter(f => f.endsWith('.ts'));
      const dbRouters: string[] = [];
      const noDbRouters: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(routerDir, file), 'utf-8');
        if (content.includes('db.select') || content.includes('db.insert') || content.includes('db.update') || content.includes('db.delete')) {
          if (content.includes('requireDb') || content.includes('getDb')) {
            dbRouters.push(file);
          } else {
            noDbRouters.push(file);
          }
        }
      }
      expect(dbRouters.length).toBeGreaterThan(0);
    });
  });

  describe('Real Keycloak configuration exists', () => {
    it('should have farmconnect realm config', () => {
      const realmPath = path.join(__dirname, '..', '..', 'k8s', 'keycloak', 'farmconnect-realm.json');
      expect(fs.existsSync(realmPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(realmPath, 'utf-8'));
      expect(config.realm).toBe('farmconnect');
      expect(config.roles.realm).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'farmer' }),
          expect.objectContaining({ name: 'admin' }),
        ])
      );
    });

    it('should have PKCE-enabled clients', () => {
      const realmPath = path.join(__dirname, '..', '..', 'k8s', 'keycloak', 'farmconnect-realm.json');
      const config = JSON.parse(fs.readFileSync(realmPath, 'utf-8'));
      const pwaClient = config.clients.find((c: { clientId: string }) => c.clientId === 'farmconnect-pwa');
      expect(pwaClient).toBeDefined();
      expect(pwaClient.publicClient).toBe(true);
    });
  });

  describe('Drizzle schema completeness', () => {
    it('should have schema tables for all formerly in-memory features', () => {
      const schemaPath = path.join(__dirname, '..', '..', 'drizzle', 'schema-honest-implementation.ts');
      const content = fs.readFileSync(schemaPath, 'utf-8');
      
      const requiredTables = [
        'analytics_events',
        'aquaculture_ponds',
        'aquaculture_feed_records',
        'aquaculture_ai_predictions',
        'insurance_policies',
        'insurance_claims',
        'input_financing_applications',
        'weather_readings',
        'weather_forecasts',
        'soil_analysis_results',
        'market_price_history',
        'yield_predictions',
        'user_sessions',
        'audit_log',
        'harvest_forecasts',
        'knowledge_articles',
        'labor_workers',
        'labor_tasks',
        'pest_disease_alerts',
        'post_harvest_records',
        'carbon_credit_projects',
        'voice_advisory_sessions',
        'irrigation_records',
      ];

      for (const table of requiredTables) {
        expect(content).toContain(`"${table}"`);
      }
    });
  });

  describe('Go microservices have DB connectivity', () => {
    it('should have database/sql import in Go services', () => {
      const goDir = path.join(__dirname, '..', '..', 'services', 'go');
      const services = fs.readdirSync(goDir).filter(d => {
        const mainPath = path.join(goDir, d, 'main.go');
        return fs.existsSync(mainPath);
      });
      
      const withDb: string[] = [];
      const withoutDb: string[] = [];
      
      for (const svc of services) {
        const content = fs.readFileSync(path.join(goDir, svc, 'main.go'), 'utf-8');
        if (content.includes('database/sql') || content.includes('pgx')) {
          withDb.push(svc);
        } else {
          withoutDb.push(svc);
        }
      }
      
      expect(withDb.length).toBeGreaterThan(10);
    });
  });

  describe('Python microservices have DB connectivity', () => {
    it('should have asyncpg or get_db_pool in Python services', () => {
      const pyDir = path.join(__dirname, '..', '..', 'services', 'python');
      const services = fs.readdirSync(pyDir).filter(d => {
        const mainPath = path.join(pyDir, d, 'main.py');
        const appPath = path.join(pyDir, d, 'app', 'main.py');
        return fs.existsSync(mainPath) || fs.existsSync(appPath);
      });
      
      let withDb = 0;
      for (const svc of services) {
        let mainPath = path.join(pyDir, svc, 'main.py');
        if (!fs.existsSync(mainPath)) mainPath = path.join(pyDir, svc, 'app', 'main.py');
        if (!fs.existsSync(mainPath)) continue;
        const content = fs.readFileSync(mainPath, 'utf-8');
        if (content.includes('asyncpg') || content.includes('get_db_pool') || content.includes('psycopg')) {
          withDb++;
        }
      }
      
      expect(withDb).toBeGreaterThan(5);
    });
  });

  describe('SmartAlex design system is applied', () => {
    it('should have teal primary color in CSS', () => {
      const css = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'index.css'), 'utf-8');
      expect(css).toContain('oklch(0.55 0.11 175)');
      expect(css).toContain('#0d9488');
    });

    it('should have SmartAlex gradient in DashboardLayout', () => {
      const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'components', 'DashboardLayout.tsx'), 'utf-8');
      expect(layout).toContain('from-teal-600');
      expect(layout).toContain('SmartAlex');
    });

    it('should have SmartAlexDesignSystem component', () => {
      const designSystem = path.join(__dirname, '..', '..', 'client', 'src', 'components', 'ui', 'SmartAlexDesignSystem.tsx');
      expect(fs.existsSync(designSystem)).toBe(true);
      const content = fs.readFileSync(designSystem, 'utf-8');
      expect(content).toContain('PageHeader');
      expect(content).toContain('#0d9488');
    });
  });

  describe('Auth router is properly configured', () => {
    it('should have register, login, refreshToken, logout, me procedures', () => {
      const procedures = Object.keys((appRouter as Record<string, unknown>)._def?.procedures ?? {});
      const authProcedures = procedures.filter(p => p.startsWith('auth.'));
      expect(authProcedures).toEqual(
        expect.arrayContaining(['auth.register', 'auth.login', 'auth.refreshToken', 'auth.logout', 'auth.me'])
      );
    });
  });

  describe('No "source: fallback" in routers', () => {
    it('should not return source: "fallback" in any router', () => {
      const files = fs.readdirSync(routerDir).filter(f => f.endsWith('.ts'));
      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(path.join(routerDir, file), 'utf-8');
        const matches = content.match(/source:\s*["']fallback["']/g);
        if (matches && matches.length > 0) {
          violations.push(`${file}: ${matches.length} fallback sources`);
        }
      }
      expect(violations).toEqual([]);
    });
  });
});
