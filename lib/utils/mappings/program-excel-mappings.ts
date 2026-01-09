// lib/utils/mappings/program-excel-mappings.ts

/**
 * Excel Import/Export Mappings for Program Module
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

export const EXCEL_PROGRAM_TYPES = ['UG', 'PG', 'Ph.D'];
export const EXCEL_PATTERN_TYPES = ['Year', 'Semester'];
export const EXCEL_PART_TIME = ['Yes', 'No'];
export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'];

// ============================================================================
// LABEL TO VALUE MAPPINGS (case-insensitive)
// ============================================================================

export const PROGRAM_TYPE_MAP: Record<string, string> = {
  ug: 'UG',
  pg: 'PG',
  'ph.d': 'Ph.D',
  'phd': 'Ph.D',
  'ph d': 'Ph.D',
  'ph. d': 'Ph.D',
  'ph. d.': 'Ph.D',
  'ph.d.': 'Ph.D'
};

export const PATTERN_TYPE_MAP: Record<string, string> = {
  year: 'Year',
  semester: 'Semester',
  sem: 'Semester'
};

export const PART_TIME_MAP: Record<string, string> = {
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
  programType: {
    UG: 'UG',
    PG: 'PG',
    'Ph.D': 'Ph.D'
  },
  patternType: {
    Year: 'Year',
    Semester: 'Semester'
  },
  isPartTime: {
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
  type: 'programType' | 'patternType' | 'isPartTime' | 'isActive'
): string | null {
  if (!label) return null;

  const normalized = label.toLowerCase().trim();

  switch (type) {
    case 'programType':
      return PROGRAM_TYPE_MAP[normalized] || null;
    case 'patternType':
      return PATTERN_TYPE_MAP[normalized] || null;
    case 'isPartTime':
      return PART_TIME_MAP[normalized] || null;
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
  type: 'programType' | 'patternType' | 'isPartTime' | 'isActive'
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
  type: 'programType' | 'patternType' | 'isPartTime' | 'isActive'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Gets all valid labels for a field type
 * @param type - Field type
 * @returns Array of valid display labels
 */
export function getValidLabels(
  type: 'programType' | 'patternType' | 'isPartTime' | 'isActive'
): string[] {
  switch (type) {
    case 'programType':
      return EXCEL_PROGRAM_TYPES;
    case 'patternType':
      return EXCEL_PATTERN_TYPES;
    case 'isPartTime':
      return EXCEL_PART_TIME;
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
  type: 'programType' | 'patternType' | 'isPartTime' | 'isActive',
  rowNumber: number
): string {
  const validLabels = getValidLabels(type);
  const fieldName = type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  return `Row ${rowNumber}: Invalid ${fieldName} "${label}". Must be one of: ${validLabels.join(', ')}`;
}
