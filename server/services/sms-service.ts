import AfricasTalking from "africastalking";

/**
 * SMS Service using Africa's Talking API
 * 
 * Provides SMS sending functionality for payment reminders, notifications, and alerts
 * Supports both sandbox and production environments
 */

export interface SMSConfig {
  apiKey: string;
  username: string;
  senderId?: string;
  sandbox?: boolean;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  cost?: string;
  status?: string;
  error?: string;
}

export interface BulkSMSResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    phoneNumber: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export class SMSService {
  private client: any;
  private config: SMSConfig;
  private enabled: boolean;

  constructor(config?: Partial<SMSConfig>) {
    // Load configuration from environment variables or provided config
    this.config = {
      apiKey: config?.apiKey || process.env.AFRICAS_TALKING_API_KEY || "",
      username: config?.username || process.env.AFRICAS_TALKING_USERNAME || "",
      senderId: config?.senderId || process.env.AFRICAS_TALKING_SENDER_ID,
      sandbox: config?.sandbox ?? (process.env.AFRICAS_TALKING_SANDBOX === "true"),
    };

    // Check if service is properly configured
    this.enabled = !!(this.config.apiKey && this.config.username);

    if (this.enabled) {
      try {
        this.client = AfricasTalking({
          apiKey: this.config.apiKey,
          username: this.config.username,
        });
        console.log(
          `[SMS Service] Initialized (${this.config.sandbox ? "Sandbox" : "Production"} mode)`
        );
      } catch (error) {
        console.error("[SMS Service] Failed to initialize Africa's Talking client:", error);
        this.enabled = false;
      }
    } else {
      console.warn(
        "[SMS Service] Not configured. Set AFRICAS_TALKING_API_KEY and AFRICAS_TALKING_USERNAME environment variables."
      );
    }
  }

  /**
   * Check if SMS service is enabled and configured
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send SMS to a single recipient
   */
  async sendSMS(phoneNumber: string, message: string): Promise<SMSResult> {
    if (!this.enabled) {
      console.log(`[SMS Service] Disabled - Would send to ${phoneNumber}: ${message}`);
      return {
        success: false,
        error: "SMS service not configured",
      };
    }

    try {
      // Normalize phone number (ensure it starts with +234 for Nigeria)
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

      const options: any = {
        to: [normalizedPhone],
        message: message,
      };

      // Add sender ID if configured
      if (this.config.senderId) {
        options.from = this.config.senderId;
      }

      const response = await this.client.SMS.send(options);

      // Parse Africa's Talking response
      if (response.SMSMessageData && response.SMSMessageData.Recipients) {
        const recipient = response.SMSMessageData.Recipients[0];

        if (recipient.status === "Success" || recipient.statusCode === 101) {
          return {
            success: true,
            messageId: recipient.messageId,
            cost: recipient.cost,
            status: recipient.status,
          };
        } else {
          return {
            success: false,
            error: recipient.status || "Unknown error",
          };
        }
      }

      return {
        success: false,
        error: "Invalid response from SMS gateway",
      };
    } catch (error: any) {
      console.error(`[SMS Service] Failed to send SMS to ${phoneNumber}:`, error);
      return {
        success: false,
        error: error.message || "Failed to send SMS",
      };
    }
  }

  /**
   * Send SMS to multiple recipients
   */
  async sendBulkSMS(
    recipients: Array<{ phoneNumber: string; message: string }>
  ): Promise<BulkSMSResult> {
    const results: BulkSMSResult = {
      total: recipients.length,
      successful: 0,
      failed: 0,
      results: [],
    };

    for (const recipient of recipients) {
      const result = await this.sendSMS(recipient.phoneNumber, recipient.message);

      results.results.push({
        phoneNumber: recipient.phoneNumber,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });

      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Send same message to multiple phone numbers
   */
  async broadcast(phoneNumbers: string[], message: string): Promise<BulkSMSResult> {
    if (!this.enabled) {
      console.log(`[SMS Service] Disabled - Would broadcast to ${phoneNumbers.length} recipients`);
      return {
        total: phoneNumbers.length,
        successful: 0,
        failed: phoneNumbers.length,
        results: phoneNumbers.map((phone) => ({
          phoneNumber: phone,
          success: false,
          error: "SMS service not configured",
        })),
      };
    }

    try {
      // Normalize all phone numbers
      const normalizedPhones = phoneNumbers.map((phone) => this.normalizePhoneNumber(phone));

      const options: any = {
        to: normalizedPhones,
        message: message,
      };

      // Add sender ID if configured
      if (this.config.senderId) {
        options.from = this.config.senderId;
      }

      const response = await this.client.SMS.send(options);

      const results: BulkSMSResult = {
        total: phoneNumbers.length,
        successful: 0,
        failed: 0,
        results: [],
      };

      if (response.SMSMessageData && response.SMSMessageData.Recipients) {
        for (const recipient of response.SMSMessageData.Recipients) {
          const success = recipient.status === "Success" || recipient.statusCode === 101;

          results.results.push({
            phoneNumber: recipient.number,
            success,
            messageId: recipient.messageId,
            error: success ? undefined : recipient.status,
          });

          if (success) {
            results.successful++;
          } else {
            results.failed++;
          }
        }
      }

      return results;
    } catch (error: any) {
      console.error(`[SMS Service] Failed to broadcast SMS:`, error);
      return {
        total: phoneNumbers.length,
        successful: 0,
        failed: phoneNumbers.length,
        results: phoneNumbers.map((phone) => ({
          phoneNumber: phone,
          success: false,
          error: error.message || "Failed to send SMS",
        })),
      };
    }
  }

  /**
   * Normalize phone number to E.164 format
   * Assumes Nigerian phone numbers (+234)
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, "");

    // Handle different formats
    if (cleaned.startsWith("234")) {
      // Already has country code
      return `+${cleaned}`;
    } else if (cleaned.startsWith("0")) {
      // Remove leading 0 and add country code
      return `+234${cleaned.substring(1)}`;
    } else if (cleaned.length === 10) {
      // 10-digit number without leading 0
      return `+234${cleaned}`;
    } else {
      // Return as-is with + prefix
      return `+${cleaned}`;
    }
  }

  /**
   * Get account balance (useful for monitoring)
   */
  async getBalance(): Promise<{ balance: string; currency: string } | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.APPLICATION.fetchApplicationData();
      return {
        balance: response.UserData.balance,
        currency: "KES", // Africa's Talking uses KES for billing
      };
    } catch (error) {
      console.error("[SMS Service] Failed to fetch balance:", error);
      return null;
    }
  }
}

// Export singleton instance
export const smsService = new SMSService();
