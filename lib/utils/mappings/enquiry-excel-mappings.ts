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
 * - Quota: Government, Management (optional)
 */

import {
  GENDER_VALUES,
  RELIGION_VALUES,
  COMMUNITY_VALUES,
  BLOOD_GROUP_VALUES,
  ENTRY_TYPE_VALUES,
  ACCOMMODATION_VALUES,
  QUOTA_VALUES,
  SCHOLARSHIP_TYPE_VALUES
} from '@/lib/constants/learner-dropdown-values';

// ============================================================
// EXCEL DISPLAY VALUES (for dropdowns in template)
// These are the same as database values since we store in uppercase
// ============================================================

// NOTE: These values MUST match the enquiry form exactly (basic-details.tsx, accommodation-preferences.tsx)
// Some fields differ from learner-dropdown-values.ts to match what's actually in the form

export const EXCEL_GENDER = [...GENDER_VALUES]; // Male, Female, Other (3 values)

// Religion: Form only has 4 values (not 7 from constants)
export const EXCEL_RELIGION = ['HINDU', 'CHRISTIAN', 'MUSLIM', 'OTHERS'];

// Community: Form has 9 values (not 10 from constants - no SBC)
export const EXCEL_COMMUNITY = ['OC', 'BC', 'BCM', 'MBC', 'DNC', 'BC-CC', 'SC', 'ST', 'SC (A)'];

export const EXCEL_BLOOD_GROUP = [...BLOOD_GROUP_VALUES]; // 10 values
export const EXCEL_ENTRY_TYPE = [...ENTRY_TYPE_VALUES]; // 4 values
export const EXCEL_ACCOMMODATION = [...ACCOMMODATION_VALUES]; // HOSTEL, DAY SCHOLAR, HOME (3 values)

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
  'PCBCS',
  'PCBN',
  'PCBHS',
  'PCBCE',
  'PCBND',
  'PCBBC',
  'PCBMB',
  'COMMERCE',
  'CSECA',
  'HECA',
  'SECA',
  'CEECA',
  'ECABMS',
  'ECAAT',
  'EPCA',
  'CSAML',
  'OMATL',
  'GHEP',
  'GHECS',
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
  'PCBCS': 'pcbcs',
  'PCBN': 'pcbn',
  'PCBHS': 'pcbhs',
  'PCBCE': 'pcbce',
  'PCBND': 'pcbnd',
  'PCBBC': 'pcbbc',
  'PCBMB': 'pcbmb',
  'COMMERCE': 'commerce',
  'CSECA': 'cseca',
  'HECA': 'heca',
  'SECA': 'seca',
  'CEECA': 'ceeca',
  'ECABMS': 'ecabms',
  'ECAAT': 'ecaat',
  'EPCA': 'epca',
  'CSAML': 'csaml',
  'OMATL': 'omatl',
  'GHEP': 'ghep',
  'GHECS': 'ghecs',
  'ARTS': 'arts',
  'VOCATIONAL': 'vocational',
  'DIPLOMA': 'diploma'
};

// ============================================================
// 12TH GROUP — SUBJECT CONFIGS + LABEL MAP
// Single source of truth for the 15 new streams added on 2026-05-22.
// Used by the enquiry form, learner create form, student self-fill form,
// and by detail views to pretty-print the group key.
// ============================================================

export type TwelfthGroupKey =
  | 'science' | 'pcbm' | 'pccs' | 'pcbz'
  | 'pcbcs' | 'pcbn' | 'pcbhs' | 'pcbce' | 'pcbnd' | 'pcbbc' | 'pcbmb'
  | 'commerce' | 'cseca' | 'heca' | 'seca'
  | 'ceeca' | 'ecabms' | 'ecaat' | 'epca' | 'csaml' | 'omatl'
  | 'ghep' | 'ghecs'
  | 'arts' | 'vocational' | 'diploma';

export type TwelfthSubjectKey =
  | 'physics' | 'chemistry' | 'mathematics' | 'biology' | 'botany' | 'zoology'
  | 'computer_science' | 'accountancy' | 'commerce' | 'economics' | 'history'
  | 'statistics' | 'geography' | 'political_science'
  | 'nursing' | 'home_science' | 'communication_english'
  | 'nutrition_dietetics' | 'biochemistry' | 'microbiology'
  | 'business_maths_statistics' | 'advance_tamil'
  | 'office_management' | 'type_writing' | 'language';

export interface TwelfthSubject {
  key: TwelfthSubjectKey;
  label: string;        // English label (used by enquiry form)
  labelTa?: string;     // Optional Tamil suffix (used by student self-fill form)
}

// Pretty-print labels for every group key. Used by detail views.
export const TWELFTH_GROUP_LABEL_MAP: Record<TwelfthGroupKey, string> = {
  science: 'Science (General)',
  pcbm: 'PCBM (Physics, Chemistry, Biology, Mathematics)',
  pccs: 'PCCS (Physics, Chemistry, Computer Science, Mathematics)',
  pcbz: 'PCBZ (Physics, Chemistry, Botany, Zoology)',
  pcbcs: 'PCBCS (Physics, Chemistry, Biology, Computer Science)',
  pcbn: 'PCBN (Physics, Chemistry, Biology, Nursing)',
  pcbhs: 'PCBHS (Physics, Chemistry, Biology, Home Science)',
  pcbce: 'PCBCE (Physics, Chemistry, Biology, Communication English)',
  pcbnd: 'PCBND (Physics, Chemistry, Biology, Nutrition & Dietetics)',
  pcbbc: 'PCBBC (Physics, Chemistry, Biology, Bio-Chemistry)',
  pcbmb: 'PCBMB (Physics, Chemistry, Biology, Micro-Biology)',
  commerce: 'Commerce (General)',
  cseca: 'CSECA (Computer Science, Economics, Commerce, Accountancy)',
  heca: 'HECA (History, Economics, Commerce, Accountancy)',
  seca: 'SECA (Statistics, Economics, Commerce, Accountancy)',
  ceeca: 'CEECA (Communication English, Economics, Commerce, Accounts)',
  ecabms: 'ECABMS (Economics, Commerce, Accounts, Business Maths & Statistics)',
  ecaat: 'ECAAT (Economics, Commerce, Accounts, Advance Tamil)',
  epca: 'EPCA (Economics, Political Science, Commerce, Accounts)',
  csaml: 'CSAML (Computer Science, Accounts, Maths, Language)',
  omatl: 'OMATL (Office Management, Accounts, Type Writing, Language)',
  ghep: 'GHEP (Geography, History, Economics, Political Science)',
  ghecs: 'GHECS (Geography, History, Economics, Computer Science)',
  arts: 'Arts',
  vocational: 'Vocational',
  diploma: 'Diploma',
};

// Subject layouts for the 15 streams added 2026-05-22. The legacy streams
// (science/pcbm/pccs/pcbz/commerce/cseca/heca/seca/arts) keep their bespoke
// switch cases in the form components for back-compat; new streams render
// from this map via a data-driven helper.
export const NEW_TWELFTH_SUBJECTS: Partial<Record<TwelfthGroupKey, TwelfthSubject[]>> = {
  pcbcs: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'computer_science', label: 'Computer Science' },
  ],
  pcbn: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'nursing', label: 'Nursing' },
  ],
  pcbhs: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'home_science', label: 'Home Science' },
  ],
  pcbce: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'communication_english', label: 'Communication English' },
  ],
  pcbnd: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'nutrition_dietetics', label: 'Nutrition & Dietetics' },
  ],
  pcbbc: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'biochemistry', label: 'Bio-Chemistry' },
  ],
  pcbmb: [
    { key: 'physics', label: 'Physics', labelTa: 'இயற்பியல்' },
    { key: 'chemistry', label: 'Chemistry', labelTa: 'வேதியியல்' },
    { key: 'biology', label: 'Biology', labelTa: 'உயிரியல்' },
    { key: 'microbiology', label: 'Micro-Biology' },
  ],
  ceeca: [
    { key: 'communication_english', label: 'Communication English' },
    { key: 'economics', label: 'Economics' },
    { key: 'commerce', label: 'Commerce' },
    { key: 'accountancy', label: 'Accounts' },
  ],
  ecabms: [
    { key: 'economics', label: 'Economics' },
    { key: 'commerce', label: 'Commerce' },
    { key: 'accountancy', label: 'Accounts' },
    { key: 'business_maths_statistics', label: 'Business Maths & Statistics' },
  ],
  ecaat: [
    { key: 'economics', label: 'Economics' },
    { key: 'commerce', label: 'Commerce' },
    { key: 'accountancy', label: 'Accounts' },
    { key: 'advance_tamil', label: 'Advance Tamil', labelTa: 'மேம்பட்ட தமிழ்' },
  ],
  epca: [
    { key: 'economics', label: 'Economics' },
    { key: 'political_science', label: 'Political Science' },
    { key: 'commerce', label: 'Commerce' },
    { key: 'accountancy', label: 'Accounts' },
  ],
  csaml: [
    { key: 'computer_science', label: 'Computer Science' },
    { key: 'accountancy', label: 'Accounts' },
    { key: 'mathematics', label: 'Mathematics', labelTa: 'கணிதம்' },
    { key: 'language', label: 'Language' },
  ],
  omatl: [
    { key: 'office_management', label: 'Office Management' },
    { key: 'accountancy', label: 'Accounts' },
    { key: 'type_writing', label: 'Type Writing' },
    { key: 'language', label: 'Language' },
  ],
  ghep: [
    { key: 'geography', label: 'Geography', labelTa: 'புவியியல்' },
    { key: 'history', label: 'History', labelTa: 'வரலாறு' },
    { key: 'economics', label: 'Economics' },
    { key: 'political_science', label: 'Political Science' },
  ],
  ghecs: [
    { key: 'geography', label: 'Geography', labelTa: 'புவியியல்' },
    { key: 'history', label: 'History', labelTa: 'வரலாறு' },
    { key: 'economics', label: 'Economics' },
    { key: 'computer_science', label: 'Computer Science' },
  ],
};

// Helper: pretty-print a stored group key for display.
export function formatTwelfthGroup(group?: string | null): string {
  if (!group) return 'Not specified';
  return TWELFTH_GROUP_LABEL_MAP[group as TwelfthGroupKey] ?? group;
}

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
 * mapLabelToValue('male', 'gender') // returns 'Male'
 * mapLabelToValue('MALE', 'gender') // returns 'Male'
 * mapLabelToValue('yes', 'boolean') // returns true
 */
export function mapLabelToValue(
  label: string | undefined | null,
  type: 'gender' | 'religion' | 'community' | 'bloodGroup' | 'entryType' |
        'accommodation' | 'quota' | 'scholarshipType' |
        'boardOfStudy' | 'twelfthGroup' | 'referenceType' | 'boolean'
): string | boolean | null {
  if (!label) return null;

  const normalized = label.toUpperCase().trim();

  switch (type) {
    case 'gender':
      // EXCEL_GENDER is Title Case while every other list here is UPPERCASE, so match
      // case-insensitively and return the canonical spelling instead of `normalized`.
      return EXCEL_GENDER.find((g) => g.toUpperCase() === normalized) ?? null;

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
        'accommodation' | 'quota' | 'scholarshipType' |
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
        'accommodation' | 'quota' | 'scholarshipType' |
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
