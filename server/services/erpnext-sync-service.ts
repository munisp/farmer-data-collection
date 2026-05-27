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
      console.error('ERPNext connection test failed:', error);
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
      console.error('Failed to list ERPNext companies:', error);
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
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to create ERPNext company:', error);
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
      console.error('Failed to get ERPNext company:', error);
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

      console.log(`[ERPNext] Setup defaults for company: ${companyName}`);
    } catch (error) {
      console.warn('[ERPNext] Could not setup company defaults:', error);
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
      console.error('Failed to log sync operation:', error);
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
      console.error('Failed to save entity mapping:', error);
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
      console.error('Failed to get entity mapping:', error);
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
      console.error('Failed to get reverse mapping:', error);
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

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('customer', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push supplier to ERPNext
   */
  async pushSupplier(userId: number, supplierId: number): Promise<SyncResult> {
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
        return result;
      }

      const supplierResult = await db.select().from(suppliers)
        .where(eq(suppliers.id, supplierId))
        .limit(1);
      const supplier = supplierResult[0];

      if (!supplier) {
        result.errors.push(`Supplier ${supplierId} not found`);
        await this.logSync('supplier', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      const mapping = await this.getMapping('supplier', supplierId);
      
      const supplierData = {
        doctype: 'Supplier',
        supplier_name: supplier.name,
        supplier_group: 'All Supplier Groups',
        supplier_type: 'Company',
        email_id: supplier.email || '',
        mobile_no: supplier.phoneNumber || ''
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Supplier/${mapping.erpnextId}`, supplierData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Supplier', supplierData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      await this.saveMapping('supplier', supplierId, 'Supplier', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('supplier', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('supplier', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push inventory item to ERPNext
   */
  async pushItem(userId: number, itemId: number): Promise<SyncResult> {
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
        return result;
      }

      const itemResult = await db.select().from(inventoryItems)
        .where(eq(inventoryItems.id, itemId))
        .limit(1);
      const item = itemResult[0];

      if (!item) {
        result.errors.push(`Item ${itemId} not found`);
        await this.logSync('item', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      const mapping = await this.getMapping('inventory_item', itemId);
      
      const itemData = {
        doctype: 'Item',
        item_code: `ITEM-${item.id}`, // Generate item code from ID
        item_name: item.itemName,
        item_group: 'Products',
        stock_uom: item.unit,
        is_stock_item: 1,
        opening_stock: item.quantityOnHand,
        valuation_rate: item.unitCost / 100 // Convert from cents
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Item/${mapping.erpnextId}`, itemData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Item', itemData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      await this.saveMapping('inventory_item', itemId, 'Item', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('item', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('item', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push sales invoice to ERPNext
   */
  async pushInvoice(userId: number, orderId: number): Promise<SyncResult> {
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
        return result;
      }

      // Import the orders table
      const { erpnextOrders, erpnextOrderItems } = await import('../../drizzle/erpnext-schema.js');
      
      const [order] = await db.select().from(erpnextOrders).where(eq(erpnextOrders.id, orderId)).limit(1);

      if (!order) {
        result.errors.push(`Order ${orderId} not found`);
        await this.logSync('invoice', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      // Get order items
      const orderItems = await db.select().from(erpnextOrderItems).where(eq(erpnextOrderItems.orderId, orderId));

      const mapping = await this.getMapping('order', orderId);
      
      const invoiceData = {
        doctype: 'Sales Invoice',
        customer: order.customerName,
        posting_date: order.orderDate.toISOString().split('T')[0],
        due_date: order.dueDate?.toISOString().split('T')[0] || order.orderDate.toISOString().split('T')[0],
        currency: order.currency,
        items: orderItems.length > 0 ? orderItems.map(item => ({
          item_code: item.itemCode,
          item_name: item.itemName,
          description: item.description,
          qty: item.quantity,
          uom: item.uom,
          rate: item.rate / 100, // Convert from cents
        })) : [{
          item_code: 'MISC-001',
          qty: 1,
          rate: order.totalAmount / 100
        }]
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Sales Invoice/${mapping.erpnextId}`, invoiceData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Sales Invoice', invoiceData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      // Update order with ERPNext ID
      await db.update(erpnextOrders).set({
        erpnextId: erpnextId,
        erpnextSynced: true,
        erpnextSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(erpnextOrders.id, orderId));

      await this.saveMapping('order', orderId, 'Sales Invoice', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('invoice', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('invoice', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
    /* try {
      const db = await getDb();
      if (!db) {
        result.errors.push('Database not available');
        return result;
      }

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderId)
      });

      if (!order) {
        result.errors.push(`Order ${orderId} not found`);
        await this.logSync('invoice', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      // Get customer mapping
      const customerMapping = await this.getMapping('user', order.customerId);
      if (!customerMapping) {
        result.errors.push(`Customer mapping not found for user ${order.customerId}`);
        await this.logSync('invoice', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      const mapping = await this.getMapping('order', orderId);
      
      const invoiceData = {
        doctype: 'Sales Invoice',
        customer: customerMapping.erpnextId,
        posting_date: order.orderDate.toISOString().split('T')[0],
        due_date: order.orderDate.toISOString().split('T')[0],
        items: [
          {
            item_code: 'MISC-001', // Placeholder item
            qty: 1,
            rate: order.totalAmount
          }
        ]
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Sales Invoice/${mapping.erpnextId}`, invoiceData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Sales Invoice', invoiceData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      await this.saveMapping('order', orderId, 'Sales Invoice', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('invoice', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('invoice', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result; */
  }

  /**
   * Push payment entry to ERPNext
   */
  async pushPayment(userId: number, paymentId: number): Promise<SyncResult> {
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
        return result;
      }

      // Import the payments table
      const { erpnextPayments, erpnextPaymentReferences } = await import('../../drizzle/erpnext-schema.js');
      
      const [payment] = await db.select().from(erpnextPayments).where(eq(erpnextPayments.id, paymentId)).limit(1);

      if (!payment) {
        result.errors.push(`Payment ${paymentId} not found`);
        await this.logSync('payment', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      // Get payment references
      const references = await db.select().from(erpnextPaymentReferences).where(eq(erpnextPaymentReferences.paymentId, paymentId));

      const mapping = await this.getMapping('payment', paymentId);
      
      const paymentData = {
        doctype: 'Payment Entry',
        payment_type: payment.paymentType === 'receive' ? 'Receive' : payment.paymentType === 'pay' ? 'Pay' : 'Internal Transfer',
        party_type: payment.partyType,
        party: payment.partyName,
        posting_date: payment.paymentDate.toISOString().split('T')[0],
        mode_of_payment: payment.modeOfPayment,
        paid_amount: payment.paidAmount / 100, // Convert from cents
        received_amount: (payment.receivedAmount || payment.paidAmount) / 100,
        reference_no: payment.referenceNo,
        reference_date: payment.referenceDate?.toISOString().split('T')[0],
        remarks: payment.remarks,
        references: references.map(ref => ({
          reference_doctype: ref.referenceDoctype,
          reference_name: ref.referenceName,
          total_amount: ref.totalAmount / 100,
          outstanding_amount: ref.outstandingAmount / 100,
          allocated_amount: ref.allocatedAmount / 100
        }))
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Payment Entry/${mapping.erpnextId}`, paymentData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Payment Entry', paymentData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      // Update payment with ERPNext ID
      await db.update(erpnextPayments).set({
        erpnextId: erpnextId,
        erpnextSynced: true,
        erpnextSyncedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(erpnextPayments.id, paymentId));

      await this.saveMapping('payment', paymentId, 'Payment Entry', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('payment', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('payment', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push journal entry to ERPNext
   */
  async pushJournalEntry(userId: number, journalEntryId: number): Promise<SyncResult> {
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
        return result;
      }

      const entryResult = await db.select().from(journalEntries)
        .where(eq(journalEntries.id, journalEntryId))
        .limit(1);
      const entry = entryResult[0];

      if (!entry) {
        result.errors.push(`Journal entry ${journalEntryId} not found`);
        await this.logSync('journal_entry', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      // Get journal entry lines
      const lines = await db.select().from(journalEntryLines)
        .where(eq(journalEntryLines.journalEntryId, journalEntryId));

      if (!lines || lines.length === 0) {
        result.errors.push('Journal entry lines not found');
        await this.logSync('journal_entry', 'push', 'error', 0, result.errors.join(', '));
        return result;
      }

      const mapping = await this.getMapping('journal_entry', journalEntryId);
      
      const journalData = {
        doctype: 'Journal Entry',
        posting_date: entry.entryDate.toISOString().split('T')[0],
        accounts: lines.map((line: any) => ({
          account: line.accountCode,
          debit_in_account_currency: line.debit / 100, // Convert from cents
          credit_in_account_currency: line.credit / 100 // Convert from cents
        })),
        user_remark: entry.description || ''
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Journal Entry/${mapping.erpnextId}`, journalData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Journal Entry', journalData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      await this.saveMapping('journal_entry', journalEntryId, 'Journal Entry', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('journal_entry', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('journal_entry', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  // ============================================================================
  // HR MODULE SYNC (Labor Management Integration)
  // ============================================================================

  /**
   * Push farm worker to ERPNext Employee
   */
  async pushEmployee(userId: number, worker: {
    id: string;
    farmId: number;
    firstName: string;
    lastName: string;
    phone: string;
    workerType: string;
    skills: string[];
    dailyRate: number;
    startDate: Date;
    endDate?: Date;
    status: string;
    bankAccount?: { bankName: string; accountNumber: string; accountName: string };
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const mapping = await this.getMapping('worker', parseInt(worker.id.replace(/\D/g, '')) || 0);
      
      const employeeData = {
        doctype: 'Employee',
        employee_name: `${worker.firstName} ${worker.lastName}`,
        first_name: worker.firstName,
        last_name: worker.lastName,
        cell_number: worker.phone,
        employment_type: worker.workerType === 'permanent' ? 'Full-time' : 
                        worker.workerType === 'seasonal' ? 'Contract' : 
                        worker.workerType === 'casual' ? 'Part-time' : 'Intern',
        date_of_joining: worker.startDate.toISOString().split('T')[0],
        relieving_date: worker.endDate?.toISOString().split('T')[0],
        status: worker.status === 'active' ? 'Active' : 'Left',
        company: 'Farm Operations',
        department: 'Agriculture',
        designation: 'Farm Worker',
        ctc: worker.dailyRate * 26,
        bank_name: worker.bankAccount?.bankName,
        bank_ac_no: worker.bankAccount?.accountNumber
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Employee/${mapping.erpnextId}`, employeeData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Employee', employeeData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      await this.saveMapping('worker', parseInt(worker.id.replace(/\D/g, '')) || 0, 'Employee', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('employee', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('employee', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push work shift to ERPNext Attendance
   */
  async pushAttendance(userId: number, shift: {
    id: string;
    workerId: string;
    date: Date;
    checkInTime?: Date;
    checkOutTime?: Date;
    hours: number;
    status: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const workerMapping = await this.getMapping('worker', parseInt(shift.workerId.replace(/\D/g, '')) || 0);
      if (!workerMapping) {
        result.errors.push(`Worker mapping not found for ${shift.workerId}`);
        return result;
      }

      const attendanceData = {
        doctype: 'Attendance',
        employee: workerMapping.erpnextId,
        attendance_date: shift.date.toISOString().split('T')[0],
        status: shift.status === 'checked_out' ? 'Present' : 
                shift.status === 'absent' ? 'Absent' : 'Half Day',
        working_hours: shift.hours,
        in_time: shift.checkInTime?.toISOString(),
        out_time: shift.checkOutTime?.toISOString()
      };

      const response = await this.client.post('/api/resource/Attendance', attendanceData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('attendance', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('attendance', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push payroll to ERPNext Salary Slip
   */
  async pushSalarySlip(userId: number, payroll: {
    id: string;
    farmId: number;
    workerId: string;
    workerName: string;
    period: { start: Date; end: Date };
    regularHours: number;
    overtimeHours: number;
    regularPay: number;
    overtimePay: number;
    bonuses: number;
    deductions: number;
    netPay: number;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const workerMapping = await this.getMapping('worker', parseInt(payroll.workerId.replace(/\D/g, '')) || 0);
      if (!workerMapping) {
        result.errors.push(`Worker mapping not found for ${payroll.workerId}`);
        return result;
      }

      const salarySlipData = {
        doctype: 'Salary Slip',
        employee: workerMapping.erpnextId,
        employee_name: payroll.workerName,
        start_date: payroll.period.start.toISOString().split('T')[0],
        end_date: payroll.period.end.toISOString().split('T')[0],
        posting_date: new Date().toISOString().split('T')[0],
        total_working_hours: payroll.regularHours + payroll.overtimeHours,
        gross_pay: payroll.regularPay + payroll.overtimePay + payroll.bonuses,
        total_deduction: payroll.deductions,
        net_pay: payroll.netPay,
        earnings: [
          { salary_component: 'Basic', amount: payroll.regularPay },
          { salary_component: 'Overtime', amount: payroll.overtimePay },
          { salary_component: 'Bonus', amount: payroll.bonuses }
        ],
        deductions: payroll.deductions > 0 ? [
          { salary_component: 'Deductions', amount: payroll.deductions }
        ] : []
      };

      const response = await this.client.post('/api/resource/Salary Slip', salarySlipData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('salary_slip', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('salary_slip', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push training to ERPNext Training Event
   */
  async pushTrainingEvent(userId: number, training: {
    moduleId: string;
    title: string;
    description: string;
    duration: number;
    workerIds: string[];
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const employees: string[] = [];
      for (const workerId of training.workerIds) {
        const mapping = await this.getMapping('worker', parseInt(workerId.replace(/\D/g, '')) || 0);
        if (mapping) {
          employees.push(mapping.erpnextId);
        }
      }

      const trainingData = {
        doctype: 'Training Event',
        event_name: training.title,
        type: 'Seminar',
        level: 'All',
        trainer_name: 'Farm Training Team',
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + training.duration * 60000).toISOString(),
        introduction: training.description,
        employees: employees.map(emp => ({ employee: emp }))
      };

      const response = await this.client.post('/api/resource/Training Event', trainingData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('training_event', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('training_event', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  // ============================================================================
  // AGRICULTURE MODULE SYNC (Crop Insurance, Pest/Disease Integration)
  // ============================================================================

  /**
   * Push crop cycle to ERPNext Agriculture Crop Cycle
   */
  async pushCropCycle(userId: number, crop: {
    id: number;
    farmId: number;
    cropName: string;
    plantingDate: Date;
    expectedHarvestDate: Date;
    fieldSize: number;
    status: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const mapping = await this.getMapping('crop', crop.id);
      
      const cropCycleData = {
        doctype: 'Crop Cycle',
        title: `${crop.cropName} - Farm ${crop.farmId}`,
        crop: crop.cropName,
        start_date: crop.plantingDate.toISOString().split('T')[0],
        end_date: crop.expectedHarvestDate.toISOString().split('T')[0],
        iso_8601_standard: 1,
        crop_spacing_uom: 'Hectare',
        crop_spacing: crop.fieldSize
      };

      let erpnextId: string;

      if (mapping) {
        await this.client.put(`/api/resource/Crop Cycle/${mapping.erpnextId}`, cropCycleData);
        erpnextId = mapping.erpnextId;
        result.recordsUpdated++;
      } else {
        const response = await this.client.post('/api/resource/Crop Cycle', cropCycleData);
        erpnextId = response.data.data.name;
        result.recordsCreated++;
      }

      await this.saveMapping('crop', crop.id, 'Crop Cycle', erpnextId);

      result.recordsProcessed++;
      result.success = true;
      await this.logSync('crop_cycle', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('crop_cycle', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push disease detection to ERPNext Plant Analysis
   */
  async pushDiseaseDetection(userId: number, detection: {
    id: string;
    cropId: number;
    diseaseName: string;
    severity: string;
    detectedAt: Date;
    recommendations: string[];
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const cropMapping = await this.getMapping('crop', detection.cropId);
      
      const analysisData = {
        doctype: 'Plant Analysis',
        plant_analysis_criteria: detection.diseaseName,
        collection_datetime: detection.detectedAt.toISOString(),
        result: detection.severity,
        linked_crop_cycle: cropMapping?.erpnextId,
        laboratory_testing_datetime: detection.detectedAt.toISOString()
      };

      const response = await this.client.post('/api/resource/Plant Analysis', analysisData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('plant_analysis', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('plant_analysis', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  // ============================================================================
  // STOCK MODULE SYNC (Input Financing, Post-Harvest Integration)
  // ============================================================================

  /**
   * Push input purchase to ERPNext Purchase Order
   */
  async pushInputPurchase(userId: number, purchase: {
    id: string;
    supplierId: string;
    supplierName: string;
    items: Array<{ name: string; quantity: number; unitPrice: number; unit: string }>;
    totalAmount: number;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const purchaseOrderData = {
        doctype: 'Purchase Order',
        supplier: purchase.supplierName,
        transaction_date: new Date().toISOString().split('T')[0],
        schedule_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: purchase.items.map(item => ({
          item_code: item.name.toUpperCase().replace(/\s+/g, '-'),
          item_name: item.name,
          qty: item.quantity,
          rate: item.unitPrice,
          uom: item.unit
        }))
      };

      const response = await this.client.post('/api/resource/Purchase Order', purchaseOrderData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('purchase_order', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('purchase_order', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push harvest to ERPNext Stock Entry
   */
  async pushHarvestEntry(userId: number, harvest: {
    id: string;
    cropName: string;
    quantity: number;
    unit: string;
    warehouseId: string;
    qualityGrade: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const stockEntryData = {
        doctype: 'Stock Entry',
        stock_entry_type: 'Material Receipt',
        posting_date: new Date().toISOString().split('T')[0],
        items: [{
          item_code: harvest.cropName.toUpperCase().replace(/\s+/g, '-'),
          item_name: harvest.cropName,
          qty: harvest.quantity,
          uom: harvest.unit,
          t_warehouse: harvest.warehouseId || 'Stores - FO',
          basic_rate: 0,
          description: `Quality Grade: ${harvest.qualityGrade}`
        }]
      };

      const response = await this.client.post('/api/resource/Stock Entry', stockEntryData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('stock_entry', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('stock_entry', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  // ============================================================================
  // ACCOUNTING MODULE SYNC (Carbon Credits, Insurance Integration)
  // ============================================================================

  /**
   * Push carbon credit sale to ERPNext Sales Invoice
   */
  async pushCarbonCreditSale(userId: number, sale: {
    id: string;
    buyerName: string;
    credits: number;
    pricePerCredit: number;
    totalAmount: number;
    projectName: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const invoiceData = {
        doctype: 'Sales Invoice',
        customer: sale.buyerName,
        posting_date: new Date().toISOString().split('T')[0],
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        items: [{
          item_code: 'CARBON-CREDIT',
          item_name: `Carbon Credits - ${sale.projectName}`,
          qty: sale.credits,
          rate: sale.pricePerCredit,
          description: `Verified carbon credits from ${sale.projectName}`
        }]
      };

      const response = await this.client.post('/api/resource/Sales Invoice', invoiceData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('carbon_credit_sale', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('carbon_credit_sale', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push insurance premium to ERPNext Journal Entry
   */
  async pushInsurancePremium(userId: number, premium: {
    policyId: string;
    farmerId: number;
    amount: number;
    insuranceProvider: string;
    policyType: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const journalData = {
        doctype: 'Journal Entry',
        voucher_type: 'Journal Entry',
        posting_date: new Date().toISOString().split('T')[0],
        user_remark: `Insurance Premium - Policy ${premium.policyId} - ${premium.policyType}`,
        accounts: [
          {
            account: 'Insurance Expense - FO',
            debit_in_account_currency: premium.amount,
            credit_in_account_currency: 0
          },
          {
            account: 'Cash - FO',
            debit_in_account_currency: 0,
            credit_in_account_currency: premium.amount
          }
        ]
      };

      const response = await this.client.post('/api/resource/Journal Entry', journalData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('insurance_premium', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('insurance_premium', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Push insurance claim payout to ERPNext Journal Entry
   */
  async pushInsuranceClaim(userId: number, claim: {
    claimId: string;
    policyId: string;
    farmerId: number;
    amount: number;
    claimType: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const journalData = {
        doctype: 'Journal Entry',
        voucher_type: 'Journal Entry',
        posting_date: new Date().toISOString().split('T')[0],
        user_remark: `Insurance Claim Payout - Claim ${claim.claimId} - ${claim.claimType}`,
        accounts: [
          {
            account: 'Cash - FO',
            debit_in_account_currency: claim.amount,
            credit_in_account_currency: 0
          },
          {
            account: 'Insurance Receivable - FO',
            debit_in_account_currency: 0,
            credit_in_account_currency: claim.amount
          }
        ]
      };

      const response = await this.client.post('/api/resource/Journal Entry', journalData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('insurance_claim', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('insurance_claim', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  // ============================================================================
  // WATER MANAGEMENT SYNC
  // ============================================================================

  /**
   * Push water usage to ERPNext Stock Entry (for water as inventory)
   */
  async pushWaterUsage(userId: number, usage: {
    farmId: number;
    date: Date;
    volumeLiters: number;
    source: string;
    purpose: string;
  }): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: []
    };

    try {
      const stockEntryData = {
        doctype: 'Stock Entry',
        stock_entry_type: 'Material Issue',
        posting_date: usage.date.toISOString().split('T')[0],
        items: [{
          item_code: 'WATER',
          item_name: 'Water',
          qty: usage.volumeLiters / 1000,
          uom: 'Cubic Meter',
          s_warehouse: `Water Source - ${usage.source}`,
          description: `Water usage for ${usage.purpose}`
        }]
      };

      const response = await this.client.post('/api/resource/Stock Entry', stockEntryData);
      result.recordsCreated++;
      result.recordsProcessed++;
      result.success = true;
      await this.logSync('water_usage', 'push', 'success', result.recordsProcessed);

    } catch (error: any) {
      result.recordsFailed++;
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('water_usage', 'push', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  // ============================================================================
  // PULL SYNC (ERPNext → Platform)
  // ============================================================================

  /**
   * Pull customers from ERPNext and create/update platform users
   */
  async pullCustomers(lastSyncTime?: Date): Promise<SyncResult> {
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
        return result;
      }

      // Build filters for incremental sync
      let filters: any = {};
      if (lastSyncTime) {
        filters.modified = ['>', lastSyncTime.toISOString()];
      }

      // Fetch customers from ERPNext
      const response = await this.client.get('/api/resource/Customer', {
        params: {
          fields: JSON.stringify(['name', 'customer_name', 'email_id', 'mobile_no', 'modified']),
          filters: JSON.stringify(filters),
          limit_page_length: 1000
        }
      });

      const customers = response.data.data || [];

      for (const customer of customers) {
        try {
          // Check if customer already mapped to platform user
          const mapping = await this.getReverseMapping('Customer', customer.name);

          if (mapping) {
            // Update existing user
            await db.update(users)
              .set({
                firstName: customer.customer_name?.split(' ')[0] || 'Customer',
                lastName: customer.customer_name?.split(' ').slice(1).join(' ') || '',
                email: customer.email_id || '',
                phoneNumber: customer.mobile_no || '',
                updatedAt: new Date()
              })
              .where(eq(users.id, mapping.platformId));
            result.recordsUpdated++;
          } else {
            // Create new user (only if email exists)
            if (customer.email_id) {
              const [newUser] = await db.insert(users).values({
                firstName: customer.customer_name?.split(' ')[0] || 'Customer',
                lastName: customer.customer_name?.split(' ').slice(1).join(' ') || '',
                email: customer.email_id,
                phoneNumber: customer.mobile_no || '',
                password: 'ERPNEXT_SYNC', // Placeholder - user should reset password
                role: 'customer',
                createdAt: new Date(),
                updatedAt: new Date()
              }).returning();

              // Save mapping
              await this.saveMapping('user', newUser.id, 'Customer', customer.name);
              result.recordsCreated++;
            }
          }

          result.recordsProcessed++;
        } catch (error: any) {
          result.recordsFailed++;
          result.errors.push(`Failed to sync customer ${customer.name}: ${error.message}`);
        }
      }

      result.success = result.recordsFailed === 0;
      await this.logSync('customer', 'pull', result.success ? 'success' : 'error', result.recordsProcessed, result.errors.join(', '));

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('customer', 'pull', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Pull suppliers from ERPNext
   */
  async pullSuppliers(lastSyncTime?: Date): Promise<SyncResult> {
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
        return result;
      }

      let filters: any = {};
      if (lastSyncTime) {
        filters.modified = ['>', lastSyncTime.toISOString()];
      }

      const response = await this.client.get('/api/resource/Supplier', {
        params: {
          fields: JSON.stringify(['name', 'supplier_name', 'email_id', 'mobile_no', 'modified']),
          filters: JSON.stringify(filters),
          limit_page_length: 1000
        }
      });

      const erpSuppliers = response.data.data || [];

      for (const supplier of erpSuppliers) {
        try {
          const mapping = await this.getReverseMapping('Supplier', supplier.name);

          if (mapping) {
            // Update existing supplier
            await db.update(suppliers)
              .set({
                name: supplier.supplier_name,
                email: supplier.email_id || '',
                phoneNumber: supplier.mobile_no || '',
                updatedAt: new Date()
              })
              .where(eq(suppliers.id, mapping.platformId));
            result.recordsUpdated++;
          } else {
            // Create new supplier
            const [newSupplier] = await db.insert(suppliers).values({
              userId: 1, // System user - should be updated to actual owner
              name: supplier.supplier_name,
              email: supplier.email_id || '',
              phoneNumber: supplier.mobile_no || '',
              address: '',
              contactPerson: '',
              paymentTerms: 'Net 30',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();

            await this.saveMapping('supplier', newSupplier.id, 'Supplier', supplier.name);
            result.recordsCreated++;
          }

          result.recordsProcessed++;
        } catch (error: any) {
          result.recordsFailed++;
          result.errors.push(`Failed to sync supplier ${supplier.name}: ${error.message}`);
        }
      }

      result.success = result.recordsFailed === 0;
      await this.logSync('supplier', 'pull', result.success ? 'success' : 'error', result.recordsProcessed, result.errors.join(', '));

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('supplier', 'pull', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Pull items from ERPNext
   */
  async pullItems(lastSyncTime?: Date): Promise<SyncResult> {
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
        return result;
      }

      let filters: any = { is_stock_item: 1 };
      if (lastSyncTime) {
        filters.modified = ['>', lastSyncTime.toISOString()];
      }

      const response = await this.client.get('/api/resource/Item', {
        params: {
          fields: JSON.stringify(['name', 'item_code', 'item_name', 'stock_uom', 'valuation_rate', 'modified']),
          filters: JSON.stringify(filters),
          limit_page_length: 1000
        }
      });

      const items = response.data.data || [];

      for (const item of items) {
        try {
          const mapping = await this.getReverseMapping('Item', item.name);

          if (mapping) {
            // Update existing item
            await db.update(inventoryItems)
              .set({
                itemName: item.item_name,
                unit: item.stock_uom,
                unitCost: Math.round(parseFloat(item.valuation_rate || '0') * 100), // Convert to cents
                updatedAt: new Date()
              })
              .where(eq(inventoryItems.id, mapping.platformId));
            result.recordsUpdated++;
          } else {
            // Create new item
            const [newItem] = await db.insert(inventoryItems).values({
              userId: 1, // System user - should be updated to actual owner
              itemType: 'seed', // Default type
              itemName: item.item_name,
              category: 'General',
              unit: item.stock_uom,
              quantityOnHand: 0,
              unitCost: Math.round(parseFloat(item.valuation_rate || '0') * 100), // Convert to cents
              reorderLevel: 10,
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();

            await this.saveMapping('inventory_item', newItem.id, 'Item', item.name);
            result.recordsCreated++;
          }

          result.recordsProcessed++;
        } catch (error: any) {
          result.recordsFailed++;
          result.errors.push(`Failed to sync item ${item.name}: ${error.message}`);
        }
      }

      result.success = result.recordsFailed === 0;
      await this.logSync('item', 'pull', result.success ? 'success' : 'error', result.recordsProcessed, result.errors.join(', '));

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('item', 'pull', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  }

  /**
   * Pull sales invoices from ERPNext and create orders
   * NOTE: Disabled - orders table not implemented yet
   */
  /* async pullInvoices(lastSyncTime?: Date): Promise<SyncResult> {
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
        return result;
      }

      let filters: any = {};
      if (lastSyncTime) {
        filters.modified = ['>', lastSyncTime.toISOString()];
      }

      const response = await this.client.get('/api/resource/Sales Invoice', {
        params: {
          fields: JSON.stringify(['name', 'customer', 'posting_date', 'grand_total', 'status', 'modified']),
          filters: JSON.stringify(filters),
          limit_page_length: 1000
        }
      });

      const invoices = response.data.data || [];

      for (const invoice of invoices) {
        try {
          const mapping = await this.getReverseMapping('Sales Invoice', invoice.name);

          // Get customer mapping
          const customerMapping = await this.getReverseMapping('Customer', invoice.customer);
          if (!customerMapping) {
            result.errors.push(`Customer mapping not found for ${invoice.customer}`);
            result.recordsFailed++;
            continue;
          }

          if (mapping) {
            // Update existing order
            await db.update(orders)
              .set({
                totalAmount: parseFloat(invoice.grand_total),
                status: invoice.status === 'Paid' ? 'completed' : 'pending',
                updatedAt: new Date()
              })
              .where(eq(orders.id, mapping.platformId));
            result.recordsUpdated++;
          } else {
            // Create new order
            const [newOrder] = await db.insert(orders).values({
              customerId: customerMapping.platformId,
              orderDate: new Date(invoice.posting_date),
              totalAmount: parseFloat(invoice.grand_total),
              status: invoice.status === 'Paid' ? 'completed' : 'pending',
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();

            await this.saveMapping('order', newOrder.id, 'Sales Invoice', invoice.name);
            result.recordsCreated++;
          }

          result.recordsProcessed++;
        } catch (error: any) {
          result.recordsFailed++;
          result.errors.push(`Failed to sync invoice ${invoice.name}: ${error.message}`);
        }
      }

      result.success = result.recordsFailed === 0;
      await this.logSync('invoice', 'pull', result.success ? 'success' : 'error', result.recordsProcessed, result.errors.join(', '));

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('invoice', 'pull', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  } */

  /**
   * Pull payment entries from ERPNext
   * NOTE: Disabled - payments table not implemented yet
   */
  /* async pullPayments(lastSyncTime?: Date): Promise<SyncResult> {
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
        return result;
      }

      let filters: any = { payment_type: 'Receive' };
      if (lastSyncTime) {
        filters.modified = ['>', lastSyncTime.toISOString()];
      }

      const response = await this.client.get('/api/resource/Payment Entry', {
        params: {
          fields: JSON.stringify(['name', 'posting_date', 'paid_amount', 'mode_of_payment', 'modified']),
          filters: JSON.stringify(filters),
          limit_page_length: 1000
        }
      });

      const paymentEntries = response.data.data || [];

      for (const payment of paymentEntries) {
        try {
          const mapping = await this.getReverseMapping('Payment Entry', payment.name);

          // Note: This is simplified - in production you'd need to link to the correct order
          // by parsing the payment references
          
          if (!mapping) {
            // Create new payment (simplified - would need order linkage)
            const [newPayment] = await db.insert(payments).values({
              orderId: '', // Would need to resolve from payment references
              paymentDate: new Date(payment.posting_date),
              amount: parseFloat(payment.paid_amount),
              paymentMethod: payment.mode_of_payment || 'cash',
              status: 'completed',
              createdAt: new Date(),
              updatedAt: new Date()
            }).returning();

            await this.saveMapping('payment', newPayment.id, 'Payment Entry', payment.name);
            result.recordsCreated++;
          }

          result.recordsProcessed++;
        } catch (error: any) {
          result.recordsFailed++;
          result.errors.push(`Failed to sync payment ${payment.name}: ${error.message}`);
        }
      }

      result.success = result.recordsFailed === 0;
      await this.logSync('payment', 'pull', result.success ? 'success' : 'error', result.recordsProcessed, result.errors.join(', '));

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('payment', 'pull', 'error', result.recordsProcessed, result.errors.join(', '));
    }

    return result;
  } */

  /**
   * Pull journal entries from ERPNext
   */
  async pullJournalEntries(lastSyncTime?: Date): Promise<SyncResult> {
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
        return result;
      }

      let filters: any = {};
      if (lastSyncTime) {
        filters.modified = ['>', lastSyncTime.toISOString()];
      }

      const response = await this.client.get('/api/resource/Journal Entry', {
        params: {
          fields: JSON.stringify(['name', 'posting_date', 'user_remark', 'modified']),
          filters: JSON.stringify(filters),
          limit_page_length: 1000
        }
      });

      const entries = response.data.data || [];

      for (const entry of entries) {
        try {
          const mapping = await this.getReverseMapping('Journal Entry', entry.name);

          // Note: This is simplified - would need to parse accounts from journal entry details
          
          if (!mapping) {
            // Would need to fetch full journal entry details and create corresponding platform entry
            // Skipping for now as it requires complex account mapping
            result.recordsProcessed++;
          }

        } catch (error: any) {
          result.recordsFailed++;
          result.errors.push(`Failed to sync journal entry ${entry.name}: ${error.message}`);
        }
      }

      result.success = result.recordsFailed === 0;
      await this.logSync('journal_entry', 'pull', result.success ? 'success' : 'error', result.recordsProcessed, result.errors.join(', '));

    } catch (error: any) {
      result.errors.push(error.message || 'Unknown error');
      await this.logSync('journal_entry', 'pull', 'error', result.recordsProcessed, result.errors.join(', '));
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
    results.pull.customers = await this.pullCustomers();
    results.pull.suppliers = await this.pullSuppliers();
    results.pull.items = await this.pullItems();
    // results.pull.invoices = await this.pullInvoices(); // Disabled - orders table not implemented
    // results.pull.payments = await this.pullPayments(); // Disabled - payments table not implemented
    results.pull.journalEntries = await this.pullJournalEntries();

    return results;
  }
}
