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

// Title Case, mirroring the learners_profiles_gender_check / profiles_gender_check
// domain (20260820160000). Lists in this file do NOT share one casing convention:
// RELIGION/COMMUNITY/etc. remain UPPERCASE, which is why the validators below match
// case-insensitively and return the canonical spelling rather than an uppercased input.
export const GENDER_VALUES = ['Male', 'Female', 'Other'] as const;

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
 * @param allowedValues - Array of allowed values, in their canonical spelling
 * @param fieldName - Name of the field for error messages
 * @param required - Whether the field is required (default: false)
 * @returns Validation result with normalized value or error
 *
 * @example
 * // Accepts any case
 * validateDropdownValue('male', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: true, normalizedValue: 'Male' }
 *
 * validateDropdownValue('Male', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: true, normalizedValue: 'Male' }
 *
 * validateDropdownValue('MALE', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: true, normalizedValue: 'Male' }
 *
 * validateDropdownValue('XYZ', GENDER_VALUES, 'Gender', true)
 * // Returns: { valid: false, error: 'Invalid Gender: "XYZ". Valid options: Male, Female, Other' }
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

  // Match case-insensitively and return the canonical spelling FROM THE LIST.
  // Uppercasing the input and returning that only works while every list is UPPERCASE;
  // GENDER_VALUES is Title Case, so 'male' -> 'MALE' would fail to match
  // ['Male','Female','Other'] and silently reject every gender in a bulk upload.
  const match = allowedValues.find(
    (allowed) => allowed.toUpperCase() === value.trim().toUpperCase()
  );

  if (match) {
    return {
      valid: true,
      normalizedValue: match
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
 * Returns the canonical spelling if valid, undefined if invalid or empty
 *
 * @param value - The input value to normalize
 * @param allowedValues - Array of allowed values, in their canonical spelling
 * @returns The canonical value from allowedValues, or undefined
 *
 * @example
 * normalizeDropdownValue('male', GENDER_VALUES) // Returns: 'Male'
 * normalizeDropdownValue('XYZ', GENDER_VALUES)  // Returns: undefined
 * normalizeDropdownValue('', GENDER_VALUES)     // Returns: undefined
 */
export function normalizeDropdownValue(
  value: string | undefined | null,
  allowedValues: readonly string[]
): string | undefined {
  if (!value?.trim()) return undefined;

  const target = value.trim().toUpperCase();
  return allowedValues.find((allowed) => allowed.toUpperCase() === target);
}

// ============================================
// DISPLAY OPTIONS FOR UI (with proper capitalization)
// ============================================

export const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' }
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

export const QUOTA_OPTIONS = [
  { value: 'GOVERNMENT', label: 'Government Quota' },
  { value: 'GOVERNMENT 7.5%', label: 'Government 7.5% Quota' },
  { value: 'MANAGEMENT', label: 'Management Quota' }
] as const;

export const BOARD_OF_STUDY_OPTIONS = [
  { value: 'state_board', label: 'State Board' },
  { value: 'cbse', label: 'CBSE' },
  { value: 'icse', label: 'ICSE' },
  { value: 'matriculation', label: 'Matriculation' },
  { value: 'anglo_indian', label: 'Anglo Indian' },
  { value: 'others', label: 'Others' }
] as const;

export const SCHOLARSHIP_TYPE_OPTIONS = [
  { value: 'FIRST GRADUATE', label: 'First Graduate' },
  { value: 'PMS SCHOLARSHIP', label: 'PMS Scholarship' },
  { value: '7.5% SCHOLARSHIP', label: '7.5% Scholarship' },
  { value: 'NOT APPLICABLE', label: 'Not Applicable' }
] as const;

// Parent occupation categories. Derived from analysis of 4,445 father + 4,325
// mother values in learners_profiles (2026-05-19). Covers ~95-98% of existing
// distinct values when fuzzy-matched via the migration. The OTHER option
// triggers a conditional free-text input in the form so unique occupations are
// still captureable. Used for BOTH father_occupation and mother_occupation —
// homemaker fits both even though it's mostly mothers in practice.
export const OCCUPATION_OPTIONS = [
  { value: 'HOMEMAKER',           label: 'Homemaker',                                       tamil: 'இல்லத்தரசி' },
  { value: 'DAILY_WAGE_WORKER',   label: 'Daily Wage Worker (Coolie / Labour)',             tamil: 'கூலி வேலை' },
  { value: 'FARMER',              label: 'Farmer / Agriculture',                            tamil: 'விவசாயி' },
  { value: 'DRIVER',              label: 'Driver / Conductor',                              tamil: 'ஓட்டுநர்' },
  { value: 'BUSINESS',            label: 'Business / Self-Employed',                        tamil: 'சொந்த தொழில்' },
  { value: 'WEAVER',              label: 'Weaver / Textile Worker',                         tamil: 'நெசவாளர்' },
  { value: 'TAILOR',              label: 'Tailor',                                          tamil: 'தையற்காரர்' },
  { value: 'SKILLED_TRADE',       label: 'Skilled Trade (Mason / Electrician / Carpenter)', tamil: 'கைவினைஞர்' },
  { value: 'TEACHER',             label: 'Teacher / Professor',                             tamil: 'ஆசிரியர்' },
  { value: 'HEALTHCARE',          label: 'Healthcare (Nurse / Pharmacist)',                 tamil: 'சுகாதார பணி' },
  { value: 'GOVERNMENT_EMPLOYEE', label: 'Government Employee',                             tamil: 'அரசு பணியாளர்' },
  { value: 'PRIVATE_EMPLOYEE',    label: 'Private Employee',                                tamil: 'தனியார் பணியாளர்' },
  { value: 'ENGINEER',            label: 'Engineer / Professional',                         tamil: 'பொறியாளர்' },
  { value: 'DECEASED',            label: 'Deceased / Late',                                 tamil: 'காலமானார்' },
  { value: 'OTHER',               label: 'Other (specify)',                                 tamil: 'பிற' },
] as const;

export type OccupationCode = (typeof OCCUPATION_OPTIONS)[number]['value'];

// Helper: given a saved value, return the option that matches by VALUE.
// Returns undefined if no match — caller treats this as "needs OTHER + text".
export function findOccupationOption(saved: string | null | undefined) {
  if (!saved) return undefined;
  return OCCUPATION_OPTIONS.find((o) => o.value === saved.trim());
}
