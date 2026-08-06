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
 * - Column D (Institution)      — active institutions that have >=1 academic year
 * - Column E (Academic Year)    — CASCADES from column D via INDIRECT + MATCH
 *                                 against the AY_<n> defined names
 * - Column F (Billing Category) — all active billing_categories
 *
 * NOTE: these cell letters track the column order in `sheet.columns` below.
 * The importer reads by header text, so it survives reordering — these
 * validations do not. Change both together.
 *
 * Sheets:
 * - "Bills"        — main data sheet (frozen header, sample yellow row)
 * - "Lists"        — hidden; category list, institution list, and one column
 *                    of academic years per institution (the cascade source)
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

    // Institutions + their active academic years, for the cascading pair.
    //
    // Academic years are stored PER INSTITUTION and the sets differ sharply
    // (Pharmacy has 10 cohorts spanning 2021-2031; Education has 1). A single
    // flat year list would happily let someone pick a year that doesn't exist
    // for their learner's institution, and the row would only fail at import.
    const { data: institutionRows } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('is_active', true)
      .order('name');

    const { data: acadYearRows } = await supabase
      .from('academic_years')
      .select('academic_year_name, institution_id')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });

    const yearsByInstitution = new Map<string, string[]>();
    (acadYearRows ?? []).forEach((r: any) => {
      if (!r.institution_id || !r.academic_year_name) return;
      const list = yearsByInstitution.get(r.institution_id) ?? [];
      if (!list.includes(r.academic_year_name)) list.push(r.academic_year_name);
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
      { header: STUDENT_BILL_TEMPLATE_HEADERS[9], key: 'remarks', width: 30 }
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
      academic_year: sampleInstitution?.years[0] ?? '',
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
    //   B  Institution names  (the cascade's key column)
    //   D… one column per institution, holding THAT institution's years
    //
    // Each per-institution column is registered as a defined name AY_<n>,
    // where <n> is the institution's 1-based row position in column B. The
    // Academic Year validation then resolves
    //   INDIRECT("AY_" & MATCH(<institution cell>, B-range, 0))
    //
    // Position-keying (rather than the usual trick of deriving a name from the
    // dropdown text via SUBSTITUTE) is deliberate: institution names contain
    // parentheses — "…Arts and Science (Aided)" / "(Self)" — which are illegal
    // in Excel defined names, and counselling_code is NOT unique (both Arts &
    // Science colleges are "CAS"). A row index has neither problem.
    //
    // Requires institution names to be unique, which they are (14/14 distinct).
    const listsSheet = workbook.addWorksheet('Lists');
    listsSheet.getCell('A1').value = 'BillingCategory';
    listsSheet.getCell('B1').value = 'Institution';
    listsSheet.getColumn(1).width = 32;
    listsSheet.getColumn(2).width = 44;

    categoryNames.forEach((name, i) => {
      listsSheet.getCell(`A${i + 2}`).value = name;
    });
    institutionsWithYears.forEach((inst, i) => {
      listsSheet.getCell(`B${i + 2}`).value = inst.name;
    });

    institutionsWithYears.forEach((inst, i) => {
      const columnIndex = 4 + i; // 4 = column D
      const letter = listsSheet.getColumn(columnIndex).letter;
      listsSheet.getColumn(columnIndex).width = 18;
      listsSheet.getCell(`${letter}1`).value = inst.name;
      inst.years.forEach((year, rowOffset) => {
        listsSheet.getCell(`${letter}${rowOffset + 2}`).value = year;
      });
      workbook.definedNames.add(
        `Lists!$${letter}$2:$${letter}$${inst.years.length + 1}`,
        `AY_${i + 1}`
      );
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

        // Column E — Academic Year, cascaded from the Institution in column D.
        // Until D is filled, MATCH returns #N/A and Excel simply shows no
        // list — errorStyle 'warning' keeps that from blocking data entry.
        // The importer re-resolves every value server-side regardless.
        sheet.getCell(`E${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`INDIRECT("AY_"&MATCH($D${row},${institutionRange},0))`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Academic Year',
          error:
            'Pick the Institution in column D first — this list then shows only the academic years that exist for it.'
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
      '3. INSTITUTION + ACADEMIC YEAR ARE A CASCADING PAIR:',
      '   - Pick the Institution in column D FIRST.',
      '   - Column E then offers only the academic years that exist for that',
      '     institution. Academic years are stored per institution and the sets',
      '     differ a lot (one college has 10 cohorts, another has 1), so a year',
      '     valid for one college is often invalid for another.',
      '   - If column E shows no dropdown, column D is empty or was typed by hand.',
      '   - Institutions with no academic year set up are NOT listed — no valid',
      '     bill row can be built for them until a year is created.',
      '   - Institution is optional. It drives the dropdown, and if you do fill',
      '     it in, the import checks it matches the learner\'s real institution',
      '     and rejects the row if it does not. The Roll Number remains what',
      '     actually identifies the learner.',
      '   - The cascade needs Microsoft Excel or LibreOffice. Google Sheets does',
      '     not support this kind of dropdown — the file still opens and imports',
      '     fine there, you just type the values instead of picking them.',
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
