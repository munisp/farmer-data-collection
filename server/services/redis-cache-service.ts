/**
 * Redis Caching Service
 * Provides caching for dashboard aggregations, market prices, weather data, and more
 */

import { Redis } from 'ioredis';
import { logger } from '../logger.js';

interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Tags for cache invalidation
}

export class RedisCacheService {
  private client: Redis;
  private prefix: string;
  private defaultTTL: number;

  constructor(config: CacheConfig) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'cache:',
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.prefix = config.keyPrefix || 'cache:';
    this.defaultTTL = config.defaultTTL || 3600; // 1 hour default

    this.client.on('error', (err) => {
      logger.error('Redis cache error:', err);
    });
  }

  // Basic cache operations
  async get<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) return null;
    
    try {
      return JSON.parse(data) as T;
    } catch (err) {
      return data as unknown as T;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || this.defaultTTL;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    await this.client.setex(key, ttl, serialized);

    // Store tags for invalidation
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        await this.client.sadd(`tag:${tag}`, key);
        await this.client.expire(`tag:${tag}`, ttl + 60); // Tag expires slightly after cache
      }
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async deleteByTag(tag: string): Promise<number> {
    const keys = await this.client.smembers(`tag:${tag}`);
    if (keys.length === 0) return 0;

    const deleted = await this.client.del(...keys);
    await this.client.del(`tag:${tag}`);
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  // Cache-aside pattern helper
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetchFn();
    await this.set(key, fresh, options);
    return fresh;
  }

  // Dashboard aggregation caching
  async cacheDashboardStats(
    userId: string,
    stats: {
      totalFarmers: number;
      totalFarms: number;
      totalHarvests: number;
      totalRevenue: number;
      activeLoans: number;
      pendingApplications: number;
    }
  ): Promise<void> {
    await this.set(`dashboard:${userId}:stats`, stats, {
      ttl: 300, // 5 minutes
      tags: ['dashboard', `user:${userId}`],
    });
  }

  async getDashboardStats(userId: string): Promise<any | null> {
    return this.get(`dashboard:${userId}:stats`);
  }

  // Market prices caching
  async cacheMarketPrices(
    region: string,
    prices: Array<{
      commodity: string;
      price: number;
      unit: string;
      market: string;
      updatedAt: string;
    }>
  ): Promise<void> {
    await this.set(`market:${region}:prices`, prices, {
      ttl: 1800, // 30 minutes
      tags: ['market', `region:${region}`],
    });
  }

  async getMarketPrices(region: string): Promise<any[] | null> {
    return this.get(`market:${region}:prices`);
  }

  // Weather data caching
  async cacheWeatherData(
    location: string,
    weather: {
      temperature: number;
      humidity: number;
      rainfall: number;
      forecast: Array<{
        date: string;
        condition: string;
        tempHigh: number;
        tempLow: number;
        rainChance: number;
      }>;
    }
  ): Promise<void> {
    await this.set(`weather:${location}`, weather, {
      ttl: 3600, // 1 hour
      tags: ['weather', `location:${location}`],
    });
  }

  async getWeatherData(location: string): Promise<any | null> {
    return this.get(`weather:${location}`);
  }

  // Farmer profile caching
  async cacheFarmerProfile(
    farmerId: string,
    profile: {
      id: string;
      name: string;
      phone: string;
      region: string;
      farms: unknown[];
      creditScore: number;
      totalLoans: number;
    }
  ): Promise<void> {
    await this.set(`farmer:${farmerId}:profile`, profile, {
      ttl: 600, // 10 minutes
      tags: ['farmer', `farmer:${farmerId}`],
    });
  }

  async getFarmerProfile(farmerId: string): Promise<any | null> {
    return this.get(`farmer:${farmerId}:profile`);
  }

  async invalidateFarmerCache(farmerId: string): Promise<void> {
    await this.deleteByTag(`farmer:${farmerId}`);
  }

  // Loan analytics caching
  async cacheLoanAnalytics(
    analytics: {
      totalDisbursed: number;
      totalRepaid: number;
      defaultRate: number;
      averageLoanSize: number;
      byRegion: Record<string, number>;
      byPurpose: Record<string, number>;
    }
  ): Promise<void> {
    await this.set('analytics:loans', analytics, {
      ttl: 900, // 15 minutes
      tags: ['analytics', 'loans'],
    });
  }

  async getLoanAnalytics(): Promise<any | null> {
    return this.get('analytics:loans');
  }

  // Cooperative data caching
  async cacheCooperativeData(
    cooperativeId: string,
    data: {
      id: string;
      name: string;
      memberCount: number;
      totalSavings: number;
      activeLoans: number;
      members: unknown[];
    }
  ): Promise<void> {
    await this.set(`cooperative:${cooperativeId}`, data, {
      ttl: 600, // 10 minutes
      tags: ['cooperative', `coop:${cooperativeId}`],
    });
  }

  async getCooperativeData(cooperativeId: string): Promise<any | null> {
    return this.get(`cooperative:${cooperativeId}`);
  }

  // Exchange order book caching
  async cacheOrderBook(
    commoditySymbol: string,
    orderBook: {
      bids: Array<{ price: number; quantity: number; count: number }>;
      asks: Array<{ price: number; quantity: number; count: number }>;
      lastPrice: number;
      volume24h: number;
    }
  ): Promise<void> {
    await this.set(`exchange:${commoditySymbol}:orderbook`, orderBook, {
      ttl: 5, // 5 seconds - very short for real-time data
      tags: ['exchange', `commodity:${commoditySymbol}`],
    });
  }

  async getOrderBook(commoditySymbol: string): Promise<any | null> {
    return this.get(`exchange:${commoditySymbol}:orderbook`);
  }

  // Session caching
  async cacheSession(
    sessionId: string,
    session: {
      userId: string;
      role: string;
      permissions: string[];
      expiresAt: string;
    }
  ): Promise<void> {
    const ttl = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    await this.set(`session:${sessionId}`, session, { ttl: Math.max(ttl, 60) });
  }

  async getSession(sessionId: string): Promise<any | null> {
    return this.get(`session:${sessionId}`);
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.delete(`session:${sessionId}`);
  }

  // Rate limiting support
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const multi = this.client.multi();
    multi.incr(`ratelimit:${key}`);
    multi.expire(`ratelimit:${key}`, windowSeconds);
    const results = await multi.exec();
    return results?.[0]?.[1] as number || 0;
  }

  async getRateLimitCount(key: string): Promise<number> {
    const count = await this.client.get(`ratelimit:${key}`);
    return parseInt(count || '0', 10);
  }

  // Pub/Sub for cache invalidation across instances
  async publishInvalidation(channel: string, keys: string[]): Promise<void> {
    await this.client.publish(`invalidate:${channel}`, JSON.stringify(keys));
  }

  subscribeToInvalidations(channel: string, callback: (keys: string[]) => void): void {
    const subscriber = this.client.duplicate();
    subscriber.subscribe(`invalidate:${channel}`);
    subscriber.on('message', (ch, message) => {
      if (ch === `invalidate:${channel}`) {
        callback(JSON.parse(message));
      }
    });
  }

  // Health check
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (err) {
      return false;
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

// Factory function
export function createRedisCacheService(config?: Partial<CacheConfig>): RedisCacheService {
  const defaultConfig: CacheConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'agrifinance:cache:',
    defaultTTL: 3600,
  };

  return new RedisCacheService({ ...defaultConfig, ...config });
}

export default RedisCacheService;
