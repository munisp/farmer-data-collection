/**
 * Image Compression Utility
 * 
 * Provides client-side image compression before uploading to S3
 * Reduces storage costs and improves load times
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1, where 1 is highest quality
  maxSizeMB?: number;
  outputFormat?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface CompressionResult {
  compressedFile: File;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  dataUrl: string;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.85,
  maxSizeMB: 2,
  outputFormat: 'image/jpeg',
};

/**
 * Compress an image file with configurable options
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Validate file is an image
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  // Load image
  const img = await loadImage(file);

  // Calculate new dimensions
  const { width, height } = calculateDimensions(
    img.width,
    img.height,
    opts.maxWidth,
    opts.maxHeight
  );

  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw image
  ctx.drawImage(img, 0, 0, width, height);

  // Convert to blob with compression
  const blob = await canvasToBlob(canvas, opts.outputFormat, opts.quality);

  // If still too large, reduce quality further
  let finalBlob = blob;
  let currentQuality = opts.quality;
  const maxSizeBytes = opts.maxSizeMB * 1024 * 1024;

  while (finalBlob.size > maxSizeBytes && currentQuality > 0.1) {
    currentQuality -= 0.1;
    finalBlob = await canvasToBlob(canvas, opts.outputFormat, currentQuality);
  }

  // Convert blob to file
  const compressedFile = new File(
    [finalBlob],
    file.name.replace(/\.[^.]+$/, getExtension(opts.outputFormat)),
    { type: opts.outputFormat }
  );

  // Get data URL for preview
  const dataUrl = await blobToDataUrl(finalBlob);

  return {
    compressedFile,
    originalSize: file.size,
    compressedSize: compressedFile.size,
    compressionRatio: (1 - compressedFile.size / file.size) * 100,
    dataUrl,
  };
}

/**
 * Load image from file
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Calculate new dimensions maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth;
  let height = originalHeight;

  // Scale down if needed
  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = (width * maxHeight) / height;
    height = maxHeight;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Convert canvas to blob
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      type,
      quality
    );
  });
}

/**
 * Convert blob to data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Get file extension for mime type
 */
function getExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return map[mimeType] || '.jpg';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
