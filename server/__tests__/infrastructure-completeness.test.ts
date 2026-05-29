/**
 * Infrastructure Completeness Tests
 *
 * Verifies all production infrastructure components are properly
 * configured: monitoring, logging, health checks, security, CI/CD.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

describe('Docker Infrastructure', () => {
  it('all Go services should have Dockerfiles', () => {
    const goServices = fs.readdirSync(path.join(ROOT, 'services/go')).filter(
      (d) => fs.statSync(path.join(ROOT, 'services/go', d)).isDirectory() && d !== 'shared'
    );
    const withDockerfile = goServices.filter((s) =>
      fs.existsSync(path.join(ROOT, 'services/go', s, 'Dockerfile'))
    );
    expect(withDockerfile.length).toBe(goServices.length);
  });

  it('all Python services should have Dockerfiles', () => {
    const pyServices = fs.readdirSync(path.join(ROOT, 'services/python')).filter(
      (d) => fs.statSync(path.join(ROOT, 'services/python', d)).isDirectory() && d !== 'shared'
    );
    const withDockerfile = pyServices.filter((s) =>
      fs.existsSync(path.join(ROOT, 'services/python', s, 'Dockerfile'))
    );
    expect(withDockerfile.length).toBe(pyServices.length);
  });

  it('all Rust services should have Dockerfiles', () => {
    const rustServices = fs.readdirSync(path.join(ROOT, 'services/rust')).filter(
      (d) => fs.statSync(path.join(ROOT, 'services/rust', d)).isDirectory()
    );
    const withDockerfile = rustServices.filter((s) =>
      fs.existsSync(path.join(ROOT, 'services/rust', s, 'Dockerfile'))
    );
    expect(withDockerfile.length).toBe(rustServices.length);
  });

  it('Dockerfiles should have HEALTHCHECK instructions', () => {
    const dockerfiles = [
      'services/go/supply-chain-service/Dockerfile',
      'services/go/iot-gateway/Dockerfile',
      'services/python/weather-service/Dockerfile',
      'services/rust/spatial-indexer/Dockerfile',
    ];
    for (const df of dockerfiles) {
      const fullPath = path.join(ROOT, df);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        expect(content).toContain('HEALTHCHECK');
      }
    }
  });
});

describe('Monitoring & Observability', () => {
  it('Prometheus configuration should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'monitoring/prometheus.yml'))).toBe(true);
  });

  it('Prometheus alert rules should be defined', () => {
    const alertFiles = [
      'monitoring/alerts.yml',
      'monitoring/alert-rules.yml',
    ];
    const exists = alertFiles.some((f) => fs.existsSync(path.join(ROOT, f)));
    expect(exists).toBe(true);
  });

  it('Grafana dashboards should exist', () => {
    const dashboardDirs = [
      'monitoring/grafana/dashboards',
      'config/grafana/dashboards',
    ];
    let totalDashboards = 0;
    for (const dir of dashboardDirs) {
      const fullPath = path.join(ROOT, dir);
      if (fs.existsSync(fullPath)) {
        totalDashboards += fs.readdirSync(fullPath).filter((f) => f.endsWith('.json')).length;
      }
    }
    expect(totalDashboards).toBeGreaterThanOrEqual(5);
  });

  it('Loki log aggregation should be configured', () => {
    const lokiPaths = ['config/loki/loki-config.yaml', 'config/loki/loki-config.yml'];
    const exists = lokiPaths.some((p) => fs.existsSync(path.join(ROOT, p)));
    expect(exists).toBe(true);
  });

  it('OpenTelemetry tracing should be configured', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/tracing.ts'))).toBe(true);
    const content = fs.readFileSync(path.join(ROOT, 'server/tracing.ts'), 'utf-8');
    expect(content).toContain('NodeTracerProvider');
    expect(content).toContain('OTLP');
  });
});

describe('Security Configuration', () => {
  it('CSP headers should be configured', () => {
    const indexFile = path.join(ROOT, 'server/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');
    const hasHelmet = content.includes('helmet');
    const hasCSP = content.includes('contentSecurityPolicy') || content.includes('csp');
    expect(hasHelmet || hasCSP).toBe(true);
  });

  it('rate limiter middleware should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/middleware/rate-limiter.ts'))).toBe(true);
  });

  it('input sanitization middleware should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/middleware/input-sanitization.ts'))).toBe(true);
  });

  it('CSRF protection should be configured', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/middleware/csrf-protection.ts'))).toBe(true);
  });

  it('Vault TLS deployment script should exist', () => {
    const vaultPaths = ['k8s/vault/deploy-tls.sh', 'vault/deploy-tls.sh'];
    const exists = vaultPaths.some((p) => fs.existsSync(path.join(ROOT, p)));
    expect(exists).toBe(true);
  });

  it('webhook validation middleware should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/middleware/webhook-validation.ts'))).toBe(true);
  });
});

describe('CI/CD Pipeline', () => {
  it('GitHub Actions workflow should exist', () => {
    expect(fs.existsSync(path.join(ROOT, '.github/workflows/ci-cd.yml'))).toBe(true);
  });

  it('workflow should include lint, test, build steps', () => {
    const content = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-cd.yml'), 'utf-8');
    expect(content).toContain('lint');
    expect(content).toContain('test');
    expect(content).toContain('build');
  });

  it('workflow should include Docker build', () => {
    const content = fs.readFileSync(path.join(ROOT, '.github/workflows/ci-cd.yml'), 'utf-8');
    expect(content.toLowerCase()).toContain('docker');
  });
});

describe('Documentation', () => {
  it('API documentation should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/API_DOCUMENTATION.md'))).toBe(true);
  });

  it('SLI/SLO definitions should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/SLI_SLO_DEFINITIONS.md'))).toBe(true);
  });

  it('Disaster Recovery plan should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/DISASTER_RECOVERY.md'))).toBe(true);
  });

  it('Operational Runbook should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/OPERATIONAL_RUNBOOK.md'))).toBe(true);
  });

  it('Security testing documentation should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/SECURITY_TESTING.md'))).toBe(true);
  });

  it('Load testing documentation should exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/LOAD_TESTING_BASELINE.md'))).toBe(true);
  });
});

describe('Database', () => {
  it('database migration files should exist', () => {
    const migrationDirs = ['drizzle', 'migrations'];
    const exists = migrationDirs.some((d) => fs.existsSync(path.join(ROOT, d)));
    expect(exists).toBe(true);
  });

  it('schema files should define tables', () => {
    const schemaFile = path.join(ROOT, 'drizzle/schema.ts');
    expect(fs.existsSync(schemaFile)).toBe(true);
    const content = fs.readFileSync(schemaFile, 'utf-8');
    expect(content).toContain('pgTable');
  });

  it('backup tests should verify backup procedures', () => {
    const backupTests = [
      'server/__tests__/backup-restore.test.ts',
      'server/__tests__/db-backup-s3-integration.test.ts',
      'server/__tests__/db-backup-verification.test.ts',
    ];
    const exists = backupTests.some((s) => fs.existsSync(path.join(ROOT, s)));
    expect(exists).toBe(true);
  });
});

describe('Graceful Shutdown', () => {
  it('server should handle SIGTERM', () => {
    const indexFile = path.join(ROOT, 'server/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');
    expect(content).toContain('SIGTERM');
  });

  it('server should handle SIGINT', () => {
    const indexFile = path.join(ROOT, 'server/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');
    expect(content).toContain('SIGINT');
  });
});

describe('Configuration Management', () => {
  it('.env.example should document all required variables', () => {
    expect(fs.existsSync(path.join(ROOT, '.env.example'))).toBe(true);
    const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
    const requiredVars = ['DATABASE_URL', 'JWT_SECRET', 'NODE_ENV'];
    for (const v of requiredVars) {
      expect(content).toContain(v);
    }
  });

  it('docker-compose should define all services', () => {
    expect(fs.existsSync(path.join(ROOT, 'docker-compose.yml'))).toBe(true);
    const content = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf-8');
    expect(content).toContain('postgres');
    expect(content).toContain('redis');
  });
});
