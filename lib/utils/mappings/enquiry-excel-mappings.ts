/**
 * Enquiry Excel Field Mappings
 *
 * This module provides mappings for Excel import/export of enquiries.
 * Most enum fields use direct values from learner-dropdown-values.ts
 *
 * ENUM FIELDS:
 * - Gender: Male, Female, Other
 * - Religion: Hindu, Christian, Muslim, etc.
 * - Community: OC, BC, BCM, MBC, etc.
 * - Entry Type: First Year, Lateral Entry, etc.
 * - Scholarship Type: First Graduate, PMS Scholarship, etc.
 * - Accommodation Type: Hostel, Day Scholar, Home
 * - Blood Group: A+, A-, B+, etc. (optional)
 * - Hostel Type: AC Hostel, Non-AC Hostel (optional)
 * - Food Type: Veg, Non-Veg, Vegan (optional)
 * - Quota: Government, Management (optional)
 */

import {
  GENDER_VALUES,
  RELIGION_VALUES,
  COMMUNITY_VALUES,
  BLOOD_GROUP_VALUES,
  ENTRY_TYPE_VALUES,
  ACCOMMODATION_VALUES,
  HOSTEL_TYPE_VALUES,
  FOOD_TYPE_VALUES,
  QUOTA_VALUES,
  SCHOLARSHIP_TYPE_VALUES
} from '@/lib/constants/learner-dropdown-values';

// ============================================================
// EXCEL DISPLAY VALUES (for dropdowns in template)
// These are the same as database values since we store in uppercase
// ============================================================

// NOTE: These values MUST match the enquiry form exactly (basic-details.tsx, accommodation-preferences.tsx)
// Some fields differ from learner-dropdown-values.ts to match what's actually in the form

export const EXCEL_GENDER = [...GENDER_VALUES]; // MALE, FEMALE, OTHER (3 values)

// Religion: Form only has 4 values (not 7 from constants)
export const EXCEL_RELIGION = ['HINDU', 'CHRISTIAN', 'MUSLIM', 'OTHERS'];

// Community: Form has 9 values (not 10 from constants - no SBC)
export const EXCEL_COMMUNITY = ['OC', 'BC', 'BCM', 'MBC', 'DNC', 'BC-CC', 'SC', 'ST', 'SC (A)'];

export const EXCEL_BLOOD_GROUP = [...BLOOD_GROUP_VALUES]; // 10 values
export const EXCEL_ENTRY_TYPE = [...ENTRY_TYPE_VALUES]; // 4 values
export const EXCEL_ACCOMMODATION = [...ACCOMMODATION_VALUES]; // HOSTEL, DAY SCHOLAR, HOME (3 values)
export const EXCEL_HOSTEL_TYPE = [...HOSTEL_TYPE_VALUES]; // AC HOSTEL, NON-AC HOSTEL (2 values)

// Food Type: Form only has 2 values (not 3 from constants - no VEGAN)
export const EXCEL_FOOD_TYPE = ['VEG', 'NON-VEG'];

export const EXCEL_QUOTA = [...QUOTA_VALUES]; // GOVERNMENT, GOVERNMENT 7.5%, MANAGEMENT (3 values)
export const EXCEL_SCHOLARSHIP_TYPE = [...SCHOLARSHIP_TYPE_VALUES]; // 4 values

// Reference Type: This is in the form but not in constants
export const EXCEL_REFERENCE_TYPE = [
  'DIRECT APPLICATION',
  'JKKN STAFF',
  'CURRENT/FORMER STUDENT',
  'EDUCATIONAL CONSULTANT',
  'SOCIAL MEDIA',
  'OTHERS'
];

// ============================================================
// BOARD OF STUDY (Display values for Excel)
// Stored in database as lowercase with underscores
// ============================================================

export const EXCEL_BOARD_OF_STUDY = [
  'STATE BOARD',
  'CBSE',
  'ICSE',
  'MATRICULATION',
  'ANGLO INDIAN',
  'OTHERS'
];

// Map display values to database values (lowercase with underscores)
export const BOARD_OF_STUDY_DB_MAPPING: Record<string, string> = {
  'STATE BOARD': 'state_board',
  'CBSE': 'cbse',
  'ICSE': 'icse',
  'MATRICULATION': 'matriculation',
  'ANGLO INDIAN': 'anglo_indian',
  'OTHERS': 'others'
};

// ============================================================
// 12TH GROUP (Display values for Excel)
// Stored in database as lowercase
// ============================================================

export const EXCEL_TWELFTH_GROUP = [
  'SCIENCE',
  'PCBM',
  'PCCS',
  'PCBZ',
  'COMMERCE',
  'CSECA',
  'HECA',
  'SECA',
  'ARTS',
  'VOCATIONAL',
  'DIPLOMA'
];

// Map display values to database values (lowercase)
export const TWELFTH_GROUP_DB_MAPPING: Record<string, string> = {
  'SCIENCE': 'science',
  'PCBM': 'pcbm',
  'PCCS': 'pccs',
  'PCBZ': 'pcbz',
  'COMMERCE': 'commerce',
  'CSECA': 'cseca',
  'HECA': 'heca',
  'SECA': 'seca',
  'ARTS': 'arts',
  'VOCATIONAL': 'vocational',
  'DIPLOMA': 'diploma'
};

// ============================================================
// BOOLEAN FIELDS (Yes/No)
// ============================================================

export const BOOLEAN_MAPPING: Record<string, boolean> = {
  'yes': true,
  'no': false,
  'true': true,
  'false': false,
  '1': true,
  '0': false,
  'y': true,
  'n': false
};

export const EXCEL_BOOLEAN = ['Yes', 'No'];

// ============================================================
// MAPPING FUNCTIONS
// ============================================================

/**
 * Map Excel display label to database value
 * For enquiries, most fields are already in UPPERCASE in database
 *
 * @param label - The Excel display value (case-insensitive)
 * @param type - The field type identifier
 * @returns Database value or null if not found
 *
 * @example
 * mapLabelToValue('male', 'gender') // returns 'MALE'
 * mapLabelToValue('MALE', 'gender') // returns 'MALE'
 * mapLabelToValue('yes', 'boolean') // returns true
 */
export function mapLabelToValue(
  label: string | undefined | null,
  type: 'gender' | 'religion' | 'community' | 'bloodGroup' | 'entryType' |
        'accommodation' | 'hostelType' | 'foodType' | 'quota' | 'scholarshipType' |
        'boardOfStudy' | 'twelfthGroup' | 'referenceType' | 'boolean'
): string | boolean | null {
  if (!label) return null;

  const normalized = label.toUpperCase().trim();

  switch (type) {
    case 'gender':
      return EXCEL_GENDER.includes(normalized as any) ? normalized : null;

    case 'religion':
      return EXCEL_RELIGION.includes(normalized as any) ? normalized : null;

    case 'community':
      return EXCEL_COMMUNITY.includes(normalized as any) ? normalized : null;

    case 'bloodGroup':
      return EXCEL_BLOOD_GROUP.includes(normalized as any) ? normalized : null;

    case 'entryType':
      return EXCEL_ENTRY_TYPE.includes(normalized as any) ? normalized : null;

    case 'accommodation':
      return EXCEL_ACCOMMODATION.includes(normalized as any) ? normalized : null;

    case 'hostelType':
      return EXCEL_HOSTEL_TYPE.includes(normalized as any) ? normalized : null;

    case 'foodType':
      return EXCEL_FOOD_TYPE.includes(normalized as any) ? normalized : null;

    case 'quota':
      return EXCEL_QUOTA.includes(normalized as any) ? normalized : null;

    case 'scholarshipType':
      return EXCEL_SCHOLARSHIP_TYPE.includes(normalized as any) ? normalized : null;

    case 'referenceType':
      return EXCEL_REFERENCE_TYPE.includes(normalized as any) ? normalized : null;

    case 'boardOfStudy':
      // Convert display value to database value (lowercase with underscores)
      return BOARD_OF_STUDY_DB_MAPPING[normalized] || null;

    case 'twelfthGroup':
      // Convert display value to database value (lowercase)
      return TWELFTH_GROUP_DB_MAPPING[normalized] || null;

    case 'boolean':
      const boolValue = BOOLEAN_MAPPING[label.toLowerCase().trim()];
      return boolValue !== undefined ? boolValue : null;

    default:
      return null;
  }
}

/**
 * Check if a label is valid for a given field type
 *
 * @param label - The label to validate
 * @param type - The field type identifier
 * @returns true if valid, false otherwise
 */
export function isValidLabel(
  label: string,
  type: 'gender' | 'religion' | 'community' | 'bloodGroup' | 'entryType' |
        'accommodation' | 'hostelType' | 'foodType' | 'quota' | 'scholarshipType' |
        'boardOfStudy' | 'twelfthGroup' | 'referenceType' | 'boolean'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Get all valid display labels for a field type
 *
 * @param type - The field type identifier
 * @returns Array of valid display labels
 */
export function getValidLabels(
  type: 'gender' | 'religion' | 'community' | 'bloodGroup' | 'entryType' |
        'accommodation' | 'hostelType' | 'foodType' | 'quota' | 'scholarshipType' |
        'boardOfStudy' | 'twelfthGroup' | 'referenceType' | 'boolean'
): string[] {
  switch (type) {
    case 'gender':
      return [...EXCEL_GENDER];
    case 'religion':
      return [...EXCEL_RELIGION];
    case 'community':
      return [...EXCEL_COMMUNITY];
    case 'bloodGroup':
      return [...EXCEL_BLOOD_GROUP];
    case 'entryType':
      return [...EXCEL_ENTRY_TYPE];
    case 'accommodation':
      return [...EXCEL_ACCOMMODATION];
    case 'hostelType':
      return [...EXCEL_HOSTEL_TYPE];
    case 'foodType':
      return [...EXCEL_FOOD_TYPE];
    case 'quota':
      return [...EXCEL_QUOTA];
    case 'scholarshipType':
      return [...EXCEL_SCHOLARSHIP_TYPE];
    case 'referenceType':
      return [...EXCEL_REFERENCE_TYPE];
    case 'boardOfStudy':
      return [...EXCEL_BOARD_OF_STUDY];
    case 'twelfthGroup':
      return [...EXCEL_TWELFTH_GROUP];
    case 'boolean':
      return [...EXCEL_BOOLEAN];
    default:
      return [];
  }
}
