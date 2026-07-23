# Bulk Bill Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized user filter existing student bills, download them pre-filled to Excel, edit a safe set of fields, upload, preview a per-field old→new diff, confirm, and have only the changed bills updated — with a full audit trail of who changed what.

**Architecture:** A dedicated 4-step page (`/billing/schedule/bulk-edit`) ports the proven `BulkReceiptDialog` pipeline, retargeted from "create receipts" to "update bills," matched by a locked **Bill ID** column. Four thin API routes (`template`, `count`, `preview`, `apply`) run as the authenticated user via `createServerSupabaseClient()`, so RLS enforces the `billing.schedule.update` gate and institution scope. The `apply` route writes one audit row (summary + per-bill before→after) to `user_activity_logs`.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, Supabase (RLS), `exceljs` (template build), `xlsx` (upload parse + client report), `zod` (row validation), Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-09-bulk-bill-edit-design.md`

**Verification note (read first):** This repo has **no test runner** (`CLAUDE.md`). "Verify" means: run `mcp__ide__getDiagnostics` on each touched file and confirm **no new errors**; run the `check:*` gates after route/permission changes; and exercise the feature in the browser. Do **not** write or claim to run a test suite.

---

## File Structure

**New files**

| Path | Responsibility |
|------|----------------|
| `lib/utils/mappings/student-bill-bulk-edit-mappings.ts` | Header list, editable-field constants, shared TS types (`BillForBulkEdit`, `BillFieldChange`, `BulkEditRowPreview`, `BulkEditPreviewResult`, `BulkEditApplyResult`, `BulkEditError`). Type-only. |
| `lib/services/billing/schedule/bulk-edit-bills-service.ts` | Server core: parse workbook → resolve lookups → diff vs current DB (`parseAndValidate`) and apply changed rows (`apply`). Shared by `preview` + `apply` routes so they can't drift. |
| `app/api/billing/schedule/bills/bulk-edit/template/route.ts` | `GET` — filtered export pre-filled with current values; dropdowns; 5,000-row cap; `X-Bills-Count`. |
| `app/api/billing/schedule/bills/bulk-edit/count/route.ts` | `GET` — match count for the live filter preview. |
| `app/api/billing/schedule/bills/bulk-edit/preview/route.ts` | `POST` — dry-run change-set. No writes. |
| `app/api/billing/schedule/bills/bulk-edit/apply/route.ts` | `POST` — apply changed rows (RLS as user) + audit. |
| `hooks/billing/use-bulk-edit-bills.ts` | `useBulkEditPreview()` + `useBulkEditApply()`. |
| `app/(routes)/billing/schedule/bulk-edit/page.tsx` | The 4-step page (state machine + wiring). |
| `app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-filter-panel.tsx` | Download filters + live count + download button. |
| `app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-preview-table.tsx` | Diff table + summary stats (preview step). |
| `app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-result.tsx` | Result panel + client-side change-report download. |

**Modified files**

| Path | Change |
|------|--------|
| `lib/services/billing/schedule/student-bill-service.ts` | Add static `getBillsForBulkEdit(filters, client)` + `countBillsForBulkEdit(filters, client)`. |
| `app/(routes)/billing/schedule/page.tsx` | Add a permission-gated **Bulk Edit** header button linking to the new page. |
| `lib/sidebarMenuLink.ts` | Register `'/billing/schedule/bulk-edit': 'billing.schedule.update'`. |

---

## Task 1: Shared mappings & types

**Files:**
- Create: `lib/utils/mappings/student-bill-bulk-edit-mappings.ts`

- [ ] **Step 1: Write the file**

```ts
/**
 * Excel mapping utility for the Student Bill BULK EDIT flow.
 *
 * Unlike bulk-CREATE (which keys rows by roll number to make new bills),
 * bulk-EDIT must key rows by a stable Bill ID — one student has many bills,
 * so roll number is ambiguous as an update key. The export is pre-filled with
 * each bill's CURRENT values; an unchanged cell yields no diff, and a blank
 * editable cell means "clear it" (for optional fields).
 *
 * Editable fields are deliberately non-financial (no amount/status), so editing
 * a paid/cancelled bill is harmless.
 */

export const STUDENT_BILL_BULK_EDIT_HEADERS = [
  'Bill ID',          // A  locked — match key
  'Roll Number',      // B  read-only
  'Student Name',     // C  read-only
  'Institution',      // D  read-only
  'Status',           // E  read-only
  'Final Amount',     // F  read-only
  'Academic Year',    // G  editable (dropdown) — blank = clear
  'Billing Category', // H  editable (dropdown) — required
  'Bill Description', // I  editable
  'Due Date',         // J  editable — required
  'Remarks'           // K  editable
] as const;

export type StudentBillBulkEditHeader =
  (typeof STUDENT_BILL_BULK_EDIT_HEADERS)[number];

/** The five editable fields and their display labels (used in diffs + audit). */
export type EditableField =
  | 'academic_year'
  | 'item_category'
  | 'bill_description'
  | 'due_date'
  | 'remarks';

export const EDITABLE_FIELD_LABELS: Record<EditableField, string> = {
  academic_year: 'Academic Year',
  item_category: 'Billing Category',
  bill_description: 'Bill Description',
  due_date: 'Due Date',
  remarks: 'Remarks'
};

/** Bill statuses (for the download filter dropdown). */
export const BULK_EDIT_STATUS_OPTIONS = [
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'refunded',
  'superseded'
] as const;

/** Filters the download/count endpoints understand (v1 — no hierarchy cascade). */
export interface BulkEditDownloadFilters {
  institution_id?: string;
  item_category_id?: string;
  status?: string;
  // 'unspecified' → bills whose academic_year_id IS NULL
  academic_year_id?: string;
  due_date_from?: string;
  due_date_to?: string;
}

/** One existing bill projected for the Excel export (current values). */
export interface BillForBulkEdit {
  bill_id: string;
  institution_id: string;
  institution_name: string;
  roll_number: string;
  student_name: string;
  status: string;
  final_amount: number;
  academic_year_name: string | null;
  category_name: string;
  bill_description: string | null;
  due_date: string;
  remarks: string | null;
}

/** A single field's before→after, with human-readable display values. */
export interface BillFieldChange {
  field: EditableField;
  label: string;
  old: string | null; // display
  new: string | null; // display
}

/** Per-row preview returned to the client (only changed rows are surfaced). */
export interface BulkEditRowPreview {
  row: number; // Excel row number (2-indexed)
  bill_id: string;
  roll_number: string;
  student_name: string;
  status: string;
  changes: BillFieldChange[];
}

export interface BulkEditError {
  row: number;
  field?: string;
  message: string;
}

/** Dry-run result (preview endpoint). Nothing is written. */
export interface BulkEditPreviewResult {
  totalRows: number; // non-blank data rows
  changedRows: number; // rows with ≥1 valid change
  unchangedRows: number; // valid rows with no change
  errorCount: number;
  fieldsAffected: string[]; // distinct labels across all changes
  rows: BulkEditRowPreview[]; // changed rows only (for the diff table)
  errors: BulkEditError[];
}

/** One successfully-updated bill (for the result + downloadable report). */
export interface BulkEditAppliedRow {
  bill_id: string;
  roll_number: string;
  student_name: string;
  changes: BillFieldChange[];
}

/** Commit result (apply endpoint). */
export interface BulkEditApplyResult {
  success: boolean;
  changedRows: number; // successfully updated
  unchangedRows: number;
  failedRows: number;
  errorCount: number;
  fieldsAffected: string[];
  applied: BulkEditAppliedRow[]; // FULL (uncapped) — feeds the client report
  errors: BulkEditError[];
}
```

- [ ] **Step 2: Verify types compile**

Run `mcp__ide__getDiagnostics` on `lib/utils/mappings/student-bill-bulk-edit-mappings.ts`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/utils/mappings/student-bill-bulk-edit-mappings.ts
git commit -m "feat(billing): bulk-bill-edit Excel mapping types"
```

---

## Task 2: Service query methods (export + count)

**Files:**
- Modify: `lib/services/billing/schedule/student-bill-service.ts`

These run server-side via an injected RLS client (`createServerSupabaseClient()`), mirroring how `BillingReceiptService.getOutstandingBillsForBulk(filters, client)` accepts a client. Left joins only (a bill always has a student) — no `!inner` row-drop risk.

- [ ] **Step 1: Add the import for the projection type at the top of the file**

Add to the existing import block:

```ts
import type {
  BulkEditDownloadFilters,
  BillForBulkEdit
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';
```

- [ ] **Step 2: Add the two methods inside the `StudentBillService` class** (e.g. just before the closing `}` of the class)

```ts
  /** Cap mirrored by the bulk-edit template route + filter-panel warning. */
  static readonly BULK_EDIT_DOWNLOAD_CAP = 5000;

  /**
   * Apply the bulk-edit download filters to a billing_student_bills query.
   * Shared by getBillsForBulkEdit + countBillsForBulkEdit so the count never
   * drifts from the exported set.
   */
  private static applyBulkEditFilters(query: any, filters: BulkEditDownloadFilters) {
    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.item_category_id) {
      query = query.eq('item_category_id', filters.item_category_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.academic_year_id === 'unspecified') {
      query = query.is('academic_year_id', null);
    } else if (filters.academic_year_id) {
      query = query.eq('academic_year_id', filters.academic_year_id);
    }
    if (filters.due_date_from) {
      query = query.gte('due_date', filters.due_date_from);
    }
    if (filters.due_date_to) {
      query = query.lte('due_date', filters.due_date_to);
    }
    return query;
  }

  /**
   * Existing bills (current values) for the bulk-edit export, capped.
   * RLS (via the injected client) scopes rows to the caller.
   */
  static async getBillsForBulkEdit(
    filters: BulkEditDownloadFilters,
    client: any
  ): Promise<BillForBulkEdit[]> {
    let query = client
      .from('billing_student_bills')
      .select(
        `
        id,
        institution_id,
        status,
        final_amount,
        bill_description,
        due_date,
        remarks,
        student:learners_profiles(first_name, last_name, roll_number),
        institution:institutions(name),
        academic_year:academic_years(academic_year_name),
        item_category:billing_categories(category_name)
      `
      )
      .order('created_at', { ascending: false })
      .limit(StudentBillService.BULK_EDIT_DOWNLOAD_CAP);

    query = StudentBillService.applyBulkEditFilters(query, filters);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((b: any): BillForBulkEdit => {
      const student = Array.isArray(b.student) ? b.student[0] : b.student;
      const institution = Array.isArray(b.institution)
        ? b.institution[0]
        : b.institution;
      const ay = Array.isArray(b.academic_year)
        ? b.academic_year[0]
        : b.academic_year;
      const cat = Array.isArray(b.item_category)
        ? b.item_category[0]
        : b.item_category;
      return {
        bill_id: b.id,
        institution_id: b.institution_id,
        institution_name: institution?.name || '',
        roll_number: student?.roll_number || '',
        student_name:
          `${student?.first_name || ''} ${student?.last_name || ''}`.trim() ||
          'Unknown',
        status: b.status,
        final_amount: b.final_amount ?? 0,
        academic_year_name: ay?.academic_year_name ?? null,
        category_name: cat?.category_name || '',
        bill_description: b.bill_description ?? null,
        due_date: b.due_date,
        remarks: b.remarks ?? null
      };
    });
  }

  /** Count of bills matching the bulk-edit filters (live preview). */
  static async countBillsForBulkEdit(
    filters: BulkEditDownloadFilters,
    client: any
  ): Promise<number> {
    let query = client
      .from('billing_student_bills')
      .select('id', { count: 'exact', head: true });
    query = StudentBillService.applyBulkEditFilters(query, filters);
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }
```

- [ ] **Step 3: Verify**

Run `mcp__ide__getDiagnostics` on `lib/services/billing/schedule/student-bill-service.ts`.
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/billing/schedule/student-bill-service.ts
git commit -m "feat(billing): bulk-edit bill query + count service methods"
```

---

## Task 3: Server core — parse, diff, apply

**Files:**
- Create: `lib/services/billing/schedule/bulk-edit-bills-service.ts`

This is the DRY heart: `preview` and `apply` both call `parseAndValidate`; `apply` additionally calls `apply`. It reads the uploaded workbook by **header name** (robust to column reorder), resolves Academic Year (per the bill's institution) and Billing Category, reads each bill's current values, and diffs.

- [ ] **Step 1: Write the file**

```ts
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
```

- [ ] **Step 2: Verify**

Run `mcp__ide__getDiagnostics` on `lib/services/billing/schedule/bulk-edit-bills-service.ts`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/services/billing/schedule/bulk-edit-bills-service.ts
git commit -m "feat(billing): bulk-edit parse/diff/apply core service"
```

---

## Task 4: Template export route (GET)

**Files:**
- Create: `app/api/billing/schedule/bills/bulk-edit/template/route.ts`

- [ ] **Step 1: Write the file**

```ts
export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/template/route.ts
//
// GET — Excel template pre-filled with EXISTING bills (current values) matching
// the bulk-edit download filters. Runs as the user (RLS scopes the rows). The
// locked Bill ID column is the update key. Editable columns: Academic Year,
// Billing Category, Bill Description, Due Date, Remarks.

import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import {
  STUDENT_BILL_BULK_EDIT_HEADERS,
  type BulkEditDownloadFilters
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 60;

function readFilters(sp: URLSearchParams): BulkEditDownloadFilters {
  return {
    institution_id: sp.get('institution_id') || undefined,
    item_category_id: sp.get('item_category_id') || undefined,
    status: sp.get('status') || undefined,
    academic_year_id: sp.get('academic_year_id') || undefined,
    due_date_from: sp.get('due_date_from') || undefined,
    due_date_to: sp.get('due_date_to') || undefined
  };
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filters = readFilters(request.nextUrl.searchParams);
    const bills = await StudentBillService.getBillsForBulkEdit(filters, supabase);

    // Dropdown sources.
    const { data: ayRows } = await supabase
      .from('academic_years')
      .select('academic_year_name')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });
    const academicYearNames = Array.from(
      new Set((ayRows ?? []).map((r: any) => r.academic_year_name).filter(Boolean))
    );

    const { data: catRows } = await supabase
      .from('billing_categories')
      .select('category_name')
      .eq('is_active', true)
      .order('category_name');
    const categoryNames = (catRows ?? [])
      .map((c: any) => c.category_name)
      .filter(Boolean);

    const workbook = new ExcelJS.Workbook();

    // -- Sheet 1: Bills --
    const sheet = workbook.addWorksheet('Bills');
    sheet.columns = [
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[0], key: 'bill_id', width: 38 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[1], key: 'roll_number', width: 18 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[2], key: 'student_name', width: 26 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[3], key: 'institution', width: 24 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[4], key: 'status', width: 14 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[5], key: 'final_amount', width: 14 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[6], key: 'academic_year', width: 18 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[7], key: 'category', width: 24 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[8], key: 'description', width: 32 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[9], key: 'due_date', width: 14 },
      { header: STUDENT_BILL_BULK_EDIT_HEADERS[10], key: 'remarks', width: 28 }
    ];
    sheet.getRow(1).font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getColumn('final_amount').numFmt = '#,##0.00';
    sheet.getColumn('due_date').numFmt = 'yyyy-mm-dd';

    bills.forEach((b) => {
      sheet.addRow({
        bill_id: b.bill_id,
        roll_number: b.roll_number,
        student_name: b.student_name,
        institution: b.institution_name,
        status: b.status,
        final_amount: b.final_amount,
        academic_year: b.academic_year_name ?? '',
        category: b.category_name,
        description: b.bill_description ?? '',
        due_date: b.due_date,
        remarks: b.remarks ?? ''
      });
    });

    const lastRow = bills.length + 1;

    // -- Hidden Lists sheet feeds the G/H dropdowns --
    const lists = workbook.addWorksheet('Lists');
    lists.columns = [
      { header: 'AcademicYear', key: 'ay', width: 20 },
      { header: 'Category', key: 'cat', width: 28 }
    ];
    academicYearNames.forEach((n, i) => { lists.getCell(`A${i + 2}`).value = n as string; });
    categoryNames.forEach((n, i) => { lists.getCell(`B${i + 2}`).value = n as string; });
    lists.state = 'hidden';

    // Lock A–F, unlock G–K, attach dropdowns / date validation.
    for (let row = 2; row <= lastRow; row++) {
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        sheet.getCell(`${col}${row}`).protection = { locked: true };
      });
      ['G', 'H', 'I', 'J', 'K'].forEach((col) => {
        sheet.getCell(`${col}${row}`).protection = { locked: false };
        sheet.getCell(`${col}${row}`).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' }
        };
      });
      sheet.getCell(`A${row}`).font = { name: 'Consolas', size: 9, color: { argb: 'FF6B7280' } };

      if (academicYearNames.length > 0) {
        sheet.getCell(`G${row}`).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`Lists!$A$2:$A$${academicYearNames.length + 1}`],
          showErrorMessage: true, errorStyle: 'warning',
          errorTitle: 'Invalid Academic Year',
          error: 'Pick an academic year from the dropdown, or leave blank to clear it.'
        };
      }
      if (categoryNames.length > 0) {
        sheet.getCell(`H${row}`).dataValidation = {
          type: 'list', allowBlank: false,
          formulae: [`Lists!$B$2:$B$${categoryNames.length + 1}`],
          showErrorMessage: true, errorStyle: 'warning',
          errorTitle: 'Invalid Billing Category',
          error: 'Pick a category from the dropdown.'
        };
      }
      sheet.getCell(`J${row}`).dataValidation = {
        type: 'date', operator: 'greaterThanOrEqual', allowBlank: false,
        formulae: [new Date(2000, 0, 1)],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Due Date',
        error: 'Due date must be a valid date (yyyy-mm-dd).'
      };
    }

    await sheet.protect('', {
      selectLockedCells: true, selectUnlockedCells: true,
      formatCells: false, insertRows: false, deleteRows: false, sort: false, autoFilter: true
    });

    // -- Instructions --
    const instr = workbook.addWorksheet('Instructions');
    instr.columns = [{ width: 95 }];
    const lines = [
      'BULK BILL EDIT — INSTRUCTIONS',
      '',
      `1. This file contains ${bills.length} existing bill${bills.length !== 1 ? 's' : ''} matching your filters, pre-filled with their CURRENT values.`,
      '2. EDIT ONLY the light-purple columns: Academic Year, Billing Category, Bill Description, Due Date, Remarks.',
      '3. Do NOT edit or delete the Bill ID column — it is the key used to match your edits back to each bill. Reordering rows is fine.',
      '4. Academic Year / Bill Description / Remarks: leave blank to CLEAR the field. Billing Category and Due Date are required.',
      '5. Academic Year must match an existing year for that bill\'s institution (pick from the dropdown).',
      '6. Money and status are NOT editable here — Final Amount and Status are shown for context only.',
      '7. Save as .xlsx and upload. You will see a preview of every change before anything is written.'
    ];
    lines.forEach((line, i) => {
      const r = instr.addRow([line]);
      r.font = i === 0
        ? { bold: true, size: 14, name: 'Arial', color: { argb: 'FF5B21B6' } }
        : { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().split('T')[0];
    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=student-bills-bulk-edit-${today}.xlsx`,
        'X-Bills-Count': String(bills.length)
      }
    });
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/template] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to generate template', message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

Run `mcp__ide__getDiagnostics` on the new route file. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/schedule/bills/bulk-edit/template/route.ts
git commit -m "feat(billing): bulk-edit filtered template export route"
```

---

## Task 5: Count route (GET)

**Files:**
- Create: `app/api/billing/schedule/bills/bulk-edit/count/route.ts`

- [ ] **Step 1: Write the file**

```ts
export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/count/route.ts
// GET — count of bills matching the bulk-edit filters (live preview). User-scoped.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import type { BulkEditDownloadFilters } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: BulkEditDownloadFilters = {
      institution_id: sp.get('institution_id') || undefined,
      item_category_id: sp.get('item_category_id') || undefined,
      status: sp.get('status') || undefined,
      academic_year_id: sp.get('academic_year_id') || undefined,
      due_date_from: sp.get('due_date_from') || undefined,
      due_date_to: sp.get('due_date_to') || undefined
    };

    const count = await StudentBillService.countBillsForBulkEdit(filters, supabase);
    return NextResponse.json({ count });
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/count] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to count bills', message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/schedule/bills/bulk-edit/count/route.ts
git commit -m "feat(billing): bulk-edit live count route"
```

---

## Task 6: Preview route (POST, dry-run)

**Files:**
- Create: `app/api/billing/schedule/bills/bulk-edit/preview/route.ts`

- [ ] **Step 1: Write the file**

```ts
export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/preview/route.ts
// POST — dry-run. Parse + validate + diff the uploaded file vs current DB
// values and return the change-set. NOTHING is written.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkEditBillsService } from '@/lib/services/billing/schedule/bulk-edit-bills-service';
import {
  EDITABLE_FIELD_LABELS,
  type BulkEditPreviewResult,
  type BulkEditRowPreview
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const { computed, errors } = await BulkEditBillsService.parseAndValidate(buffer, supabase);

    const changedComputed = computed.filter((r) => r.valid && r.changes.length > 0);
    const unchanged = computed.filter((r) => r.valid && r.changes.length === 0).length;

    const rows: BulkEditRowPreview[] = changedComputed.map((r) => ({
      row: r.row,
      bill_id: r.bill_id,
      roll_number: r.roll_number,
      student_name: r.student_name,
      status: r.status,
      changes: r.changes
    }));

    const fieldsAffected = Array.from(
      new Set(changedComputed.flatMap((r) => r.changes.map((c) => EDITABLE_FIELD_LABELS[c.field])))
    );

    const result: BulkEditPreviewResult = {
      totalRows: computed.length,
      changedRows: changedComputed.length,
      unchangedRows: unchanged,
      errorCount: errors.length,
      fieldsAffected,
      rows,
      errors
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/preview] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to preview changes', message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/schedule/bills/bulk-edit/preview/route.ts
git commit -m "feat(billing): bulk-edit dry-run preview route"
```

---

## Task 7: Apply route (POST, commit + audit)

**Files:**
- Create: `app/api/billing/schedule/bills/bulk-edit/apply/route.ts`

- [ ] **Step 1: Write the file**

```ts
export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/apply/route.ts
// POST — re-parse + re-validate the uploaded file, UPDATE changed bills (RLS as
// the user), and write ONE audit row (summary + per-bill before→after) to
// user_activity_logs. Partial success: valid rows commit even if others fail.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkEditBillsService } from '@/lib/services/billing/schedule/bulk-edit-bills-service';
import { logActivity } from '@/lib/utils/activity-logger';
import { ACTIVITY_TYPES, RESOURCE_TYPES } from '@/types/activity';
import {
  EDITABLE_FIELD_LABELS,
  type BulkEditApplyResult
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export const maxDuration = 120;

// Cap on how many per-bill diffs are persisted inline in the audit metadata.
// The full set is always returned in the HTTP response (client report).
const AUDIT_CHANGES_CAP = 1000;

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const changeSet = await BulkEditBillsService.parseAndValidate(buffer, supabase);
    const unchanged = changeSet.computed.filter((r) => r.valid && r.changes.length === 0).length;

    const { applied, failed } = await BulkEditBillsService.apply(changeSet, supabase);

    const fieldsAffected = Array.from(
      new Set(applied.flatMap((a) => a.changes.map((c) => EDITABLE_FIELD_LABELS[c.field])))
    );

    // -- Audit (one summary row; per-bill before→after in metadata, capped) --
    if (applied.length > 0) {
      const cappedChanges = applied.slice(0, AUDIT_CHANGES_CAP).map((a) => ({
        bill_id: a.bill_id,
        roll_number: a.roll_number,
        student_name: a.student_name,
        diffs: a.changes.map((c) => ({ field: c.label, old: c.old, new: c.new }))
      }));
      await logActivity({
        userId: user.id,
        actionType: ACTIVITY_TYPES.UPDATE,
        resourceType: RESOURCE_TYPES.BILL,
        description: `Bulk-edited ${applied.length} student bill${applied.length !== 1 ? 's' : ''}${fieldsAffected.length ? ` — fields: ${fieldsAffected.join(', ')}` : ''}`,
        request,
        metadata: {
          sub_type: 'student_bill_bulk_edit',
          fields_changed: fieldsAffected,
          total_rows: changeSet.computed.length,
          changed: applied.length,
          unchanged,
          failed: failed.length,
          file_name: file.name,
          changes: cappedChanges,
          changes_truncated: applied.length > AUDIT_CHANGES_CAP,
          changes_overflow: Math.max(0, applied.length - AUDIT_CHANGES_CAP)
        }
      });
    }

    const result: BulkEditApplyResult = {
      success: failed.length === 0 && changeSet.errors.length === 0,
      changedRows: applied.length,
      unchangedRows: unchanged,
      failedRows: failed.length,
      errorCount: changeSet.errors.length + failed.length,
      fieldsAffected,
      applied,
      errors: [...changeSet.errors, ...failed]
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('[billing/schedule/bills/bulk-edit/apply] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Failed to apply changes', message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors. If `ACTIVITY_TYPES.UPDATE` / `RESOURCE_TYPES.BILL` raise a type error, open `types/activity.ts` and use the exact exported member names (they are referenced by `BillingActivityTemplates` in `lib/utils/activity-logger-client.ts` — match those).

- [ ] **Step 3: Commit**

```bash
git add app/api/billing/schedule/bills/bulk-edit/apply/route.ts
git commit -m "feat(billing): bulk-edit apply route with audit logging"
```

---

## Task 8: React Query hook

**Files:**
- Create: `hooks/billing/use-bulk-edit-bills.ts`

- [ ] **Step 1: Write the file**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BulkEditPreviewResult,
  BulkEditApplyResult
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export interface BulkEditPayload {
  file: File;
}

/** Dry-run preview — POST .../bulk-edit/preview. No writes, no invalidation. */
export function useBulkEditPreview() {
  return useMutation<BulkEditPreviewResult, Error, BulkEditPayload>({
    mutationFn: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/billing/schedule/bills/bulk-edit/preview', {
        method: 'POST',
        body: fd
      });
      if (!res.ok) {
        let message = `Preview failed with status ${res.status}`;
        try {
          const body = await res.json();
          message = body.error || body.message || message;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      return (await res.json()) as BulkEditPreviewResult;
    }
  });
}

/** Commit — POST .../bulk-edit/apply. Invalidates bills/schedule/activities. */
export function useBulkEditApply() {
  const qc = useQueryClient();
  return useMutation<BulkEditApplyResult, Error, BulkEditPayload>({
    mutationFn: async ({ file }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/billing/schedule/bills/bulk-edit/apply', {
        method: 'POST',
        body: fd
      });
      if (!res.ok && res.status !== 200) {
        const text = await res.text();
        throw new Error(text || `Apply failed with status ${res.status}`);
      }
      return (await res.json()) as BulkEditApplyResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-bills'] });
      qc.invalidateQueries({ queryKey: ['billing-schedule'] });
      qc.invalidateQueries({ queryKey: ['billing-activities'] });
    }
  });
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/billing/use-bulk-edit-bills.ts
git commit -m "feat(billing): bulk-edit preview/apply hooks"
```

---

## Task 9: Filter panel component (download step)

**Files:**
- Create: `app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-filter-panel.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Filter, Download, Loader2, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import {
  BULK_EDIT_STATUS_OPTIONS,
  type BulkEditDownloadFilters
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';
import toast from 'react-hot-toast';

const ALL = '__ALL__';
const UNSPECIFIED = 'unspecified';
const DOWNLOAD_CAP = 5000;

interface Opt { id: string; name: string; }

export function BulkEditFilterPanel({
  onDownloaded
}: {
  onDownloaded: (count: number) => void;
}) {
  const [filters, setFilters] = useState<BulkEditDownloadFilters>({});
  const [institutions, setInstitutions] = useState<Opt[]>([]);
  const [academicYears, setAcademicYears] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Load institutions + categories once.
  useEffect(() => {
    OrganizationService.getInstitutionNames(true)
      .then((rows: any[]) => setInstitutions(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => {});
    BillingCategoryService.getActiveBillingCategories()
      .then((rows: any[]) => setCategories(rows.map((r) => ({ id: r.id, name: r.category_name }))))
      .catch(() => {});
  }, []);

  // Load academic years (optionally scoped to the chosen institution).
  useEffect(() => {
    const supabase = createClientSupabaseClient();
    let q = (supabase as any)
      .from('academic_years')
      .select('id, academic_year_name')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });
    if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
    q.then(({ data }: any) =>
      setAcademicYears((data ?? []).map((r: any) => ({ id: r.id, name: r.academic_year_name })))
    );
  }, [filters.institution_id]);

  const buildQuery = (): string => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v as string); });
    return qs.toString();
  };

  // Debounced live count.
  useEffect(() => {
    let cancelled = false;
    setCountLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/billing/schedule/bills/bulk-edit/count?${buildQuery()}`, {
          signal: AbortSignal.timeout(30000)
        });
        const data = await res.json();
        if (!cancelled) { setCount(data.count ?? 0); setCountLoading(false); }
      } catch {
        if (!cancelled) { setCount(null); setCountLoading(false); }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.institution_id, filters.item_category_id, filters.status, filters.academic_year_id, filters.due_date_from, filters.due_date_to]);

  const setF = (key: keyof BulkEditDownloadFilters, value: string | undefined) =>
    setFilters((f) => {
      const next = { ...f, [key]: value };
      if (key === 'institution_id') next.academic_year_id = undefined; // AY list is institution-scoped
      return next;
    });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/billing/schedule/bills/bulk-edit/template?${buildQuery()}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Download failed');
      }
      const billsCount = parseInt(res.headers.get('X-Bills-Count') || '0', 10);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student-bills-bulk-edit-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(billsCount > 0 ? `Downloaded ${billsCount} bill(s).` : 'No bills matched — file is empty.');
      onDownloaded(billsCount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const capped = (count ?? 0) > DOWNLOAD_CAP;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm flex items-center gap-2'>
          <Filter className='h-4 w-4 text-violet-600' /> Filter bills to edit
        </CardTitle>
        <CardDescription className='text-xs'>
          Pick the bills to download. Leave a filter blank to include everything.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
          <Picker label='Institution' value={filters.institution_id} options={institutions}
            placeholder='All institutions' onChange={(v) => setF('institution_id', v)} />
          <Picker label='Academic Year' value={filters.academic_year_id} options={academicYears}
            placeholder='All years' extra={[{ id: UNSPECIFIED, name: 'Unspecified (no year)' }]}
            onChange={(v) => setF('academic_year_id', v)} />
          <Picker label='Billing Category' value={filters.item_category_id} options={categories}
            placeholder='All categories' onChange={(v) => setF('item_category_id', v)} />
          <div>
            <Label className='text-xs'>Status</Label>
            <Select value={filters.status ?? ALL} onValueChange={(v) => setF('status', v === ALL ? undefined : v)}>
              <SelectTrigger className='mt-1'><SelectValue placeholder='All statuses' /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {BULK_EDIT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className='text-xs'>Due date from</Label>
            <Input className='mt-1' type='date' value={filters.due_date_from ?? ''}
              onChange={(e) => setF('due_date_from', e.target.value || undefined)} />
          </div>
          <div>
            <Label className='text-xs'>Due date to</Label>
            <Input className='mt-1' type='date' value={filters.due_date_to ?? ''}
              onChange={(e) => setF('due_date_to', e.target.value || undefined)} />
          </div>
        </div>

        {/* Live count */}
        <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
          capped ? 'border-amber-200 bg-amber-50 text-amber-900'
                 : 'border-violet-200 bg-violet-50 text-violet-900'}`}>
          <FileSpreadsheet className='h-3.5 w-3.5 mt-0.5' />
          <div className='flex-1'>
            {countLoading && count === null
              ? <span className='flex items-center gap-1'><Loader2 className='h-3 w-3 animate-spin' /> Counting…</span>
              : count === null
                ? 'Could not count bills.'
                : <p className='font-medium'>{count.toLocaleString('en-IN')} bill{count !== 1 ? 's' : ''} match this filter</p>}
            {capped && <p className='mt-0.5'>⚠ Export caps at {DOWNLOAD_CAP.toLocaleString('en-IN')} rows. Narrow the filter to include all bills.</p>}
          </div>
        </div>

        {count === 0 && (
          <Alert className='py-2'><AlertCircle className='h-4 w-4' />
            <AlertDescription className='text-xs'>No bills match — adjust the filters above.</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleDownload} disabled={downloading || count === 0} className='w-full'>
          {downloading
            ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Building file…</>
            : <><Download className='mr-2 h-4 w-4' /> Download bills to edit</>}
        </Button>
      </CardContent>
    </Card>
  );
}

function Picker({
  label, value, options, placeholder, onChange, extra = []
}: {
  label: string;
  value: string | undefined;
  options: Opt[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
  extra?: Opt[];
}) {
  return (
    <div>
      <Label className='text-xs'>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
        <SelectTrigger className='mt-1'><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {extra.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors. If `OrganizationService.getInstitutionNames` or `BillingCategoryService.getActiveBillingCategories` have different return shapes, adjust the `.map` accordingly (confirm against `bulk-receipt-dialog.tsx`, which uses both).

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-filter-panel.tsx"
git commit -m "feat(billing): bulk-edit download filter panel"
```

---

## Task 10: Preview diff table component

**Files:**
- Create: `app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-preview-table.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { BulkEditPreviewResult } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export function BulkEditPreviewTable({ result }: { result: BulkEditPreviewResult }) {
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base flex items-center gap-2'>
            <CheckCircle2 className='h-4 w-4 text-violet-600' /> Change Preview
          </CardTitle>
          <CardDescription className='text-xs'>
            Nothing has been written yet. Confirm below to apply these changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <Stat label='Rows parsed' value={result.totalRows} tone='neutral' />
            <Stat label='Will change' value={result.changedRows} tone='violet' />
            <Stat label='Unchanged' value={result.unchangedRows} tone='neutral' />
            <Stat label='Errors' value={result.errorCount} tone={result.errorCount > 0 ? 'destructive' : 'neutral'} />
          </div>
          {result.fieldsAffected.length > 0 && (
            <div className='mt-3 text-xs text-muted-foreground'>
              Fields affected: <strong className='text-foreground'>{result.fieldsAffected.join(', ')}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {result.errorCount > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>{result.errorCount} issue{result.errorCount !== 1 ? 's' : ''} found — those rows will be skipped.</p>
            <div className='max-h-40 overflow-y-auto mt-2 text-xs space-y-1'>
              {result.errors.map((e, i) => (
                <div key={i} className='border-l-2 border-destructive pl-2 py-0.5'>
                  <strong>{e.row > 0 ? `Row ${e.row}` : 'File'}</strong>{e.field ? ` — ${e.field}` : ''}: {e.message}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result.rows.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base'>Bills to update ({result.rows.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='max-h-80 overflow-y-auto rounded border'>
              <table className='w-full text-sm'>
                <thead className='text-xs text-muted-foreground sticky top-0 bg-background border-b'>
                  <tr>
                    <th className='text-left py-2 px-2'>Student</th>
                    <th className='text-left'>Field</th>
                    <th className='text-left'>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) =>
                    r.changes.map((c, ci) => (
                      <tr key={`${r.bill_id}-${c.field}`} className='border-t align-top'>
                        {ci === 0 && (
                          <td className='py-1.5 px-2' rowSpan={r.changes.length}>
                            <div className='font-medium'>{r.student_name}</div>
                            <div className='text-xs text-muted-foreground'>{r.roll_number}</div>
                          </td>
                        )}
                        <td className='text-xs py-1.5'>{c.label}</td>
                        <td className='text-xs py-1.5'>
                          <span className='inline-flex items-center gap-1.5'>
                            <Badge variant='outline' className='font-normal text-muted-foreground line-through'>{c.old ?? '(empty)'}</Badge>
                            <ArrowRight className='h-3 w-3 text-muted-foreground' />
                            <Badge variant='outline' className='font-normal border-violet-300 text-violet-800'>{c.new ?? '(empty)'}</Badge>
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'violet' | 'destructive' }) {
  const cls = tone === 'violet'
    ? 'border-violet-200 bg-violet-50 text-violet-900'
    : tone === 'destructive'
      ? 'border-destructive/30 bg-destructive/5 text-destructive'
      : 'border-border bg-muted/30 text-foreground';
  return (
    <div className={`rounded border px-3 py-2 ${cls}`}>
      <div className='text-[10px] uppercase tracking-wide opacity-70'>{label}</div>
      <div className='text-lg font-semibold'>{value.toLocaleString('en-IN')}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-preview-table.tsx"
git commit -m "feat(billing): bulk-edit diff preview table"
```

---

## Task 11: Result component + change-report download

**Files:**
- Create: `app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-result.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client';

import * as XLSX from 'xlsx';
import { CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { BulkEditApplyResult } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

export function BulkEditResult({
  result,
  onAnother,
  onClose
}: {
  result: BulkEditApplyResult;
  onAnother: () => void;
  onClose: () => void;
}) {
  // Build a flat change-report (one row per field change) from the FULL applied set.
  const downloadReport = () => {
    const aoa: (string | null)[][] = [['Bill ID', 'Roll Number', 'Student Name', 'Field', 'Old Value', 'New Value']];
    result.applied.forEach((a) =>
      a.changes.forEach((c) =>
        aoa.push([a.bill_id, a.roll_number, a.student_name, c.label, c.old, c.new])
      )
    );
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Changes');
    XLSX.writeFile(wb, `bulk-edit-change-report-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className='space-y-4'>
      {result.changedRows > 0 && (
        <Alert className='border-violet-200 bg-violet-50'>
          <CheckCircle2 className='h-4 w-4 text-violet-600' />
          <AlertDescription>
            <p className='font-medium text-violet-900'>
              Updated {result.changedRows} bill{result.changedRows !== 1 ? 's' : ''}
              {result.unchangedRows > 0 ? ` · ${result.unchangedRows} unchanged` : ''}.
            </p>
            {result.fieldsAffected.length > 0 && (
              <p className='text-xs text-violet-700 mt-1'>Fields: {result.fieldsAffected.join(', ')}</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {result.errorCount > 0 && (
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            <p className='font-medium'>{result.errorCount} row{result.errorCount !== 1 ? 's' : ''} skipped due to errors.</p>
            <div className='max-h-44 overflow-y-auto mt-2 text-xs space-y-1'>
              {result.errors.map((e, i) => (
                <div key={i} className='border-l-2 border-destructive pl-2'>
                  <strong>{e.row > 0 ? `Row ${e.row}` : 'File'}</strong>{e.field ? ` — ${e.field}` : ''}: {e.message}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {result.applied.length > 0 && (
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-base flex items-center justify-between'>
              Change report
              <Button size='sm' variant='outline' onClick={downloadReport}>
                <Download className='h-4 w-4 mr-1' /> Download .xlsx
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className='text-xs text-muted-foreground'>
            {result.applied.length} bill{result.applied.length !== 1 ? 's' : ''} changed. The downloadable report lists
            every field's before→after. The same change is recorded in{' '}
            <a className='underline' href='/billing/activities'>Billing Activities</a>.
          </CardContent>
        </Card>
      )}

      <div className='flex justify-end gap-2'>
        <Button variant='outline' onClick={onAnother}>Edit another batch</Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/schedule/bulk-edit/_components/bulk-edit-result.tsx"
git commit -m "feat(billing): bulk-edit result panel + change-report download"
```

---

## Task 12: The page (4-step state machine)

**Files:**
- Create: `app/(routes)/billing/schedule/bulk-edit/page.tsx`

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Upload, ChevronRight, Loader2, CheckCircle2, X, FileSpreadsheet, ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { PermissionGuard } from '@/components/auth/permission-guard';
import toast from 'react-hot-toast';
import { BulkEditFilterPanel } from './_components/bulk-edit-filter-panel';
import { BulkEditPreviewTable } from './_components/bulk-edit-preview-table';
import { BulkEditResult } from './_components/bulk-edit-result';
import { useBulkEditPreview, useBulkEditApply } from '@/hooks/billing/use-bulk-edit-bills';
import type { BulkEditPreviewResult, BulkEditApplyResult } from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';

type Step = 'download' | 'upload' | 'preview' | 'result';

export default function BulkEditBillsPage() {
  const [step, setStep] = useState<Step>('download');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<BulkEditPreviewResult | null>(null);
  const [result, setResult] = useState<BulkEditApplyResult | null>(null);

  const previewMutation = useBulkEditPreview();
  const applyMutation = useBulkEditApply();

  const reset = () => {
    setStep('download'); setFile(null); setProgress(0); setPreview(null); setResult(null);
  };

  const pickFile = (selected: File | null) => {
    if (!selected) return;
    if (!selected.name.endsWith('.xlsx') && !selected.name.endsWith('.xls')) {
      toast.error('Please select a .xlsx or .xls file');
      return;
    }
    setFile(selected);
  };

  const handleValidate = async () => {
    if (!file) return;
    setProgress(15);
    const ticker = setInterval(() => setProgress((p) => (p < 85 ? p + 5 : p)), 200);
    try {
      const res = await previewMutation.mutateAsync({ file });
      clearInterval(ticker); setProgress(100);
      setPreview(res); setStep('preview');
      if (res.changedRows === 0 && res.errorCount > 0) {
        toast.error(`No applicable changes — ${res.errorCount} error(s). Fix the file and re-upload.`);
      } else if (res.changedRows === 0) {
        toast('No changes detected — every row matches the current values.', { icon: 'ℹ️' });
      } else {
        toast.success(`${res.changedRows} bill(s) will change.`);
      }
    } catch (e) {
      clearInterval(ticker); setProgress(0);
      toast.error(e instanceof Error ? e.message : 'Validation failed');
    }
  };

  const handleConfirm = async () => {
    if (!file || applyMutation.isPending) return; // double-submit guard
    setProgress(20);
    try {
      const res = await applyMutation.mutateAsync({ file });
      setProgress(100); setResult(res); setStep('result');
      if (res.changedRows > 0) toast.success(`Updated ${res.changedRows} bill(s).`);
      else toast('No bills were changed.', { icon: 'ℹ️' });
    } catch (e) {
      setProgress(0);
      toast.error(e instanceof Error ? e.message : 'Apply failed');
    }
  };

  const canConfirm = !!preview && preview.changedRows > 0;

  return (
    <PermissionGuard module='billing.schedule' action='update'>
      <ContentLayout title='Bulk Edit Bills'>
        <div className='space-y-6'>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href='/'>Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href='/billing/schedule'>Schedule</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Bulk Edit</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-bold py-1'>Bulk Edit Bills</h1>
              <p className='text-sm text-muted-foreground'>
                Download existing bills, edit safe fields (Academic Year, Category, Description, Due Date, Remarks), and apply with a preview.
              </p>
            </div>
            <Button asChild variant='outline' size='sm'>
              <Link href='/billing/schedule'><ArrowLeft className='h-4 w-4 mr-1' /> Back to schedule</Link>
            </Button>
          </div>

          {/* Step indicator */}
          <div className='flex items-center gap-1 text-xs text-muted-foreground flex-wrap'>
            <Dot active={step === 'download'} done={step !== 'download'}>1. Filter & Download</Dot>
            <ChevronRight className='h-3 w-3' />
            <Dot active={step === 'upload'} done={step === 'preview' || step === 'result'}>2. Upload</Dot>
            <ChevronRight className='h-3 w-3' />
            <Dot active={step === 'preview'} done={step === 'result'}>3. Preview</Dot>
            <ChevronRight className='h-3 w-3' />
            <Dot active={step === 'result'} done={false}>4. Result</Dot>
          </div>

          <Card>
            <CardContent className='p-6'>
              {step === 'download' && (
                <div className='space-y-4'>
                  <BulkEditFilterPanel onDownloaded={() => setStep('upload')} />
                  <div className='flex justify-end'>
                    <Button variant='ghost' onClick={() => setStep('upload')}>
                      I already have a file — skip to upload <ChevronRight className='h-4 w-4 ml-1' />
                    </Button>
                  </div>
                </div>
              )}

              {step === 'upload' && (
                <div className='space-y-4'>
                  <div
                    className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragging ? 'border-violet-500 bg-violet-50' : 'border-muted-foreground/25'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files[0] ?? null); }}
                  >
                    <Upload className='mx-auto h-10 w-10 text-muted-foreground' />
                    <p className='mt-3 text-sm'>
                      {file
                        ? <span className='font-medium text-violet-700'>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                        : <>Drag & drop your edited file here, or click to browse</>}
                    </p>
                    <Input type='file' accept='.xlsx,.xls' className='absolute inset-0 cursor-pointer opacity-0'
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                  </div>

                  {file && (
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <FileSpreadsheet className='h-4 w-4 text-violet-600' />
                      Ready to validate.
                      <Button variant='ghost' size='sm' className='h-6' onClick={() => setFile(null)}>
                        <X className='h-3 w-3' />
                      </Button>
                    </div>
                  )}

                  {previewMutation.isPending && (
                    <div className='space-y-2'>
                      <Progress value={progress} />
                      <p className='text-xs text-center text-muted-foreground'>Validating & diffing…</p>
                    </div>
                  )}

                  <div className='flex justify-between'>
                    <Button variant='outline' onClick={() => setStep('download')}>Back</Button>
                    <Button onClick={handleValidate} disabled={!file || previewMutation.isPending}>
                      {previewMutation.isPending
                        ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Validating…</>
                        : <><CheckCircle2 className='mr-2 h-4 w-4' /> Validate & Preview</>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 'preview' && preview && (
                <div className='space-y-4'>
                  <BulkEditPreviewTable result={preview} />
                  <div className='flex justify-between'>
                    <Button variant='outline' onClick={() => setStep('upload')} disabled={applyMutation.isPending}>
                      Back to upload
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canConfirm || applyMutation.isPending}
                      className='bg-violet-600 hover:bg-violet-700'>
                      {applyMutation.isPending
                        ? <><Loader2 className='mr-2 h-4 w-4 animate-spin' /> Applying {preview.changedRows}…</>
                        : <>Confirm & Update {preview.changedRows} bill{preview.changedRows !== 1 ? 's' : ''}</>}
                    </Button>
                  </div>
                </div>
              )}

              {step === 'result' && result && (
                <BulkEditResult result={result} onAnother={reset} onClose={reset} />
              )}
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

function Dot({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-1 rounded ${active ? 'bg-violet-100 text-violet-800 font-medium' : done ? 'text-violet-700' : 'text-muted-foreground'}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Verify** — `mcp__ide__getDiagnostics` on the file. Expected: no errors. Confirm `ContentLayout` and `PermissionGuard` import paths match `app/(routes)/billing/schedule/page.tsx` (they do: `@/components/layout/content-layout`, `@/components/auth/permission-guard`).

- [ ] **Step 3: Commit**

```bash
git add "app/(routes)/billing/schedule/bulk-edit/page.tsx"
git commit -m "feat(billing): bulk-edit bills page (4-step flow)"
```

---

## Task 13: Entry point + route registration

**Files:**
- Modify: `app/(routes)/billing/schedule/page.tsx`
- Modify: `lib/sidebarMenuLink.ts`

- [ ] **Step 1: Add the route→permission mapping**

In `lib/sidebarMenuLink.ts`, find the line `'/billing/schedule/bulk-create': 'billing.schedule.create',` and add immediately after it:

```ts
  '/billing/schedule/bulk-edit': 'billing.schedule.update',
```

- [ ] **Step 2: Add the Bulk Edit button to the schedule page header**

In `app/(routes)/billing/schedule/page.tsx`:

(a) Add `Pencil` to the lucide import and `Link` from next:

```tsx
import Link from 'next/link';
import { Settings2, Filter, Receipt, Pencil } from 'lucide-react';
```

(b) Pull `can` from the permissions hook (it already calls `usePermissions()`):

```tsx
  const { isSuperAdmin, can } = usePermissions();
```

(c) In the header actions `<div className='flex items-center gap-2'>` (just before the Advanced/Basic Filters toggle button), add:

```tsx
              {can('billing.schedule.update') && (
                <Button asChild variant='outline' size='sm' className='flex items-center gap-2'>
                  <Link href='/billing/schedule/bulk-edit'>
                    <Pencil className='h-4 w-4' />
                    Bulk Edit
                  </Link>
                </Button>
              )}
```

- [ ] **Step 3: Verify diagnostics**

Run `mcp__ide__getDiagnostics` on both modified files. Expected: no new errors. If `usePermissions()` does not expose `can`, use the same gating helper the file already imports (check the hook's surface — `usePermissions` in this repo exposes `can(key)` and `isSuperAdmin`).

- [ ] **Step 4: Run the nav gates**

```bash
npm run check:sidebar
npm run check:reachability
```

Expected: both pass (no new unreachable routes; `/billing/schedule/bulk-edit` resolves to `billing.schedule.update`).

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/billing/schedule/page.tsx" lib/sidebarMenuLink.ts
git commit -m "feat(billing): bulk-edit entry button + route registration"
```

---

## Task 14: End-to-end verification (browser)

**No code.** Confirm the feature works against the success criteria. Use a non-super-admin account holding `billing.schedule.view` + `billing.schedule.update` for at least one pass (RLS scope check).

- [ ] **Step 1: Reach the page** — from `/billing/schedule`, click **Bulk Edit**. The page loads (not redirected to `/unauthorized`).

- [ ] **Step 2: Filter & download** — set Academic Year = "Unspecified (no year)" + an Institution. Confirm the live count matches, click **Download bills to edit**, and open the file. Verify: Bill ID/Roll/Name/Institution/Status/Final Amount are filled and locked; Academic Year is blank; Category/Description/Due Date/Remarks show current values; G & H have dropdowns.

- [ ] **Step 3: Edit & upload** — set Academic Year on a few rows, change one Due Date, blank out one Remarks. Save. Upload on Step 2, click **Validate & Preview**.

- [ ] **Step 4: Preview** — confirm the diff table shows exactly the rows/fields you changed (old → new), unchanged rows are excluded, the "Will change / Unchanged / Errors" counts are right, and a deliberately bad Academic Year produces a row error.

- [ ] **Step 5: Confirm** — click **Confirm & Update**. Verify the result panel shows the changed count, download the change-report .xlsx and check its rows.

- [ ] **Step 6: Data check** — back on `/billing/schedule`, filter Academic Year = the year you set; the edited bills now appear. Open one bill's edit page to confirm the new values persisted.

- [ ] **Step 7: Audit check** — open `/billing/activities`. Confirm a "Bulk-edited N student bills — fields: …" entry exists, attributed to **you**, with the per-bill before→after visible in its metadata/detail.

- [ ] **Step 8: Negative check** — with an account that lacks `billing.schedule.update`, confirm the Bulk Edit button is hidden and visiting `/billing/schedule/bulk-edit` directly is blocked by the `PermissionGuard`.

- [ ] **Step 9: Final commit (if any tweaks were needed during verification)**

```bash
git add -A
git commit -m "fix(billing): bulk-edit verification tweaks"
```

---

## Self-Review

**Spec coverage:**
- Filtered export pre-filled with current values → Tasks 2, 4, 9. ✓
- Match by Bill ID → Tasks 1 (locked col), 3 (UUID + lookup). ✓
- Editable scope (AY, Category, Description, Due Date, Remarks; no money/status) → Task 3 diff logic. ✓
- Validation (UUID, exists/RLS, AY per institution, active category, due date) → Task 3. ✓
- Preview diff (old→new, unchanged skipped) → Tasks 3, 6, 10. ✓
- Apply RLS-as-user, partial success → Tasks 3, 7. ✓
- Audit summary + per-bill before→after (cap 1000 persisted, full in response/report) → Tasks 7, 11. ✓
- Dedicated page + 4 steps → Task 12. ✓
- Permission reuse (`billing.schedule.update`, no migration) + route registration → Tasks 12, 13. ✓
- 5,000-row cap + live count → Tasks 2, 4, 9. ✓
- No proxy.ts change (authenticated routes) → confirmed; not needed. ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. Two guarded fallbacks (Task 7 `ACTIVITY_TYPES`/`RESOURCE_TYPES` names; Task 13 `usePermissions().can`) name the exact file to check and the existing usage to match — these are verification instructions, not placeholders.

**Type consistency:** `BulkEditDownloadFilters`, `BillForBulkEdit`, `BillFieldChange`, `BulkEditRowPreview`, `BulkEditPreviewResult`, `BulkEditAppliedRow`, `BulkEditApplyResult`, and `EDITABLE_FIELD_LABELS` are defined once in Task 1 and consumed consistently in Tasks 2/3/6/7/8/10/11/12. `BulkEditBillsService.parseAndValidate` / `.apply` signatures defined in Task 3 are called identically in Tasks 6 and 7. Hook names `useBulkEditPreview`/`useBulkEditApply` defined in Task 8, used in Task 12.

**Deliberate v1 scope:** download filters omit the 6-level hierarchy cascade (Institution/AY/Category/Status/Due-date only) — keeps the service query a left-join (no `!inner` row-drop) and avoids a 250-line duplicate; documented as a follow-up.
