/**
 * WhatsApp Business API Integration Service
 * Provides rich messaging capabilities for farmer engagement
 */

import axios, { AxiosInstance } from 'axios';

interface WhatsAppConfig {
  apiUrl: string;
  phoneNumberId: string;
  accessToken: string;
  webhookVerifyToken: string;
  businessAccountId?: string;
}

interface MessageTemplate {
  name: string;
  language: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters: Array<{
      type: 'text' | 'currency' | 'date_time' | 'image' | 'document';
      text?: string;
      currency?: { fallback_value: string; code: string; amount_1000: number };
      date_time?: { fallback_value: string };
      image?: { link: string };
      document?: { link: string; filename: string };
    }>;
  }>;
}

interface InteractiveMessage {
  type: 'button' | 'list' | 'product' | 'product_list';
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    image?: { link: string };
  };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons?: Array<{
      type: 'reply';
      reply: { id: string; title: string };
    }>;
    button?: string;
    sections?: Array<{
      title: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>;
  };
}

interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive' | 'button';
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; mime_type: string; sha256: string; filename: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
}

export class WhatsAppService {
  private client: AxiosInstance;
  private config: WhatsAppConfig;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.apiUrl || 'https://graph.facebook.com/v18.0',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Send text message
  async sendTextMessage(to: string, text: string): Promise<{ messageId: string }> {
    const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'text',
      text: { body: text },
    });

    return { messageId: response.data.messages[0].id };
  }

  // Send template message
  async sendTemplateMessage(
    to: string,
    template: MessageTemplate
  ): Promise<{ messageId: string }> {
    const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.components,
      },
    });

    return { messageId: response.data.messages[0].id };
  }

  // Send interactive message (buttons or list)
  async sendInteractiveMessage(
    to: string,
    interactive: InteractiveMessage
  ): Promise<{ messageId: string }> {
    const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'interactive',
      interactive,
    });

    return { messageId: response.data.messages[0].id };
  }

  // Send image message
  async sendImageMessage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<{ messageId: string }> {
    const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'image',
      image: {
        link: imageUrl,
        caption,
      },
    });

    return { messageId: response.data.messages[0].id };
  }

  // Send document message
  async sendDocumentMessage(
    to: string,
    documentUrl: string,
    filename: string,
    caption?: string
  ): Promise<{ messageId: string }> {
    const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        caption,
      },
    });

    return { messageId: response.data.messages[0].id };
  }

  // Send location message
  async sendLocationMessage(
    to: string,
    location: { latitude: number; longitude: number; name?: string; address?: string }
  ): Promise<{ messageId: string }> {
    const response = await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhoneNumber(to),
      type: 'location',
      location,
    });

    return { messageId: response.data.messages[0].id };
  }

  // Mark message as read
  async markAsRead(messageId: string): Promise<void> {
    await this.client.post(`/${this.config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  // Download media
  async downloadMedia(mediaId: string): Promise<{ url: string; mimeType: string }> {
    const response = await this.client.get(`/${mediaId}`);
    return {
      url: response.data.url,
      mimeType: response.data.mime_type,
    };
  }

  // Verify webhook
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === this.config.webhookVerifyToken) {
      return challenge;
    }
    return null;
  }

  // Parse webhook payload
  parseWebhookPayload(payload: any): WebhookMessage[] {
    const messages: WebhookMessage[] = [];

    if (payload.entry) {
      for (const entry of payload.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value?.messages) {
              messages.push(...change.value.messages);
            }
          }
        }
      }
    }

    return messages;
  }

  // Format phone number to international format
  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    
    // Handle Kenyan numbers
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.substring(1);
    } else if (!cleaned.startsWith('254') && cleaned.length === 9) {
      cleaned = '254' + cleaned;
    }

    return cleaned;
  }

  // === Pre-built message templates for AgriFinance ===

  // Send loan application status update
  async sendLoanStatusUpdate(
    to: string,
    status: 'approved' | 'rejected' | 'disbursed' | 'pending',
    details: { amount?: number; reference?: string; reason?: string }
  ): Promise<{ messageId: string }> {
    const statusMessages: Record<string, string> = {
      approved: `🎉 Great news! Your loan application (Ref: ${details.reference}) has been approved for KES ${details.amount?.toLocaleString()}. Funds will be disbursed within 24 hours.`,
      rejected: `We regret to inform you that your loan application (Ref: ${details.reference}) was not approved. Reason: ${details.reason}. Please contact support for more information.`,
      disbursed: `💰 Your loan of KES ${details.amount?.toLocaleString()} (Ref: ${details.reference}) has been disbursed to your M-Pesa account. Please check your balance.`,
      pending: `Your loan application (Ref: ${details.reference}) is being reviewed. We'll notify you once a decision is made.`,
    };

    return this.sendTextMessage(to, statusMessages[status]);
  }

  // Send payment reminder with quick reply buttons
  async sendPaymentReminder(
    to: string,
    details: { amount: number; dueDate: string; loanReference: string }
  ): Promise<{ messageId: string }> {
    return this.sendInteractiveMessage(to, {
      type: 'button',
      body: {
        text: `📅 Payment Reminder\n\nYour loan payment of KES ${details.amount.toLocaleString()} is due on ${details.dueDate}.\n\nLoan Reference: ${details.loanReference}`,
      },
      footer: { text: 'AgriFinance' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'pay_now', title: '💳 Pay Now' } },
          { type: 'reply', reply: { id: 'payment_plan', title: '📋 Payment Plan' } },
          { type: 'reply', reply: { id: 'contact_support', title: '📞 Contact Us' } },
        ],
      },
    });
  }

  // Send market prices with list selection
  async sendMarketPrices(
    to: string,
    prices: Array<{ commodity: string; price: number; unit: string; market: string }>
  ): Promise<{ messageId: string }> {
    const priceText = prices
      .map(p => `• ${p.commodity}: KES ${p.price.toLocaleString()}/${p.unit} (${p.market})`)
      .join('\n');

    return this.sendInteractiveMessage(to, {
      type: 'list',
      header: { type: 'text', text: '📊 Today\'s Market Prices' },
      body: { text: priceText },
      footer: { text: 'Updated: ' + new Date().toLocaleDateString() },
      action: {
        button: 'View Details',
        sections: [
          {
            title: 'Commodities',
            rows: prices.map(p => ({
              id: `price_${p.commodity.toLowerCase()}`,
              title: p.commodity,
              description: `KES ${p.price.toLocaleString()}/${p.unit}`,
            })),
          },
        ],
      },
    });
  }

  // Send weather alert
  async sendWeatherAlert(
    to: string,
    alert: { type: string; severity: string; message: string; region: string }
  ): Promise<{ messageId: string }> {
    const severityEmoji: Record<string, string> = {
      low: '🟡',
      medium: '🟠',
      high: '🔴',
    };

    return this.sendTextMessage(
      to,
      `${severityEmoji[alert.severity] || '⚠️'} Weather Alert for ${alert.region}\n\n` +
      `Type: ${alert.type}\n` +
      `Severity: ${alert.severity.toUpperCase()}\n\n` +
      `${alert.message}\n\n` +
      `Stay safe and take necessary precautions.`
    );
  }

  // Send harvest recording confirmation with image
  async sendHarvestConfirmation(
    to: string,
    harvest: { crop: string; quantity: number; unit: string; farmName: string; imageUrl?: string }
  ): Promise<{ messageId: string }> {
    const message = `✅ Harvest Recorded Successfully!\n\n` +
      `🌾 Crop: ${harvest.crop}\n` +
      `📦 Quantity: ${harvest.quantity} ${harvest.unit}\n` +
      `🏡 Farm: ${harvest.farmName}\n` +
      `📅 Date: ${new Date().toLocaleDateString()}`;

    if (harvest.imageUrl) {
      return this.sendImageMessage(to, harvest.imageUrl, message);
    }

    return this.sendTextMessage(to, message);
  }

  // Send cooperative meeting notification
  async sendMeetingNotification(
    to: string,
    meeting: { title: string; date: string; time: string; location: string; agenda: string }
  ): Promise<{ messageId: string }> {
    return this.sendInteractiveMessage(to, {
      type: 'button',
      header: { type: 'text', text: '📢 Meeting Notification' },
      body: {
        text: `${meeting.title}\n\n` +
          `📅 Date: ${meeting.date}\n` +
          `🕐 Time: ${meeting.time}\n` +
          `📍 Location: ${meeting.location}\n\n` +
          `Agenda:\n${meeting.agenda}`,
      },
      footer: { text: 'Please confirm your attendance' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'attending', title: '✅ Attending' } },
          { type: 'reply', reply: { id: 'not_attending', title: '❌ Not Attending' } },
        ],
      },
    });
  }

  // Send loan statement document
  async sendLoanStatement(
    to: string,
    statement: { documentUrl: string; period: string; loanReference: string }
  ): Promise<{ messageId: string }> {
    return this.sendDocumentMessage(
      to,
      statement.documentUrl,
      `Loan_Statement_${statement.loanReference}_${statement.period}.pdf`,
      `📄 Your loan statement for ${statement.period}\nReference: ${statement.loanReference}`
    );
  }

  // Send farm location for verification
  async sendFarmLocationRequest(to: string, farmName: string): Promise<{ messageId: string }> {
    return this.sendTextMessage(
      to,
      `📍 Farm Location Verification\n\n` +
      `Please share the location of your farm "${farmName}" for verification.\n\n` +
      `Tap the attachment icon (+) and select "Location" to share your current location.`
    );
  }
}

// Factory function
export function createWhatsAppService(config?: Partial<WhatsAppConfig>): WhatsAppService {
  const defaultConfig: WhatsAppConfig = {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  };

  return new WhatsAppService({ ...defaultConfig, ...config });
}

export default WhatsAppService;
