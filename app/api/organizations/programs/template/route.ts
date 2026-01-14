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

    // Fetch institutions for 3-level cascading dropdown
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, counselling_code, name')
      .eq('is_active', true)
      .order('name');

    if (instError) {
      console.error('[programs/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionNames = institutions?.map((i) => i.name).filter(Boolean) || [];

    // Fetch degrees with institution info for cascading
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(name)')
      .eq('is_active', true)
      .order('degree_name');

    if (degreeError) {
      console.error('[programs/template] Error fetching degrees:', degreeError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degreeError.message },
        { status: 500 }
      );
    }

    // Group degrees by institution name (Institution → Degree) - deduplicated
    const institutionDegreeMap = new Map<string, string[]>();
    degrees?.forEach((deg: any) => {
      const instName = deg.institutions?.name;
      const degreeName = deg.degree_name;
      if (instName && degreeName) {
        if (!institutionDegreeMap.has(instName)) {
          institutionDegreeMap.set(instName, []);
        }
        // Deduplicate
        const existing = institutionDegreeMap.get(instName)!;
        if (!existing.includes(degreeName)) {
          existing.push(degreeName);
        }
      }
    });

    // Fetch departments with degree AND institution info for cascading
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('department_code, department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name))')
      .eq('is_active', true)
      .order('department_name');

    if (deptError) {
      console.error('[programs/template] Error fetching departments:', deptError);
      return NextResponse.json(
        { error: 'Failed to fetch departments', message: deptError.message },
        { status: 500 }
      );
    }

    // Group departments by COMPOSITE KEY (Institution|Degree) - deduplicated
    // This ensures departments are institution-specific
    const degreeDepartmentMap = new Map<string, string[]>();
    departments?.forEach((dept: any) => {
      const degreeName = dept.degrees?.degree_name;
      const instName = dept.degrees?.institutions?.name;
      const deptName = dept.department_name;
      if (degreeName && instName && deptName) {
        const compositeKey = `${instName}|${degreeName}`;
        if (!degreeDepartmentMap.has(compositeKey)) {
          degreeDepartmentMap.set(compositeKey, []);
        }
        // Deduplicate
        const existing = degreeDepartmentMap.get(compositeKey)!;
        if (!existing.includes(deptName)) {
          existing.push(deptName);
        }
      }
    });

    const departmentNames = departments?.map((d) => d.department_name).filter(Boolean) || [];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Programs (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Programs');

    // Define columns - Full 3-level hierarchy: Institution → Degree → Department → Program
    worksheet.columns = [
      { header: 'Institution Name', key: 'institution_name', width: 40 },
      { header: 'Degree Name', key: 'degree_name', width: 40 },
      { header: 'Department Name', key: 'department_name', width: 40 },
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
    const sampleInstitution = institutionNames[0] || institutions?.[0]?.name || 'JKKN College of Engineering and Technology';
    const sampleDegree = degrees?.[0]?.degree_name || 'Bachelor of Technology';
    const sampleDept = departmentNames[0] || departments?.[0]?.department_name || 'Computer Science and Engineering';

    // Add sample row
    worksheet.addRow({
      institution_name: sampleInstitution,
      degree_name: sampleDegree,
      department_name: sampleDept,
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
    // SHEET 2: Lists (Reference Data for 3-Level Cascading Dropdowns)
    // Structure: Section 1 (Institution → Degree) + Section 2 (Degree → Department) + Reference columns
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Section 1: Institution names as headers with their degrees below (Institution → Degree)
    const institutionsWithDegrees = Array.from(institutionDegreeMap.keys()).filter(
      (instName) => institutionDegreeMap.get(instName)!.length > 0
    );

    // Section 2: Degree names as headers with their departments below (Degree → Department)
    const degreesWithDepartments = Array.from(degreeDepartmentMap.keys()).filter(
      (degreeName) => degreeDepartmentMap.get(degreeName)!.length > 0
    );

    // Calculate section boundaries
    const section1EndCol = institutionsWithDegrees.length;
    const section2StartCol = section1EndCol + 2; // +2 for separator column
    const section2EndCol = section2StartCol + degreesWithDepartments.length - 1;
    const refStartCol = section2EndCol + 2; // +2 for separator column

    // Build header row: [Inst1, Inst2, '', Deg1, Deg2, '', AllInstitutions, ProgramType, PatternType, PartTime, IsActive]
    const headerRow: string[] = [
      ...institutionsWithDegrees, // Section 1: Institution NAMES
      '', // Separator
      ...degreesWithDepartments, // Section 2: Degree NAMES
      '', // Separator
      'AllInstitutions', // Reference columns
      'ProgramType',
      'PatternType',
      'PartTime',
      'IsActive'
    ];

    listsSheet.addRow(headerRow);

    // Style header row
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Add data rows: degrees under institutions + departments under degrees + reference columns
    const maxDataRows = Math.max(
      ...Array.from(institutionDegreeMap.values()).map((degs) => degs.length),
      ...Array.from(degreeDepartmentMap.values()).map((depts) => depts.length),
      institutionNames.length,
      EXCEL_PROGRAM_TYPES.length,
      EXCEL_PATTERN_TYPES.length,
      EXCEL_PART_TIME.length,
      EXCEL_IS_ACTIVE.length
    );

    for (let i = 0; i < maxDataRows; i++) {
      const rowData: (string | null)[] = [];

      // Section 1: Degrees grouped by institution (for Institution → Degree cascading)
      institutionsWithDegrees.forEach((instName) => {
        const degrees = institutionDegreeMap.get(instName) || [];
        rowData.push(degrees[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 2: Departments grouped by degree (for Degree → Department cascading)
      degreesWithDepartments.forEach((compositeKey) => {
        const depts = degreeDepartmentMap.get(compositeKey) || [];
        rowData.push(depts[i] || null);
      });

      // Separator
      rowData.push(null);

      // Reference columns
      rowData.push(institutionNames[i] || null); // AllInstitutions
      rowData.push(EXCEL_PROGRAM_TYPES[i] || null); // ProgramType
      rowData.push(EXCEL_PATTERN_TYPES[i] || null); // PatternType
      rowData.push(EXCEL_PART_TIME[i] || null); // PartTime
      rowData.push(EXCEL_IS_ACTIVE[i] || null); // IsActive

      listsSheet.addRow(rowData);
    }

    // Auto-fit columns in Lists sheet
    const columnWidths = [
      ...institutionsWithDegrees.map(() => ({ width: 40 })),
      { width: 5 }, // Separator
      ...degreesWithDepartments.map(() => ({ width: 40 })),
      { width: 5 }, // Separator
      { width: 40 }, // AllInstitutions
      { width: 15 }, // ProgramType
      { width: 15 }, // PatternType
      { width: 12 }, // PartTime
      { width: 12 } // IsActive
    ];
    listsSheet.columns = columnWidths;

    // ============================================================
    // DATA VALIDATION (Dropdowns) - 3-Level Cascading Dropdowns with Lists sheet references
    // Column A: Institution Name dropdown (references AllInstitutions)
    // Column B: Degree Name dropdown (OFFSET formula cascading from Institution)
    // Column C: Department Name dropdown (OFFSET formula cascading from Degree)
    // Column F: Program Type dropdown
    // Column J: Pattern Type dropdown
    // Column K: Part Time dropdown
    // Column L: Is Active dropdown
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

    const validationEndRow = 100;

    // Calculate column letters for Lists sheet
    const section1EndColLetter = getColLetter(section1EndCol);
    const section2StartColLetter = getColLetter(section2StartCol);
    const section2EndColLetter = getColLetter(section2EndCol);

    const allInstColNum = refStartCol; // AllInstitutions column
    const programTypeColNum = refStartCol + 1; // ProgramType column
    const patternTypeColNum = refStartCol + 2; // PatternType column
    const partTimeColNum = refStartCol + 3; // PartTime column
    const isActiveColNum = refStartCol + 4; // IsActive column

    const allInstColLetter = getColLetter(allInstColNum);
    const programTypeColLetter = getColLetter(programTypeColNum);
    const patternTypeColLetter = getColLetter(patternTypeColNum);
    const partTimeColLetter = getColLetter(partTimeColNum);
    const isActiveColLetter = getColLetter(isActiveColNum);

    // Apply validation cell-by-cell using Lists sheet references and OFFSET formulas
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Institution Name dropdown - references AllInstitutions column
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

      // Column B: Degree Name dropdown - OFFSET formula cascading from Column A (Institution)
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

      // Column C: Department Name dropdown - OFFSET formula cascading from Column A+B (Institution|Degree composite key)
      if (degreesWithDepartments.length > 0) {
        // Use composite key concatenation: Institution|Degree to match section 2 headers
        const departmentOffsetFormula = `OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(A${row}&"|"&B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(A${row}&"|"&B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [departmentOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select a Degree Name first, then choose a Department Name from the dropdown'
        };
      }

      // Column F: Program Type dropdown - references ProgramType column
      worksheet.getCell(`F${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${programTypeColLetter}$2:$${programTypeColLetter}$${EXCEL_PROGRAM_TYPES.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_PROGRAM_TYPES.join(', ')}`
      };

      // Column J: Pattern Type dropdown - references PatternType column
      worksheet.getCell(`J${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${patternTypeColLetter}$2:$${patternTypeColLetter}$${EXCEL_PATTERN_TYPES.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_PATTERN_TYPES.join(', ')}`
      };

      // Column K: Part Time dropdown - references PartTime column
      worksheet.getCell(`K${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${partTimeColLetter}$2:$${partTimeColLetter}$${EXCEL_PART_TIME.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_PART_TIME.join(', ')}`
      };

      // Column L: Is Active dropdown - references IsActive column
      worksheet.getCell(`L${row}`).dataValidation = {
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
    // INSTRUCTIONS SHEET
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK PROGRAM IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Institution Name: Select from dropdown (existing institution)',
      '   - Degree Name: Select from cascading dropdown (filtered by institution)',
      '   - Department Name: Select from cascading dropdown (filtered by degree)',
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
      '3. 3-LEVEL CASCADING DROPDOWNS:',
      '   - STEP 1: Select Institution Name (Column A) from the dropdown',
      '   - STEP 2: Select Degree Name (Column B) - dropdown will show degrees for selected institution',
      '   - STEP 3: Select Department Name (Column C) - dropdown will show departments for selected degree',
      '   - The dropdowns automatically filter based on your previous selections',
      '   - You MUST select in order: Institution → Degree → Department',
      '',
      '4. DATA VALIDATION:',
      '   - Institution Name has dropdown: ALWAYS use dropdown to select',
      '   - Degree Name has cascading dropdown: Select Institution first, then Degree',
      '   - Department Name has cascading dropdown: Select Degree first, then Department',
      '   - Program Type, Pattern Type, Part Time, Is Active: Use dropdowns to select',
      '   - NEVER type values manually - always use dropdowns',
      '',
      '5. FORMATTING:',
      '   - Institution Name: Select from dropdown (no manual typing)',
      '   - Degree Name: Select from cascading dropdown (filters by institution)',
      '   - Department Name: Select from cascading dropdown (filters by degree)',
      '   - Program ID: Alphanumeric code (e.g., CS01, ME01)',
      '   - Duration: Decimal allowed (e.g., 4, 2.5, 3)',
      '   - Program Order: Integer value (e.g., 1, 2, 3)',
      '',
      '6. IMPORTANT NOTES:',
      '   - Program IDs must be unique within each department',
      '   - The hierarchy is: Institution → Degree → Department → Program',
      '   - Select dropdowns in order: Institution first, then Degree, then Department',
      '',
      '7. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '8. IMPORT PROCESS:',
      '   - Select Institution Name (Column A) from the dropdown',
      '   - Select Degree Name (Column B) from the cascading dropdown',
      '   - Select Department Name (Column C) from the cascading dropdown',
      '   - Fill in Program ID, Name, and other fields',
      '   - Save the file',
      '   - Upload via the Import button in the Programs page',
      '',
      '9. TIPS:',
      '   - Program IDs must be unique within each department',
      '   - Use meaningful program IDs for easy identification',
      '   - Program order helps sort programs in lists',
      '   - If Degree dropdown is empty, check that you selected an Institution first',
      '   - If Department dropdown is empty, check that you selected a Degree first',
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
