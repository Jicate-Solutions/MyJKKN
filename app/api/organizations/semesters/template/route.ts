// app/api/organizations/semesters/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  EXCEL_SEMESTER_TYPES,
  EXCEL_IS_ACTIVE,
  EXCEL_YES_NO
} from '@/lib/utils/mappings/semester-excel-mappings';

/**
 * GET /api/organizations/semesters/template
 *
 * Generates a blank Excel template with 4-level cascading dropdown validation for bulk semester creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - 4-level cascading dropdowns:
 *   1. Institution Code (Column A)
 *   2. Degree ID (Column B) - cascades based on Institution
 *   3. Department Code (Column C) - cascades based on Degree
 *   4. Program ID (Column D) - cascades based on Department
 * - Enum dropdowns for Semester Type, Status, Yes/No fields
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
      .order('name');

    if (instError) {
      console.error('[semesters/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionNames = institutions?.map((i) => i.name).filter(Boolean) || [];

    // Fetch degrees with institution info for cascading
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(counselling_code, name)')
      .eq('is_active', true)
      .order('degree_name');

    if (degreeError) {
      console.error('[semesters/template] Error fetching degrees:', degreeError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degreeError.message },
        { status: 500 }
      );
    }

    // Fetch departments with degree AND institution info for cascading
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('department_code, department_name, degree_id, degrees!inner(degree_id, degree_name, institution_id, institutions!inner(name))')
      .eq('is_active', true)
      .order('department_name');

    if (deptError) {
      console.error('[semesters/template] Error fetching departments:', deptError);
      return NextResponse.json(
        { error: 'Failed to fetch departments', message: deptError.message },
        { status: 500 }
      );
    }

    // Fetch programs with department, degree AND institution info for cascading
    const { data: programs, error: progError } = await supabase
      .from('programs')
      .select('program_id, program_name, department_id, departments!inner(department_code, department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name)))')
      .eq('is_active', true)
      .order('program_name');

    if (progError) {
      console.error('[semesters/template] Error fetching programs:', progError);
      return NextResponse.json(
        { error: 'Failed to fetch programs', message: progError.message },
        { status: 500 }
      );
    }

    // Group degrees by institution NAME for cascading dropdown (deduplicated)
    const degreesByInstitution = new Map<string, string[]>();
    degrees?.forEach((d: any) => {
      const instName = d.institutions?.name;
      const degreeName = d.degree_name;
      if (instName && degreeName) {
        if (!degreesByInstitution.has(instName)) {
          degreesByInstitution.set(instName, []);
        }
        // Deduplicate
        const existing = degreesByInstitution.get(instName)!;
        if (!existing.includes(degreeName)) {
          existing.push(degreeName);
        }
      }
    });

    // Group departments by COMPOSITE KEY (Institution|Degree) for cascading dropdown (deduplicated)
    const departmentsByDegree = new Map<string, string[]>();
    departments?.forEach((d: any) => {
      const degreeName = d.degrees?.degree_name;
      const instName = d.degrees?.institutions?.name;
      const deptName = d.department_name;
      if (degreeName && instName && deptName) {
        const compositeKey = `${instName}|${degreeName}`;
        if (!departmentsByDegree.has(compositeKey)) {
          departmentsByDegree.set(compositeKey, []);
        }
        // Deduplicate
        const existing = departmentsByDegree.get(compositeKey)!;
        if (!existing.includes(deptName)) {
          existing.push(deptName);
        }
      }
    });

    // Group programs by COMPOSITE KEY (Institution|Degree|Department) for cascading dropdown (deduplicated)
    const programsByDepartment = new Map<string, string[]>();
    programs?.forEach((p: any) => {
      const deptName = p.departments?.department_name;
      const degreeName = p.departments?.degrees?.degree_name;
      const instName = p.departments?.degrees?.institutions?.name;
      const progName = p.program_name;
      if (deptName && degreeName && instName && progName) {
        const compositeKey = `${instName}|${degreeName}|${deptName}`;
        if (!programsByDepartment.has(compositeKey)) {
          programsByDepartment.set(compositeKey, []);
        }
        // Deduplicate
        const existing = programsByDepartment.get(compositeKey)!;
        if (!existing.includes(progName)) {
          existing.push(progName);
        }
      }
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Semesters (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Semesters');

    // Define columns - Using NAMES for user-friendliness
    worksheet.columns = [
      { header: 'Institution Name', key: 'institution_name', width: 40 },
      { header: 'Degree Name', key: 'degree_name', width: 40 },
      { header: 'Department Name', key: 'department_name', width: 40 },
      { header: 'Program Name', key: 'program_name', width: 40 },
      { header: 'Semester Code', key: 'semester_code', width: 20 },
      { header: 'Semester Name', key: 'semester_name', width: 40 },
      { header: 'Semester Type', key: 'semester_type', width: 15 },
      { header: 'Is Active', key: 'is_active', width: 12 },
      { header: 'Semester Order', key: 'semester_order', width: 15 },
      { header: 'Initial Semester', key: 'initial_semester', width: 15 },
      { header: 'Terminal Semester', key: 'terminal_semester', width: 15 },
      { header: 'Semester Group', key: 'semester_group', width: 20 }
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

    // Get sample data for example row - using NAMES
    const sampleInstName = institutionNames[0] || institutions?.[0]?.name || 'Sample Institution';
    const sampleDegrees = degreesByInstitution.get(sampleInstName) || [];
    const sampleDegreeName = sampleDegrees[0] || degrees?.[0]?.degree_name || 'Bachelor of Technology';
    const sampleDepts = departmentsByDegree.get(sampleDegreeName) || [];
    const sampleDeptName = sampleDepts[0] || departments?.[0]?.department_name || 'Computer Science and Engineering';
    const sampleProgs = programsByDepartment.get(sampleDeptName) || [];
    const sampleProgName = sampleProgs[0] || programs?.[0]?.program_name || 'Computer Science and Engineering - Regular';

    // Add sample row
    worksheet.addRow({
      institution_name: sampleInstName,
      degree_name: sampleDegreeName,
      department_name: sampleDeptName,
      program_name: sampleProgName,
      semester_code: 'SEM1',
      semester_name: 'Semester 1',
      semester_type: 'Odd',
      is_active: 'Active',
      semester_order: 1,
      initial_semester: 'Yes',
      terminal_semester: 'No',
      semester_group: 'First Year'
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
        { font: { size: 9 }, text: 'Replace this row with your actual semester data.\nYou can delete this row after adding your data.' }
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
    // Section 1: Institution NAMES as headers → Degree NAMES below (for degree cascade)
    // Section 2: Degree NAMES as headers → Department NAMES below (for department cascade)
    // Section 3: Department NAMES as headers → Program NAMES below (for program cascade)
    // Section 4: Reference columns (AllInstitutions, SemesterType, Status, YesNo)
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Get institutions that have degrees
    const institutionsWithDegrees = institutionNames.filter(name =>
      degreesByInstitution.has(name) && degreesByInstitution.get(name)!.length > 0
    );

    // Get composite keys (Institution|Degree) that have departments
    const degreesWithDepartments = Array.from(departmentsByDegree.keys()).filter(
      (key) => departmentsByDegree.get(key)!.length > 0
    );

    // Get composite keys (Institution|Degree|Department) that have programs
    const departmentsWithPrograms = Array.from(programsByDepartment.keys()).filter(
      (key) => programsByDepartment.get(key)!.length > 0
    );

    // Calculate section boundaries
    const section1EndCol = institutionsWithDegrees.length; // Institution → Degree cascade columns
    const section2StartCol = section1EndCol + 2; // +2 for separator column
    const section2EndCol = section2StartCol + degreesWithDepartments.length - 1;
    const section3StartCol = section2EndCol + 2; // +2 for separator column
    const section3EndCol = section3StartCol + departmentsWithPrograms.length - 1;
    const refStartCol = section3EndCol + 2; // Start of reference columns

    // Build header row
    const headerRow: string[] = [
      ...institutionsWithDegrees, // Section 1: Institution NAMES
      '', // Separator
      ...degreesWithDepartments,  // Section 2: Degree NAMES
      '', // Separator
      ...departmentsWithPrograms, // Section 3: Department NAMES
      '', // Separator
      'AllInstitutions',
      'SemesterType',
      'Status',
      'YesNo'
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
    const maxProgsPerDept = Math.max(
      ...Array.from(programsByDepartment.values()).map(arr => arr.length),
      1
    );
    const maxRefValues = Math.max(
      institutionNames.length,
      EXCEL_SEMESTER_TYPES.length,
      EXCEL_IS_ACTIVE.length,
      EXCEL_YES_NO.length
    );
    const maxDataRows = Math.max(maxDegreesPerInst, maxDeptsPerDegree, maxProgsPerDept, maxRefValues);

    // Add data rows
    for (let i = 0; i < maxDataRows; i++) {
      const rowData: (string | null)[] = [];

      // Section 1: Degrees for each institution
      institutionsWithDegrees.forEach(instName => {
        const instDegrees = degreesByInstitution.get(instName) || [];
        rowData.push(instDegrees[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 2: Departments for each composite key (Institution|Degree)
      degreesWithDepartments.forEach(compositeKey => {
        const degreeDepts = departmentsByDegree.get(compositeKey) || [];
        rowData.push(degreeDepts[i] || null);
      });

      // Separator
      rowData.push(null);

      // Section 3: Programs for each composite key (Institution|Degree|Department)
      departmentsWithPrograms.forEach(compositeKey => {
        const deptProgs = programsByDepartment.get(compositeKey) || [];
        rowData.push(deptProgs[i] || null);
      });

      // Separator
      rowData.push(null);

      // Reference columns
      rowData.push(institutionNames[i] || null); // AllInstitutions
      rowData.push(EXCEL_SEMESTER_TYPES[i] || null); // SemesterType
      rowData.push(EXCEL_IS_ACTIVE[i] || null); // Status
      rowData.push(EXCEL_YES_NO[i] || null); // YesNo

      listsSheet.addRow(rowData);
    }

    // Set column widths
    const allCols = headerRow.length;
    for (let i = 1; i <= allCols; i++) {
      listsSheet.getColumn(i).width = 15;
    }

    // ============================================================
    // DATA VALIDATION (Dropdowns) - 4-Level Cascading
    // Column A: Institution Code dropdown
    // Column B: Degree ID dropdown (cascades from A)
    // Column C: Department Code dropdown (cascades from B)
    // Column D: Program ID dropdown (cascades from C)
    // Column G: Semester Type dropdown
    // Column H: Is Active dropdown
    // Column J: Initial Semester dropdown
    // Column K: Terminal Semester dropdown
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
    const allInstColNum = refStartCol;
    const allInstColLetter = getColLetter(allInstColNum);
    const semesterTypeColLetter = getColLetter(allInstColNum + 1);
    const statusColLetter = getColLetter(allInstColNum + 2);
    const yesNoColLetter = getColLetter(allInstColNum + 3);

    // Section 1 end column letter (for degree OFFSET)
    const section1EndColLetter = getColLetter(section1EndCol);

    // Section 2 range for department OFFSET
    const section2StartColLetter = getColLetter(section2StartCol);
    const section2EndColLetter = getColLetter(section2EndCol);

    // Section 3 range for program OFFSET
    const section3StartColLetter = getColLetter(section3StartCol);
    const section3EndColLetter = getColLetter(section3EndCol);

    // Apply validation cell-by-cell
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Institution Name dropdown (uses AllInstitutions column)
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

      // Column B: Degree Name dropdown (OFFSET formula cascading from Column A)
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

      // Column C: Department Name dropdown (OFFSET formula cascading from Column A+B composite key)
      if (degreesWithDepartments.length > 0) {
        // Use composite key: Institution|Degree to match section 2 headers
        const deptOffsetFormula = `OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(A${row}&"|"&B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(A${row}&"|"&B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [deptOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution and Degree first, then choose a Department Name from the dropdown'
        };
      }

      // Column D: Program Name dropdown (OFFSET formula cascading from Column A+B+C composite key)
      if (departmentsWithPrograms.length > 0) {
        // Use composite key: Institution|Degree|Department to match section 3 headers
        const progOffsetFormula = `OFFSET(Lists!$${section3StartColLetter}$1,1,MATCH(A${row}&"|"&B${row}&"|"&C${row},Lists!$${section3StartColLetter}$1:$${section3EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section3StartColLetter}$1,1,MATCH(A${row}&"|"&B${row}&"|"&C${row},Lists!$${section3StartColLetter}$1:$${section3EndColLetter}$1,0)-1,100,1)),1)`;

        worksheet.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [progOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution, Degree, and Department first, then choose a Program Name from the dropdown'
        };
      }

      // Column G: Semester Type dropdown
      worksheet.getCell(`G${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${semesterTypeColLetter}$2:$${semesterTypeColLetter}$${EXCEL_SEMESTER_TYPES.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_SEMESTER_TYPES.join(', ')}`
      };

      // Column H: Is Active dropdown
      worksheet.getCell(`H${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${statusColLetter}$2:$${statusColLetter}$${EXCEL_IS_ACTIVE.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_IS_ACTIVE.join(', ')}`
      };

      // Column J: Initial Semester dropdown
      worksheet.getCell(`J${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${yesNoColLetter}$2:$${yesNoColLetter}$${EXCEL_YES_NO.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_YES_NO.join(', ')}`
      };

      // Column K: Terminal Semester dropdown
      worksheet.getCell(`K${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${yesNoColLetter}$2:$${yesNoColLetter}$${EXCEL_YES_NO.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_YES_NO.join(', ')}`
      };
    }

    // ============================================================
    // INSTRUCTIONS SHEET
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK SEMESTER IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Institution Name: Select from dropdown (existing institution)',
      '   - Degree Name: Select from CASCADING dropdown (filters based on Institution)',
      '   - Department Name: Select from CASCADING dropdown (filters based on Degree)',
      '   - Program Name: Select from CASCADING dropdown (filters based on Department)',
      '   - Semester Code: Unique semester identifier (e.g., "SEM1", "SEM2")',
      '   - Semester Name: Full semester name (e.g., "Semester 1")',
      '   - Semester Type: Select from dropdown (Even or Odd)',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '   - Semester Order: Numeric order for sorting (e.g., 1, 2, 3)',
      '   - Initial Semester: Yes or No (defaults to No if blank)',
      '   - Terminal Semester: Yes or No (defaults to No if blank)',
      '   - Semester Group: Grouping text (e.g., "First Year", "Final Year")',
      '',
      '3. CASCADING DROPDOWN BEHAVIOR (4-LEVEL):',
      '   - Step 1: Select Institution Name (Column A) FIRST',
      '   - Step 2: Select Degree Name (Column B) - shows ONLY degrees for that institution',
      '   - Step 3: Select Department Name (Column C) - shows ONLY departments for that degree',
      '   - Step 4: Select Program Name (Column D) - shows ONLY programs for that department',
      '   - If you change a parent selection, you MUST re-select all child values',
      '',
      '4. DATA VALIDATION:',
      '   - Institution Name, Degree Name, Department Name, Program Name: CASCADING dropdowns',
      '   - Semester Type, Is Active, Initial Semester, Terminal Semester: Fixed dropdowns',
      '   - NEVER type values manually - always use dropdowns',
      '   - Typing manually may cause case-sensitivity errors',
      '',
      '5. FORMATTING:',
      '   - Semester Code: Alphanumeric code (e.g., SEM1, SEM2, S1, S2)',
      '   - Semester Order: Integer value (e.g., 1, 2, 3)',
      '',
      '6. IMPORTANT NOTES:',
      '   - Semester codes must be unique within each program',
      '   - Follow the cascade order: Institution → Degree → Department → Program',
      '   - The cascading dropdowns ensure valid hierarchy combinations',
      '   - Semester Type is required (Even or Odd)',
      '',
      '7. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '8. IMPORT PROCESS:',
      '   - Fill in all required columns following the cascade order',
      '   - Save the file',
      '   - Upload via the Import button in the Semesters page',
      '   - Review the import results and fix any errors',
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
        'Content-Disposition': `attachment; filename=semesters-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/semesters/template] Error:', error);
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
