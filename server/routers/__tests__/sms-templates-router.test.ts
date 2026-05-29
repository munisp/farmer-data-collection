import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "../../trpc";
import { createContext } from "../../_core/trpc-base";
import type { Context } from "../../_core/trpc-base";
import { users } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { smsTemplates, smsScheduledMessages } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

// Skip all tests if database is unavailable
const _dbCheck = await import("../db.js").then(m => m.getDb()).catch(() => null);
if (!_dbCheck) { describe.skip("DB unavailable", () => { it("skip", () => {}) }); }

describe("SMS Templates Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let ctx: Context;
  let testUserId: number;
  let testTemplateId: number;

  beforeAll(async () => {
    const db = await getDb();
    
    // Create a test user
    const [user] = await db!.insert(users).values({
      email: `sms-test-${Date.now()}@example.com`,
      password: 'hashed_password',
      firstName: 'Test',
      lastName: 'User',
      role: 'admin',
    }).returning();
    testUserId = user.id;
    
    // Create a test context with user already authenticated
    ctx = {
      token: null,
      keycloakUser: null,
      user: user,
    } as any;
    caller = appRouter.createCaller(ctx);
  });

  describe("Template Management", () => {
    it("should create a new SMS template", async () => {
      const result = await caller.smsTemplates.create({
        name: "Test Payment Reminder",
        type: "payment_reminder",
        subject: "Payment Due",
        body: "Dear {{borrowerName}}, your payment of {{amount}} is due on {{dueDate}}. Please pay on time to avoid penalties.",
        variables: ["borrowerName", "amount", "dueDate"],
        description: "Test template for payment reminders",
        isActive: true,
        isDefault: false,
      });

      expect(result.success).toBe(true);
      expect(result.template).toBeDefined();
      expect(result.template?.name).toBe("Test Payment Reminder");
      expect(result.template?.type).toBe("payment_reminder");
      
      testTemplateId = result.template!.id;
    });

    it("should list all templates", async () => {
      const templates = await caller.smsTemplates.list();
      
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      
      const testTemplate = templates.find((t: any) => t.id === testTemplateId);
      expect(testTemplate).toBeDefined();
      expect(testTemplate?.name).toBe("Test Payment Reminder");
    });

    it("should list templates by type", async () => {
      const templates = await caller.smsTemplates.list({ type: "payment_reminder" });
      
      expect(Array.isArray(templates)).toBe(true);
      templates.forEach((t: any) => {
        expect(t.type).toBe("payment_reminder");
      });
    });

    it("should list only active templates", async () => {
      const templates = await caller.smsTemplates.list({ isActive: true });
      
      expect(Array.isArray(templates)).toBe(true);
      templates.forEach((t: any) => {
        expect(t.isActive).toBe(true);
      });
    });

    it("should get template by ID", async () => {
      const template = await caller.smsTemplates.getById({ id: testTemplateId });
      
      expect(template).toBeDefined();
      expect(template.id).toBe(testTemplateId);
      expect(template.name).toBe("Test Payment Reminder");
    });

    it("should get template types", async () => {
      const types = await caller.smsTemplates.getTemplateTypes();
      
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types[0]).toHaveProperty("value");
      expect(types[0]).toHaveProperty("label");
    });

    it("should update a template", async () => {
      const result = await caller.smsTemplates.update({
        id: testTemplateId,
        name: "Updated Payment Reminder",
        description: "Updated description",
      });

      expect(result.success).toBe(true);

      const updated = await caller.smsTemplates.getById({ id: testTemplateId });
      expect(updated.name).toBe("Updated Payment Reminder");
      expect(updated.description).toBe("Updated description");
    });

    it("should set a template as default", async () => {
      const result = await caller.smsTemplates.setDefault({
        id: testTemplateId,
        type: "payment_reminder",
      });

      expect(result.success).toBe(true);

      const template = await caller.smsTemplates.getById({ id: testTemplateId });
      expect(template.isDefault).toBe(true);
    });

    it("should preview a template with variables", async () => {
      const preview = await caller.smsTemplates.preview({
        templateId: testTemplateId,
        variables: {
          borrowerName: "John Doe",
          amount: "₦50,000",
          dueDate: "Dec 31, 2025",
        },
      });

      expect(preview).toBeDefined();
      expect(preview.message).toContain("John Doe");
      expect(preview.message).toContain("₦50,000");
      expect(preview.message).toContain("Dec 31, 2025");
      expect(preview.length).toBeGreaterThan(0);
      expect(preview.segments).toBeGreaterThan(0);
    });
  });

  describe("Message Scheduling", () => {
    let scheduledMessageId: number;

    it("should schedule a message", async () => {
      const scheduledFor = new Date();
      scheduledFor.setHours(scheduledFor.getHours() + 1);

      const result = await caller.smsTemplates.scheduleMessage({
        templateId: testTemplateId,
        recipientPhone: "+2348012345678",
        recipientName: "Test User",
        message: "This is a test scheduled message",
        scheduledFor: scheduledFor.toISOString(),
        metadata: { testKey: "testValue" },
      });

      expect(result.success).toBe(true);
      expect(result.scheduledMessage).toBeDefined();
      expect(result.scheduledMessage?.status).toBe("pending");
      
      scheduledMessageId = result.scheduledMessage!.id;
    });

    it("should list scheduled messages", async () => {
      const messages = await caller.smsTemplates.listScheduled();
      
      expect(Array.isArray(messages)).toBe(true);
      expect(messages.length).toBeGreaterThan(0);
      
      const testMessage = messages.find((m: any) => m.id === scheduledMessageId);
      expect(testMessage).toBeDefined();
    });

    it("should list scheduled messages by status", async () => {
      const messages = await caller.smsTemplates.listScheduled({ status: "pending" });
      
      expect(Array.isArray(messages)).toBe(true);
      messages.forEach((m: any) => {
        expect(m.status).toBe("pending");
      });
    });

    it("should cancel a scheduled message", async () => {
      const result = await caller.smsTemplates.cancelScheduled({ id: scheduledMessageId });
      
      expect(result.success).toBe(true);

      const messages = await caller.smsTemplates.listScheduled({ status: "cancelled" });
      const cancelled = messages.find((m: any) => m.id === scheduledMessageId);
      expect(cancelled).toBeDefined();
      expect(cancelled?.status).toBe("cancelled");
    });
  });

  describe("Template Deletion", () => {
    it("should delete a template", async () => {
      const result = await caller.smsTemplates.delete({ id: testTemplateId });
      
      expect(result.success).toBe(true);

      // Verify template is deleted
      try {
        await caller.smsTemplates.getById({ id: testTemplateId });
        expect.fail("Should have thrown error for deleted template");
      } catch (error: any) {
        expect(error.message).toContain("not found");
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    const db = await getDb();
    if (db && testTemplateId) {
      try {
        await db.delete(smsTemplates).where(eq(smsTemplates.id, testTemplateId));
      } catch (error) {
        // Template might already be deleted
      }
    }
  });
});
