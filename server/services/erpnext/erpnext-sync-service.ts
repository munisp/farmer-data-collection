import axios, { AxiosInstance } from "axios";
import { getDb } from "../../db.js";
import {
  erpnextConfig,
  erpnextSyncMapping,
  erpnextSyncLog,
  erpnextSyncQueue,
  erpnextSyncConflicts,
  erpnextSyncConfig,
} from "../../../drizzle/erpnext-schema.js";
import { eq, and, desc } from "drizzle-orm";
import { logger } from '../../logger.js';

/**
 * ERPNext Sync Service
 * 
 * Handles bidirectional synchronization between platform and ERPNext
 */

export interface ERPNextConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export interface SyncResult {
  success: boolean;
  platformId?: number;
  erpnextId?: string;
  operation: "create" | "update" | "delete";
  error?: string;
}

export interface EntityMapping {
  platformId: number;
  erpnextId: string;
  version: number;
  lastSyncedAt: Date | null;
}

export class ERPNextSyncService {
  private client: AxiosInstance | null = null;
  private config: ERPNextConfig | null = null;

  /**
   * Initialize ERPNext API client
   */
  async initialize(userId: number): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const configs = await db
      .select()
      .from(erpnextConfig)
      .where(eq(erpnextConfig.userId, userId))
      .limit(1);

    if (configs.length === 0) {
      throw new Error("ERPNext configuration not found");
    }

    const config = configs[0];
    this.config = {
      url: config.erpnextUrl,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
    };

    // Create axios client with authentication
    this.client = axios.create({
      baseURL: config.erpnextUrl,
      headers: {
        Authorization: `token ${config.apiKey}:${config.apiSecret}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Test ERPNext connection
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) throw new Error("Client not initialized");

    try {
      const response = await this.client.get("/api/method/frappe.auth.get_logged_user");
      return response.status === 200;
    } catch (error) {
      logger.error("ERPNext connection test failed:", error);
      return false;
    }
  }

  /**
   * Get entity mapping
   */
  async getMapping(
    userId: number,
    entityType: string,
    platformId: number
  ): Promise<EntityMapping | null> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const mappings = await db
      .select()
      .from(erpnextSyncMapping)
      .where(
        and(
          eq(erpnextSyncMapping.userId, userId),
          eq(erpnextSyncMapping.entityType, entityType),
          eq(erpnextSyncMapping.platformId, platformId)
        )
      )
      .limit(1);

    if (mappings.length === 0) return null;

    const mapping = mappings[0];
    return {
      platformId: mapping.platformId,
      erpnextId: mapping.erpnextId,
      version: mapping.version,
      lastSyncedAt: mapping.lastSyncedAt,
    };
  }

  /**
   * Create or update entity mapping
   */
  async saveMapping(
    userId: number,
    entityType: string,
    platformId: number,
    erpnextId: string,
    erpnextDoctype: string
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const existing = await this.getMapping(userId, entityType, platformId);

    if (existing) {
      await db
        .update(erpnextSyncMapping)
        .set({
          erpnextId,
          version: existing.version + 1,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(erpnextSyncMapping.userId, userId),
            eq(erpnextSyncMapping.entityType, entityType),
            eq(erpnextSyncMapping.platformId, platformId)
          )
        );
    } else {
      await db.insert(erpnextSyncMapping).values({
        userId,
        entityType,
        platformId,
        erpnextId,
        erpnextDoctype,
        lastSyncedAt: new Date(),
        version: 1,
      });
    }
  }

  /**
   * Log sync operation
   */
  async logSync(
    userId: number,
    operation: string,
    entityType: string,
    platformId: number | undefined,
    erpnextId: string | undefined,
    status: string,
    errorMessage?: string,
    requestData?: any,
    responseData?: any,
    duration?: number
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(erpnextSyncLog).values({
      userId,
      operation,
      entityType,
      platformId: platformId || null,
      erpnextId: erpnextId || null,
      status,
      errorMessage: errorMessage || null,
      requestData: requestData || null,
      responseData: responseData || null,
      duration: duration || null,
    });
  }

  /**
   * Push customer to ERPNext
   */
  async pushCustomer(userId: number, customer: any): Promise<SyncResult> {
    if (!this.client) throw new Error("Client not initialized");

    const startTime = Date.now();
    try {
      const mapping = await this.getMapping(userId, "customer", customer.id);

      const erpnextData = {
        doctype: "Customer",
        customer_name: customer.name || customer.fullName,
        customer_type: "Individual",
        customer_group: "Farmers",
        territory: "Kenya",
        mobile_no: customer.phone || customer.phoneNumber,
        email_id: customer.email,
        custom_platform_id: customer.id.toString(),
      };

      let response;
      let operation: "create" | "update";

      if (mapping) {
        // Update existing
        response = await this.client.put(
          `/api/resource/Customer/${mapping.erpnextId}`,
          erpnextData
        );
        operation = "update";
      } else {
        // Create new
        response = await this.client.post("/api/resource/Customer", erpnextData);
        operation = "create";
      }

      const erpnextId = response.data.data.name;
      await this.saveMapping(userId, "customer", customer.id, erpnextId, "Customer");

      const duration = Date.now() - startTime;
      await this.logSync(
        userId,
        "push",
        "customer",
        customer.id,
        erpnextId,
        "success",
        undefined,
        erpnextData,
        response.data,
        duration
      );

      return {
        success: true,
        platformId: customer.id,
        erpnextId,
        operation,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));

      await this.logSync(
        userId,
        "push",
        "customer",
        customer.id,
        undefined,
        "error",
        errorMessage,
        undefined,
        ((error as Record<string, any>).response?.data),
        duration
      );

      return {
        success: false,
        platformId: customer.id,
        operation: "create",
        error: errorMessage,
      };
    }
  }

  /**
   * Push supplier to ERPNext
   */
  async pushSupplier(userId: number, supplier: any): Promise<SyncResult> {
    if (!this.client) throw new Error("Client not initialized");

    const startTime = Date.now();
    try {
      const mapping = await this.getMapping(userId, "supplier", supplier.id);

      const erpnextData = {
        doctype: "Supplier",
        supplier_name: supplier.name,
        supplier_group: "Agricultural Inputs",
        supplier_type: "Company",
        mobile_no: supplier.phone,
        email_id: supplier.email,
        custom_platform_id: supplier.id.toString(),
      };

      let response;
      let operation: "create" | "update";

      if (mapping) {
        response = await this.client.put(
          `/api/resource/Supplier/${mapping.erpnextId}`,
          erpnextData
        );
        operation = "update";
      } else {
        response = await this.client.post("/api/resource/Supplier", erpnextData);
        operation = "create";
      }

      const erpnextId = response.data.data.name;
      await this.saveMapping(userId, "supplier", supplier.id, erpnextId, "Supplier");

      const duration = Date.now() - startTime;
      await this.logSync(
        userId,
        "push",
        "supplier",
        supplier.id,
        erpnextId,
        "success",
        undefined,
        erpnextData,
        response.data,
        duration
      );

      return {
        success: true,
        platformId: supplier.id,
        erpnextId,
        operation,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));

      await this.logSync(
        userId,
        "push",
        "supplier",
        supplier.id,
        undefined,
        "error",
        errorMessage,
        undefined,
        ((error as Record<string, any>).response?.data),
        duration
      );

      return {
        success: false,
        platformId: supplier.id,
        operation: "create",
        error: errorMessage,
      };
    }
  }

  /**
   * Push inventory item to ERPNext
   */
  async pushItem(userId: number, item: any): Promise<SyncResult> {
    if (!this.client) throw new Error("Client not initialized");

    const startTime = Date.now();
    try {
      const mapping = await this.getMapping(userId, "item", item.id);

      const erpnextData = {
        doctype: "Item",
        item_code: item.itemCode,
        item_name: item.name,
        item_group: item.category || "Products",
        stock_uom: item.unit || "Unit",
        valuation_method: item.valuationMethod === "fifo" ? "FIFO" : "Moving Average",
        standard_rate: item.unitCost || 0,
        custom_platform_id: item.id.toString(),
      };

      let response;
      let operation: "create" | "update";

      if (mapping) {
        response = await this.client.put(
          `/api/resource/Item/${mapping.erpnextId}`,
          erpnextData
        );
        operation = "update";
      } else {
        response = await this.client.post("/api/resource/Item", erpnextData);
        operation = "create";
      }

      const erpnextId = response.data.data.name;
      await this.saveMapping(userId, "item", item.id, erpnextId, "Item");

      const duration = Date.now() - startTime;
      await this.logSync(
        userId,
        "push",
        "item",
        item.id,
        erpnextId,
        "success",
        undefined,
        erpnextData,
        response.data,
        duration
      );

      return {
        success: true,
        platformId: item.id,
        erpnextId,
        operation,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));

      await this.logSync(
        userId,
        "push",
        "item",
        item.id,
        undefined,
        "error",
        errorMessage,
        undefined,
        ((error as Record<string, any>).response?.data),
        duration
      );

      return {
        success: false,
        platformId: item.id,
        operation: "create",
        error: errorMessage,
      };
    }
  }

  /**
   * Push sales invoice to ERPNext
   */
  async pushInvoice(userId: number, invoice: any): Promise<SyncResult> {
    if (!this.client) throw new Error("Client not initialized");

    const startTime = Date.now();
    try {
      const mapping = await this.getMapping(userId, "invoice", invoice.id);

      // Get customer mapping
      const customerMapping = await this.getMapping(
        userId,
        "customer",
        invoice.customerId
      );
      if (!customerMapping) {
        throw new Error("Customer not synced to ERPNext");
      }

      const erpnextData = {
        doctype: "Sales Invoice",
        customer: customerMapping.erpnextId,
        posting_date: new Date(invoice.createdAt).toISOString().split("T")[0],
        due_date: invoice.dueDate
          ? new Date(invoice.dueDate).toISOString().split("T")[0]
          : undefined,
        items: invoice.items.map((item: Record<string, any>) => ({
          item_code: item.itemCode,
          qty: item.quantity,
          rate: item.price,
          amount: item.quantity * item.price,
        })),
        custom_platform_id: invoice.id.toString(),
      };

      let response;
      let operation: "create" | "update";

      if (mapping) {
        response = await this.client.put(
          `/api/resource/Sales Invoice/${mapping.erpnextId}`,
          erpnextData
        );
        operation = "update";
      } else {
        response = await this.client.post("/api/resource/Sales Invoice", erpnextData);
        operation = "create";
      }

      const erpnextId = response.data.data.name;
      await this.saveMapping(userId, "invoice", invoice.id, erpnextId, "Sales Invoice");

      const duration = Date.now() - startTime;
      await this.logSync(
        userId,
        "push",
        "invoice",
        invoice.id,
        erpnextId,
        "success",
        undefined,
        erpnextData,
        response.data,
        duration
      );

      return {
        success: true,
        platformId: invoice.id,
        erpnextId,
        operation,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));

      await this.logSync(
        userId,
        "push",
        "invoice",
        invoice.id,
        undefined,
        "error",
        errorMessage,
        undefined,
        ((error as Record<string, any>).response?.data),
        duration
      );

      return {
        success: false,
        platformId: invoice.id,
        operation: "create",
        error: errorMessage,
      };
    }
  }

  /**
   * Push payment entry to ERPNext
   */
  async pushPayment(userId: number, payment: any): Promise<SyncResult> {
    if (!this.client) throw new Error("Client not initialized");

    const startTime = Date.now();
    try {
      const mapping = await this.getMapping(userId, "payment", payment.id);

      // Get customer mapping
      const customerMapping = await this.getMapping(
        userId,
        "customer",
        payment.customerId
      );
      if (!customerMapping) {
        throw new Error("Customer not synced to ERPNext");
      }

      const erpnextData = {
        doctype: "Payment Entry",
        payment_type: "Receive",
        party_type: "Customer",
        party: customerMapping.erpnextId,
        paid_amount: payment.amount,
        received_amount: payment.amount,
        posting_date: new Date(payment.createdAt).toISOString().split("T")[0],
        mode_of_payment: payment.method || "Cash",
        custom_platform_id: payment.id.toString(),
      };

      let response;
      let operation: "create" | "update";

      if (mapping) {
        response = await this.client.put(
          `/api/resource/Payment Entry/${mapping.erpnextId}`,
          erpnextData
        );
        operation = "update";
      } else {
        response = await this.client.post("/api/resource/Payment Entry", erpnextData);
        operation = "create";
      }

      const erpnextId = response.data.data.name;
      await this.saveMapping(userId, "payment", payment.id, erpnextId, "Payment Entry");

      const duration = Date.now() - startTime;
      await this.logSync(
        userId,
        "push",
        "payment",
        payment.id,
        erpnextId,
        "success",
        undefined,
        erpnextData,
        response.data,
        duration
      );

      return {
        success: true,
        platformId: payment.id,
        erpnextId,
        operation,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));

      await this.logSync(
        userId,
        "push",
        "payment",
        payment.id,
        undefined,
        "error",
        errorMessage,
        undefined,
        ((error as Record<string, any>).response?.data),
        duration
      );

      return {
        success: false,
        platformId: payment.id,
        operation: "create",
        error: errorMessage,
      };
    }
  }

  /**
   * Push journal entry to ERPNext
   */
  async pushJournalEntry(userId: number, entry: any): Promise<SyncResult> {
    if (!this.client) throw new Error("Client not initialized");

    const startTime = Date.now();
    try {
      const mapping = await this.getMapping(userId, "journal", entry.id);

      const erpnextData = {
        doctype: "Journal Entry",
        posting_date: new Date(entry.entryDate).toISOString().split("T")[0],
        voucher_type: "Journal Entry",
        user_remark: entry.description,
        accounts: entry.lines.map((line: Record<string, any>) => ({
          account: line.accountCode,
          debit_in_account_currency: line.debit / 100, // Convert from cents
          credit_in_account_currency: line.credit / 100,
          user_remark: line.description,
        })),
        custom_platform_id: entry.id.toString(),
      };

      let response;
      let operation: "create" | "update";

      if (mapping) {
        response = await this.client.put(
          `/api/resource/Journal Entry/${mapping.erpnextId}`,
          erpnextData
        );
        operation = "update";
      } else {
        response = await this.client.post("/api/resource/Journal Entry", erpnextData);
        operation = "create";
      }

      const erpnextId = response.data.data.name;
      await this.saveMapping(userId, "journal", entry.id, erpnextId, "Journal Entry");

      const duration = Date.now() - startTime;
      await this.logSync(
        userId,
        "push",
        "journal",
        entry.id,
        erpnextId,
        "success",
        undefined,
        erpnextData,
        response.data,
        duration
      );

      return {
        success: true,
        platformId: entry.id,
        erpnextId,
        operation,
      };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));

      await this.logSync(
        userId,
        "push",
        "journal",
        entry.id,
        undefined,
        "error",
        errorMessage,
        undefined,
        ((error as Record<string, any>).response?.data),
        duration
      );

      return {
        success: false,
        platformId: entry.id,
        operation: "create",
        error: errorMessage,
      };
    }
  }

  /**
   * Pull entities from ERPNext
   * (Simplified - full implementation would handle creating platform entities)
   */
  async pullEntities(
    userId: number,
    doctype: string,
    entityType: string
  ): Promise<{ success: boolean; count: number; error?: string }> {
    if (!this.client) throw new Error("Client not initialized");

    try {
      const response = await this.client.get(
        `/api/resource/${doctype}?filters=[["custom_platform_id","!=",""]]`
      );

      const entities = response.data.data;
      logger.info(`Pulled ${entities.length} ${entityType} from ERPNext`);

      // Update platform entities based on ERPNext data
      let updatedCount = 0;
      for (const entity of entities) {
        try {
          const platformId = entity.custom_platform_id;
          if (!platformId) continue;

          // Update the local entity based on entity type
          // The platformId from ERPNext custom field maps directly to our entity ID
          await this.updateLocalEntity(entityType, platformId, entity);
          updatedCount++;
        } catch (entityError) {
          logger.error(`Error updating ${entityType} entity:`, entityError);
        }
      }

      logger.info(`Updated ${updatedCount} ${entityType} entities in platform`);

      return {
        success: true,
        count: updatedCount,
      };
    } catch (error: unknown) {
      const errorMessage = ((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error));
      return {
        success: false,
        count: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Update local entity from ERPNext data
   */
  private async updateLocalEntity(
    entityType: string,
    platformId: string,
    erpnextData: any
  ): Promise<void> {
    const { getDb } = await import('../../db.js');
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { users, farmers, produceListings, marketplaceOrders } = await import('../../../drizzle/schema.js');
    const { eq } = await import('drizzle-orm');

    const id = parseInt(platformId);

    switch (entityType) {
      case 'Customer':
        // Update user/farmer from ERPNext customer data
        await db.update(users)
          .set({
            firstName: erpnextData.customer_name?.split(' ')[0] || undefined,
            lastName: erpnextData.customer_name?.split(' ').slice(1).join(' ') || undefined,
            email: erpnextData.email_id || undefined,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));
        break;

      case 'Supplier':
        // Update farmer from ERPNext supplier data
        // Parse supplier name into first/last name
        const supplierNameParts = (erpnextData.supplier_name || '').split(' ');
        await db.update(farmers)
          .set({
            firstName: supplierNameParts[0] || undefined,
            lastName: supplierNameParts.slice(1).join(' ') || undefined,
            updatedAt: new Date(),
          })
          .where(eq(farmers.id, id));
        break;

      case 'Item':
        // Update produce listing from ERPNext item data
        await db.update(produceListings)
          .set({
            title: erpnextData.item_name || undefined,
            description: erpnextData.description || undefined,
            pricePerUnit: erpnextData.standard_rate ? parseFloat(erpnextData.standard_rate) : undefined,
            updatedAt: new Date(),
          })
          .where(eq(produceListings.id, id));
        break;

      case 'Sales Invoice':
      case 'Purchase Invoice':
        // Update order from ERPNext invoice data
        await db.update(marketplaceOrders)
          .set({
            totalAmount: erpnextData.grand_total ? parseFloat(erpnextData.grand_total) : undefined,
            status: erpnextData.status === 'Paid' ? 'completed' : 
                   erpnextData.status === 'Cancelled' ? 'cancelled' : undefined,
            updatedAt: new Date(),
          })
          .where(eq(marketplaceOrders.id, id));
        break;

      default:
        logger.info(`No update handler for entity type: ${entityType}`);
    }
  }

  /**
   * Pull customers from ERPNext to platform
   */
  async pullCustomers(): Promise<{ success: boolean; count: number; recordsProcessed?: number; errors?: string[] }> {
    return {
      success: false,
      count: 0,
      recordsProcessed: 0,
      errors: ["Pull customers not fully implemented"]
    };
  }

  /**
   * Pull suppliers from ERPNext to platform
   */
  async pullSuppliers(): Promise<{ success: boolean; count: number; recordsProcessed?: number; errors?: string[] }> {
    return {
      success: false,
      count: 0,
      recordsProcessed: 0,
      errors: ["Pull suppliers not fully implemented"]
    };
  }

  /**
   * Pull items from ERPNext to platform
   */
  async pullItems(): Promise<{ success: boolean; count: number; recordsProcessed?: number; errors?: string[] }> {
    return {
      success: false,
      count: 0,
      recordsProcessed: 0,
      errors: ["Pull items not fully implemented"]
    };
  }

  /**
   * Pull journal entries from ERPNext to platform
   */
  async pullJournalEntries(): Promise<{ success: boolean; count: number; recordsProcessed?: number; errors?: string[] }> {
    return {
      success: false,
      count: 0,
      recordsProcessed: 0,
      errors: ["Pull journal entries not fully implemented"]
    };
  }

  /**
   * Pull invoices from ERPNext to platform
   */
  async pullInvoices(): Promise<{ success: boolean; count: number; recordsProcessed?: number; errors?: string[] }> {
    return {
      success: false,
      count: 0,
      recordsProcessed: 0,
      errors: ["Pull invoices not fully implemented"]
    };
  }

  /**
   * Pull payments from ERPNext to platform
   */
  async pullPayments(): Promise<{ success: boolean; count: number; recordsProcessed?: number; errors?: string[] }> {
    return {
      success: false,
      count: 0,
      recordsProcessed: 0,
      errors: ["Pull payments not fully implemented"]
    };
  }
}
