import * as XLSX from 'xlsx';
import { getErrorMessage } from '@/lib/utils';
import { selectInBatches } from '@/lib/utils/supabase-batched-in';
import {
  AMOUNT_LOCKED_STATUSES,
  EDITABLE_FIELD_LABELS,
  type BillFieldChange,
  type BulkEditError,
  type EditableField
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

// ---- cell coercion helpers (mirrors bills/import route) ----------------
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function cellToISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
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

/**
 * Money cell → number. Tolerates what people actually paste into Excel:
 * thousands separators, a rupee sign, stray spaces. Returns null for anything
 * that isn't a finite number so the caller can raise a row error instead of
 * silently writing NaN into a NOT NULL numeric column.
 */
function cellToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(/[₹,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Compare money in paise — 1234.56 vs 1234.5600000001 is not a change. */
const toPaise = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normalize optional free text: '' / whitespace → null so blank == cleared.
function normText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length ? t : null;
}

/** Internal: a parsed row with resolved DB values + the diff. */
export interface BulkEditComputedRow {
  row: number;
  bill_id: string;
  roll_number: string;
  student_name: string;
  status: string;
  valid: boolean;
  changes: BillFieldChange[];
  /** Columns to write (only the changed ones). */
  update: Record<string, unknown>;
}

export interface BulkEditChangeSet {
  computed: BulkEditComputedRow[];
  errors: BulkEditError[];
}

/**
 * Max ids per `id=in.(...)` filter. PostgREST puts them in the query string on
 * writes exactly as it does on reads, so the same ~31 KB gateway ceiling (~804
 * UUIDs) applies to UPDATE. 100 is the repo-wide safe batch.
 */
const UPDATE_ID_BATCH = 100;

/** UPDATE requests in flight at once. Bounded so a big apply can't stampede. */
const UPDATE_CONCURRENCY = 8;

export class BulkEditBillsService {
  /**
   * Parse the uploaded workbook, resolve lookups, read each bill's current
   * values, and compute per-field diffs. NO writes. Used by preview AND apply.
   */
  static async parseAndValidate(
    buffer: ArrayBuffer,
    client: any
  ): Promise<BulkEditChangeSet> {
    const errors: BulkEditError[] = [];

    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    // Pick the data sheet by name; fall back to the first sheet.
    const sheetName =
      workbook.SheetNames.find((n) => n.toLowerCase() === 'bills') ??
      workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
    if (!sheet) {
      return { computed: [], errors: [{ row: 0, message: 'No sheet found in workbook.' }] };
    }

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });
    if (aoa.length < 2) {
      return { computed: [], errors: [{ row: 0, message: 'File is empty or has only a header row.' }] };
    }

    // Build a header → column-index map (parse BY NAME, not position).
    const headerRow = (aoa[0] || []).map((c) => cellToString(c).toLowerCase());
    const colOf = (name: string) => headerRow.indexOf(name.toLowerCase());
    const cBillId = colOf('Bill ID');
    const cAmount = colOf('Final Amount');
    const cAy = colOf('Academic Year');
    const cCat = colOf('Billing Category');
    const cDesc = colOf('Bill Description');
    const cDue = colOf('Due Date');
    const cRemarks = colOf('Remarks');
    if (cBillId < 0) {
      return { computed: [], errors: [{ row: 0, message: 'Missing required "Bill ID" column — use the downloaded template.' }] };
    }

    // First pass: read raw editable cells per row, keyed by bill_id.
    interface RawRow {
      row: number;
      bill_id: string;
      amount_raw: unknown;
      ay_name: string;
      cat_name: string;
      desc: string;
      due_raw: unknown;
      remarks: string;
    }
    const raws: RawRow[] = [];
    const seenBillIds = new Set<string>();
    const dataRows = aoa.slice(1);

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2;
      const cells = dataRows[i] || [];
      const isBlank = cells.every(
        (c) => c === null || c === undefined || String(c).trim() === ''
      );
      if (isBlank) continue;

      const billId = cellToString(cells[cBillId]);
      if (!billId) {
        errors.push({ row: rowNumber, field: 'Bill ID', message: 'Bill ID is missing.' });
        continue;
      }
      if (!UUID_RE.test(billId)) {
        errors.push({ row: rowNumber, field: 'Bill ID', message: `"${billId}" is not a valid Bill ID.` });
        continue;
      }
      if (seenBillIds.has(billId)) {
        errors.push({ row: rowNumber, field: 'Bill ID', message: `Bill ID "${billId}" appears more than once — keep one row per bill.` });
        continue;
      }
      seenBillIds.add(billId);

      raws.push({
        row: rowNumber,
        bill_id: billId,
        amount_raw: cAmount >= 0 ? cells[cAmount] : null,
        ay_name: cAy >= 0 ? cellToString(cells[cAy]) : '',
        cat_name: cCat >= 0 ? cellToString(cells[cCat]) : '',
        desc: cDesc >= 0 ? cellToString(cells[cDesc]) : '',
        due_raw: cDue >= 0 ? cells[cDue] : null,
        remarks: cRemarks >= 0 ? cellToString(cells[cRemarks]) : ''
      });
    }

    if (raws.length === 0) {
      return { computed: [], errors };
    }

    // Load current bills (RLS-scoped) for all referenced ids.
    //
    // MUST stay batched. `.in()` serializes every UUID into the GET query
    // string (36 chars + an encoded comma = 39 bytes each), so a single call
    // blows past the Supabase/Kong ~31 KB URL ceiling at ~804 ids and comes
    // back as a bare HTTP 400 `{ message: 'Bad Request' }` — no PostgREST
    // code/details, and fast rather than a timeout, so it reads like a broken
    // query. The export cap is 5000 bills (BULK_EDIT_DOWNLOAD_CAP), i.e. every
    // upload over ~800 rows failed here before reading a single bill.
    const billIds = raws.map((r) => r.bill_id);
    const { data: bills, error: billErr } = await selectInBatches<any>(
      billIds,
      (chunk) =>
        client
          .from('billing_student_bills')
          .select(
            `
        id, institution_id, academic_year_id, item_category_id,
        bill_description, due_date, remarks, status,
        final_amount, total_amount, unit_amount, tax_amount, quantity,
        student:learners_profiles(first_name, last_name, roll_number),
        academic_year:academic_years(academic_year_name),
        item_category:billing_categories(category_name)
      `
          )
          .in('id', chunk)
    );
    if (billErr) throw billErr;

    const billById = new Map<string, any>();
    (bills || []).forEach((b: any) => billById.set(b.id, b));

    // Paid-to-date per bill, for the bills whose Final Amount cell differs from
    // what's stored. Scoped to just those bills so an amount-free edit (the
    // common case) costs no extra round-trip. This mirrors what the DB's
    // `update_bill_balance_on_amount_change` trigger will itself sum, so the
    // floor we enforce here is the same number that decides the new status.
    const amountCandidateIds: string[] = [];
    if (cAmount >= 0) {
      for (const r of raws) {
        const bill = billById.get(r.bill_id);
        if (!bill) continue;
        const n = cellToNumber(r.amount_raw);
        if (n === null) continue; // blank or junk — handled per-row below
        if (toPaise(n) !== toPaise(Number(bill.final_amount ?? 0))) {
          amountCandidateIds.push(r.bill_id);
        }
      }
    }
    const paidByBillId = new Map<string, number>();
    if (amountCandidateIds.length > 0) {
      const { data: receiptItems, error: paidErr } = await selectInBatches<any>(
        amountCandidateIds,
        (chunk) =>
          client
            .from('billing_receipt_items')
            .select('bill_id, amount_paid')
            .in('bill_id', chunk)
      );
      if (paidErr) throw paidErr;
      (receiptItems || []).forEach((it: any) => {
        paidByBillId.set(
          it.bill_id,
          (paidByBillId.get(it.bill_id) ?? 0) + Number(it.amount_paid ?? 0)
        );
      });
    }

    // Resolve Academic Year names per institution (names repeat per institution).
    const institutionIds = Array.from(
      new Set((bills || []).map((b: any) => b.institution_id).filter(Boolean))
    );
    const { data: ayRows } = await client
      .from('academic_years')
      .select('id, academic_year_name, institution_id')
      .in(
        'institution_id',
        institutionIds.length ? institutionIds : ['00000000-0000-0000-0000-000000000000']
      );
    const ayByInstName = new Map<string, string>();
    (ayRows || []).forEach((y: any) => {
      ayByInstName.set(
        `${y.institution_id}::${String(y.academic_year_name).trim().toLowerCase()}`,
        y.id
      );
    });

    // Resolve active Billing Category names → id.
    const { data: catRows } = await client
      .from('billing_categories')
      .select('id, category_name, is_active');
    const catByName = new Map<string, string>();
    (catRows || []).forEach((c: any) => {
      if (c.is_active !== false) catByName.set(String(c.category_name), c.id);
    });

    // Second pass: diff each row against the current bill.
    const computed: BulkEditComputedRow[] = [];
    for (const r of raws) {
      const bill = billById.get(r.bill_id);
      const studentName = bill
        ? `${bill.student?.first_name || ''} ${bill.student?.last_name || ''}`.trim() || 'Unknown'
        : 'Unknown';
      const rollNumber = bill?.student?.roll_number || '';

      if (!bill) {
        errors.push({ row: r.row, field: 'Bill ID', message: `Bill "${r.bill_id}" not found or you don't have access to it.` });
        continue;
      }

      const rowErrors: BulkEditError[] = [];
      const changes: BillFieldChange[] = [];
      const update: Record<string, unknown> = {};

      const pushChange = (
        field: EditableField,
        oldDisp: string | null,
        newDisp: string | null
      ) => changes.push({ field, label: EDITABLE_FIELD_LABELS[field], old: oldDisp, new: newDisp });

      // -- Final Amount (blank = keep current; NOT NULL, so never cleared) --
      //
      // The only field here with financial consequence. Writing final_amount
      // fires update_bill_balance_on_amount_change (BEFORE UPDATE), which
      // re-sums receipts and rewrites balance_amount + status. Guards below
      // exist because that trigger is unconditional:
      //   • void statuses would come back as 'unpaid' — a resurrected bill;
      //   • an amount below what's receipted clamps balance to 0 and marks the
      //     bill 'paid', leaving the excess collected but unaccounted for.
      // total_amount/unit_amount move with it so the row stays internally
      // consistent (final = total + tax, total = quantity × unit).
      if (cAmount >= 0 && cellToString(r.amount_raw) !== '') {
        const desiredAmount = cellToNumber(r.amount_raw);
        const currentAmount = Number(bill.final_amount ?? 0);
        const tax = Number(bill.tax_amount ?? 0);
        const qty = Number(bill.quantity ?? 1) || 1;
        const paid = paidByBillId.get(r.bill_id) ?? 0;

        if (desiredAmount === null) {
          rowErrors.push({ row: r.row, field: 'Final Amount', message: `"${cellToString(r.amount_raw)}" is not a valid amount.` });
        } else if (desiredAmount < 0) {
          rowErrors.push({ row: r.row, field: 'Final Amount', message: 'Amount cannot be negative.' });
        } else if (toPaise(desiredAmount) !== toPaise(currentAmount)) {
          if ((AMOUNT_LOCKED_STATUSES as readonly string[]).includes(bill.status)) {
            rowErrors.push({ row: r.row, field: 'Final Amount', message: `Amount cannot be changed on a ${bill.status} bill. Leave the cell at ${money(currentAmount)}.` });
          } else if (toPaise(desiredAmount) < toPaise(tax)) {
            rowErrors.push({ row: r.row, field: 'Final Amount', message: `Amount ${money(desiredAmount)} is below the ${money(tax)} tax already on this bill.` });
          } else if (toPaise(desiredAmount) < toPaise(paid)) {
            rowErrors.push({ row: r.row, field: 'Final Amount', message: `Amount ${money(desiredAmount)} is below the ${money(paid)} already receipted against this bill. Refund or cancel the receipt first.` });
          } else {
            const newFinal = round2(desiredAmount);
            const newTotal = round2(newFinal - tax);
            update.final_amount = newFinal;
            update.total_amount = newTotal;
            update.unit_amount = qty === 1 ? newTotal : round2(newTotal / qty);
            pushChange('final_amount', money(currentAmount), money(newFinal));
          }
        }
      }

      // -- Academic Year (blank = clear to NULL) --
      let desiredAyId: string | null = null;
      let desiredAyDisp = 'Unspecified';
      if (r.ay_name) {
        const resolved = ayByInstName.get(`${bill.institution_id}::${r.ay_name.toLowerCase()}`);
        if (!resolved) {
          rowErrors.push({ row: r.row, field: 'Academic Year', message: `Academic year "${r.ay_name}" not found for this bill's institution.` });
        } else {
          desiredAyId = resolved;
          desiredAyDisp = r.ay_name;
        }
      }
      const currentAyDisp = bill.academic_year?.academic_year_name ?? 'Unspecified';
      if (rowErrors.length === 0 && desiredAyId !== (bill.academic_year_id ?? null)) {
        update.academic_year_id = desiredAyId;
        pushChange('academic_year', currentAyDisp, desiredAyDisp);
      }

      // -- Billing Category (blank = keep current, never forced) --
      // NOT strictly required: legacy bills with a NULL category (the data class
      // most likely to need an Academic-Year backfill) export with a blank
      // category cell. Forcing a value there would reject the very rows this
      // feature exists to fix. A blank cell therefore means "leave as-is"; only
      // a non-blank value is validated and applied as a re-classification.
      if (r.cat_name) {
        const catId = catByName.get(r.cat_name);
        if (!catId) {
          rowErrors.push({ row: r.row, field: 'Billing Category', message: `Billing category "${r.cat_name}" does not exist or is inactive.` });
        } else if (catId !== bill.item_category_id) {
          update.item_category_id = catId;
          pushChange('item_category', bill.item_category?.category_name || '(unspecified)', r.cat_name);
        }
      }

      // -- Bill Description (blank = clear) --
      const desiredDesc = normText(r.desc);
      const currentDesc = normText(bill.bill_description);
      if (desiredDesc !== currentDesc) {
        update.bill_description = desiredDesc;
        pushChange('bill_description', currentDesc ?? '(empty)', desiredDesc ?? '(empty)');
      }

      // -- Due Date (required) --
      const desiredDue = cellToISODate(r.due_raw);
      if (!desiredDue) {
        rowErrors.push({ row: r.row, field: 'Due Date', message: 'Due date is missing or not a valid date (yyyy-mm-dd).' });
      } else if (desiredDue !== bill.due_date) {
        update.due_date = desiredDue;
        pushChange('due_date', bill.due_date, desiredDue);
      }

      // -- Remarks (blank = clear) --
      const desiredRemarks = normText(r.remarks);
      const currentRemarks = normText(bill.remarks);
      if (desiredRemarks !== currentRemarks) {
        update.remarks = desiredRemarks;
        pushChange('remarks', currentRemarks ?? '(empty)', desiredRemarks ?? '(empty)');
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        computed.push({
          row: r.row, bill_id: r.bill_id, roll_number: rollNumber,
          student_name: studentName, status: bill.status,
          valid: false, changes: [], update: {}
        });
        continue;
      }

      computed.push({
        row: r.row, bill_id: r.bill_id, roll_number: rollNumber,
        student_name: studentName, status: bill.status,
        valid: true, changes, update
      });
    }

    return { computed, errors };
  }

  /**
   * Apply a change-set: UPDATE each valid-and-changed bill (RLS as the user).
   * Returns applied rows (full, uncapped) + per-row failures. Partial success.
   *
   * Rows are grouped by identical payload so ONE request updates every bill
   * receiving the same edit — the dominant use case (backfilling a single
   * academic year across thousands of bills) collapses from N requests to a
   * handful. Groups are then id-batched and run with bounded concurrency, so
   * the worst case (every row a distinct payload) stays inside maxDuration
   * instead of serialising N round-trips.
   */
  static async apply(
    changeSet: BulkEditChangeSet,
    client: any
  ): Promise<{
    applied: { bill_id: string; roll_number: string; student_name: string; changes: BillFieldChange[] }[];
    failed: BulkEditError[];
  }> {
    const targets = changeSet.computed.filter((r) => r.valid && r.changes.length > 0);
    if (targets.length === 0) return { applied: [], failed: [] };

    // Group bills whose write payload is byte-identical.
    const groups = new Map<string, { update: Record<string, unknown>; ids: string[] }>();
    for (const r of targets) {
      const key = JSON.stringify(
        Object.keys(r.update)
          .sort()
          .map((k) => [k, r.update[k]])
      );
      const existing = groups.get(key);
      if (existing) existing.ids.push(r.bill_id);
      else groups.set(key, { update: r.update, ids: [r.bill_id] });
    }

    // Flatten into id-batched tasks.
    const tasks: { update: Record<string, unknown>; ids: string[] }[] = [];
    for (const g of groups.values()) {
      for (let i = 0; i < g.ids.length; i += UPDATE_ID_BATCH) {
        tasks.push({ update: g.update, ids: g.ids.slice(i, i + UPDATE_ID_BATCH) });
      }
    }

    const rowByBillId = new Map(targets.map((r) => [r.bill_id, r]));
    const updatedIds = new Set<string>();
    const erroredIds = new Set<string>();
    const failed: BulkEditError[] = [];

    const runTask = async (task: { update: Record<string, unknown>; ids: string[] }) => {
      const failTask = (message: string) => {
        for (const id of task.ids) {
          erroredIds.add(id);
          failed.push({
            row: rowByBillId.get(id)?.row ?? 0,
            message: `Update failed for bill ${id}: ${message}`
          });
        }
      };
      try {
        // .select('id') returns the rows the DB actually wrote. Verified safe
        // here: no UPDATE/SELECT policy on this table keys off a column bulk
        // edit writes, so a written row cannot drop out of the actor's scope.
        const { data, error } = await client
          .from('billing_student_bills')
          .update(task.update)
          .in('id', task.ids)
          .select('id');
        if (error) {
          failTask(error.message);
          return;
        }
        (data || []).forEach((b: any) => updatedIds.add(b.id));
      } catch (err) {
        failTask(getErrorMessage(err));
      }
    };

    for (let i = 0; i < tasks.length; i += UPDATE_CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + UPDATE_CONCURRENCY).map(runTask));
    }

    // Walk `targets` (not the async results) so the report stays in row order.
    const applied: { bill_id: string; roll_number: string; student_name: string; changes: BillFieldChange[] }[] = [];
    for (const r of targets) {
      if (updatedIds.has(r.bill_id)) {
        applied.push({
          bill_id: r.bill_id,
          roll_number: r.roll_number,
          student_name: r.student_name,
          changes: r.changes
        });
      } else if (!erroredIds.has(r.bill_id)) {
        // No error, but the DB didn't return it: RLS declined the write or the
        // bill disappeared between preview and apply. Previously this counted
        // as a phantom success.
        failed.push({
          row: r.row,
          message: `Bill ${r.bill_id} was not updated — it no longer exists, or you don't have permission to edit it.`
        });
      }
    }
    failed.sort((a, b) => a.row - b.row);

    return { applied, failed };
  }
}
