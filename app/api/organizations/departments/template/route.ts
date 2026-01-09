// app/api/organizations/departments/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { EXCEL_IS_ACTIVE } from '@/lib/utils/mappings/department-excel-mappings';

/**
 * GET /api/organizations/departments/template
 *
 * Generates a blank Excel template with dropdown validation for bulk department creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - Dropdown validation for Counselling Code, Degree ID, and Status
 * - Lists sheet with reference data
 * - Sample row with placeholder data for guidance
 * - Frozen header row
 * - Professional styling
 */
export async function GET(request: NextRequest) {
  try {
    // Initialize Supabase client
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

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch institutions for dropdown
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('counselling_code, name')
      .eq('is_active', true)
      .order('counselling_code');

    if (instError) {
      console.error('[departments/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionCodes = institutions?.map((i) => i.counselling_code).filter(Boolean) || [];

    // Fetch degrees for dropdown
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(counselling_code)')
      .eq('is_active', true)
      .order('degree_id');

    if (degreeError) {
      console.error('[departments/template] Error fetching degrees:', degreeError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degreeError.message },
        { status: 500 }
      );
    }

    // Group degrees by institution for cascading dropdown
    const degreesByInstitution = new Map<string, string[]>();
    degrees?.forEach((d: any) => {
      const instCode = d.institutions.counselling_code;
      if (!degreesByInstitution.has(instCode)) {
        degreesByInstitution.set(instCode, []);
      }
      degreesByInstitution.get(instCode)!.push(d.degree_id);
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Departments (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Departments');

    // Define columns
    worksheet.columns = [
      { header: 'Counselling Code', key: 'counselling_code', width: 20 },
      { header: 'Degree ID', key: 'degree_id', width: 25 },
      { header: 'Department Code', key: 'department_code', width: 20 },
      { header: 'Department Name', key: 'department_name', width: 40 },
      { header: 'Display Name', key: 'display_name', width: 30 },
      { header: 'Department Order', key: 'department_order', width: 18 },
      { header: 'Is Active', key: 'is_active', width: 12 }
    ];

    // Add formatting to headers - Professional blue header with white text
    worksheet.getRow(1).font = {
      bold: true,
      size: 11,
      name: 'Arial',
      color: { argb: 'FFFFFFFF' }
    };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' } // Modern blue color
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 22;

    // Freeze first row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Add sample row with placeholder data for guidance
    // Use first institution and its first degree for consistency
    const sampleInstCode = institutionCodes[0] || 'COUNS001';
    const sampleDegrees = degreesByInstitution.get(sampleInstCode) || [];
    const sampleDegree = sampleDegrees[0] || degrees?.[0]?.degree_id || 'BTECH';

    worksheet.addRow({
      counselling_code: sampleInstCode,
      degree_id: sampleDegree,
      department_code: 'CSE',
      department_name: 'Computer Science and Engineering',
      display_name: 'CSE',
      department_order: 1,
      is_active: 'Active'
    });

    // Style sample row - Dark text with light yellow background to indicate example
    worksheet.getRow(2).font = {
      name: 'Arial',
      size: 10,
      color: { argb: 'FF1F2937' } // Dark gray text (readable)
    };
    worksheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' } // Light yellow background
    };
    worksheet.getRow(2).alignment = { vertical: 'middle' };

    // Add a note cell to indicate this is sample data
    const noteCell = worksheet.getCell('A2');
    noteCell.note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        { font: { size: 9 }, text: 'Replace this row with your actual department data.\nYou can delete this row after adding your data.' }
      ]
    };

    // Apply default font to all data cells (rows 3+)
    for (let row = 3; row <= 100; row++) {
      worksheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' } // Dark readable text
      };
    }

    // ============================================================
    // SHEET 2: Lists (Reference Data for Dropdowns)
    // Structure for cascading dropdown:
    // Row 1: Institution codes as headers
    // Row 2+: Degrees for each institution in their column
    // Last columns: Status values
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Get sorted institution codes that have degrees
    const institutionsWithDegrees = institutionCodes.filter(code =>
      degreesByInstitution.has(code) && degreesByInstitution.get(code)!.length > 0
    );

    // Build header row: Institution codes + Status column
    const headerRow = [...institutionsWithDegrees, 'Status'];
    listsSheet.addRow(headerRow);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Find max degrees count for any institution
    const maxDegrees = Math.max(
      ...Array.from(degreesByInstitution.values()).map(arr => arr.length),
      EXCEL_IS_ACTIVE.length
    );

    // Add data rows: degrees for each institution + status values
    for (let i = 0; i < maxDegrees; i++) {
      const rowData: string[] = [];

      // Add degree for each institution
      institutionsWithDegrees.forEach(instCode => {
        const instDegrees = degreesByInstitution.get(instCode) || [];
        rowData.push(instDegrees[i] || '');
      });

      // Add status value
      rowData.push(EXCEL_IS_ACTIVE[i] || '');

      listsSheet.addRow(rowData);
    }

    // Set column widths
    const columnWidths: { width: number }[] = [];
    institutionsWithDegrees.forEach(() => columnWidths.push({ width: 15 }));
    columnWidths.push({ width: 12 }); // Status column
    listsSheet.columns = columnWidths;

    // Also add a separate column for ALL institution codes (for Column A dropdown)
    // This goes in a new column after the status column
    const allInstCodesColIndex = institutionsWithDegrees.length + 2; // +2 for 1-based and status column
    listsSheet.getCell(1, allInstCodesColIndex).value = 'AllInstitutions';
    listsSheet.getCell(1, allInstCodesColIndex).font = { bold: true, name: 'Arial', size: 10 };
    for (let i = 0; i < institutionCodes.length; i++) {
      listsSheet.getCell(i + 2, allInstCodesColIndex).value = institutionCodes[i];
    }
    listsSheet.getColumn(allInstCodesColIndex).width = 20;

    // ============================================================
    // DATA VALIDATION (Dropdowns) - Cascading with OFFSET formula
    // Column A: Institution Code dropdown
    // Column B: Degree ID dropdown (cascades based on Column A selection)
    // Column G: Status dropdown
    // ============================================================

    // Define validation end row (limited to 100 to prevent XML bloat)
    const validationEndRow = 100;

    // Get column letter for AllInstitutions column in Lists sheet
    const allInstColLetter = String.fromCharCode(64 + allInstCodesColIndex); // A=65, so +64 for 1-based

    // Get column letter for Status column in Lists sheet
    const statusColIndex = institutionsWithDegrees.length + 1;
    const statusColLetter = String.fromCharCode(64 + statusColIndex);

    // Apply validation cell-by-cell (ExcelJS requires this approach)
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Counselling Code dropdown (uses AllInstitutions column)
      if (institutionCodes.length > 0) {
        worksheet.getCell(`A${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${allInstColLetter}$2:$${allInstColLetter}$${institutionCodes.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an institution from the dropdown'
        };
      }

      // Column B: Degree ID dropdown (OFFSET formula for cascading)
      // Formula: =OFFSET(Lists!$A$1,1,MATCH(A2,Lists!$1:$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A2,Lists!$1:$1,0)-1,100,1)),1)
      // This finds the column matching the institution code and returns all degrees in that column
      if (institutionsWithDegrees.length > 0) {
        const offsetFormula = `OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$1:$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$1:$1,0)-1,100,1)),1)`;

        worksheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [offsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an Institution Code first, then choose a Degree from the dropdown'
        };
      }

      // Column G: Is Active dropdown (uses Status column)
      worksheet.getCell(`G${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${statusColLetter}$2:$${statusColLetter}$${EXCEL_IS_ACTIVE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_IS_ACTIVE.join(', ')}`
      };
    }

    // ============================================================
    // INSTRUCTIONS SHEET (Optional)
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');

    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK DEPARTMENT IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Counselling Code: Select from dropdown (existing institution)',
      '   - Degree ID: Select from CASCADING dropdown (filters based on Institution)',
      '   - Department Code: Unique department identifier (uppercase letters, numbers)',
      '   - Department Name: Full department name (e.g., "Computer Science and Engineering")',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Display Name: Short display name (e.g., "CSE")',
      '   - Department Order: Numeric order for sorting (optional)',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '',
      '3. CASCADING DROPDOWN BEHAVIOR (IMPORTANT):',
      '   - Step 1: Select Counselling Code (Column A) FIRST',
      '   - Step 2: Click on Degree ID (Column B) - dropdown shows ONLY degrees for that institution',
      '   - If you change Counselling Code, you MUST re-select Degree ID',
      '   - Degree dropdown will show error until you select a valid Counselling Code',
      '',
      '4. DATA VALIDATION:',
      '   - Counselling Code has dropdown: ALWAYS use dropdown to select',
      '   - Degree ID has CASCADING dropdown: Shows only degrees for selected institution',
      '   - Is Active has dropdown: Use dropdown to select Active or Inactive',
      '   - NEVER type values manually - always use dropdowns',
      '',
      '5. FORMATTING:',
      '   - Counselling Code: Select from dropdown (no manual typing)',
      '   - Degree ID: Select from dropdown (only shows degrees for your institution)',
      '   - Department Code: Uppercase with no spaces (e.g., CSE, ECE, MECH)',
      '   - Department Order: Numeric value (e.g., 1, 2, 3)',
      '',
      '6. IMPORTANT NOTES:',
      '   - ALWAYS select Counselling Code before Degree ID',
      '   - Department codes must be unique within each degree',
      '   - The cascading dropdown ensures valid degree-institution combinations',
      '',
      '7. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '8. IMPORT PROCESS:',
      '   - Select Counselling Code (Column A) first',
      '   - Select Degree ID (Column B) from the filtered dropdown',
      '   - Fill in Department Code, Name, and other fields',
      '   - Save the file',
      '   - Upload via the Import button in the Departments page',
      '',
      '9. TIPS:',
      '   - Department codes must be unique within each degree',
      '   - If Degree dropdown shows error, verify you selected a Counselling Code first',
      '   - Department order helps sort departments in lists',
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

    // ============================================================
    // HIDE LISTS SHEET (Recommended)
    // ============================================================
    listsSheet.state = 'hidden';

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=departments-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/departments/template] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to generate template',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}
