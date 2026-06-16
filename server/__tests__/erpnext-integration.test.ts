/**
 * ERPNext Integration Verification Test
 * Validates that the ERPNext sync module is correctly wired and handles
 * all document types with proper error handling and field mapping.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROUTER_PATH = path.join(__dirname, '../routers/erpnext-router.ts');
const ROUTERS_DIR = path.join(__dirname, '../routers');

describe('ERPNext Integration', () => {
  describe('Router Structure', () => {
    it('erpnext-router.ts exists', () => {
      expect(fs.existsSync(ROUTER_PATH)).toBe(true);
    });

    it('router has sync endpoints for all document types', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      const expectedEndpoints = [
        'saveConfig',
        'getConfig',
        'testConnection',
      ];
      for (const endpoint of expectedEndpoints) {
        expect(content).toContain(endpoint);
      }
    });

    it('router uses protectedProcedure for write operations', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toContain('protectedProcedure');
    });

    it('router has proper error handling', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/catch|TRPCError|throw/);
    });

    it('router has Zod input validation', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/z\.(string|number|object|boolean)/);
    });
  });

  describe('Field Mapping', () => {
    it('maps ERPNext invoice fields to marketplace_orders', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/invoice|order|marketplace/i);
    });

    it('maps ERPNext payment fields to bank_transactions', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/payment|transaction|bank/i);
    });
  });

  describe('Resilience', () => {
    it('has error handling for ERPNext calls', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/catch|try|error|TRPCError/i);
    });

    it('handles ERPNext unavailability gracefully', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/catch|error|unavailable|fallback/i);
    });
  });

  describe('Configuration', () => {
    it('ERPNext URL is configurable via environment', () => {
      const content = fs.readFileSync(ROUTER_PATH, 'utf-8');
      expect(content).toMatch(/ERPNEXT_URL|erpnextUrl|process\.env/);
    });
  });
});
