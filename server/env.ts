/**
 * Environment Variable Validation
 * Validates required environment variables at startup
 * Uses zod for type-safe validation
 */

import { z } from 'zod';

// Environment variable schema
const envSchema = z.object({
  // Required in production
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Optional with defaults
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  
  // Redis (optional - falls back to in-memory)
  REDIS_URL: z.string().optional(),
  
  // Authentication (optional - uses local auth if not set)
  KEYCLOAK_URL: z.string().optional(),
  KEYCLOAK_REALM: z.string().optional(),
  KEYCLOAK_CLIENT_ID: z.string().optional(),
  KEYCLOAK_CLIENT_SECRET: z.string().optional(),
  
  // External services (optional)
  AFRICASTALKING_API_KEY: z.string().optional(),
  AFRICASTALKING_USERNAME: z.string().optional(),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
  
  // Stripe (optional)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  
  // AWS/S3 (optional)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  
  // Kafka (optional)
  KAFKA_BROKERS: z.string().optional(),
  
  // Temporal (optional)
  TEMPORAL_ADDRESS: z.string().optional(),
  
  // TigerBeetle (optional)
  TIGERBEETLE_ADDRESS: z.string().optional(),
  
  // Sentry (optional)
  SENTRY_DSN: z.string().optional(),
  
  // CORS
  ALLOWED_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Validate and return environment variables
 * Throws on first call if required vars are missing
 * Returns cached result on subsequent calls
 */
export function getEnv(): Env {
  if (_env) return _env;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => 
      `  - ${issue.path.join('.')}: ${issue.message}`
    ).join('\n');
    
    console.error('Environment validation failed:');
    console.error(errors);
    
    // In production, fail fast
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Environment validation failed:\n${errors}`);
    }
    
    // In development, warn but continue - DATABASE_URL must still be set via .env file
    console.warn('Some optional environment variables are missing. Set them in .env file.');
    
    // Re-parse - DATABASE_URL is still required, must be set in .env
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required. Set it in your .env file.');
    }
    
    _env = envSchema.parse(process.env);
  } else {
    _env = result.data;
  }
  
  return _env;
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

/**
 * Check if a feature is enabled based on env vars
 */
export function isFeatureEnabled(feature: string): boolean {
  const env = getEnv();
  
  switch (feature) {
    case 'keycloak':
      return !!(env.KEYCLOAK_URL && env.KEYCLOAK_REALM);
    case 'africastalking':
      return !!(env.AFRICASTALKING_API_KEY && env.AFRICASTALKING_USERNAME);
    case 'stripe':
      return !!env.STRIPE_SECRET_KEY;
    case 's3':
      return !!(env.AWS_ACCESS_KEY_ID && env.S3_BUCKET);
    case 'kafka':
      return !!env.KAFKA_BROKERS;
    case 'temporal':
      return !!env.TEMPORAL_ADDRESS;
    case 'tigerbeetle':
      return !!env.TIGERBEETLE_ADDRESS;
    case 'sentry':
      return !!env.SENTRY_DSN;
    case 'redis':
      return !!env.REDIS_URL;
    default:
      return false;
  }
}

export default { getEnv, isProduction, isFeatureEnabled };
