export const dynamic = 'force-dynamic';

// app/api/billing/receipts/bulk-import/route.ts
//
// Super-admin only. Accepts the filled bulk-receipts template, validates
// per-row, groups by student, and creates one billing_receipt per student
// with N billing_receipt_items.
//
// Partial-success contract — valid student groups commit even if other
// students/rows fail. Per-row errors are returned in the response so the
// dialog can render an actionable error report.

import { NextRequest, NextResponse, connection } from 'next/server';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  groupRowsByStudent,
  createReceiptForStudentGroup,
  type BulkReceiptBatchMetadata
} from '@/lib/services/billing/receipts/bulk-receipt-service';
import type {
  BulkReceiptRow,
  BulkReceiptImportError,
  BulkReceiptImportResult,
  BulkReceiptCreated
} from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

export const maxDuration = 60;

// ----------------------------------------------------------------------
// Helpers (mirror the bills import — kept local so route is self-contained)
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const metaSchema = z.object({
  payment_mode: z.enum(['cash', 'online', 'bank_transfer', 'dd', 'cheque']),
  payment_paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payer_mode: z.enum(['student', 'fixed']).default('student'),
  payer_name_fixed: z.string().optional(),
  payer_contact: z.string().optional(),
  payment_reference_number: z.string().optional(),
  payment_remarks: z.string().optional(),
  accountant_id: z.string().uuid().optional()
});

async function assertSuperAdmin(userId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return (
    profile?.is_super_admin === true || profile?.role === 'super_admin'
  );
}

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
  if (!(await assertSuperAdmin(user.id))) {
    return NextResponse.json(
      { error: 'Forbidden — super-admin only' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // -- Parse metadata -------------------------------------------------
    const metaRaw = {
      payment_mode: formData.get('payment_mode')?.toString() ?? '',
      payment_paid_date: formData.get('payment_paid_date')?.toString() ?? '',
      payer_mode: formData.get('payer_mode')?.toString() || 'student',
      payer_name_fixed:
        formData.get('payer_name_fixed')?.toString() || undefined,
      payer_contact: formData.get('payer_contact')?.toString() || undefined,
      payment_reference_number:
        formData.get('payment_reference_number')?.toString() || undefined,
      payment_remarks:
        formData.get('payment_remarks')?.toString() || undefined,
      accountant_id: formData.get('accountant_id')?.toString() || undefined
    };
    const metaParsed = metaSchema.safeParse(metaRaw);
    if (!metaParsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid batch metadata',
          issues: metaParsed.error.issues
        },
        { status: 400 }
      );
    }
    const meta: BulkReceiptBatchMetadata = metaParsed.data;

    // -- Read workbook --------------------------------------------------
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    // Pick the data sheet BY NAME (lesson from the bulk-upload memory).
    // The template ships "Bills" + "Instructions"; SheetNames[0] is
    // ordinarily "Bills", but if the admin reordered sheets we'd parse
    // instructions as data otherwise.
    const sheetName = workbook.SheetNames.find((n) => n === 'Bills')
      ?? workbook.SheetNames[0];
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

    // Quick sanity check: header row matches what we expect. If a column
    // got reordered/renamed, fail loud rather than silently misinterpret.
    const headerCells = (rows[0] as unknown[]).map(cellToString);
    const expectedHeaders = [
      'Roll Number',
      'Student Name',
      'Bill ID',
      'Bill Description',
      'Category',
      'Balance Amount',
      'Paid Amount'
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

      // Skip rows the admin chose not to fill — paid amount blank means
      // "ignore this bill" per the instructions.
      if (paidAmount === null || paidAmount === 0) continue;

      if (!UUID_RE.test(billId)) {
        errors.push({
          row: rowNumber,
          field: 'Bill ID',
          message:
            'Bill ID is missing or malformed. Do not edit or delete this column.'
        });
        continue;
      }
      if (!rollNumber) {
        errors.push({
          row: rowNumber,
          field: 'Roll Number',
          message: 'Roll Number is missing.'
        });
        continue;
      }
      if (paidAmount < 0) {
        errors.push({
          row: rowNumber,
          field: 'Paid Amount',
          message: 'Paid amount cannot be negative.'
        });
        continue;
      }
      if (balanceAmount !== null && paidAmount > balanceAmount + 0.01) {
        // 0.01 tolerance for floating-point noise
        errors.push({
          row: rowNumber,
          field: 'Paid Amount',
          message: `Paid amount (${paidAmount}) exceeds Balance Amount (${balanceAmount}). Refunds and adjustments must use the dedicated flows.`
        });
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
          paid_amount: paidAmount
        }
      });
    }

    if (cleanedRows.length === 0) {
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
    const supabase = createServiceRoleClient();
    const billIds = Array.from(
      new Set(cleanedRows.map((r) => r.cleaned.bill_id))
    );
    const { data: dbBills, error: billsError } = await (supabase as any)
      .from('billing_student_bills')
      .select(
        'id, student_id, institution_id, balance_amount, final_amount, status, learners_profiles:student_id(roll_number)'
      )
      .in('id', billIds);

    if (billsError) {
      console.error('[receipts/bulk-import] Bills lookup failed:', billsError);
      return NextResponse.json(
        { error: 'Failed to look up bills', message: billsError.message },
        { status: 500 }
      );
    }

    const billById = new Map<string, any>();
    (dbBills ?? []).forEach((b: any) => billById.set(b.id, b));

    // Validate per row against DB state
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

      // Cross-check that the row's roll_number actually belongs to this bill's student.
      // Catches the case where someone copy-pasted rows across files.
      const dbRoll = bill.learners_profiles?.roll_number;
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

    // -- Group by student and create receipts ---------------------------
    const groups = groupRowsByStudent(validatedRows, errors);
    const created: BulkReceiptCreated[] = [];

    // Default accountant to the calling super admin if not supplied
    const finalMeta: BulkReceiptBatchMetadata = {
      ...meta,
      accountant_id: meta.accountant_id ?? user.id
    };

    for (const group of groups) {
      const result = await createReceiptForStudentGroup(
        group,
        finalMeta,
        supabase as any
      );
      if (result.ok) {
        created.push(result.receipt);
      } else {
        errors.push({
          row: 0,
          message: `Failed to create receipt for student ${group.student_name} (${group.roll_number}): ${result.message}`
        });
      }
    }

    return NextResponse.json<BulkReceiptImportResult>({
      success: errors.length === 0,
      successCount: created.length,
      errorCount: errors.length,
      totalRows: cleanedRows.length,
      totalStudents: groups.length,
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
