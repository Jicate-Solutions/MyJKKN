// lib/utils/mappings/department-excel-mappings.ts

/**
 * Excel Mapping Utilities for Department Import/Export
 *
 * Departments module has:
 * - No enum dropdowns (simple module)
 * - FK relationships: counselling_code (institutions), degree_id (degrees)
 * - Only status (Active/Inactive) mapping needed
 */

// ============================================================================
// STATUS MAPPING (Active/Inactive)
// ============================================================================

export const STATUS_MAPPING: Record<string, string> = {
  'active': 'true',
  'inactive': 'false',
  'true': 'true',
  'false': 'false',
  '1': 'true',
  '0': 'false',
  'yes': 'true',
  'no': 'false'
};

export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'];

/**
 * Maps Excel labels to database values
 */
export function mapLabelToValue(
  label: string,
  type: 'isActive'
): string | null {
  if (!label) return null;

  const normalized = label.toLowerCase().trim();

  if (type === 'isActive') {
    return STATUS_MAPPING[normalized] || null;
  }

  return null;
}

/**
 * Maps database values to Excel labels
 */
export function mapValueToLabel(value: string | boolean, type: 'isActive'): string {
  if (type === 'isActive') {
    if (typeof value === 'boolean') {
      return value ? 'Active' : 'Inactive';
    }
    return value === 'true' || value === '1' ? 'Active' : 'Inactive';
  }

  return String(value);
}

/**
 * Generates error message for invalid dropdown value
 */
export function getInvalidLabelError(
  label: string,
  type: 'isActive',
  row: number
): string {
  if (type === 'isActive') {
    return `Row ${row}: Invalid status "${label}". Must be "Active" or "Inactive"`;
  }

  return `Row ${row}: Invalid value "${label}"`;
}

/**
 * Helper function to map status string to boolean
 */
export function mapStatusToBoolean(status: string): boolean {
  if (!status) return true; // Default to active

  const normalized = status.toLowerCase().trim();
  return STATUS_MAPPING[normalized] === 'true';
}

/**
 * Helper function to get validation error message
 */
export function getValidationError(field: string, value: string): string {
  switch (field) {
    case 'counselling_code':
      return `Counselling code "${value}" not found`;
    case 'degree_id':
      return `Degree ID "${value}" not found`;
    case 'department_code':
      return 'Department code is required';
    case 'department_name':
      return 'Department name is required';
    default:
      return `Invalid value for ${field}`;
  }
}
