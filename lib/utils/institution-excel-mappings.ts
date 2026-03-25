// lib/utils/institution-excel-mappings.ts

/**
 * Excel Import/Export Mappings for Institution Module
 *
 * This utility provides bidirectional mapping between:
 * - Display labels (shown in Excel and UI)
 * - Database values (stored in Supabase)
 *
 * Usage:
 * - Export: Use display labels in Excel dropdowns
 * - Import: Map display labels back to database values (case-insensitive)
 */

import {
  INSTITUTION_TYPES,
  INSTITUTION_CATEGORIES,
  TIMETABLE_TYPES
} from '@/lib/constants/institutions';

// ============================================================================
// DISPLAY LABELS (for Excel dropdowns)
// ============================================================================

export const EXCEL_INSTITUTION_TYPES = INSTITUTION_TYPES.map((t) => t.label);
export const EXCEL_CATEGORIES = INSTITUTION_CATEGORIES.map((c) => c.label);
export const EXCEL_TIMETABLE_TYPES = TIMETABLE_TYPES.map((t) => t.label);

// ============================================================================
// LABEL TO VALUE MAPPINGS (case-insensitive)
// ============================================================================

export const INSTITUTION_TYPE_MAP: Record<string, string> = {
  self: 'self',
  autonomous: 'autonomous',
  aided: 'aided'
};

export const CATEGORY_MAP: Record<string, string> = {
  ug: 'ug',
  pg: 'pg',
  'ug & pg': 'ug_pg',
  'ug_pg': 'ug_pg',
  'ug&pg': 'ug_pg',
  'ug/pg': 'ug_pg'
};

export const TIMETABLE_TYPE_MAP: Record<string, string> = {
  'day order': 'day_order',
  'week order': 'week_order',
  day_order: 'day_order',
  week_order: 'week_order',
  dayorder: 'day_order',
  weekorder: 'week_order'
};

// ============================================================================
// VALUE TO LABEL MAPPINGS (for display)
// ============================================================================

export const VALUE_TO_LABEL_MAP = {
  institutionType: {
    self: 'Self',
    autonomous: 'Autonomous',
    aided: 'Aided'
  },
  category: {
    ug: 'UG',
    pg: 'PG',
    ug_pg: 'UG & PG'
  },
  timetableType: {
    day_order: 'Day Order',
    week_order: 'Week Order'
  }
} as const;

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Maps Excel display label to database value (case-insensitive)
 * @param label - Display label from Excel (e.g., "Self", "SELF", "self")
 * @param type - Field type ('institutionType', 'category', 'timetableType')
 * @returns Database value or null if invalid
 */
export function mapLabelToValue(
  label: string,
  type: 'institutionType' | 'category' | 'timetableType'
): string | null {
  if (!label) return null;

  const normalized = label.toLowerCase().trim();

  switch (type) {
    case 'institutionType':
      return INSTITUTION_TYPE_MAP[normalized] || null;
    case 'category':
      return CATEGORY_MAP[normalized] || null;
    case 'timetableType':
      return TIMETABLE_TYPE_MAP[normalized] || null;
    default:
      return null;
  }
}

/**
 * Maps database value to Excel display label
 * @param value - Database value (e.g., 'self', 'ug_pg')
 * @param type - Field type
 * @returns Display label or the original value if no mapping exists
 */
export function mapValueToLabel(
  value: string,
  type: 'institutionType' | 'category' | 'timetableType'
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
  type: 'institutionType' | 'category' | 'timetableType'
): boolean {
  return mapLabelToValue(label, type) !== null;
}

/**
 * Gets all valid labels for a field type
 * @param type - Field type
 * @returns Array of valid display labels
 */
export function getValidLabels(
  type: 'institutionType' | 'category' | 'timetableType'
): string[] {
  switch (type) {
    case 'institutionType':
      return EXCEL_INSTITUTION_TYPES;
    case 'category':
      return EXCEL_CATEGORIES;
    case 'timetableType':
      return EXCEL_TIMETABLE_TYPES;
    default:
      return [];
  }
}

// ============================================================================
// VALIDATION ERROR MESSAGES
// ============================================================================

export function getInvalidLabelError(
  label: string,
  type: 'institutionType' | 'category' | 'timetableType',
  rowNumber: number
): string {
  const validLabels = getValidLabels(type);
  const fieldName = type
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  return `Row ${rowNumber}: Invalid ${fieldName} "${label}". Must be one of: ${validLabels.join(', ')}`;
}
