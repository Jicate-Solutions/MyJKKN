// ============================================
// BULK UPLOAD ENQUIRIES TYPES
// ============================================
// Created: 2025-01-02
// Purpose: TypeScript types for enhanced enquiry bulk upload
// Based on: profiles bulk-upload-types.ts
// ============================================

import {
  ValidationError,
  ValidationResult,
  DatabaseValidationErrors,
  DatabaseValidationResult
} from '@/lib/utils/bulk-upload-validation';

export type UploadStep =
  | 'select-file'
  | 'preview-data'
  | 'validating-format'
  | 'validating-database'
  | 'validate'
  | 'confirm'
  | 'uploading'
  | 'results';

export type ValidationStatus = 'pending' | 'valid' | 'warning' | 'error';

export interface ParsedRow {
  rowNumber: number;
  originalData: Record<string, any>; // Original Excel row
  mappedData: Record<string, any>;  // After column mapping
  sanitizedData: Record<string, any>; // After sanitization
  validationStatus: ValidationStatus;
  validationResult: ValidationResult | null;
  databaseValidationErrors?: DatabaseValidationErrors; // Database validation errors
  selected: boolean; // Whether to include in upload
  isDuplicate: boolean; // Duplicate email in this batch
  isExistingLearner: boolean; // Already exists in database
  existingLearnerInfo?: any; // Details about existing learner
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateEmails: number;
  selectedRows: number;
}

// Enquiry-specific upload result (with created enquiry details)
export interface EnquiryUploadResult {
  success: boolean;
  upload_summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    enquiries_created: number;
    enquiries_failed: number;
  };
  created_enquiries: Array<{
    name: string;
    email: string;
    mobile: string;
    institution: string;
    program: string;
    semester: string;
    section: string;
  }>;
  errors: Array<{
    row: number;
    name?: string;
    error: string;
  }>;
}

export interface UploadState {
  step: UploadStep;
  file: File | null;
  parsedRows: ParsedRow[];
  validationSummary: ValidationSummary;
  databaseValidationResult: DatabaseValidationResult | null; // Database validation results
  isValidatingDatabase: boolean; // Loading state for database validation
  existingLearnersResults: any[] | null; // Results from duplicate learner check
  existingLearnersSummary: { total: number; duplicates: number; new: number } | null;
  isCheckingDuplicates: boolean; // Loading state for duplicate check
  uploadProgress: number;
  result: EnquiryUploadResult | null;
  error: string | null;
}

export type FilterType = 'all' | 'valid' | 'warning' | 'error' | 'selected';

// Enquiry-specific required fields (different from profiles)
// Note: college_email is OPTIONAL for enquiries (required for profiles)
export const ENQUIRY_REQUIRED_FIELDS = [
  'first_name', 'last_name', 'date_of_birth', 'gender', 'religion', 'community', 'caste',
  'father_name', 'mother_name',
  'institution_name', 'department_name', 'program_name', 'semester_name', 'section_name', 'academic_year_name',
  'student_mobile',
  'permanent_address_street', 'permanent_address_district',
  'permanent_address_pin_code', 'permanent_address_state',
  'entry_type', 'scholarship_type', 'accommodation_type'
];

// Fields that trigger warnings if missing (optional but important)
export const ENQUIRY_WARNING_FIELDS = [
  'college_email', // Important for user creation later
  'student_email',
  'father_mobile',
  'mother_mobile',
  'permanent_address_taluk'
];
