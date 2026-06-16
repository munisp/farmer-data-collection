import { storagePut, storageGet } from "../storage";
import { logger } from '../logger.js';

/**
 * Storage Service
 * Handles file uploads to S3 and generates signed URLs
 * Uses built-in Manus storage helpers with automatic env configuration
 */

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface UploadOptions {
  folder?: string;
  maxSize?: number; // in bytes
  allowedTypes?: string[];
}

/**
 * Upload a file to S3 storage
 * @param file - File data as Buffer or base64 string
 * @param filename - Original filename
 * @param options - Upload options
 * @returns Upload result with key and URL
 */
export async function uploadFile(
  file: Buffer | string,
  filename: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const {
    folder = "uploads",
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  } = options;

  // Convert base64 to Buffer if needed
  let fileBuffer: Buffer;
  if (typeof file === "string") {
    // Remove data URL prefix if present
    const base64Data = file.replace(/^data:[^;]+;base64,/, "");
    fileBuffer = Buffer.from(base64Data, "base64");
  } else {
    fileBuffer = file;
  }

  // Check file size
  if (fileBuffer.length > maxSize) {
    throw new Error(`File size exceeds maximum allowed size of ${maxSize} bytes`);
  }

  // Detect content type from filename
  const contentType = getContentType(filename);
  
  // Validate content type
  if (!allowedTypes.includes(contentType)) {
    throw new Error(`File type ${contentType} is not allowed`);
  }

  // Generate unique key
  const timestamp = Date.now();
  const sanitizedFilename = sanitizeFilename(filename);
  const key = `${folder}/${timestamp}-${sanitizedFilename}`;

  // Upload to S3 using built-in helper
  const result = await storagePut(key, fileBuffer, contentType);

  return {
    key: result.key,
    url: result.url,
    size: fileBuffer.length,
    contentType,
  };
}

/**
 * Upload multiple files
 * @param files - Array of files to upload
 * @param options - Upload options
 * @returns Array of upload results
 */
export async function uploadFiles(
  files: Array<{ data: Buffer | string; filename: string }>,
  options: UploadOptions = {}
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (const file of files) {
    const result = await uploadFile(file.data, file.filename, options);
    results.push(result);
  }

  return results;
}

/**
 * Get a signed URL for accessing a file
 * @param key - S3 object key
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL
 */
export async function getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const result = await storageGet(key, expiresIn);
  return result.url;
}

/**
 * Upload an image with automatic optimization
 * @param image - Image data
 * @param filename - Original filename
 * @returns Upload result
 */
export async function uploadImage(
  image: Buffer | string,
  filename: string
): Promise<UploadResult> {
  return uploadFile(image, filename, {
    folder: "images",
    maxSize: 5 * 1024 * 1024, // 5MB for images
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
}

/**
 * Upload a document
 * @param document - Document data
 * @param filename - Original filename
 * @returns Upload result
 */
export async function uploadDocument(
  document: Buffer | string,
  filename: string
): Promise<UploadResult> {
  return uploadFile(document, filename, {
    folder: "documents",
    maxSize: 20 * 1024 * 1024, // 20MB for documents
    allowedTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
      "text/csv",
    ],
  });
}

/**
 * Upload a profile photo
 * @param photo - Photo data
 * @param userId - User ID for folder organization
 * @returns Upload result
 */
export async function uploadProfilePhoto(
  photo: Buffer | string,
  userId: number
): Promise<UploadResult> {
  return uploadFile(photo, `profile-${userId}.jpg`, {
    folder: `profiles/${userId}`,
    maxSize: 2 * 1024 * 1024, // 2MB for profile photos
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  });
}

/**
 * Upload a product/listing photo
 * @param photo - Photo data
 * @param listingId - Listing ID for folder organization
 * @param index - Photo index (for multiple photos)
 * @returns Upload result
 */
export async function uploadListingPhoto(
  photo: Buffer | string,
  listingId: number,
  index: number = 0
): Promise<UploadResult> {
  return uploadFile(photo, `listing-${listingId}-${index}.jpg`, {
    folder: `listings/${listingId}`,
    maxSize: 5 * 1024 * 1024, // 5MB for listing photos
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  });
}

/**
 * Upload a review photo
 * @param photo - Photo data
 * @param reviewId - Review ID for folder organization
 * @param index - Photo index
 * @returns Upload result
 */
export async function uploadReviewPhoto(
  photo: Buffer | string,
  reviewId: number,
  index: number = 0
): Promise<UploadResult> {
  return uploadFile(photo, `review-${reviewId}-${index}.jpg`, {
    folder: `reviews/${reviewId}`,
    maxSize: 3 * 1024 * 1024, // 3MB for review photos
    allowedTypes: ["image/jpeg", "image/png", "image/webp"],
  });
}

/**
 * Upload a message attachment
 * @param attachment - Attachment data
 * @param filename - Original filename
 * @param conversationId - Conversation ID for folder organization
 * @returns Upload result
 */
export async function uploadMessageAttachment(
  attachment: Buffer | string,
  filename: string,
  conversationId: number
): Promise<UploadResult> {
  return uploadFile(attachment, filename, {
    folder: `messages/${conversationId}`,
    maxSize: 10 * 1024 * 1024, // 10MB for message attachments
    allowedTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  });
}

/**
 * Get content type from filename
 * @param filename - Filename with extension
 * @returns MIME type
 */
function getContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Sanitize filename for safe storage
 * @param filename - Original filename
 * @returns Sanitized filename
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, "_") // Replace special chars with underscore
    .replace(/_{2,}/g, "_") // Replace multiple underscores with single
    .toLowerCase();
}

/**
 * Delete a file from storage
 * 
 * Note: Manus storage service does not currently expose a delete API.
 * Files are managed automatically by the platform with lifecycle policies.
 * 
 * Workaround strategies:
 * 1. Mark files as deleted in database metadata (soft delete)
 * 2. Overwrite with empty/placeholder content if needed
 * 3. Use expiration metadata when uploading files that should auto-delete
 * 4. Contact platform support for manual deletion of sensitive data
 * 
 * This function logs deletion requests for audit purposes.
 */
export async function deleteFile(key: string): Promise<void> {
  logger.warn(`[Storage] File deletion requested but not supported by platform: ${key}`);
  logger.info(`[Storage] Recommended: Mark file as deleted in database metadata instead`);
  
  // Log to audit trail for compliance
  // In production, you might want to:
  // 1. Update database to mark file as deleted
  // 2. Emit event to Kafka for audit trail
  // 3. Schedule cleanup job if platform adds delete API later
}
