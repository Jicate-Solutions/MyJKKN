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
] as const;

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
  community_category_ids: string[];
  name: string;
  status: 'draft' | 'active' | 'archived';
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  items: Array<{ billing_category_id: string; amount: number; is_optional: boolean }>;
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

  const defaultDueRaw = parseAmountCell(raw['Default Due (Days)']);
  let defaultDue: number | null = null;
  if (defaultDueRaw !== null) {
    if (Number.isNaN(defaultDueRaw) || !Number.isInteger(defaultDueRaw) || defaultDueRaw < 0) {
      errors.push('Default Due (Days) must be a whole number of days, 0 or more');
    } else {
      defaultDue = defaultDueRaw;
    }
  }

  if (errors.length > 0) return { rowNumber, name, errors };

  return {
    rowNumber, name, errors: [],
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
//                          from 1, percentages totalling 100.
//
// A category with NO rows here is left exactly as it is — the sheet only needs
// to carry what you are changing. To REMOVE a split, include a single blank-#
// row with no due fields: that is an explicit "one payment, no schedule".
//
// SCHEDULES ATTACH BY Fee Structure ID, so they apply to structures that
// already exist. A brand-new structure created by sheet 1 has no id to
// reference yet; create it first, re-export, then add its schedule.

export const FEE_SCHEDULE_SHEET_NAME = 'Fee Schedules';

export const SCHEDULE_HEADERS = [
  'Fee Structure ID',
  'Fee Category',
  'Instalment #',
  'Share %',
  'Fixed Amount',
  'Due After (Days)',
  'Due Date',
  'Promotes To',
] as const;

/** One instalment as read from the sheet, before grouping. */
interface RawScheduleLine {
  rowNumber: number;
  structureId: string;
  categoryId: string;
  categoryName: string;
  instalmentNo: number | null; // null = the whole fee
  sharePercent: number | null;
  fixedAmount: number | null;
  dueOffsetDays: number | null;
  dueDate: string | null;
  promotesTo: string | null;
}

/** The resolved schedule for ONE fee item, as the RPC expects it. */
export interface ItemScheduleConfig {
  billing_category_id: string;
  schedule_mode: 'single' | 'split';
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
 * Reads and validates the Fee Schedules sheet.
 *
 * Validation deliberately mirrors the database (chk_afsis_amount_exactly_one,
 * chk_afsis_due_exactly_one, afsis_validate_schedule_shape and
 * afsis_validate_status_target) so a sheet that passes here is not rejected at
 * commit — an import that dies halfway through a batch is far worse than one
 * that refuses up front with a row number.
 */
export function resolveScheduleSheet(
  rawRows: Record<string, unknown>[],
  lookups: BulkResolveLookups,
): ScheduleSheetResolution {
  const errors: string[] = [];
  const lines: RawScheduleLine[] = [];

  rawRows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    if (Object.values(raw).every((v) => norm(v) === '')) return; // blank row

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

    const instalmentNo = parseInstalmentNo(raw['Instalment #']);
    if (instalmentNo === 'INVALID') {
      at('Instalment # must be blank (the whole fee) or a whole number from 1.');
      return;
    }

    const sharePercent = parseAmountCell(raw['Share %']);
    const fixedAmount = parseAmountCell(raw['Fixed Amount']);
    if (sharePercent !== null && Number.isNaN(sharePercent)) { at('Share % is not a number.'); return; }
    if (fixedAmount !== null && Number.isNaN(fixedAmount)) { at('Fixed Amount is not a number.'); return; }

    const dueOffsetRaw = parseAmountCell(raw['Due After (Days)']);
    if (dueOffsetRaw !== null && (Number.isNaN(dueOffsetRaw) || !Number.isInteger(dueOffsetRaw) || dueOffsetRaw < 0)) {
      at('Due After (Days) must be a whole number of days, 0 or more.');
      return;
    }
    const dueOffsetDays = dueOffsetRaw;

    const dueDateCell = norm(raw['Due Date']);
    let dueDate: string | null = null;
    if (dueDateCell !== '') {
      const parsed = parseDateCell(raw['Due Date']);
      if (parsed === 'INVALID') { at(`Due Date "${dueDateCell}" is not a valid date.`); return; }
      dueDate = parsed;
    }

    if (dueOffsetDays !== null && dueDate !== null) {
      at('Set EITHER Due After (Days) OR Due Date, not both.');
      return;
    }

    const promotesRaw = norm(raw['Promotes To']);
    let promotesTo: string | null = null;
    if (promotesRaw !== '') {
      const code = lookups.learnerStatuses?.get(lower(promotesRaw));
      if (!code) {
        at(`Promotes To "${promotesRaw}" is not a status a payment may promote into. Login-granting statuses are never reachable automatically.`);
        return;
      }
      promotesTo = code;
    }

    lines.push({
      rowNumber, structureId, categoryId, categoryName,
      instalmentNo, sharePercent, fixedAmount, dueOffsetDays, dueDate, promotesTo,
    });
  });

  // ── Group by (structure, category) and validate each group as a whole ──
  const groups = new Map<string, RawScheduleLine[]>();
  for (const l of lines) {
    const key = `${l.structureId}::${l.categoryId}`;
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }

  const byStructure = new Map<string, ItemScheduleConfig[]>();

  for (const group of groups.values()) {
    const first = group[0];
    const where = `${first.categoryName} (structure ${first.structureId.slice(0, 8)}…)`;
    const whole = group.filter((l) => l.instalmentNo === null);
    const split = group.filter((l) => l.instalmentNo !== null);

    if (whole.length > 0 && split.length > 0) {
      errors.push(
        `Schedules row ${whole[0].rowNumber}: ${where} has both a blank Instalment # (whole fee) and numbered instalments. Use one or the other.`,
      );
      continue;
    }

    let config: ItemScheduleConfig;

    if (split.length === 0) {
      if (whole.length > 1) {
        errors.push(`Schedules row ${whole[1].rowNumber}: ${where} has more than one whole-fee row.`);
        continue;
      }
      const w = whole[0];
      config = {
        billing_category_id: w.categoryId,
        schedule_mode: 'single',
        due_offset_days: w.dueOffsetDays,
        due_date: w.dueDate,
        promotes_to_status_code: w.promotesTo,
        lines: [],
      };
    } else {
      if (split.length < 2) {
        errors.push(
          `Schedules row ${split[0].rowNumber}: ${where} has only one numbered instalment. A split needs at least 2 — or leave Instalment # blank for a single payment.`,
        );
        continue;
      }

      const sorted = [...split].sort((a, b) => (a.instalmentNo! - b.instalmentNo!));
      const gap = sorted.findIndex((l, idx) => l.instalmentNo !== idx + 1);
      if (gap >= 0) {
        errors.push(
          `Schedules row ${sorted[gap].rowNumber}: ${where} instalment numbers must run 1..${sorted.length} with no gaps or duplicates.`,
        );
        continue;
      }

      let bad = false;
      for (const l of sorted) {
        if ((l.sharePercent === null) === (l.fixedAmount === null)) {
          errors.push(`Schedules row ${l.rowNumber}: set EITHER Share % OR Fixed Amount, not both or neither.`);
          bad = true;
        }
        if ((l.dueOffsetDays === null) === (l.dueDate === null)) {
          errors.push(`Schedules row ${l.rowNumber}: set EITHER Due After (Days) OR Due Date.`);
          bad = true;
        }
      }
      if (bad) continue;

      // Percent-only schedules must total 100. A schedule mixing percent and
      // fixed amounts is exempt: the last instalment absorbs the remainder,
      // which is the whole point of the last-absorbs rule.
      if (sorted.every((l) => l.sharePercent !== null)) {
        const sum = sorted.reduce((s, l) => s + (l.sharePercent ?? 0), 0);
        if (Math.abs(sum - 100) > 0.0001) {
          errors.push(
            `Schedules row ${sorted[0].rowNumber}: ${where} instalment percentages total ${sum.toFixed(2)}%, not 100%.`,
          );
          continue;
        }
      }

      config = {
        billing_category_id: first.categoryId,
        schedule_mode: 'split',
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

    const list = byStructure.get(first.structureId);
    if (list) list.push(config);
    else byStructure.set(first.structureId, [config]);
  }

  return { byStructure, errors };
}
