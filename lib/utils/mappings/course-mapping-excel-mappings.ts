// lib/utils/mappings/course-mapping-excel-mappings.ts

/**
 * Excel Import/Export Mappings for Course Mappings Module
 *
 * This file centralizes all dropdown value mappings between Excel and database for course mappings.
 * Ensures case-insensitive validation and consistent error messages.
 */

// ============================================================================
// EXCEL DROPDOWN VALUES (Display labels used in Excel templates)
// ============================================================================

/**
 * Status dropdown values for "Is Active" column
 */
export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'] as const;

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Maps a case-insensitive Excel label to its database value
 *
 * @param label - The label from Excel (case-insensitive)
 * @param type - The field type ('isActive')
 * @returns Database value or null if invalid
 */
export function mapLabelToValue(
  label: string,
  type: 'isActive'
): string | null {
  const normalized = label.trim().toLowerCase();

  switch (type) {
    case 'isActive':
      if (normalized === 'active') return 'true';
      if (normalized === 'inactive') return 'false';
      return null;

    default:
      return null;
  }
}

/**
 * Maps a database value back to its Excel display label
 *
 * @param value - The database value
 * @param type - The field type
 * @returns Excel display label
 */
export function mapValueToLabel(value: string, type: 'isActive'): string {
  switch (type) {
    case 'isActive':
      return value === 'true' ? 'Active' : 'Inactive';

    default:
      return value;
  }
}

/**
 * Validates if a label is valid for the given type
 *
 * @param label - The label to validate
 * @param type - The field type
 * @returns true if valid, false otherwise
 */
export function isValidLabel(label: string, type: 'isActive'): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Gets all valid labels for a field type
 *
 * @param type - The field type
 * @returns Array of valid labels
 */
export function getValidLabels(type: 'isActive'): readonly string[] {
  switch (type) {
    case 'isActive':
      return EXCEL_IS_ACTIVE;

    default:
      return [];
  }
}

/**
 * Generates a user-friendly error message for invalid dropdown values
 *
 * @param invalidValue - The invalid value from Excel
 * @param type - The field type
 * @param rowNumber - The row number in Excel
 * @returns Formatted error message
 */
export function getInvalidLabelError(
  invalidValue: string,
  type: 'isActive',
  rowNumber: number
): string {
  const validLabels = getValidLabels(type);
  const fieldName = type === 'isActive' ? 'Is Active' : type;

  return `Row ${rowNumber}: Invalid value "${invalidValue}" for ${fieldName}. Valid options: ${validLabels.join(', ')}`;
}
