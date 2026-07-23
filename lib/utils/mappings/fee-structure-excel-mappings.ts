// lib/utils/mappings/fee-structure-excel-mappings.ts
//
// Pure module (NO DB access) for the fee-structure bulk Excel round-trip.
// The import route builds the `BulkResolveLookups` maps from the DB, then calls
// resolveRow() once per spreadsheet row to get a payload or a list of errors.

export const FEE_STRUCTURE_SHEET_NAME = 'Fee Structures';

// Fixed (non-amount) columns, left→right. Amount columns (one per active
// billing category, excluding transport/hostel) are appended dynamically by
// the template/export routes — their headers are the category names.
export const FIXED_HEADERS = [
  'Fee Structure ID',
  'Institution',
  'Degree',
  'Department',
  'Programme',
  'Admission Year',
  'Quota',
  'Gender',
  'Accommodation',
  'Communities',
  'Name',
  'Status',
  'Effective From',
  'Effective To',
  'Notes',
] as const;

export interface BulkResolveLookups {
  institutions: Map<string, string>;        // name(lower) -> institution_id (accessible only)
  degrees: Map<string, string>;             // `${institutionId}::${degreeName(lower)}` -> id
  departments: Map<string, string>;         // `${institutionId}::${degreeId}::${deptName(lower)}` -> id
  programmes: Map<string, string>;          // `${departmentId}::${programmeName(lower)}` -> id
  admissionYears: Map<string, string>;      // `${programmeId}::${yearName(lower)}` -> id
  quotas: Map<string, string>;              // name(lower) -> id
  accommodations: Map<string, string>;      // name(lower) AND code(lower) -> id (global lookup)
  communities: Map<string, string>;         // name(lower) -> id
  categoriesByName: Map<string, string>;    // category_name(lower) -> billing_category_id
  amountHeaders: string[];                   // category names, in column order
}

export interface BulkUpsertPayload {
  structure_id: string | null;
  institution_id: string;
  degree_id: string;
  department_id: string;
  programme_id: string;
  admission_year_id: string;
  quota_id: string;
  gender: string | null;
  accommodation_type_id: string | null;
  community_category_ids: string[];
  name: string;
  status: 'draft' | 'active' | 'archived';
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  items: Array<{ billing_category_id: string; amount: number; is_optional: boolean }>;
}

export interface RowResolution {
  rowNumber: number;
  name: string;
  payload?: BulkUpsertPayload;
  errors: string[];
}

const norm = (v: unknown): string => String(v ?? '').trim();
const lower = (v: unknown): string => norm(v).toLowerCase();

export function splitCommunities(cell: unknown): string[] {
  return norm(cell).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Returns the number, null for blank, or NaN for non-numeric. */
export function parseAmountCell(cell: unknown): number | null {
  const s = norm(cell);
  if (s === '') return null;
  return Number(s.replace(/,/g, ''));
}

export function normalizeGender(cell: unknown): string | null | 'INVALID' {
  const s = norm(cell).toUpperCase();
  if (s === '' || s === 'ANY' || s === 'ANY GENDER') return null;
  if (s === 'MALE' || s === 'FEMALE') return s;
  return 'INVALID';
}

export function normalizeStatus(cell: unknown): 'draft' | 'active' | 'archived' | 'INVALID' {
  const s = lower(cell);
  if (s === '') return 'draft';
  if (s === 'draft' || s === 'active' || s === 'archived') return s;
  return 'INVALID';
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const fmtYMD = (y: number, m: number, d: number): string => `${y}-${pad2(m)}-${pad2(d)}`;

/** Validates a calendar date and returns it as yyyy-mm-dd, or 'INVALID'.
 *  Round-trips through Date.UTC so impossible dates (e.g. 2026-02-30) are rejected. */
function validYMD(y: number, m: number, d: number): string | 'INVALID' {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return 'INVALID';
  if (m < 1 || m > 12 || d < 1 || d > 31) return 'INVALID';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return 'INVALID';
  return fmtYMD(y, m, d);
}

/**
 * Parses a spreadsheet date cell to a yyyy-mm-dd string (null for blank,
 * 'INVALID' otherwise). Tolerant of every shape a date can arrive in:
 *
 *  - A real `Date` object (XLSX read with `cellDates: true`). SheetJS aligns
 *    the serial to LOCAL time, so we read LOCAL Y/M/D — using `toISOString()`
 *    here would shift the day by the server's UTC offset (an off-by-one bug
 *    on any non-UTC host).
 *  - A bare Excel serial `number` (date cell read WITHOUT cellDates) — Excel
 *    silently converts exported date text into serials the moment the file is
 *    opened and saved, which is the exact path that broke bulk-edit re-uploads.
 *  - `yyyy-mm-dd`, an ISO datetime (`yyyy-mm-ddThh:mm…`), `yyyy/mm/dd`, and the
 *    human formats `dd-mm-yyyy` / `dd/mm/yyyy` / `dd.mm.yyyy` (day-first, the
 *    Indian convention; only swapped to month-first when the day field is > 12).
 */
export function parseDateCell(cell: unknown): string | null | 'INVALID' {
  if (cell instanceof Date) {
    return isNaN(cell.getTime())
      ? 'INVALID'
      : fmtYMD(cell.getFullYear(), cell.getMonth() + 1, cell.getDate());
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    // Excel serial → Unix ms. 25569 = days between Excel's 1899-12-30 epoch
    // (which already absorbs the 1900 leap-year bug) and 1970-01-01.
    const d = new Date((Math.floor(cell) - 25569) * 86400000);
    return isNaN(d.getTime())
      ? 'INVALID'
      : validYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const s = norm(cell);
  if (s === '') return null;

  // ISO datetime (date portion only) — e.g. timestamptz strings.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/);
  if (iso) return validYMD(+iso[1], +iso[2], +iso[3]);

  // Year-first: yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);

  // Day-first: dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    let day = +m[1];
    let mon = +m[2];
    if (day <= 12 && mon > 12) [day, mon] = [mon, day]; // unambiguous mm/dd/yyyy
    return validYMD(+m[3], mon, day);
  }

  return 'INVALID';
}

export function resolveRow(
  raw: Record<string, unknown>,
  rowNumber: number,
  lookups: BulkResolveLookups,
): RowResolution {
  const errors: string[] = [];
  const name = norm(raw['Name']);
  const structureId = norm(raw['Fee Structure ID']) || null;

  const instId = lookups.institutions.get(lower(raw['Institution']));
  if (!instId) errors.push(`Institution "${norm(raw['Institution'])}" not found or not accessible`);

  const degId = instId ? lookups.degrees.get(`${instId}::${lower(raw['Degree'])}`) : undefined;
  if (instId && !degId) errors.push(`Degree "${norm(raw['Degree'])}" not found in that institution`);

  const deptId = instId && degId
    ? lookups.departments.get(`${instId}::${degId}::${lower(raw['Department'])}`)
    : undefined;
  if (instId && degId && !deptId) errors.push(`Department "${norm(raw['Department'])}" not found`);

  const progId = deptId ? lookups.programmes.get(`${deptId}::${lower(raw['Programme'])}`) : undefined;
  if (deptId && !progId) errors.push(`Programme "${norm(raw['Programme'])}" not found`);

  const yearId = instId
    ? lookups.admissionYears.get(`${instId}::${lower(raw['Admission Year'])}`)
    : undefined;
  if (instId && !yearId) errors.push(`Admission Year "${norm(raw['Admission Year'])}" not found for that institution`);

  const quotaId = lookups.quotas.get(lower(raw['Quota']));
  if (!quotaId) errors.push(`Quota "${norm(raw['Quota'])}" not found`);

  const gender = normalizeGender(raw['Gender']);
  if (gender === 'INVALID') errors.push('Gender must be Male, Female, or blank');

  // Accommodation is an optional matching dimension (parallel to gender):
  // blank or "Any" = NULL = applies to any accommodation.
  const accommodationRaw = norm(raw['Accommodation']);
  let accommodationTypeId: string | null = null;
  if (accommodationRaw !== '' && !/^any( accommodation)?$/i.test(accommodationRaw)) {
    const aid = lookups.accommodations.get(accommodationRaw.toLowerCase());
    if (aid) accommodationTypeId = aid;
    else errors.push(`Accommodation "${accommodationRaw}" not found (use the catalog name, e.g. Hostel / Day Scholar, or blank for Any)`);
  }

  const status = normalizeStatus(raw['Status']);
  if (status === 'INVALID') errors.push('Status must be draft, active, or archived');

  const communityNames = splitCommunities(raw['Communities']);
  const communityIds: string[] = [];
  for (const cn of communityNames) {
    const cid = lookups.communities.get(cn.toLowerCase());
    if (cid) communityIds.push(cid);
    else errors.push(`Community "${cn}" not found`);
  }
  if (communityNames.length === 0) errors.push('At least one community is required');

  const effFrom = parseDateCell(raw['Effective From']);
  const effTo = parseDateCell(raw['Effective To']);
  if (effFrom === 'INVALID') errors.push('Effective From is not a valid date (use e.g. 2026-06-11 or 11/06/2026)');
  if (effTo === 'INVALID') errors.push('Effective To is not a valid date (use e.g. 2026-06-11 or 11/06/2026)');
  if (typeof effFrom === 'string' && typeof effTo === 'string' && effTo < effFrom) {
    errors.push('Effective To must be on/after Effective From');
  }

  if (name.length < 2) errors.push('Name must be at least 2 characters');

  const items: BulkUpsertPayload['items'] = [];
  for (const header of lookups.amountHeaders) {
    const parsed = parseAmountCell(raw[header]);
    if (parsed === null) continue; // blank = not included
    if (Number.isNaN(parsed) || parsed < 0) { errors.push(`"${header}" must be a number ≥ 0`); continue; }
    const catId = lookups.categoriesByName.get(header.toLowerCase());
    if (!catId) { errors.push(`Fee category "${header}" not found`); continue; }
    items.push({ billing_category_id: catId, amount: parsed, is_optional: false });
  }
  if (items.length === 0) errors.push('At least one fee amount is required');

  if (errors.length > 0) return { rowNumber, name, errors };

  return {
    rowNumber, name, errors: [],
    payload: {
      structure_id: structureId,
      institution_id: instId!, degree_id: degId!, department_id: deptId!,
      programme_id: progId!, admission_year_id: yearId!, quota_id: quotaId!,
      gender: gender as string | null,
      accommodation_type_id: accommodationTypeId,
      community_category_ids: communityIds,
      name,
      status: status as 'draft' | 'active' | 'archived',
      notes: norm(raw['Notes']) || null,
      effective_from: (effFrom as string | null) ?? null,
      effective_to: (effTo as string | null) ?? null,
      items,
    },
  };
}
