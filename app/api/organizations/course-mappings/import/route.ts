// app/api/organizations/course-mappings/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {

  mapLabelToValue,
  getInvalidLabelError
} from '@/lib/utils/mappings/course-mapping-excel-mappings';

/**
 * POST /api/organizations/course-mappings/import
 *
 * Bulk import course mappings from Excel file with 5-level cascading validation
 *
 * Features:
 * - Parses Excel files with 7 columns
 * - Case-insensitive dropdown value mapping
 * - 5-level FK validation (Institution → Degree → Department → Program → Semester)
 * - Course validation (belongs to institution)
 * - Duplicate detection (within file + database)
 * - Row-level error reporting
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
  duplicateMappings?: string[];
}

interface ParsedCourseMappingRow {
  institution_name: string;
  degree_name: string;
  department_name: string;
  program_name: string;
  semester_name: string;
  course_name: string;
  is_active: boolean;
  // Resolved UUIDs (filled during validation)
  institution_uuid?: string;
  degree_uuid?: string;
  department_uuid?: string;
  program_uuid?: string;
  semester_uuid?: string;
  course_uuid?: string;
}

// ============================================================================
// ZOD SCHEMA
// ============================================================================

const courseMappingRowSchema = z.object({
  institution_name: z
    .string()
    .min(2, 'Institution name must be at least 2 characters')
    .max(255, 'Institution name must be 255 characters or less'),
  degree_name: z
    .string()
    .min(2, 'Degree name must be at least 2 characters')
    .max(255, 'Degree name must be 255 characters or less'),
  department_name: z
    .string()
    .min(2, 'Department name must be at least 2 characters')
    .max(255, 'Department name must be 255 characters or less'),
  program_name: z
    .string()
    .min(2, 'Program name must be at least 2 characters')
    .max(255, 'Program name must be 255 characters or less'),
  semester_name: z
    .string()
    .min(1, 'Semester name must not be empty')
    .max(255, 'Semester name must be 255 characters or less'),
  course_name: z
    .string()
    .min(1, 'Course name must not be empty')
    .max(255, 'Course name must be 255 characters or less'),
  is_active: z.boolean()
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get cell value as string, handling various Excel cell types
 */
function getCellValue(cell: ExcelJS.Cell): string {
  if (!cell || cell.value === null || cell.value === undefined) {
    return '';
  }

  // Handle rich text
  if (typeof cell.value === 'object' && 'richText' in cell.value) {
    return cell.value.richText.map((rt: any) => rt.text).join('');
  }

  // Handle formulas
  if (typeof cell.value === 'object' && 'result' in cell.value) {
    return String(cell.value.result || '');
  }

  // Handle hyperlinks
  if (typeof cell.value === 'object' && 'text' in cell.value) {
    return String(cell.value.text || '');
  }

  return String(cell.value).trim();
}

/**
 * Parse a single Excel row into a course mapping object
 */
function parseExcelRow(
  row: ExcelJS.Row,
  rowNumber: number
): { data: ParsedCourseMappingRow | null; errors: ImportError[] } {
  const errors: ImportError[] = [];

  // Extract cell values (columns A-G)
  const institutionName = getCellValue(row.getCell(1));
  const degreeName = getCellValue(row.getCell(2));
  const departmentName = getCellValue(row.getCell(3));
  const programName = getCellValue(row.getCell(4));
  const semesterName = getCellValue(row.getCell(5));
  const courseName = getCellValue(row.getCell(6));
  const isActiveLabel = getCellValue(row.getCell(7));

  // Skip completely empty rows
  if (
    !institutionName &&
    !degreeName &&
    !departmentName &&
    !programName &&
    !semesterName &&
    !courseName
  ) {
    return { data: null, errors: [] };
  }

  // Map is_active dropdown (default to true if blank)
  let isActive = true;
  if (isActiveLabel) {
    const isActiveMapped = mapLabelToValue(isActiveLabel, 'isActive');
    if (isActiveMapped === null) {
      errors.push({
        row: rowNumber,
        field: 'is_active',
        message: getInvalidLabelError(isActiveLabel, 'isActive', rowNumber)
      });
    } else {
      isActive = isActiveMapped === 'true';
    }
  }

  // Construct course mapping object
  const mappingData: ParsedCourseMappingRow = {
    institution_name: institutionName.trim(),
    degree_name: degreeName.trim(),
    department_name: departmentName.trim(),
    program_name: programName.trim(),
    semester_name: semesterName.trim(),
    course_name: courseName.trim(),
    is_active: isActive
  };

  // If there are dropdown validation errors, return early
  if (errors.length > 0) {
    return { data: null, errors };
  }

  // Zod validation
  try {
    courseMappingRowSchema.parse(mappingData);
  } catch (err) {
    if (err instanceof z.ZodError) {
      err.errors.forEach((zodError) => {
        errors.push({
          row: rowNumber,
          field: zodError.path.join('.'),
          message: zodError.message
        });
      });
    }
  }

  if (errors.length > 0) {
    return { data: null, errors };
  }

  return { data: mappingData, errors: [] };
}

// ============================================================================
// MAIN IMPORT HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to import course mappings' },
        { status: 401 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', message: 'Please upload an Excel file' },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      !file.name.endsWith('.xlsx') &&
      !file.name.endsWith('.xls')
    ) {
      return NextResponse.json(
        {
          error: 'Invalid file type',
          message: 'Please upload an Excel file (.xlsx or .xls)'
        },
        { status: 400 }
      );
    }

    // Read Excel file
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return NextResponse.json(
        { error: 'Empty workbook', message: 'The Excel file is empty' },
        { status: 400 }
      );
    }

    // ========================================================================
    // STEP 1: PARSE ALL ROWS
    // ========================================================================

    const parsedRows: ParsedCourseMappingRow[] = [];
    const parseErrors: ImportError[] = [];

    worksheet.eachRow((row, rowNumber) => {
      // Skip header row
      if (rowNumber === 1) return;

      const { data, errors } = parseExcelRow(row, rowNumber);

      if (errors.length > 0) {
        parseErrors.push(...errors);
      }

      if (data) {
        parsedRows.push(data);
      }
    });

    // If parsing errors, return early
    if (parseErrors.length > 0) {
      const result: ImportResult = {
        success: false,
        successCount: 0,
        errorCount: parseErrors.length,
        totalRows: parsedRows.length + parseErrors.length,
        errors: parseErrors
      };
      return NextResponse.json(result, { status: 400 });
    }

    if (parsedRows.length === 0) {
      return NextResponse.json(
        {
          error: 'No data to import',
          message: 'The Excel file contains no valid rows'
        },
        { status: 400 }
      );
    }

    // ========================================================================
    // STEP 2: CHECK DUPLICATES WITHIN FILE
    // ========================================================================

    const mappingMap = new Map<string, number[]>();

    parsedRows.forEach((row, index) => {
      // Use course_name + semester composite key + hierarchy for uniqueness check
      const key = `${row.institution_name}|${row.degree_name}|${row.department_name}|${row.program_name}|${row.semester_name}|${row.course_name}`;
      if (!mappingMap.has(key)) {
        mappingMap.set(key, []);
      }
      mappingMap.get(key)!.push(index + 2); // +2 for header row
    });

    const duplicatesInFile = Array.from(mappingMap.entries())
      .filter(([_, indices]) => indices.length > 1)
      .map(
        ([key, indices]) => {
          const parts = key.split('|');
          return `Course "${parts[5]}" in semester "${parts[4]}" appears in rows: ${indices.join(', ')}`;
        }
      );

    if (duplicatesInFile.length > 0) {
      const result: ImportResult = {
        success: false,
        successCount: 0,
        errorCount: duplicatesInFile.length,
        totalRows: parsedRows.length,
        errors: duplicatesInFile.map((msg) => ({
          row: 0,
          message: msg
        })),
        duplicateMappings: duplicatesInFile
      };
      return NextResponse.json(result, { status: 400 });
    }

    // ========================================================================
    // STEP 3: VALIDATE 5-LEVEL FK HIERARCHY & CHECK DUPLICATES IN DATABASE
    // ========================================================================

    const validationErrors: ImportError[] = [];

    // Get unique names for batch fetching
    const uniqueInstitutionNames = [...new Set(parsedRows.map((r) => r.institution_name))];

    // Fetch all institutions by names
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, counselling_code, name')
      .in('name', uniqueInstitutionNames);

    if (instError) {
      console.error('[course-mappings/import] Institution lookup error:', instError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to validate institution names'
        },
        { status: 500 }
      );
    }

    // Create name-to-UUID mapping for institutions
    const institutionNameToIdMap = new Map<string, string>();
    institutions?.forEach((inst) => {
      institutionNameToIdMap.set(inst.name, inst.id);
    });

    const validInstitutionNames = new Set(
      institutions?.map((i) => i.name) || []
    );

    // Fetch all degrees for the institutions
    const institutionIds = Array.from(institutionNameToIdMap.values());
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('id, degree_id, degree_name, institution_id')
      .in('institution_id', institutionIds);

    if (degreeError) {
      console.error('[course-mappings/import] Degrees lookup error:', degreeError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch degrees'
        },
        { status: 500 }
      );
    }

    // Map degrees by institution_id + degree_name
    const degreeKeyToIdMap = new Map<string, string>();
    degrees?.forEach((deg) => {
      const key = `${deg.institution_id}|${deg.degree_name}`;
      degreeKeyToIdMap.set(key, deg.id);
    });

    // Fetch all departments for the degrees
    const degreeIds = degrees?.map((d) => d.id) || [];
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, department_code, department_name, degree_id')
      .in('degree_id', degreeIds);

    if (deptError) {
      console.error('[course-mappings/import] Departments lookup error:', deptError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch departments'
        },
        { status: 500 }
      );
    }

    // Map departments by degree_id + department_name
    const deptKeyToIdMap = new Map<string, string>();
    departments?.forEach((dept) => {
      const key = `${dept.degree_id}|${dept.department_name}`;
      deptKeyToIdMap.set(key, dept.id);
    });

    // Fetch all programs for the departments
    const departmentIds = departments?.map((d) => d.id) || [];
    const { data: programs, error: progError } = await supabase
      .from('programs')
      .select('id, program_id, program_name, department_id')
      .in('department_id', departmentIds);

    if (progError) {
      console.error('[course-mappings/import] Programs lookup error:', progError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch programs'
        },
        { status: 500 }
      );
    }

    // Map programs by department_id + program_name
    const progKeyToIdMap = new Map<string, string>();
    programs?.forEach((prog) => {
      const key = `${prog.department_id}|${prog.program_name}`;
      progKeyToIdMap.set(key, prog.id);
    });

    // Fetch all semesters for the programs
    const programIds = programs?.map((p) => p.id) || [];
    const { data: semesters, error: semError } = await supabase
      .from('semesters')
      .select('id, semester_code, semester_name, program_id')
      .in('program_id', programIds);

    if (semError) {
      console.error('[course-mappings/import] Semesters lookup error:', semError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch semesters'
        },
        { status: 500 }
      );
    }

    // Map semesters by program_id + semester_name
    const semKeyToIdMap = new Map<string, string>();
    semesters?.forEach((sem) => {
      const key = `${sem.program_id}|${sem.semester_name}`;
      semKeyToIdMap.set(key, sem.id);
    });

    // Fetch all courses for the institutions
    const { data: courses, error: courseError } = await supabase
      .from('courses')
      .select('id, course_code, course_name, institution_id')
      .in('institution_id', institutionIds);

    if (courseError) {
      console.error('[course-mappings/import] Courses lookup error:', courseError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch courses'
        },
        { status: 500 }
      );
    }

    // Map courses by institution_id + course_name
    const courseKeyToIdMap = new Map<string, string>();
    courses?.forEach((course) => {
      const key = `${course.institution_id}|${course.course_name}`;
      courseKeyToIdMap.set(key, course.id);
    });

    // Fetch existing course mappings for duplicate checking
    const semesterIds = semesters?.map((s) => s.id) || [];
    const { data: existingMappings, error: mappingError } = await supabase
      .from('course_mappings')
      .select('course_id, semester_id')
      .in('semester_id', semesterIds);

    if (mappingError) {
      console.error('[course-mappings/import] Mappings lookup error:', mappingError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to check existing course mappings'
        },
        { status: 500 }
      );
    }

    const existingMappingKeys = new Set(
      existingMappings?.map((m) => `${m.course_id}|${m.semester_id}`) || []
    );

    // Validate each row (5-level hierarchy with NAME-based lookup)
    parsedRows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 for header

      // Level 1: Check institution name exists
      if (!validInstitutionNames.has(row.institution_name)) {
        validationErrors.push({
          row: rowNumber,
          field: 'institution_name',
          message: `Institution "${row.institution_name}" not found`
        });
        return; // Skip further validation
      }

      const institutionId = institutionNameToIdMap.get(row.institution_name)!;

      // Level 2: Check degree name exists and belongs to institution
      const degreeKey = `${institutionId}|${row.degree_name}`;
      const degreeUuid = degreeKeyToIdMap.get(degreeKey);

      if (!degreeUuid) {
        validationErrors.push({
          row: rowNumber,
          field: 'degree_name',
          message: `Degree "${row.degree_name}" not found for institution "${row.institution_name}"`
        });
        return; // Skip further validation
      }

      // Level 3: Check department name exists and belongs to degree
      const deptKey = `${degreeUuid}|${row.department_name}`;
      const deptUuid = deptKeyToIdMap.get(deptKey);

      if (!deptUuid) {
        validationErrors.push({
          row: rowNumber,
          field: 'department_name',
          message: `Department "${row.department_name}" not found for degree "${row.degree_name}"`
        });
        return; // Skip further validation
      }

      // Level 4: Check program name exists and belongs to department
      const progKey = `${deptUuid}|${row.program_name}`;
      const progUuid = progKeyToIdMap.get(progKey);

      if (!progUuid) {
        validationErrors.push({
          row: rowNumber,
          field: 'program_name',
          message: `Program "${row.program_name}" not found for department "${row.department_name}"`
        });
        return; // Skip further validation
      }

      // Level 5: Check semester name exists and belongs to program
      const semKey = `${progUuid}|${row.semester_name}`;
      const semUuid = semKeyToIdMap.get(semKey);

      if (!semUuid) {
        validationErrors.push({
          row: rowNumber,
          field: 'semester_name',
          message: `Semester "${row.semester_name}" not found for program "${row.program_name}"`
        });
        return; // Skip further validation
      }

      // Course validation: Check course belongs to institution
      const courseKey = `${institutionId}|${row.course_name}`;
      const courseUuid = courseKeyToIdMap.get(courseKey);

      if (!courseUuid) {
        validationErrors.push({
          row: rowNumber,
          field: 'course_name',
          message: `Course "${row.course_name}" not found for institution "${row.institution_name}"`
        });
        return; // Skip further validation
      }

      // Check mapping doesn't already exist in database
      const mappingKey = `${courseUuid}|${semUuid}`;
      if (existingMappingKeys.has(mappingKey)) {
        validationErrors.push({
          row: rowNumber,
          field: 'course_name',
          message: `Course "${row.course_name}" is already mapped to semester "${row.semester_name}"`
        });
        return;
      }

      // Store resolved UUIDs for database insertion
      row.institution_uuid = institutionId;
      row.degree_uuid = degreeUuid;
      row.department_uuid = deptUuid;
      row.program_uuid = progUuid;
      row.semester_uuid = semUuid;
      row.course_uuid = courseUuid;
    });

    if (validationErrors.length > 0) {
      const result: ImportResult = {
        success: false,
        successCount: 0,
        errorCount: validationErrors.length,
        totalRows: parsedRows.length,
        errors: validationErrors
      };
      return NextResponse.json(result, { status: 400 });
    }

    // ========================================================================
    // STEP 4: INSERT VALID ROWS
    // ========================================================================

    const mappingsToInsert = parsedRows
      .filter((row) => row.course_uuid && row.semester_uuid)
      .map((row) => ({
        institution_id: row.institution_uuid!,
        degree_id: row.degree_uuid!,
        department_id: row.department_uuid!,
        program_id: row.program_uuid!,
        semester_id: row.semester_uuid!,
        course_id: row.course_uuid!,
        is_active: row.is_active,
        created_by: user.id
      }));

    const { data: insertedMappings, error: insertError } = await supabase
      .from('course_mappings')
      .insert(mappingsToInsert)
      .select();

    if (insertError) {
      console.error('[course-mappings/import] Insert error:', insertError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: `Failed to insert course mappings: ${insertError.message}`
        },
        { status: 500 }
      );
    }

    // ========================================================================
    // STEP 5: RETURN SUCCESS
    // ========================================================================

    const result: ImportResult = {
      success: true,
      successCount: insertedMappings?.length || 0,
      errorCount: 0,
      totalRows: parsedRows.length,
      errors: []
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[course-mappings/import] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Import failed',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}
