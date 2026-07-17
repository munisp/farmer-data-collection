/**
 * Design tokens for FarmConnect mobile app.
 * Centralizes all colors, spacing, typography, and elevation values.
 * Import these instead of using hardcoded hex values.
 */

export const colors = {
  // Primary palette (SmartAlex teal)
  primary: '#0d9488',
  primaryDark: '#0f766e',
  primaryLight: '#ccfbf1',

  // Secondary palette
  secondary: '#3b82f6',
  secondaryDark: '#2563eb',
  secondaryLight: '#dbeafe',

  // Neutral palette
  white: '#ffffff',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  black: '#000000',

  // Semantic colors
  success: '#0d9488',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // Background colors
  background: '#ffffff',
  backgroundSecondary: '#f9fafb',
  backgroundDark: '#1f2937',

  // Text colors
  text: '#1f2937',
  textSecondary: '#6b7280',
  textInverse: '#ffffff',
  textMuted: '#9ca3af',

  // Border colors
  border: '#e5e7eb',
  borderDark: '#d1d5db',
  divider: '#f3f4f6',

  // Status colors
  statusActive: '#0d9488',
  statusPending: '#f59e0b',
  statusInactive: '#9ca3af',
  statusDanger: '#ef4444',

  // Chart colors
  chart1: '#0d9488',
  chart2: '#3b82f6',
  chart3: '#f59e0b',
  chart4: '#ef4444',
  chart5: '#8b5cf6',
  chart6: '#06b6d4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  heading: 24,
  title: 28,
  hero: 32,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const elevation = {
  none: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

// Dark mode overrides
export const darkColors = {
  background: '#111827',
  backgroundSecondary: '#1f2937',
  text: '#f9fafb',
  textSecondary: '#d1d5db',
  textMuted: '#6b7280',
  border: '#374151',
  borderDark: '#4b5563',
  divider: '#1f2937',
  card: '#1f2937',
} as const;

export type ThemeColors = typeof colors;
export type DarkThemeColors = typeof darkColors;
