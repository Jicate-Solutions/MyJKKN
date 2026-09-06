// lib/utils/mappings/fee-structure-excel-mappings.ts
//
// Pure module (NO DB access) for the fee-structure bulk Excel round-trip.
// The import route builds the `BulkResolveLookups` maps from the DB, then calls
// resolveRow() once per spreadsheet row to get a payload or a list of errors.

// The one implementation of "how big is instalment i of a ₹N fee" — the TS
// mirror of the SQL engine that sizes the bills. Pure (no client import), so
// this module stays DB-free, and the sheet is checked against the exact rupees
// a bill would carry rather than a re-derivation that could drift.
import { computeInstalmentAmounts } from '@/lib/services/billing/instalments/instalment-arithmetic';

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
  // Hostel tier (migration 20260910110000). Only meaningful when Accommodation
  // is Hostel, and REQUIRED there once Status is active — the DB guard
  // trg_fee_structure_hostel_categories_guard enforces the same rule.
  'Room Category',
  'Mess Category',
  'Communities',
  'Name',
  'Status',
  'Effective From',
  'Effective To',
  'Notes',
  // Appended, never inserted: the template route derives its data-validation
  // column letters from this array's INDEXES, so adding at the end shifts
  // nothing. Falls back to 30 when blank, matching the column default.
  'Default Due (Days)',
  // Also appended. Not a matching dimension -- no resolver reads package_type,
  // so unlike the six dimensions it stays editable on an UPDATE row.
  'Package Type',
] as const;

/**
 * 0-based header index → spreadsheet column letter (0 → 'A', 26 → 'AA').
 *
 * Both sheets attach their dropdowns by column LETTER, and both derive that
 * letter from the header array rather than hardcoding it. That is not
 * fastidiousness: inserting "Room Category"/"Mess Category" after
 * "Accommodation" once shifted Status from L to N, and the hardcoded letters
 * that survived the edit silently pinned the Status dropdown to the Communities
 * column. Shared here so the two call sites cannot drift apart, and so the
 * resulting letters can be asserted in a test.
 */
export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Column letter of a header on a sheet, or null when it is not on that sheet. */
export function headerColumn(headers: readonly string[], header: string): string | null {
  const idx = headers.indexOf(header);
  return idx < 0 ? null : columnLetter(idx);
}

export interface BulkResolveLookups {
  institutions: Map<string, string>;        // name(lower) -> institution_id (accessible only)
  degrees: Map<string, string>;             // `${institutionId}::${degreeName(lower)}` -> id
  departments: Map<string, string>;         // `${institutionId}::${degreeId}::${deptName(lower)}` -> id
  programmes: Map<string, string>;          // `${departmentId}::${programmeName(lower)}` -> id
  admissionYears: Map<string, string>;      // `${programmeId}::${yearName(lower)}` -> id
  quotas: Map<string, string>;              // name(lower) -> id
  accommodations: Map<string, string>;      // name(lower) AND code(lower) -> id (global lookup)
  /** accommodation_type_id of the 'hostel' code — drives the tier requirement. */
  hostelAccommodationId: string | null;
  roomCategories: Map<string, string>;      // hostel_categories.name(lower) -> canonical id
  messCategories: Map<string, string>;      // mess_categories.name(lower) -> canonical id
  communities: Map<string, string>;         // name(lower) -> id
  categoriesByName: Map<string, string>;    // category_name(lower) -> billing_category_id
  amountHeaders: string[];                   // category names, in column order
  /**
   * Statuses a payment may promote INTO — label(lower) AND code(lower) both map
   * to the code, so the sheet accepts either "Reserved" or "reserved".
   * Login-granting statuses are EXCLUDED at load time, mirroring
   * afsis_validate_status_target: granting a portal login is never automatic,
   * and a spreadsheet must not be the one place that rule can be bypassed.
   */
  learnerStatuses: Map<string, string>;
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
  hostel_category_id: string | null;
  mess_category_id: string | null;
  /**
   * Package / Non-Package classification. ABSENT means the sheet had no
   * "Package Type" column at all (an export taken before it existed) and the
   * RPC leaves the stored value alone; an explicit null means the operator
   * cleared the cell and wants it unclassified.
   */
  package_type?: 'package' | 'non_package' | null;
  community_category_ids: string[];
  name: string;
  status: 'draft' | 'active' | 'archived';
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  items: Array<{
    billing_category_id: string;
    amount: number;
    is_optional: boolean;
    /**
     * OMITTED when the sheet has no "Applies To" column, or left the cell
     * blank. The RPC then keeps the stored value (every_year on a new fee).
     * Sending a default here would silently re-bill a first-year-only fee in
     * every year of the course, on every re-import of an older workbook.
     */
    applies_to?: FeeAppliesTo;
    /** Only ever set alongside applies_to === 'specific_year'. */
    applies_year_of_study?: number | null;
  }>;
  /** Fallback due offset for items that set no date of their own. */
  default_due_offset_days?: number | null;
  /**
   * Per-item schedules from sheet 2. ABSENT (not empty) means "the sheet said
   * nothing about schedules" — the RPC then preserves whatever is configured.
   * That distinction is what lets an old sheet, or a sheet with no Schedules
   * tab, round-trip without destroying a schedule it cannot see.
   */
  item_schedules?: ItemScheduleConfig[];
}

export interface RowResolution {
  rowNumber: number;
  name: string;
  payload?: BulkUpsertPayload;
  errors: string[];
  /**
   * The structure columns as the SHEET spells them, carried through untouched.
   * The payload holds ids; ids cannot be shown to an operator, and inverting the
   * lookup maps only gets the lowercased key back. This is the one place the
   * operator's own text survives, so the change preview can say
   * "Institution: JKKN College" on a row that is creating one.
   */
  source?: Record<string, string>;
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

/** Rupees → integer paise, the unit the engine sums in; 2dp floats drift. */
const toPaise = (amount: number): number => Math.round(amount * 100);

/** "₹1,40,000" — a figure the way the accounts team reads it. */
const rupees = (amount: number): string =>
  `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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

  // Hostel tier. Mirrors trg_fee_structure_hostel_categories_guard so a bad
  // sheet fails as a readable row error in the preview instead of a raw
  // Postgres exception halfway through the import.
  const isHostelRow =
    !!lookups.hostelAccommodationId &&
    accommodationTypeId === lookups.hostelAccommodationId;
  const roomRaw = norm(raw['Room Category']);
  const messRaw = norm(raw['Mess Category']);
  let roomCategoryId: string | null = null;
  let messCategoryId: string | null = null;

  if (isHostelRow) {
    if (roomRaw !== '') {
      const rid = lookups.roomCategories.get(roomRaw.toLowerCase());
      if (rid) roomCategoryId = rid;
      else errors.push(`Room Category "${roomRaw}" not found (use the catalog name, e.g. Classic Room)`);
    }
    if (messRaw !== '') {
      const mid = lookups.messCategories.get(messRaw.toLowerCase());
      if (mid) messCategoryId = mid;
      else errors.push(`Mess Category "${messRaw}" not found (use the catalog name, e.g. Classic)`);
    }
    if (status === 'active' && (!roomCategoryId || !messCategoryId)) {
      errors.push('Room Category and Mess Category are both required for an active Hostel fee structure');
    }
  } else if (roomRaw !== '' || messRaw !== '') {
    errors.push('Room / Mess Category may only be set when Accommodation is Hostel');
  }

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

  // Package Type. Three states, and the difference matters: a workbook exported
  // before this column existed carries NO key here, and silently clearing the
  // classification off every structure in it would be a poor trade for a column
  // the operator never saw.
  const hasPackageColumn = Object.prototype.hasOwnProperty.call(raw, 'Package Type');
  const packageRaw = norm(raw['Package Type']);
  let packageType: 'package' | 'non_package' | null = null;
  if (packageRaw !== '') {
    const key = packageRaw.toLowerCase().replace(/[\s_-]+/g, '');
    if (key === 'package') packageType = 'package';
    else if (key === 'nonpackage') packageType = 'non_package';
    else errors.push(`Package Type "${packageRaw}" must be Package, Non-Package, or blank`);
  }

  const defaultDueRaw = parseAmountCell(raw['Default Due (Days)']);
  let defaultDue: number | null = null;
  if (defaultDueRaw !== null) {
    if (Number.isNaN(defaultDueRaw) || !Number.isInteger(defaultDueRaw) || defaultDueRaw < 0) {
      errors.push('Default Due (Days) must be a whole number of days, 0 or more');
    } else {
      defaultDue = defaultDueRaw;
    }
  }

  const source: Record<string, string> = {};
  for (const header of FIXED_HEADERS) source[header] = norm(raw[header]);

  if (errors.length > 0) return { rowNumber, name, errors, source };

  return {
    rowNumber, name, errors: [], source,
    payload: {
      structure_id: structureId,
      institution_id: instId!, degree_id: degId!, department_id: deptId!,
      programme_id: progId!, admission_year_id: yearId!, quota_id: quotaId!,
      gender: gender as string | null,
      accommodation_type_id: accommodationTypeId,
      hostel_category_id: roomCategoryId,
      mess_category_id: messCategoryId,
      community_category_ids: communityIds,
      name,
      status: status as 'draft' | 'active' | 'archived',
      notes: norm(raw['Notes']) || null,
      effective_from: (effFrom as string | null) ?? null,
      effective_to: (effTo as string | null) ?? null,
      // Blank -> the key is OMITTED, not sent as 30. The RPC treats an absent
      // key as "leave it alone"; sending a default would silently reset every
      // structure with a custom value just because the column was left empty.
      ...(defaultDue === null ? {} : { default_due_offset_days: defaultDue }),
      // Present-but-blank clears it; a missing column preserves it. See the
      // note on BulkUpsertPayload.package_type.
      ...(hasPackageColumn ? { package_type: packageType } : {}),
      items,
    },
  };
}

// ============================================================================
// SHEET 2 — "Fee Schedules": per-item due dates, instalments and status rules
// ============================================================================
// WHY A SECOND SHEET rather than more columns on sheet 1.
// Sheet 1 is one row per STRUCTURE with one column per billing category. A
// schedule is one row per INSTALMENT — a different grain entirely. Forcing it
// onto sheet 1 leaves two bad options: a second column per category holding a
// packed string like "30%@+15>reserved; 40%@+90>admitted" (74 columns, a
// mini-DSL for accounts staff to hand-edit, and one typo silently changes a
// due date), or 37 categories x 4 schedule fields. A separate sheet keeps real
// columns that sort, filter and copy-paste like any other spreadsheet.
//
// THE ROW GRAIN, AND THE ONE CONVENTION TO LEARN
//   Instalment # BLANK  -> the whole fee, unsplit. Exactly one such row per
//                          category. Use it to set a single due date, or a
//                          status rule, on a fee that is paid in one go.
//   Instalment # 1..N   -> a split. At least 2 rows, numbered contiguously
//                          from 1, percentages totalling 100 — and once any
//                          row states rupees (Fixed Amount) the instalments
//                          must add up to the fee's Amount exactly.
//
// A category with NO rows here is left exactly as it is — the sheet only needs
// to carry what you are changing. To REMOVE a split, include a single blank-#
// row with no due fields: that is an explicit "one payment, no schedule".
//
// SCHEDULES ATTACH BY Fee Structure ID, so they apply to structures that
// already exist. A brand-new structure created by sheet 1 has no id to
// reference yet; create it first, re-export, then add its schedule.

export const FEE_SCHEDULE_SHEET_NAME = 'Fee Schedules';

/**
 * Context columns. Written by the export so 949 rows are navigable and
 * filterable, and IGNORED on the way back in — a structure is identified by its
 * Fee Structure ID alone. Named "(ref)" so that is obvious in the sheet itself
 * rather than only in the instructions.
 */
export const SCHEDULE_REF_HEADERS = [
  'Institution (ref)',
  'Structure Name (ref)',
  // What this instalment actually bills, in rupees — the same number the
  // on-screen editor shows in its "Amount" column, computed by the shared
  // last-absorbs-rounding rule. It never SETS the size of an instalment (that
  // is Share % or Fixed Amount) — it is a cross-check, so "30 / 40 / 30" can
  // be read against real money without a calculator. And on the unified tab,
  // where the fee's Amount sits on the same row, a filled-in figure that
  // disagrees with what the instalment would bill is an ERROR: a mistyped or
  // stale rupee value must not sit beside a share it contradicts.
  'Amount (ref)',
] as const;

/**
 * Left→right, mirroring the on-screen editor's row of columns
 * (Share % · Amount · Due · On payment → status) so the sheet and the UI read
 * the same way. Listed literally rather than spread from SCHEDULE_REF_HEADERS:
 * the ref columns are no longer contiguous, and a header ORDER that drifts
 * from what the export writes is exactly the failure this module exists to
 * prevent. `SCHEDULE_REF_HEADERS ⊆ SCHEDULE_HEADERS` is asserted by test.
 */
export const SCHEDULE_HEADERS = [
  'Fee Structure ID',
  'Institution (ref)',
  'Structure Name (ref)',
  'Fee Category',
  'Instalment #',
  'Share %',
  'Fixed Amount',
  'Amount (ref)',
  'Due Anchor',
  'Due After (Days)',
  'Due Date',
  'Promotes To',
] as const;

/**
 * What "Due After (Days)" counts FROM. An item-level concept — one anchor per
 * fee, inherited by every instalment of it — so the column repeats down the
 * rows of one fee and they must agree.
 *
 * This column is load-bearing, not decoration. The generation engine honours an
 * unsplit item's Due Date ONLY when the anchor is 'fixed_date':
 *
 *     instalment_due_date := CASE
 *       WHEN v_anchor = 'fixed_date' AND v_item_due IS NOT NULL THEN v_item_due
 *       ELSE v_anchor_base + COALESCE(v_item_offset, v_default_offset, 30) END
 *
 * Before this column existed the sheet could not set the anchor, so a Due Date
 * typed here saved to the row and was then silently ignored at billing time.
 * resolveScheduleSheet() now DERIVES 'fixed_date' whenever a whole-fee row
 * carries a Due Date, which is what makes that edit actually take effect.
 */
export const DUE_ANCHOR_LABELS = {
  generation_date: 'Generation Date',
  academic_year_start: 'Academic Year Start',
  fixed_date: 'Fixed Date',
} as const;

export type ScheduleDueAnchor = keyof typeof DUE_ANCHOR_LABELS;

/** Accepts the label ("Academic Year Start") or the stored code. */
export function normalizeDueAnchor(cell: unknown): ScheduleDueAnchor | null | 'INVALID' {
  const key = lower(cell).replace(/[\s_-]+/g, '');
  if (key === '') return null;
  for (const code of Object.keys(DUE_ANCHOR_LABELS) as ScheduleDueAnchor[]) {
    if (key === code.replace(/_/g, '') || key === DUE_ANCHOR_LABELS[code].toLowerCase().replace(/\s+/g, '')) {
      return code;
    }
  }
  return 'INVALID';
}

/** One instalment as read from the sheet, before grouping. */

/** The instalment cells of ONE row. Identical on both layouts, which is what
 *  lets the single unified tab and a legacy two-tab workbook share every rule
 *  rather than growing a second, subtly different validator. */
interface ScheduleCells {
  instalmentNo: number | null; // null = the whole fee
  sharePercent: number | null;
  fixedAmount: number | null;
  /** "Amount (ref)" — a cross-check of the rupees, never a size. */
  amountRef: number | null;
  dueAnchor: ScheduleDueAnchor | null;
  dueOffsetDays: number | null;
  dueDate: string | null;
  promotesTo: string | null;
}

type RawScheduleLine = ScheduleCells & {
  rowNumber: number;
  categoryId: string;
  categoryName: string;
};

/** The resolved schedule for ONE fee item, as the RPC expects it. */
export interface ItemScheduleConfig {
  billing_category_id: string;
  schedule_mode: 'single' | 'split';
  /**
   * OMITTED when the sheet did not say — the RPC then keeps the stored anchor
   * (and self-heals a stale 'fixed_date' that no longer has a date under it).
   * Sending a default here would reset every deliberately-chosen anchor just
   * because a column was left blank.
   */
  due_anchor?: ScheduleDueAnchor;
  due_offset_days: number | null;
  due_date: string | null;
  promotes_to_status_code: string | null;
  lines: Array<{
    sequence_no: number;
    share_percent: number | null;
    fixed_amount: number | null;
    due_offset_days: number | null;
    due_date: string | null;
    promotes_to_status_code: string | null;
  }>;
}

/**
 * The two rungs of the learner ladder (account → reserved → admitted) that
 * EVERY structure must be able to climb. "Promotes To" on a fee or an
 * instalment is what moves a learner up when it is settled; a structure that
 * names only one rung, or neither, strands learners on it however much they
 * pay. Codes are `admission_statuses.code` (scope 'learner'); the labels are
 * what the sheet's "Promotes To" column shows and what the error names.
 */
export const REQUIRED_PROMOTIONS = [
  { code: 'reserved', label: 'Reserved' },
  { code: 'admitted', label: 'Admitted' },
] as const;

export interface ScheduleSheetResolution {
  /** structure_id -> the schedules to apply to it. */
  byStructure: Map<string, ItemScheduleConfig[]>;
  /** Sheet-2 problems, already prefixed with their row number. */
  errors: string[];
}

/** Parses "Instalment #": blank -> null (whole fee), else a positive integer. */
function parseInstalmentNo(cell: unknown): number | null | 'INVALID' {
  const s = norm(cell);
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return 'INVALID';
  return n;
}

/**
 * Reads the instalment cells of one row, whichever layout it came from.
 * Returns null once it has reported a problem through `fail`, so every caller
 * skips the row the same way.
 *
 * Validation deliberately mirrors the database (chk_afsis_amount_exactly_one,
 * chk_afsis_due_exactly_one, afsis_validate_schedule_shape and
 * afsis_validate_status_target) so a sheet that passes here is not rejected at
 * commit — an import that dies halfway through a batch is far worse than one
 * that refuses up front with a row number.
 */
function parseScheduleCells(
  raw: Record<string, unknown>,
  lookups: BulkResolveLookups,
  fail: (msg: string) => void,
): ScheduleCells | null {
  const instalmentNo = parseInstalmentNo(raw['Instalment #']);
  if (instalmentNo === 'INVALID') {
    fail('Instalment # must be blank (the whole fee) or a whole number from 1.');
    return null;
  }

  const sharePercent = parseAmountCell(raw['Share %']);
  const fixedAmount = parseAmountCell(raw['Fixed Amount']);
  if (sharePercent !== null && Number.isNaN(sharePercent)) { fail('Share % is not a number.'); return null; }
  if (fixedAmount !== null && Number.isNaN(fixedAmount)) { fail('Fixed Amount is not a number.'); return null; }

  const amountRef = parseAmountCell(raw['Amount (ref)']);
  if (amountRef !== null && Number.isNaN(amountRef)) { fail('Amount (ref) is not a number.'); return null; }

  const dueAnchor = normalizeDueAnchor(raw['Due Anchor']);
  if (dueAnchor === 'INVALID') {
    fail(`Due Anchor "${norm(raw['Due Anchor'])}" must be ${Object.values(DUE_ANCHOR_LABELS).join(', ')}, or blank to leave it unchanged.`);
    return null;
  }

  const dueOffsetDays = parseAmountCell(raw['Due After (Days)']);
  if (dueOffsetDays !== null && (Number.isNaN(dueOffsetDays) || !Number.isInteger(dueOffsetDays) || dueOffsetDays < 0)) {
    fail('Due After (Days) must be a whole number of days, 0 or more.');
    return null;
  }

  const dueDateCell = norm(raw['Due Date']);
  let dueDate: string | null = null;
  if (dueDateCell !== '') {
    const parsed = parseDateCell(raw['Due Date']);
    if (parsed === 'INVALID') { fail(`Due Date "${dueDateCell}" is not a valid date.`); return null; }
    dueDate = parsed;
  }

  if (dueOffsetDays !== null && dueDate !== null) {
    fail('Set EITHER Due After (Days) OR Due Date, not both.');
    return null;
  }

  const promotesRaw = norm(raw['Promotes To']);
  let promotesTo: string | null = null;
  if (promotesRaw !== '') {
    const code = lookups.learnerStatuses?.get(lower(promotesRaw));
    if (!code) {
      fail(`Promotes To "${promotesRaw}" is not a status a payment may promote into. Login-granting statuses are never reachable automatically.`);
      return null;
    }
    promotesTo = code;
  }

  return { instalmentNo, sharePercent, fixedAmount, amountRef, dueAnchor, dueOffsetDays, dueDate, promotesTo };
}

/**
 * Validates ONE fee's instalment rows as a whole and turns them into the config
 * the RPC takes. Returns null when the group is bad — everything wrong has
 * already gone through `at`, which formats the row reference for whichever
 * layout is calling.
 */
function resolveScheduleGroup(
  group: RawScheduleLine[],
  where: string,
  at: (rowNumber: number, msg: string) => void,
  /**
   * The fee's Amount, when the sheet carries it beside the instalments (the
   * unified tab). null on the legacy schedules tab, which knows the structure
   * only by ID — the rupee checks are skipped there, exactly as before,
   * because that sheet holds nothing to check against.
   */
  amount: number | null,
): ItemScheduleConfig | null {
  const first = group[0];
  const whole = group.filter((l) => l.instalmentNo === null);
  const split = group.filter((l) => l.instalmentNo !== null);

  if (whole.length > 0 && split.length > 0) {
    at(whole[0].rowNumber, `${where} has both a blank Instalment # (whole fee) and numbered instalments. Use one or the other.`);
    return null;
  }

  // ── The anchor is ITEM-level, so the column repeats down a fee's rows ──
  // Blank rows inherit; two DIFFERENT non-blank values are a genuine
  // contradiction (the item can only store one) and must not be resolved by
  // silently picking a winner.
  const anchored = group.filter((l) => l.dueAnchor !== null);
  const distinctAnchors = [...new Set(anchored.map((l) => l.dueAnchor!))];
  if (distinctAnchors.length > 1) {
    at(
      anchored[1].rowNumber,
      `${where} gives more than one Due Anchor (${distinctAnchors
        .map((a) => DUE_ANCHOR_LABELS[a])
        .join(' and ')}). One fee has ONE anchor — make every row of it agree, or blank the column to leave it unchanged.`,
    );
    return null;
  }
  const explicitAnchor: ScheduleDueAnchor | null = distinctAnchors[0] ?? null;

  if (split.length === 0) {
    if (whole.length > 1) {
      at(whole[1].rowNumber, `${where} has more than one whole-fee row.`);
      return null;
    }
    const w = whole[0];

    // A Due Date on a whole fee only ever reaches a bill through the
    // 'fixed_date' anchor — see DUE_ANCHOR_LABELS. So DERIVE it whenever the
    // operator typed a date, rather than storing an edit the engine discards.
    //
    // WHY 'Generation Date' DOES NOT BLOCK THE DERIVATION. The export stamps
    // the anchor on every one of ~949 rows, and 'generation_date' is the
    // column default that all of them carry — it is what the sheet says when
    // nobody has expressed a preference. Typing a date next to it is a clear
    // instruction, not a contradiction, and erroring on the single commonest
    // edit this tab exists for would be indefensible. 'Academic Year Start'
    // is different: it can only be there because somebody chose it, so a date
    // beside it is a real conflict and is reported as one.
    let anchor: ScheduleDueAnchor | undefined = explicitAnchor ?? undefined;
    if (w.dueDate !== null) {
      if (anchor === 'academic_year_start') {
        at(w.rowNumber, `${where} sets a Due Date, but its Due Anchor is ${DUE_ANCHOR_LABELS.academic_year_start} — the date would never be used. Set the anchor to ${DUE_ANCHOR_LABELS.fixed_date}, or clear the Due Date and use Due After (Days).`);
        return null;
      }
      anchor = 'fixed_date';
    } else if (anchor === 'fixed_date') {
      at(w.rowNumber, `${where} has Due Anchor ${DUE_ANCHOR_LABELS.fixed_date} but no Due Date. Give it a Due Date, or choose ${DUE_ANCHOR_LABELS.generation_date} / ${DUE_ANCHOR_LABELS.academic_year_start} and use Due After (Days).`);
      return null;
    }

    if (amount !== null && w.amountRef !== null && toPaise(w.amountRef) !== toPaise(amount)) {
      at(w.rowNumber, `${where}: Amount (ref) says ${rupees(w.amountRef)}, but the fee's Amount is ${rupees(amount)}. Amount (ref) only cross-checks the Amount — make them agree, or clear Amount (ref).`);
      return null;
    }

    return {
      billing_category_id: w.categoryId,
      schedule_mode: 'single',
      ...(anchor ? { due_anchor: anchor } : {}),
      due_offset_days: w.dueOffsetDays,
      due_date: w.dueDate,
      promotes_to_status_code: w.promotesTo,
      lines: [],
    };
  }

  if (split.length < 2) {
    at(split[0].rowNumber, `${where} has only one numbered instalment. A split needs at least 2 — or leave Instalment # blank for a single payment.`);
    return null;
  }

  const sorted = [...split].sort((a, b) => (a.instalmentNo! - b.instalmentNo!));
  const gap = sorted.findIndex((l, idx) => l.instalmentNo !== idx + 1);
  if (gap >= 0) {
    at(sorted[gap].rowNumber, `${where} instalment numbers must run 1..${sorted.length} with no gaps or duplicates.`);
    return null;
  }

  let bad = false;
  for (const l of sorted) {
    if ((l.sharePercent === null) === (l.fixedAmount === null)) {
      at(l.rowNumber, 'set EITHER Share % OR Fixed Amount, not both or neither.');
      bad = true;
    } else if (l.sharePercent !== null && !(l.sharePercent > 0 && l.sharePercent <= 100)) {
      // 120 / -20 totals 100 and would bill instalment 1 for more than the
      // whole fee; the engine then refuses to split and bills it in one go,
      // silently.
      at(l.rowNumber, 'Share % must be more than 0 and at most 100.');
      bad = true;
    } else if (l.fixedAmount !== null && !(l.fixedAmount > 0)) {
      at(l.rowNumber, 'Fixed Amount must be more than 0.');
      bad = true;
    }
    if ((l.dueOffsetDays === null) === (l.dueDate === null)) {
      at(l.rowNumber, 'set EITHER Due After (Days) OR Due Date.');
      bad = true;
    }
  }
  if (bad) return null;

  // Percent-only schedules must total 100. A schedule mixing percent and
  // fixed amounts is exempt: the last instalment absorbs the remainder,
  // which is the whole point of the last-absorbs rule.
  if (sorted.every((l) => l.sharePercent !== null)) {
    const sum = sorted.reduce((s, l) => s + (l.sharePercent ?? 0), 0);
    if (Math.abs(sum - 100) > 0.0001) {
      at(sorted[0].rowNumber, `${where} instalment percentages total ${sum.toFixed(2)}%, not 100%.`);
      return null;
    }
  }

  // ── The instalments must add up to the fee ──────────────────────────────
  // The engine sizes lines 1..n-1 as typed and gives the LAST line whatever is
  // left, so a sheet whose parts do not total the Amount is not rejected by
  // the engine — it is quietly corrected: 70,000 + 80,000 on a ₹1,40,000 fee
  // bills 70,000 + 70,000, and 1,50,000 + 20,000 leaves nothing for the
  // second instalment, so the fee is billed in one go with no split at all.
  // A percent-only split is already pinned by the 100% rule above (the last
  // line absorbs only rounding paise there); the moment any row states rupees
  // the parts must total the Amount exactly, as the operator typed them. Each
  // part is sized the way the engine sizes it — a percent in paise, rounded.
  if (amount !== null && sorted.some((l) => l.fixedAmount !== null)) {
    const totalPaise = toPaise(amount);
    const typedPaise = sorted.reduce(
      (s, l) =>
        s + (l.fixedAmount !== null ? toPaise(l.fixedAmount) : Math.round((totalPaise * l.sharePercent!) / 100)),
      0,
    );
    if (typedPaise !== totalPaise) {
      const diff = (typedPaise - totalPaise) / 100;
      at(
        // The last instalment: the line the engine would silently resize.
        sorted[sorted.length - 1].rowNumber,
        `${where} instalments add up to ${rupees(typedPaise / 100)}, not the fee's Amount of ${rupees(amount)} (${rupees(Math.abs(diff))} ${diff > 0 ? 'too much' : 'short'}). Size the instalments with Share % / Fixed Amount so they total the Amount exactly.`,
      );
      return null;
    }
  }

  // On a split the anchor only bases the per-line "Due After (Days)"; the
  // lines carry their own dates, so 'fixed_date' has nothing to point at.
  if (explicitAnchor === 'fixed_date') {
    at(sorted[0].rowNumber, `${where} is split into instalments, so Due Anchor ${DUE_ANCHOR_LABELS.fixed_date} means nothing — each instalment carries its own Due Date. Use ${DUE_ANCHOR_LABELS.generation_date} or ${DUE_ANCHOR_LABELS.academic_year_start}.`);
    return null;
  }

  // ── Amount (ref), when filled in, must be what the instalment bills ──────
  // The column is a cross-check, not a size: the export writes the rupees each
  // instalment will carry, and an operator who then retypes a share — or the
  // Amount — is looking at a figure that no longer matches it. Compared
  // against the same arithmetic that sizes the bills, so the sheet and the
  // bill cannot disagree. Skipped on the legacy tab (no Amount to derive from).
  if (amount !== null && sorted.some((l) => l.amountRef !== null)) {
    const billed = computeInstalmentAmounts(
      amount,
      sorted.map((l) => ({ share_percent: l.sharePercent, fixed_amount: l.fixedAmount })),
    );
    // null = the engine would not split this (an instalment ≤ 0). Once rupees
    // are stated the totals rule above has already reported every way that can
    // happen; for a percent-only split it takes a sub-paisa fee.
    if (billed) {
      let refBad = false;
      sorted.forEach((l, i) => {
        if (l.amountRef === null || toPaise(l.amountRef) === toPaise(billed[i])) return;
        const basis =
          l.fixedAmount !== null
            ? 'its Fixed Amount'
            : i === sorted.length - 1
              ? `what is left of ${rupees(amount)} after the earlier instalments`
              : `${l.sharePercent}% of ${rupees(amount)}`;
        at(
          l.rowNumber,
          `${where} instalment ${l.instalmentNo}: Amount (ref) says ${rupees(l.amountRef)}, but this instalment bills ${rupees(billed[i])} (${basis}). Amount (ref) never sets the size — correct the Share % / Fixed Amount, or clear Amount (ref).`,
        );
        refBad = true;
      });
      if (refBad) return null;
    }
  }

  return {
    billing_category_id: first.categoryId,
    schedule_mode: 'split',
    ...(explicitAnchor ? { due_anchor: explicitAnchor } : {}),
    due_offset_days: null,
    due_date: null,
    promotes_to_status_code: null,
    lines: sorted.map((l) => ({
      sequence_no: l.instalmentNo!,
      share_percent: l.sharePercent,
      fixed_amount: l.fixedAmount,
      due_offset_days: l.dueOffsetDays,
      due_date: l.dueDate,
      promotes_to_status_code: l.promotesTo,
    })),
  };
}

/**
 * LEGACY two-tab layout: reads a separate "Fee Schedules" sheet, which keys
 * every row to an existing Fee Structure ID. Kept because workbooks in this
 * shape are already in circulation; new downloads use the unified tab below.
 */
export function resolveScheduleSheet(
  rawRows: Record<string, unknown>[],
  lookups: BulkResolveLookups,
): ScheduleSheetResolution {
  const errors: string[] = [];
  const groups = new Map<string, RawScheduleLine[]>();
  const structureOf = new Map<string, string>();

  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    // Blank test ignores the "(ref)" columns: they are export-only decoration,
    // and a row carrying nothing but them says nothing about a schedule.
    const meaningful = Object.entries(raw)
      .filter(([k]) => !(SCHEDULE_REF_HEADERS as readonly string[]).includes(k))
      .map(([, v]) => v);
    if (meaningful.every((v) => norm(v) === '')) return; // blank row

    const at = (msg: string) => errors.push(`Schedules row ${rowNumber}: ${msg}`);

    const structureId = norm(raw['Fee Structure ID']);
    if (!structureId) {
      at('Fee Structure ID is required — a schedule attaches to a structure that already exists.');
      return;
    }

    const categoryName = norm(raw['Fee Category']);
    const categoryId = lookups.categoriesByName.get(lower(categoryName));
    if (!categoryId) {
      at(`Fee Category "${categoryName}" is not an active billing category.`);
      return;
    }

    const cells = parseScheduleCells(raw, lookups, at);
    if (!cells) return;

    const key = `${structureId}::${categoryId}`;
    structureOf.set(key, structureId);
    const line: RawScheduleLine = { ...cells, rowNumber, categoryId, categoryName };
    const g = groups.get(key);
    if (g) g.push(line);
    else groups.set(key, [line]);
  });

  const byStructure = new Map<string, ItemScheduleConfig[]>();

  for (const [key, group] of groups) {
    const structureId = structureOf.get(key)!;
    const where = `${group[0].categoryName} (structure ${structureId.slice(0, 8)}…)`;
    // null: this tab carries no Amount, so the rupee checks cannot run here.
    const config = resolveScheduleGroup(group, where, (rowNumber, msg) =>
      errors.push(`Schedules row ${rowNumber}: ${msg}`), null);
    if (!config) continue;

    const list = byStructure.get(structureId);
    if (list) list.push(config);
    else byStructure.set(structureId, [config]);
  }

  return { byStructure, errors };
}

// ============================================================================
// THE UNIFIED SHEET — one tab, one row per instalment
// ============================================================================
// WHY ONE TAB NOW. The two-tab layout split a structure from its instalments,
// and editing one fee meant finding its row on sheet 1, then finding its rows
// again on sheet 2 by a UUID. Nothing on screen tied them together. Operators
// read the second tab as a separate feature and did not use it.
//
// THE GRAIN. One row = one INSTALMENT of one FEE of one STRUCTURE. A fee that
// is paid in one go is a single row with a blank "Instalment #"; a fee split
// three ways is three rows. The structure's own columns repeat down its rows.
//
// WHY LONG AND NOT WIDE. The old sheet 1 was one row per structure with one
// column per billing category — 37 amount columns and growing, and no room at
// all for four schedule fields per category. Going long costs repetition in the
// structure columns and buys a single consistent grain: 29 real columns instead
// of 57, every field sortable and filterable, "show me every Tuition row across
// 237 structures" is one filter, and adding a fee is adding a row.
//
// EVERY STRUCTURE PROMOTES TO BOTH RUNGS. "Promotes To" is how a settled fee
// moves a learner account → reserved → admitted. A structure on this sheet
// must name Reserved somewhere and Admitted somewhere — any fee, any
// instalment, in any combination — or it is rejected (REQUIRED_PROMOTIONS).
// This tab carries every fee of a structure, so it can be held to that; the
// legacy schedules tab only carries what is being changed, and cannot be.
//
// REPEATED VALUES MUST AGREE. A structure column filled differently on two of
// its rows is a contradiction — the structure stores one value. Blank rows
// inherit, two different non-blank values are an error naming the row. The same
// rule already governs Due Anchor, so there is one thing to learn, not two.

export const UNIFIED_ITEM_HEADERS = [
  'Fee Category',
  'Amount',
  // WHICH YEARS OF THE COURSE THIS FEE IS BILLED IN. The column defaults to
  // 'every_year' in Postgres, so before this column existed every fee the sheet
  // created was billed in all four years of a BE -- including one-off fees like
  // an admission or uniform charge. There was no way to say otherwise except by
  // opening each structure on screen afterwards.
  'Applies To',
  'Year of Study',
] as const;

export const APPLIES_TO_LABELS = {
  first_year_only: 'First year only',
  every_year: 'Every year',
  specific_year: 'Specific year',
} as const;

export type FeeAppliesTo = keyof typeof APPLIES_TO_LABELS;

/**
 * Accepts the label the on-screen picker shows ("First year only"), the stored
 * code ('first_year_only'), and the shapes an operator actually types --
 * "first year", "1st year", "all years". Blank returns null, which means "the
 * sheet did not say": the RPC then keeps what is stored rather than resetting
 * the fee to every_year because a cell was left empty.
 */
export function normalizeAppliesTo(cell: unknown): FeeAppliesTo | null | 'INVALID' {
  const key = lower(cell).replace(/[\s_-]+/g, '');
  if (key === '') return null;
  if (key === 'firstyearonly' || key === 'firstyear' || key === '1styear') return 'first_year_only';
  if (key === 'everyyear' || key === 'allyears' || key === 'every' || key === 'all') return 'every_year';
  if (key === 'specificyear' || key === 'specific') return 'specific_year';
  return 'INVALID';
}

/** Parses "Year of Study": blank -> null, else an integer 1-10. */
export function parseYearOfStudy(cell: unknown): number | null | 'INVALID' {
  const raw = norm(cell);
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 10) return 'INVALID';
  return n;
}

export const UNIFIED_INSTALMENT_HEADERS = [
  'Instalment #',
  'Share %',
  'Fixed Amount',
  'Amount (ref)',
  'Due Anchor',
  'Due After (Days)',
  'Due Date',
  'Promotes To',
] as const;

/** 31 columns: 19 structure, 4 fee item, 8 instalment. */
export const UNIFIED_HEADERS = [
  ...FIXED_HEADERS,
  ...UNIFIED_ITEM_HEADERS,
  ...UNIFIED_INSTALMENT_HEADERS,
] as const;

/**
 * Columns that hold a calendar date. Both writers stamp these with a
 * yyyy-mm-dd number format so a date TYPED by the operator displays the same
 * way as one written by the export, instead of following the machine's locale
 * into dd/mm/yyyy or mm/dd/yyyy. parseDateCell() accepts all of those on the
 * way back in — this is about the sheet agreeing with its own instructions.
 */
export const DATE_HEADERS: ReadonlySet<string> = new Set([
  'Effective From',
  'Effective To',
  'Due Date',
]);

/**
 * Which layout a workbook's data sheet is in, decided from its header row.
 *
 * Sniffing the headers rather than the tab name is deliberate: both layouts use
 * the sheet name "Fee Structures", people rename tabs, and a wide sheet read as
 * long (or the reverse) would not fail — it would import a coherent-looking
 * wrong answer. "Fee Category" exists only in the long layout, because the wide
 * one spends a column on each category instead.
 */
export function detectSheetLayout(headerRow: readonly unknown[]): 'unified' | 'legacy' {
  return headerRow.some((h) => norm(h) === 'Fee Category') ? 'unified' : 'legacy';
}

export interface UnifiedSheetResolution {
  /** One entry per STRUCTURE, in the shape the preview already renders. */
  resolutions: RowResolution[];
  /** Fee items seen across the sheet — what the dialog reports. */
  itemCount: number;
}

/**
 * Reads the unified tab: groups rows into structures, each structure's rows into
 * fees, and each fee's rows into instalments.
 *
 * Structure resolution is delegated to resolveRow() by rebuilding the wide row
 * it already knows how to validate — one category column per fee. That is not a
 * shortcut: every dimension lookup, every hostel-tier rule and every error
 * message stays in ONE place, so the two layouts cannot drift into disagreeing
 * about whether a row is valid.
 */
export function resolveUnifiedSheet(
  rawRows: Record<string, unknown>[],
  lookups: BulkResolveLookups,
  /**
   * Spreadsheet row number of rawRows[0]. 2 when the header is on row 1, which
   * it almost always is — but an operator who inserts a title line above the
   * headers shifts every row, and a preview that then names row 7 for a problem
   * on row 8 sends them to the wrong cell.
   */
  firstRowNumber = 2,
): UnifiedSheetResolution {
  interface SheetRow { rowNumber: number; raw: Record<string, unknown> }

  // ── Pass 1: bucket rows into structures, preserving sheet order ──────────
  // An existing structure is keyed by its ID. A NEW one has no ID yet, so it is
  // keyed by everything that identifies it — the dimensions, the tier, the
  // communities and the name, exactly the tuple the overlap constraint uses.
  // Keying new rows on the name alone would merge two different structures that
  // happened to share one.
  const buckets = new Map<string, SheetRow[]>();
  const NEW_KEY_FIELDS = [
    'Institution', 'Degree', 'Department', 'Programme', 'Admission Year', 'Quota',
    'Gender', 'Accommodation', 'Room Category', 'Mess Category', 'Communities', 'Name',
  ] as const;

  rawRows.forEach((raw, i) => {
    // "Amount (ref)" is read-only decoration and says nothing on its own, so a
    // row carrying only that is blank — same rule the legacy tab applies to its
    // "(ref)" columns, and it keeps a stray filtered-and-pasted cell from
    // failing the whole batch as a structure with no dimensions.
    const meaningful = Object.entries(raw)
      .filter(([k]) => k !== 'Amount (ref)')
      .map(([, v]) => v);
    if (meaningful.every((v) => norm(v) === '')) return; // blank row
    const structureId = norm(raw['Fee Structure ID']);
    const key = structureId
      ? `id::${structureId}`
      : `new::${NEW_KEY_FIELDS.map((f) => lower(raw[f])).join(' ')}`;
    const rowNumber = firstRowNumber + i;
    const b = buckets.get(key);
    if (b) b.push({ rowNumber, raw });
    else buckets.set(key, [{ rowNumber, raw }]);
  });

  const resolutions: RowResolution[] = [];
  let itemCount = 0;

  for (const rows of buckets.values()) {
    const headRow = rows[0].rowNumber;
    const errors: string[] = [];
    const at = (rowNumber: number, msg: string) => errors.push(`Row ${rowNumber}: ${msg}`);

    // ── Reconcile the structure's own columns across its rows ─────────────
    const structureCells: Record<string, unknown> = {};
    for (const header of FIXED_HEADERS) {
      const filled = rows.filter((r) => norm(r.raw[header]) !== '');
      const distinct = [...new Set(filled.map((r) => norm(r.raw[header])))];
      if (distinct.length > 1) {
        at(
          filled[1].rowNumber,
          `"${header}" is a property of the fee structure, so it must read the same on every row of it — found "${distinct[0]}" and "${distinct[1]}". Fix one, or blank it to follow the other rows.`,
        );
      }
      // The first non-blank raw cell, NOT the normalized string: a date cell
      // arrives as a Date object and parseDateCell needs it intact.
      structureCells[header] = filled.length > 0 ? filled[0].raw[header] : '';
    }

    const structureName = norm(structureCells['Name']);

    // ── Group the rows into fees, then resolve each fee's instalments ──────
    const feeRows = new Map<string, SheetRow[]>();
    const feeNames = new Map<string, string>();
    const FEE_CELLS = [...UNIFIED_ITEM_HEADERS, ...UNIFIED_INSTALMENT_HEADERS] as readonly string[];
    for (const r of rows) {
      const categoryName = norm(r.raw['Fee Category']);
      if (categoryName === '') {
        // A row with structure columns and NOTHING else is a structure that has
        // no fees yet — which the export writes so the structure is visible and
        // fees can be typed onto it. Complaining about a missing Fee Category
        // there would bury the one accurate message, "At least one fee amount
        // is required", under a row-level error about a cell nobody touched.
        // A row that carries any other fee or instalment cell IS a fee row with
        // its category blanked out, and that is worth saying.
        if (FEE_CELLS.some((h) => norm(r.raw[h]) !== '')) {
          at(r.rowNumber, 'Fee Category is required — every row names the fee it belongs to.');
        }
        continue;
      }
      const key = lower(categoryName);
      feeNames.set(key, categoryName);
      const g = feeRows.get(key);
      if (g) g.push(r);
      else feeRows.set(key, [r]);
    }

    const schedules: ItemScheduleConfig[] = [];
    /**
     * billing_category_id -> what the sheet said about which years bill this
     * fee. Collected here and stamped onto the payload's items after
     * resolveRow() has built them, so the wide-row validator stays the single
     * owner of "is this a valid fee amount for a valid category".
     */
    const appliesByCategory = new Map<
      string,
      { appliesTo: FeeAppliesTo; year: number | null }
    >();
    // Absent COLUMN (an export taken before it existed) is not the same as a
    // blank CELL: neither writes, but only the column's absence is a workbook
    // the operator never had the chance to fill in.
    const hasAppliesColumn = rows.some((r) =>
      Object.prototype.hasOwnProperty.call(r.raw, 'Applies To'),
    );

    for (const [key, group] of feeRows) {
      const categoryName = feeNames.get(key)!;
      const categoryId = lookups.categoriesByName.get(key);
      if (!categoryId) {
        at(group[0].rowNumber, `Fee Category "${categoryName}" is not an active billing category.`);
        continue;
      }

      // The fee's amount, like the structure columns, repeats down its rows.
      const amountRows = group.filter((r) => norm(r.raw['Amount']) !== '');
      const distinctAmounts = [...new Set(amountRows.map((r) => norm(r.raw['Amount'])))];
      if (distinctAmounts.length > 1) {
        at(
          amountRows[1].rowNumber,
          `"${categoryName}" has more than one Amount (${distinctAmounts[0]} and ${distinctAmounts[1]}). Instalments SPLIT one amount — put the whole fee on every row of it, and size the parts with Share % or Fixed Amount.`,
        );
        continue;
      }
      if (amountRows.length === 0) {
        at(group[0].rowNumber, `"${categoryName}" has no Amount. Enter the full fee, or DELETE the row to remove this fee from the structure.`);
        continue;
      }

      // Feeds resolveRow()'s wide-row validation, which reports a bad number.
      structureCells[categoryName] = amountRows[0].raw['Amount'];
      itemCount++;

      // ── Which years of the course bill this fee ─────────────────────────
      if (hasAppliesColumn) {
        const appliesRows = group.filter((r) => norm(r.raw['Applies To']) !== '');
        const distinctApplies = [...new Set(appliesRows.map((r) => norm(r.raw['Applies To'])))];
        const yearRows = group.filter((r) => norm(r.raw['Year of Study']) !== '');
        const distinctYears = [...new Set(yearRows.map((r) => norm(r.raw['Year of Study'])))];

        if (distinctApplies.length > 1) {
          at(
            appliesRows[1].rowNumber,
            `"${categoryName}" has more than one "Applies To" (${distinctApplies[0]} and ${distinctApplies[1]}). It is a property of the fee, so it must read the same on every row of it.`,
          );
          continue;
        }
        if (distinctYears.length > 1) {
          at(
            yearRows[1].rowNumber,
            `"${categoryName}" has more than one "Year of Study" (${distinctYears[0]} and ${distinctYears[1]}). It is a property of the fee, so it must read the same on every row of it.`,
          );
          continue;
        }

        const appliesTo = normalizeAppliesTo(distinctApplies[0] ?? '');
        if (appliesTo === 'INVALID') {
          at(
            appliesRows[0].rowNumber,
            `"${categoryName}" has an unrecognised "Applies To" (${distinctApplies[0]}). Use First year only, Every year, or Specific year.`,
          );
          continue;
        }

        const year = parseYearOfStudy(distinctYears[0] ?? '');
        if (year === 'INVALID') {
          at(
            yearRows[0].rowNumber,
            `"${categoryName}" has an invalid "Year of Study" (${distinctYears[0]}). Use a whole number from 1 to 10.`,
          );
          continue;
        }

        // The DB guard afsi_applies_year_chk is a BICONDITIONAL: the year is
        // set if and only if applies_to is 'specific_year'. Both halves are
        // enforced here so the operator gets a row number instead of a
        // constraint name mid-import.
        if (appliesTo === 'specific_year' && year === null) {
          at(
            appliesRows[0].rowNumber,
            `"${categoryName}" is set to Specific year, so it needs a "Year of Study" (1-10).`,
          );
          continue;
        }
        if (appliesTo !== 'specific_year' && year !== null) {
          at(
            yearRows[0].rowNumber,
            `"${categoryName}" has a "Year of Study" but "Applies To" is ${appliesTo === null ? 'blank' : APPLIES_TO_LABELS[appliesTo]}. Year of Study only means something next to Specific year — clear one of them.`,
          );
          continue;
        }

        if (appliesTo !== null) {
          appliesByCategory.set(categoryId, { appliesTo, year });
        }
      }

      const lines: RawScheduleLine[] = [];
      let lineFailed = false;
      for (const r of group) {
        const cells = parseScheduleCells(r.raw, lookups, (msg) => {
          at(r.rowNumber, msg);
          lineFailed = true;
        });
        if (cells) lines.push({ ...cells, rowNumber: r.rowNumber, categoryId, categoryName });
      }
      if (lineFailed) continue;

      // The rupee checks need the fee's Amount as a number. A bad cell is
      // resolveRow()'s to report — hand over null then, and for a ₹0 fee,
      // which has nothing to split — so it is reported once, not twice.
      const feeAmount = parseAmountCell(amountRows[0].raw['Amount']);
      const config = resolveScheduleGroup(
        lines,
        `"${categoryName}"${structureName ? ` on ${structureName}` : ''}`,
        at,
        feeAmount !== null && feeAmount > 0 ? feeAmount : null,
      );
      if (config) schedules.push(config);
    }

    // ── Structure validation, through the one resolver both layouts share ──
    const resolved = resolveRow(structureCells, headRow, lookups);
    resolved.errors = [...resolved.errors, ...errors];

    // ── Every structure must promote to BOTH Reserved and Admitted ─────────
    // Any fee, any instalment may carry either rung; what matters is that both
    // appear somewhere on the structure. Checked only once every row of the
    // structure resolved cleanly: a fee whose rows failed has not yet said what
    // it promotes to, and a second error about that would only be noise.
    // Archived structures bill nobody and are exempt.
    if (resolved.errors.length === 0 && resolved.payload!.status !== 'archived') {
      const promoted = new Set<string>();
      for (const s of schedules) {
        if (s.promotes_to_status_code) promoted.add(s.promotes_to_status_code);
        for (const l of s.lines) if (l.promotes_to_status_code) promoted.add(l.promotes_to_status_code);
      }
      const missing = REQUIRED_PROMOTIONS.filter((p) => !promoted.has(p.code));
      if (missing.length > 0) {
        resolved.errors.push(
          `Row ${headRow}: "${resolved.name}" must promote a learner to both Reserved and Admitted — set "Promotes To" to Reserved on one fee or instalment and to Admitted on another (any fee category will do). Missing: ${missing.map((p) => p.label).join(' and ')}.`,
        );
      }
    }

    if (resolved.errors.length > 0) {
      resolutions.push({
        rowNumber: headRow,
        name: resolved.name,
        errors: resolved.errors,
        source: resolved.source,
      });
      continue;
    }

    for (const item of resolved.payload!.items) {
      const applies = appliesByCategory.get(item.billing_category_id);
      if (!applies) continue; // blank cell / absent column = leave it alone
      item.applies_to = applies.appliesTo;
      // Set ONLY for specific_year. The RPC derives it the same way, but a
      // payload that carries a year next to 'every_year' is a lie either way.
      if (applies.appliesTo === 'specific_year') {
        item.applies_year_of_study = applies.year;
      }
    }

    // ALWAYS set, even when empty: its presence is what tells the RPC the sheet
    // has spoken for these fees. The unified tab always carries every fee of
    // every structure it lists, so there is nothing left for it to preserve.
    resolved.payload!.item_schedules = schedules;
    resolutions.push(resolved);
  }

  return { resolutions, itemCount };
}

// ============================================================================
// WHICH TAB, AND WHICH ROW IS THE HEADER
// ============================================================================
// The importer used to do `wb.Sheets['Fee Structures']` and 400 with
// `Sheet "Fee Structures" not found` when that exact key was absent. Every one
// of these ordinary things produced that dead end, with nothing in the message
// to say what had actually been uploaded:
//
//   • Excel duplicating a tab as "Fee Structures (2)" (right-click → Move or
//     Copy, the usual way an operator keeps a backup before editing).
//   • The sheet pasted onto a fresh tab, or the tab simply renamed.
//   • A workbook re-saved as CSV and renamed back to .xlsx — SheetJS then
//     reports a single tab called "Sheet1".
//   • A non-breaking space or a stray trailing space in the tab name.
//
// detectSheetLayout() already refuses to trust the tab NAME for the layout,
// for exactly these reasons; sheet SELECTION never got the same treatment.
// It does now: a sheet is recognised by the COLUMNS it carries. The name is
// only a tie-breaker.
//
// The same pass also finds the header ROW, because the other half of this
// failure is an operator inserting a title line above the headers. sheet_to_json
// assumes row 1, so that one insertion silently re-keys every column and the
// whole file comes back as errors about missing institutions.

/**
 * Columns that mark a sheet as a fee-structure data sheet. Deliberately spans
 * BOTH layouts (the unified tab's 'Fee Category'/'Amount' and the structure
 * columns both layouts share) so an old wide-format workbook scores just as
 * well as a current one — the layout question is detectSheetLayout()'s, not
 * this one's.
 */
export const SHEET_SIGNATURE_HEADERS: readonly string[] = [
  'Fee Structure ID',
  'Institution',
  'Degree',
  'Department',
  'Programme',
  'Admission Year',
  'Quota',
  'Communities',
  'Name',
  'Status',
  'Fee Category',
  'Amount',
];

/**
 * Header text, comparable. Collapses the non-breaking space Excel leaves behind
 * when a header is pasted from a web page, folds runs of whitespace, and
 * lowercases — so "  Fee  Structure ID " matches "Fee Structure ID".
 */
export function normalizeHeaderText(v: unknown): string {
  return String(v ?? '').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** How many signature columns a candidate header row carries. */
export function headerRowScore(row: readonly unknown[]): number {
  const seen = new Set(row.map(normalizeHeaderText).filter(Boolean));
  return SHEET_SIGNATURE_HEADERS.filter((h) => seen.has(normalizeHeaderText(h))).length;
}

/**
 * 5 of 12, not all 12: an operator is allowed to delete columns they are not
 * editing, and an old export predates some of them. 5 is comfortably more than
 * any non-data tab in these workbooks scores — the legacy "Fee Schedules" tab
 * shares only 'Fee Structure ID' and 'Fee Category', and "Lists" shares at most
 * a handful of one-word names.
 */
const MIN_SIGNATURE_SCORE = 5;

/** How far down a sheet to look for the header row. */
const HEADER_SEARCH_DEPTH = 10;

export interface SheetCandidate {
  name: string;
  /** The sheet's first rows as arrays (XLSX.utils.sheet_to_json(ws, {header:1})). */
  rows: ReadonlyArray<readonly unknown[]>;
}

export interface DataSheetPick {
  name: string;
  /** 0-based index of the header row WITHIN the sheet. 0 = the normal case. */
  headerRowIndex: number;
  header: unknown[];
  layout: 'unified' | 'legacy';
  score: number;
  /** True when the tab was actually called "Fee Structures". */
  nameMatched: boolean;
}

/** The best header row in one sheet, or null when it carries none. */
function bestHeaderRow(rows: SheetCandidate['rows']): { index: number; score: number } | null {
  let best: { index: number; score: number } | null = null;
  const depth = Math.min(rows.length, HEADER_SEARCH_DEPTH);
  for (let i = 0; i < depth; i++) {
    const score = headerRowScore(rows[i] ?? []);
    // Strictly greater, so the EARLIEST row wins a tie. A data row can repeat a
    // header's text, and picking the later one would drop rows above it.
    if (score >= MIN_SIGNATURE_SCORE && (!best || score > best.score)) {
      best = { index: i, score };
    }
  }
  return best;
}

/**
 * Picks the data sheet out of a workbook by its columns.
 *
 * Preference order: a tab actually named "Fee Structures" that also carries the
 * columns, then the highest-scoring tab, then workbook order. Returns null when
 * no tab looks like a fee-structure sheet — the caller reports what it DID find
 * rather than naming a tab the operator does not have.
 */
export function pickDataSheet(sheets: readonly SheetCandidate[]): DataSheetPick | null {
  const target = normalizeHeaderText(FEE_STRUCTURE_SHEET_NAME);
  let best: DataSheetPick | null = null;

  for (const sheet of sheets) {
    const head = bestHeaderRow(sheet.rows);
    if (!head) continue;
    const header = [...(sheet.rows[head.index] ?? [])];
    const pick: DataSheetPick = {
      name: sheet.name,
      headerRowIndex: head.index,
      header,
      layout: detectSheetLayout(header),
      score: head.score,
      nameMatched: normalizeHeaderText(sheet.name) === target,
    };
    if (
      !best ||
      (pick.nameMatched && !best.nameMatched) ||
      (pick.nameMatched === best.nameMatched && pick.score > best.score)
    ) {
      best = pick;
    }
  }

  return best;
}

/** The workbook's real key for a tab, matched loosely. Used for "Fee Schedules". */
export function findSheetName(sheetNames: readonly string[], target: string): string | null {
  const want = normalizeHeaderText(target);
  return sheetNames.find((n) => normalizeHeaderText(n) === want) ?? null;
}
