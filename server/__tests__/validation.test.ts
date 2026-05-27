import { describe, it, expect } from 'vitest';
import {
  validatePhoneNumber,
  validateEmail,
  validateNationalId,
  validateFarmerForm,
  validateFarmForm,
  calculateFarmerCompleteness,
  getCompletenessBadgeVariant,
  getCompletenessLabel,
} from '../../client/src/lib/validation';

describe('Data Validation', () => {
  describe('validatePhoneNumber', () => {
    it('should validate correct phone numbers', () => {
      expect(validatePhoneNumber('+1234567890')).toBe(true);
      expect(validatePhoneNumber('123-456-7890')).toBe(true);
      expect(validatePhoneNumber('(123) 456-7890')).toBe(true);
      expect(validatePhoneNumber('+1 (234) 567-8900')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhoneNumber('123')).toBe(false); // Too short
      expect(validatePhoneNumber('abcdefghij')).toBe(false); // Non-numeric
    });

    it('should allow empty phone number (optional field)', () => {
      expect(validatePhoneNumber('')).toBe(true);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name+tag@example.co.uk')).toBe(true);
      expect(validateEmail('user_name@example-domain.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
    });

    it('should allow empty email (optional field)', () => {
      expect(validateEmail('')).toBe(true);
    });
  });

  describe('validateNationalId', () => {
    it('should validate correct national IDs', () => {
      expect(validateNationalId('ID123456')).toBe(true);
      expect(validateNationalId('ABC12345678901234567')).toBe(true);
      expect(validateNationalId('12345')).toBe(true);
    });

    it('should reject invalid national IDs', () => {
      expect(validateNationalId('123')).toBe(false); // Too short
      expect(validateNationalId('TOOLONGID123456789012345')).toBe(false); // Too long
    });

    it('should allow empty national ID (optional field)', () => {
      expect(validateNationalId('')).toBe(true);
    });
  });

  describe('validateFarmerForm', () => {
    it('should validate complete and valid farmer data', () => {
      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        nationalId: 'ID123456',
        address: '123 Main St',
        village: 'Test Village',
        district: 'Test District',
        region: 'Test Region',
      };

      const result = validateFarmerForm(validData);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('should detect missing required fields', () => {
      const invalidData = {
        firstName: '',
        lastName: '',
      };

      const result = validateFarmerForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.firstName).toBeTruthy();
      expect(result.errors.lastName).toBeTruthy();
    });

    it('should detect too short names', () => {
      const invalidData = {
        firstName: 'J',
        lastName: 'D',
      };

      const result = validateFarmerForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.firstName).toContain('at least 2 characters');
      expect(result.errors.lastName).toContain('at least 2 characters');
    });

    it('should detect invalid phone number format', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '123',
      };

      const result = validateFarmerForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.phoneNumber).toBeTruthy();
    });

    it('should detect invalid email format', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
      };

      const result = validateFarmerForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.email).toBeTruthy();
    });

    it('should detect invalid national ID format', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        nationalId: '123',
      };

      const result = validateFarmerForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.nationalId).toBeTruthy();
    });
  });

  describe('validateFarmForm', () => {
    it('should validate complete and valid farm data', () => {
      const validData = {
        farmName: 'Green Acres Farm',
        farmSize: '10.5',
        farmerId: 1,
      };

      const result = validateFarmForm(validData);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('should detect missing required fields', () => {
      const invalidData = {
        farmName: '',
        farmerId: '',
      };

      const result = validateFarmForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.farmName).toBeTruthy();
      expect(result.errors.farmerId).toBeTruthy();
    });

    it('should detect invalid farm size', () => {
      const invalidData = {
        farmName: 'Test Farm',
        farmSize: '-5',
        farmerId: 1,
      };

      const result = validateFarmForm(invalidData);
      expect(result.isValid).toBe(false);
      expect(result.errors.farmSize).toBeTruthy();
    });
  });

  describe('calculateFarmerCompleteness', () => {
    it('should return 100% for complete data', () => {
      const completeData = {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
        nationalId: 'ID123456',
        address: '123 Main St',
        village: 'Test Village',
        district: 'Test District',
        region: 'Test Region',
      };

      expect(calculateFarmerCompleteness(completeData)).toBe(100);
    });

    it('should return partial percentage for incomplete data', () => {
      const partialData = {
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
      };

      const completeness = calculateFarmerCompleteness(partialData);
      expect(completeness).toBeGreaterThan(0);
      expect(completeness).toBeLessThan(100);
      expect(completeness).toBe(33); // 3 out of 9 fields
    });

    it('should return 22% for minimal data (only required fields)', () => {
      const minimalData = {
        firstName: 'John',
        lastName: 'Doe',
      };

      expect(calculateFarmerCompleteness(minimalData)).toBe(22); // 2 out of 9 fields
    });
  });

  describe('getCompletenessBadgeVariant', () => {
    it('should return default for high completeness', () => {
      expect(getCompletenessBadgeVariant(100)).toBe('default');
      expect(getCompletenessBadgeVariant(80)).toBe('default');
    });

    it('should return secondary for medium completeness', () => {
      expect(getCompletenessBadgeVariant(70)).toBe('secondary');
      expect(getCompletenessBadgeVariant(50)).toBe('secondary');
    });

    it('should return destructive for low completeness', () => {
      expect(getCompletenessBadgeVariant(49)).toBe('destructive');
      expect(getCompletenessBadgeVariant(0)).toBe('destructive');
    });
  });

  describe('getCompletenessLabel', () => {
    it('should return Complete for high completeness', () => {
      expect(getCompletenessLabel(100)).toBe('Complete');
      expect(getCompletenessLabel(80)).toBe('Complete');
    });

    it('should return Partial for medium completeness', () => {
      expect(getCompletenessLabel(70)).toBe('Partial');
      expect(getCompletenessLabel(50)).toBe('Partial');
    });

    it('should return Incomplete for low completeness', () => {
      expect(getCompletenessLabel(49)).toBe('Incomplete');
      expect(getCompletenessLabel(0)).toBe('Incomplete');
    });
  });
});
