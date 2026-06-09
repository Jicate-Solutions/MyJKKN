import * as XLSX from 'xlsx';
import {
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
    const billIds = raws.map((r) => r.bill_id);
    const { data: bills, error: billErr } = await client
      .from('billing_student_bills')
      .select(
        `
        id, institution_id, academic_year_id, item_category_id,
        bill_description, due_date, remarks, status,
        student:learners_profiles(first_name, last_name, roll_number),
        academic_year:academic_years(academic_year_name),
        item_category:billing_categories(category_name)
      `
      )
      .in('id', billIds);
    if (billErr) throw billErr;

    const billById = new Map<string, any>();
    (bills || []).forEach((b: any) => billById.set(b.id, b));

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

      // -- Billing Category (required) --
      if (!r.cat_name) {
        rowErrors.push({ row: r.row, field: 'Billing Category', message: 'Billing category is required.' });
      } else {
        const catId = catByName.get(r.cat_name);
        if (!catId) {
          rowErrors.push({ row: r.row, field: 'Billing Category', message: `Billing category "${r.cat_name}" does not exist or is inactive.` });
        } else if (catId !== bill.item_category_id) {
          update.item_category_id = catId;
          pushChange('item_category', bill.item_category?.category_name || '(unknown)', r.cat_name);
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
   */
  static async apply(
    changeSet: BulkEditChangeSet,
    client: any
  ): Promise<{
    applied: { bill_id: string; roll_number: string; student_name: string; changes: BillFieldChange[] }[];
    failed: BulkEditError[];
  }> {
    const applied: { bill_id: string; roll_number: string; student_name: string; changes: BillFieldChange[] }[] = [];
    const failed: BulkEditError[] = [];

    for (const r of changeSet.computed) {
      if (!r.valid || r.changes.length === 0) continue;
      const { error } = await client
        .from('billing_student_bills')
        .update(r.update)
        .eq('id', r.bill_id);
      if (error) {
        failed.push({ row: r.row, message: `Update failed for bill ${r.bill_id}: ${error.message}` });
        continue;
      }
      applied.push({
        bill_id: r.bill_id,
        roll_number: r.roll_number,
        student_name: r.student_name,
        changes: r.changes
      });
    }

    return { applied, failed };
  }
}
