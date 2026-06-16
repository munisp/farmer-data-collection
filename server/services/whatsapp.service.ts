import axios from "axios";
import { WhatsAppMessage, WhatsAppResponse, WHATSAPP_TEMPLATES } from "../../shared/whatsapp-types.js";
import { logger } from '../logger.js';

// Provider types
export type WhatsAppProvider = "meta" | "twilio";

// Failover configuration
const FAILOVER_CONFIG = {
  enabled: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  providers: ["meta", "twilio"] as WhatsAppProvider[],
};

// Provider health tracking
interface ProviderHealth {
  provider: WhatsAppProvider;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  totalSent: number;
  totalFailed: number;
}

export class WhatsAppService {
  private twilioAccountSid?: string;
  private twilioAuthToken?: string;
  private twilioWhatsAppNumber?: string;
  private metaAccessToken?: string;
  private metaPhoneNumberId?: string;
  private defaultProvider: WhatsAppProvider = "meta";
  private providerHealth: Map<WhatsAppProvider, ProviderHealth> = new Map();

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
   * Initialize WhatsApp providers
   */
  private async initializeProviders() {
    // Initialize Twilio WhatsApp
    if (
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_NUMBER
    ) {
      this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
      this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      this.twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      logger.info("[WhatsApp] Twilio initialized");
      this.defaultProvider = "twilio";
    }

    // Initialize Meta (Facebook) WhatsApp Business API
    if (process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID) {
      this.metaAccessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
      this.metaPhoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
      logger.info("[WhatsApp] Meta Business API initialized");
      
      // Prefer Meta API if available
      if (this.metaAccessToken) {
        this.defaultProvider = "meta";
      }
    }

    if (!this.twilioAccountSid && !this.metaAccessToken) {
      logger.warn("[WhatsApp] No WhatsApp provider configured. WhatsApp functionality will be disabled.");
    }
  }

  /**
   * Send WhatsApp message using configured provider with automatic failover
   */
  async sendMessage(
    message: WhatsAppMessage,
    provider?: WhatsAppProvider
  ): Promise<WhatsAppResponse> {
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
   * Send WhatsApp message with automatic failover between providers
   */
  private async sendWithFailover(message: WhatsAppMessage): Promise<WhatsAppResponse> {
    const availableProviders = this.getHealthyProviders();

    if (availableProviders.length === 0) {
      // All providers unhealthy, try default anyway
      logger.warn("[WhatsApp] All providers unhealthy, attempting default provider");
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
        logger.warn(`[WhatsApp] Provider ${provider} failed: ${lastError}, trying next...`);

      } catch (error: unknown) {
        lastError = (error instanceof Error ? error.message : String(error));
        this.recordFailure(provider, lastError);
        logger.warn(`[WhatsApp] Provider ${provider} threw error: ${lastError}, trying next...`);
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
   * Send WhatsApp message with specific provider
   */
  private async sendWithProvider(message: WhatsAppMessage, provider: WhatsAppProvider): Promise<WhatsAppResponse> {
    try {
      if (provider === "twilio" && this.twilioAccountSid) {
        return await this.sendViaTwilio(message);
      } else if (provider === "meta" && this.metaAccessToken) {
        return await this.sendViaMeta(message);
      } else {
        return {
          success: false,
          error: `Provider ${provider} not available`,
        };
      }
    } catch (error: unknown) {
      logger.error(`[WhatsApp] Send error (${provider}):`, error);
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
  private getHealthyProviders(): WhatsAppProvider[] {
    const healthy: WhatsAppProvider[] = [];

    for (const provider of FAILOVER_CONFIG.providers) {
      const health = this.providerHealth.get(provider);
      if (!health) continue;

      // Check if provider is configured
      if (provider === "meta" && !this.metaAccessToken) continue;
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
          logger.info(`[WhatsApp] Provider ${provider} marked healthy after cooldown`);
        }
      }
    }

    return healthy;
  }

  /**
   * Record successful send
   */
  private recordSuccess(provider: WhatsAppProvider): void {
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
  private recordFailure(provider: WhatsAppProvider, error: string): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures++;
      health.lastFailureAt = Date.now();
      health.totalFailed++;

      // Mark unhealthy after 3 consecutive failures
      if (health.consecutiveFailures >= 3) {
        health.isHealthy = false;
        logger.warn(`[WhatsApp] Provider ${provider} marked unhealthy after ${health.consecutiveFailures} failures`);
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
   * Send WhatsApp message via Twilio
   */
  private async sendViaTwilio(message: WhatsAppMessage): Promise<WhatsAppResponse> {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`;

      let body: string;
      let mediaUrl: string | undefined;

      if (message.type === "text" && message.text) {
        body = message.text.body;
      } else if (message.type === "image" && message.image) {
        body = message.image.caption || "";
        mediaUrl = message.image.link;
      } else if (message.type === "document" && message.document) {
        body = message.document.caption || message.document.filename || "";
        mediaUrl = message.document.link;
      } else if (message.type === "location" && message.location) {
        body = `Location: ${message.location.name || "Shared location"}\n${message.location.address || ""}\nhttps://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`;
      } else {
        throw new Error("Unsupported message type for Twilio");
      }

      const params: Record<string, any> = {
        To: `whatsapp:${message.to}`,
        From: `whatsapp:${this.twilioWhatsAppNumber}`,
        Body: body,
      };

      if (mediaUrl) {
        params.MediaUrl = mediaUrl;
      }

      const response = await axios.post(url, new URLSearchParams(params), {
        auth: {
          username: this.twilioAccountSid!,
          password: this.twilioAuthToken!,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      return {
        success: true,
        messageId: response.data.sid,
        provider: "twilio",
      };
    } catch (error: unknown) {
      throw new Error(`Twilio WhatsApp error: ${((error as Record<string, any>).response?.data)?.message || (error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * Send WhatsApp message via Meta Business API
   */
  private async sendViaMeta(message: WhatsAppMessage): Promise<WhatsAppResponse> {
    try {
      const url = `https://graph.facebook.com/v18.0/${this.metaPhoneNumberId}/messages`;

      const payload: Record<string, any> = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: message.to,
        type: message.type,
      };

      if (message.type === "text" && message.text) {
        payload.text = message.text;
      } else if (message.type === "template" && message.template) {
        payload.template = message.template;
      } else if (message.type === "image" && message.image) {
        payload.image = message.image;
      } else if (message.type === "document" && message.document) {
        payload.document = message.document;
      } else if (message.type === "location" && message.location) {
        payload.location = message.location;
      }

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.metaAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        messageId: response.data.messages[0].id,
        provider: "meta",
      };
    } catch (error: unknown) {
      throw new Error(
        `Meta WhatsApp error: ${((error as Record<string, any>).response?.data)?.error?.message || (error instanceof Error ? error.message : String(error))}`
      );
    }
  }

  /**
   * Send text message
   */
  async sendTextMessage(
    to: string,
    text: string,
    provider?: "twilio" | "meta"
  ): Promise<WhatsAppResponse> {
    return await this.sendMessage(
      {
        to,
        type: "text",
        text: {
          body: text,
        },
      },
      provider
    );
  }

  /**
   * Send template message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    parameters: string[],
    provider?: "twilio" | "meta"
  ): Promise<WhatsAppResponse> {
    const template = WHATSAPP_TEMPLATES[templateName.toUpperCase() as keyof typeof WHATSAPP_TEMPLATES];

    if (!template) {
      return {
        success: false,
        error: `Template ${templateName} not found`,
      };
    }

    // For Meta API, use template format
    if ((provider || this.defaultProvider) === "meta") {
      const components = template.components.map((comp, index) => {
        if (comp.type === "BODY") {
          return {
            type: "body",
            parameters: parameters.map((param) => ({
              type: "text",
              text: param,
            })),
          };
        }
        return comp;
      });

      return await this.sendMessage(
        {
          to,
          type: "template",
          template: {
            name: template.name,
            language: {
              code: template.language,
            },
            components,
          },
        },
        provider
      );
    }

    // For Twilio, construct text message from template
    let text = template.components.find((c) => c.type === "BODY")?.text || "";
    parameters.forEach((param, index) => {
      text = text.replace(`{{${index + 1}}}`, param);
    });

    return await this.sendTextMessage(to, text, provider);
  }

  /**
   * Send image message
   */
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string,
    provider?: "twilio" | "meta"
  ): Promise<WhatsAppResponse> {
    return await this.sendMessage(
      {
        to,
        type: "image",
        image: {
          link: imageUrl,
          caption,
        },
      },
      provider
    );
  }

  /**
   * Send document message
   */
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string,
    provider?: "twilio" | "meta"
  ): Promise<WhatsAppResponse> {
    return await this.sendMessage(
      {
        to,
        type: "document",
        document: {
          link: documentUrl,
          filename,
          caption,
        },
      },
      provider
    );
  }

  /**
   * Send location message
   */
  async sendLocationMessage(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string,
    provider?: "twilio" | "meta"
  ): Promise<WhatsAppResponse> {
    return await this.sendMessage(
      {
        to,
        type: "location",
        location: {
          latitude,
          longitude,
          name,
          address,
        },
      },
      provider
    );
  }

  /**
   * Check if WhatsApp service is available
   */
  isAvailable(): boolean {
    return !!(this.twilioAccountSid || this.metaAccessToken);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.twilioAccountSid) providers.push("twilio");
    if (this.metaAccessToken) providers.push("meta");
    return providers;
  }
}

export const whatsappService = new WhatsAppService();
