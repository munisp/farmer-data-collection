import AfricasTalking from 'africastalking';

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
      console.log('[SMS] MOCK MODE - SMS would be sent:');
      console.log('[SMS] To:', validNumbers.join(', '));
      console.log('[SMS] From:', options.from || 'Default');
      console.log('[SMS] Message:', options.message);
      console.log('[SMS] ----------------------------------------');
      
      return {
        success: true,
        messageId: `MOCK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

    console.log('[SMS] Send result:', JSON.stringify(result, null, 2));

    // Check if any messages were sent successfully
    const recipients = result.SMSMessageData.Recipients;
    const successfulRecipients = recipients.filter(
      (r: any) => r.statusCode === 101 || r.statusCode === 102
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
  } catch (error: any) {
    console.error('[SMS] Error sending SMS:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Send payment reminder SMS to borrower
 */
export async function sendPaymentReminder(
  phoneNumber: string,
  borrowerName: string,
  amount: number,
  dueDate: Date,
  lenderName: string
): Promise<SMSResult> {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);

  const formattedDate = dueDate.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message = `Dear ${borrowerName}, this is a reminder that your loan payment of ${formattedAmount} to ${lenderName} is due on ${formattedDate}. Please ensure timely payment to avoid penalties.`;

  return sendSMS({
    to: phoneNumber,
    message,
  });
}

/**
 * Send loan approval notification
 */
export async function sendLoanApprovalNotification(
  phoneNumber: string,
  borrowerName: string,
  loanAmount: number,
  lenderName: string
): Promise<SMSResult> {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(loanAmount);

  const message = `Congratulations ${borrowerName}! Your loan application for ${formattedAmount} with ${lenderName} has been approved. You will be contacted shortly with further details.`;

  return sendSMS({
    to: phoneNumber,
    message,
  });
}

/**
 * Send loan rejection notification
 */
export async function sendLoanRejectionNotification(
  phoneNumber: string,
  borrowerName: string,
  lenderName: string,
  reason?: string
): Promise<SMSResult> {
  const message = reason
    ? `Dear ${borrowerName}, we regret to inform you that your loan application with ${lenderName} has been declined. Reason: ${reason}. Please contact us for more information.`
    : `Dear ${borrowerName}, we regret to inform you that your loan application with ${lenderName} has been declined. Please contact us for more information.`;

  return sendSMS({
    to: phoneNumber,
    message,
  });
}

/**
 * Send payment confirmation SMS
 */
export async function sendPaymentConfirmation(
  phoneNumber: string,
  borrowerName: string,
  amount: number,
  remainingBalance: number,
  lenderName: string
): Promise<SMSResult> {
  const formattedAmount = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);

  const formattedBalance = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(remainingBalance);

  const message = `Dear ${borrowerName}, your payment of ${formattedAmount} to ${lenderName} has been received. Remaining balance: ${formattedBalance}. Thank you!`;

  return sendSMS({
    to: phoneNumber,
    message,
  });
}
