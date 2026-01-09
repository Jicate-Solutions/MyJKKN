// lib/utils/course-excel-mappings.ts

/**
 * Excel Import/Export Mappings for Courses Module
 *
 * Courses have no dropdown/enum fields, so this utility provides
 * basic helper functions for consistency with other modules.
 *
 * Database Fields:
 * - institution_id: UUID (FK to institutions table)
 * - course_code: TEXT (unique identifier, required)
 * - course_name: TEXT (required)
 * - is_active: BOOLEAN (default true)
 */

// No dropdown fields for courses, so no EXCEL_* constants needed

/**
 * Converts Excel "Active/Inactive" to database boolean
 */
export function mapStatusToBoolean(status: string): boolean {
  if (!status) return true;
  const normalized = status.toLowerCase().trim();
  return !['false', 'inactive', 'no', '0'].includes(normalized);
}

/**
 * Converts database boolean to Excel "Active/Inactive"
 */
export function mapBooleanToStatus(isActive: boolean): string {
  return isActive ? 'Active' : 'Inactive';
}

/**
 * Gets validation error message for invalid field
 */
export function getValidationError(
  field: string,
  value: string,
  rowNumber: number
): string {
  switch (field) {
    case 'institution_code':
      return `Row ${rowNumber}: Institution code "${value}" not found`;
    case 'course_code':
      return `Row ${rowNumber}: Course code must be 2-50 characters (A-Z, 0-9, -, _)`;
    case 'course_name':
      return `Row ${rowNumber}: Course name must be 2-255 characters`;
    case 'is_active':
      return `Row ${rowNumber}: Status must be Active/Inactive or true/false`;
    default:
      return `Row ${rowNumber}: Invalid value for ${field}`;
  }
}
