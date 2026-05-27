import { z } from 'zod';

/**
 * Production-Ready Form Validation Schemas
 * Comprehensive validation for all key forms in the platform
 */

// Common validation patterns
const phoneRegex = /^\+?[1-9]\d{1,14}$/;
const nationalIdRegex = /^[A-Z0-9]{6,20}$/i;

// Reusable field schemas
export const phoneSchema = z.string()
  .min(10, 'Phone number must be at least 10 digits')
  .max(15, 'Phone number must be at most 15 digits')
  .regex(phoneRegex, 'Invalid phone number format');

export const emailSchema = z.string()
  .email('Invalid email address')
  .optional()
  .or(z.literal(''));

export const nationalIdSchema = z.string()
  .regex(nationalIdRegex, 'Invalid national ID format')
  .optional()
  .or(z.literal(''));

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
});

// Farmer Registration Schema
export const farmerRegistrationSchema = z.object({
  firstName: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be at most 50 characters'),
  lastName: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be at most 50 characters'),
  phone: phoneSchema,
  email: emailSchema,
  nationalId: nationalIdSchema,
  dateOfBirth: z.string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      const now = new Date();
      const age = now.getFullYear() - date.getFullYear();
      return age >= 18 && age <= 120;
    }, 'Farmer must be at least 18 years old'),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  village: z.string().min(2, 'Village is required'),
  district: z.string().min(2, 'District is required'),
  region: z.string().min(2, 'Region is required'),
  address: z.string().optional(),
  location: coordinateSchema.optional(),
});

export type FarmerRegistrationInput = z.infer<typeof farmerRegistrationSchema>;

// Farm Registration Schema
export const farmRegistrationSchema = z.object({
  name: z.string()
    .min(2, 'Farm name must be at least 2 characters')
    .max(100, 'Farm name must be at most 100 characters'),
  farmerId: z.string().optional(),
  size: z.number()
    .min(0.01, 'Farm size must be greater than 0')
    .max(100000, 'Farm size seems too large'),
  sizeUnit: z.enum(['hectares', 'acres', 'square_meters']),
  soilType: z.enum(['clay', 'sandy', 'loamy', 'silt', 'peat', 'chalk', 'mixed', 'unknown']).optional(),
  irrigationMethod: z.enum(['rainfed', 'drip', 'sprinkler', 'flood', 'furrow', 'center_pivot', 'none']).optional(),
  village: z.string().min(2, 'Village is required'),
  district: z.string().min(2, 'District is required'),
  region: z.string().optional(),
  location: coordinateSchema.optional(),
  crops: z.array(z.string()).optional(),
  notes: z.string().max(1000, 'Notes must be at most 1000 characters').optional(),
});

export type FarmRegistrationInput = z.infer<typeof farmRegistrationSchema>;

// Farm Boundary Schema
export const farmBoundarySchema = z.object({
  farmId: z.number().int().positive(),
  name: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  boundaryType: z.enum(['manual', 'gps_walk', 'imported', 'satellite']).default('manual'),
  captureMethod: z.enum(['smartphone', 'rtk_rover', 'survey', 'imported']).default('smartphone'),
  points: z.array(coordinateSchema).min(3, 'Boundary must have at least 3 points'),
  averageAccuracyM: z.number().min(0).optional(),
  isRtkCalibrated: z.boolean().default(false),
});

export type FarmBoundaryInput = z.infer<typeof farmBoundarySchema>;

// Harvest Record Schema
export const harvestRecordSchema = z.object({
  cropType: z.string().min(2, 'Crop type is required'),
  quantity: z.number()
    .min(0.01, 'Quantity must be greater than 0')
    .max(1000000, 'Quantity seems too large'),
  unit: z.enum(['kg', 'tonnes', 'bags', 'bunches', 'pieces', 'liters']),
  harvestDate: z.string().refine((val) => {
    const date = new Date(val);
    const now = new Date();
    return date <= now;
  }, 'Harvest date cannot be in the future'),
  farmId: z.string().optional(),
  location: coordinateSchema.optional(),
  quality: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
  notes: z.string().max(500).optional(),
  photoUri: z.string().url().optional().or(z.literal('')),
});

export type HarvestRecordInput = z.infer<typeof harvestRecordSchema>;

// Expense Record Schema
export const expenseRecordSchema = z.object({
  category: z.enum([
    'seeds', 'fertilizer', 'pesticides', 'labor', 'equipment',
    'fuel', 'irrigation', 'transport', 'storage', 'marketing', 'other'
  ]),
  amount: z.number()
    .min(0.01, 'Amount must be greater than 0')
    .max(10000000, 'Amount seems too large'),
  currency: z.string().default('KES'),
  description: z.string().max(500).optional(),
  expenseDate: z.string().refine((val) => {
    const date = new Date(val);
    const now = new Date();
    return date <= now;
  }, 'Expense date cannot be in the future'),
  farmId: z.string().optional(),
  receiptUri: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(500).optional(),
});

export type ExpenseRecordInput = z.infer<typeof expenseRecordSchema>;

// Loan Application Schema
export const loanApplicationSchema = z.object({
  farmerId: z.string().optional(),
  farmerName: z.string().min(2, 'Farmer name is required'),
  farmerPhone: phoneSchema,
  amount: z.number()
    .min(1000, 'Minimum loan amount is 1,000')
    .max(10000000, 'Maximum loan amount is 10,000,000'),
  purpose: z.enum([
    'seeds', 'fertilizer', 'equipment', 'irrigation', 'land_preparation',
    'labor', 'storage', 'marketing', 'livestock', 'other'
  ]),
  purposeDetails: z.string().max(500).optional(),
  termMonths: z.number()
    .int()
    .min(1, 'Minimum term is 1 month')
    .max(60, 'Maximum term is 60 months'),
  repaymentFrequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'harvest']),
  collateralType: z.enum(['land', 'equipment', 'livestock', 'crops', 'savings', 'none']).optional(),
  collateralValue: z.number().min(0).optional(),
  farmId: z.string().optional(),
  cropType: z.string().optional(),
  expectedHarvestDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export type LoanApplicationInput = z.infer<typeof loanApplicationSchema>;

// KYC Verification Schema
export const kycVerificationSchema = z.object({
  farmerId: z.string(),
  documentType: z.enum(['national_id', 'passport', 'drivers_license', 'voter_id']),
  documentNumber: z.string().min(5, 'Document number is required'),
  documentFrontUri: z.string().url('Front image is required'),
  documentBackUri: z.string().url().optional(),
  selfieUri: z.string().url('Selfie is required'),
  dateOfBirth: z.string(),
  fullName: z.string().min(2, 'Full name is required'),
  address: z.string().min(5, 'Address is required'),
  consentGiven: z.boolean().refine((val) => val === true, 'You must consent to verification'),
});

export type KycVerificationInput = z.infer<typeof kycVerificationSchema>;

// Login Schema
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// Registration Schema
export const registrationSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: phoneSchema,
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  role: z.enum(['farmer', 'agent', 'admin', 'lender']).default('farmer'),
  acceptTerms: z.boolean().refine((val) => val === true, 'You must accept the terms'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

// GPS Point Schema for boundary capture
export const gpsPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0),
  timestamp: z.number(),
  altitude: z.number().optional(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  fixStatus: z.enum(['rtk_fixed', 'rtk_float', 'dgps', 'autonomous', 'no_fix']).optional(),
});

export type GpsPointInput = z.infer<typeof gpsPointSchema>;

// Validation helper functions
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors: Record<string, string> = {};
  result.error.issues.forEach((err) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });
  
  return { success: false, errors };
}

export function getFieldError(errors: Record<string, string> | undefined, field: string): string | undefined {
  return errors?.[field];
}

export default {
  farmerRegistrationSchema,
  farmRegistrationSchema,
  farmBoundarySchema,
  harvestRecordSchema,
  expenseRecordSchema,
  loanApplicationSchema,
  kycVerificationSchema,
  loginSchema,
  registrationSchema,
  gpsPointSchema,
  validateForm,
  getFieldError,
};
