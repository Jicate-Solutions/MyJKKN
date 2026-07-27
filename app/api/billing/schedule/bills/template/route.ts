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
 * Each row of the template is one self-contained bill — learner identity +
 * Billing Category + Description + Due Date + Amount + Remarks.
 *
 * A learner is identified by Roll Number, by First/Last Name, or by both.
 * Name-only rows exist because reserved / admitted learners have no roll
 * number yet and could not be billed through this flow at all before.
 *
 * Dropdowns:
 * - Column D (Billing Category)        — populated from active billing_categories
 * - Column I (Academic Year, optional) — populated from active academic_years
 *
 * Sheets:
 * - "Bills"        — main data sheet (frozen header, two sample yellow rows)
 * - "Learners"     — hidden reference roster; A:C mirror the Bills sheet's A:C
 *                    so exact spellings can be copied straight across
 * - "Lists"        — hidden, holds the Billing Category + Academic Year lists for the dropdowns
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

    // Fetch distinct active academic-year names for the (optional) dropdown
    const { data: acadYearRows } = await supabase
      .from('academic_years')
      .select('academic_year_name')
      .eq('is_active', true)
      .order('academic_year_name', { ascending: false });
    const academicYearNames = Array.from(
      new Set((acadYearRows ?? []).map((r) => r.academic_year_name).filter(Boolean))
    );

    // ---- Reference roster for the hidden "Learners" sheet ---------------
    // Name matching only works if the typed name matches what's stored, so
    // the template ships the exact spellings for the user to copy.
    //
    // Institutions are resolved via a separate small query and joined in
    // memory rather than a PostgREST embed — the embed would need an FK
    // that we'd be depending on implicitly, and there are few institutions.
    const { data: institutionRows } = await supabase
      .from('institutions')
      .select('id, name');
    const institutionNameById = new Map<string, string>();
    (institutionRows ?? []).forEach((i: any) => {
      if (i?.id) institutionNameById.set(i.id, i.name ?? '');
    });

    // PostgREST caps a plain select() at 1,000 rows, so a single query would
    // hand back a truncated roster that LOOKS complete. Page explicitly.
    // RLS scopes this to the caller's accessible institutions automatically,
    // so a non-super-admin only ever downloads their own learners.
    const LEARNER_PAGE_SIZE = 1000;
    const LEARNER_HARD_CAP = 20000;
    const learnerRoster: Array<{
      roll_number: string | null;
      first_name: string | null;
      last_name: string | null;
      lifecycle_status: string | null;
      institution_id: string | null;
    }> = [];

    for (let offset = 0; offset < LEARNER_HARD_CAP; offset += LEARNER_PAGE_SIZE) {
      const { data: page, error: rosterError } = await supabase
        .from('learners_profiles')
        .select('roll_number, first_name, last_name, lifecycle_status, institution_id')
        // Order by a stable unique column so paging can't skip or repeat rows.
        .order('id', { ascending: true })
        .range(offset, offset + LEARNER_PAGE_SIZE - 1);

      if (rosterError) {
        // A missing roster costs the user a lookup convenience but doesn't
        // invalidate the template — the Bills sheet still imports fine. Log
        // and carry on rather than failing the whole download.
        console.error('[bills/template] Error fetching learner roster:', rosterError);
        break;
      }
      if (!page || page.length === 0) break;
      learnerRoster.push(...(page as any[]));
      if (page.length < LEARNER_PAGE_SIZE) break;
    }

    // Workbook
    const workbook = new ExcelJS.Workbook();

    // ---- Sheet 1: Bills ------------------------------------------------
    const sheet = workbook.addWorksheet('Bills');

    // Named bindings instead of STUDENT_BILL_TEMPLATE_HEADERS[n] lookups.
    // The indexed form paired header[n] with a hard-coded `key`, so inserting
    // a column shifted every LABEL one slot while the keys stayed put —
    // yielding a sheet whose "First Name" column was still wired as the
    // category dropdown. TypeScript can't catch that; every index is a valid
    // string. Destructuring keeps one source of truth and makes any future
    // misalignment visible at review time.
    const [
      H_ROLL_NUMBER,
      H_FIRST_NAME,
      H_LAST_NAME,
      H_BILLING_CATEGORY,
      H_BILL_DESCRIPTION,
      H_DUE_DATE,
      H_BILLING_AMOUNT,
      H_REMARKS,
      H_ACADEMIC_YEAR
    ] = STUDENT_BILL_TEMPLATE_HEADERS;

    sheet.columns = [
      { header: H_ROLL_NUMBER, key: 'roll_number', width: 22 },
      { header: H_FIRST_NAME, key: 'first_name', width: 26 },
      { header: H_LAST_NAME, key: 'last_name', width: 20 },
      { header: H_BILLING_CATEGORY, key: 'billing_category', width: 32 },
      { header: H_BILL_DESCRIPTION, key: 'bill_description', width: 38 },
      { header: H_DUE_DATE, key: 'due_date', width: 18 },
      { header: H_BILLING_AMOUNT, key: 'billing_amount', width: 18 },
      { header: H_REMARKS, key: 'remarks', width: 30 },
      { header: H_ACADEMIC_YEAR, key: 'academic_year', width: 22 }
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

    // Two sample rows (yellow) — one per identification mode, because the
    // name-only path is the non-obvious one. Learners who haven't been issued
    // a roll number yet (reserved / admitted) can ONLY be billed that way.
    sheet.addRow({
      roll_number: 'SAMPLE-2024-001',
      first_name: 'ARUN',
      last_name: 'K',
      billing_category: categoryNames[0] ?? 'Tuition Fee',
      bill_description: 'Semester 1 fee',
      due_date: '2026-06-01',
      billing_amount: 25000,
      remarks: 'Optional remarks',
      academic_year: ''
    });
    sheet.addRow({
      roll_number: '',
      first_name: 'PRIYA',
      last_name: 'DEVI',
      billing_category: categoryNames[0] ?? 'Tuition Fee',
      bill_description: 'Admission fee',
      due_date: '2026-06-01',
      billing_amount: 15000,
      remarks: 'Learner has no roll number yet',
      academic_year: ''
    });

    for (const sampleRow of [2, 3]) {
      sheet.getRow(sampleRow).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF1F2937' }
      };
      sheet.getRow(sampleRow).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFBEB' }
      };
      sheet.getRow(sampleRow).alignment = { vertical: 'middle' };
    }

    sheet.getCell('A2').note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        {
          font: { size: 9 },
          text: 'Identified by roll number. The name columns are optional here, but filling them guards against a typo billing the wrong learner — and they are required if the roll number is shared by more than one learner.'
        }
      ]
    };
    sheet.getCell('A3').note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        {
          font: { size: 9 },
          text: 'Identified by name only — use this when the learner has no roll number yet. The name must match exactly one learner; copy the spelling from the Learners sheet.'
        }
      ]
    };

    // Format Due Date column as date
    sheet.getColumn('due_date').numFmt = 'yyyy-mm-dd';
    sheet.getColumn('billing_amount').numFmt = '#,##0.00';

    // Default font for empty data cells — starts at 4 because rows 2 and 3
    // are the styled sample rows.
    for (let row = 4; row <= 100; row++) {
      sheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' }
      };
    }

    // ---- Sheet 2: Learners (hidden, reference roster) -------------------
    // Columns A:C deliberately mirror the Bills sheet's A:C so a user can
    // copy a three-cell block straight across without re-typing. Getting the
    // spelling right is the single biggest lever on the rejection rate.
    const learnersSheet = workbook.addWorksheet('Learners');
    learnersSheet.columns = [
      { header: 'Roll Number', key: 'roll_number', width: 22 },
      { header: 'First Name', key: 'first_name', width: 26 },
      { header: 'Last Name', key: 'last_name', width: 20 },
      { header: 'Institution', key: 'institution', width: 40 },
      { header: 'Status', key: 'status', width: 20 }
    ];
    learnersSheet.getRow(1).font = {
      bold: true,
      size: 11,
      name: 'Arial',
      color: { argb: 'FFFFFFFF' }
    };
    learnersSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }
    };
    learnersSheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Sorted for lookup — institution, then name. The DB paging above is
    // ordered by id for stability, so presentation order is applied here.
    learnerRoster
      .map((l) => ({
        roll_number: l.roll_number ?? '',
        first_name: l.first_name ?? '',
        last_name: l.last_name ?? '',
        institution: institutionNameById.get(l.institution_id ?? '') ?? '',
        status: l.lifecycle_status ?? ''
      }))
      .sort(
        (a, b) =>
          a.institution.localeCompare(b.institution) ||
          a.first_name.localeCompare(b.first_name) ||
          a.last_name.localeCompare(b.last_name)
      )
      .forEach((l) => learnersSheet.addRow(l));

    learnersSheet.state = 'hidden';

    // ---- Sheet 3: Lists (hidden, source for the Billing Category dropdown)
    const listsSheet = workbook.addWorksheet('Lists');
    listsSheet.columns = [
      { header: 'BillingCategory', key: 'category', width: 32 },
      { header: 'AcademicYear', key: 'academic_year', width: 20 }
    ];
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };
    categoryNames.forEach((name) => listsSheet.addRow({ category: name }));
    // Academic years live in column B; write them explicitly so the two
    // lists of differing length don't collide via addRow().
    academicYearNames.forEach((name, i) => {
      listsSheet.getCell(`B${i + 2}`).value = name;
    });

    // Apply data validations to the first 100 data rows
    const validationEndRow = 100;

    // Cell references below shifted by two when First Name / Last Name were
    // inserted at B and C: category B→D, due date D→F, amount E→G, academic
    // year G→I. These letters are the ONLY place column position still
    // matters — the importer reads by header, not by position.
    for (let row = 2; row <= validationEndRow; row++) {
      // Column D — Billing Category dropdown
      if (categoryNames.length > 0) {
        sheet.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`Lists!$A$2:$A$${categoryNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Billing Category',
          error: 'Please pick a category from the dropdown.'
        };
      }

      // Column F — Due Date must be a date
      sheet.getCell(`F${row}`).dataValidation = {
        type: 'date',
        operator: 'greaterThanOrEqual',
        allowBlank: false,
        formulae: [new Date(2000, 0, 1)],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Due Date',
        error: 'Due date must be a valid date (yyyy-mm-dd).'
      };

      // Column G — Billing Amount must be a non-negative number
      sheet.getCell(`G${row}`).dataValidation = {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        allowBlank: false,
        formulae: [0],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Amount',
        error: 'Billing amount must be a positive number (₹).'
      };

      // Column I — Academic Year dropdown (optional, allows blank)
      if (academicYearNames.length > 0) {
        sheet.getCell(`I${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$B$2:$B$${academicYearNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Academic Year',
          error: 'Pick an academic year from the dropdown, or leave blank.'
        };
      }
    }

    // Hide Lists sheet
    listsSheet.state = 'hidden';

    // ---- Sheet 4: Instructions -----------------------------------------
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 90 }];

    const instructions = [
      'INSTRUCTIONS — BULK LEARNER BILL IMPORT',
      '',
      '1. WHAT EACH ROW MEANS:',
      '   - One row = one bill for one learner.',
      '   - You can mix categories, due dates and amounts freely across rows.',
      '   - The learner\'s institution is inferred from the learner — no need to specify it.',
      '',
      '2. IDENTIFYING THE LEARNER (Roll Number / First Name / Last Name):',
      '   - Every row must carry a Roll Number, OR a name, OR both. A row with neither is rejected.',
      '   - Roll Number alone      : works whenever the roll number belongs to exactly one learner.',
      '   - Roll Number + name     : recommended. The name is checked against the record, so a',
      '                              mistyped roll number is caught instead of billing the wrong',
      '                              learner. It also resolves roll numbers shared by two learners.',
      '   - Name alone             : use for learners who have no roll number yet (typically',
      '                              reserved / admitted). The name must match exactly one learner.',
      '   - First / Last Name are joined before comparison, so it does not matter where you split',
      '     the name. "KAVIN" + "BASKAR U" and "KAVIN BASKAR" + "U" both match the same learner.',
      '   - Case, dots and extra spaces are ignored: "R. Kumar", "R.Kumar" and "r  kumar" all match.',
      '',
      '3. THE "Learners" SHEET:',
      '   - This workbook has a hidden "Learners" sheet listing every learner you have access to,',
      '     with their exact stored spelling. Right-click a sheet tab > Unhide to open it.',
      '   - Its first three columns match this sheet\'s first three columns, so you can copy a',
      '     Roll Number / First Name / Last Name block straight across.',
      '',
      '4. OTHER REQUIRED COLUMNS:',
      '   - Billing Category  : Pick from the dropdown. The dropdown only lists ACTIVE categories.',
      '   - Due Date          : Format yyyy-mm-dd (e.g. 2026-06-01).',
      '   - Billing Amount    : Numeric, in rupees. No commas, no ₹ symbol.',
      '',
      '5. OPTIONAL COLUMNS:',
      '   - Bill Description  : Free text shown on the bill.',
      '   - Remarks           : Free text, internal notes.',
      '   - Academic Year     : Must match an existing academic year name for the learner\'s institution (pick from the dropdown). Leave blank for none/Unspecified.',
      '',
      '6. VALIDATION RULES:',
      '   - Roll Number that matches no learner → row rejected. It is NOT retried as a name.',
      '   - Roll Number matching several learners, with no name to separate them → row rejected.',
      '   - Name that does not match the roll number given → row rejected, and the error report',
      '     shows the name actually on record.',
      '   - Name matching several learners, with no roll number to separate them → row rejected.',
      '   - Billing Category not in the dropdown → row rejected.',
      '   - Due Date unparseable → row rejected.',
      '   - Billing Amount < 0 or non-numeric → row rejected.',
      '   - Anything ambiguous is always rejected, never guessed — an unbilled learner is easy to',
      '     fix, a learner billed by mistake is not.',
      '',
      '7. PARTIAL FAILURES:',
      '   - Valid rows are saved even if some rows fail.',
      '   - The import dialog shows a per-row error report so you can fix the bad rows and re-upload only those.',
      '   - The downloadable report records how each bill was matched (roll, roll+name, or name).',
      '',
      '8. SAMPLE DATA:',
      '   - Rows 2 and 3 are samples — one identified by roll number, one by name only.',
      '   - Replace them with your own data before importing.',
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
