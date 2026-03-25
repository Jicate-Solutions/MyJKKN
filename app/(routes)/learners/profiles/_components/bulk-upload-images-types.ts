/**
 * Type Definitions for Bulk Learner Image Upload Feature
 *
 * This file contains all TypeScript type definitions for the bulk upload
 * functionality including file previews, validation states, and results.
 *
 * Created: 2025-01-22
 */

/**
 * The current step in the bulk upload wizard flow
 */
export type ImageUploadStep =
  | 'select-files'      // Step 1: File selection (drag & drop)
  | 'preview-validate'  // Step 2: Preview and validate files
  | 'confirm'           // Step 3: Confirm upload operation
  | 'uploading'         // Step 4: Upload in progress
  | 'results';          // Step 5: Show upload results

/**
 * Validation status for each image file
 */
export type ImageValidationStatus =
  | 'pending'   // Validation not yet complete
  | 'valid'     // File is valid and ready to upload
  | 'warning'   // File has warnings but can be uploaded
  | 'error';    // File has critical errors and cannot be uploaded

/**
 * Filter options for the preview grid
 */
export type ImageFilterType =
  | 'all'       // Show all files
  | 'valid'     // Show only valid files
  | 'warning'   // Show only files with warnings
  | 'error';    // Show only files with errors

/**
 * Represents a single image file with all its metadata, validation state,
 * and matched learner information
 */
export interface ImageFilePreview {
  // File information
  file: File;
  filename: string;
  previewUrl: string;  // Object URL for preview (must be revoked after use)

  // Roll number extraction
  rollNumber: string | null;
  extractionError?: string;  // Error message if roll number couldn't be extracted

  // File validation
  validationStatus: ImageValidationStatus;
  fileValidationError?: string;  // Error message for file type/size issues

  // Matched learner information (populated after database query)
  learnerId?: string;
  learnerName?: string;
  currentSemester?: string;
  currentSection?: string;
  institutionName?: string;
  existingPhotoUrl?: string | null;

  // Duplicate handling
  isDuplicate: boolean;  // True if multiple files have the same roll number
  duplicateGroupId?: string;  // Roll number used to group duplicates together
  isSelectedDuplicate: boolean;  // True if this is the chosen file in duplicate group

  // User selection
  selected: boolean;  // Whether this file is selected for upload
}

/**
 * Summary statistics for the validation results
 * Used to display counts in the UI and enable/disable actions
 */
export interface ImageValidationSummary {
  // File counts by validation status
  totalFiles: number;
  validFiles: number;
  warningFiles: number;
  errorFiles: number;

  // Selection and upload info
  selectedFiles: number;  // Number of files selected for upload
  duplicateGroups: number;  // Number of roll numbers with duplicates
  photosToReplace: number;  // Number of learners whose existing photos will be replaced
}

/**
 * Upload progress tracking
 * Updated during the upload process to show real-time progress
 */
export interface ImageUploadProgress {
  completed: number;  // Number of files uploaded so far
  total: number;  // Total number of files to upload
  current?: string;  // Current filename being uploaded (optional)
  percentage?: number;  // Upload percentage (0-100)
}

/**
 * Result of a successful upload for a single learner
 */
export interface ImageUploadSuccess {
  rollNumber: string;
  studentName: string;
  imageUrl: string;  // URL of the uploaded image in storage
}

/**
 * Result of a failed upload for a single file
 */
export interface ImageUploadFailure {
  filename: string;
  rollNumber?: string;  // May be null if extraction failed
  error: string;  // Error message explaining why upload failed
}

/**
 * Complete results of a bulk upload operation
 * Used to display the final results screen
 */
export interface ImageUploadResult {
  success: ImageUploadSuccess[];
  failed: ImageUploadFailure[];
}

/**
 * Props for the main BulkUploadLearnerImages component
 */
export interface BulkUploadLearnerImagesProps {
  onUploadComplete?: (result: ImageUploadResult) => void;  // Callback when upload completes
  institutionId?: string;  // Optional institution filter
}

/**
 * Props for the ImagePreviewCard component
 */
export interface ImagePreviewCardProps {
  file: ImageFilePreview;
  onToggleSelection: (filename: string, selected: boolean) => void;
  onRemove: (filename: string) => void;
  onSelectDuplicate: (filename: string, duplicateGroupId: string) => void;
}

/**
 * Props for the ValidationSummaryCard component
 */
export interface ValidationSummaryCardProps {
  summary: ImageValidationSummary;
  onSelectAllValid: () => void;
  onDeselectAll: () => void;
  filter: ImageFilterType;
  onFilterChange: (filter: ImageFilterType) => void;
}

/**
 * Props for the UploadProgressCard component
 */
export interface UploadProgressCardProps {
  progress: ImageUploadProgress;
}

/**
 * Props for the UploadResultsCard component
 */
export interface UploadResultsCardProps {
  result: ImageUploadResult;
  onClose: () => void;
  onUploadMore: () => void;
}

/**
 * Configuration options for the bulk upload feature
 */
export interface BulkUploadConfig {
  // File constraints
  maxFileSize: number;  // Maximum file size in bytes (default: 5MB)
  allowedTypes: string[];  // Allowed MIME types (default: image/jpeg, image/png, etc.)

  // Performance settings
  validationChunkSize: number;  // Number of roll numbers to validate per database query (default: 50)
  uploadChunkSize: number;  // Number of files to upload in parallel (default: 5)

  // UI settings
  previewGridColumns: number;  // Number of columns in preview grid (default: 4)
  previewRowHeight: number;  // Height of each row in pixels (default: 320)
  thumbnailSize: number;  // Thumbnail size in pixels (default: 100)
}

/**
 * Default configuration values
 */
export const DEFAULT_BULK_UPLOAD_CONFIG: BulkUploadConfig = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  validationChunkSize: 50,
  uploadChunkSize: 5,
  previewGridColumns: 4,
  previewRowHeight: 320,
  thumbnailSize: 100,
};

/**
 * Error codes for validation failures
 */
export enum ValidationErrorCode {
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  NO_ROLL_NUMBER = 'NO_ROLL_NUMBER',
  LEARNER_NOT_FOUND = 'LEARNER_NOT_FOUND',
  DUPLICATE_ROLL_NUMBER = 'DUPLICATE_ROLL_NUMBER',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
}

/**
 * Human-readable error messages for each error code
 */
export const VALIDATION_ERROR_MESSAGES: Record<ValidationErrorCode, string> = {
  [ValidationErrorCode.INVALID_FILE_TYPE]: 'Invalid file type. Only JPEG, PNG, GIF, WebP allowed',
  [ValidationErrorCode.FILE_TOO_LARGE]: 'File size exceeds 5MB limit',
  [ValidationErrorCode.NO_ROLL_NUMBER]: 'Could not extract roll number from filename',
  [ValidationErrorCode.LEARNER_NOT_FOUND]: 'No learner found with this roll number',
  [ValidationErrorCode.DUPLICATE_ROLL_NUMBER]: 'Duplicate roll number in batch',
  [ValidationErrorCode.UPLOAD_FAILED]: 'Upload failed',
  [ValidationErrorCode.NETWORK_ERROR]: 'Network error during upload',
  [ValidationErrorCode.PERMISSION_DENIED]: 'Access denied',
  [ValidationErrorCode.STORAGE_QUOTA_EXCEEDED]: 'Storage quota exceeded',
};

/**
 * Learner data from database query
 * Used internally during validation
 */
export interface LearnerLookupResult {
  id: string;
  student_name: string;
  roll_number: string;
  semester_name: string | null;
  section_name: string | null;
  institution_name: string | null;
  student_photo_url: string | null;
}

/**
 * Batch validation request
 * Used for chunked database queries
 */
export interface BatchValidationRequest {
  rollNumbers: string[];
  institutionId?: string;
}

/**
 * Batch validation response
 * Contains matched learners and unmatched roll numbers
 */
export interface BatchValidationResponse {
  matched: LearnerLookupResult[];
  unmatched: string[];  // Roll numbers that didn't match any learner
}
