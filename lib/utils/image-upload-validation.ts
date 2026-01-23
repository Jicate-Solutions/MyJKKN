/**
 * Image Upload Validation Utilities
 *
 * Reusable validation functions for bulk learner image upload feature.
 * Includes roll number extraction, file validation, and summary calculation.
 *
 * Created: 2025-01-22
 */

import {
  ImageFilePreview,
  ImageValidationSummary,
  ValidationErrorCode,
  VALIDATION_ERROR_MESSAGES,
  DEFAULT_BULK_UPLOAD_CONFIG,
} from '@/app/(routes)/learners/profiles/_components/bulk-upload-images-types';

/**
 * Extract roll number from filename using pattern matching
 *
 * Expected format: 2-4 letters + 2-6 digits (e.g., DB22092, CS21001, MECH2023)
 *
 * Examples:
 * - "DB22092.jpg" → "DB22092"
 * - "cs21001.png" → "CS21001"
 * - "Student_MECH2023.jpg" → "MECH2023"
 * - "photo.jpg" → null
 *
 * @param filename - The filename to extract roll number from
 * @returns Extracted roll number in uppercase, or null if not found
 */
export function extractRollNumberFromFilename(filename: string): string | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Pattern: 2-4 letters followed by 2-6 digits
  // Matches: DB22092, CS21001, MECH2023, etc.
  const pattern = /([A-Z]{2,4}\d{2,6})/i;
  const match = nameWithoutExt.match(pattern);

  // Return uppercase for consistency
  return match ? match[1].toUpperCase() : null;
}

/**
 * Validate image file type and size
 *
 * Checks:
 * - File type is one of: JPEG, PNG, GIF, WebP
 * - File size is within limit (default: 5MB)
 *
 * @param file - The file to validate
 * @param maxSize - Maximum file size in bytes (optional, defaults to 5MB)
 * @returns Validation result with isValid flag and optional error message
 */
export function validateImageFile(
  file: File,
  maxSize: number = DEFAULT_BULK_UPLOAD_CONFIG.maxFileSize
): { isValid: boolean; error?: string; errorCode?: ValidationErrorCode } {
  const allowedTypes = DEFAULT_BULK_UPLOAD_CONFIG.allowedTypes;

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      error: VALIDATION_ERROR_MESSAGES[ValidationErrorCode.INVALID_FILE_TYPE],
      errorCode: ValidationErrorCode.INVALID_FILE_TYPE,
    };
  }

  // Check file size
  if (file.size > maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      isValid: false,
      error: `${VALIDATION_ERROR_MESSAGES[ValidationErrorCode.FILE_TOO_LARGE]} (current: ${fileSizeMB}MB)`,
      errorCode: ValidationErrorCode.FILE_TOO_LARGE,
    };
  }

  return { isValid: true };
}

/**
 * Create validation summary from array of file previews
 *
 * Calculates:
 * - Total file count
 * - Count by validation status (valid, warning, error)
 * - Number of selected files
 * - Number of duplicate groups
 * - Number of photos that will be replaced
 *
 * @param files - Array of image file previews
 * @returns Validation summary with all statistics
 */
export function createValidationSummary(
  files: ImageFilePreview[]
): ImageValidationSummary {
  // Count duplicate groups (unique duplicateGroupIds)
  const duplicateGroups = new Set(
    files
      .filter((f) => f.isDuplicate && f.duplicateGroupId)
      .map((f) => f.duplicateGroupId)
  ).size;

  return {
    totalFiles: files.length,
    validFiles: files.filter((f) => f.validationStatus === 'valid').length,
    warningFiles: files.filter((f) => f.validationStatus === 'warning').length,
    errorFiles: files.filter((f) => f.validationStatus === 'error').length,
    selectedFiles: files.filter((f) => f.selected).length,
    duplicateGroups,
    photosToReplace: files.filter((f) => f.selected && f.existingPhotoUrl).length,
  };
}

/**
 * Detect duplicate roll numbers in the file list
 *
 * Groups files by roll number and marks duplicates.
 * The first file in each group is selected by default.
 *
 * @param files - Array of image file previews
 * @returns Updated array with duplicate flags set
 */
export function detectDuplicates(
  files: ImageFilePreview[]
): ImageFilePreview[] {
  // Group files by roll number
  const groupedByRollNumber = new Map<string, ImageFilePreview[]>();

  files.forEach((file) => {
    if (!file.rollNumber) return;

    const group = groupedByRollNumber.get(file.rollNumber) || [];
    group.push(file);
    groupedByRollNumber.set(file.rollNumber, group);
  });

  // Mark duplicates
  return files.map((file) => {
    if (!file.rollNumber) return file;

    const group = groupedByRollNumber.get(file.rollNumber) || [];

    // Not a duplicate if only one file in group
    if (group.length <= 1) {
      return {
        ...file,
        isDuplicate: false,
        isSelectedDuplicate: false,
      };
    }

    // Mark as duplicate
    const isDuplicate = true;
    const duplicateGroupId = file.rollNumber;
    // First file in group is selected by default
    const isSelectedDuplicate = group[0].filename === file.filename;

    return {
      ...file,
      isDuplicate,
      duplicateGroupId,
      isSelectedDuplicate,
      // Update validation status to warning
      validationStatus: 'warning',
      // Keep selected only if this is the chosen duplicate
      selected: isSelectedDuplicate && file.selected,
    };
  });
}

/**
 * Filter files by validation status
 *
 * @param files - Array of image file previews
 * @param filter - Filter type ('all', 'valid', 'warning', 'error')
 * @returns Filtered array of files
 */
export function filterFilesByStatus(
  files: ImageFilePreview[],
  filter: 'all' | 'valid' | 'warning' | 'error'
): ImageFilePreview[] {
  if (filter === 'all') return files;

  return files.filter((file) => file.validationStatus === filter);
}

/**
 * Get error message for a file
 *
 * Prioritizes errors in this order:
 * 1. File validation error (type/size)
 * 2. Roll number extraction error
 * 3. Generic error message
 *
 * @param file - Image file preview
 * @returns Error message or undefined if no error
 */
export function getFileErrorMessage(file: ImageFilePreview): string | undefined {
  if (file.fileValidationError) {
    return file.fileValidationError;
  }

  if (file.extractionError) {
    return file.extractionError;
  }

  if (file.validationStatus === 'error') {
    return 'Validation failed';
  }

  return undefined;
}

/**
 * Get warning message for a file
 *
 * Checks for:
 * - Existing photo (will be replaced)
 * - Duplicate roll number
 *
 * @param file - Image file preview
 * @returns Warning message or undefined if no warning
 */
export function getFileWarningMessage(
  file: ImageFilePreview
): string | undefined {
  if (file.isDuplicate && !file.isSelectedDuplicate) {
    return 'Duplicate roll number (not selected)';
  }

  if (file.isDuplicate && file.isSelectedDuplicate) {
    return 'Duplicate roll number (selected for upload)';
  }

  if (file.existingPhotoUrl) {
    return 'Will replace existing photo';
  }

  return undefined;
}

/**
 * Check if bulk upload is ready to proceed
 *
 * Requirements:
 * - At least one file selected
 * - No selected files have critical errors
 * - All selected files have matched learners
 *
 * @param files - Array of image file previews
 * @returns True if ready to upload, false otherwise
 */
export function isBulkUploadReady(files: ImageFilePreview[]): boolean {
  const selectedFiles = files.filter((f) => f.selected);

  // Must have at least one selected file
  if (selectedFiles.length === 0) return false;

  // No selected files should have errors
  const hasErrors = selectedFiles.some((f) => f.validationStatus === 'error');
  if (hasErrors) return false;

  // All selected files must have learner IDs
  const allHaveLearners = selectedFiles.every((f) => f.learnerId);
  if (!allHaveLearners) return false;

  return true;
}

/**
 * Generate CSV content for failed uploads
 *
 * Creates a CSV string with columns: Filename, Roll Number, Error
 *
 * @param failed - Array of failed upload records
 * @returns CSV content as string
 */
export function generateFailedUploadsCSV(
  failed: Array<{ filename: string; rollNumber?: string; error: string }>
): string {
  // CSV header
  const header = ['Filename', 'Roll Number', 'Error'].join(',');

  // CSV rows
  const rows = failed.map((record) => {
    const filename = record.filename;
    const rollNumber = record.rollNumber || 'N/A';
    const error = `"${record.error.replace(/"/g, '""')}"`;  // Escape quotes

    return [filename, rollNumber, error].join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Download CSV file in browser
 *
 * Creates a blob and triggers download via temporary anchor element
 *
 * @param csvContent - CSV content as string
 * @param filename - Desired filename (default: failed-uploads-{date}.csv)
 */
export function downloadCSV(csvContent: string, filename?: string): void {
  const defaultFilename = `failed-uploads-${new Date().toISOString().split('T')[0]}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || defaultFilename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);
}
