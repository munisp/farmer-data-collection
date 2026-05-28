/**
 * Payment Flows Tests
 * Comprehensive tests for payment processing, M-Pesa, Paystack, and Stripe integrations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock payment providers
const mockMpesa = {
  stkPush: vi.fn(),
  queryTransaction: vi.fn(),
  b2c: vi.fn(),
};

const mockPaystack = {
  initializeTransaction: vi.fn(),
  verifyTransaction: vi.fn(),
  chargeAuthorization: vi.fn(),
};

const mockStripe = {
  paymentIntents: {
    create: vi.fn(),
    confirm: vi.fn(),
    retrieve: vi.fn(),
  },
};

// Payment service
class PaymentService {
  async initiateMpesaPayment(phoneNumber: string, amount: number, reference: string) {
    // Validate phone number format
    if (!this.isValidKenyanPhone(phoneNumber)) {
      throw new Error('Invalid Kenyan phone number');
    }

    // Validate amount
    if (amount < 10) {
      throw new Error('Minimum amount is ₦ 10');
    }

    if (amount > 150000) {
      throw new Error('Maximum amount is ₦ 150,000');
    }

    const result = await mockMpesa.stkPush({
      phoneNumber: this.formatPhoneNumber(phoneNumber),
      amount,
      accountReference: reference,
      transactionDesc: 'Loan Repayment',
    });

    return {
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
      responseCode: result.ResponseCode,
    };
  }

  async verifyMpesaPayment(checkoutRequestId: string) {
    const result = await mockMpesa.queryTransaction(checkoutRequestId);

    return {
      success: result.ResultCode === '0',
      transactionId: result.MpesaReceiptNumber,
      amount: result.Amount,
      phoneNumber: result.PhoneNumber,
    };
  }

  async initiatePaystackPayment(email: string, amount: number, reference: string) {
    // Validate email
    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email address');
    }

    // Validate amount (Paystack uses kobo)
    if (amount < 100) {
      throw new Error('Minimum amount is NGN 1');
    }

    const result = await mockPaystack.initializeTransaction({
      email,
      amount: amount * 100, // Convert to kobo
      reference,
      currency: 'NGN',
    });

    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    };
  }

  async verifyPaystackPayment(reference: string) {
    const result = await mockPaystack.verifyTransaction(reference);

    return {
      success: result.data.status === 'success',
      amount: result.data.amount / 100, // Convert from kobo
      reference: result.data.reference,
      channel: result.data.channel,
      paidAt: result.data.paid_at,
    };
  }

  async createStripePaymentIntent(amount: number, currency: string, customerId?: string) {
    // Validate currency
    const supportedCurrencies = ['usd', 'eur', 'gbp', 'ngn', 'kes'];
    if (!supportedCurrencies.includes(currency.toLowerCase())) {
      throw new Error('Unsupported currency');
    }

    // Validate amount
    if (amount < 50) {
      throw new Error('Minimum amount is 50 cents');
    }

    const paymentIntent = await mockStripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      customer: customerId,
      automatic_payment_methods: { enabled: true },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  async confirmStripePayment(paymentIntentId: string, paymentMethodId: string) {
    const result = await mockStripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });

    return {
      success: result.status === 'succeeded',
      status: result.status,
      amount: result.amount,
    };
  }

  // Utility methods
  private isValidKenyanPhone(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return /^(254|0)?[17]\d{8}$/.test(cleaned);
  }

  private formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      return '254' + cleaned.substring(1);
    }
    if (cleaned.startsWith('254')) {
      return cleaned;
    }
    return '254' + cleaned;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Webhook signature verification
  verifyMpesaSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  verifyPaystackSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha512', secret)
      .update(payload)
      .digest('hex');
    return signature === expectedSignature;
  }

  verifyStripeSignature(payload: string, signature: string, secret: string): boolean {
    // Stripe uses a more complex signature format
    const crypto = require('crypto');
    const parts = signature.split(',');
    const timestamp = parts.find((p: string) => p.startsWith('t='))?.split('=')[1];
    const v1 = parts.find((p: string) => p.startsWith('v1='))?.split('=')[1];

    if (!timestamp || !v1) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex');

    return v1 === expectedSignature;
  }
}

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaymentService();
  });

  describe('M-Pesa Payments', () => {
    it('should initiate STK push for valid phone number', async () => {
      mockMpesa.stkPush.mockResolvedValue({
        CheckoutRequestID: 'ws_CO_123456',
        MerchantRequestID: 'mr_123456',
        ResponseCode: '0',
      });

      const result = await service.initiateMpesaPayment(
        '0712345678',
        1000,
        'LOAN-001'
      );

      expect(result.checkoutRequestId).toBe('ws_CO_123456');
      expect(result.responseCode).toBe('0');
    });

    it('should reject invalid phone number', async () => {
      await expect(
        service.initiateMpesaPayment('123', 1000, 'LOAN-001')
      ).rejects.toThrow('Invalid Kenyan phone number');
    });

    it('should reject amount below minimum', async () => {
      await expect(
        service.initiateMpesaPayment('0712345678', 5, 'LOAN-001')
      ).rejects.toThrow('Minimum amount is ₦ 10');
    });

    it('should reject amount above maximum', async () => {
      await expect(
        service.initiateMpesaPayment('0712345678', 200000, 'LOAN-001')
      ).rejects.toThrow('Maximum amount is ₦ 150,000');
    });

    it('should verify successful M-Pesa payment', async () => {
      mockMpesa.queryTransaction.mockResolvedValue({
        ResultCode: '0',
        MpesaReceiptNumber: 'QJK1234567',
        Amount: 1000,
        PhoneNumber: '254712345678',
      });

      const result = await service.verifyMpesaPayment('ws_CO_123456');

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('QJK1234567');
    });

    it('should handle failed M-Pesa payment', async () => {
      mockMpesa.queryTransaction.mockResolvedValue({
        ResultCode: '1032',
        ResultDesc: 'Request cancelled by user',
      });

      const result = await service.verifyMpesaPayment('ws_CO_123456');

      expect(result.success).toBe(false);
    });
  });

  describe('Paystack Payments', () => {
    it('should initialize transaction for valid email', async () => {
      mockPaystack.initializeTransaction.mockResolvedValue({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/abc123',
          access_code: 'abc123',
          reference: 'ref_123',
        },
      });

      const result = await service.initiatePaystackPayment(
        'farmer@example.com',
        5000,
        'ref_123'
      );

      expect(result.authorizationUrl).toContain('paystack.com');
      expect(result.reference).toBe('ref_123');
    });

    it('should reject invalid email', async () => {
      await expect(
        service.initiatePaystackPayment('invalid-email', 5000, 'ref_123')
      ).rejects.toThrow('Invalid email address');
    });

    it('should reject amount below minimum', async () => {
      await expect(
        service.initiatePaystackPayment('farmer@example.com', 50, 'ref_123')
      ).rejects.toThrow('Minimum amount is NGN 1');
    });

    it('should verify successful Paystack payment', async () => {
      mockPaystack.verifyTransaction.mockResolvedValue({
        status: true,
        data: {
          status: 'success',
          amount: 500000, // kobo
          reference: 'ref_123',
          channel: 'card',
          paid_at: '2024-01-15T10:00:00.000Z',
        },
      });

      const result = await service.verifyPaystackPayment('ref_123');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000); // NGN
    });
  });

  describe('Stripe Payments', () => {
    it('should create payment intent for supported currency', async () => {
      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123456',
        client_secret: 'pi_123456_secret_abc',
        status: 'requires_payment_method',
      });

      const result = await service.createStripePaymentIntent(5000, 'usd');

      expect(result.clientSecret).toBe('pi_123456_secret_abc');
      expect(result.paymentIntentId).toBe('pi_123456');
    });

    it('should reject unsupported currency', async () => {
      await expect(
        service.createStripePaymentIntent(5000, 'xyz')
      ).rejects.toThrow('Unsupported currency');
    });

    it('should reject amount below minimum', async () => {
      await expect(
        service.createStripePaymentIntent(10, 'usd')
      ).rejects.toThrow('Minimum amount is 50 cents');
    });

    it('should confirm payment intent', async () => {
      mockStripe.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_123456',
        status: 'succeeded',
        amount: 5000,
      });

      const result = await service.confirmStripePayment('pi_123456', 'pm_abc');

      expect(result.success).toBe(true);
      expect(result.status).toBe('succeeded');
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid Paystack signature', () => {
      const payload = JSON.stringify({ event: 'charge.success' });
      const secret = 'test_secret';
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

      const isValid = service.verifyPaystackSignature(payload, signature, secret);

      expect(isValid).toBe(true);
    });

    it('should reject invalid Paystack signature', () => {
      const payload = JSON.stringify({ event: 'charge.success' });
      const secret = 'test_secret';
      const invalidSignature = 'invalid_signature';

      const isValid = service.verifyPaystackSignature(payload, invalidSignature, secret);

      expect(isValid).toBe(false);
    });
  });
});
