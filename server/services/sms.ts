import AfricasTalking from 'africastalking';
import { logger } from '../logger.js';

// Initialize Africa's Talking SDK
const credentials = {
  apiKey: process.env.AFRICASTALKING_API_KEY || '',
  username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
};

// Use mock mode if no API key is provided
const useMockMode = !process.env.AFRICASTALKING_API_KEY;

let sms: any;
if (!useMockMode) {
  const africastalking = AfricasTalking(credentials);
  sms = africastalking.SMS;
}

export interface SendSMSOptions {
  to: string | string[];
  message: string;
  from?: string;
}

export interface SMSResult {
  success: boolean;
  messageId?: string;
  cost?: string;
  status?: string;
  error?: string;
}

/**
 * Send SMS using Africa's Talking API
 */
export async function sendSMS(options: SendSMSOptions): Promise<SMSResult> {
  try {
    const phoneNumbers = Array.isArray(options.to) ? options.to : [options.to];
    
    // Validate phone numbers (should be in international format)
    const validNumbers = phoneNumbers.filter(num => {
      return num.startsWith('+') && num.length >= 10;
    });

    if (validNumbers.length === 0) {
      return {
        success: false,
        error: 'No valid phone numbers provided. Numbers must be in international format (e.g., +254711XXXYYY)',
      };
    }

    // Mock mode: simulate SMS sending
    if (useMockMode) {
      logger.info('[SMS] MOCK MODE - SMS would be sent:');
      logger.info('[SMS] To:', validNumbers.join(', '));
      logger.info('[SMS] From:', options.from || 'Default');
      logger.info('[SMS] Message:', options.message);
      logger.info('[SMS] ----------------------------------------');
      
      return {
        success: true,
        messageId: `MOCK_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`,
        cost: 'NGN 0.00 (Mock)',
        status: 'Mock Success',
      };
    }

    // Real mode: send actual SMS
    const result = await sms.send({
      to: validNumbers,
      message: options.message,
      from: options.from,
    });

    logger.info('[SMS] Send result:', JSON.stringify(result, null, 2));

    // Check if any messages were sent successfully
    const recipients = result.SMSMessageData.Recipients;
    const successfulRecipients = recipients.filter(
      (r: Record<string, unknown>) => r.statusCode === 101 || r.statusCode === 102
    );

    if (successfulRecipients.length > 0) {
      const first = successfulRecipients[0];
      return {
        success: true,
        messageId: first.messageId,
        cost: first.cost,
        status: first.status,
      };
    } else {
      const first = recipients[0];
      return {
        success: false,
        error: `Failed to send SMS: ${first.status} (Code: ${first.statusCode})`,
      };
    }
  } catch (error: unknown) {
    logger.error('[SMS] Error sending SMS:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)),
    };
  }
}

export async function sendPaymentConfirmation(
  phoneNumber: string,
  borrowerName: string,
  lenderName: string,
  amount: number,
  remainingBalance: number,
  currency: string = 'NGN'
): Promise<SMSResult> {
  const formatter = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  });
  const formattedAmount = formatter.format(amount);
  const formattedBalance = formatter.format(remainingBalance);

  const message = `Dear ${borrowerName}, your payment of ${formattedAmount} to ${lenderName} has been received. Remaining balance: ${formattedBalance}. Thank you!`;

  return sendSMS({
    to: phoneNumber,
    message,
  });
}

export async function sendPaymentReminder(
  phoneNumber: string,
  borrowerName: string,
  amount: number,
  dueDate: string,
  currency: string = 'NGN'
): Promise<SMSResult> {
  const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 });
  const message = `Dear ${borrowerName}, this is a reminder that your payment of ${formatter.format(amount)} is due on ${dueDate}. Please make your payment on time to maintain your credit score.`;
  return sendSMS({ to: phoneNumber, message });
}

export async function sendLoanApprovalNotification(
  phoneNumber: string,
  borrowerName: string,
  amount: number,
  currency: string = 'NGN'
): Promise<SMSResult> {
  const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 });
  const message = `Congratulations ${borrowerName}! Your loan application for ${formatter.format(amount)} has been approved. Funds will be disbursed shortly.`;
  return sendSMS({ to: phoneNumber, message });
}

export async function sendLoanRejectionNotification(
  phoneNumber: string,
  borrowerName: string,
  reason: string = 'eligibility criteria'
): Promise<SMSResult> {
  const message = `Dear ${borrowerName}, we regret to inform you that your loan application could not be approved at this time due to ${reason}. Please contact support for more details.`;
  return sendSMS({ to: phoneNumber, message });
}

export async function sendDisbursementNotification(
  phoneNumber: string,
  borrowerName: string,
  amount: number,
  currency: string = 'NGN'
): Promise<SMSResult> {
  const formatter = new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0 });
  const message = `Dear ${borrowerName}, your loan of ${formatter.format(amount)} has been disbursed to your account. Please check your balance.`;
  return sendSMS({ to: phoneNumber, message });
}
