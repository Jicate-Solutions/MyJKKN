export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/template/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { STUDENT_BILL_TEMPLATE_HEADERS } from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * GET /api/billing/schedule/bills/template
 *
 * Generates a blank Excel template for bulk Student Bill creation.
 *
 * Each row of the template is one self-contained bill — Roll Number +
 * Billing Category + Description + Due Date + Amount + Remarks.
 *
 * Dropdowns:
 * - Column B (Billing Category) — populated from active billing_categories
 *
 * Sheets:
 * - "Bills"        — main data sheet (frozen header, sample yellow row)
 * - "Lists"        — hidden, holds the Billing Category list for the dropdown
 * - "Instructions" — column-by-column guide
 */
export async function GET(_request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Auth guard
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch active billing categories for the dropdown
    const { data: categories, error: catError } = await supabase
      .from('billing_categories')
      .select('id, category_name')
      .eq('is_active', true)
      .order('category_name');

    if (catError) {
      console.error('[bills/template] Error fetching billing categories:', catError);
      return NextResponse.json(
        { error: 'Failed to fetch billing categories', message: catError.message },
        { status: 500 }
      );
    }

    const categoryNames = (categories ?? [])
      .map((c) => c.category_name)
      .filter((name): name is string => Boolean(name));

    // Workbook
    const workbook = new ExcelJS.Workbook();

    // ---- Sheet 1: Bills ------------------------------------------------
    const sheet = workbook.addWorksheet('Bills');

    sheet.columns = [
      { header: STUDENT_BILL_TEMPLATE_HEADERS[0], key: 'roll_number', width: 22 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[1], key: 'billing_category', width: 32 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[2], key: 'bill_description', width: 38 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[3], key: 'due_date', width: 18 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[4], key: 'billing_amount', width: 18 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[5], key: 'remarks', width: 30 }
    ];

    // Header styling — blue background, white text
    sheet.getRow(1).font = {
      bold: true,
      size: 11,
      name: 'Arial',
      color: { argb: 'FFFFFFFF' }
    };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }
    };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 22;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Sample row (yellow)
    sheet.addRow({
      roll_number: 'SAMPLE-2024-001',
      billing_category: categoryNames[0] ?? 'Tuition Fee',
      bill_description: 'Semester 1 fee',
      due_date: '2026-06-01',
      billing_amount: 25000,
      remarks: 'Optional remarks'
    });
    sheet.getRow(2).font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
    sheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' }
    };
    sheet.getRow(2).alignment = { vertical: 'middle' };
    sheet.getCell('A2').note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        {
          font: { size: 9 },
          text: 'Replace with real bills. Delete this row before importing if you only want your own data.'
        }
      ]
    };

    // Format Due Date column as date
    sheet.getColumn('due_date').numFmt = 'yyyy-mm-dd';
    sheet.getColumn('billing_amount').numFmt = '#,##0.00';

    // Default font for empty data cells
    for (let row = 3; row <= 100; row++) {
      sheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' }
      };
    }

    // ---- Sheet 2: Lists (hidden, source for the Billing Category dropdown)
    const listsSheet = workbook.addWorksheet('Lists');
    listsSheet.columns = [{ header: 'BillingCategory', key: 'category', width: 32 }];
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };
    categoryNames.forEach((name) => listsSheet.addRow({ category: name }));

    // Apply data validations to the first 100 data rows
    const validationEndRow = 100;

    for (let row = 2; row <= validationEndRow; row++) {
      // Column B — Billing Category dropdown
      if (categoryNames.length > 0) {
        sheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`Lists!$A$2:$A$${categoryNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Billing Category',
          error: 'Please pick a category from the dropdown.'
        };
      }

      // Column D — Due Date must be a date
      sheet.getCell(`D${row}`).dataValidation = {
        type: 'date',
        operator: 'greaterThanOrEqual',
        allowBlank: false,
        formulae: [new Date(2000, 0, 1)],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Due Date',
        error: 'Due date must be a valid date (yyyy-mm-dd).'
      };

      // Column E — Billing Amount must be a non-negative number
      sheet.getCell(`E${row}`).dataValidation = {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        allowBlank: false,
        formulae: [0],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Amount',
        error: 'Billing amount must be a positive number (₹).'
      };
    }

    // Hide Lists sheet
    listsSheet.state = 'hidden';

    // ---- Sheet 3: Instructions -----------------------------------------
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 90 }];

    const instructions = [
      'INSTRUCTIONS — BULK STUDENT BILL IMPORT',
      '',
      '1. WHAT EACH ROW MEANS:',
      '   - One row = one bill for one student.',
      '   - You can mix categories, due dates and amounts freely across rows.',
      '   - The student\'s institution is inferred from the roll number — no need to specify it.',
      '',
      '2. REQUIRED COLUMNS:',
      '   - Roll Number       : The student\'s roll number (must already exist in the system).',
      '   - Billing Category  : Pick from the dropdown. The dropdown only lists ACTIVE categories.',
      '   - Due Date          : Format yyyy-mm-dd (e.g. 2026-06-01).',
      '   - Billing Amount    : Numeric, in rupees. No commas, no ₹ symbol.',
      '',
      '3. OPTIONAL COLUMNS:',
      '   - Bill Description  : Free text shown on the bill.',
      '   - Remarks           : Free text, internal notes.',
      '',
      '4. VALIDATION RULES:',
      '   - Roll Number that does not match any active student → row rejected with error.',
      '   - Billing Category not in the dropdown → row rejected.',
      '   - Due Date in the past or unparseable → row rejected.',
      '   - Billing Amount < 0 or non-numeric → row rejected.',
      '',
      '5. PARTIAL FAILURES:',
      '   - Valid rows are saved even if some rows fail.',
      '   - The import dialog shows a per-row error report so you can fix the bad rows and re-upload only those.',
      '',
      '6. SAMPLE DATA:',
      '   - Row 2 contains a sample. Replace with your own data before importing.',
      '',
      'For support, contact your system administrator.'
    ];

    instructions.forEach((line, index) => {
      const row = instructionsSheet.addRow([line]);
      if (index === 0) {
        row.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A8A' } };
      } else if (line.match(/^\d+\./)) {
        row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else {
        row.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // ---- Render --------------------------------------------------------
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=student-bills-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[billing/schedule/bills/template] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate template', message: errorMessage },
      { status: 500 }
    );
  }
}
