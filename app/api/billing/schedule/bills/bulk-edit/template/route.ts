export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/bulk-edit/template/route.ts
//
// GET — Excel template pre-filled with EXISTING bills (current values) matching
// the bulk-edit download filters. Runs as the user (RLS scopes the rows). The
// locked Bill ID column is the update key. Editable columns: Final Amount,
// Academic Year, Billing Category, Bill Description, Due Date, Remarks.

import { NextRequest, NextResponse, connection } from 'next/server';
import ExcelJS from 'exceljs';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { StudentBillService } from '@/lib/services/billing/schedule/student-bill-service';
import {
  AMOUNT_LOCKED_STATUSES,
  STUDENT_BILL_BULK_EDIT_HEADERS,
  type BulkEditDownloadFilters
} from '@/lib/utils/mappings/student-bill-bulk-edit-mappings';
import { filterBillableAcademicYears } from '@/lib/utils/mappings/student-bill-excel-mappings';

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
    //
    // No is_active filter on academic_years: the apply route resolves a year by
    // institution + name against the whole table, so an inactive year is a
    // legal edit. Filtering here only hid the four Dental "…Additional n"
    // cohorts from a list that would have accepted them.
    //
    // filterBillableAcademicYears applies the same 2020-2021 floor as the
    // bulk-create template — the two pickers are meant to agree.
    const { data: ayRows } = await supabase
      .from('academic_years')
      .select('academic_year_name')
      .order('academic_year_name', { ascending: false });
    const academicYearNames = filterBillableAcademicYears(
      (ayRows ?? []).map((r: any) => r.academic_year_name)
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

    // Lock A–E, unlock F–K, attach dropdowns / number / date validation.
    // F (Final Amount) is unlocked but tinted amber rather than purple: it is
    // the one column that moves money, and the server re-validates it against
    // the bill's status and receipted total regardless of what Excel allows.
    for (let row = 2; row <= lastRow; row++) {
      ['A', 'B', 'C', 'D', 'E'].forEach((col) => {
        sheet.getCell(`${col}${row}`).protection = { locked: true };
      });
      ['F', 'G', 'H', 'I', 'J', 'K'].forEach((col) => {
        sheet.getCell(`${col}${row}`).protection = { locked: false };
        sheet.getCell(`${col}${row}`).fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: col === 'F' ? 'FFFEF3C7' : 'FFF5F3FF' }
        };
      });
      sheet.getCell(`A${row}`).font = { name: 'Consolas', size: 9, color: { argb: 'FF6B7280' } };

      sheet.getCell(`F${row}`).dataValidation = {
        type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true,
        formulae: [0],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Amount',
        error: 'Enter a number of 0 or more, or leave the cell unchanged to keep the current amount.'
      };

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
          type: 'list', allowBlank: true,
          formulae: [`Lists!$B$2:$B$${categoryNames.length + 1}`],
          showErrorMessage: true, errorStyle: 'warning',
          errorTitle: 'Invalid Billing Category',
          error: 'Pick a category from the dropdown, or leave blank to keep the current one.'
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
      '2. EDIT ONLY the tinted columns: Final Amount (amber), Academic Year, Billing Category, Bill Description, Due Date, Remarks (purple).',
      '3. Do NOT edit or delete the Bill ID column — it is the key used to match your edits back to each bill. Reordering rows is fine.',
      '4. Academic Year / Bill Description / Remarks: leave blank to CLEAR the field. Final Amount and Billing Category: leave blank to keep the current value. Due Date is required.',
      '5. Academic Year must match an existing year for that bill\'s institution (pick from the dropdown).',
      '',
      'FINAL AMOUNT — read this before changing any figure:',
      '  a. Changing the amount automatically recalculates the bill\'s balance and status from the payments already receipted against it.',
      `  b. The amount CANNOT be changed on a ${AMOUNT_LOCKED_STATUSES.join(' / ')} bill — those rows will be rejected with an error. Every other field on them stays editable.`,
      '  c. The new amount cannot be lower than the total already receipted against that bill. Refund or cancel the receipt first.',
      '  d. Raising the amount on a paid bill reopens it as partially paid; that is expected, and the new balance becomes collectable.',
      '  e. Status is NOT editable here — it is shown for context and is recalculated for you.',
      '',
      '6. Save as .xlsx and upload. You will see a preview of every change, amounts included, before anything is written.'
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
