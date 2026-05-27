export interface WhatsAppMessage {
  to: string;
  type: "text" | "template" | "image" | "document" | "location";
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: any[];
  };
  image?: {
    link?: string;
    caption?: string;
  };
  document?: {
    link?: string;
    caption?: string;
    filename?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

export interface WhatsAppResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: "twilio" | "meta";
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: WhatsAppTemplateComponent[];
}

export interface WhatsAppTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO";
  text?: string;
  example?: {
    header_handle?: string[];
    body_text?: string[][];
  };
  buttons?: WhatsAppButton[];
}

export interface WhatsAppButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

// Common WhatsApp message templates
export const WHATSAPP_TEMPLATES = {
  WELCOME: {
    name: "farmer_welcome",
    language: "en",
    category: "UTILITY" as const,
    components: [
      {
        type: "BODY" as const,
        text: "Welcome to FarmApp, {{1}}! Your farmer ID is {{2}}. You can now access all features through our app or website.",
      },
    ],
  },
  HARVEST_REMINDER: {
    name: "harvest_reminder",
    language: "en",
    category: "UTILITY" as const,
    components: [
      {
        type: "BODY" as const,
        text: "Hi {{1}}, your {{2}} crop is ready for harvest on {{3}}. Make sure to prepare storage and transport.",
      },
    ],
  },
  PAYMENT_NOTIFICATION: {
    name: "payment_notification",
    language: "en",
    category: "UTILITY" as const,
    components: [
      {
        type: "BODY" as const,
        text: "Payment received! Amount: {{1}} for your {{2}} harvest. Transaction ID: {{3}}",
      },
    ],
  },
  WEATHER_ALERT: {
    name: "weather_alert",
    language: "en",
    category: "UTILITY" as const,
    components: [
      {
        type: "HEADER" as const,
        format: "TEXT" as const,
        text: "⚠️ Weather Alert",
      },
      {
        type: "BODY" as const,
        text: "Weather alert for {{1}}: {{2}}. Please take necessary precautions for your crops.",
      },
    ],
  },
  VERIFICATION_STATUS: {
    name: "verification_status",
    language: "en",
    category: "UTILITY" as const,
    components: [
      {
        type: "BODY" as const,
        text: "Your farmer profile verification status: {{1}}. {{2}}",
      },
    ],
  },
};

export interface WhatsAppWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "document" | "location" | "button" | "interactive";
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
  };
  document?: {
    id: string;
    mime_type: string;
    sha256: string;
    filename?: string;
    caption?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: string;
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
}
