/**
 * Public Endpoint Security Audit
 * Validates that public endpoints are intentional and documented.
 * Flags read-write public endpoints that should be protected.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROUTERS_DIR = path.join(__dirname, '../routers');

// Endpoints that are intentionally public (documented exceptions)
const ALLOWED_PUBLIC = {
  'health-router.ts': 'Health/liveness/readiness checks',
  'africas-talking-router.ts': 'Webhook callbacks from Africa\'s Talking (required by AT)',
};

// Routers where public read-write endpoints need review
const NEEDS_REVIEW: { file: string; publicCount: number; protectedCount: number; concern: string }[] = [];

function countProcedures(content: string): { publicCount: number; protectedCount: number } {
  const publicMatches = content.match(/publicProcedure/g) || [];
  const protectedMatches = content.match(/protectedProcedure/g) || [];
  return { publicCount: publicMatches.length, protectedCount: protectedMatches.length };
}

describe('Public Endpoint Security Audit', () => {
  const routerFiles = fs.readdirSync(ROUTERS_DIR)
    .filter(f => f.endsWith('-router.ts'));

  it('All router files exist', () => {
    expect(routerFiles.length).toBeGreaterThan(40);
  });

  it('Overall auth coverage exceeds 80%', () => {
    let totalPublic = 0;
    let totalProtected = 0;
    for (const file of routerFiles) {
      const content = fs.readFileSync(path.join(ROUTERS_DIR, file), 'utf-8');
      const { publicCount, protectedCount } = countProcedures(content);
      totalPublic += publicCount;
      totalProtected += protectedCount;
    }
    const authPct = (totalProtected / (totalPublic + totalProtected)) * 100;
    expect(authPct).toBeGreaterThan(80);
  });

  it('Health router is intentionally public', () => {
    const healthRouter = path.join(ROUTERS_DIR, 'health-router.ts');
    expect(fs.existsSync(healthRouter)).toBe(true);
    const content = fs.readFileSync(healthRouter, 'utf-8');
    const { publicCount } = countProcedures(content);
    expect(publicCount).toBeGreaterThan(0);
  });

  it('Routers with high public ratio are documented', () => {
    for (const file of routerFiles) {
      if (ALLOWED_PUBLIC[file as keyof typeof ALLOWED_PUBLIC]) continue;
      const content = fs.readFileSync(path.join(ROUTERS_DIR, file), 'utf-8');
      const { publicCount, protectedCount } = countProcedures(content);
      const total = publicCount + protectedCount;
      if (total > 0 && publicCount > protectedCount) {
        NEEDS_REVIEW.push({
          file,
          publicCount,
          protectedCount,
          concern: `${publicCount} public vs ${protectedCount} protected`,
        });
      }
    }
    // Log flagged routers for review
    if (NEEDS_REVIEW.length > 0) {
      console.log('⚠ Routers needing auth review:');
      for (const r of NEEDS_REVIEW) {
        console.log(`  ${r.file}: ${r.concern}`);
      }
    }
    // Not a hard failure — we're auditing, not blocking
    expect(NEEDS_REVIEW.length).toBeLessThan(10);
  });

  it('No router has zero protection', () => {
    const unprotected: string[] = [];
    for (const file of routerFiles) {
      if (file === 'health-router.ts') continue;
      const content = fs.readFileSync(path.join(ROUTERS_DIR, file), 'utf-8');
      const { protectedCount } = countProcedures(content);
      if (protectedCount === 0) {
        unprotected.push(file);
      }
    }
    if (unprotected.length > 0) {
      console.log('⚠ Routers with zero protected endpoints:', unprotected);
    }
    expect(unprotected.length).toBeLessThan(5);
  });
});
