export const dynamic = 'force-dynamic';

// app/api/billing/schedule/bills/template/route.ts

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  STUDENT_BILL_TEMPLATE_HEADERS,
  MIN_ACADEMIC_YEAR_START,
  filterBillableAcademicYears
} from '@/lib/utils/mappings/student-bill-excel-mappings';

/**
 * GET /api/billing/schedule/bills/template
 *
 * Generates a blank Excel template for bulk Student Bill creation.
 *
 * Each row of the template is one self-contained bill — Roll Number +
 * Billing Category + Description + Due Date + Amount + Remarks.
 *
 * Dropdowns:
 * - Column D (Institution)      — active institutions that have >=1 academic year
 * - Column E (Academic Year)    — EVERY academic year in the system, flat
 * - Column F (Billing Category) — all active billing_categories
 *
 * NOTE: these cell letters track the column order in `sheet.columns` below.
 * The importer reads by header text, so it survives reordering — these
 * validations do not. Change both together.
 *
 * Sheets:
 * - "Bills"        — main data sheet (frozen header, sample yellow row)
 * - "Lists"        — hidden; category list, institution list, academic years
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

    // Institutions + every academic year in the system.
    //
    // NO is_active filter on academic_years — deliberately. The importer
    // (bulk-create-bills-service) resolves a year by institution_id + name
    // against the whole table, so an inactive year imports perfectly well.
    // Filtering here made the template STRICTER than the thing it feeds:
    // Dental's four "…Additional n" cohorts are is_active = false and were
    // simply missing from the dropdown even though the upload accepted them.
    const { data: institutionRows } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    const { data: acadYearRows } = await supabase
      .from('academic_years')
      .select('academic_year_name, institution_id')
      .order('academic_year_name', { ascending: false });

    // The Academic Year dropdown is one flat list of every distinct year name
    // from MIN_ACADEMIC_YEAR_START (2020-2021) onwards. Years are stored per
    // institution and the sets differ sharply (Pharmacy has 10 cohorts spanning
    // 2021-2031, Education has 1), so this list can offer a year that is
    // invalid for a given learner — the importer catches that and rejects the
    // row by name. A flat list is what the accounts team asked for: every year
    // in the Academic Years module from 2020-2021 on is pickable.
    const allYearNames = filterBillableAcademicYears(
      (acadYearRows ?? []).map((r: any) => r.academic_year_name)
    );

    // Same floor applied per institution, so the sample row and the column D
    // list can never reference a year the dropdown itself refuses to show.
    const billableYears = new Set(allYearNames);
    const yearsByInstitution = new Map<string, string[]>();
    (acadYearRows ?? []).forEach((r: any) => {
      if (!r.institution_id || !r.academic_year_name) return;
      const name = String(r.academic_year_name).trim();
      if (!billableYears.has(name)) return;
      const list = yearsByInstitution.get(r.institution_id) ?? [];
      if (!list.includes(name)) list.push(name);
      yearsByInstitution.set(r.institution_id, list);
    });

    // Only institutions that HAVE an academic year can produce a valid row now
    // that the column is required — listing the others would offer a choice
    // that can never import. Self-healing: add a year and it reappears here.
    const institutionsWithYears = (institutionRows ?? [])
      .map((i: any) => ({ id: i.id, name: i.name as string, years: yearsByInstitution.get(i.id) ?? [] }))
      .filter((i) => i.name && i.years.length > 0);

    // Workbook
    const workbook = new ExcelJS.Workbook();

    // ---- Sheet 1: Bills ------------------------------------------------
    const sheet = workbook.addWorksheet('Bills');

    // Column order drives the dataValidation cell letters further down
    // (D/E/F/H/I). The importer itself reads by header text, so it is
    // unaffected by reordering — but these letters are NOT. Update together.
    //   A Roll Number   B First Name   C Last Name   D Institution
    //   E Academic Year   F Billing Category   G Bill Description
    //   H Due Date   I Billing Amount   J Remarks
    sheet.columns = [
      { header: STUDENT_BILL_TEMPLATE_HEADERS[0], key: 'roll_number', width: 22 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[1], key: 'first_name', width: 22 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[2], key: 'last_name', width: 22 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[3], key: 'institution', width: 44 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[4], key: 'academic_year', width: 20 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[5], key: 'billing_category', width: 32 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[6], key: 'bill_description', width: 38 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[7], key: 'due_date', width: 18 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[8], key: 'billing_amount', width: 18 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[9], key: 'remarks', width: 30 },
      // Optional. Leave both blank for a plain single-date bill — which is
      // what every sheet printed before 2026-09-06 does.
      { header: STUDENT_BILL_TEMPLATE_HEADERS[10], key: 'instalment_shares', width: 22 },
      { header: STUDENT_BILL_TEMPLATE_HEADERS[11], key: 'instalment_due_dates', width: 34 }
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
    const sampleInstitution = institutionsWithYears[0];
    sheet.addRow({
      roll_number: 'SAMPLE-2024-001',
      first_name: 'SAMPLE',
      last_name: 'LEARNER',
      institution: sampleInstitution?.name ?? '',
      academic_year: sampleInstitution?.years[0] ?? allYearNames[0] ?? '',
      billing_category: categoryNames[0] ?? 'Tuition Fee',
      bill_description: 'Semester 1 fee',
      due_date: '2026-06-01',
      billing_amount: 25000,
      remarks: 'Optional remarks',
      instalment_shares: '30/35/35',
      instalment_due_dates: '2026-06-01|2026-10-30|2027-02-28'
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

    // Format Due Date column as date. Institution/Academic Year are forced to
    // text so a year like "2024-2025" is never coerced into a date.
    sheet.getColumn('due_date').numFmt = 'yyyy-mm-dd';
    sheet.getColumn('billing_amount').numFmt = '#,##0.00';
    sheet.getColumn('academic_year').numFmt = '@';

    // Default font for empty data cells
    for (let row = 3; row <= 100; row++) {
      sheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' }
      };
    }

    // ---- Sheet 2: Lists (hidden, source for every dropdown) -------------
    //
    // Layout:
    //   A  Billing categories (flat — categories are global)
    //   B  Institution names
    //   C  Academic years     (flat — every distinct name, newest first)
    //
    // This sheet used to hold one year column per institution plus an AY_<n>
    // defined name each, so column E could cascade off column D via
    // INDIRECT + MATCH. That cascade is gone: it hid years from anyone who had
    // not filled the (optional) Institution column first, and it silently
    // dropped every year whose institution row was filtered out. The importer
    // still validates year-vs-institution server-side, so nothing that was
    // rejected before is accepted now — the check just moved off the sheet.
    const listsSheet = workbook.addWorksheet('Lists');
    listsSheet.getCell('A1').value = 'BillingCategory';
    listsSheet.getCell('B1').value = 'Institution';
    listsSheet.getCell('C1').value = 'AcademicYear';
    listsSheet.getColumn(1).width = 32;
    listsSheet.getColumn(2).width = 44;
    listsSheet.getColumn(3).width = 24;

    categoryNames.forEach((name, i) => {
      listsSheet.getCell(`A${i + 2}`).value = name;
    });
    institutionsWithYears.forEach((inst, i) => {
      listsSheet.getCell(`B${i + 2}`).value = inst.name;
    });
    allYearNames.forEach((year, i) => {
      listsSheet.getCell(`C${i + 2}`).value = year;
    });

    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Apply data validations to the first 100 data rows
    const validationEndRow = 100;
    const institutionRange = `Lists!$B$2:$B$${institutionsWithYears.length + 1}`;

    for (let row = 2; row <= validationEndRow; row++) {
      // Column D — Institution dropdown (drives the Academic Year list)
      if (institutionsWithYears.length > 0) {
        sheet.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [institutionRange],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Institution',
          error:
            'Pick an institution from the dropdown. Only institutions that have at least one academic year are listed.'
        };

      }

      // Column E — Academic Year. Flat list of every year in the system,
      // independent of column D. The importer still checks the year exists
      // for the learner's own institution and names the mismatch if not.
      if (allYearNames.length > 0) {
        sheet.getCell(`E${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`Lists!$C$2:$C$${allYearNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Academic Year',
          error:
            'Pick an academic year from the dropdown. It must be a year that exists for this learner\'s institution, or the row is rejected on upload.'
        };
      }

      // Column F — Billing Category dropdown
      if (categoryNames.length > 0) {
        sheet.getCell(`F${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`Lists!$A$2:$A$${categoryNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Billing Category',
          error: 'Please pick a category from the dropdown.'
        };
      }

      // Column H — Due Date must be a date
      sheet.getCell(`H${row}`).dataValidation = {
        type: 'date',
        operator: 'greaterThanOrEqual',
        allowBlank: false,
        formulae: [new Date(2000, 0, 1)],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Due Date',
        error: 'Due date must be a valid date (yyyy-mm-dd).'
      };

      // Column I — Billing Amount must be a non-negative number
      sheet.getCell(`I${row}`).dataValidation = {
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
      '   - Academic Year     : Pick from the dropdown. REQUIRED as of 2026-07-29 —',
      '                         a blank cell now rejects the row.',
      '   - Billing Category  : Pick from the dropdown. Lists every ACTIVE category.',
      '   - Due Date          : Format yyyy-mm-dd (e.g. 2026-06-01).',
      '   - Billing Amount    : Numeric, in rupees. No commas, no ₹ symbol.',
      '',
      '3. ACADEMIC YEAR (column E):',
      `   - The dropdown lists every academic year from ${MIN_ACADEMIC_YEAR_START}-${
        MIN_ACADEMIC_YEAR_START + 1
      } onwards — the same list you`,
      '     see under Academic > Academic Years, including the "Additional"',
      '     cohorts. You do not have to pick an Institution first. Older cohorts',
      '     are hidden because bills are no longer raised against them.',
      '   - Academic years are stored PER INSTITUTION and the sets differ a lot',
      '     (one college has 10 cohorts, another has 1). The dropdown does not',
      '     narrow itself, so a year that is valid for one college can be picked',
      '     for a learner at another — the upload rejects that row and names the',
      '     year and the learner\'s institution in the error report.',
      '   - Institution (column D) is optional. If you do fill it in, the import',
      '     checks it matches the learner\'s real institution and rejects the row',
      '     if it does not. The Roll Number remains what identifies the learner.',
      '   - Institutions with no academic year set up are NOT listed in column D —',
      '     no valid bill row can be built for them until a year is created.',
      '',
      '4. OPTIONAL COLUMNS:',
      '   - First Name        : The learner\'s first name. Not used to find the learner —',
      '                         the Roll Number does that. It is here so you can verify',
      '                         you are billing the right person, and so failed rows name',
      '                         the learner in the error report.',
      '   - Last Name         : As above.',
      '   - Bill Description  : Free text shown on the bill.',
      '   - Remarks           : Free text, internal notes.',
      '',
      '5. VALIDATION RULES:',
      '   - Roll Number that does not match any active student → row rejected with error.',
      '   - Academic Year blank, or not valid for the learner\'s institution → row rejected.',
      '   - Institution filled in but different from the learner\'s → row rejected.',
      '   - Billing Category not in the dropdown → row rejected.',
      '   - Due Date in the past or unparseable → row rejected.',
      '   - Billing Amount < 0 or non-numeric → row rejected.',
      '',
      '6. PARTIAL FAILURES:',
      '   - Valid rows are saved even if some rows fail.',
      '   - The import dialog shows a per-row error report so you can fix the bad rows and re-upload only those.',
      '',
      '7. SAMPLE DATA:',
      '   - Row 2 contains a sample. Replace with your own data before importing.',
      '   - Do not upload a file with only the header row — add at least one bill row.',
      '',
      '8. ADDING YOUR OWN COLUMNS:',
      '   - Safe. Columns are matched by their HEADER TEXT, not their position,',
      '     so you may insert or reorder columns and old files still import.',
      '   - Do NOT rename or delete the four required headers.',
      '   - Keep the data on the sheet named "Bills".',
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
