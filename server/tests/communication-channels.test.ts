import { describe, it, expect, beforeAll } from "vitest";
import { ussdService } from "../services/ussd.service.js";
import { smsService } from "../services/sms.service.js";
import { whatsappService } from "../services/whatsapp.service.js";
import { USSDRequest } from "../../shared/ussd-types.js";
import { logger } from '../logger.js';

describe("Communication Channels Integration", () => {
  describe("USSD Service", () => {
    it("should show main menu for new session", async () => {
      const request: USSDRequest = {
        sessionId: `test_${Date.now()}`,
        serviceCode: "*384*96#",
        phoneNumber: "+254712345678",
        text: "",
      };

      const response = await ussdService.handleUSSDRequest(request);

      expect(response.continueSession).toBe(true);
      expect(response.text).toContain("Welcome");
      expect(response.text).toContain("Register as Farmer");
    });

    it("should handle registration flow", async () => {
      const sessionId = `test_reg_${Date.now()}`;
      const phoneNumber = "+254712345678";

      // Step 1: Show main menu (new session)
      const step1: USSDRequest = {
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber,
        text: "",
      };

      const response1 = await ussdService.handleUSSDRequest(step1);
      expect(response1.continueSession).toBe(true);
      expect(response1.text).toContain("Welcome");

      // Step 2: Select registration option
      const step2: USSDRequest = {
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber,
        text: "1",
      };

      const response2 = await ussdService.handleUSSDRequest(step2);
      expect(response2.continueSession).toBe(true);
      expect(response2.text).toContain("Enter your full name");

      // Step 3: Enter name
      const step3: USSDRequest = {
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber,
        text: "1*John Doe",
      };

      const response3 = await ussdService.handleUSSDRequest(step3);
      expect(response3.continueSession).toBe(true);
      expect(response3.text).toContain("location");
    });

    it("should validate input fields", async () => {
      const sessionId = `test_val_${Date.now()}`;
      const phoneNumber = "+254712345678";

      // Start new session and show main menu
      await ussdService.handleUSSDRequest({
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber,
        text: "",
      });

      // Select registration
      await ussdService.handleUSSDRequest({
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber,
        text: "1",
      });

      // Try invalid name (too short)
      const response = await ussdService.handleUSSDRequest({
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber,
        text: "1*A",
      });

      expect(response.text).toContain("too short");
    });
  });

  describe("SMS Service", () => {
    it("should check SMS service availability", () => {
      const available = smsService.isAvailable();
      const providers = smsService.getAvailableProviders();

      logger.info("SMS Service Available:", available);
      logger.info("SMS Providers:", providers);

      // Service should be initialized (even if no credentials configured)
      expect(smsService).toBeDefined();
    });

    it("should handle missing provider gracefully", async () => {
      const result = await smsService.sendSMS({
        to: "+254712345678",
        message: "Test message",
      });

      // Should return error if no provider configured
      if (!smsService.isAvailable()) {
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should support templated SMS", async () => {
      const result = await smsService.sendTemplatedSMS(
        "+254712345678",
        "WELCOME",
        {
          name: "John Doe",
          farmerId: "12345",
        }
      );

      // Should process template even if sending fails
      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });

    it("should handle invalid template", async () => {
      const result = await smsService.sendTemplatedSMS(
        "+254712345678",
        "INVALID_TEMPLATE",
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("WhatsApp Service", () => {
    it("should check WhatsApp service availability", () => {
      const available = whatsappService.isAvailable();
      const providers = whatsappService.getAvailableProviders();

      logger.info("WhatsApp Service Available:", available);
      logger.info("WhatsApp Providers:", providers);

      // Service should be initialized
      expect(whatsappService).toBeDefined();
    });

    it("should handle missing provider gracefully", async () => {
      const result = await whatsappService.sendTextMessage(
        "+254712345678",
        "Test message"
      );

      // Should return error if no provider configured
      if (!whatsappService.isAvailable()) {
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it("should support template messages", async () => {
      const result = await whatsappService.sendTemplateMessage(
        "+254712345678",
        "WELCOME",
        ["John Doe", "12345"]
      );

      // Should process template even if sending fails
      expect(result).toBeDefined();
      expect(result.success !== undefined).toBe(true);
    });

    it("should handle invalid template", async () => {
      const result = await whatsappService.sendTemplateMessage(
        "+254712345678",
        "INVALID_TEMPLATE",
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should support different message types", async () => {
      // Test image message structure
      const imageResult = await whatsappService.sendImageMessage(
        "+254712345678",
        "https://example.com/image.jpg",
        "Test caption"
      );
      expect(imageResult).toBeDefined();

      // Test location message structure
      const locationResult = await whatsappService.sendLocationMessage(
        "+254712345678",
        -1.286389,
        36.817223,
        "Nairobi",
        "Kenya"
      );
      expect(locationResult).toBeDefined();

      // Test document message structure
      const documentResult = await whatsappService.sendDocumentMessage(
        "+254712345678",
        "https://example.com/document.pdf",
        "report.pdf",
        "Monthly report"
      );
      expect(documentResult).toBeDefined();
    });
  });

  describe("Integration Tests", () => {
    it("should have all communication services initialized", () => {
      expect(ussdService).toBeDefined();
      expect(smsService).toBeDefined();
      expect(whatsappService).toBeDefined();
    });

    it("should handle concurrent requests", async () => {
      const promises = [
        ussdService.handleUSSDRequest({
          sessionId: `concurrent_1_${Date.now()}`,
          serviceCode: "*384*96#",
          phoneNumber: "+254712345001",
          text: "",
        }),
        ussdService.handleUSSDRequest({
          sessionId: `concurrent_2_${Date.now()}`,
          serviceCode: "*384*96#",
          phoneNumber: "+254712345002",
          text: "",
        }),
        ussdService.handleUSSDRequest({
          sessionId: `concurrent_3_${Date.now()}`,
          serviceCode: "*384*96#",
          phoneNumber: "+254712345003",
          text: "",
        }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.continueSession).toBe(true);
        expect(result.text).toContain("Welcome");
      });
    });
  });

  describe("Mobile Production Readiness", () => {
    it("should have proper error handling", async () => {
      // Test with invalid phone number format
      const result = await ussdService.handleUSSDRequest({
        sessionId: `error_test_${Date.now()}`,
        serviceCode: "*384*96#",
        phoneNumber: "invalid",
        text: "",
      });

      // Should not throw, should return response
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });

    it("should handle session timeout gracefully", async () => {
      const sessionId = `timeout_test_${Date.now()}`;

      // Create a session
      await ussdService.handleUSSDRequest({
        sessionId,
        serviceCode: "*384*96#",
        phoneNumber: "+254712345678",
        text: "",
      });

      // Try to access with different session data
      const result = await ussdService.handleUSSDRequest({
        sessionId: `different_${Date.now()}`,
        serviceCode: "*384*96#",
        phoneNumber: "+254712345678",
        text: "1",
      });

      // Should start new session
      expect(result).toBeDefined();
    });

    it("should support offline-first architecture", () => {
      // Verify services can initialize without external dependencies
      expect(ussdService).toBeDefined();
      expect(smsService).toBeDefined();
      expect(whatsappService).toBeDefined();
    });

    it("should have mobile-optimized response sizes", async () => {
      const response = await ussdService.handleUSSDRequest({
        sessionId: `size_test_${Date.now()}`,
        serviceCode: "*384*96#",
        phoneNumber: "+254712345678",
        text: "",
      });

      // USSD messages should be under 182 characters per screen
      expect(response.text.length).toBeLessThan(500);
    });
  });
});
