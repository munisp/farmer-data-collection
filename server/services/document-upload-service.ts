/**
 * Document Upload Service
 * 
 * Handles document uploads to S3 for loan applications
 * Integrates with the Manus S3 storage helpers
 */

import { storagePut, storageGet } from "../storage.js";
import { logger } from '../logger.js';

export interface UploadDocumentOptions {
  applicationId: number;
  userId: number;
  documentType: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
}

export interface UploadedDocument {
  s3Key: string;
  s3Url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export class DocumentUploadService {
  /**
   * Upload a document to S3
   */
  async uploadDocument(options: UploadDocumentOptions): Promise<UploadedDocument> {
    const { applicationId, userId, documentType, fileName, fileBuffer, mimeType } = options;

    // Generate unique S3 key
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `loan-applications/${applicationId}/${documentType}/${timestamp}-${sanitizedFileName}`;

    try {
      // Upload to S3 using Manus storage helper
      const result = await storagePut(s3Key, fileBuffer, mimeType);

      logger.info(`[DocumentUpload] Uploaded document: ${s3Key}`);

      return {
        s3Key: result.key,
        s3Url: result.url,
        fileName,
        fileSize: fileBuffer.length,
        mimeType,
      };
    } catch (error) {
      logger.error(`[DocumentUpload] Failed to upload document:`, error);
      throw new Error(`Failed to upload document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a presigned URL for viewing a document
   */
  async getDocumentUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const result = await storageGet(s3Key, expiresIn);
      return result.url;
    } catch (error) {
      logger.error(`[DocumentUpload] Failed to get document URL:`, error);
      throw new Error(`Failed to get document URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate document type
   */
  isValidDocumentType(documentType: string): boolean {
    const validTypes = [
      'id_card',
      'proof_of_address',
      'bank_statement',
      'farm_ownership',
      'income_proof',
      'passport_photo',
      'utility_bill',
      'tax_return',
      'other',
    ];
    return validTypes.includes(documentType);
  }

  /**
   * Validate file size (max 10MB)
   */
  isValidFileSize(fileSize: number): boolean {
    const maxSize = 10 * 1024 * 1024; // 10MB
    return fileSize <= maxSize;
  }

  /**
   * Validate MIME type
   */
  isValidMimeType(mimeType: string): boolean {
    const validMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/pdf',
      'image/webp',
    ];
    return validMimeTypes.includes(mimeType);
  }

  /**
   * Validate upload request
   */
  validateUpload(options: UploadDocumentOptions): { valid: boolean; error?: string } {
    if (!this.isValidDocumentType(options.documentType)) {
      return { valid: false, error: 'Invalid document type' };
    }

    if (!this.isValidFileSize(options.fileBuffer.length)) {
      return { valid: false, error: 'File size exceeds 10MB limit' };
    }

    if (!this.isValidMimeType(options.mimeType)) {
      return { valid: false, error: 'Invalid file type. Only JPEG, PNG, PDF, and WebP are allowed' };
    }

    return { valid: true };
  }
}

// Singleton instance
export const documentUploadService = new DocumentUploadService();
