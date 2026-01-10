// app/api/organizations/course-mappings/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { EXCEL_IS_ACTIVE } from '@/lib/utils/mappings/course-mapping-excel-mappings';

/**
 * GET /api/organizations/course-mappings/template
 *
 * Generates a blank Excel template with 5-level cascading dropdown validation for bulk course mapping creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - 5-level cascading dropdowns:
 *   1. Institution Name (Column A)
 *   2. Degree Name (Column B) - cascades based on Institution
 *   3. Department Name (Column C) - cascades based on Institution|Degree
 *   4. Program Name (Column D) - cascades based on Institution|Degree|Department
 *   5. Semester Name (Column E) - cascades based on Institution|Degree|Department|Program
 * - Course Code dropdown (Column F) - cascades based on Institution only
 * - Enum dropdowns for Status
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

    // ============================================================
    // FETCH ALL DATA FOR 5-LEVEL CASCADING DROPDOWNS
    // ============================================================

    // Fetch institutions
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, counselling_code, name')
      .eq('is_active', true)
      .order('name');

    if (instError) {
      console.error('[course-mappings/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionNames = institutions?.map((i) => i.name).filter(Boolean) || [];

    // Fetch degrees with institution info
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('degree_id, degree_name, institution_id, institutions!inner(name)')
      .eq('is_active', true)
      .order('degree_name');

    if (degreeError) {
      console.error('[course-mappings/template] Error fetching degrees:', degreeError);
      return NextResponse.json(
        { error: 'Failed to fetch degrees', message: degreeError.message },
        { status: 500 }
      );
    }

    // Fetch departments with degree AND institution info
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('department_code, department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name))')
      .eq('is_active', true)
      .order('department_name');

    if (deptError) {
      console.error('[course-mappings/template] Error fetching departments:', deptError);
      return NextResponse.json(
        { error: 'Failed to fetch departments', message: deptError.message },
        { status: 500 }
      );
    }

    // Fetch programs with department, degree AND institution info
    const { data: programs, error: progError } = await supabase
      .from('programs')
      .select('program_id, program_name, department_id, departments!inner(department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name)))')
      .eq('is_active', true)
      .order('program_name');

    if (progError) {
      console.error('[course-mappings/template] Error fetching programs:', progError);
      return NextResponse.json(
        { error: 'Failed to fetch programs', message: progError.message },
        { status: 500 }
      );
    }

    // Fetch semesters with full hierarchy
    const { data: semesters, error: semError } = await supabase
      .from('semesters')
      .select('semester_code, semester_name, program_id, programs!inner(program_name, department_id, departments!inner(department_name, degree_id, degrees!inner(degree_name, institution_id, institutions!inner(name))))')
      .eq('is_active', true)
      .order('semester_name');

    if (semError) {
      console.error('[course-mappings/template] Error fetching semesters:', semError);
      return NextResponse.json(
        { error: 'Failed to fetch semesters', message: semError.message },
        { status: 500 }
      );
    }

    // Fetch courses with institution info
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, course_code, course_name, institution_id, institutions!inner(name)')
      .eq('is_active', true)
      .order('course_code');

    if (courseError) {
      console.error('[course-mappings/template] Error fetching courses:', courseError);
      return NextResponse.json(
        { error: 'Failed to fetch courses', message: courseError.message },
        { status: 500 }
      );
    }

    // ============================================================
    // GROUP DATA FOR CASCADING DROPDOWNS WITH COMPOSITE KEYS
    // ============================================================

    // Level 1: Institution → Degree (deduplicated)
    const degreesByInstitution = new Map<string, string[]>();
    degrees?.forEach((d: any) => {
      const instName = d.institutions?.name;
      const degreeName = d.degree_name;
      if (instName && degreeName) {
        if (!degreesByInstitution.has(instName)) {
          degreesByInstitution.set(instName, []);
        }
        const existing = degreesByInstitution.get(instName)!;
        if (!existing.includes(degreeName)) {
          existing.push(degreeName);
        }
      }
    });

    // Level 2: Institution|Degree → Department (deduplicated)
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
        const existing = departmentsByDegree.get(compositeKey)!;
        if (!existing.includes(deptName)) {
          existing.push(deptName);
        }
      }
    });

    // Level 3: Institution|Degree|Department → Program (deduplicated)
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
        const existing = programsByDepartment.get(compositeKey)!;
        if (!existing.includes(progName)) {
          existing.push(progName);
        }
      }
    });

    // Level 4: Institution|Degree|Department|Program → Semester (deduplicated)
    const semestersByProgram = new Map<string, string[]>();
    semesters?.forEach((s: any) => {
      const progName = s.programs?.program_name;
      const deptName = s.programs?.departments?.department_name;
      const degreeName = s.programs?.departments?.degrees?.degree_name;
      const instName = s.programs?.departments?.degrees?.institutions?.name;
      const semName = s.semester_name;
      if (progName && deptName && degreeName && instName && semName) {
        const compositeKey = `${instName}|${degreeName}|${deptName}|${progName}`;
        if (!semestersByProgram.has(compositeKey)) {
          semestersByProgram.set(compositeKey, []);
        }
        const existing = semestersByProgram.get(compositeKey)!;
        if (!existing.includes(semName)) {
          existing.push(semName);
        }
      }
    });

    // Courses by Institution (for course dropdown) - using course_name
    const coursesByInstitution = new Map<string, string[]>();
    courses?.forEach((c: any) => {
      const instName = c.institutions?.name;
      const courseName = c.course_name;
      if (instName && courseName) {
        if (!coursesByInstitution.has(instName)) {
          coursesByInstitution.set(instName, []);
        }
        const existing = coursesByInstitution.get(instName)!;
        if (!existing.includes(courseName)) {
          existing.push(courseName);
        }
      }
    });

    // ============================================================
    // CREATE EXCEL WORKBOOK
    // ============================================================
    const workbook = new ExcelJS.Workbook();

    // SHEET 1: Course Mappings (Main Data Sheet)
    const worksheet = workbook.addWorksheet('Course Mappings');

    // Define columns - Full 5-level hierarchy + course
    worksheet.columns = [
      { header: 'Institution Name', key: 'institution_name', width: 40 },
      { header: 'Degree Name', key: 'degree_name', width: 40 },
      { header: 'Department Name', key: 'department_name', width: 40 },
      { header: 'Program Name', key: 'program_name', width: 40 },
      { header: 'Semester Name', key: 'semester_name', width: 30 },
      { header: 'Course Name', key: 'course_name', width: 40 },
      { header: 'Is Active', key: 'is_active', width: 12 }
    ];

    // Add formatting to headers
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
    const sampleInstitution = institutionNames[0] || 'Sample Institution';
    const sampleDegrees = degreesByInstitution.get(sampleInstitution) || [];
    const sampleDegree = sampleDegrees[0] || 'Sample Degree';
    const sampleDepts = departmentsByDegree.get(`${sampleInstitution}|${sampleDegree}`) || [];
    const sampleDept = sampleDepts[0] || 'Sample Department';
    const sampleProgs = programsByDepartment.get(`${sampleInstitution}|${sampleDegree}|${sampleDept}`) || [];
    const sampleProg = sampleProgs[0] || 'Sample Program';
    const sampleSems = semestersByProgram.get(`${sampleInstitution}|${sampleDegree}|${sampleDept}|${sampleProg}`) || [];
    const sampleSem = sampleSems[0] || 'Semester 1';
    const sampleCourses = coursesByInstitution.get(sampleInstitution) || [];
    const sampleCourse = sampleCourses[0] || 'Introduction to Computer Science';

    // Add sample row
    worksheet.addRow({
      institution_name: sampleInstitution,
      degree_name: sampleDegree,
      department_name: sampleDept,
      program_name: sampleProg,
      semester_name: sampleSem,
      course_name: sampleCourse,
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
        { font: { size: 9 }, text: 'Replace this row with your actual course mapping data.\nYou can delete this row after adding your data.' }
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
    // SHEET 2: Lists (Reference Data for 5-Level Cascading Dropdowns)
    // Structure:
    // Section 1: Institution → Degree
    // Section 2: Institution|Degree → Department
    // Section 3: Institution|Degree|Department → Program
    // Section 4: Institution|Degree|Department|Program → Semester
    // Section 5: Institution → Course
    // Reference columns: AllInstitutions, IsActive
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Get keys with data for each section
    const institutionsWithDegrees = institutionNames.filter(name =>
      degreesByInstitution.has(name) && degreesByInstitution.get(name)!.length > 0
    );
    const degreesWithDepartments = Array.from(departmentsByDegree.keys()).filter(
      key => departmentsByDegree.get(key)!.length > 0
    );
    const departmentsWithPrograms = Array.from(programsByDepartment.keys()).filter(
      key => programsByDepartment.get(key)!.length > 0
    );
    const programsWithSemesters = Array.from(semestersByProgram.keys()).filter(
      key => semestersByProgram.get(key)!.length > 0
    );
    const institutionsWithCourses = institutionNames.filter(name =>
      coursesByInstitution.has(name) && coursesByInstitution.get(name)!.length > 0
    );

    // Calculate section boundaries
    const section1EndCol = institutionsWithDegrees.length;
    const section2StartCol = section1EndCol + 2;
    const section2EndCol = section2StartCol + degreesWithDepartments.length - 1;
    const section3StartCol = section2EndCol + 2;
    const section3EndCol = section3StartCol + departmentsWithPrograms.length - 1;
    const section4StartCol = section3EndCol + 2;
    const section4EndCol = section4StartCol + programsWithSemesters.length - 1;
    const section5StartCol = section4EndCol + 2;
    const section5EndCol = section5StartCol + institutionsWithCourses.length - 1;
    const refStartCol = section5EndCol + 2;

    // Build header row
    const headerRow: string[] = [
      ...institutionsWithDegrees,           // Section 1: Institution headers for degrees
      '',                                   // Separator
      ...degreesWithDepartments,           // Section 2: Institution|Degree headers for departments
      '',                                   // Separator
      ...departmentsWithPrograms,          // Section 3: Institution|Degree|Department headers for programs
      '',                                   // Separator
      ...programsWithSemesters,            // Section 4: Institution|Degree|Department|Program headers for semesters
      '',                                   // Separator
      ...institutionsWithCourses,          // Section 5: Institution headers for courses
      '',                                   // Separator
      'AllInstitutions',                   // Reference columns
      'IsActive'
    ];

    listsSheet.addRow(headerRow);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Calculate max rows needed for data
    const maxDataRows = Math.max(
      ...Array.from(degreesByInstitution.values()).map(arr => arr.length),
      ...Array.from(departmentsByDegree.values()).map(arr => arr.length),
      ...Array.from(programsByDepartment.values()).map(arr => arr.length),
      ...Array.from(semestersByProgram.values()).map(arr => arr.length),
      ...Array.from(coursesByInstitution.values()).map(arr => arr.length),
      institutionNames.length,
      EXCEL_IS_ACTIVE.length,
      1
    );

    // Add data rows
    for (let i = 0; i < maxDataRows; i++) {
      const rowData: (string | null)[] = [];

      // Section 1: Degrees for each institution
      institutionsWithDegrees.forEach(instName => {
        const instDegrees = degreesByInstitution.get(instName) || [];
        rowData.push(instDegrees[i] || null);
      });
      rowData.push(null); // Separator

      // Section 2: Departments for each Institution|Degree
      degreesWithDepartments.forEach(compositeKey => {
        const depts = departmentsByDegree.get(compositeKey) || [];
        rowData.push(depts[i] || null);
      });
      rowData.push(null); // Separator

      // Section 3: Programs for each Institution|Degree|Department
      departmentsWithPrograms.forEach(compositeKey => {
        const progs = programsByDepartment.get(compositeKey) || [];
        rowData.push(progs[i] || null);
      });
      rowData.push(null); // Separator

      // Section 4: Semesters for each Institution|Degree|Department|Program
      programsWithSemesters.forEach(compositeKey => {
        const sems = semestersByProgram.get(compositeKey) || [];
        rowData.push(sems[i] || null);
      });
      rowData.push(null); // Separator

      // Section 5: Courses for each institution
      institutionsWithCourses.forEach(instName => {
        const instCourses = coursesByInstitution.get(instName) || [];
        rowData.push(instCourses[i] || null);
      });
      rowData.push(null); // Separator

      // Reference columns
      rowData.push(institutionNames[i] || null);
      rowData.push(EXCEL_IS_ACTIVE[i] || null);

      listsSheet.addRow(rowData);
    }

    // Set column widths
    const allCols = headerRow.length;
    for (let i = 1; i <= allCols; i++) {
      listsSheet.getColumn(i).width = 15;
    }

    // ============================================================
    // DATA VALIDATION (Dropdowns) - 5-Level Cascading with Composite Keys
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

    // Calculate column letters for each section
    const section1EndColLetter = getColLetter(section1EndCol);
    const section2StartColLetter = getColLetter(section2StartCol);
    const section2EndColLetter = getColLetter(section2EndCol);
    const section3StartColLetter = getColLetter(section3StartCol);
    const section3EndColLetter = getColLetter(section3EndCol);
    const section4StartColLetter = getColLetter(section4StartCol);
    const section4EndColLetter = getColLetter(section4EndCol);
    const section5StartColLetter = getColLetter(section5StartCol);
    const section5EndColLetter = getColLetter(section5EndCol);
    const allInstColLetter = getColLetter(refStartCol);
    const isActiveColLetter = getColLetter(refStartCol + 1);

    // Apply validation cell-by-cell
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Institution Name dropdown
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

      // Column B: Degree Name dropdown (cascading from Column A)
      if (institutionsWithDegrees.length > 0) {
        const degreeOffsetFormula = `OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$A$1,1,MATCH(A${row},Lists!$A$1:$${section1EndColLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(`B${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [degreeOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an Institution first, then choose a Degree from the dropdown'
        };
      }

      // Column C: Department Name dropdown (cascading from A|B composite key)
      if (degreesWithDepartments.length > 0) {
        const deptOffsetFormula = `OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(A${row}&"|"&B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section2StartColLetter}$1,1,MATCH(A${row}&"|"&B${row},Lists!$${section2StartColLetter}$1:$${section2EndColLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(`C${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [deptOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution and Degree first, then choose a Department from the dropdown'
        };
      }

      // Column D: Program Name dropdown (cascading from A|B|C composite key)
      if (departmentsWithPrograms.length > 0) {
        const progOffsetFormula = `OFFSET(Lists!$${section3StartColLetter}$1,1,MATCH(A${row}&"|"&B${row}&"|"&C${row},Lists!$${section3StartColLetter}$1:$${section3EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section3StartColLetter}$1,1,MATCH(A${row}&"|"&B${row}&"|"&C${row},Lists!$${section3StartColLetter}$1:$${section3EndColLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(`D${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [progOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution, Degree, and Department first, then choose a Program from the dropdown'
        };
      }

      // Column E: Semester Name dropdown (cascading from A|B|C|D composite key)
      if (programsWithSemesters.length > 0) {
        const semOffsetFormula = `OFFSET(Lists!$${section4StartColLetter}$1,1,MATCH(A${row}&"|"&B${row}&"|"&C${row}&"|"&D${row},Lists!$${section4StartColLetter}$1:$${section4EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section4StartColLetter}$1,1,MATCH(A${row}&"|"&B${row}&"|"&C${row}&"|"&D${row},Lists!$${section4StartColLetter}$1:$${section4EndColLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(`E${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [semOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select Institution, Degree, Department, and Program first, then choose a Semester from the dropdown'
        };
      }

      // Column F: Course Code dropdown (cascading from Institution only)
      if (institutionsWithCourses.length > 0) {
        const courseOffsetFormula = `OFFSET(Lists!$${section5StartColLetter}$1,1,MATCH(A${row},Lists!$${section5StartColLetter}$1:$${section5EndColLetter}$1,0)-1,COUNTA(OFFSET(Lists!$${section5StartColLetter}$1,1,MATCH(A${row},Lists!$${section5StartColLetter}$1:$${section5EndColLetter}$1,0)-1,100,1)),1)`;
        worksheet.getCell(`F${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [courseOffsetFormula],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: 'Please select an Institution first, then choose a Course Code from the dropdown'
        };
      }

      // Column G: Is Active dropdown
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
    // INSTRUCTIONS SHEET
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK COURSE MAPPING IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Institution Name: Select from dropdown (existing institution)',
      '   - Degree Name: Select from CASCADING dropdown (filters by Institution)',
      '   - Department Name: Select from CASCADING dropdown (filters by Institution + Degree)',
      '   - Program Name: Select from CASCADING dropdown (filters by Institution + Degree + Department)',
      '   - Semester Name: Select from CASCADING dropdown (filters by Institution + Degree + Department + Program)',
      '   - Course Name: Select from CASCADING dropdown (filters by Institution)',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '',
      '3. 5-LEVEL CASCADING DROPDOWNS:',
      '   - STEP 1: Select Institution Name (Column A)',
      '   - STEP 2: Select Degree Name (Column B) - shows ONLY degrees for that institution',
      '   - STEP 3: Select Department Name (Column C) - shows ONLY departments for that degree',
      '   - STEP 4: Select Program Name (Column D) - shows ONLY programs for that department',
      '   - STEP 5: Select Semester Name (Column E) - shows ONLY semesters for that program',
      '   - STEP 6: Select Course Name (Column F) - shows ONLY courses for that institution',
      '   - If you change a parent selection, you MUST re-select all child values',
      '',
      '4. DATA VALIDATION:',
      '   - All hierarchy fields have CASCADING dropdowns that filter based on parent selections',
      '   - Course Name shows only courses belonging to the selected institution',
      '   - Is Active has a fixed dropdown (Active or Inactive)',
      '   - NEVER type values manually - always use dropdowns',
      '',
      '5. IMPORTANT NOTES:',
      '   - Each course can only be mapped ONCE per semester',
      '   - The hierarchy is: Institution → Degree → Department → Program → Semester',
      '   - Courses belong to institutions and can be mapped to any semester within that institution',
      '   - Follow the cascade order strictly for proper validation',
      '',
      '6. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '7. IMPORT PROCESS:',
      '   - Fill in all required columns following the cascade order',
      '   - Save the file',
      '   - Upload via the Import button in the Course Mappings page',
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
        'Content-Disposition': `attachment; filename=course-mappings-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/course-mappings/template] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to generate template',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}
