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


    // Fetch institutions for cascading dropdown
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, counselling_code, name')
      .eq('is_active', true)
      .order('name');

    if (instError) {
      console.error('[departments/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionNames = institutions?.map((i) => i.name).filter(Boolean) || [];

    // Fetch degrees for cascading dropdown - using degree names with institution info
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(name)')
      .eq('is_active', true)
      .order('degree_name');

    if (degreeError) {
      console.error('[departments/template] Error fetching degrees:', degreeError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degreeError.message },
        { status: 500 }
      );
    }

    // Group degrees by institution name for cascading dropdown (deduplicated)
    const institutionDegreeMap = new Map<string, string[]>();
    degrees?.forEach((deg: any) => {
      const instName = deg.institutions?.name;
      const degreeName = deg.degree_name;
      if (instName && degreeName) {
        if (!institutionDegreeMap.has(instName)) {
          institutionDegreeMap.set(instName, []);
        }
        // Deduplicate: only add if not already present
        const existingDegrees = institutionDegreeMap.get(instName)!;
        if (!existingDegrees.includes(degreeName)) {
          existingDegrees.push(degreeName);
        }
      }
    });

    const degreeNames = degrees?.map((d) => d.degree_name).filter(Boolean) || [];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Departments (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Departments');

    // Define columns - Full hierarchy: Institution → Degree → Department
    worksheet.columns = [
      { header: 'Institution Name', key: 'institution_name', width: 40 },
      { header: 'Degree Name', key: 'degree_name', width: 40 },
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
    const sampleInstitution = institutionNames[0] || institutions?.[0]?.name || 'JKKN College of Engineering and Technology';
    const sampleDegreeName = degreeNames[0] || degrees?.[0]?.degree_name || 'Bachelor of Technology';

    worksheet.addRow({
      institution_name: sampleInstitution,
      degree_name: sampleDegreeName,
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
    // SHEET 2: Lists (Reference Data for Cascading Dropdowns)
    // Structure: Section 1 (Institution → Degree cascade) + Reference columns
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Section 1: Institution names as headers with their degrees below (for cascading)
    const institutionsWithDegrees = Array.from(institutionDegreeMap.keys()).filter(
      (instName) => institutionDegreeMap.get(instName)!.length > 0
    );

    // Calculate section boundaries
    const section1EndCol = institutionsWithDegrees.length;
    const refStartCol = section1EndCol + 2; // +2 for separator column

    // Build header row: [Inst1, Inst2, Inst3, '', AllInstitutions, IsActive]
    const headerRow: string[] = [
      ...institutionsWithDegrees, // Institution NAMES as headers
      '', // Separator
      'AllInstitutions', // Reference column for Institution dropdown
      'IsActive' // Reference column for Status dropdown
    ];

    listsSheet.addRow(headerRow);

    // Style header row
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Add data rows: degrees under their institutions + reference columns
    const maxDataRows = Math.max(
      ...Array.from(institutionDegreeMap.values()).map((degs) => degs.length),
      institutionNames.length,
      EXCEL_IS_ACTIVE.length
    );

    for (let i = 0; i < maxDataRows; i++) {
      const row: (string | null)[] = [];

      // Section 1: Degrees grouped by institution (for cascading)
      institutionsWithDegrees.forEach((instName) => {
        const degrees = institutionDegreeMap.get(instName) || [];
        row.push(degrees[i] || null);
      });

      // Separator
      row.push(null);

      // Reference columns
      row.push(institutionNames[i] || null); // AllInstitutions
      row.push(EXCEL_IS_ACTIVE[i] || null); // IsActive

      listsSheet.addRow(row);
    }

    // Auto-fit columns in Lists sheet
    const columnWidths = [
      ...institutionsWithDegrees.map(() => ({ width: 40 })),
      { width: 5 }, // Separator
      { width: 40 }, // AllInstitutions
      { width: 12 } // IsActive
    ];
    listsSheet.columns = columnWidths;

    // ============================================================
    // DATA VALIDATION (Dropdowns) - Cascading dropdowns with Lists sheet references
    // Column A: Institution Name dropdown (references AllInstitutions column)
    // Column B: Degree Name dropdown (OFFSET formula cascading from Column A)
    // Column G: Is Active dropdown (references IsActive column)
    // ============================================================

    // Helper function to convert column number to letter (A, B, C, ..., Z, AA, AB, ...)
    const getColLetter = (colNum: number): string => {
      let letter = '';
      while (colNum > 0) {
        const rem = (colNum - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colNum = Math.floor((colNum - 1) / 26);
      }
      return letter;
    };

    // Define validation end row (limited to 100 to prevent XML bloat)
    const validationEndRow = 100;

    // Calculate column letters for Lists sheet
    const section1EndColLetter = getColLetter(section1EndCol);
    const allInstColNum = refStartCol; // AllInstitutions column number
    const isActiveColNum = refStartCol + 1; // IsActive column number
    const allInstColLetter = getColLetter(allInstColNum);
    const isActiveColLetter = getColLetter(isActiveColNum);

    // Apply validation cell-by-cell using Lists sheet references and OFFSET formulas
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Institution Name dropdown - references AllInstitutions column (Lists!refStartCol)
      if (institutionNames.length > 0) {
        worksheet.getCell(`A${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${allInstColLetter}$2:$${allInstColLetter}$${institutionNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an Institution Name from the dropdown'
        };
      }

      // Column B: Degree Name dropdown - OFFSET formula cascading from Column A (Institution Name)
      if (institutionsWithDegrees.length > 0) {
        const degreeOffsetFormula = `OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [degreeOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an Institution Name first, then choose a Degree Name from the dropdown'
        };
      }

      // Column G: Is Active dropdown - references IsActive column
      worksheet.getCell(`G${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${isActiveColLetter}$2:$${isActiveColLetter}$${EXCEL_IS_ACTIVE.length + 1}`],
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
      '   - Institution Name: Select from dropdown (existing institution)',
      '   - Degree Name: Select from cascading dropdown (filtered by institution)',
      '   - Department Code: Unique department identifier (uppercase letters, numbers)',
      '   - Department Name: Full department name (e.g., "Computer Science and Engineering")',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Display Name: Short display name (e.g., "CSE")',
      '   - Department Order: Numeric order for sorting (optional)',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '',
      '3. CASCADING DROPDOWNS:',
      '   - STEP 1: Select Institution Name (Column A) from the dropdown',
      '   - STEP 2: Select Degree Name (Column B) - dropdown will show degrees for selected institution',
      '   - The Degree dropdown automatically filters based on your Institution selection',
      '   - You MUST select Institution Name first before selecting Degree Name',
      '',
      '4. DATA VALIDATION:',
      '   - Institution Name has dropdown: ALWAYS use dropdown to select',
      '   - Degree Name has cascading dropdown: Select Institution first, then Degree',
      '   - Is Active has dropdown: Use dropdown to select Active or Inactive',
      '   - NEVER type values manually - always use dropdowns',
      '',
      '5. FORMATTING:',
      '   - Institution Name: Select from dropdown (no manual typing)',
      '   - Degree Name: Select from cascading dropdown (filters by institution)',
      '   - Department Code: Uppercase with no spaces (e.g., CSE, ECE, MECH)',
      '   - Department Order: Numeric value (e.g., 1, 2, 3)',
      '',
      '6. IMPORTANT NOTES:',
      '   - Department codes must be unique within each degree',
      '   - The hierarchy is: Institution → Degree → Department',
      '   - Select dropdowns in order: Institution first, then Degree',
      '',
      '7. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '8. IMPORT PROCESS:',
      '   - Select Institution Name (Column A) from the dropdown',
      '   - Select Degree Name (Column B) from the cascading dropdown',
      '   - Fill in Department Code, Name, and other fields',
      '   - Save the file',
      '   - Upload via the Import button in the Departments page',
      '',
      '9. TIPS:',
      '   - Department codes must be unique within each degree',
      '   - Use meaningful department codes for easy identification',
      '   - Department order helps sort departments in lists',
      '   - If Degree dropdown is empty, check that you selected an Institution first',
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
