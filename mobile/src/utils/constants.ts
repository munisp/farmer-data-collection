import Constants from 'expo-constants';

// API Configuration
export const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://farmerplatform.com/api';
export const TRPC_URL = `${API_URL}/trpc`;

// App Configuration
export const APP_NAME = 'Farmer Data Collection';
export const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_DATA: 'user_data',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  LAST_SYNC: 'last_sync',
  THEME: 'theme',
} as const;

// Database Configuration
export const DB_NAME = 'farmer_data.db';
export const DB_VERSION = 1;

// Sync Configuration
export const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 5000; // 5 seconds

// Image Configuration
export const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
export const MAX_IMAGE_WIDTH = 1920;
export const MAX_IMAGE_HEIGHT = 1080;
export const IMAGE_QUALITY = 0.8;

// Pagination
export const PAGE_SIZE = 20;

// Colors (matching web platform)
export const COLORS = {
  primary: '#10b981',
  primaryDark: '#059669',
  secondary: '#3b82f6',
  background: '#ffffff',
  backgroundDark: '#1f2937',
  text: '#1f2937',
  textLight: '#6b7280',
  textDark: '#ffffff',
  border: '#e5e7eb',
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  info: '#3b82f6',
} as const;

// Crop Types
export const CROP_TYPES = [
  'Wheat',
  'Rice',
  'Corn',
  'Soybeans',
  'Cotton',
  'Barley',
  'Oats',
  'Sorghum',
  'Vegetables',
  'Fruits',
  'Other',
] as const;

// Units
export const UNITS = ['kg', 'tons', 'lbs', 'bushels', 'bags'] as const;

// Expense Categories
export const EXPENSE_CATEGORIES = [
  'Seeds',
  'Fertilizers',
  'Pesticides',
  'Labor',
  'Equipment',
  'Fuel',
  'Maintenance',
  'Utilities',
  'Insurance',
  'Other',
] as const;

// Notification Types
export const NOTIFICATION_TYPES = {
  HARVEST_REMINDER: 'harvest_reminder',
  PRICE_ALERT: 'price_alert',
  MARKETPLACE_UPDATE: 'marketplace_update',
  SYNC_COMPLETE: 'sync_complete',
  SYNC_ERROR: 'sync_error',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  AUTH_ERROR: 'Authentication failed. Please login again.',
  SYNC_ERROR: 'Sync failed. Your data will be synced when online.',
  CAMERA_ERROR: 'Camera access denied. Please enable in settings.',
  LOCATION_ERROR: 'Location access denied. Please enable in settings.',
  BIOMETRIC_ERROR: 'Biometric authentication failed.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
} as const;
