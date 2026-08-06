export const dynamic = 'force-dynamic';

// app/api/billing/receipts/bulk-import/route.ts
//
// Requires super admin, or a role holding billing.receipts.bulk_create — in
// which case every bill is re-checked against that user's accessible
// institutions before it is receipted (the Bill ID column is user-editable,
// so the template is not a trustworthy scope statement).
// Accepts the filled bulk-receipts template, validates
// per-row (including per-row payment metadata), groups by
// (student + paid_date + payment_mode), and creates one billing_receipt
// per group with N billing_receipt_items.
//
// Two modes (controlled by `?dry_run=true|false` query param):
//   - dry_run=true  → Preview: parse + validate + group, return BulkReceiptPreviewResult,
//                     DO NOT write to the database. Used by the dialog's Preview step.
//   - dry_run=false → Commit: full pipeline, return BulkReceiptImportResult.
//
// Partial-success contract — valid groups commit even if other groups fail.
// Per-row errors are returned in the response so the dialog can render an
// actionable error report.

import { NextRequest, NextResponse, connection } from 'next/server';
import * as XLSX from 'xlsx';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveBulkReceiptAccess } from '@/lib/auth/bulk-receipt-access';
import {
  groupRowsByStudentAndPayment,
  createReceiptForStudentGroup,
  type BulkReceiptBatchDefaults
} from '@/lib/services/billing/receipts/bulk-receipt-service';
import type {
  BulkReceiptRow,
  BulkReceiptImportError,
  BulkReceiptImportResult,
  BulkReceiptPreviewResult,
  BulkReceiptPreviewGroup,
  BulkReceiptCreated,
  BulkReceiptPaymentMode
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';
import { BULK_RECEIPT_PAYMENT_MODES } from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

export const maxDuration = 60;

// ----------------------------------------------------------------------
// Helpers
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
  const cleaned = String(value).replace(/[, ₹]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Best-effort date parsing — handles three formats the user might leave in
 * the cell: an Excel-typed Date (cellDates:true), a 'YYYY-MM-DD' string,
 * or a 'DD/MM/YYYY' / 'DD-MM-YYYY' string (common in Indian English locales).
 * Returns null if it can't make sense of the input.
 */
function cellToISODate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : s;
  }
  // DD/MM/YYYY or DD-MM-YYYY → reorder
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : iso;
  }
  return null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_PAYMENT_MODES = new Set<string>(BULK_RECEIPT_PAYMENT_MODES);

// ----------------------------------------------------------------------
// Route
// ----------------------------------------------------------------------

export async function POST(request: NextRequest) {
  await connection();

  // -- Auth --------------------------------------------------------------
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const access = await resolveBulkReceiptAccess(user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }
  // Set membership, not array scan — the validation loop below runs once per
  // row and a batch can carry 5000 of them.
  const allowedInstitutionIds = new Set(access.institutionIds);

  const isDryRun = request.nextUrl.searchParams.get('dry_run') === 'true';

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // -- Read workbook --------------------------------------------------
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    // Pick the data sheet BY NAME (lesson from the bulk-upload memory).
    const sheetName =
      workbook.SheetNames.find((n) => n === 'Bills') ?? workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return NextResponse.json(
        { error: 'No "Bills" sheet found in the uploaded file' },
        { status: 400 }
      );
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false
    });

    if (rows.length < 2) {
      return NextResponse.json(
        { error: 'File is empty or contains only a header row' },
        { status: 400 }
      );
    }

    // Header row check — fail loud rather than silently misinterpret a
    // template that was re-saved with reordered or renamed columns.
    const headerCells = (rows[0] as unknown[]).map(cellToString);
    const expectedHeaders = [
      'Roll Number',
      'Student Name',
      'Bill ID',
      'Bill Description',
      'Category',
      'Balance Amount',
      'Paid Amount',
      'Payment Mode',
      'Paid Date',
      'Payer Name',
      'Payer Contact',
      'Payment Reference',
      'Remarks'
    ];
    const headerMismatch = expectedHeaders.some(
      (h, i) => headerCells[i] !== h
    );
    if (headerMismatch) {
      return NextResponse.json(
        {
          error:
            'Header row does not match the template. Re-download the template and try again.',
          got: headerCells
        },
        { status: 400 }
      );
    }

    const dataRows = rows.slice(1);
    const errors: BulkReceiptImportError[] = [];
    const cleanedRows: Array<{ rowNumber: number; cleaned: BulkReceiptRow }> = [];

    // -- Per-row parse + shape validation -------------------------------
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2; // 1-indexed Excel row + header
      const cells = dataRows[i] || [];

      const isBlank = cells.every(
        (c) => c === null || c === undefined || String(c).trim() === ''
      );
      if (isBlank) continue;

      const rollNumber = cellToString(cells[0]);
      const studentName = cellToString(cells[1]);
      const billId = cellToString(cells[2]);
      const billDescription = cellToString(cells[3]) || null;
      const category = cellToString(cells[4]) || null;
      const balanceAmount = cellToNumber(cells[5]);
      const paidAmount = cellToNumber(cells[6]);
      const paymentModeRaw = cellToString(cells[7]).toLowerCase();
      const paidDateRaw = cells[8];
      const payerName = cellToString(cells[9]);
      const payerContactRaw = cellToString(cells[10]);
      const paymentReferenceRaw = cellToString(cells[11]);
      const remarksRaw = cellToString(cells[12]);

      // Skip rows the admin chose not to fill — paid amount blank means
      // "ignore this bill" per the instructions. Per-row payment columns
      // are evaluated only for rows the admin DID fill.
      if (paidAmount === null || paidAmount === 0) continue;

      // Field-by-field validation. We accumulate errors per row but still
      // try to extract the safe values so the preview can show as much
      // context as possible alongside the error message.
      const rowErrors: BulkReceiptImportError[] = [];

      if (!UUID_RE.test(billId)) {
        rowErrors.push({
          row: rowNumber,
          field: 'Bill ID',
          message:
            'Bill ID is missing or malformed. Do not edit or delete this column.'
        });
      }
      if (!rollNumber) {
        rowErrors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: 'Roll Number is missing.'
        });
      }
      if (paidAmount < 0) {
        rowErrors.push({
          row: rowNumber,
          field: 'Paid Amount',
          message: 'Paid amount cannot be negative.'
        });
      }
      if (balanceAmount !== null && paidAmount > balanceAmount + 0.01) {
        rowErrors.push({
          row: rowNumber,
          field: 'Paid Amount',
          message: `Paid amount (${paidAmount}) exceeds Balance Amount (${balanceAmount}). Refunds and adjustments must use the dedicated flows.`
        });
      }

      // Payment Mode — must be one of the enum values
      if (!paymentModeRaw) {
        rowErrors.push({
          row: rowNumber,
          field: 'Payment Mode',
          message:
            'Payment Mode is required. Pick one of: cash, online, bank_transfer, dd, cheque, combined.'
        });
      } else if (!ALLOWED_PAYMENT_MODES.has(paymentModeRaw)) {
        rowErrors.push({
          row: rowNumber,
          field: 'Payment Mode',
          message: `Payment Mode "${paymentModeRaw}" is not valid. Use one of: cash, online, bank_transfer, dd, cheque, combined.`
        });
      }

      // Paid Date — must be a valid ISO date
      const paidDateISO = cellToISODate(paidDateRaw);
      if (!paidDateISO) {
        rowErrors.push({
          row: rowNumber,
          field: 'Paid Date',
          message:
            'Paid Date is required and must be a valid date (e.g. 2026-05-15).'
        });
      } else {
        // Reject future dates beyond today (≤ 1 day grace for timezone)
        const today = new Date();
        const max = new Date(today.getTime() + 36 * 60 * 60 * 1000);
        const parsed = new Date(paidDateISO);
        if (parsed.getTime() > max.getTime()) {
          rowErrors.push({
            row: rowNumber,
            field: 'Paid Date',
            message: `Paid Date "${paidDateISO}" is in the future. Receipts cannot be back-dated forward.`
          });
        }
      }

      // Payer Name — required (we already pre-fill with student name)
      if (!payerName) {
        rowErrors.push({
          row: rowNumber,
          field: 'Payer Name',
          message:
            'Payer Name is required. Defaults to the student\'s name; do not blank it out.'
        });
      } else if (payerName.length > 200) {
        rowErrors.push({
          row: rowNumber,
          field: 'Payer Name',
          message: 'Payer Name is too long (max 200 characters).'
        });
      }

      // Payer Contact — optional but if present, sanity-check length
      if (payerContactRaw && payerContactRaw.length > 100) {
        rowErrors.push({
          row: rowNumber,
          field: 'Payer Contact',
          message: 'Payer Contact is too long (max 100 characters).'
        });
      }

      // Payment Reference — optional but length-bounded
      if (paymentReferenceRaw && paymentReferenceRaw.length > 100) {
        rowErrors.push({
          row: rowNumber,
          field: 'Payment Reference',
          message: 'Payment Reference is too long (max 100 characters).'
        });
      }

      if (remarksRaw && remarksRaw.length > 500) {
        rowErrors.push({
          row: rowNumber,
          field: 'Remarks',
          message: 'Remarks too long (max 500 characters).'
        });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      cleanedRows.push({
        rowNumber,
        cleaned: {
          roll_number: rollNumber,
          student_name: studentName,
          bill_id: billId,
          bill_description: billDescription,
          category,
          balance_amount: balanceAmount ?? 0,
          paid_amount: paidAmount,
          payment_mode: paymentModeRaw as BulkReceiptPaymentMode,
          payment_paid_date: paidDateISO!, // guaranteed non-null by above check
          payer_name: payerName,
          payer_contact: payerContactRaw || null,
          payment_reference_number: paymentReferenceRaw || null,
          payment_remarks: remarksRaw || null
        }
      });
    }

    if (cleanedRows.length === 0) {
      // Either no bills filled or every filled row failed shape validation.
      if (isDryRun) {
        return NextResponse.json<BulkReceiptPreviewResult>({
          totalRows: 0,
          validRows: 0,
          errorCount: errors.length,
          groups: [],
          totalCollected: 0,
          totalStudents: 0,
          totalReceipts: 0,
          errors
        });
      }
      return NextResponse.json<BulkReceiptImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: 0,
        totalStudents: 0,
        receipts: [],
        errors
      });
    }

    // -- Resolve bills against the database in batch --------------------
    // Split the original embedded-join query into TWO flat queries that
    // can run in parallel. PostgREST's resource embedding
    // (`learners_profiles:student_id(roll_number)`) serializes a nested
    // object per row — for a 5000-row template that's 5000 extra JSON
    // sub-objects on the wire. Two flat queries usually win by 3-5x
    // because each one hits a simple PK index lookup with minimal
    // serialization.
    const timings: Record<string, number> = {};
    const tStart = Date.now();
    const supabase = createServiceRoleClient();
    const billIds = Array.from(
      new Set(cleanedRows.map((r) => r.cleaned.bill_id))
    );

    // Query 1: bills only (no join)
    const billsPromise = (supabase as any)
      .from('billing_student_bills')
      .select(
        'id, student_id, institution_id, balance_amount, final_amount, status'
      )
      .in('id', billIds);

    // We can't run the learners query in parallel until we know the
    // student_ids, BUT we can pre-fetch by the unique student_ids implied
    // by the row data optimistically — except that the row carries only
    // roll_number, not student_id. So we wait for bills to return.
    const { data: dbBills, error: billsError } = await billsPromise;
    timings.bills_query = Date.now() - tStart;

    if (billsError) {
      console.error('[receipts/bulk-import] Bills lookup failed:', billsError);
      return NextResponse.json(
        { error: 'Failed to look up bills', message: billsError.message },
        { status: 500 }
      );
    }

    // Query 2: learners_profiles for the resolved student_ids.
    // Skip entirely if no bills came back — saves a roundtrip.
    const tLearners = Date.now();
    const distinctStudentIds = Array.from(
      new Set((dbBills ?? []).map((b: any) => b.student_id).filter(Boolean))
    );

    let learnerByStudentId: Map<string, { roll_number: string }> = new Map();
    if (distinctStudentIds.length > 0) {
      const { data: learners, error: learnersError } = await (supabase as any)
        .from('learners_profiles')
        .select('id, roll_number')
        .in('id', distinctStudentIds);
      if (learnersError) {
        console.error(
          '[receipts/bulk-import] Learners lookup failed:',
          learnersError
        );
        // Non-fatal — we just lose the roll_number cross-check. Receipts
        // still go to the correct student because student_id is read
        // from the bill itself, not the Excel row.
      } else {
        (learners ?? []).forEach((l: any) => {
          if (l?.id) learnerByStudentId.set(l.id, { roll_number: l.roll_number });
        });
      }
    }
    timings.learners_query = Date.now() - tLearners;

    const billById = new Map<string, any>();
    (dbBills ?? []).forEach((b: any) => billById.set(b.id, b));

    // Validate per row against DB state.
    const tValidate = Date.now();
    const validatedRows: typeof cleanedRows = [];
    for (const entry of cleanedRows) {
      const { rowNumber, cleaned } = entry;
      const bill = billById.get(cleaned.bill_id);

      if (!bill) {
        errors.push({
          row: rowNumber,
          field: 'Bill ID',
          message:
            'Bill not found. It may have been deleted since the template was generated.'
        });
        continue;
      }

      // Tenant boundary. The bills query above runs on the service-role client
      // and selects purely by the Bill IDs found in the uploaded file, so a
      // hand-edited (or pasted) Bill ID would otherwise reach any institution's
      // bill. Checked FIRST, before the roll-number and balance validations, so
      // an out-of-scope row cannot echo another institution's learner details
      // back through an error message.
      if (
        !access.isSuperAdmin &&
        !allowedInstitutionIds.has(bill.institution_id)
      ) {
        errors.push({
          row: rowNumber,
          field: 'Bill ID',
          message:
            'This bill belongs to an institution you do not have access to. Re-download the template instead of editing Bill IDs.'
        });
        continue;
      }

      const dbRoll =
        learnerByStudentId.get(bill.student_id)?.roll_number ?? null;
      if (dbRoll && cleaned.roll_number && dbRoll !== cleaned.roll_number) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: `Roll Number "${cleaned.roll_number}" does not match the bill's student (DB shows "${dbRoll}"). Do not paste rows between templates.`
        });
        continue;
      }

      if (bill.status === 'paid') {
        errors.push({
          row: rowNumber,
          field: 'Bill ID',
          message: 'Bill is already fully paid — receipt skipped.'
        });
        continue;
      }
      if (bill.status === 'cancelled') {
        errors.push({
          row: rowNumber,
          field: 'Bill ID',
          message: 'Bill is cancelled — cannot generate receipt.'
        });
        continue;
      }
      if (bill.status === 'refunded') {
        errors.push({
          row: rowNumber,
          field: 'Bill ID',
          message: 'Bill has already been refunded — cannot generate receipt.'
        });
        continue;
      }

      const dbBalance =
        bill.balance_amount !== null && Number(bill.balance_amount) > 0
          ? Number(bill.balance_amount)
          : Number(bill.final_amount);
      if (cleaned.paid_amount > dbBalance + 0.01) {
        errors.push({
          row: rowNumber,
          field: 'Paid Amount',
          message: `Paid amount (${cleaned.paid_amount}) exceeds current Balance (${dbBalance}). Bill state may have changed since download — re-download the template.`
        });
        continue;
      }

      cleaned._resolved_student_id = bill.student_id;
      cleaned._resolved_institution_id = bill.institution_id;
      validatedRows.push(entry);
    }

    timings.validation_loop = Date.now() - tValidate;

    // -- Group by (student, paid_date, payment_mode) --------------------
    const tGroup = Date.now();
    const groups = groupRowsByStudentAndPayment(validatedRows, errors);
    timings.grouping = Date.now() - tGroup;

    // -- DRY RUN: return preview, do NOT commit -------------------------
    if (isDryRun) {
      const previewGroups: BulkReceiptPreviewGroup[] = groups.map((g) => ({
        group_key: `${g.student_id}::${g.payment_paid_date}::${g.payment_mode}`,
        student_id: g.student_id,
        roll_number: g.roll_number,
        student_name: g.student_name,
        bill_count: g.rows.length,
        total_amount: g.rows.reduce((s, r) => s + r.paid_amount, 0),
        payment_mode: g.payment_mode,
        payment_paid_date: g.payment_paid_date,
        payer_name: g.payer_name,
        payer_contact: g.payer_contact,
        payment_reference_number: g.payment_reference_number,
        payment_remarks: g.payment_remarks,
        row_numbers: g.row_numbers
      }));
      const distinctStudents = new Set(previewGroups.map((g) => g.student_id))
        .size;
      const totalCollected = previewGroups.reduce(
        (s, g) => s + g.total_amount,
        0
      );

      const previewResponse = NextResponse.json<BulkReceiptPreviewResult>({
        totalRows: cleanedRows.length,
        validRows: validatedRows.length,
        errorCount: errors.length,
        groups: previewGroups,
        totalCollected,
        totalStudents: distinctStudents,
        totalReceipts: previewGroups.length,
        errors
      });
      // Stage-by-stage timing so future "validation feels slow" reports
      // can be diagnosed by looking at this header in DevTools Network tab.
      previewResponse.headers.set(
        'X-Validation-Timings',
        Object.entries(timings)
          .map(([k, v]) => `${k}=${v}ms`)
          .join('; ')
      );
      return previewResponse;
    }

    // -- COMMIT path: create receipts -----------------------------------
    if (validatedRows.length === 0) {
      return NextResponse.json<BulkReceiptImportResult>({
        success: false,
        successCount: 0,
        errorCount: errors.length,
        totalRows: cleanedRows.length,
        totalStudents: 0,
        receipts: [],
        errors
      });
    }

    const defaults: BulkReceiptBatchDefaults = { accountant_id: user.id };
    const created: BulkReceiptCreated[] = [];

    for (const group of groups) {
      const result = await createReceiptForStudentGroup(
        group,
        defaults,
        supabase as any
      );
      if (result.ok) {
        created.push(result.receipt);
      } else {
        errors.push({
          row: 0,
          message: `Failed to create receipt for student ${group.student_name} (${group.roll_number}) on ${group.payment_paid_date}/${group.payment_mode}: ${result.message}`
        });
      }
    }

    const distinctStudents = new Set(groups.map((g) => g.student_id)).size;

    return NextResponse.json<BulkReceiptImportResult>({
      success: errors.length === 0,
      successCount: created.length,
      errorCount: errors.length,
      totalRows: cleanedRows.length,
      totalStudents: distinctStudents,
      receipts: created,
      errors
    });
  } catch (error) {
    console.error('[billing/receipts/bulk-import] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to process import', message },
      { status: 500 }
    );
  }
}
