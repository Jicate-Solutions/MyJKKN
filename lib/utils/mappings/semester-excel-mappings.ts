// lib/utils/mappings/semester-excel-mappings.ts

/**
 * Excel Import/Export Mappings for Semester Module
 *
 * This utility provides bidirectional mapping between:
 * - Display labels (shown in Excel and UI)
 * - Database values (stored in Supabase)
 *
 * Usage:
 * - Export: Use display labels in Excel dropdowns
 * - Import: Map display labels back to database values (case-insensitive)
 */

// ============================================================================
// DISPLAY LABELS (for Excel dropdowns)
// ============================================================================

export const EXCEL_SEMESTER_TYPES = ['Even', 'Odd'];
export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'];
export const EXCEL_YES_NO = ['Yes', 'No'];

// ============================================================================
// LABEL TO VALUE MAPPINGS (case-insensitive)
// ============================================================================

export const SEMESTER_TYPE_MAP: Record<string, string> = {
  even: 'even',
  odd: 'odd'
};

export const YES_NO_MAP: Record<string, string> = {
  yes: 'true',
  no: 'false',
  true: 'true',
  false: 'false',
  '1': 'true',
  '0': 'false',
  y: 'true',
  n: 'false'
};

export const IS_ACTIVE_MAP: Record<string, string> = {
  active: 'true',
  inactive: 'false',
  true: 'true',
  false: 'false',
  '1': 'true',
  '0': 'false',
  yes: 'true',
  no: 'false'
};

// ============================================================================
// VALUE TO LABEL MAPPINGS (for display)
// ============================================================================

export const VALUE_TO_LABEL_MAP = {
  semesterType: {
    even: 'Even',
    odd: 'Odd'
  },
  yesNo: {
    true: 'Yes',
    false: 'No'
  },
  isActive: {
    true: 'Active',
    false: 'Inactive'
  }
} as const;

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Maps Excel display label to database value (case-insensitive)
 * @param label - Display label from Excel
 * @param type - Field type
 * @returns Database value or null if invalid
 */
export function mapLabelToValue(
  label: string,
  type: 'semesterType' | 'yesNo' | 'isActive'
): string | null {
  if (!label) return null;

  const normalized = label.toLowerCase().trim();

  switch (type) {
    case 'semesterType':
      return SEMESTER_TYPE_MAP[normalized] || null;
    case 'yesNo':
      return YES_NO_MAP[normalized] || null;
    case 'isActive':
      return IS_ACTIVE_MAP[normalized] || null;
    default:
      return null;
  }
}

/**
 * Maps database value to Excel display label
 * @param value - Database value
 * @param type - Field type
 * @returns Display label or the original value if no mapping exists
 */
export function mapValueToLabel(
  value: string | boolean,
  type: 'semesterType' | 'yesNo' | 'isActive'
): string {
  if (value === null || value === undefined) return '';

  // Convert boolean to string for mapping
  const stringValue = String(value);

  const maps = VALUE_TO_LABEL_MAP[type];
  return (maps as any)[stringValue] || stringValue;
}

/**
 * Validates if a label is valid for the given type
 * @param label - Display label to validate
 * @param type - Field type
 * @returns true if valid, false otherwise
 */
export function isValidLabel(
  label: string,
  type: 'semesterType' | 'yesNo' | 'isActive'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Gets all valid labels for a field type
 * @param type - Field type
 * @returns Array of valid display labels
 */
export function getValidLabels(
  type: 'semesterType' | 'yesNo' | 'isActive'
): string[] {
  switch (type) {
    case 'semesterType':
      return EXCEL_SEMESTER_TYPES;
    case 'yesNo':
      return EXCEL_YES_NO;
    case 'isActive':
      return EXCEL_IS_ACTIVE;
    default:
      return [];
  }
}

// ============================================================================
// VALIDATION ERROR MESSAGES
// ============================================================================

export function getInvalidLabelError(
  label: string,
  type: 'semesterType' | 'yesNo' | 'isActive',
  rowNumber: number
): string {
  const validLabels = getValidLabels(type);
  const fieldName = type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  return `Row ${rowNumber}: Invalid ${fieldName} "${label}". Must be one of: ${validLabels.join(', ')}`;
}
