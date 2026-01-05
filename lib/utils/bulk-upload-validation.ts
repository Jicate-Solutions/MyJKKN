// ============================================
// BULK UPLOAD CLIENT-SIDE VALIDATION
// ============================================
// Created: 2025-01-27
// Updated: 2025-12-27 - Added dropdown value validation
// Updated: 2026-01-05 - Added dropdown normalization to sanitizeValue
// Purpose: Client-side validation for bulk upload preview
// Note: Automatically normalizes case-sensitive fields to UPPERCASE before database storage
// ============================================

import {
  validateDropdownValue,
  normalizeDropdownValue,
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

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  status: 'valid' | 'warning' | 'error';
}

/**
 * Column mapping for bulk upload template
 * Maps various column name variations to expected fields
 */
export const COLUMN_MAPPING: Record<string, string[]> = {
  // SECTION 1: Basic Details
  'first_name': ['First Name', '* First Name', 'firstname', 'first_name'],
  'last_name': ['Last Name', '* Last Name', 'lastname', 'last_name'],
  'date_of_birth': ['Date of Birth', '* Date of Birth', 'DOB', 'date_of_birth', 'dob'],
  'gender': ['Gender', '* Gender', 'gender'],
  'religion': ['Religion', '* Religion', 'religion'],
  'community': ['Community', '* Community', 'community'],
  'caste': ['Caste', '* Caste', 'caste'],
  'aadhar_number': ['Aadhar Number', 'aadhar_number', 'aadhaar'],
  'blood_group': ['Blood Group', 'blood_group'],
  'admission_year': ['Admission Year', 'admission_year'],

  // SECTION 2: Parent/Guardian Information
  'father_name': ['Father Name', '* Father Name', 'father_name', 'fathername'],
  'father_occupation': ['Father Occupation', 'father_occupation'],
  'father_mobile': ['Father Mobile', '* Father Mobile', 'father_mobile'],
  'mother_name': ['Mother Name', '* Mother Name', 'mother_name', 'mothername'],
  'mother_occupation': ['Mother Occupation', 'mother_occupation'],
  'mother_mobile': ['Mother Mobile', '* Mother Mobile', 'mother_mobile'],
  'annual_income': ['Annual Income', 'annual_income'],

  // SECTION 3: Academic Assignment
  'institution_name': ['Institution', '* Institution', 'institution', 'institution_name'],
  'degree_name': ['Degree', '* Degree', 'degree', 'degree_name'],
  'department_name': ['Department', '* Department', 'department', 'department_name'],
  'program_name': ['Program', '* Program', 'program', 'program_name'],
  'semester_name': ['Semester', '* Semester', 'semester', 'semester_name'],
  'section_name': ['Section', '* Section', 'section', 'section_name'],
  'academic_year_name': ['Academic Year', '* Academic Year', 'academic_year', 'academic_year_name'],
  'regulation_name': ['Regulation', 'regulation', 'regulation_name'],
  'batch_name': ['Batch', 'batch', 'batch_name'],

  // SECTION 4: Contact Details
  'student_mobile': ['Student Mobile', '* Student Mobile', 'Mobile', 'student_mobile', 'mobile'],
  'college_email': ['College Email', '* College Email', 'Email', 'college_email', 'email'],
  'student_email': ['Personal Email', 'Student Email', 'personal_email', 'student_email'],

  // SECTION 5: Address Information
  'permanent_address_street': ['Permanent Address Street', '* Permanent Address Street', 'permanent_address_street', 'address_street'],
  'permanent_address_taluk': ['Permanent Address Taluk', '* Permanent Address Taluk', 'permanent_address_taluk', 'taluk'],
  'permanent_address_district': ['Permanent Address District', '* Permanent Address District', 'permanent_address_district', 'district'],
  'permanent_address_pin_code': ['Permanent Address Pin Code', '* Permanent Address Pin Code', 'permanent_address_pin_code', 'pincode', 'pin'],
  'permanent_address_state': ['Permanent Address State', '* Permanent Address State', 'permanent_address_state', 'state'],

  // SECTION 6: Entry Type & Scholarship
  'entry_type': ['Entry Type', '* Entry Type', 'entry_type'],
  'scholarship_type': [
    'Scholarship Type',
    '* Scholarship Type',
    'scholarship_type',
    // Legacy support for old templates
    'First Graduate',
    '* First Graduate',
    'first_graduate'
  ],

  // SECTION 7: Accommodation
  'accommodation_type': ['Accommodation Type', '* Accommodation Type', 'accommodation_type'],
  'hostel_type': ['Hostel Type', 'hostel_type'],
  'food_type': ['Food Type', 'food_type'],

  // SECTION 8: Previous Education (Required for database)
  'last_school': ['Last School', '* Last School', 'last_school', 'school', 'Previous School', 'School Name'],
  'board_of_study': ['Board of Study', '* Board of Study', 'board_of_study', 'board', 'Board', 'Education Board'],

  // 10th Marks - Individual fields for JSONB (with many variations)
  'tenth_max_marks': [
    '10th Max Marks', '* 10th Max Marks', 'tenth_max_marks',
    '10th Total Marks', 'SSLC Max Marks', 'SSLC Total Marks',
    'Class 10 Max Marks', 'X Max Marks', '10th Maximum Marks'
  ],
  'tenth_obtained_marks': [
    '10th Obtained Marks', '* 10th Obtained Marks', 'tenth_obtained_marks',
    '10th Marks Obtained', 'SSLC Obtained Marks', 'SSLC Marks',
    'Class 10 Obtained Marks', 'X Obtained Marks', '10th Scored Marks'
  ],
  'tenth_percentage': [
    '10th Percentage', '* 10th Percentage', 'tenth_percentage',
    '10th %', 'SSLC Percentage', 'SSLC %',
    'Class 10 Percentage', 'X Percentage', '10th Percent'
  ],

  // 12th Marks - Individual fields for JSONB (with many variations)
  'twelfth_group': [
    '12th Group', '* 12th Group', 'twelfth_group',
    'HSC Group', 'Plus Two Group', 'Class 12 Group',
    'XII Group', 'Stream', '12th Stream'
  ],
  'twelfth_max_marks': [
    '12th Max Marks', '* 12th Max Marks', 'twelfth_max_marks',
    '12th Total Marks', 'HSC Max Marks', 'HSC Total Marks',
    'Class 12 Max Marks', 'XII Max Marks', '12th Maximum Marks'
  ],
  'twelfth_obtained_marks': [
    '12th Obtained Marks', '* 12th Obtained Marks', 'twelfth_obtained_marks',
    '12th Marks Obtained', 'HSC Obtained Marks', 'HSC Marks',
    'Class 12 Obtained Marks', 'XII Obtained Marks', '12th Scored Marks'
  ],
  'twelfth_percentage': [
    '12th Percentage', '* 12th Percentage', 'twelfth_percentage',
    '12th %', 'HSC Percentage', 'HSC %',
    'Class 12 Percentage', 'XII Percentage', '12th Percent'
  ],

  // Legacy single-field mapping (for backward compatibility)
  'tenth_marks': ['10th Marks', 'Tenth Marks', 'tenth_marks'],
  'twelfth_marks': ['12th Marks', 'Twelfth Marks', 'twelfth_marks'],

  'medical_cutoff_marks': ['Medical Cutoff Marks', 'medical_cutoff_marks', 'medical_cutoff'],
  'engineering_cutoff_marks': ['Engineering Cutoff Marks', 'engineering_cutoff_marks', 'engineering_cutoff'],

  // SECTION 9: Entrance Exams
  'neet_roll_number': ['NEET Roll Number', 'neet_roll_number', 'neet_roll'],
  'neet_score': ['NEET Score', 'neet_score'],

  // SECTION 10: Counseling Information
  'counseling_applied': ['Counseling Applied', 'counseling_applied'],
  'counseling_number': ['Counseling Number', 'counseling_number'],
  'quota': ['Quota', 'quota'],
  'category': ['Category', 'category'],

  // SECTION 11: Transport
  'bus_required': ['Bus Required', 'bus_required'],
  'bus_route': ['Bus Route', 'bus_route'],
  'bus_pickup_location': ['Bus Pickup Location', 'bus_pickup_location', 'pickup_location'],

  // SECTION 12: Reference Information
  'reference_type': ['Reference Type', 'reference_type'],
  'reference_name': ['Reference Name', 'reference_name'],
  'reference_contact': ['Reference Contact', 'reference_contact'],

  // SECTION 13: Student IDs
  'roll_number': ['Roll Number', 'roll_number'],
  'register_number': ['Register Number', 'register_number', 'university_register'],
  'student_photo_url': ['Student Photo URL', 'student_photo_url', 'photo_url'],
};

/**
 * Map Excel columns to expected field names
 * Uses case-insensitive matching with normalized column names
 */
export function mapColumns(row: Record<string, any>): Record<string, any> {
  const mapped: Record<string, any> = {};

  // Create a normalized lookup map for row keys (case-insensitive, trimmed)
  const normalizedRowKeys: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    // Normalize: lowercase, trim, remove asterisk prefix, collapse spaces
    const normalizedKey = key.toLowerCase().trim().replace(/^\*\s*/, '').replace(/\s+/g, ' ');
    normalizedRowKeys[normalizedKey] = key;
  }

  for (const [targetField, sourceVariations] of Object.entries(COLUMN_MAPPING)) {
    // First try exact match
    for (const sourceField of sourceVariations) {
      if (row[sourceField] !== undefined && row[sourceField] !== null && row[sourceField] !== '') {
        mapped[targetField] = row[sourceField];
        break;
      }
    }

    // If not found, try case-insensitive normalized match
    if (mapped[targetField] === undefined) {
      for (const sourceField of sourceVariations) {
        const normalizedSource = sourceField.toLowerCase().trim().replace(/^\*\s*/, '').replace(/\s+/g, ' ');
        const originalKey = normalizedRowKeys[normalizedSource];
        if (originalKey && row[originalKey] !== undefined && row[originalKey] !== null && row[originalKey] !== '') {
          mapped[targetField] = row[originalKey];
          break;
        }
      }
    }
  }

  // Apply legacy conversions automatically after mapping
  if (mapped.scholarship_type) {
    mapped.scholarship_type = convertLegacyScholarshipType(mapped.scholarship_type);
  }

  if (mapped.entry_type) {
    mapped.entry_type = convertLegacyEntryType(mapped.entry_type);
  }

  return mapped;
}

/**
 * Sanitize and clean values with dropdown normalization
 *
 * @param value - The raw value from Excel
 * @param type - The data type (text/email/mobile/number/date)
 * @param fieldName - Optional field name for dropdown normalization
 * @returns Sanitized and normalized value
 *
 * For dropdown fields, normalizes to UPPERCASE using predefined constants
 * For state/district/taluk, normalizes to UPPERCASE
 * For other text fields, converts to UPPERCASE
 */
export function sanitizeValue(
  value: any,
  type: 'text' | 'email' | 'mobile' | 'number' | 'date',
  fieldName?: string
): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;

  const strValue = String(value).trim();
  if (strValue === '') return undefined;

  switch (type) {
    case 'text':
      // Apply dropdown normalization for known dropdown fields
      if (fieldName) {
        switch (fieldName) {
          case 'gender':
            return normalizeDropdownValue(strValue, GENDER_VALUES) ?? strValue.toUpperCase();
          case 'religion':
            return normalizeDropdownValue(strValue, RELIGION_VALUES) ?? strValue.toUpperCase();
          case 'community':
            return normalizeDropdownValue(strValue, COMMUNITY_VALUES) ?? strValue.toUpperCase();
          case 'blood_group':
            return normalizeDropdownValue(strValue, BLOOD_GROUP_VALUES) ?? strValue.toUpperCase();
          case 'entry_type':
            return normalizeDropdownValue(strValue, ENTRY_TYPE_VALUES) ?? strValue.toUpperCase();
          case 'accommodation_type':
            return normalizeDropdownValue(strValue, ACCOMMODATION_VALUES) ?? strValue.toUpperCase();
          case 'hostel_type':
            return normalizeDropdownValue(strValue, HOSTEL_TYPE_VALUES) ?? strValue.toUpperCase();
          case 'food_type':
            return normalizeDropdownValue(strValue, FOOD_TYPE_VALUES) ?? strValue.toUpperCase();
          case 'quota':
            return normalizeDropdownValue(strValue, QUOTA_VALUES) ?? strValue.toUpperCase();
          case 'scholarship_type':
            return normalizeDropdownValue(strValue, SCHOLARSHIP_TYPE_VALUES) ?? strValue.toUpperCase();
          // For state/district/taluk, just UPPERCASE
          case 'permanent_address_state':
          case 'permanent_address_district':
          case 'permanent_address_taluk':
            return strValue.toUpperCase();
          default:
            // For all other text fields, just UPPERCASE
            return strValue.toUpperCase();
        }
      }
      // If no field name provided, default to UPPERCASE
      return strValue.toUpperCase();
    case 'email':
      return strValue.toLowerCase();
    case 'mobile':
      return strValue.replace(/\D/g, ''); // Remove non-digits
    case 'number':
      return strValue.replace(/\D/g, '');
    case 'date':
      return strValue;
    default:
      return strValue;
  }
}

/**
 * Convert legacy boolean values to scholarship type
 * Handles backward compatibility for old templates with First Graduate field
 */
export function convertLegacyScholarshipType(value: any): string | undefined {
  if (!value) return undefined;

  const normalized = String(value).trim().toUpperCase();

  // Already a valid scholarship type - return as is
  const validTypes = ['FIRST GRADUATE', 'PMS SCHOLARSHIP', '7.5% SCHOLARSHIP', 'NOT APPLICABLE'];
  if (validTypes.includes(normalized)) {
    return normalized;
  }

  // Legacy boolean conversion
  if (normalized === 'TRUE' || normalized === 'YES' || normalized === '1') {
    return 'FIRST GRADUATE';
  }

  if (normalized === 'FALSE' || normalized === 'NO' || normalized === '0') {
    return 'NOT APPLICABLE';
  }

  // Return original value for validation to catch
  return normalized;
}

/**
 * Convert legacy entry type values
 * Handles backward compatibility for old templates with REGULAR/LATERAL
 */
export function convertLegacyEntryType(value: any): string | undefined {
  if (!value) return undefined;

  const normalized = String(value).trim().toUpperCase();

  // Legacy mappings
  if (normalized === 'REGULAR') {
    return 'FIRST YEAR';
  }

  if (normalized === 'LATERAL') {
    return 'LATERAL ENTRY';
  }

  // Return as is (either already correct or will be caught by validation)
  return normalized;
}

/**
 * Validate single row (client-side only - basic validation)
 */
export function validateRow(data: Record<string, any>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // REQUIRED: First Name
  if (!data.first_name?.trim()) {
    errors.push({
      field: 'first_name',
      message: 'First Name is required'
    });
  }

  // REQUIRED: Last Name
  if (!data.last_name?.trim()) {
    errors.push({
      field: 'last_name',
      message: 'Last Name is required'
    });
  }

  // REQUIRED: College Email
  if (!data.college_email?.trim()) {
    errors.push({
      field: 'college_email',
      message: 'College Email is required'
    });
  } else {
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.college_email)) {
      errors.push({
        field: 'college_email',
        message: 'Invalid email format'
      });
    }
    // Check @jkkn.ac.in domain
    else if (!data.college_email.toLowerCase().endsWith('@jkkn.ac.in')) {
      errors.push({
        field: 'college_email',
        message: 'College Email must end with @jkkn.ac.in'
      });
    }
  }

  // REQUIRED: Student Mobile
  if (!data.student_mobile?.trim()) {
    errors.push({
      field: 'student_mobile',
      message: 'Student Mobile is required'
    });
  } else {
    const mobileDigits = data.student_mobile.replace(/\D/g, '');
    if (!/^\d{10}$/.test(mobileDigits)) {
      errors.push({
        field: 'student_mobile',
        message: 'Student Mobile must be 10 digits'
      });
    }
  }

  // REQUIRED: Date of Birth
  if (!data.date_of_birth?.trim()) {
    errors.push({
      field: 'date_of_birth',
      message: 'Date of Birth is required'
    });
  }

  // REQUIRED: Gender (with dropdown validation)
  const genderValidation = validateDropdownValue(data.gender, GENDER_VALUES, 'Gender', true);
  if (!genderValidation.valid) {
    errors.push({
      field: 'gender',
      message: genderValidation.error!
    });
  }

  // REQUIRED: Religion (with dropdown validation)
  const religionValidation = validateDropdownValue(data.religion, RELIGION_VALUES, 'Religion', true);
  if (!religionValidation.valid) {
    errors.push({
      field: 'religion',
      message: religionValidation.error!
    });
  }

  // REQUIRED: Community (with dropdown validation)
  const communityValidation = validateDropdownValue(data.community, COMMUNITY_VALUES, 'Community', true);
  if (!communityValidation.valid) {
    errors.push({
      field: 'community',
      message: communityValidation.error!
    });
  }

  // REQUIRED: Caste
  if (!data.caste?.trim()) {
    errors.push({
      field: 'caste',
      message: 'Caste is required'
    });
  }

  // OPTIONAL: Blood Group (with dropdown validation)
  if (data.blood_group?.trim()) {
    const bloodGroupValidation = validateDropdownValue(data.blood_group, BLOOD_GROUP_VALUES, 'Blood Group', false);
    if (!bloodGroupValidation.valid) {
      errors.push({
        field: 'blood_group',
        message: bloodGroupValidation.error!
      });
    }
  }

  // REQUIRED: Father Name
  if (!data.father_name?.trim()) {
    errors.push({
      field: 'father_name',
      message: 'Father Name is required'
    });
  }

  // REQUIRED: Father Mobile
  if (!data.father_mobile?.trim()) {
    errors.push({
      field: 'father_mobile',
      message: 'Father Mobile is required'
    });
  } else {
    const mobileDigits = data.father_mobile.replace(/\D/g, '');
    if (!/^\d{10}$/.test(mobileDigits)) {
      errors.push({
        field: 'father_mobile',
        message: 'Father Mobile must be 10 digits'
      });
    }
  }

  // REQUIRED: Mother Name
  if (!data.mother_name?.trim()) {
    errors.push({
      field: 'mother_name',
      message: 'Mother Name is required'
    });
  }

  // REQUIRED: Mother Mobile
  if (!data.mother_mobile?.trim()) {
    errors.push({
      field: 'mother_mobile',
      message: 'Mother Mobile is required'
    });
  } else {
    const mobileDigits = data.mother_mobile.replace(/\D/g, '');
    if (!/^\d{10}$/.test(mobileDigits)) {
      errors.push({
        field: 'mother_mobile',
        message: 'Mother Mobile must be 10 digits'
      });
    }
  }

  // REQUIRED: Academic Fields
  // NOTE: These fields are validated for presence. Database matching validation happens server-side.
  if (!data.institution_name?.trim()) {
    errors.push({
      field: 'institution_name',
      message: 'Institution name is required. Use exact name from database (e.g., "JKKN College of Engineering and Technology")'
    });
  }

  if (!data.degree_name?.trim()) {
    errors.push({
      field: 'degree_name',
      message: 'Degree is required (e.g., "B.E", "M.E", "B.Tech")'
    });
  }

  if (!data.department_name?.trim()) {
    errors.push({
      field: 'department_name',
      message: 'Department is required. Use full name (e.g., "Computer Science and Engineering")'
    });
  }

  if (!data.program_name?.trim()) {
    errors.push({
      field: 'program_name',
      message: 'Program is required. ⚠️ MUST use EXACT database format with degree prefix: "(BE) CSE", "(ME) CSE", "MBA", etc. Do NOT use just "CSE".'
    });
  }

  if (!data.semester_name?.trim()) {
    errors.push({
      field: 'semester_name',
      message: 'Semester is required. ⚠️ MUST use EXACT database format: "Semester I", "Semester II", "Semester 4", "1 Year", "2 Year", etc.'
    });
  }

  if (!data.section_name?.trim()) {
    errors.push({
      field: 'section_name',
      message: 'Section is required. Use exact section name from database (usually just "A", "B", "C", etc.)'
    });
  }

  // REQUIRED: Academic Year
  if (!data.academic_year_name?.trim()) {
    errors.push({
      field: 'academic_year_name',
      message: 'Academic Year is required (e.g., "2024-2025", "2025-2026")'
    });
  }

  // REQUIRED: Scholarship Type
  // Note: Legacy conversions already applied in mapColumns()
  const scholarshipValidation = validateDropdownValue(data.scholarship_type, SCHOLARSHIP_TYPE_VALUES, 'Scholarship Type', true);
  if (!scholarshipValidation.valid) {
    errors.push({
      field: 'scholarship_type',
      message: scholarshipValidation.error!
    });
  }

  // REQUIRED: Address
  if (!data.permanent_address_street?.trim()) {
    errors.push({
      field: 'permanent_address_street',
      message: 'Permanent Address Street is required'
    });
  }

  if (!data.permanent_address_taluk?.trim()) {
    errors.push({
      field: 'permanent_address_taluk',
      message: 'Permanent Address Taluk is required'
    });
  }

  if (!data.permanent_address_district?.trim()) {
    errors.push({
      field: 'permanent_address_district',
      message: 'Permanent Address District is required'
    });
  }

  if (!data.permanent_address_pin_code?.trim()) {
    errors.push({
      field: 'permanent_address_pin_code',
      message: 'Permanent Address Pin Code is required'
    });
  } else {
    const pinDigits = data.permanent_address_pin_code.replace(/\D/g, '');
    if (!/^\d{6}$/.test(pinDigits)) {
      errors.push({
        field: 'permanent_address_pin_code',
        message: 'Pin Code must be 6 digits'
      });
    }
  }

  if (!data.permanent_address_state?.trim()) {
    errors.push({
      field: 'permanent_address_state',
      message: 'Permanent Address State is required'
    });
  }

  // REQUIRED: Entry Type
  // Note: Legacy conversions already applied in mapColumns()
  const entryTypeValidation = validateDropdownValue(data.entry_type, ENTRY_TYPE_VALUES, 'Entry Type', true);
  if (!entryTypeValidation.valid) {
    errors.push({
      field: 'entry_type',
      message: entryTypeValidation.error!
    });
  }

  // REQUIRED: Accommodation Type (with dropdown validation)
  const accommodationValidation = validateDropdownValue(data.accommodation_type, ACCOMMODATION_VALUES, 'Accommodation Type', true);
  if (!accommodationValidation.valid) {
    errors.push({
      field: 'accommodation_type',
      message: accommodationValidation.error!
    });
  }

  // OPTIONAL: Food Type (with dropdown validation)
  if (data.food_type?.trim()) {
    const foodTypeValidation = validateDropdownValue(data.food_type, FOOD_TYPE_VALUES, 'Food Type', false);
    if (!foodTypeValidation.valid) {
      errors.push({
        field: 'food_type',
        message: foodTypeValidation.error!
      });
    }
  }

  // OPTIONAL: Previous Education (no validation required)
  // Note: last_school, board_of_study, tenth_marks, twelfth_marks are all optional
  // These fields will be processed if provided, but won't cause errors if missing

  // Note: Optional fields (last_name, student_email, etc.) don't generate warnings
  // as they are truly optional and warnings clutter the validation UI.
  // The system handles missing optional fields gracefully.

  // Determine status
  let status: 'valid' | 'warning' | 'error' = 'valid';
  if (errors.length > 0) {
    status = 'error';
  } else if (warnings.length > 0) {
    status = 'warning';
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    status
  };
}

/**
 * Find duplicate emails in the parsed data
 */
export function findDuplicateEmails(rows: Array<{ sanitizedData: Record<string, any> }>): Map<string, number[]> {
  const emailMap = new Map<string, number[]>();
  const duplicates = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const email = row.sanitizedData.college_email?.toLowerCase();
    if (!email) return;

    if (!emailMap.has(email)) {
      emailMap.set(email, []);
    }
    emailMap.get(email)!.push(index);
  });

  // Find emails that appear more than once
  emailMap.forEach((indices, email) => {
    if (indices.length > 1) {
      duplicates.set(email, indices);
    }
  });

  return duplicates;
}

// ============================================
// DATABASE VALIDATION
// ============================================

export interface FieldValidationResult {
  value: string;
  id: string | null;
  found: boolean;
  error?: string;
  suggestions?: string[];
}

export interface DatabaseValidationResult {
  institutions: Record<string, FieldValidationResult>;
  programs: Record<string, FieldValidationResult>;
  semesters: Record<string, FieldValidationResult>;
  sections: Record<string, FieldValidationResult>;
  degrees: Record<string, FieldValidationResult>;
  departments: Record<string, FieldValidationResult>;
  academicYears: Record<string, FieldValidationResult>;
  regulations: Record<string, FieldValidationResult>;
  batches: Record<string, FieldValidationResult>;
}

export interface DatabaseValidationErrors {
  institution?: { error: string; suggestions?: string[] };
  program?: { error: string; suggestions?: string[] };
  semester?: { error: string; suggestions?: string[] };
  section?: { error: string; suggestions?: string[] };
  degree?: { error: string; suggestions?: string[] };
  department?: { error: string; suggestions?: string[] };
  academicYear?: { error: string; suggestions?: string[] };
  regulation?: { error: string; suggestions?: string[] };
  batch?: { error: string; suggestions?: string[] };
}

/**
 * Extract unique values from parsed rows for batch validation
 * For hierarchical fields (program, semester, section), we include context for accurate matching
 * - Programs: department context (for matching program to department)
 * - Semesters: program context (for matching semester to program)
 * - Sections: program and semester context (for matching section to semester)
 */
export function extractUniqueValues(rows: Array<{ sanitizedData: Record<string, any> }>) {
  const uniqueValues = {
    institutions: new Set<string>(),
    programs: new Set<string>(), // Legacy: kept for backward compatibility
    degrees: new Set<string>(),
    departments: new Set<string>(),
    academicYears: new Set<string>(),
    regulations: new Set<string>(),
    batches: new Set<string>()
  };

  // For departments, we need to track (institution_name, department_name) pairs for accurate matching
  const departmentPairs = new Set<string>();

  // For programs, we need to track (department_name, program_name) pairs for accurate matching
  const programPairs = new Set<string>();

  // For semesters, we need to track (program_name, semester_name) pairs
  const semesterPairs = new Set<string>();

  // For sections, we need to track (program_name, semester_name, section_name) triplets
  const sectionTriplets = new Set<string>();

  rows.forEach(row => {
    const data = row.sanitizedData;

    if (data.institution_name) uniqueValues.institutions.add(data.institution_name);
    if (data.degree_name) uniqueValues.degrees.add(data.degree_name);
    if (data.academic_year_name) uniqueValues.academicYears.add(data.academic_year_name);
    if (data.regulation_name) uniqueValues.regulations.add(data.regulation_name);
    if (data.batch_name) uniqueValues.batches.add(data.batch_name);

    // Track department with its institution context for accurate matching
    // This ensures "Mathematics" matches correctly with its linked institution
    if (data.institution_name && data.department_name) {
      departmentPairs.add(JSON.stringify({
        institution: data.institution_name,
        department: data.department_name
      }));
    } else if (data.department_name) {
      // Also add to legacy departments set for backward compatibility
      uniqueValues.departments.add(data.department_name);
    }

    // Track program with its department AND institution context for accurate matching
    // This ensures "(ME) CSE" matches correctly with its linked department and institution
    if (data.institution_name && data.department_name && data.program_name) {
      programPairs.add(JSON.stringify({
        institution: data.institution_name,
        department: data.department_name,
        program: data.program_name
      }));
    } else if (data.department_name && data.program_name) {
      // Fallback: only department context (less accurate)
      programPairs.add(JSON.stringify({
        institution: '', // Empty institution for fallback
        department: data.department_name,
        program: data.program_name
      }));
    } else if (data.program_name) {
      // Also add to legacy programs set for backward compatibility
      uniqueValues.programs.add(data.program_name);
    }

    // Track semester with its program context
    if (data.program_name && data.semester_name) {
      semesterPairs.add(JSON.stringify({
        program: data.program_name,
        semester: data.semester_name
      }));
    }

    // Track section with its program and semester context
    if (data.program_name && data.semester_name && data.section_name) {
      sectionTriplets.add(JSON.stringify({
        program: data.program_name,
        semester: data.semester_name,
        section: data.section_name
      }));
    }
  });

  return {
    institutions: Array.from(uniqueValues.institutions),
    programs: Array.from(uniqueValues.programs), // Legacy: only programs without department context
    degrees: Array.from(uniqueValues.degrees),
    departments: Array.from(uniqueValues.departments), // Legacy: only departments without institution context
    academicYears: Array.from(uniqueValues.academicYears),
    regulations: Array.from(uniqueValues.regulations),
    batches: Array.from(uniqueValues.batches),
    // Parse back to objects for API - WITH CONTEXT for cascading validation
    departmentsWithContext: Array.from(departmentPairs).map(str => JSON.parse(str)) as Array<{ institution: string; department: string }>,
    programsWithContext: Array.from(programPairs).map(str => JSON.parse(str)) as Array<{ institution: string; department: string; program: string }>,
    semestersWithContext: Array.from(semesterPairs).map(str => JSON.parse(str)) as Array<{ program: string; semester: string }>,
    sectionsWithContext: Array.from(sectionTriplets).map(str => JSON.parse(str)) as Array<{ program: string; semester: string; section: string }>
  };
}

/**
 * Call database validation API
 */
export async function validateDatabaseFields(
  rows: Array<{ sanitizedData: Record<string, any> }>
): Promise<DatabaseValidationResult> {
  const uniqueValues = extractUniqueValues(rows);

  const response = await fetch('/api/learners/validate-bulk-upload-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uniqueValues })
  });

  if (!response.ok) {
    throw new Error('Database validation failed');
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Database validation failed');
  }

  return result.validationResult;
}

/**
 * Get database validation errors for a specific row
 */
export function getDatabaseValidationErrors(
  data: Record<string, any>,
  validationResult: DatabaseValidationResult
): DatabaseValidationErrors {
  const errors: DatabaseValidationErrors = {};

  // Check institution
  if (data.institution_name) {
    const instResult = validationResult.institutions[data.institution_name];
    if (instResult && !instResult.found) {
      errors.institution = {
        error: instResult.error || 'Institution not found in database',
        suggestions: instResult.suggestions
      };
    }
  }

  // Check program (use composite key: DEPARTMENT|PROGRAM when department is available)
  if (data.program_name) {
    // Try composite key first (more accurate)
    const compositeKey = data.department_name ? `${data.department_name}|${data.program_name}` : null;
    let progResult = compositeKey ? validationResult.programs[compositeKey] : null;

    // Fallback to simple program name lookup if composite key not found
    if (!progResult) {
      progResult = validationResult.programs[data.program_name];
    }

    if (progResult && !progResult.found) {
      errors.program = {
        error: progResult.error || 'Program not found in database',
        suggestions: progResult.suggestions
      };
    }
  }

  // Check semester (use composite key: PROGRAM|SEMESTER)
  if (data.semester_name && data.program_name) {
    const semesterKey = `${data.program_name}|${data.semester_name}`;
    const semResult = validationResult.semesters[semesterKey];
    if (semResult && !semResult.found) {
      errors.semester = {
        error: semResult.error || 'Semester not found in database',
        suggestions: semResult.suggestions
      };
    }
  }

  // Check section (use composite key: PROGRAM|SEMESTER|SECTION)
  if (data.section_name && data.program_name && data.semester_name) {
    const sectionKey = `${data.program_name}|${data.semester_name}|${data.section_name}`;
    const secResult = validationResult.sections[sectionKey];
    if (secResult && !secResult.found) {
      errors.section = {
        error: secResult.error || 'Section not found in database',
        suggestions: secResult.suggestions
      };
    }
  }

  // Check degree
  if (data.degree_name) {
    const degResult = validationResult.degrees[data.degree_name];
    if (degResult && !degResult.found) {
      errors.degree = {
        error: degResult.error || 'Degree not found in database',
        suggestions: degResult.suggestions
      };
    }
  }

  // Check department (use composite key: INSTITUTION|DEPARTMENT when institution is available)
  if (data.department_name) {
    // Try composite key first (more accurate)
    const compositeKey = data.institution_name ? `${data.institution_name}|${data.department_name}` : null;
    let deptResult = compositeKey ? validationResult.departments[compositeKey] : null;

    // Fallback to simple department name lookup if composite key not found
    if (!deptResult) {
      deptResult = validationResult.departments[data.department_name];
    }

    if (deptResult && !deptResult.found) {
      errors.department = {
        error: deptResult.error || 'Department not found in database',
        suggestions: deptResult.suggestions
      };
    }
  }

  // Check academic year
  if (data.academic_year_name) {
    const yearResult = validationResult.academicYears[data.academic_year_name];
    if (yearResult && !yearResult.found) {
      errors.academicYear = {
        error: yearResult.error || 'Academic Year not found in database',
        suggestions: yearResult.suggestions
      };
    }
  }

  return errors;
}
