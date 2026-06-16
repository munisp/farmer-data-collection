import axios, { AxiosError } from 'axios';
import { logger } from '../logger.js';

const GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://localhost:8080';

export interface ImageProcessRequest {
  imageUrl?: string;
  imageData?: string;
  operation: 'compress' | 'resize' | 'thumbnail' | 'watermark';
  width?: number;
  height?: number;
  quality?: number;
  watermarkText?: string;
}

export interface ImageProcessResponse {
  success: boolean;
  imageData?: string;
  message?: string;
  error?: string;
}

export class GoImageClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL?: string, timeout: number = 30000) {
    this.baseURL = baseURL || GO_IMAGE_SERVICE_URL;
    this.timeout = timeout;
  }

  /**
   * Generic image processing endpoint
   */
  async processImage(request: ImageProcessRequest): Promise<ImageProcessResponse> {
    try {
      const response = await axios.post<ImageProcessResponse>(
        `${this.baseURL}/api/image/process`,
        request,
        { timeout: this.timeout }
      );
      return response.data;
    } catch (error) {
      return this.handleError(error, 'Image processing failed');
    }
  }

  /**
   * Compress image with specified quality
   * @param imageData Base64 encoded image data
   * @param quality Quality level (1-100), default 75
   */
  async compressImage(imageData: string, quality: number = 75): Promise<string> {
    try {
      const response = await axios.post<ImageProcessResponse>(
        `${this.baseURL}/api/image/compress`,
        {
          imageData,
          operation: 'compress',
          quality
        },
        { timeout: this.timeout }
      );

      if (!response.data.success || !response.data.imageData) {
        throw new Error(response.data.error || 'Compression failed');
      }

      return response.data.imageData;
    } catch (error) {
      throw this.handleError(error, 'Image compression failed');
    }
  }

  /**
   * Resize image to specified dimensions
   * @param imageData Base64 encoded image data
   * @param width Target width
   * @param height Target height
   * @param quality Quality level (1-100), default 85
   */
  async resizeImage(
    imageData: string,
    width: number,
    height: number,
    quality: number = 85
  ): Promise<string> {
    try {
      const response = await axios.post<ImageProcessResponse>(
        `${this.baseURL}/api/image/resize`,
        {
          imageData,
          operation: 'resize',
          width,
          height,
          quality
        },
        { timeout: this.timeout }
      );

      if (!response.data.success || !response.data.imageData) {
        throw new Error(response.data.error || 'Resize failed');
      }

      return response.data.imageData;
    } catch (error) {
      throw this.handleError(error, 'Image resize failed');
    }
  }

  /**
   * Create thumbnail from image
   * @param imageData Base64 encoded image data
   * @param size Thumbnail size (width and height), default 200
   */
  async createThumbnail(imageData: string, size: number = 200): Promise<string> {
    try {
      const response = await axios.post<ImageProcessResponse>(
        `${this.baseURL}/api/image/thumbnail`,
        {
          imageData,
          operation: 'thumbnail',
          width: size,
          height: size
        },
        { timeout: this.timeout }
      );

      if (!response.data.success || !response.data.imageData) {
        throw new Error(response.data.error || 'Thumbnail creation failed');
      }

      return response.data.imageData;
    } catch (error) {
      throw this.handleError(error, 'Thumbnail creation failed');
    }
  }

  /**
   * Add watermark to image
   * @param imageData Base64 encoded image data
   * @param watermarkText Text to add as watermark
   */
  async addWatermark(imageData: string, watermarkText: string): Promise<string> {
    try {
      const response = await axios.post<ImageProcessResponse>(
        `${this.baseURL}/api/image/watermark`,
        {
          imageData,
          operation: 'watermark',
          watermarkText
        },
        { timeout: this.timeout }
      );

      if (!response.data.success || !response.data.imageData) {
        throw new Error(response.data.error || 'Watermark failed');
      }

      return response.data.imageData;
    } catch (error) {
      throw this.handleError(error, 'Watermark addition failed');
    }
  }

  /**
   * Process multiple images in batch
   * @param requests Array of image processing requests
   */
  async batchProcess(requests: ImageProcessRequest[]): Promise<ImageProcessResponse[]> {
    try {
      const response = await axios.post<ImageProcessResponse[]>(
        `${this.baseURL}/api/image/batch`,
        requests,
        { timeout: this.timeout * 2 } // Double timeout for batch operations
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Batch processing failed');
    }
  }

  /**
   * Optimize image for marketplace listing
   * - Compress to reduce file size
   * - Resize to standard dimensions (1200x900)
   * - Create thumbnail (300x300)
   * @param imageData Base64 encoded image data
   */
  async optimizeForMarketplace(imageData: string): Promise<{
    optimized: string;
    thumbnail: string;
  }> {
    try {
      const [optimized, thumbnail] = await Promise.all([
        this.resizeImage(imageData, 1200, 900, 80),
        this.createThumbnail(imageData, 300)
      ]);

      return { optimized, thumbnail };
    } catch (error) {
      throw this.handleError(error, 'Marketplace optimization failed');
    }
  }

  /**
   * Check if Go image service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, {
        timeout: 5000
      });
      return response.data.status === 'healthy';
    } catch (error) {
      logger.error('Go image service health check failed:', error);
      return false;
    }
  }

  /**
   * Handle errors from Go service
   */
  private handleError(error: unknown, defaultMessage: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ImageProcessResponse>;
      if (axiosError.response?.data?.error) {
        throw new Error(axiosError.response.data.error);
      }
      if (axiosError.code === 'ECONNREFUSED') {
        throw new Error('Go image service is not running');
      }
      if (axiosError.code === 'ETIMEDOUT') {
        throw new Error('Go image service timeout');
      }
    }
    
    logger.error('Go image service error:', error);
    throw new Error(defaultMessage);
  }
}

// Singleton instance
export const goImageClient = new GoImageClient();
