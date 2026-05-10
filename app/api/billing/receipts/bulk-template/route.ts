export const dynamic = 'force-dynamic';

// app/api/billing/receipts/bulk-template/route.ts
//
// Super-admin only. Returns an Excel template pre-filled with outstanding
// bills (unpaid + partially_paid) matching the schedule-page filters that
// the dialog passes through as query params. The admin fills only the
// "Paid Amount" column and uploads via /api/billing/receipts/bulk-import.

import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { BULK_RECEIPT_TEMPLATE_HEADERS } from '@/lib/utils/mappings/bulk-receipt-excel-mappings';

export const maxDuration = 60;

/**
 * Confirms the calling user is a super admin. Mirrors the 3-step semantics
 * used elsewhere in app/api: profiles.is_super_admin OR profiles.role === 'super_admin'.
 * We keep this simpler than expos/bulk-capture because bulk-receipt is
 * super-admin-only by product decision (no permission grant fallback).
 */
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

export async function GET(request: NextRequest) {
  await connection();

  // -- Auth ----------------------------------------------------------------
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = await assertSuperAdmin(user.id);
  if (!isSuperAdmin) {
    return NextResponse.json(
      { error: 'Forbidden — super-admin only' },
      { status: 403 }
    );
  }

  try {
    // -- Parse filters from query string ----------------------------------
    const sp = request.nextUrl.searchParams;
    const filters = {
      institution_id: sp.get('institution_id') || undefined,
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
      { header: BULK_RECEIPT_TEMPLATE_HEADERS[6], key: 'paid_amount', width: 16 }
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

    // Add data rows
    bills.forEach((bill) => {
      sheet.addRow({
        roll_number: bill.roll_number,
        student_name: bill.student_name,
        bill_id: bill.bill_id,
        bill_description: bill.bill_description ?? '',
        category: bill.category ?? '',
        balance_amount: bill.balance_amount,
        paid_amount: '' // intentionally blank — admin fills this
      });
    });

    // Lock the identity columns so the admin can't accidentally edit them.
    // We do this by protecting the sheet but unlocking the Paid Amount column.
    const lastDataRow = bills.length + 1;
    for (let row = 2; row <= lastDataRow; row++) {
      // Unlock only the Paid Amount cell (column G)
      sheet.getCell(`G${row}`).protection = { locked: false };
      // Lock the rest explicitly so the protection knows the intent
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

    // Style the bill_id column subtle gray so the admin sees it's locked
    for (let row = 2; row <= lastDataRow; row++) {
      sheet.getCell(`C${row}`).font = {
        name: 'Consolas',
        size: 9,
        color: { argb: 'FF6B7280' }
      };
    }

    // Sheet 2: Instructions ------------------------------------------------
    const instructions = workbook.addWorksheet('Instructions');
    instructions.columns = [{ width: 90 }];

    const lines = [
      'BULK RECEIPT GENERATION — INSTRUCTIONS',
      '',
      '1. WHAT THIS FILE CONTAINS:',
      `   - ${bills.length} outstanding bill${bills.length !== 1 ? 's' : ''} matching your current schedule-page filters.`,
      '   - Only bills with status Unpaid or Partially Paid are included.',
      '',
      '2. WHAT TO DO:',
      '   - Fill the "Paid Amount" column for each row you want to receipt.',
      '   - Leave "Paid Amount" blank for rows you want to skip — they will be ignored.',
      '   - Save the file (keep .xlsx format) and upload it back into the dialog.',
      '',
      '3. RULES:',
      '   - Do NOT edit any other column. Roll Number, Bill ID, etc. are locked.',
      '   - Paid Amount must be > 0 and ≤ Balance Amount for the row to be processed.',
      '   - When a single student has multiple rows in this file, all their paid rows merge into ONE receipt.',
      '   - The hidden Bill ID column is the deterministic key — do not delete it or reorder rows.',
      '',
      '4. PAYMENT METADATA:',
      '   - Payment Mode, Paid Date, and Payer Name are set in the dialog ONCE for the whole batch.',
      '   - If different students paid via different methods, run separate batches.',
      '',
      '5. WHAT HAPPENS ON UPLOAD:',
      '   - One billing_receipts row is created per student (with a fresh receipt number).',
      '   - One billing_receipt_items row is created per filled bill.',
      '   - Bill statuses are recomputed (paid / partially_paid).',
      '   - Errors are reported per row — valid rows for other students still commit.',
      '',
      '6. SUPPORT:',
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
