import { SMSMessage, SMSResponse, SMS_TEMPLATES } from "../../shared/sms-types.js";

// Africa's Talking SDK - will be dynamically imported
let AfricasTalking: any = null;

// Twilio SDK (using axios for REST API)
import axios from "axios";
import { logger } from '../logger.js';

// Provider types
export type SMSProvider = "africas_talking" | "twilio";

// Failover configuration
const FAILOVER_CONFIG = {
  enabled: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  providers: ["africas_talking", "twilio"] as SMSProvider[],
};

// Provider health tracking
interface ProviderHealth {
  provider: SMSProvider;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  totalSent: number;
  totalFailed: number;
}

export class SMSService {
  private africasTalkingClient: any;
  private twilioAccountSid?: string;
  private twilioAuthToken?: string;
  private twilioPhoneNumber?: string;
  private defaultProvider: SMSProvider = "africas_talking";
  private providerHealth: Map<SMSProvider, ProviderHealth> = new Map();

  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initializeProviders();
    this.initializeHealthTracking();
  }

  private initializeHealthTracking(): void {
    for (const provider of FAILOVER_CONFIG.providers) {
      this.providerHealth.set(provider, {
        provider,
        isHealthy: true,
        consecutiveFailures: 0,
        totalSent: 0,
        totalFailed: 0,
      });
    }
  }

  private async ensureInitialized() {
    await this.initPromise;
  }

  /**
   * Initialize SMS providers
   */
  private async initializeProviders() {
    // Initialize Africa's Talking
    if (process.env.AFRICAS_TALKING_API_KEY && process.env.AFRICAS_TALKING_USERNAME) {
      try {
        const module = await import("africastalking");
        AfricasTalking = module.default;
      } catch (error) {
        logger.warn("[SMS] Africa's Talking SDK not available");
      }
    }
    
    if (AfricasTalking && process.env.AFRICAS_TALKING_API_KEY && process.env.AFRICAS_TALKING_USERNAME) {
      try {
        this.africasTalkingClient = AfricasTalking({
          apiKey: process.env.AFRICAS_TALKING_API_KEY,
          username: process.env.AFRICAS_TALKING_USERNAME,
        });
        logger.info("[SMS] Africa's Talking initialized");
        this.defaultProvider = "africas_talking";
      } catch (error) {
        logger.warn("[SMS] Failed to initialize Africa's Talking:", error);
      }
    }

    // Initialize Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
      logger.info("[SMS] Twilio initialized");
      
      // Use Twilio as default if Africa's Talking not available
      if (!this.africasTalkingClient) {
        this.defaultProvider = "twilio";
      }
    }

    if (!this.africasTalkingClient && !this.twilioAccountSid) {
      logger.warn("[SMS] No SMS provider configured. SMS functionality will be disabled.");
    }
  }

  /**
   * Send SMS using configured provider with automatic failover
   */
  async sendSMS(message: SMSMessage, provider?: SMSProvider): Promise<SMSResponse> {
    await this.ensureInitialized();

    // If specific provider requested, try only that provider
    if (provider) {
      return this.sendWithProvider(message, provider);
    }

    // Use failover logic
    if (FAILOVER_CONFIG.enabled) {
      return this.sendWithFailover(message);
    }

    return this.sendWithProvider(message, this.defaultProvider);
  }

  /**
   * Send SMS with automatic failover between providers
   */
  private async sendWithFailover(message: SMSMessage): Promise<SMSResponse> {
    const availableProviders = this.getHealthyProviders();

    if (availableProviders.length === 0) {
      // All providers unhealthy, try default anyway
      logger.warn("[SMS] All providers unhealthy, attempting default provider");
      return this.sendWithProvider(message, this.defaultProvider);
    }

    let lastError: string = "No providers available";

    for (const provider of availableProviders) {
      try {
        const result = await this.sendWithProvider(message, provider);
        
        if (result.success) {
          this.recordSuccess(provider);
          return result;
        }

        // Provider returned failure, try next
        lastError = result.error || "Unknown error";
        this.recordFailure(provider, lastError);
        logger.warn(`[SMS] Provider ${provider} failed: ${lastError}, trying next...`);

      } catch (error: unknown) {
        lastError = (error instanceof Error ? error.message : String(error));
        this.recordFailure(provider, lastError);
        logger.warn(`[SMS] Provider ${provider} threw error: ${lastError}, trying next...`);
      }

      // Small delay before trying next provider
      await new Promise(resolve => setTimeout(resolve, FAILOVER_CONFIG.retryDelayMs));
    }

    return {
      success: false,
      error: `All providers failed. Last error: ${lastError}`,
    };
  }

  /**
   * Send SMS with specific provider
   */
  private async sendWithProvider(message: SMSMessage, provider: SMSProvider): Promise<SMSResponse> {
    try {
      if (provider === "africas_talking" && this.africasTalkingClient) {
        return await this.sendViaAfricasTalking(message);
      } else if (provider === "twilio" && this.twilioAccountSid) {
        return await this.sendViaTwilio(message);
      } else {
        return {
          success: false,
          error: `Provider ${provider} not available`,
        };
      }
    } catch (error: unknown) {
      logger.error(`[SMS] Send error (${provider}):`, error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)),
        provider,
      };
    }
  }

  /**
   * Get list of healthy providers in priority order
   */
  private getHealthyProviders(): SMSProvider[] {
    const healthy: SMSProvider[] = [];

    for (const provider of FAILOVER_CONFIG.providers) {
      const health = this.providerHealth.get(provider);
      if (!health) continue;

      // Check if provider is configured
      if (provider === "africas_talking" && !this.africasTalkingClient) continue;
      if (provider === "twilio" && !this.twilioAccountSid) continue;

      // Check if provider is healthy or has recovered
      if (health.isHealthy) {
        healthy.push(provider);
      } else if (health.lastFailureAt) {
        // Check if enough time has passed to retry (30 seconds)
        const timeSinceFailure = Date.now() - health.lastFailureAt;
        if (timeSinceFailure > 30000) {
          health.isHealthy = true;
          health.consecutiveFailures = 0;
          healthy.push(provider);
          logger.info(`[SMS] Provider ${provider} marked healthy after cooldown`);
        }
      }
    }

    return healthy;
  }

  /**
   * Record successful send
   */
  private recordSuccess(provider: SMSProvider): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.isHealthy = true;
      health.consecutiveFailures = 0;
      health.lastSuccessAt = Date.now();
      health.totalSent++;
    }
  }

  /**
   * Record failed send
   */
  private recordFailure(provider: SMSProvider, error: string): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures++;
      health.lastFailureAt = Date.now();
      health.totalFailed++;

      // Mark unhealthy after 3 consecutive failures
      if (health.consecutiveFailures >= 3) {
        health.isHealthy = false;
        logger.warn(`[SMS] Provider ${provider} marked unhealthy after ${health.consecutiveFailures} failures`);
      }
    }
  }

  /**
   * Get provider health status
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * Send SMS via Africa's Talking
   */
  private async sendViaAfricasTalking(message: SMSMessage): Promise<SMSResponse> {
    try {
      const sms = this.africasTalkingClient.SMS;
      const result = await sms.send({
        to: [message.to],
        message: message.message,
        from: message.from,
      });

      if (result.SMSMessageData.Recipients.length > 0) {
        const recipient = result.SMSMessageData.Recipients[0];
        
        if (recipient.status === "Success") {
          return {
            success: true,
            messageId: recipient.messageId,
            provider: "africas_talking",
          };
        } else {
          return {
            success: false,
            error: recipient.status,
            provider: "africas_talking",
          };
        }
      }

      return {
        success: false,
        error: "No recipients processed",
        provider: "africas_talking",
      };
    } catch (error: unknown) {
      throw new Error(`Africa's Talking error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Send SMS via Twilio
   */
  private async sendViaTwilio(message: SMSMessage): Promise<SMSResponse> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`;
      
      const response = await axios.post(
        url,
        new URLSearchParams({
          To: message.to,
          From: message.from || this.twilioPhoneNumber!,
          Body: message.message,
        }),
        {
          auth: {
            username: this.twilioAccountSid!,
            password: this.twilioAuthToken!,
          },
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      return {
        success: true,
        messageId: response.data.sid,
        provider: "twilio",
      };
    } catch (error: unknown) {
      throw new Error(`Twilio error: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Send SMS using template
   */
  async sendTemplatedSMS(
    to: string,
    templateId: string,
    variables: Record<string, string>,
    provider?: "africas_talking" | "twilio"
  ): Promise<SMSResponse> {
    await this.ensureInitialized();
    const template = SMS_TEMPLATES[templateId.toUpperCase()];
    
    if (!template) {
      return {
        success: false,
        error: `Template ${templateId} not found`,
      };
    }

    // Replace variables in template
    let message = template.content;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`{{${key}}}`, "g"), value);
    }

    return await this.sendSMS({ to, message }, provider);
  }

  /**
   * Send bulk SMS
   */
  async sendBulkSMS(
    messages: SMSMessage[],
    provider?: "africas_talking" | "twilio"
  ): Promise<SMSResponse[]> {
    await this.ensureInitialized();
    const results: SMSResponse[] = [];

    for (const message of messages) {
      const result = await this.sendSMS(message, provider);
      results.push(result);
      
      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Check if SMS service is available
   */
  isAvailable(): boolean {
    return !!(this.africasTalkingClient || this.twilioAccountSid);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.africasTalkingClient) providers.push("africas_talking");
    if (this.twilioAccountSid) providers.push("twilio");
    return providers;
  }
}

export const smsService = new SMSService();
