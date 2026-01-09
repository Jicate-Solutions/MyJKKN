// app/api/organizations/programs/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  EXCEL_PROGRAM_TYPES,
  EXCEL_PATTERN_TYPES,
  EXCEL_PART_TIME,
  EXCEL_IS_ACTIVE
} from '@/lib/utils/mappings/program-excel-mappings';

/**
 * GET /api/organizations/programs/template
 *
 * Generates a blank Excel template with 3-level cascading dropdown validation for bulk program creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - 3-level cascading dropdowns:
 *   1. Institution Code (Column A)
 *   2. Degree ID (Column B) - cascades based on Institution
 *   3. Department Code (Column C) - cascades based on Degree
 * - Enum dropdowns for Program Type, Pattern Type, Part Time, Status
 * - Sample row with placeholder data
 * - Instructions sheet
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
      console.error('[programs/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionCodes = institutions?.map((i) => i.counselling_code).filter(Boolean) || [];

    // Fetch degrees with institution info for cascading
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(counselling_code)')
      .eq('is_active', true)
      .order('degree_id');

    if (degreeError) {
      console.error('[programs/template] Error fetching degrees:', degreeError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degreeError.message },
        { status: 500 }
      );
    }

    // Fetch departments with degree info for cascading
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('department_code, department_name, degree_id, degrees!inner(degree_id, institutions!inner(counselling_code))')
      .eq('is_active', true)
      .order('department_code');

    if (deptError) {
      console.error('[programs/template] Error fetching departments:', deptError);
      return NextResponse.json(
        { error: 'Failed to fetch departments', message: deptError.message },
        { status: 500 }
      );
    }

    // Group degrees by institution for cascading dropdown
    const degreesByInstitution = new Map<string, string[]>();
    degrees?.forEach((d: any) => {
      const instCode = d.institutions?.counselling_code;
      if (instCode) {
        if (!degreesByInstitution.has(instCode)) {
          degreesByInstitution.set(instCode, []);
        }
        degreesByInstitution.get(instCode)!.push(d.degree_id);
      }
    });

    // Group departments by degree for cascading dropdown
    const departmentsByDegree = new Map<string, string[]>();
    departments?.forEach((d: any) => {
      const degreeId = d.degrees?.degree_id;
      if (degreeId) {
        if (!departmentsByDegree.has(degreeId)) {
          departmentsByDegree.set(degreeId, []);
        }
        departmentsByDegree.get(degreeId)!.push(d.department_code);
      }
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Programs (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Programs');

    // Define columns
    worksheet.columns = [
      { header: 'Counselling Code', key: 'counselling_code', width: 20 },
      { header: 'Degree ID', key: 'degree_id', width: 20 },
      { header: 'Department Code', key: 'department_code', width: 20 },
      { header: 'Program ID', key: 'program_id', width: 20 },
      { header: 'Program Name', key: 'program_name', width: 40 },
      { header: 'Program Type', key: 'program_type', width: 15 },
      { header: 'Display Name', key: 'display_name', width: 25 },
      { header: 'Program Order', key: 'program_order', width: 15 },
      { header: 'Duration (Years)', key: 'duration', width: 15 },
      { header: 'Pattern Type', key: 'pattern_type', width: 15 },
      { header: 'Part Time', key: 'is_part_time', width: 12 },
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
      fgColor: { argb: 'FF2563EB' }
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 22;

    // Freeze first row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Get sample data for example row
    const sampleInstCode = institutionCodes[0] || 'INST001';
    const sampleDegrees = degreesByInstitution.get(sampleInstCode) || [];
    const sampleDegree = sampleDegrees[0] || degrees?.[0]?.degree_id || 'BTECH';
    const sampleDepts = departmentsByDegree.get(sampleDegree) || [];
    const sampleDept = sampleDepts[0] || departments?.[0]?.department_code || 'CSE';

    // Add sample row
    worksheet.addRow({
      counselling_code: sampleInstCode,
      degree_id: sampleDegree,
      department_code: sampleDept,
      program_id: 'CS01',
      program_name: 'Computer Science and Engineering',
      program_type: 'UG',
      display_name: 'CSE',
      program_order: 1,
      duration: 4,
      pattern_type: 'Semester',
      is_part_time: 'No',
      is_active: 'Active'
    });

    // Style sample row
    worksheet.getRow(2).font = {
      name: 'Arial',
      size: 10,
      color: { argb: 'FF1F2937' }
    };
    worksheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' }
    };
    worksheet.getRow(2).alignment = { vertical: 'middle' };

    // Add note to sample row
    const noteCell = worksheet.getCell('A2');
    noteCell.note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        { font: { size: 9 }, text: 'Replace this row with your actual program data.\nYou can delete this row after adding your data.' }
      ]
    };

    // Apply default font to data cells
    for (let row = 3; row <= 100; row++) {
      worksheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' }
      };
    }

    // ============================================================
    // SHEET 2: Lists (Reference Data for Dropdowns)
    // Structure:
    // Section 1: Institution codes as headers → Degrees below (for degree cascade)
    // Section 2: Degree IDs as headers → Departments below (for department cascade)
    // Section 3: Reference columns (AllInstitutions, Status, Program Type, etc.)
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Get institutions that have degrees
    const institutionsWithDegrees = institutionCodes.filter(code =>
      degreesByInstitution.has(code) && degreesByInstitution.get(code)!.length > 0
    );

    // Get unique degree IDs that have departments
    const degreesWithDepartments = Array.from(departmentsByDegree.keys());

    // Calculate section boundaries
    const section1EndCol = institutionsWithDegrees.length; // Institution → Degree cascade columns
    const section2StartCol = section1EndCol + 1; // Start of Degree → Department cascade
    const section2EndCol = section2StartCol + degreesWithDepartments.length - 1;
    const refStartCol = section2EndCol + 2; // Start of reference columns

    // Build header row
    const headerRow: string[] = [
      ...institutionsWithDegrees, // Section 1: Institution codes
      ...degreesWithDepartments,  // Section 2: Degree IDs
      '', // Separator
      'AllInstitutions',
      'Status',
      'ProgramType',
      'PatternType',
      'PartTime'
    ];
    listsSheet.addRow(headerRow);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Calculate max rows needed for data
    const maxDegreesPerInst = Math.max(
      ...Array.from(degreesByInstitution.values()).map(arr => arr.length),
      1
    );
    const maxDeptsPerDegree = Math.max(
      ...Array.from(departmentsByDegree.values()).map(arr => arr.length),
      1
    );
    const maxRefValues = Math.max(
      institutionCodes.length,
      EXCEL_IS_ACTIVE.length,
      EXCEL_PROGRAM_TYPES.length,
      EXCEL_PATTERN_TYPES.length,
      EXCEL_PART_TIME.length
    );
    const maxDataRows = Math.max(maxDegreesPerInst, maxDeptsPerDegree, maxRefValues);

    // Add data rows
    for (let i = 0; i < maxDataRows; i++) {
      const rowData: string[] = [];

      // Section 1: Degrees for each institution
      institutionsWithDegrees.forEach(instCode => {
        const instDegrees = degreesByInstitution.get(instCode) || [];
        rowData.push(instDegrees[i] || '');
      });

      // Section 2: Departments for each degree
      degreesWithDepartments.forEach(degreeId => {
        const degreeDepts = departmentsByDegree.get(degreeId) || [];
        rowData.push(degreeDepts[i] || '');
      });

      // Separator
      rowData.push('');

      // Reference columns
      rowData.push(institutionCodes[i] || ''); // AllInstitutions
      rowData.push(EXCEL_IS_ACTIVE[i] || ''); // Status
      rowData.push(EXCEL_PROGRAM_TYPES[i] || ''); // ProgramType
      rowData.push(EXCEL_PATTERN_TYPES[i] || ''); // PatternType
      rowData.push(EXCEL_PART_TIME[i] || ''); // PartTime

      listsSheet.addRow(rowData);
    }

    // Set column widths
    const allCols = headerRow.length;
    for (let i = 1; i <= allCols; i++) {
      listsSheet.getColumn(i).width = 15;
    }

    // ============================================================
    // DATA VALIDATION (Dropdowns) - 3-Level Cascading
    // Column A: Institution Code dropdown
    // Column B: Degree ID dropdown (cascades from A)
    // Column C: Department Code dropdown (cascades from B)
    // Column F: Program Type dropdown
    // Column J: Pattern Type dropdown
    // Column K: Part Time dropdown
    // Column L: Is Active dropdown
    // ============================================================

    const validationEndRow = 100;

    // Helper to get column letter
    const getColLetter = (colNum: number): string => {
      let letter = '';
      while (colNum > 0) {
        const rem = (colNum - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colNum = Math.floor((colNum - 1) / 26);
      }
      return letter;
    };

    // Calculate column letters for reference sections
    // Header order: [...institutions, ...degrees, separator, AllInstitutions, Status, ProgramType, PatternType, PartTime]
    // So AllInstitutions is at section2EndCol + 2 (after the separator column)
    const allInstColNum = section2EndCol + 2; // After separator column
    const allInstColLetter = getColLetter(allInstColNum);
    const statusColLetter = getColLetter(allInstColNum + 1);
    const programTypeColLetter = getColLetter(allInstColNum + 2);
    const patternTypeColLetter = getColLetter(allInstColNum + 3);
    const partTimeColLetter = getColLetter(allInstColNum + 4);

    // Section 1 end column letter (for degree OFFSET)
    const section1EndColLetter = getColLetter(section1EndCol);

    // Section 2 range for department OFFSET
    const section2StartColLetter = getColLetter(section2StartCol);
    const section2EndColLetter = getColLetter(section2EndCol);

    // Apply validation cell-by-cell
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

      // Column B: Degree ID dropdown (OFFSET formula cascading from Column A)
      if (institutionsWithDegrees.length > 0) {
        const degreeOffsetFormula = `OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [degreeOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an Institution Code first, then choose a Degree from the dropdown'
        };
      }

      // Column C: Department Code dropdown (OFFSET formula cascading from Column B)
      if (degreesWithDepartments.length > 0) {
        const deptOffsetFormula = `OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [deptOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select a Degree ID first, then choose a Department from the dropdown'
        };
      }

      // Column F: Program Type dropdown
      worksheet.getCell(`F${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${programTypeColLetter}$2:$${programTypeColLetter}$${EXCEL_PROGRAM_TYPES.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_PROGRAM_TYPES.join(', ')}`
      };

      // Column J: Pattern Type dropdown
      worksheet.getCell(`J${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${patternTypeColLetter}$2:$${patternTypeColLetter}$${EXCEL_PATTERN_TYPES.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_PATTERN_TYPES.join(', ')}`
      };

      // Column K: Part Time dropdown
      worksheet.getCell(`K${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${partTimeColLetter}$2:$${partTimeColLetter}$${EXCEL_PART_TIME.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_PART_TIME.join(', ')}`
      };

      // Column L: Is Active dropdown
      worksheet.getCell(`L${row}`).dataValidation = {
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
    // INSTRUCTIONS SHEET
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK PROGRAM IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Counselling Code: Select from dropdown (existing institution)',
      '   - Degree ID: Select from CASCADING dropdown (filters based on Institution)',
      '   - Department Code: Select from CASCADING dropdown (filters based on Degree)',
      '   - Program ID: Unique program identifier (e.g., "CS01", "ME01")',
      '   - Program Name: Full program name (e.g., "Computer Science and Engineering")',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Program Type: UG, PG, or Ph.D (dropdown)',
      '   - Display Name: Short display name',
      '   - Program Order: Numeric order for sorting',
      '   - Duration (Years): Program duration in years (decimal allowed)',
      '   - Pattern Type: Year or Semester (dropdown)',
      '   - Part Time: Yes or No (dropdown)',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '',
      '3. CASCADING DROPDOWN BEHAVIOR (3-LEVEL):',
      '   - Step 1: Select Counselling Code (Column A) FIRST',
      '   - Step 2: Select Degree ID (Column B) - shows ONLY degrees for that institution',
      '   - Step 3: Select Department Code (Column C) - shows ONLY departments for that degree',
      '   - If you change a parent selection, you MUST re-select child values',
      '',
      '4. DATA VALIDATION:',
      '   - Counselling Code, Degree ID, Department Code: CASCADING dropdowns',
      '   - Program Type, Pattern Type, Part Time, Is Active: Fixed dropdowns',
      '   - NEVER type values manually - always use dropdowns',
      '',
      '5. FORMATTING:',
      '   - Program ID: Alphanumeric code (e.g., CS01, ME01)',
      '   - Duration: Decimal allowed (e.g., 4, 2.5, 3)',
      '   - Program Order: Integer value (e.g., 1, 2, 3)',
      '',
      '6. IMPORTANT NOTES:',
      '   - Program IDs must be unique within each department',
      '   - Follow the cascade order: Institution → Degree → Department',
      '   - The cascading dropdowns ensure valid hierarchy combinations',
      '',
      '7. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '8. IMPORT PROCESS:',
      '   - Fill in all required columns following the cascade order',
      '   - Save the file',
      '   - Upload via the Import button in the Programs page',
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

    // Hide Lists sheet
    listsSheet.state = 'hidden';

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=programs-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/programs/template] Error:', error);
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
