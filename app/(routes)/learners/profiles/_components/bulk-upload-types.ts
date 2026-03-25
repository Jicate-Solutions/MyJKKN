// ============================================
// BULK UPLOAD TYPES
// ============================================
// Created: 2025-01-27
// Purpose: TypeScript types for bulk upload system
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
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicateEmails: number;
  selectedRows: number;
}

export interface UploadResult {
  success: boolean;
  upload_summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    learners_created: number;
    learners_failed: number;
  };
  user_creation_summary: {
    profiles_complete: number;
    existing_users: number;
    new_users_created: number;
    user_creation_failed: number;
  };
  created_users: Array<{
    name: string;
    email: string;
    temp_password: string;
  }>;
  errors: Array<{
    row: number;
    email?: string;
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
  uploadProgress: number;
  result: UploadResult | null;
  error: string | null;
}

export type FilterType = 'all' | 'valid' | 'warning' | 'error' | 'selected';
