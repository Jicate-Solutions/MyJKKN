// lib/utils/ims-item-excel-mappings.ts
//
// Pure helper functions for mapping Excel cell values to IMS item fields.
// No side-effects, no imports from project code — safe to use in both
// API routes and client components.

export type ImsItemType =
  | 'consumable'
  | 'equipment'
  | 'medicine'
  | 'stationery'
  | 'other';

export const IMS_ITEM_TYPES: ImsItemType[] = [
  'consumable',
  'equipment',
  'medicine',
  'stationery',
  'other',
];

export const IMS_GST_RATES = [0, 5, 12, 18, 28] as const;
export type ImsGstRate = (typeof IMS_GST_RATES)[number];

// ============================================================================
// CELL VALUE EXTRACTION
// ============================================================================

/**
 * Converts any ExcelJS cell value to a trimmed string.
 * Handles rich-text objects, dates, formulas, etc.
 */
export function getCellStringValue(cell: any): string {
  const v = cell?.value ?? cell;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'YES' : 'NO';
  // ExcelJS rich text object: { richText: [{text: '...'}] }
  if (v && typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map((r: any) => r.text ?? '').join('').trim();
  }
  // ExcelJS formula result: { formula: '...', result: '...' }
  if (v && typeof v === 'object' && 'result' in v) {
    return getCellStringValue(v.result);
  }
  // Date
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).trim();
}

// ============================================================================
// BOOLEAN / YES-NO PARSING
// ============================================================================

/**
 * Maps "Yes/No/TRUE/FALSE/1/0/Active/Inactive" → boolean.
 * Defaults to `defaultValue` when blank.
 */
export function parseYesNo(raw: string, defaultValue = false): boolean {
  const s = raw.trim().toUpperCase();
  if (!s) return defaultValue;
  if (['YES', 'TRUE', '1', 'Y', 'ACTIVE', 'ON'].includes(s)) return true;
  if (['NO', 'FALSE', '0', 'N', 'INACTIVE', 'OFF'].includes(s)) return false;
  return defaultValue;
}

// ============================================================================
// NUMERIC PARSING
// ============================================================================

/**
 * Parses a cell value as a non-negative number.
 * Returns `null` if the value cannot be parsed.
 */
export function parseNumericCell(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) || n < 0 ? null : n;
}

/**
 * Parses a cell value as a non-negative integer.
 * Returns `null` if unparseable; returns `defaultValue` when blank.
 */
export function parseIntCell(raw: string, defaultValue: number): number {
  if (!raw.trim()) return defaultValue;
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (!cleaned) return defaultValue;
  const n = parseInt(cleaned, 10);
  return isNaN(n) || n < 0 ? defaultValue : n;
}

// ============================================================================
// GST RATE PARSING
// ============================================================================

/**
 * Parses a GST rate cell (e.g. "18", "18%", "18.0") → valid IMS GST rate.
 * Returns `null` if the value is not one of [0, 5, 12, 18, 28].
 */
export function parseGstRate(raw: string): ImsGstRate | null {
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10) as ImsGstRate;
  return (IMS_GST_RATES as readonly number[]).includes(n) ? n : null;
}

// ============================================================================
// ITEM TYPE PARSING
// ============================================================================

/**
 * Maps a human-readable item type string to the DB enum value.
 * Case-insensitive; strips spaces.
 */
export function parseItemType(raw: string): ImsItemType | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '') as ImsItemType;
  return IMS_ITEM_TYPES.includes(s) ? s : null;
}

// ============================================================================
// UNIT DISPLAY STRING HELPERS
// ============================================================================

/**
 * Builds the display string used in Excel dropdowns:
 *   "Piece (pcs)"
 */
export function buildUnitDisplay(name: string, abbreviation: string): string {
  return `${name} (${abbreviation})`;
}

/**
 * Common unit abbreviation aliases → standard abbreviation.
 * Enables fuzzy matching for user-entered values like "Gm" → "g".
 */
const UNIT_ALIASES: Record<string, string> = {
  'gm': 'g', 'gms': 'g', 'grm': 'g', 'grams': 'g', 'gram': 'g',
  'kgs': 'kg', 'kilogram': 'kg', 'kilograms': 'kg',
  'ltr': 'l', 'lt': 'l', 'litre': 'l', 'litres': 'l', 'liter': 'l', 'liters': 'l',
  'ml': 'ml', 'mls': 'ml', 'millilitre': 'ml', 'milliliter': 'ml',
  'pc': 'pcs', 'nos': 'pcs', 'no': 'pcs', 'ea': 'pcs', 'each': 'pcs', 'piece': 'pcs', 'pieces': 'pcs',
  'bottle': 'btl', 'bottles': 'btl',
  'dz': 'doz', 'dozen': 'doz', 'dozns': 'doz',
  'pkt': 'pack', 'pkts': 'pack', 'packet': 'pack', 'packets': 'pack',
  'pr': 'pair', 'pairs': 'pair',
  'rm': 'ream', 'reams': 'ream',
  'rll': 'roll', 'rolls': 'roll',
  'bx': 'box', 'boxes': 'box',
  'sets': 'set',
  'mtr': 'm', 'mtrs': 'm', 'meter': 'm', 'meters': 'm', 'metres': 'm', 'metre': 'm',
  'cms': 'cm', 'centimeter': 'cm', 'centimeters': 'cm',
};

/**
 * Parses a user-entered unit cell (display string OR abbreviation OR name)
 * against a map of displayLower → uuid and abbreviationLower → uuid.
 *
 * Resolution order:
 *   1. Full display string e.g. "piece (pcs)"
 *   2. Abbreviation e.g. "pcs"
 *   3. Name prefix e.g. "piece"
 *   4. Alias lookup e.g. "gm" → "g" → Gram
 *
 * Returns `null` when blank; undefined when not resolved (allows caller to
 * distinguish "user left it blank" from "user typed something wrong").
 */
export function resolveUnitId(
  raw: string,
  byDisplay: Map<string, string>,  // "piece (pcs)" → uuid
  byAbbr: Map<string, string>,     // "pcs" → uuid
  byName: Map<string, string>,     // "piece" → uuid
): string | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null; // blank → intentionally empty

  const lower = trimmed.toLowerCase();

  // 1. Exact display string
  if (byDisplay.has(lower)) return byDisplay.get(lower)!;

  // 2. Abbreviation
  if (byAbbr.has(lower)) return byAbbr.get(lower)!;

  // 3. Name
  if (byName.has(lower)) return byName.get(lower)!;

  // 4. Alias lookup — map common variants to standard abbreviations
  const alias = UNIT_ALIASES[lower];
  if (alias && byAbbr.has(alias)) return byAbbr.get(alias)!;

  return undefined; // not resolved
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Returns a formatted validation error message suitable for the ImportResult.
 */
export function validationError(
  row: number,
  field: string,
  message: string,
): { row: number; field: string; message: string } {
  return { row, field, message: `Row ${row}: ${field} — ${message}` };
}

// ============================================================================
// WORKSHEET RESOLUTION (for resilient import)
// ============================================================================

/**
 * Required column headers and their expected positions (1-indexed).
 * Labels are lowercase substrings — e.g. 'item code' matches 'Item Code *'.
 */
const IMS_REQUIRED_HEADER_CHECKS: { index: number; label: string }[] = [
  { index: 1,  label: 'item code' },
  { index: 2,  label: 'item name' },
  { index: 4,  label: 'category' },
  { index: 5,  label: 'item type' },
  { index: 6,  label: 'base unit' },
  { index: 11, label: 'gst rate' },
  { index: 12, label: 'cost price' },
  { index: 13, label: 'mrp' },
  { index: 14, label: 'selling price' },
];

const IMS_HEADER_MATCH_THRESHOLD = 6;

/**
 * Checks how many required IMS item headers match in a worksheet's row 1.
 * Uses case-insensitive substring matching.
 */
function matchImsItemHeaders(worksheet: any): number {
  const row = worksheet.getRow(1);
  if (!row) return 0;

  let matched = 0;
  for (const check of IMS_REQUIRED_HEADER_CHECKS) {
    const cellValue = getCellStringValue(row.getCell(check.index).value).toLowerCase();
    if (cellValue.includes(check.label)) {
      matched++;
    }
  }
  return matched;
}

/**
 * Multi-step worksheet resolution for IMS import.
 *
 * Resolution order:
 *   1. Exact name match: 'Items'
 *   2. Case-insensitive name match
 *   3. First visible worksheet that passes header validation (>=6/9)
 *   4. Any worksheet that passes header validation
 *
 * Returns { worksheet, method } or null if no suitable worksheet found.
 */
export function resolveImsWorksheet(
  workbook: any,
): { worksheet: any; method: string } | null {
  // 1. Exact name match (fast path for template users)
  const exact = workbook.getWorksheet('Items');
  if (exact) return { worksheet: exact, method: 'exact-name' };

  // 2. Case-insensitive name match
  for (const ws of workbook.worksheets) {
    if (ws.name.toLowerCase().trim() === 'items') {
      return { worksheet: ws, method: 'case-insensitive-name' };
    }
  }

  // 3. First visible worksheet with matching headers
  for (const ws of workbook.worksheets) {
    if (ws.state === 'visible' || !ws.state) {
      if (matchImsItemHeaders(ws) >= IMS_HEADER_MATCH_THRESHOLD) {
        return { worksheet: ws, method: 'header-match-visible' };
      }
    }
  }

  // 4. Any worksheet with matching headers
  for (const ws of workbook.worksheets) {
    if (matchImsItemHeaders(ws) >= IMS_HEADER_MATCH_THRESHOLD) {
      return { worksheet: ws, method: 'header-match-any' };
    }
  }

  return null;
}
