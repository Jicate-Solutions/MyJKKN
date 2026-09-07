/**
 * Excel mapping utility for the Student Bill bulk import flow.
 *
 * Unlike entity imports (programs, departments, etc.) which carry static
 * enum dropdowns (UG/PG/Active/Inactive), bill imports have only one
 * dropdown — Billing Category — and that data is dynamic (loaded from the
 * `billing_categories` table at template-generation time). So this file
 * deliberately stays small: column headers, the row-shape type, and a
 * shared ImportResult contract that the API and dialog both use.
 */

/**
 * Column order of the generated template. The importer reads by header TEXT,
 * so this order is free to change — but the template generator's ExcelJS
 * dataValidation cell letters track it exactly. Change both together.
 *
 * Institution sits next to Academic Year because the two are a cascading pair:
 * academic years are per-institution, so the Academic Year dropdown is driven
 * by whatever Institution the row picked.
 */
export const STUDENT_BILL_TEMPLATE_HEADERS = [
  'Roll Number',
  'First Name',
  'Last Name',
  'Institution',
  'Academic Year',
  'Billing Category',
  'Bill Description',
  'Due Date',
  'Billing Amount',
  'Remarks',
  // Optional pair, appended at the END on purpose: the template route's
  // dataValidation cell letters (D/E/F) track column order, so a new column
  // inserted mid-sheet would move the dropdowns onto the wrong cells.
  'Instalment Shares',
  'Instalment Due Dates'
] as const;

export type StudentBillTemplateHeader = (typeof STUDENT_BILL_TEMPLATE_HEADERS)[number];

/**
 * Earliest academic year offered in the billing template dropdowns.
 *
 * Bills are not raised against cohorts that finished long ago, and every extra
 * entry makes the picker harder to scan. The floor is presentational only —
 * the importer still resolves any year the table holds, so a sheet typed by
 * hand with an older year is unaffected.
 */
export const MIN_ACADEMIC_YEAR_START = 2020;

/**
 * Drops academic year names starting before {@link MIN_ACADEMIC_YEAR_START},
 * newest first. Shared by the bulk-create and bulk-edit template routes so the
 * two pickers can never drift apart.
 *
 * A name that does not start with four digits is KEPT: the floor is there to
 * hide known-old cohorts, not to swallow a name it merely failed to parse.
 */
export function filterBillableAcademicYears(names: string[]): string[] {
  return Array.from(new Set(names.map((n) => String(n ?? '').trim()).filter(Boolean)))
    .filter((name) => {
      const startYear = Number(name.match(/^(\d{4})/)?.[1]);
      return Number.isNaN(startYear) || startYear >= MIN_ACADEMIC_YEAR_START;
    })
    .sort((a, b) => b.localeCompare(a));
}

/**
 * Canonical field -> accepted header spellings, matched case/space-insensitively.
 *
 * The importer resolves columns through THIS map rather than by position.
 * It used to read cells[0]..cells[6] by index, so inserting a column (e.g. the
 * First/Last Name pair) silently shifted Billing Category into the Due Date
 * slot and Bill Description into the Billing Amount slot — field corruption
 * with no error. Header-driven reading means sheets already in circulation keep
 * working and new columns can be added anywhere.
 *
 * Keep every historical spelling here forever; users re-upload old templates.
 */
export const STUDENT_BILL_HEADER_ALIASES: Record<string, string[]> = {
  roll_number: ['roll number', 'rollnumber', 'roll no', 'roll_number'],
  first_name: ['first name', 'firstname', 'first_name', 'learner first name', 'student first name'],
  last_name: ['last name', 'lastname', 'last_name', 'surname', 'learner last name', 'student last name'],
  institution_name: ['institution', 'institution name', 'institution_name', 'college'],
  billing_category_name: ['billing category', 'billingcategory', 'billing_category', 'category'],
  bill_description: ['bill description', 'description', 'bill_description'],
  due_date: ['due date', 'duedate', 'due_date'],
  billing_amount: ['billing amount', 'amount', 'billing_amount'],
  remarks: ['remarks', 'remark', 'notes'],
  // Optional since 2026-09-06. A sheet without them imports exactly as
  // before; a sheet with them gives each bill a payment schedule.
  instalment_shares: [
    'instalment shares',
    'installment shares',
    'instalment_shares',
    'shares'
  ],
  instalment_due_dates: [
    'instalment due dates',
    'installment due dates',
    'instalment_due_dates',
    'instalment dates'
  ],
  academic_year_name: [
    'academic year',
    // Retained: the header was "Academic Year (optional)" until 2026-07-29,
    // and those sheets are still in circulation. The column is now REQUIRED —
    // an old sheet still maps, it just fails the row if the cell is blank.
    'academic year (optional)',
    'academicyear',
    'academic_year'
  ]
};

/** Normalize a header cell for alias matching: lowercase, collapse whitespace. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Map the sheet's header row to column indexes.
 *
 * Returns `{ field: columnIndex }` for every field the sheet actually carries.
 * Unknown columns are ignored, so users may add their own notes columns.
 */
export function resolveStudentBillColumns(headerRow: unknown[]): Record<string, number> {
  const lookup = new Map<string, string>();
  for (const [field, aliases] of Object.entries(STUDENT_BILL_HEADER_ALIASES)) {
    for (const alias of aliases) lookup.set(alias, field);
  }

  const indexes: Record<string, number> = {};
  headerRow.forEach((cell, index) => {
    const field = lookup.get(normalizeHeader(cell));
    // First occurrence wins — a duplicated header shouldn't silently retarget.
    if (field && indexes[field] === undefined) indexes[field] = index;
  });
  return indexes;
}

/**
 * Shape of a single parsed-and-resolved Excel row before it becomes a
 * `CreateStudentBillDto`. The `_resolved_*` fields are populated during
 * row validation by looking up the student / category by their
 * human-friendly identifiers.
 */
export interface StudentBillRow {
  roll_number: string;
  billing_category_name: string;
  bill_description?: string;
  due_date: string; // ISO YYYY-MM-DD
  billing_amount: number;
  remarks?: string;
  /** e.g. "30/35/35" — percentages, must total 100. Optional. */
  instalment_shares?: string;
  /** e.g. "2026-10-30|2027-01-30|2027-02-28". Optional. */
  instalment_due_dates?: string;

  // Filled by validator
  _resolved_student_id?: string;
  _resolved_institution_id?: string;
  _resolved_item_category_id?: string;
}

/** One parsed schedule line from the two optional sheet columns. */
export interface ParsedInstalmentLine {
  share_percent: number;
  due_date: string;
}

/**
 * Parses the optional "Instalment Shares" / "Instalment Due Dates" pair.
 *
 *   shares: "30/35/35"  (also accepts commas or spaces)
 *   dates:  "2026-10-30|2027-01-30|2027-02-28"  (also accepts commas)
 *
 * Returns `{ lines: [] }` when BOTH cells are blank — the overwhelmingly
 * common case, and the one that must behave exactly as it did before these
 * columns existed. Every other shape is validated and reported at preview
 * time, because the alternative is a Postgres BL002 after the bill row has
 * already been inserted.
 */
export function parseInstalmentColumns(
  sharesRaw: string,
  datesRaw: string,
  // The caller's own date normaliser. Passed in rather than reimplemented:
  // cellToISODate already exists (twice) in the bulk services, and a third
  // copy here would be free to disagree about Excel serial dates.
  toISODate: (value: unknown) => string | null
): { lines: ParsedInstalmentLine[]; errors: string[] } {
  const shares = (sharesRaw || '').trim();
  const dates = (datesRaw || '').trim();
  if (!shares && !dates) return { lines: [], errors: [] };

  const errors: string[] = [];
  if (!shares || !dates) {
    errors.push(
      'Instalment Shares and Instalment Due Dates must both be filled in, or both left blank.'
    );
    return { lines: [], errors };
  }

  const shareParts = shares.split(/[\/,;|\s]+/).filter(Boolean);
  const dateParts = dates.split(/[|,;\s]+/).filter(Boolean);

  if (shareParts.length !== dateParts.length) {
    errors.push(
      `Instalments do not line up: ${shareParts.length} share(s) but ${dateParts.length} due date(s).`
    );
    return { lines: [], errors };
  }
  if (shareParts.length < 2) {
    errors.push('An instalment schedule needs at least 2 instalments.');
    return { lines: [], errors };
  }

  const lines: ParsedInstalmentLine[] = [];
  let total = 0;

  for (let i = 0; i < shareParts.length; i++) {
    const pct = Number(shareParts[i].replace('%', ''));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      errors.push(`Instalment ${i + 1}: "${shareParts[i]}" is not a share between 0 and 100.`);
      continue;
    }
    const iso = toISODate(dateParts[i]);
    if (!iso) {
      errors.push(`Instalment ${i + 1}: "${dateParts[i]}" is not a valid date.`);
      continue;
    }
    total += pct;
    lines.push({ share_percent: pct, due_date: iso });
  }

  // Exactly 100, matching validatePlanLines and the fee-structure editor. The
  // engine's last-absorbs-rounding rule would quietly turn 30/30/30 into
  // 30/30/40, which is never what the author of the sheet meant.
  if (errors.length === 0 && Math.abs(total - 100) > 0.005) {
    errors.push(`Instalment shares must total 100% (they total ${total.toFixed(2)}%).`);
  }

  return { lines: errors.length > 0 ? [] : lines, errors };
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  /** Learner identity so the user can tell WHOSE row failed, not just which Excel row. */
  roll_number?: string;
  student_name?: string;
}

/**
 * One successfully-created bill, echoed back so the post-upload summary can
 * name the learner and the downloadable report can list exactly what was
 * committed.
 */
export interface ImportSuccessRow {
  row: number;
  roll_number: string;
  student_name: string;
  billing_category: string;
  due_date: string;
  billing_amount: number;
  academic_year?: string | null;
  bill_id?: string;
}

export interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  /** Per-learner detail for committed rows (absent on legacy/error responses). */
  successes?: ImportSuccessRow[];
}

// ----------------------------------------------------------------------
// Preview / validate contract (multi-step upload flow)
//
// The upload used to be one click: pick file → bills committed. Every check
// below already ran, but only ever *after* the insert, so a bad sheet was
// discovered by reading the failure report. These types carry the same
// analysis to the client BEFORE anything is written, so the user reviews the
// data, then the errors, then commits.
// ----------------------------------------------------------------------

/**
 * What kind of problem a row has. Drives the grouping on the validation step:
 * each kind is fixed in a different place, so lumping them together makes the
 * screen unreadable on a sheet with a few hundred rows.
 *
 * - `format`    — the cell itself is wrong (blank required field, unparseable
 *                 date, non-numeric amount). Fix the spreadsheet.
 * - `lookup`    — the value is well-formed but names nothing in the database
 *                 (unknown roll number, inactive category, academic year that
 *                 doesn't exist for that institution). Fix the value, or fix
 *                 the master record.
 * - `condition` — the row is entirely valid on its own but breaks a configured
 *                 billing rule (today: `billing_categories.once_per_learner`).
 *                 Nothing is wrong with the sheet; the bill simply may not
 *                 exist. Surfaced separately because the remedy is different —
 *                 cancel the existing bill, or turn the rule off.
 */
export type RowIssueKind = 'format' | 'lookup' | 'condition';

export interface RowIssue {
  kind: RowIssueKind;
  /** Human column label ("Billing Category"), not the internal field name. */
  field?: string;
  message: string;
}

/**
 * One sheet row as the preview step shows it.
 *
 * `raw` is deliberately what the spreadsheet literally contained, untouched by
 * resolution — that is the whole point of the preview step: "did the importer
 * read my file the way I meant it?" `resolved` carries what the database
 * matched, so the same table can show the learner's real name next to the roll
 * number they typed.
 */
export interface BulkCreatePreviewRow {
  /** 1-indexed Excel row number (header is row 1, so data starts at 2). */
  row: number;
  status: 'valid' | 'error';
  raw: {
    roll_number: string;
    first_name: string;
    last_name: string;
    institution_name: string;
    academic_year_name: string;
    billing_category_name: string;
    bill_description: string;
    /** Normalised to yyyy-mm-dd when parseable, else the raw text as typed. */
    due_date: string;
    /** Null when the cell wasn't a number — preview still shows the raw text. */
    billing_amount: number | null;
    billing_amount_raw: string;
    remarks: string;
  };
  resolved: {
    student_name: string | null;
    institution_name: string | null;
    academic_year_name: string | null;
    billing_category_name: string | null;
  };
  issues: RowIssue[];
}

/**
 * Per-category report for the rules checked on the validation step.
 *
 * Shown even when nothing conflicts: a clerk uploading 400 tuition bills needs
 * to see that the once-per-learner rule *was evaluated and passed*, not just
 * an absence of red.
 */
export interface CategoryConditionCheck {
  category_name: string;
  rule: 'once_per_learner';
  /** Rows in this sheet that name this category. */
  rowsChecked: number;
  /** Rows blocked by a live bill that already exists in the database. */
  conflictsExisting: number;
  /** Rows blocked by an earlier row of THIS sheet claiming the same pair. */
  conflictsInFile: number;
}

export interface BulkCreatePreviewResult {
  /** Which worksheet was read — worth showing, since it is picked by name. */
  sheetName: string;
  /**
   * File-level failure that stopped parsing entirely (no readable sheet, no
   * data rows, a missing required column). When set, `rows` is empty and the
   * UI shows this instead of an empty table.
   */
  fatal: string | null;
  totalRows: number;
  validRows: number;
  errorRows: number;
  /** Distinct learners across the valid rows. */
  learnerCount: number;
  /** Sum of `billing_amount` over valid rows only. */
  totalAmount: number;
  issueCounts: Record<RowIssueKind, number>;
  conditionChecks: CategoryConditionCheck[];
  categoryBreakdown: Array<{ category_name: string; rows: number; amount: number }>;
  rows: BulkCreatePreviewRow[];
  /**
   * True when `rows` was capped for transport. Errors are NEVER capped, so a
   * truncated preview still reports every problem — only the table is short.
   */
  rowsTruncated: boolean;
  /** Flat error list — feeds the downloadable issues report. */
  errors: ImportError[];
}

/** Rows returned to the client for the preview table. Errors are uncapped. */
export const PREVIEW_ROW_CAP = 5000;
