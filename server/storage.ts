/**
 * Storage Helper
 * Wrapper for S3 storage operations using environment-configured credentials
 * 
 * Environment variables required:
 * - S3_BUCKET: S3 bucket name
 * - S3_REGION: AWS region
 * - S3_ACCESS_KEY_ID: AWS access key
 * - S3_SECRET_ACCESS_KEY: AWS secret key
 * - S3_ENDPOINT: Optional custom endpoint (for MinIO, etc.)
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from './logger.js';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
});

const BUCKET_NAME = process.env.S3_BUCKET || "farmer-data-collection";
const CDN_URL = process.env.CDN_URL || ""; // Optional CDN URL

/**
 * Upload data to S3
 * @param key - S3 object key (path)
 * @param data - File data as Buffer
 * @param contentType - MIME type
 * @returns Object with key and URL
 */
export async function storagePut(
  key: string,
  data: Buffer,
  contentType?: string
): Promise<{ key: string; url: string }> {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: data,
      ContentType: contentType,
      ACL: "public-read", // Make files publicly accessible
    });

    await s3Client.send(command);

    // Generate public URL
    const url = CDN_URL
      ? `${CDN_URL}/${key}`
      : `https://${BUCKET_NAME}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com/${key}`;

    return { key, url };
  } catch (error) {
    logger.error("Storage upload error:", error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Get a signed URL for accessing a private file
 * @param key - S3 object key
 * @param expiresIn - URL expiration time in seconds
 * @returns Object with key and signed URL
 */
export async function storageGet(
  key: string,
  expiresIn: number = 3600
): Promise<{ key: string; url: string }> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    return { key, url };
  } catch (error) {
    logger.error("Storage get error:", error);
    throw new Error(`Failed to get file URL: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Check if storage is configured
 * @returns true if S3 credentials are set
 */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

/**
 * Get storage configuration status
 * @returns Configuration status object
 */
export function getStorageStatus() {
  return {
    configured: isStorageConfigured(),
    bucket: process.env.S3_BUCKET || "not-set",
    region: process.env.S3_REGION || "us-east-1",
    hasCDN: !!CDN_URL,
  };
}
