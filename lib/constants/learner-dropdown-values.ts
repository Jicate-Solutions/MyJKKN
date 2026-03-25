// ============================================
// LEARNER DROPDOWN VALUES CONSTANTS
// ============================================
// Created: 2025-12-27
// Purpose: Central source of truth for all learner dropdown field values
// Usage: Import and use for validation in bulk upload, manual forms, and API
// ============================================

// ============================================
// DROPDOWN VALUE CONSTANTS (Database format - UPPERCASE)
// ============================================

export const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'] as const;

export const RELIGION_VALUES = [
  'HINDU',
  'CHRISTIAN',
  'MUSLIM',
  'OTHERS',
  'SIKH',
  'BUDDHIST',
  'JAIN'
] as const;

export const COMMUNITY_VALUES = [
  'OC',
  'BC',
  'BCM',
  'MBC',
  'DNC',
  'BC-CC',
  'SC',
  'ST',
  'SBC',
  'SC (A)'
] as const;

export const BLOOD_GROUP_VALUES = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'A1+',
  'A1B'
] as const;

export const ENTRY_TYPE_VALUES = [
  'FIRST YEAR',
  'LATERAL ENTRY',
  'RE-ADMISSION',
  'COLLEGE TRANSFER'
] as const;

export const ACCOMMODATION_VALUES = [
  'HOSTEL',
  'DAY SCHOLAR',
  'HOME'
] as const;

export const HOSTEL_TYPE_VALUES = [
  'AC HOSTEL',
  'NON-AC HOSTEL'
] as const;

export const FOOD_TYPE_VALUES = [
  'VEG',
  'NON-VEG',
  'VEGAN'
] as const;

export const QUOTA_VALUES = [
  'GOVERNMENT',
  'GOVERNMENT 7.5%',
  'MANAGEMENT'
] as const;

export const SCHOLARSHIP_TYPE_VALUES = [
  'FIRST GRADUATE',
  'PMS SCHOLARSHIP',
  '7.5% SCHOLARSHIP',
  'NOT APPLICABLE'
] as const;

// ============================================
// TYPESCRIPT TYPES
// ============================================

export type Gender = typeof GENDER_VALUES[number];
export type Religion = typeof RELIGION_VALUES[number];
export type Community = typeof COMMUNITY_VALUES[number];
export type BloodGroup = typeof BLOOD_GROUP_VALUES[number];
export type EntryType = typeof ENTRY_TYPE_VALUES[number];
export type AccommodationType = typeof ACCOMMODATION_VALUES[number];
export type HostelType = typeof HOSTEL_TYPE_VALUES[number];
export type FoodType = typeof FOOD_TYPE_VALUES[number];
export type Quota = typeof QUOTA_VALUES[number];
export type ScholarshipType = typeof SCHOLARSHIP_TYPE_VALUES[number];

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Validation result interface
 */
export interface DropdownValidationResult {
  valid: boolean;
  normalizedValue?: string;
  error?: string;
}

/**
 * Validates and normalizes dropdown values with case-insensitive matching
 *
 * @param value - The input value to validate (can be any case)
 * @param allowedValues - Array of allowed values (UPPERCASE format)
 * @param fieldName - Name of the field for error messages
 * @param required - Whether the field is required (default: false)
 * @returns Validation result with normalized value or error
 *
 * @example
 * // Accepts any case
 * validateDropdownValue('male', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: true, normalizedValue: 'MALE' }
 *
 * validateDropdownValue('Male', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: true, normalizedValue: 'MALE' }
 *
 * validateDropdownValue('MALE', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: true, normalizedValue: 'MALE' }
 *
 * validateDropdownValue('XYZ', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: false, error: 'Invalid Gender: "XYZ". Valid options: MALE, FEMALE, OTHER' }
 */
export function validateDropdownValue<T extends readonly string[]>(
  value: string | undefined | null,
  allowedValues: T,
  fieldName: string,
  required: boolean = false
): DropdownValidationResult {
  // Handle empty values
  if (!value?.trim()) {
    if (required) {
      return {
        valid: false,
        error: `${fieldName} is required`
      };
    }
    return {
      valid: true,
      normalizedValue: undefined
    };
  }

  // Normalize to UPPERCASE for comparison
  const normalized = value.trim().toUpperCase();

  // Validate against allowed values
  if (allowedValues.includes(normalized as any)) {
    return {
      valid: true,
      normalizedValue: normalized
    };
  }

  // Invalid value - provide clear error with valid options
  const validOptions = allowedValues.join(', ');
  return {
    valid: false,
    error: `Invalid ${fieldName}: "${value}". Valid options: ${validOptions}`
  };
}

/**
 * Normalizes dropdown value without throwing errors (for API processing)
 * Returns normalized UPPERCASE value if valid, undefined if invalid or empty
 *
 * @param value - The input value to normalize
 * @param allowedValues - Array of allowed values (UPPERCASE format)
 * @returns Normalized UPPERCASE value or undefined
 *
 * @example
 * normalizeDropdownValue('male', GENDER_VALUES) // Returns: 'MALE'
 * normalizeDropdownValue('XYZ', GENDER_VALUES)  // Returns: undefined
 * normalizeDropdownValue('', GENDER_VALUES)     // Returns: undefined
 */
export function normalizeDropdownValue(
  value: string | undefined | null,
  allowedValues: readonly string[]
): string | undefined {
  if (!value?.trim()) return undefined;

  const normalized = value.trim().toUpperCase();
  return allowedValues.includes(normalized as any) ? normalized : undefined;
}

// ============================================
// DISPLAY OPTIONS FOR UI (with proper capitalization)
// ============================================

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' }
] as const;

export const RELIGION_OPTIONS = [
  { value: 'HINDU', label: 'Hindu' },
  { value: 'CHRISTIAN', label: 'Christian' },
  { value: 'MUSLIM', label: 'Muslim' },
  { value: 'SIKH', label: 'Sikh' },
  { value: 'BUDDHIST', label: 'Buddhist' },
  { value: 'JAIN', label: 'Jain' },
  { value: 'OTHERS', label: 'Others' }
] as const;

export const COMMUNITY_OPTIONS = [
  { value: 'OC', label: 'OC (Open Category)' },
  { value: 'BC', label: 'BC (Backward Class)' },
  { value: 'BCM', label: 'BCM' },
  { value: 'MBC', label: 'MBC (Most Backward Class)' },
  { value: 'DNC', label: 'DNC' },
  { value: 'BC-CC', label: 'BC-CC' },
  { value: 'SC', label: 'SC (Scheduled Caste)' },
  { value: 'ST', label: 'ST (Scheduled Tribe)' },
  { value: 'SBC', label: 'SBC' },
  { value: 'SC (A)', label: 'SC (A)' }
] as const;

export const BLOOD_GROUP_OPTIONS = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
  { value: 'A1+', label: 'A1+' },
  { value: 'A1B', label: 'A1B' }
] as const;

export const ENTRY_TYPE_OPTIONS = [
  { value: 'FIRST YEAR', label: 'First Year' },
  { value: 'LATERAL ENTRY', label: 'Lateral Entry' },
  { value: 'RE-ADMISSION', label: 'Re-Admission' },
  { value: 'COLLEGE TRANSFER', label: 'College Transfer' }
] as const;

export const ACCOMMODATION_OPTIONS = [
  { value: 'HOSTEL', label: 'Hostel' },
  { value: 'DAY SCHOLAR', label: 'Day Scholar' },
  { value: 'HOME', label: 'Home' }
] as const;

export const HOSTEL_TYPE_OPTIONS = [
  { value: 'AC HOSTEL', label: 'AC Hostel' },
  { value: 'NON-AC HOSTEL', label: 'Non-AC Hostel' }
] as const;

export const FOOD_TYPE_OPTIONS = [
  { value: 'VEG', label: 'Vegetarian' },
  { value: 'NON-VEG', label: 'Non-Vegetarian' },
  { value: 'VEGAN', label: 'Vegan' }
] as const;

export const QUOTA_OPTIONS = [
  { value: 'GOVERNMENT', label: 'Government Quota' },
  { value: 'GOVERNMENT 7.5%', label: 'Government 7.5% Quota' },
  { value: 'MANAGEMENT', label: 'Management Quota' }
] as const;

export const SCHOLARSHIP_TYPE_OPTIONS = [
  { value: 'FIRST GRADUATE', label: 'First Graduate' },
  { value: 'PMS SCHOLARSHIP', label: 'PMS Scholarship' },
  { value: '7.5% SCHOLARSHIP', label: '7.5% Scholarship' },
  { value: 'NOT APPLICABLE', label: 'Not Applicable' }
] as const;
