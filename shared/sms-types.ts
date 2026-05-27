export interface SMSMessage {
  to: string;
  message: string;
  from?: string;
}

export interface SMSResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: "africas_talking" | "twilio";
}

export interface SMSTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

export interface SMSNotification {
  id: number;
  farmerId: number;
  phoneNumber: string;
  message: string;
  status: "pending" | "sent" | "failed" | "delivered";
  provider: "africas_talking" | "twilio";
  messageId?: string;
  error?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

// Common SMS templates
export const SMS_TEMPLATES: Record<string, SMSTemplate> = {
  WELCOME: {
    id: "welcome",
    name: "Welcome Message",
    content: "Welcome to FarmApp, {{name}}! Your farmer ID is {{farmerId}}. Login at farmapp.com with password: farmer123",
    variables: ["name", "farmerId"],
  },
  VERIFICATION_APPROVED: {
    id: "verification_approved",
    name: "Verification Approved",
    content: "Congratulations {{name}}! Your farmer profile has been verified. You can now access all features.",
    variables: ["name"],
  },
  VERIFICATION_REJECTED: {
    id: "verification_rejected",
    name: "Verification Rejected",
    content: "Hi {{name}}, your farmer profile verification was not successful. Reason: {{reason}}. Please update your profile.",
    variables: ["name", "reason"],
  },
  HARVEST_REMINDER: {
    id: "harvest_reminder",
    name: "Harvest Reminder",
    content: "Hi {{name}}, your {{crop}} is due for harvest on {{date}}. Prepare your storage and transport.",
    variables: ["name", "crop", "date"],
  },
  PAYMENT_RECEIVED: {
    id: "payment_received",
    name: "Payment Received",
    content: "Payment of {{amount}} received for your {{crop}} harvest. Transaction ID: {{transactionId}}",
    variables: ["amount", "crop", "transactionId"],
  },
  WEATHER_ALERT: {
    id: "weather_alert",
    name: "Weather Alert",
    content: "Weather alert for {{location}}: {{alertMessage}}. Take necessary precautions for your crops.",
    variables: ["location", "alertMessage"],
  },
};
