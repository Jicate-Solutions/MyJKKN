export const dynamic = 'force-dynamic';

// app/api/billing/receipts/bulk-template/route.ts
//
// Requires super admin, or a role holding billing.receipts.bulk_create — in
// which case the result is bounded to that user's accessible institutions.
// Returns an Excel template pre-filled with outstanding bills (unpaid +
// partially_paid) matching the schedule-page filters that the dialog passes
// through as query params. The admin fills only the "Paid Amount" column and
// uploads via /api/billing/receipts/bulk-import.

import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBulkReceiptAccess,
  assertInstitutionInScope
} from '@/lib/auth/bulk-receipt-access';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { BULK_RECEIPT_TEMPLATE_HEADERS } from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  await connection();

  // -- Auth ----------------------------------------------------------------
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await resolveBulkReceiptAccess(user.id);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  try {
    // -- Parse filters from query string ----------------------------------
    const sp = request.nextUrl.searchParams;
    const requestedInstitutionId = sp.get('institution_id') || undefined;

    const scopeError = assertInstitutionInScope(access, requestedInstitutionId);
    if (scopeError) {
      return NextResponse.json({ error: scopeError }, { status: 403 });
    }

    const filters = {
      institution_id: requestedInstitutionId,
      // The tenant boundary for this route. Every bill_id written into the
      // template is later accepted by /bulk-import, so narrowing here is what
      // keeps a scoped user's uploadable set inside their own institutions.
      institution_ids: access.isSuperAdmin ? undefined : access.institutionIds,
      item_category_id: sp.get('item_category_id') || undefined,
      degree_id: sp.get('degree_id') || undefined,
      department_id: sp.get('department_id') || undefined,
      program_id: sp.get('program_id') || undefined,
      semester_id: sp.get('semester_id') || undefined,
      section_id: sp.get('section_id') || undefined,
      academic_year_id: sp.get('academic_year_id') || undefined,
      due_date_from: sp.get('due_date_from') || undefined,
      due_date_to: sp.get('due_date_to') || undefined
    };

    // -- Per-row payment metadata defaults --------------------------------
    // Step 1 of the dialog passes these through so the downloaded template
    // ships with every row pre-filled. Admin can keep them as-is for a
    // single-batch flow, or override per row for mixed-payment scenarios.
    const ALLOWED_MODES = new Set([
      'cash',
      'online',
      'bank_transfer',
      'dd',
      'cheque',
      'combined'
    ]);
    const rawMode = sp.get('default_payment_mode') || 'cash';
    const defaultMode = ALLOWED_MODES.has(rawMode) ? rawMode : 'cash';
    const defaultPaidDate =
      sp.get('default_payment_paid_date') ||
      new Date().toISOString().slice(0, 10);
    const defaultPayerMode = sp.get('default_payer_mode') || 'student';
    const defaultPayerNameFixed =
      sp.get('default_payer_name_fixed')?.trim() || '';
    const defaultPayerContact = sp.get('default_payer_contact')?.trim() || '';
    const defaultPaymentReference =
      sp.get('default_payment_reference_number')?.trim() || '';
    const defaultRemarks = sp.get('default_payment_remarks')?.trim() || '';

    // Use service role to read bills regardless of caller's RLS scope —
    // super admin already authorized at this point.
    const supabase = createServiceRoleClient();
    const bills = await BillingReceiptService.getOutstandingBillsForBulk(
      filters,
      supabase as any
    );

    // -- Build workbook ---------------------------------------------------
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Bills (the data sheet — parser picks BY NAME, not index)
    const sheet = workbook.addWorksheet('Bills');
    sheet.columns = [
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[0], key: 'roll_number', width: 18 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[1], key: 'student_name', width: 28 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[2], key: 'bill_id', width: 38 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[3], key: 'bill_description', width: 32 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[4], key: 'category', width: 22 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[5], key: 'balance_amount', width: 16 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[6], key: 'paid_amount', width: 16 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[7], key: 'payment_mode', width: 16 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[8], key: 'paid_date', width: 14 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[9], key: 'payer_name', width: 28 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[10], key: 'payer_contact', width: 18 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[11], key: 'payment_reference', width: 22 },
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[12], key: 'remarks', width: 28 }
    ];

    // Header style — green so it's visually distinct from the bills-import
    // template's blue header.
    sheet.getRow(1).font = {
      bold: true,
      size: 11,
      name: 'Arial',
      color: { argb: 'FFFFFFFF' }
    };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF059669' }
    };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Format columns
    sheet.getColumn('balance_amount').numFmt = '#,##0.00';
    sheet.getColumn('paid_amount').numFmt = '#,##0.00';
    sheet.getColumn('paid_date').numFmt = 'yyyy-mm-dd';

    // Add data rows — pre-fill the per-row payment columns from the Step 1
    // defaults so admin only edits rows that deviate. Payer Name follows the
    // "student" mode by default: the student's name is the payer.
    bills.forEach((bill) => {
      const rowPayerName =
        defaultPayerMode === 'fixed' && defaultPayerNameFixed
          ? defaultPayerNameFixed
          : bill.student_name;
      sheet.addRow({
        roll_number: bill.roll_number,
        student_name: bill.student_name,
        bill_id: bill.bill_id,
        bill_description: bill.bill_description ?? '',
        category: bill.category ?? '',
        balance_amount: bill.balance_amount,
        paid_amount: '', // intentionally blank — admin fills this
        payment_mode: defaultMode,
        paid_date: defaultPaidDate,
        payer_name: rowPayerName,
        payer_contact: defaultPayerContact,
        payment_reference: defaultPaymentReference,
        remarks: defaultRemarks
      });
    });

    const lastDataRow = bills.length + 1;
    // Lock the identity columns (A-F) so the admin can't accidentally edit
    // them. Unlock the editable columns (G-M): Paid Amount + 6 per-row
    // payment fields. We protect the sheet but selectively unlock cells.
    for (let row = 2; row <= lastDataRow; row++) {
      ['G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach((col) => {
        sheet.getCell(`${col}${row}`).protection = { locked: false };
      });
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((col) => {
        sheet.getCell(`${col}${row}`).protection = { locked: true };
      });
      // Paid Amount must be a non-negative number ≤ Balance
      sheet.getCell(`G${row}`).dataValidation = {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, bills[row - 2]?.balance_amount ?? 0],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Paid Amount',
        error: 'Paid amount must be between 0 and the Balance Amount.'
      };
      // Payment Mode — dropdown of the allowed enum values
      sheet.getCell(`H${row}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"cash,online,bank_transfer,dd,cheque,combined"'],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Invalid Payment Mode',
        error:
          'Payment Mode must be one of: cash, online, bank_transfer, dd, cheque, combined.'
      };
      // Paid Date — must be a date >= 2000-01-01 and <= 2099-12-31
      sheet.getCell(`I${row}`).dataValidation = {
        type: 'date',
        operator: 'between',
        allowBlank: false,
        formulae: [new Date('2000-01-01'), new Date('2099-12-31')],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Invalid Paid Date',
        error: 'Paid Date must be a valid date in YYYY-MM-DD format.'
      };
    }
    // Sheet protection — empty password is fine; this stops accidental edits,
    // not malicious ones. The server-side import is the real guard.
    await sheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertRows: false,
      deleteRows: false,
      sort: false,
      autoFilter: true
    });

    // Style the bill_id column subtle gray so the admin sees it's locked.
    // Also lightly highlight the editable columns so the admin spots them.
    for (let row = 2; row <= lastDataRow; row++) {
      sheet.getCell(`C${row}`).font = {
        name: 'Consolas',
        size: 9,
        color: { argb: 'FF6B7280' }
      };
      // Soft green tint on the seven editable columns to signal "fill me".
      ['G', 'H', 'I', 'J', 'K', 'L', 'M'].forEach((col) => {
        sheet.getCell(`${col}${row}`).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF0FDF4' }
        };
      });
    }

    // Sheet 2: Instructions ------------------------------------------------
    const instructions = workbook.addWorksheet('Instructions');
    instructions.columns = [{ width: 90 }];

    const lines = [
      'BULK RECEIPT GENERATION — INSTRUCTIONS',
      '',
      '1. WHAT THIS FILE CONTAINS:',
      `   - ${bills.length} outstanding bill${bills.length !== 1 ? 's' : ''} matching your hierarchy filter.`,
      '   - Only bills with status Unpaid or Partially Paid are included.',
      '   - Per-row Payment Mode, Paid Date, Payer Name etc. are pre-filled from the Step 1 defaults.',
      '',
      '2. WHAT TO DO:',
      '   - Fill the "Paid Amount" column for each row you want to receipt.',
      '   - Leave "Paid Amount" blank for rows you want to skip — they will be ignored.',
      '   - Override Payment Mode / Paid Date / Payer Name / etc. per row when a student paid differently.',
      '   - Save the file (keep .xlsx format) and upload it back into the dialog.',
      '',
      '3. EDITABLE COLUMNS (highlighted light green):',
      '   - Paid Amount         (decimal, ≤ Balance Amount, > 0 to be processed)',
      '   - Payment Mode        (cash / online / bank_transfer / dd / cheque / combined) — dropdown',
      '   - Paid Date           (YYYY-MM-DD)',
      '   - Payer Name          (defaults to the student\'s name)',
      '   - Payer Contact       (optional phone / email)',
      '   - Payment Reference   (optional transaction / cheque / DD #)',
      '   - Remarks             (optional internal note attached to the receipt)',
      '',
      '4. LOCKED COLUMNS (do not edit):',
      '   - Roll Number, Student Name, Bill ID, Bill Description, Category, Balance Amount',
      '   - The hidden Bill ID column is the deterministic key — do not delete it or reorder rows.',
      '',
      '5. GROUPING RULES:',
      '   - Rows are grouped by (student + Paid Date + Payment Mode).',
      '   - A student with multiple bills paid on the SAME date+mode → ONE receipt with multiple items.',
      '   - A student with bills paid on DIFFERENT dates or modes → SEPARATE receipts (one per group).',
      '   - The preview screen shows the exact grouping before commit.',
      '',
      '6. WHAT HAPPENS ON UPLOAD:',
      '   - Step A (Preview): every row is validated and grouped — NOTHING is written yet.',
      '   - Step B (Confirm): if you accept the preview, one billing_receipts row per group is created.',
      '   - One billing_receipt_items row is created per filled bill.',
      '   - Bill statuses are recomputed (paid / partially_paid).',
      '   - Errors are reported per row — valid rows for other students still commit.',
      '',
      '7. SUPPORT:',
      '   - This is a super-admin-only flow. Errors that mention "Forbidden" mean your account is not super_admin.'
    ];

    lines.forEach((line, i) => {
      const row = instructions.addRow([line]);
      if (i === 0) {
        row.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF065F46' } };
      } else if (line.match(/^\d+\./)) {
        row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else {
        row.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // Render
    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=bulk-receipts-template-${today}.xlsx`,
        'X-Bills-Count': String(bills.length)
      }
    });
  } catch (error) {
    console.error('[billing/receipts/bulk-template] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate template', message },
      { status: 500 }
    );
  }
}
