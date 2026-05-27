import { describe, it, expect, beforeEach } from 'vitest';
import { compressImage, formatFileSize } from '../lib/imageCompression';

/**
 * Test suite for image compression utility
 * Tests client-side image compression before S3 upload
 */

describe('Image Compression Utility', () => {
  // Create a mock image file for testing
  function createMockImageFile(width: number, height: number, size: number): File {
    // Create a canvas with specified dimensions
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Fill with a simple pattern
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, width / 2, height / 2);
      ctx.fillStyle = '#00ff00';
      ctx.fillRect(width / 2, 0, width / 2, height / 2);
      ctx.fillStyle = '#0000ff';
      ctx.fillRect(0, height / 2, width / 2, height / 2);
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(width / 2, height / 2, width / 2, height / 2);
    }
    
    // Convert to blob and then to file
    const dataUrl = canvas.toDataURL('image/png');
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], 'test-image.png', { type: mime });
  }

  describe('compressImage', () => {
    it('should compress large image to smaller size', async () => {
      const file = createMockImageFile(3000, 2000, 0);
      
      const result = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
        quality: 0.85,
      });

      expect(result.compressedFile).toBeDefined();
      expect(result.compressedSize).toBeLessThan(result.originalSize);
      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it('should maintain aspect ratio when resizing', async () => {
      const file = createMockImageFile(2000, 1000, 0); // 2:1 aspect ratio
      
      const result = await compressImage(file, {
        maxWidth: 1000,
        maxHeight: 1000,
      });

      // Image should be scaled to 1000x500 to maintain 2:1 ratio
      expect(result.compressedFile).toBeDefined();
    });

    it('should convert to JPEG format by default', async () => {
      const file = createMockImageFile(500, 500, 0);
      
      const result = await compressImage(file);

      expect(result.compressedFile.type).toBe('image/jpeg');
      expect(result.compressedFile.name).toMatch(/\.jpg$/);
    });

    it('should respect custom output format', async () => {
      const file = createMockImageFile(500, 500, 0);
      
      const result = await compressImage(file, {
        outputFormat: 'image/webp',
      });

      expect(result.compressedFile.type).toBe('image/webp');
      expect(result.compressedFile.name).toMatch(/\.webp$/);
    });

    it('should return data URL for preview', async () => {
      const file = createMockImageFile(500, 500, 0);
      
      const result = await compressImage(file);

      expect(result.dataUrl).toBeDefined();
      expect(result.dataUrl).toMatch(/^data:image\//);
    });

    it('should reduce quality if file exceeds maxSizeMB', async () => {
      const file = createMockImageFile(2000, 2000, 0);
      
      const result = await compressImage(file, {
        maxSizeMB: 0.1, // Very small limit
        quality: 0.9,
      });

      expect(result.compressedFile).toBeDefined();
      expect(result.compressedSize).toBeLessThan(0.1 * 1024 * 1024 * 1.1); // Allow 10% margin
    });

    it('should reject non-image files', async () => {
      const textFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      
      await expect(compressImage(textFile)).rejects.toThrow('File must be an image');
    });

    it('should not upscale small images', async () => {
      const file = createMockImageFile(500, 500, 0);
      
      const result = await compressImage(file, {
        maxWidth: 1920,
        maxHeight: 1080,
      });

      // Small image should not be upscaled
      expect(result.compressedFile).toBeDefined();
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(1572864)).toBe('1.5 MB');
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });

    it('should handle large numbers', () => {
      const result = formatFileSize(5 * 1024 * 1024 * 1024); // 5 GB
      expect(result).toContain('GB');
    });

    it('should round to 2 decimal places', () => {
      const result = formatFileSize(1234567);
      expect(result).toBe('1.18 MB');
    });
  });
});
