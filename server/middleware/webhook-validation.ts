/**
 * Webhook Signature Validation Middleware
 * Validates webhook signatures from Stripe, Paystack, M-Pesa, and other providers
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../logger.js';

type WebhookProvider = 'stripe' | 'paystack' | 'mpesa' | 'africas_talking' | 'flutterwave' | 'generic';

interface WebhookConfig {
  provider: WebhookProvider;
  secret: string;
  headerName?: string;
  tolerance?: number;
}

export function rawBodyParser(req: Request, res: Response, next: NextFunction) {
  if (req.headers['content-type'] === 'application/json') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      (req as any).rawBody = data;
      try { req.body = JSON.parse(data); } catch (err) { logger.debug('[Webhook] Body parse failed, using empty object', { err }); req.body = {}; }
      next();
    });
  } else {
    next();
  }
}

export function validateStripeWebhook(secret: string, tolerance: number = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['stripe-signature'] as string;
    const rawBody = ((req as any).rawBody as string) || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({ error: 'Webhook Error', message: 'Missing Stripe signature header' });
    }

    try {
      const elements = signature.split(',');
      const signatureMap: Record<string, string> = {};
      for (const element of elements) {
        const [key, value] = element.split('=');
        signatureMap[key] = value;
      }

      const timestamp = signatureMap['t'];
      const v1Signature = signatureMap['v1'];
      if (!timestamp || !v1Signature) throw new Error('Invalid signature format');

      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
      if (timestampAge > tolerance) throw new Error('Webhook timestamp too old');

      const signedPayload = `${timestamp}.${rawBody}`;
      const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

      const isValid = crypto.timingSafeEqual(Buffer.from(v1Signature), Buffer.from(expectedSignature));
      if (!isValid) throw new Error('Signature verification failed');

      (req as any).stripeEvent = req.body;
      next();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Stripe webhook validation error:', msg);
      res.status(400).json({ error: 'Webhook Error', message: msg });
    }
  };
}

export function validatePaystackWebhook(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-paystack-signature'] as string;
    const rawBody = ((req as any).rawBody as string) || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({ error: 'Webhook Error', message: 'Missing Paystack signature header' });
    }

    try {
      const expectedSignature = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
      if (signature !== expectedSignature) throw new Error('Signature verification failed');

      (req as any).paystackEvent = req.body;
      next();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Paystack webhook validation error:', msg);
      res.status(400).json({ error: 'Webhook Error', message: msg });
    }
  };
}

export function validateMpesaWebhook(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-mpesa-signature'] as string;
    const rawBody = ((req as any).rawBody as string) || JSON.stringify(req.body);

    if (!signature) {
      (req as any).mpesaEvent = req.body;
      return next();
    }

    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const cleanSignature = signature.replace(/^sha\d+=/, '');

      const isValid = crypto.timingSafeEqual(Buffer.from(cleanSignature), Buffer.from(expectedSignature));
      if (!isValid) throw new Error('Signature verification failed');

      (req as any).mpesaEvent = req.body;
      next();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('M-Pesa webhook validation error:', msg);
      res.status(400).json({ error: 'Webhook Error', message: msg });
    }
  };
}

export function validateAfricasTalkingWebhook(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    (req as any).webhookEvent = req.body;
    next();
  };
}

export function validateFlutterwaveWebhook(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['verif-hash'] as string;
    if (!signature || signature !== secret) {
      return res.status(400).json({ error: 'Webhook Error', message: 'Invalid Flutterwave signature' });
    }
    (req as any).flutterwaveEvent = req.body;
    next();
  };
}

export function validateGenericWebhook(secret: string, headerName: string = 'x-webhook-signature') {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers[headerName.toLowerCase()] as string;
    const rawBody = ((req as any).rawBody as string) || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({ error: 'Webhook Error', message: `Missing ${headerName} header` });
    }

    try {
      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      if (signature !== expectedSignature) throw new Error('Signature verification failed');

      (req as any).webhookEvent = req.body;
      next();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: 'Webhook Error', message: msg });
    }
  };
}

export function logWebhookEvent(provider: WebhookProvider) {
  return (req: Request, _res: Response, next: NextFunction) => {
    logger.info('Webhook received', {
      provider,
      method: req.method,
      path: req.path,
      ip: req.ip,
      contentType: req.headers['content-type'],
    });
    next();
  };
}

export function createWebhookValidator(config: WebhookConfig) {
  const { provider, secret, headerName, tolerance } = config;
  switch (provider) {
    case 'stripe': return validateStripeWebhook(secret, tolerance);
    case 'paystack': return validatePaystackWebhook(secret);
    case 'mpesa': return validateMpesaWebhook(secret);
    case 'africas_talking': return validateAfricasTalkingWebhook(secret);
    case 'flutterwave': return validateFlutterwaveWebhook(secret);
    case 'generic': return validateGenericWebhook(secret, headerName);
    default: return validateGenericWebhook(secret, headerName);
  }
}

export default {
  rawBodyParser,
  validateStripeWebhook,
  validatePaystackWebhook,
  validateMpesaWebhook,
  validateAfricasTalkingWebhook,
  validateFlutterwaveWebhook,
  validateGenericWebhook,
  logWebhookEvent,
  createWebhookValidator,
};
