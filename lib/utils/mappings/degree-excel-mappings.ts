// lib/utils/mappings/degree-excel-mappings.ts

/**
 * Excel Import/Export Mappings for Degree Module
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

export const EXCEL_DEGREE_TYPES = ['UG', 'PG'];
export const EXCEL_IS_ACTIVE = ['Active', 'Inactive'];

// ============================================================================
// LABEL TO VALUE MAPPINGS (case-insensitive)
// ============================================================================

export const DEGREE_TYPE_MAP: Record<string, string> = {
  ug: 'ug',
  pg: 'pg'
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
  degreeType: {
    ug: 'UG',
    pg: 'PG'
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
 * @param label - Display label from Excel (e.g., "UG", "ug", "Ug")
 * @param type - Field type ('degreeType', 'isActive')
 * @returns Database value or null if invalid
 */
export function mapLabelToValue(
  label: string,
  type: 'degreeType' | 'isActive'
): string | null {
  if (!label) return null;

  const normalized = label.toLowerCase().trim();

  switch (type) {
    case 'degreeType':
      return DEGREE_TYPE_MAP[normalized] || null;
    case 'isActive':
      return IS_ACTIVE_MAP[normalized] || null;
    default:
      return null;
  }
}

/**
 * Maps database value to Excel display label
 * @param value - Database value (e.g., 'ug', 'true')
 * @param type - Field type
 * @returns Display label or the original value if no mapping exists
 */
export function mapValueToLabel(
  value: string,
  type: 'degreeType' | 'isActive'
): string {
  if (!value) return '';

  const maps = VALUE_TO_LABEL_MAP[type];
  return (maps as any)[value] || value;
}

/**
 * Validates if a label is valid for the given type
 * @param label - Display label to validate
 * @param type - Field type
 * @returns true if valid, false otherwise
 */
export function isValidLabel(
  label: string,
  type: 'degreeType' | 'isActive'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Gets all valid labels for a field type
 * @param type - Field type
 * @returns Array of valid display labels
 */
export function getValidLabels(
  type: 'degreeType' | 'isActive'
): string[] {
  switch (type) {
    case 'degreeType':
      return EXCEL_DEGREE_TYPES;
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
  type: 'degreeType' | 'isActive',
  rowNumber: number
): string {
  const validLabels = getValidLabels(type);
  const fieldName = type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  return `Row ${rowNumber}: Invalid ${fieldName} "${label}". Must be one of: ${validLabels.join(', ')}`;
}
