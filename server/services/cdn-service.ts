import { logger } from '../logger.js';
/**
 * CDN Service
 * 
 * Provides CDN URL transformation for S3 images
 * Supports CloudFront, Cloudflare, and custom CDN configurations
 */

export interface CDNConfig {
  enabled: boolean;
  provider: 'cloudfront' | 'cloudflare' | 'custom';
  domain: string;
  pathPrefix?: string;
  signUrls?: boolean;
  expirationSeconds?: number;
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  fit?: 'cover' | 'contain' | 'fill';
}

/**
 * Get CDN configuration from environment
 */
export function getCDNConfig(): CDNConfig {
  const enabled = process.env.CDN_ENABLED === 'true';
  const provider = (process.env.CDN_PROVIDER || 'cloudfront') as CDNConfig['provider'];
  const domain = process.env.CDN_DOMAIN || '';
  const pathPrefix = process.env.CDN_PATH_PREFIX || '';
  const signUrls = process.env.CDN_SIGN_URLS === 'true';
  const expirationSeconds = parseInt(process.env.CDN_EXPIRATION_SECONDS || '3600');

  return {
    enabled,
    provider,
    domain,
    pathPrefix,
    signUrls,
    expirationSeconds,
  };
}

/**
 * Transform S3 URL to CDN URL
 */
export function transformToCDN(s3Url: string, options?: ImageTransformOptions): string {
  const config = getCDNConfig();

  // If CDN is disabled, return original URL
  if (!config.enabled || !config.domain) {
    return s3Url;
  }

  try {
    const url = new URL(s3Url);
    
    // Extract the path from S3 URL
    // S3 URL format: https://bucket.s3.region.amazonaws.com/path/to/file
    // or: https://s3.region.amazonaws.com/bucket/path/to/file
    let path = url.pathname;
    
    // Remove leading slash
    if (path.startsWith('/')) {
      path = path.substring(1);
    }

    // Add path prefix if configured
    if (config.pathPrefix) {
      path = `${config.pathPrefix}/${path}`;
    }

    // Build CDN URL
    let cdnUrl = `https://${config.domain}/${path}`;

    // Add image transformation parameters based on provider
    if (options) {
      cdnUrl = addTransformParams(cdnUrl, options, config.provider);
    }

    return cdnUrl;
  } catch (error) {
    logger.error('[CDN] Error transforming URL:', error);
    return s3Url; // Fallback to original URL
  }
}

/**
 * Add image transformation parameters based on CDN provider
 */
function addTransformParams(
  url: string,
  options: ImageTransformOptions,
  provider: CDNConfig['provider']
): string {
  const urlObj = new URL(url);

  switch (provider) {
    case 'cloudfront':
      // CloudFront with Lambda@Edge or CloudFront Functions
      // Example: ?w=800&h=600&q=85&f=webp
      if (options.width) urlObj.searchParams.set('w', options.width.toString());
      if (options.height) urlObj.searchParams.set('h', options.height.toString());
      if (options.quality) urlObj.searchParams.set('q', options.quality.toString());
      if (options.format) urlObj.searchParams.set('f', options.format);
      if (options.fit) urlObj.searchParams.set('fit', options.fit);
      break;

    case 'cloudflare':
      // Cloudflare Images
      // Example: /cdn-cgi/image/width=800,height=600,quality=85,format=webp/image.jpg
      const params: string[] = [];
      if (options.width) params.push(`width=${options.width}`);
      if (options.height) params.push(`height=${options.height}`);
      if (options.quality) params.push(`quality=${options.quality}`);
      if (options.format) params.push(`format=${options.format}`);
      if (options.fit) params.push(`fit=${options.fit}`);
      
      if (params.length > 0) {
        const path = urlObj.pathname;
        urlObj.pathname = `/cdn-cgi/image/${params.join(',')}${path}`;
      }
      break;

    case 'custom':
      // Custom CDN - use query parameters (most common)
      if (options.width) urlObj.searchParams.set('width', options.width.toString());
      if (options.height) urlObj.searchParams.set('height', options.height.toString());
      if (options.quality) urlObj.searchParams.set('quality', options.quality.toString());
      if (options.format) urlObj.searchParams.set('format', options.format);
      if (options.fit) urlObj.searchParams.set('fit', options.fit);
      break;
  }

  return urlObj.toString();
}

/**
 * Transform multiple S3 URLs to CDN URLs
 */
export function transformMultipleToCDN(
  s3Urls: string[],
  options?: ImageTransformOptions
): string[] {
  return s3Urls.map(url => transformToCDN(url, options));
}

/**
 * Get responsive image URLs (multiple sizes)
 */
export function getResponsiveImageUrls(s3Url: string): {
  thumbnail: string;
  small: string;
  medium: string;
  large: string;
  original: string;
} {
  return {
    thumbnail: transformToCDN(s3Url, { width: 150, height: 150, quality: 80, format: 'webp', fit: 'cover' }),
    small: transformToCDN(s3Url, { width: 400, quality: 85, format: 'webp' }),
    medium: transformToCDN(s3Url, { width: 800, quality: 85, format: 'webp' }),
    large: transformToCDN(s3Url, { width: 1200, quality: 85, format: 'webp' }),
    original: transformToCDN(s3Url),
  };
}

/**
 * Generate srcset attribute for responsive images
 */
export function generateSrcSet(s3Url: string): string {
  const sizes = [400, 800, 1200, 1600];
  const srcset = sizes
    .map(width => {
      const url = transformToCDN(s3Url, { width, quality: 85, format: 'webp' });
      return `${url} ${width}w`;
    })
    .join(', ');
  
  return srcset;
}

/**
 * Check if URL is already a CDN URL
 */
export function isCDNUrl(url: string): boolean {
  const config = getCDNConfig();
  if (!config.enabled || !config.domain) {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === config.domain;
  } catch (err) {
    return false;
  }
}

/**
 * Purge CDN cache for specific URLs
 * Note: Implementation depends on CDN provider API
 */
export async function purgeCDNCache(urls: string[]): Promise<void> {
  const config = getCDNConfig();
  
  if (!config.enabled) {
    logger.info('[CDN] Cache purge skipped - CDN disabled');
    return;
  }

  logger.info(`[CDN] Purging cache for ${urls.length} URLs`);

  switch (config.provider) {
    case 'cloudfront':
      await purgeCloudFrontCache(urls);
      break;
    case 'cloudflare':
      await purgeCloudflareCache(urls);
      break;
    case 'custom':
      await purgeCustomCDNCache(urls);
      break;
    default:
      logger.warn(`[CDN] Unknown provider: ${config.provider}`);
  }
}

/**
 * Purge CloudFront cache using AWS SDK
 */
async function purgeCloudFrontCache(urls: string[]): Promise<void> {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  
  if (!distributionId) {
    logger.warn('[CDN] CloudFront distribution ID not configured');
    return;
  }

  try {
    const { CloudFrontClient, CreateInvalidationCommand } = await import('@aws-sdk/client-cloudfront');
    
    const client = new CloudFrontClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    // Convert URLs to paths
    const paths = urls.map(url => {
      try {
        const urlObj = new URL(url);
        return urlObj.pathname;
      } catch (err) {
        return url;
      }
    });

    const command = new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `purge-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    });

    const response = await client.send(command);
    logger.info(`[CDN] CloudFront invalidation created: ${response.Invalidation?.Id}`);
  } catch (error) {
    logger.error('[CDN] CloudFront cache purge failed:', error);
  }
}

/**
 * Purge Cloudflare cache using Cloudflare API
 */
async function purgeCloudflareCache(urls: string[]): Promise<void> {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  
  if (!zoneId || !apiToken) {
    logger.warn('[CDN] Cloudflare credentials not configured');
    return;
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: urls }),
      }
    );

    const result = await response.json();
    
    if (result.success) {
      logger.info(`[CDN] Cloudflare cache purged for ${urls.length} URLs`);
    } else {
      logger.error('[CDN] Cloudflare cache purge failed:', result.errors);
    }
  } catch (error) {
    logger.error('[CDN] Cloudflare cache purge failed:', error);
  }
}

/**
 * Purge custom CDN cache using configured API endpoint
 */
async function purgeCustomCDNCache(urls: string[]): Promise<void> {
  const purgeEndpoint = process.env.CDN_PURGE_ENDPOINT;
  const purgeApiKey = process.env.CDN_PURGE_API_KEY;
  
  if (!purgeEndpoint) {
    logger.warn('[CDN] Custom CDN purge endpoint not configured');
    return;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (purgeApiKey) {
      headers['Authorization'] = `Bearer ${purgeApiKey}`;
    }

    const response = await fetch(purgeEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ urls }),
    });

    if (response.ok) {
      logger.info(`[CDN] Custom CDN cache purged for ${urls.length} URLs`);
    } else {
      logger.error('[CDN] Custom CDN cache purge failed:', response.statusText);
    }
  } catch (error) {
    logger.error('[CDN] Custom CDN cache purge failed:', error);
  }
}

/**
 * Get CDN statistics (if available)
 */
export function getCDNStats(): {
  enabled: boolean;
  provider: string;
  domain: string;
} {
  const config = getCDNConfig();
  return {
    enabled: config.enabled,
    provider: config.provider,
    domain: config.domain || 'Not configured',
  };
}
