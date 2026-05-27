/**
 * Form validation utilities for farmer data collection
 */

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export interface FarmerFormData {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  email?: string;
  nationalId?: string;
  address?: string;
  village?: string;
  district?: string;
  region?: string;
}

export interface FarmFormData {
  farmName: string;
  farmSize?: string;
  farmerId: string | number;
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone) return true; // Optional field
  // Allow various international formats
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  if (!email) return true; // Optional field
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate national ID format (alphanumeric, 5-20 characters)
 */
export function validateNationalId(id: string): boolean {
  if (!id) return true; // Optional field
  const idRegex = /^[A-Z0-9]{5,20}$/i;
  return idRegex.test(id);
}

/**
 * Validate farmer form data
 */
export function validateFarmerForm(data: FarmerFormData): ValidationResult {
  const errors: Record<string, string> = {};

  // Required fields
  if (!data.firstName || data.firstName.trim().length === 0) {
    errors.firstName = "First name is required";
  } else if (data.firstName.trim().length < 2) {
    errors.firstName = "First name must be at least 2 characters";
  }

  if (!data.lastName || data.lastName.trim().length === 0) {
    errors.lastName = "Last name is required";
  } else if (data.lastName.trim().length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  }

  // Optional but validated fields
  if (data.phoneNumber && !validatePhoneNumber(data.phoneNumber)) {
    errors.phoneNumber = "Please enter a valid phone number (at least 10 digits)";
  }

  if (data.email && !validateEmail(data.email)) {
    errors.email = "Please enter a valid email address";
  }

  if (data.nationalId && !validateNationalId(data.nationalId)) {
    errors.nationalId = "National ID must be 5-20 alphanumeric characters";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate farm form data
 */
export function validateFarmForm(data: FarmFormData): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.farmName || data.farmName.trim().length === 0) {
    errors.farmName = "Farm name is required";
  } else if (data.farmName.trim().length < 2) {
    errors.farmName = "Farm name must be at least 2 characters";
  }

  if (!data.farmerId || data.farmerId.toString().trim().length === 0) {
    errors.farmerId = "Please select a farmer";
  }

  if (data.farmSize) {
    const size = parseFloat(data.farmSize);
    if (isNaN(size) || size <= 0) {
      errors.farmSize = "Farm size must be a positive number";
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Calculate data completeness percentage for a farmer
 */
export function calculateFarmerCompleteness(farmer: Partial<FarmerFormData>): number {
  const fields = [
    'firstName',
    'lastName',
    'phoneNumber',
    'email',
    'nationalId',
    'address',
    'village',
    'district',
    'region',
  ];

  const filledFields = fields.filter(field => {
    const value = farmer[field as keyof FarmerFormData];
    return value && value.toString().trim().length > 0;
  });

  return Math.round((filledFields.length / fields.length) * 100);
}

/**
 * Get completeness badge variant based on percentage
 */
export function getCompletenessBadgeVariant(percentage: number): 'default' | 'secondary' | 'destructive' {
  if (percentage >= 80) return 'default';
  if (percentage >= 50) return 'secondary';
  return 'destructive';
}

/**
 * Get completeness label
 */
export function getCompletenessLabel(percentage: number): string {
  if (percentage >= 80) return 'Complete';
  if (percentage >= 50) return 'Partial';
  return 'Incomplete';
}
