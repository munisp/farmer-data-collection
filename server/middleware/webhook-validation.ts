/**
 * Webhook Signature Validation Middleware
 * Validates webhook signatures from Stripe, Paystack, M-Pesa, and other providers
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Webhook provider types
type WebhookProvider = 'stripe' | 'paystack' | 'mpesa' | 'africas_talking' | 'flutterwave' | 'generic';

interface WebhookConfig {
  provider: WebhookProvider;
  secret: string;
  headerName?: string;
  tolerance?: number; // Timestamp tolerance in seconds
}

// Raw body parser for webhook endpoints
export function rawBodyParser(req: Request, res: Response, next: NextFunction) {
  if (req.headers['content-type'] === 'application/json') {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      (req as any).rawBody = data;
      try {
        req.body = JSON.parse(data);
      } catch {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
}

// Stripe webhook signature validation
export function validateStripeWebhook(secret: string, tolerance: number = 300) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({
        error: 'Webhook Error',
        message: 'Missing Stripe signature header',
      });
    }

    try {
      // Parse signature header
      const elements = signature.split(',');
      const signatureMap: Record<string, string> = {};
      
      for (const element of elements) {
        const [key, value] = element.split('=');
        signatureMap[key] = value;
      }

      const timestamp = signatureMap['t'];
      const v1Signature = signatureMap['v1'];

      if (!timestamp || !v1Signature) {
        throw new Error('Invalid signature format');
      }

      // Check timestamp tolerance
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);
      if (timestampAge > tolerance) {
        throw new Error('Webhook timestamp too old');
      }

      // Compute expected signature
      const signedPayload = `${timestamp}.${rawBody}`;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      // Timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(v1Signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        throw new Error('Signature verification failed');
      }

      // Attach verified event to request
      (req as any).stripeEvent = req.body;
      next();
    } catch (error: any) {
      console.error('Stripe webhook validation error:', error.message);
      res.status(400).json({
        error: 'Webhook Error',
        message: error.message || 'Invalid webhook signature',
      });
    }
  };
}

// Paystack webhook signature validation
export function validatePaystackWebhook(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-paystack-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({
        error: 'Webhook Error',
        message: 'Missing Paystack signature header',
      });
    }

    try {
      // Compute expected signature (SHA512)
      const expectedSignature = crypto
        .createHmac('sha512', secret)
        .update(rawBody)
        .digest('hex');

      // Compare signatures
      if (signature !== expectedSignature) {
        throw new Error('Signature verification failed');
      }

      // Attach verified event to request
      (req as any).paystackEvent = req.body;
      next();
    } catch (error: any) {
      console.error('Paystack webhook validation error:', error.message);
      res.status(400).json({
        error: 'Webhook Error',
        message: error.message || 'Invalid webhook signature',
      });
    }
  };
}

// M-Pesa callback validation (IP whitelist + optional signature)
export function validateMpesaWebhook(config: {
  allowedIPs?: string[];
  secret?: string;
}) {
  const { allowedIPs = [], secret } = config;

  // Safaricom M-Pesa IP ranges (example - should be updated with actual IPs)
  const safaricomIPs = [
    '196.201.214.0/24',
    '196.201.212.0/24',
    ...allowedIPs,
  ];

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.socket.remoteAddress || '';

    // IP validation (if configured)
    if (safaricomIPs.length > 0) {
      const isAllowedIP = safaricomIPs.some(range => {
        if (range.includes('/')) {
          return isIPInRange(clientIP, range);
        }
        return clientIP === range;
      });

      if (!isAllowedIP && process.env.NODE_ENV === 'production') {
        console.warn(`M-Pesa webhook from unauthorized IP: ${clientIP}`);
        return res.status(403).json({
          error: 'Webhook Error',
          message: 'Unauthorized IP address',
        });
      }
    }

    // Optional signature validation
    if (secret) {
      const signature = req.headers['x-mpesa-signature'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (signature) {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(rawBody)
          .digest('hex');

        if (signature !== expectedSignature) {
          return res.status(400).json({
            error: 'Webhook Error',
            message: 'Invalid signature',
          });
        }
      }
    }

    // Attach verified callback to request
    (req as any).mpesaCallback = req.body;
    next();
  };
}

// Africa's Talking webhook validation
export function validateAfricasTalkingWebhook(username: string, apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Africa's Talking uses form-encoded data
    const { username: reqUsername } = req.body;

    // Validate username matches
    if (reqUsername && reqUsername !== username) {
      return res.status(400).json({
        error: 'Webhook Error',
        message: 'Invalid username',
      });
    }

    // For USSD callbacks, validate session
    if (req.body.sessionId) {
      // Session validation logic
      (req as any).ussdCallback = req.body;
    }

    // For SMS callbacks
    if (req.body.from && req.body.text) {
      (req as any).smsCallback = req.body;
    }

    next();
  };
}

// Flutterwave webhook validation
export function validateFlutterwaveWebhook(secretHash: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['verif-hash'] as string;

    if (!signature) {
      return res.status(400).json({
        error: 'Webhook Error',
        message: 'Missing Flutterwave signature header',
      });
    }

    // Flutterwave uses a simple hash comparison
    if (signature !== secretHash) {
      return res.status(400).json({
        error: 'Webhook Error',
        message: 'Invalid webhook signature',
      });
    }

    (req as any).flutterwaveEvent = req.body;
    next();
  };
}

// Generic HMAC webhook validation
export function validateGenericWebhook(config: {
  secret: string;
  headerName: string;
  algorithm?: 'sha256' | 'sha512' | 'sha1';
  encoding?: 'hex' | 'base64';
}) {
  const { 
    secret, 
    headerName, 
    algorithm = 'sha256', 
    encoding = 'hex' 
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers[headerName.toLowerCase()] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      return res.status(400).json({
        error: 'Webhook Error',
        message: `Missing ${headerName} header`,
      });
    }

    try {
      const expectedSignature = crypto
        .createHmac(algorithm, secret)
        .update(rawBody)
        .digest(encoding);

      // Handle signatures with prefixes (e.g., "sha256=...")
      const cleanSignature = signature.replace(/^sha\d+=/, '');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(cleanSignature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        throw new Error('Signature verification failed');
      }

      (req as any).webhookEvent = req.body;
      next();
    } catch (error: any) {
      res.status(400).json({
        error: 'Webhook Error',
        message: error.message || 'Invalid webhook signature',
      });
    }
  };
}

// Utility: Check if IP is in CIDR range
function isIPInRange(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  
  const ipNum = ipToNumber(ip);
  const rangeNum = ipToNumber(range);
  
  return (ipNum & mask) === (rangeNum & mask);
}

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// Webhook event logging middleware
export function logWebhookEvent(provider: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Log incoming webhook
    console.log(`[Webhook] ${provider} - Received`, {
      path: req.path,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      console.log(`[Webhook] ${provider} - Completed`, {
        status: res.statusCode,
        duration: `${duration}ms`,
      });
    });

    next();
  };
}

// Factory function to create webhook validator based on provider
export function createWebhookValidator(config: WebhookConfig) {
  switch (config.provider) {
    case 'stripe':
      return validateStripeWebhook(config.secret, config.tolerance);
    case 'paystack':
      return validatePaystackWebhook(config.secret);
    case 'mpesa':
      return validateMpesaWebhook({ secret: config.secret });
    case 'flutterwave':
      return validateFlutterwaveWebhook(config.secret);
    case 'generic':
    default:
      return validateGenericWebhook({
        secret: config.secret,
        headerName: config.headerName || 'x-webhook-signature',
      });
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
