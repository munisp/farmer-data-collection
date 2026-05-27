/**
 * Media Services
 * 
 * Provides image compression and upload management for low-bandwidth scenarios
 */

export { imageCompression, default } from './imageCompression';
export type {
  CompressionPreset,
  CompressionResult,
  CompressionSettings,
  PendingUpload,
  UploadProgress,
  BatchCompressionProgress,
} from './imageCompression';
