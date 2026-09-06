import * as XLSX from 'xlsx';
import { getErrorMessage } from '@/lib/utils';
import { selectInBatches } from '@/lib/utils/supabase-batched-in';
import {
  resolveStudentBillColumns,
  parseInstalmentColumns,
  PREVIEW_ROW_CAP,
  type BulkCreatePreviewResult,
  type BulkCreatePreviewRow,
  type CategoryConditionCheck,
  type ImportError,
  type ImportSuccessRow,
  type ParsedInstalmentLine,
  type RowIssue,
  type RowIssueKind
} from '@/lib/utils/mappings/student-bill-excel-mappings';
import { writeBillInstalments } from '../instalments/bill-instalment-writer';
import {
  isOncePerLearnerViolation,
  oncePerLearnerMessage
} from '@/lib/utils/billing-duplicate-error';

/**
 * Bulk-create Student Bills from an uploaded Excel sheet, in two phases.
 *
 * WHY THIS IS A SERVICE AND NOT A ROUTE HANDLER
 * ---------------------------------------------
 * This logic used to live inline in `app/api/billing/schedule/bills/import/
 * route.ts`, where ~380 lines of validation were followed immediately by the
 * INSERT. Every check the user now sees on the preview screen already ran back
 * then — it just ran *after* the write was already committed, so the only way
 * to learn a sheet was wrong was to read the failure report of bills that had
 * already been created (or, worse, partially created).
 *
 * Splitting it here gives two callers the exact same analysis:
 *   • `import/preview` — runs `parseAndValidate` and returns the verdict. No writes.
 *   • `import`         — runs `parseAndValidate` again, then `commit`.
 *
 * The commit path deliberately RE-VALIDATES from the uploaded file rather than
 * trusting a payload echoed back by the client. Two reasons: the browser cannot
 * be allowed to hand us insert rows it assembled itself, and the database may
 * have moved under the preview (someone else creating the conflicting bill is
 * the realistic case). Re-parsing costs one workbook read against several DB
 * round-trips we make anyway.
 *
 * Mirrors `BulkEditBillsService` (same module, same shape) so the two bulk
 * flows read alike: `parseAndValidate` for the dry run, a second method to write.
 */

// ----------------------------------------------------------------------
// Cell coercion — the sheet is user-authored, so every read is defensive.
// Kept byte-identical to the bulk-edit service so both flows read the same
// spreadsheet the same way; a divergence here would mean a date that previews
// one way and commits another.
// ----------------------------------------------------------------------

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function cellToNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Clerks paste "₹ 45,000" straight out of another sheet.
  const cleaned = String(value).replace(/[, ₹]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cellToISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  // Excel date serial: days since 1900-01-00. 25569 = days 1900-01-01 → 1970-01-01.
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------
// Internal shapes
// ----------------------------------------------------------------------

/** A row that passed every check, paired with the columns to insert. */
interface PendingInsert {
  row: number;
  payload: Record<string, unknown>;
  success: ImportSuccessRow;
  /** Written to billing_bill_instalments once the bill row has an id. */
  instalments: ParsedInstalmentLine[];
}

/**
 * Result of a dry run. `rows` is client-safe; `inserts` is server-only and is
 * never serialised into a response — `toPreviewResult` builds the client
 * payload from `rows` and deliberately does not read `inserts`.
 */
export interface BulkCreateAnalysis {
  sheetName: string;
  fatal: string | null;
  rows: BulkCreatePreviewRow[];
  inserts: PendingInsert[];
  conditionChecks: CategoryConditionCheck[];
}

/** Rows per INSERT request. */
const INSERT_CHUNK = 200;

/** Sentinel for a roll number that matches more than one learner. */
const AMBIGUOUS = '__AMBIGUOUS__';

const REQUIRED_COLUMNS: Array<[field: string, label: string]> = [
  ['roll_number', 'Roll Number'],
  // Required since 2026-07-29. Checked at header level so a sheet missing the
  // column fails once with a clear message instead of every row failing
  // individually with "Academic year is required".
  ['academic_year_name', 'Academic Year'],
  ['billing_category_name', 'Billing Category'],
  ['due_date', 'Due Date'],
  ['billing_amount', 'Billing Amount']
];

/** Sheets that are never the data sheet. */
const NON_DATA_SHEETS = new Set(['lists', 'instructions']);

export class BulkCreateBillsService {
  /**
   * Parse the workbook, resolve every lookup, and evaluate the configured
   * billing rules. NOTHING is written. Used by the preview route AND by the
   * commit route.
   *
   * Returns EVERY non-blank row — valid and invalid alike, in sheet order — so
   * the preview table can show the file as a whole rather than only its
   * problems. Rows carry their own `issues`; `status` is derived from them.
   */
  static async parseAndValidate(
    buffer: ArrayBuffer,
    client: any
  ): Promise<BulkCreateAnalysis> {
    const empty = (sheetName: string, fatal: string): BulkCreateAnalysis => ({
      sheetName,
      fatal,
      rows: [],
      inserts: [],
      conditionChecks: []
    });

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Pick the data sheet BY NAME. Taking SheetNames[0] breaks as soon as a
    // sheet is reordered or the file is re-saved by a tool that moves
    // "Instructions" to the front — and the resulting "file is empty" error
    // points nowhere near the real cause.
    const sheetName =
      workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'bills') ??
      workbook.SheetNames.find((n) => !NON_DATA_SHEETS.has(n.trim().toLowerCase())) ??
      workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      return empty(
        sheetName ?? '',
        'No readable sheet found in this workbook. Expected a sheet named "Bills".'
      );
    }

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });

    if (aoa.length < 2) {
      return empty(
        sheetName,
        `Sheet "${sheetName}" has a header row but no data rows. Add at least one bill row below the header and re-upload.`
      );
    }

    // Resolve columns by HEADER TEXT, not position. This is what lets the
    // template gain columns (First Name / Last Name) without shifting every
    // field one to the right in sheets already in circulation.
    const col = resolveStudentBillColumns((aoa[0] ?? []) as unknown[]);

    const missingColumns = REQUIRED_COLUMNS.filter(([field]) => col[field] === undefined);
    if (missingColumns.length > 0) {
      return empty(
        sheetName,
        `Sheet "${sheetName}" is missing required column${missingColumns.length > 1 ? 's' : ''}: ` +
          `${missingColumns.map(([, label]) => `"${label}"`).join(', ')}. ` +
          'Download a fresh template, or check the header row spelling.'
      );
    }

    // -- Pass 1: read + coerce every non-blank row ---------------------
    //
    // A row that fails here still becomes a preview row. The old flow dropped
    // malformed rows from its output entirely, so a sheet where the amount
    // column had been formatted as text showed the user nothing to look at.
    interface StagedRow {
      preview: BulkCreatePreviewRow;
      /** Only set when the row is well-formed enough to attempt resolution. */
      cleaned: {
        roll_number: string;
        academic_year_name: string;
        billing_category_name: string;
        institution_name: string;
        bill_description: string;
        remarks: string;
        due_date: string;
        billing_amount: number;
      } | null;
    }

    const staged: StagedRow[] = [];
    const dataRows = aoa.slice(1);

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // 1-indexed Excel row, +1 for the header
      const cells = dataRows[i] || [];

      const isBlank = cells.every(
        (c) => c === null || c === undefined || String(c).trim() === ''
      );
      if (isBlank) continue;

      // Read through the resolved header map. A column the sheet doesn't carry
      // reads as null rather than silently picking up its neighbour's value.
      const cell = (field: string): unknown =>
        col[field] === undefined ? null : cells[col[field]] ?? null;

      const rollNumber = cellToString(cell('roll_number'));
      const academicYear = cellToString(cell('academic_year_name'));
      const categoryName = cellToString(cell('billing_category_name'));
      const institutionName = cellToString(cell('institution_name'));
      const description = cellToString(cell('bill_description'));
      const remarks = cellToString(cell('remarks'));
      const sharesRaw = cellToString(cell('instalment_shares'));
      const datesRaw = cellToString(cell('instalment_due_dates'));
      const firstName = cellToString(cell('first_name'));
      const lastName = cellToString(cell('last_name'));

      const dueRaw = cell('due_date');
      const dueIso = cellToISODate(dueRaw);
      const amountRaw = cellToString(cell('billing_amount'));
      const amount = cellToNumber(cell('billing_amount'));

      const issues: RowIssue[] = [];

      // Format checks. All of them run — the user gets every bad cell in the
      // row at once instead of fixing them one upload at a time. (The old Zod
      // pass bailed the row on the first amount failure before schema checks
      // ever saw the other columns.)
      if (!rollNumber) {
        issues.push({ kind: 'format', field: 'Roll Number', message: 'Roll number is required.' });
      }
      if (!academicYear) {
        issues.push({ kind: 'format', field: 'Academic Year', message: 'Academic year is required.' });
      }
      if (!categoryName) {
        issues.push({ kind: 'format', field: 'Billing Category', message: 'Billing category is required.' });
      }
      if (!dueIso) {
        // Distinguish "you left it blank" from "what you typed isn't a date" —
        // they are different mistakes and the second one needs the value quoted
        // back, otherwise the user can't tell which cell to look at.
        const dueText = cellToString(dueRaw);
        issues.push({
          kind: 'format',
          field: 'Due Date',
          message: dueText
            ? `Due date "${dueText}" is not a valid date. Use yyyy-mm-dd, or pick a date so Excel stores it as a real date.`
            : 'Due date is required (yyyy-mm-dd).'
        });
      }
      if (amount === null) {
        issues.push({
          kind: 'format',
          field: 'Billing Amount',
          message: amountRaw
            ? `Billing amount "${amountRaw}" is not a number.`
            : 'Billing amount is required.'
        });
      } else if (amount < 0) {
        issues.push({
          kind: 'format',
          field: 'Billing Amount',
          message: 'Billing amount must be 0 or more.'
        });
      }

      const preview: BulkCreatePreviewRow = {
        row: rowNumber,
        status: issues.length > 0 ? 'error' : 'valid',
        raw: {
          roll_number: rollNumber,
          first_name: firstName,
          last_name: lastName,
          institution_name: institutionName,
          academic_year_name: academicYear,
          billing_category_name: categoryName,
          bill_description: description,
          // Show the normalised date when we could read one, otherwise echo
          // exactly what the cell held so the user can see what to fix.
          due_date: dueIso ?? cellToString(dueRaw),
          billing_amount: amount,
          billing_amount_raw: amountRaw,
          remarks
        },
        resolved: {
          student_name: null,
          institution_name: null,
          academic_year_name: null,
          billing_category_name: null
        },
        issues
      };

      staged.push({
        preview,
        cleaned:
          issues.length === 0 && amount !== null && dueIso
            ? {
                roll_number: rollNumber,
                academic_year_name: academicYear,
                billing_category_name: categoryName,
                institution_name: institutionName,
                bill_description: description,
                remarks,
                due_date: dueIso,
                billing_amount: amount
              }
            : null
      });
    }

    const resolvable = staged.filter((s) => s.cleaned !== null);
    if (resolvable.length === 0) {
      // Still a complete analysis — the preview table renders, every row is
      // marked, and the validation step explains each one.
      return {
        sheetName,
        fatal: null,
        rows: staged.map((s) => s.preview),
        inserts: [],
        conditionChecks: []
      };
    }

    // -- Batch lookups -------------------------------------------------
    const uniqueRolls = Array.from(new Set(resolvable.map((s) => s.cleaned!.roll_number)));
    const uniqueCategoryNames = Array.from(
      new Set(resolvable.map((s) => s.cleaned!.billing_category_name))
    );

    // MUST stay batched. `.in()` serialises every value into the GET query
    // string, and past ~800 values the Supabase/Kong gateway answers a bare
    // HTTP 400 that reads like a broken query rather than a URL-length problem.
    const { data: learners, error: learnerError } = await selectInBatches<any>(
      uniqueRolls,
      (chunk) =>
        client
          .from('learners_profiles')
          .select('id, roll_number, institution_id, first_name, last_name')
          .in('roll_number', chunk)
    );
    if (learnerError) throw learnerError;

    const learnerByRoll = new Map<
      string,
      { id: string; institution_id: string | null; name: string }
    >();
    (learners ?? []).forEach((s: any) => {
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      if (!learnerByRoll.has(s.roll_number)) {
        learnerByRoll.set(s.roll_number, {
          id: s.id,
          institution_id: s.institution_id,
          name
        });
      } else {
        // Duplicate roll numbers exist in production (113 groups as of
        // 2026-07-27). Mark the roll ambiguous so the row fails loudly rather
        // than billing whichever learner happened to be read first.
        learnerByRoll.set(s.roll_number, { id: AMBIGUOUS, institution_id: null, name: '' });
      }
    });

    // Academic years are per-institution and the sets differ sharply between
    // colleges, so resolution is keyed by institution — a year name valid at
    // one college is still rejected at another.
    const institutionIds = Array.from(
      new Set(
        Array.from(learnerByRoll.values())
          .map((s) => s.institution_id)
          .filter((x): x is string => Boolean(x))
      )
    );
    //
    // Every lookup below checks `error` and throws. A swallowed read is far
    // worse here than anywhere else in the app: if the academic_years query
    // fails, the map comes back empty and EVERY row gets told "academic year
    // does not exist for this institution" — a confident, specific, completely
    // wrong verdict on a screen whose whole job is to be trusted. Failing loudly
    // gets the user a "couldn't read the file" they can retry.
    const { data: acadYears, error: acadYearError } = await selectInBatches<any>(
      institutionIds,
      (chunk) =>
        client
          .from('academic_years')
          .select('id, academic_year_name, institution_id')
          .in('institution_id', chunk)
    );
    if (acadYearError) throw acadYearError;
    const acadYearByInstName = new Map<string, string>();
    const acadYearNamesByInst = new Map<string, string[]>();
    (acadYears ?? []).forEach((y: any) => {
      const name = String(y.academic_year_name).trim();
      acadYearByInstName.set(`${y.institution_id}::${name.toLowerCase()}`, y.id);
      const list = acadYearNamesByInst.get(y.institution_id) ?? [];
      if (!list.includes(name)) list.push(name);
      acadYearNamesByInst.set(y.institution_id, list);
    });

    // Institution name → id, to validate the optional Institution column
    // against the learner the roll number actually resolved to. Names are
    // unique across the 14 institutions, so a name is a safe key —
    // counselling_code is NOT (both Arts & Science colleges share "CAS").
    const { data: institutionRows, error: institutionError } = await client
      .from('institutions')
      .select('id, name');
    if (institutionError) throw institutionError;
    const institutionIdByName = new Map<string, string>();
    const institutionNameById = new Map<string, string>();
    (institutionRows ?? []).forEach((i: any) => {
      if (!i.name) return;
      institutionIdByName.set(String(i.name).trim().toLowerCase(), i.id);
      institutionNameById.set(i.id, String(i.name));
    });

    const { data: categories, error: categoryError } = await selectInBatches<any>(
      uniqueCategoryNames,
      (chunk) =>
        client
          .from('billing_categories')
          .select('id, category_name, is_active, once_per_learner')
          .in('category_name', chunk)
    );
    if (categoryError) throw categoryError;

    const categoryByName = new Map<string, string>();
    const categoryNameById = new Map<string, string>();
    // Categories configured to permit only one live bill per learner. The DB
    // trigger `trg_billing_bills_once_per_learner` is the real enforcement, but
    // it aborts the statement it fires on — so a single offending row would
    // take an entire chunk of good rows with it. Pre-checking here is what lets
    // the offending rows fail alone.
    const oncePerLearnerCategoryIds = new Set<string>();
    (categories ?? []).forEach((c: any) => {
      if (c.is_active !== false) {
        categoryByName.set(c.category_name, c.id);
        categoryNameById.set(c.id, c.category_name);
        if (c.once_per_learner) oncePerLearnerCategoryIds.add(c.id);
      }
    });

    // Live bills already held by the learners in this sheet, for the restricted
    // categories only. `status NOT IN ('cancelled','superseded')` matches the
    // trigger's own predicate exactly — if these ever drift, the preview starts
    // promising rows the database then refuses.
    const existingRestrictedPairs = new Set<string>();
    if (oncePerLearnerCategoryIds.size > 0) {
      const learnerIds = Array.from(
        new Set(
          Array.from(learnerByRoll.values())
            .map((s) => s.id)
            .filter((id) => id && id !== AMBIGUOUS)
        )
      );
      const { data: existing, error: existingError } = await selectInBatches<any>(
        learnerIds,
        (chunk) =>
          client
            .from('billing_student_bills')
            .select('student_id, item_category_id')
            .in('student_id', chunk)
            .in('item_category_id', Array.from(oncePerLearnerCategoryIds))
            .not('status', 'in', '("cancelled","superseded")')
      );
      if (existingError) throw existingError;
      (existing ?? []).forEach((b: any) =>
        existingRestrictedPairs.add(`${b.student_id}::${b.item_category_id}`)
      );
    }

    // -- Pass 2: resolve each row, evaluate the rules ------------------
    //
    // Pairs claimed by an earlier row of THIS sheet. Catches a file listing the
    // same learner + category twice, which the database would otherwise reject
    // only after the first row had already been accepted.
    const claimedInThisSheet = new Set<string>();
    const inserts: PendingInsert[] = [];

    // Per-category tallies for the "rules checked" report on the validate step.
    const conditionTally = new Map<string, CategoryConditionCheck>();
    const tallyFor = (categoryName: string): CategoryConditionCheck => {
      let entry = conditionTally.get(categoryName);
      if (!entry) {
        entry = {
          category_name: categoryName,
          rule: 'once_per_learner',
          rowsChecked: 0,
          conflictsExisting: 0,
          conflictsInFile: 0
        };
        conditionTally.set(categoryName, entry);
      }
      return entry;
    };

    for (const stagedRow of staged) {
      const cleaned = stagedRow.cleaned;
      if (!cleaned) continue; // already failed format checks
      const preview = stagedRow.preview;
      const fail = (kind: RowIssueKind, field: string, message: string) => {
        preview.issues.push({ kind, field, message });
        preview.status = 'error';
      };

      const learner = learnerByRoll.get(cleaned.roll_number);
      if (!learner) {
        fail('lookup', 'Roll Number', `No learner found with roll number "${cleaned.roll_number}".`);
        continue;
      }
      if (learner.id === AMBIGUOUS) {
        fail(
          'lookup',
          'Roll Number',
          `Roll number "${cleaned.roll_number}" matches more than one learner — disambiguate before importing.`
        );
        continue;
      }
      preview.resolved.student_name = learner.name || null;
      if (!learner.institution_id) {
        fail(
          'lookup',
          'Roll Number',
          `Learner "${cleaned.roll_number}" has no institution attached — fix the learner record first.`
        );
        continue;
      }
      preview.resolved.institution_name =
        institutionNameById.get(learner.institution_id) ?? null;

      // The Institution column is advisory — the roll number identifies the
      // learner. But when it was filled in and disagrees, say so plainly: it
      // means the wrong row was picked, and the academic year chosen from that
      // institution's dropdown would otherwise fail below with a far less
      // obvious message.
      if (cleaned.institution_name) {
        const claimedId = institutionIdByName.get(cleaned.institution_name.trim().toLowerCase());
        if (!claimedId) {
          fail(
            'lookup',
            'Institution',
            `Institution "${cleaned.institution_name}" does not exist. Pick one from the dropdown.`
          );
          continue;
        }
        if (claimedId !== learner.institution_id) {
          fail(
            'lookup',
            'Institution',
            `This row says "${cleaned.institution_name}", but roll number "${cleaned.roll_number}" belongs to ` +
              `"${institutionNameById.get(learner.institution_id) ?? 'another institution'}". ` +
              'Fix the Institution cell (and re-pick the Academic Year, which depends on it).'
          );
          continue;
        }
      }

      const categoryId = categoryByName.get(cleaned.billing_category_name);
      if (!categoryId) {
        fail(
          'lookup',
          'Billing Category',
          `Billing category "${cleaned.billing_category_name}" does not exist or is inactive.`
        );
        continue;
      }
      preview.resolved.billing_category_name = categoryNameById.get(categoryId) ?? null;

      // Academic year, scoped to THIS learner's institution.
      const academicYearId = acadYearByInstName.get(
        `${learner.institution_id}::${cleaned.academic_year_name.trim().toLowerCase()}`
      );
      if (!academicYearId) {
        const available = acadYearNamesByInst.get(learner.institution_id) ?? [];
        fail(
          'lookup',
          'Academic Year',
          `Academic year "${cleaned.academic_year_name}" does not exist for ` +
            `"${institutionNameById.get(learner.institution_id) ?? "this learner's institution"}". ` +
            (available.length > 0
              ? `Available: ${available.slice().sort().join(', ')}.`
              : 'That institution has no academic years set up yet — create one first.')
        );
        continue;
      }
      preview.resolved.academic_year_name = cleaned.academic_year_name;

      // -- Configured billing rule: once per learner ------------------
      if (oncePerLearnerCategoryIds.has(categoryId)) {
        const tally = tallyFor(cleaned.billing_category_name);
        tally.rowsChecked++;
        const pairKey = `${learner.id}::${categoryId}`;

        if (existingRestrictedPairs.has(pairKey)) {
          tally.conflictsExisting++;
          fail(
            'condition',
            'Billing Category',
            `"${cleaned.billing_category_name}" allows only one bill per learner, and this learner already has one. ` +
              'Cancel the existing bill first, or turn off "Once per learner" on the category.'
          );
          continue;
        }
        if (claimedInThisSheet.has(pairKey)) {
          tally.conflictsInFile++;
          fail(
            'condition',
            'Billing Category',
            `"${cleaned.billing_category_name}" allows only one bill per learner, and an earlier row in this file ` +
              'already bills this learner for it.'
          );
          continue;
        }
        claimedInThisSheet.add(pairKey);
      }

      // Optional payment schedule. Validated HERE, at preview time, so a bad
      // split is a row error the reviewer sees before committing rather than
      // a deferred BL002 after the bill row already exists.
      const schedule = parseInstalmentColumns(sharesRaw, datesRaw, cellToISODate);
      if (schedule.errors.length > 0) {
        fail('format', 'Instalment Shares', schedule.errors.join(' '));
        continue;
      }

      // Row is good. quantity is 1 and there is no tax in this flow, so total,
      // final and balance all equal the entered amount.
      const amount = cleaned.billing_amount;
      inserts.push({
        row: preview.row,
        instalments: schedule.lines,
        payload: {
          student_id: learner.id,
          institution_id: learner.institution_id,
          item_category_id: categoryId,
          academic_year_id: academicYearId,
          bill_description: cleaned.bill_description || null,
          due_date: cleaned.due_date,
          quantity: 1,
          unit_amount: amount,
          total_amount: amount,
          tax_amount: 0,
          final_amount: amount,
          balance_amount: amount,
          remarks: cleaned.remarks || null,
          is_recurring: false
        },
        success: {
          row: preview.row,
          roll_number: cleaned.roll_number,
          student_name: learner.name,
          billing_category: cleaned.billing_category_name,
          due_date: cleaned.due_date,
          billing_amount: amount,
          academic_year: cleaned.academic_year_name || null
        }
      });
    }

    return {
      sheetName,
      fatal: null,
      rows: staged.map((s) => s.preview),
      inserts,
      conditionChecks: Array.from(conditionTally.values()).sort((a, b) =>
        a.category_name.localeCompare(b.category_name)
      )
    };
  }

  /**
   * Insert the valid rows. Partial success: a chunk that fails does not stop
   * the ones after it.
   *
   * WHY CHUNKED, AND WHY A PER-ROW FALLBACK
   * A single all-or-nothing batch used to carry the whole sheet, so one row
   * rejected by the once-per-learner trigger — realistically, a bill another
   * user created in the seconds between preview and confirm — failed every
   * other row with it. That was tolerable when the user hadn't been promised
   * anything; it is not, now that a preview screen has told them "these N rows
   * are good". So: insert in chunks, and when a chunk fails, retry its rows one
   * at a time so only the genuinely offending row is lost. The per-row retry
   * only ever runs on the error path.
   */
  static async commit(
    analysis: BulkCreateAnalysis,
    client: any,
    userId: string
  ): Promise<{ successes: ImportSuccessRow[]; errors: ImportError[] }> {
    const successes: ImportSuccessRow[] = [];
    const errors: ImportError[] = [];
    if (analysis.inserts.length === 0) return { successes, errors };

    // `created_by` is stamped here rather than during validation, which keeps
    // parseAndValidate a pure read-only analysis that needs no user identity.
    const withAuthor = (p: Record<string, unknown>) => ({ ...p, created_by: userId });

    const describeFailure = (error: any): string => {
      if (isOncePerLearnerViolation(error)) {
        return `${oncePerLearnerMessage(error)} It was created while this file was being reviewed — re-upload to import the rest.`;
      }
      return getErrorMessage(error);
    };

    /**
     * Writes one bill's tranches, and reports a failure as a ROW error rather
     * than throwing. The bill itself is already committed at this point — a
     * schedule that could not be written must not make a successfully created
     * bill look like it failed, but it must not pass silently either.
     */
    const attachSchedule = async (item: PendingInsert, billId?: string) => {
      if (!billId || item.instalments.length === 0) return;
      try {
        await writeBillInstalments(
          client as never,
          billId,
          Number(item.payload.final_amount),
          item.instalments
        );
      } catch (err) {
        errors.push({
          row: item.row,
          roll_number: item.success.roll_number,
          student_name: item.success.student_name,
          message: `Bill created, but its payment schedule was not saved: ${getErrorMessage(err)}`
        });
      }
    };

    const insertOneByOne = async (batch: PendingInsert[]) => {
      for (const item of batch) {
        const { data, error } = await client
          .from('billing_student_bills')
          .insert(withAuthor(item.payload))
          .select('id')
          .single();

        if (error) {
          errors.push({
            row: item.row,
            roll_number: item.success.roll_number,
            student_name: item.success.student_name,
            message: describeFailure(error)
          });
          continue;
        }
        await attachSchedule(item, data?.id);
        successes.push({ ...item.success, bill_id: data?.id });
      }
    };

    for (let i = 0; i < analysis.inserts.length; i += INSERT_CHUNK) {
      const batch = analysis.inserts.slice(i, i + INSERT_CHUNK);
      try {
        const { data, error } = await client
          .from('billing_student_bills')
          .insert(batch.map((b) => withAuthor(b.payload)))
          .select('id');

        if (error) {
          console.warn(
            `[bulk-create-bills] Chunk of ${batch.length} failed (${getErrorMessage(error)}) — retrying row by row to isolate.`
          );
          await insertOneByOne(batch);
          continue;
        }

        // PostgREST returns inserted rows in input order, so index j of `data`
        // is the bill created from batch[j].
        for (let j = 0; j < batch.length; j++) {
          const billId = (data as any[])?.[j]?.id;
          await attachSchedule(batch[j], billId);
          successes.push({ ...batch[j].success, bill_id: billId });
        }
      } catch (err) {
        console.warn(
          `[bulk-create-bills] Chunk of ${batch.length} threw (${getErrorMessage(err)}) — retrying row by row.`
        );
        await insertOneByOne(batch);
      }
    }

    successes.sort((a, b) => a.row - b.row);
    errors.sort((a, b) => a.row - b.row);
    return { successes, errors };
  }

  /**
   * Build the client-facing preview payload.
   *
   * Reads only `analysis.rows` — the server-only `inserts` (which carry raw
   * database ids) are never serialised, so the browser cannot echo an insert
   * payload back at the commit route.
   */
  static toPreviewResult(analysis: BulkCreateAnalysis): BulkCreatePreviewResult {
    const rows = analysis.rows;
    const validRows = rows.filter((r) => r.status === 'valid');

    const issueCounts: Record<RowIssueKind, number> = { format: 0, lookup: 0, condition: 0 };
    const errors: ImportError[] = [];
    for (const r of rows) {
      for (const issue of r.issues) {
        issueCounts[issue.kind]++;
        errors.push({
          row: r.row,
          field: issue.field,
          message: issue.message,
          roll_number: r.raw.roll_number || undefined,
          student_name:
            r.resolved.student_name ||
            [r.raw.first_name, r.raw.last_name].filter(Boolean).join(' ') ||
            undefined
        });
      }
    }

    const byCategory = new Map<string, { rows: number; amount: number }>();
    let totalAmount = 0;
    const learners = new Set<string>();
    for (const r of validRows) {
      totalAmount += r.raw.billing_amount ?? 0;
      if (r.raw.roll_number) learners.add(r.raw.roll_number);
      const key = r.resolved.billing_category_name || r.raw.billing_category_name || '(none)';
      const entry = byCategory.get(key) ?? { rows: 0, amount: 0 };
      entry.rows++;
      entry.amount += r.raw.billing_amount ?? 0;
      byCategory.set(key, entry);
    }

    return {
      sheetName: analysis.sheetName,
      fatal: analysis.fatal,
      totalRows: rows.length,
      validRows: validRows.length,
      errorRows: rows.length - validRows.length,
      learnerCount: learners.size,
      totalAmount,
      issueCounts,
      conditionChecks: analysis.conditionChecks,
      categoryBreakdown: Array.from(byCategory.entries())
        .map(([category_name, v]) => ({ category_name, rows: v.rows, amount: v.amount }))
        .sort((a, b) => b.rows - a.rows),
      // Only the TABLE is capped, and the flag says so. Errors below are
      // complete regardless, so a truncated preview never hides a problem.
      rows: rows.slice(0, PREVIEW_ROW_CAP),
      rowsTruncated: rows.length > PREVIEW_ROW_CAP,
      errors
    };
  }
}
