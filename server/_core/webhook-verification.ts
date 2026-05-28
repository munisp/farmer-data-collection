/**
 * Webhook Signature Verification
 * 
 * Provides signature verification for external webhook providers:
 * - Africa's Talking (SMS, USSD, Voice)
 * - Stripe (Payments)
 * - Paystack (Payments)
 */

import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

/**
 * Verify Africa's Talking webhook signature
 * Africa's Talking uses HMAC-SHA256 with the API key as the secret
 */
export function verifyAfricasTalkingSignature(
  payload: string,
  signature: string,
  apiKey: string
): boolean {
  if (!signature || !apiKey) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', apiKey)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Verify Stripe webhook signature
 */
export function verifyStripeSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  if (!signature || !webhookSecret) {
    return false;
  }

  try {
    const elements = signature.split(',');
    const timestampElement = elements.find(e => e.startsWith('t='));
    const signatureElement = elements.find(e => e.startsWith('v1='));

    if (!timestampElement || !signatureElement) {
      return false;
    }

    const timestamp = timestampElement.split('=')[1];
    const expectedSignature = signatureElement.split('=')[1];

    const signedPayload = `${timestamp}.${payload}`;
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    // Check timestamp is within 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    if (Math.abs(currentTime - webhookTime) > 300) {
      logger.warn('[Webhook] Stripe signature timestamp too old');
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('[Webhook] Stripe signature verification error:', error);
    return false;
  }
}

/**
 * Verify Paystack webhook signature
 */
export function verifyPaystackSignature(
  payload: string,
  signature: string,
  secretKey: string
): boolean {
  if (!signature || !secretKey) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha512', secretKey)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Express middleware for Africa's Talking webhook verification
 */
export function africasTalkingWebhookMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip verification in development/test
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.info('[Webhook] Skipping AT signature verification in dev/test mode');
      return next();
    }

    const apiKey = process.env.AFRICASTALKING_API_KEY;
    if (!apiKey) {
      logger.warn('[Webhook] AT API key not configured, skipping verification');
      return next();
    }

    const signature = req.headers['x-africastalking-signature'] as string;
    const payload = JSON.stringify(req.body);

    if (!verifyAfricasTalkingSignature(payload, signature, apiKey)) {
      logger.error('[Webhook] Invalid Africa\'s Talking signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
  };
}

/**
 * Express middleware for Stripe webhook verification
 */
export function stripeWebhookMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip verification in development/test
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.info('[Webhook] Skipping Stripe signature verification in dev/test mode');
      return next();
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn('[Webhook] Stripe webhook secret not configured, skipping verification');
      return next();
    }

    const signature = req.headers['stripe-signature'] as string;
    const payload = (req as any).rawBody || JSON.stringify(req.body);

    if (!verifyStripeSignature(payload, signature, webhookSecret)) {
      logger.error('[Webhook] Invalid Stripe signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
  };
}

/**
 * Express middleware for Paystack webhook verification
 */
export function paystackWebhookMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip verification in development/test
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.info('[Webhook] Skipping Paystack signature verification in dev/test mode');
      return next();
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      logger.warn('[Webhook] Paystack secret key not configured, skipping verification');
      return next();
    }

    const signature = req.headers['x-paystack-signature'] as string;
    const payload = JSON.stringify(req.body);

    if (!verifyPaystackSignature(payload, signature, secretKey)) {
      logger.error('[Webhook] Invalid Paystack signature');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
  };
}

/**
 * Generic webhook verification middleware factory
 */
export function createWebhookVerifier(options: {
  provider: 'africastalking' | 'stripe' | 'paystack';
  headerName: string;
  secretEnvVar: string;
  algorithm: 'sha256' | 'sha512';
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip verification in development/test
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return next();
    }

    const secret = process.env[options.secretEnvVar];
    if (!secret) {
      logger.warn(`[Webhook] ${options.provider} secret not configured`);
      return next();
    }

    const signature = req.headers[options.headerName.toLowerCase()] as string;
    const payload = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac(options.algorithm, secret)
      .update(payload)
      .digest('hex');

    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature || ''),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        logger.error(`[Webhook] Invalid ${options.provider} signature`);
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } catch (error) {
      logger.error(`[Webhook] ${options.provider} verification error:`, error);
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    next();
  };
}
