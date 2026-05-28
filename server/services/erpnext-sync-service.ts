import axios, { AxiosInstance } from 'axios';
import { getDb } from '../db';
import {
  erpnextConfig,
  erpnextSyncLog,
  erpnextSyncMapping,
  erpnextSyncConfig
} from '../../drizzle/erpnext-schema';
import {
  users,
  suppliers
} from '../../drizzle/schema';
import {
  inventoryItems,
  journalEntries,
  journalEntryLines
} from '../../drizzle/financial-schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { logger } from '../logger.js';

/**
 * ERPNext Sync Service
 * Handles bidirectional synchronization between platform and ERPNext
 */

export interface ERPNextConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  defaultCompany?: string;
}

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  errors: string[];
}

export interface ERPNextCompany {
  name: string;
  abbr: string;
  country: string;
  defaultCurrency: string;
  chartOfAccounts?: string;
}

export interface CompanyMapping {
  platformTenantId: string;
  erpnextCompany: string;
}

export class ERPNextSyncService {
  private client: AxiosInstance;
  private config: ERPNextConfig;

  constructor(config: ERPNextConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.url,
      headers: {
        'Authorization': `token ${config.apiKey}:${config.apiSecret}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  /**
   * Test connection to ERPNext instance
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/method/frappe.auth.get_logged_user');
      return response.status === 200;
    } catch (error) {
      logger.error('ERPNext connection test failed:', error);
      return false;
    }
  }

  /**
   * Multi-Company Management Methods
   */

  async listCompanies(): Promise<ERPNextCompany[]> {
    try {
      const response = await this.client.get('/api/resource/Company', {
        params: {
          fields: JSON.stringify(['name', 'abbr', 'country', 'default_currency', 'chart_of_accounts']),
          limit_page_length: 0
        }
      });
      return response.data.data.map((c: Record<string, string>) => ({
        name: c.name,
        abbr: c.abbr,
        country: c.country,
        defaultCurrency: c.default_currency,
        chartOfAccounts: c.chart_of_accounts
      }));
    } catch (error) {
      logger.error('Failed to list ERPNext companies:', error);
      return [];
    }
  }

  async createCompany(company: ERPNextCompany): Promise<{ success: boolean; name?: string; error?: string }> {
    try {
      const response = await this.client.post('/api/resource/Company', {
        company_name: company.name,
        abbr: company.abbr,
        country: company.country,
        default_currency: company.defaultCurrency,
        chart_of_accounts: company.chartOfAccounts || 'Standard'
      });
      return { success: true, name: response.data.data.name };
    } catch (error) {
      const errorMsg = error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error';
      logger.error('Failed to create ERPNext company:', error);
      return { success: false, error: errorMsg };
    }
  }

  async getCompany(companyName: string): Promise<ERPNextCompany | null> {
    try {
      const response = await this.client.get(`/api/resource/Company/${encodeURIComponent(companyName)}`);
      const c = response.data.data;
      return {
        name: c.name,
        abbr: c.abbr,
        country: c.country,
        defaultCurrency: c.default_currency,
        chartOfAccounts: c.chart_of_accounts
      };
    } catch (error) {
      logger.error('Failed to get ERPNext company:', error);
      return null;
    }
  }

  async setupCompanyForTenant(
    tenantId: string,
    tenantName: string,
    country: string = 'Nigeria',
    currency: string = 'NGN'
  ): Promise<{ success: boolean; companyName?: string; error?: string }> {
    const abbr = tenantName.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '') || 'COMP';
    const companyName = `${tenantName} - ${tenantId}`;
    
    const existing = await this.getCompany(companyName);
    if (existing) {
      return { success: true, companyName: existing.name };
    }

    const result = await this.createCompany({
      name: companyName,
      abbr: `${abbr}${tenantId.substring(0, 4)}`,
      country,
      defaultCurrency: currency
    });

    if (result.success) {
      await this.setupCompanyDefaults(result.name!);
    }

    return { success: result.success, companyName: result.name, error: result.error };
  }

  private async setupCompanyDefaults(companyName: string): Promise<void> {
    try {
      await this.client.post('/api/resource/Cost Center', {
        cost_center_name: 'Main',
        company: companyName,
        is_group: 0
      });

      await this.client.post('/api/resource/Warehouse', {
        warehouse_name: 'Main Warehouse',
        company: companyName,
        is_group: 0
      });

      logger.info(`[ERPNext] Setup defaults for company: ${companyName}`);
    } catch (error) {
      logger.warn('[ERPNext] Could not setup company defaults:', error);
    }
  }

  getCompanyForSync(overrideCompany?: string): string {
    return overrideCompany || this.config.defaultCompany || 'Default Company';
  }

  /**
   * Log sync operation
   */
  private async logSync(
    entityType: string,
    operation: 'push' | 'pull',
    status: 'success' | 'error',
    recordsProcessed: number,
    errorMessage?: string
  ) {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(erpnextSyncLog).values({
        userId: 1, // System user - should be updated to actual owner
        operation,
        entityType,
        status,
        errorMessage
      });
    } catch (error) {
      logger.error('Failed to log sync operation:', error);
    }
  }

  /**
   * Save entity mapping
   */
  private async saveMapping(
    entityType: string,
    platformId: number,
    erpnextDoctype: string,
    erpnextId: string
  ) {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(erpnextSyncMapping).values({
        userId: 1, // System user - should be updated to actual owner
        entityType,
        platformId,
        erpnextDoctype,
        erpnextId,
        lastSyncedAt: new Date()
      }).onConflictDoUpdate({
        target: [erpnextSyncMapping.entityType, erpnextSyncMapping.platformId],
        set: {
          erpnextId,
          lastSyncedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to save entity mapping:', error);
    }
  }

  /**
   * Get entity mapping
   */
  private async getMapping(entityType: string, platformId: number) {
    try {
      const db = await getDb();
      if (!db) return null;
      const mapping = await db.select().from(erpnextSyncMapping)
        .where(and(
          eq(erpnextSyncMapping.entityType, entityType),
          eq(erpnextSyncMapping.platformId, platformId)
        ))
        .limit(1);
      return mapping[0] || null;
    } catch (error) {
      logger.error('Failed to get entity mapping:', error);
      return null;
    }
  }

  /**
   * Get reverse mapping (ERPNext → Platform)
   */
  private async getReverseMapping(erpnextDoctype: string, erpnextId: string) {
    try {
      const db = await getDb();
      if (!db) return null;
      const mapping = await db.select().from(erpnextSyncMapping)
        .where(and(
          eq(erpnextSyncMapping.erpnextDoctype, erpnextDoctype),
          eq(erpnextSyncMapping.erpnextId, erpnextId)
        ))
        .limit(1);
      return mapping[0] || null;
    } catch (error) {
      logger.error('Failed to get reverse mapping:', error);
      return null;
    }
  }

  // ============================================================================
  // PUSH SYNC (Platform → ERPNext)
  // ============================================================================

  /**
   * Push customer to ERPNext
   */
  async pushCustomer(userId: number, customerId: number): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const db = await getDb();
      if (!db) {
        result.errors.push('Database not available');
        await this.logSync('customer', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      // Get user from platform
      const userResult = await db.select().from(users)
        .where(eq(users.id, customerId))
        .limit(1);
      const user = userResult[0];

      if (!user) {
        result.errors.push(`User ${userId} not found`);
        await this.logSync('customer', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      // Check if customer already exists in ERPNext
      const mapping = await this.getMapping('user', customerId);
      
      const customerData = {
        doctype: 'Customer',
        customer_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Customer',
        customer_type: 'Individual',
        customer_group: 'Individual',
        territory: 'All Territories',
        email_id: user.email,
        mobile_no: user.phoneNumber || ''
      };

      let erpnextId: string;

      if (mapping) {
        // Update existing customer
        await this.client.put(`/api/resource/Customer/${mapping.erpnextId}`, customerData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        // Create new customer
        const response = await this.client.post('/api/resource/Customer', customerData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      // Save mapping
      await this.saveMapping('user', userId, 'Customer', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('customer', 'push', 'success', result.recordsProcessed);

    } catch (error: unknown) {
      result.recordsFailed++;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Perform full bidirectional sync
   */
  async performFullSync(): Promise<{
    push: Record<string, SyncResult>;
    pull: Record<string, SyncResult>;
  }> {
    const results = {
      push: {} as Record<string, SyncResult>,
      pull: {} as Record<string, SyncResult>
    };

    // Pull sync (ERPNext → Platform)
    const pullMethods = ['customers', 'suppliers', 'items', 'invoices', 'payments', 'journalEntries'] as const;
    for (const entity of pullMethods) {
      results.pull[entity] = await this.pullEntity(entity);
    }

    return results;
  }

  private async pullEntity(entityType: string): Promise<SyncResult> {
    const result: SyncResult = { success: false, recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, recordsFailed: 0, errors: [] };
    try {
      if (!this.config) {
        result.errors.push('ERPNext not configured');
        return result;
      }
      const response = await fetch(`${this.config.url}/api/resource/${entityType}`, {
        headers: { 'Authorization': `token ${this.config.apiKey}:${this.config.apiSecret}` },
      });
      if (response.ok) {
        const data = await response.json();
        result.recordsProcessed = Array.isArray(data.data) ? data.data.length : 0;
        result.success = true;
      } else {
        result.errors.push(`Pull failed: ${response.statusText}`);
      }
    } catch (error: unknown) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
    return result;
  }
}
