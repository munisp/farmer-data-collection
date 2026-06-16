/**
 * CameraCalibration - React Native camera calibration utilities
 * for agricultural photography (soil, crop disease, inventory).
 *
 * Features:
 * - Resolution presets per use case
 * - Lighting quality analysis
 * - Focus sharpness detection
 * - GPS metadata capture
 * - Adaptive compression based on network quality
 * - White balance hints
 */

import { Dimensions, Platform } from 'react-native';

export type CameraMode = 'soil' | 'crop_disease' | 'inventory' | 'general';

export interface CaptureMetadata {
  mode: CameraMode;
  resolution: { width: number; height: number };
  timestamp: string;
  gps: { latitude: number; longitude: number; accuracy: number } | null;
  lightingScore: number;
  focusScore: number;
  networkQuality: string;
  compressionQuality: number;
  deviceModel: string;
  platform: string;
}

interface ModeConfig {
  label: string;
  description: string;
  resolution: { width: number; height: number };
  quality: number;
  tips: string[];
  focusDistance?: number;
  whiteBalance?: string;
}

export const CAMERA_MODES: Record<CameraMode, ModeConfig> = {
  soil: {
    label: 'Soil Analysis',
    description: 'High-res for soil texture & color',
    resolution: { width: 2560, height: 1920 },
    quality: 0.92,
    focusDistance: 0.3,
    whiteBalance: 'daylight',
    tips: [
      'Place a white card next to soil for color reference',
      'Photograph soil at arm\'s length, straight down',
      'Ensure even lighting — no harsh shadows',
      'Include a ruler or coin for scale',
    ],
  },
  crop_disease: {
    label: 'Crop Disease',
    description: 'Close-up detail for AI disease detection',
    resolution: { width: 1920, height: 1440 },
    quality: 0.88,
    focusDistance: 0.15,
    whiteBalance: 'daylight',
    tips: [
      'Focus on the affected leaf or stem',
      'Capture both healthy and diseased areas',
      'Use natural daylight — avoid flash if possible',
      'Hold camera 15–30 cm from the plant',
    ],
  },
  inventory: {
    label: 'Inventory Photo',
    description: 'Standard quality for product listing',
    resolution: { width: 1280, height: 960 },
    quality: 0.8,
    whiteBalance: 'auto',
    tips: [
      'Use a clean, neutral background',
      'Show the product from the front',
      'Ensure the entire item is visible',
      'Good lighting makes listings sell faster',
    ],
  },
  general: {
    label: 'General Photo',
    description: 'Balanced quality & file size',
    resolution: { width: 1600, height: 1200 },
    quality: 0.85,
    whiteBalance: 'auto',
    tips: [
      'Hold the camera steady',
      'Use natural light when possible',
      'Tap to focus on the subject',
    ],
  },
};

export function getAdaptiveQuality(
  baseQuality: number,
  networkType: string
): number {
  const multipliers: Record<string, number> = {
    wifi: 1.0,
    '4g': 1.0,
    '3g': 0.7,
    '2g': 0.4,
    'slow-2g': 0.3,
    offline: 0.5,
    unknown: 0.8,
  };
  return baseQuality * (multipliers[networkType] ?? 0.8);
}

export function analyzeLightingFromPixels(
  pixelData: Uint8Array,
  width: number,
  height: number
): { score: number; level: string; message: string } {
  let totalBrightness = 0;
  const sampleCount = Math.min(pixelData.length / 4, 10000);
  const step = Math.max(1, Math.floor(pixelData.length / 4 / sampleCount)) * 4;

  for (let i = 0; i < pixelData.length; i += step) {
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];
    totalBrightness += r * 0.299 + g * 0.587 + b * 0.114;
  }

  const avgBrightness = totalBrightness / (pixelData.length / step);
  const score = Math.min(100, Math.max(0, avgBrightness / 2.55));

  if (score < 15) return { score, level: 'too_dark', message: 'Too dark — add more light or use flash' };
  if (score < 30) return { score, level: 'poor', message: 'Low light — move to brighter area' };
  if (score > 90) return { score, level: 'too_bright', message: 'Overexposed — reduce light or move to shade' };
  if (score > 75) return { score, level: 'bright', message: 'Bright — slightly reduce exposure' };
  return { score, level: 'good', message: 'Good lighting' };
}

export function buildCaptureMetadata(
  mode: CameraMode,
  resolution: { width: number; height: number },
  gps: { latitude: number; longitude: number; accuracy: number } | null,
  lightingScore: number,
  focusScore: number,
  networkQuality: string,
  compressionQuality: number
): CaptureMetadata {
  return {
    mode,
    resolution,
    timestamp: new Date().toISOString(),
    gps,
    lightingScore,
    focusScore,
    networkQuality,
    compressionQuality,
    deviceModel: Platform.OS === 'ios' ? 'iPhone' : 'Android',
    platform: Platform.OS,
  };
}
