// app/api/organizations/semesters/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {

  mapLabelToValue,
  getInvalidLabelError
} from '@/lib/utils/mappings/semester-excel-mappings';

/**
 * POST /api/organizations/semesters/import
 *
 * Bulk import semesters from Excel file with 4-level cascading validation
 *
 * Features:
 * - Parses Excel files with 12 columns
 * - Case-insensitive dropdown value mapping
 * - 4-level FK validation (Institution → Degree → Department → Program)
 * - Duplicate detection (within file + database)
 * - Row-level error reporting
 * - Rollback on validation errors
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
  duplicateCodes?: string[];
}

interface ParsedSemesterRow {
  institution_name: string;
  degree_name: string;
  department_name: string;
  program_name: string;
  semester_code: string;
  semester_name: string;
  semester_type: string;
  is_active: boolean;
  semester_order?: number;
  initial_semester: boolean;
  terminal_semester: boolean;
  semester_group?: string;
  // Resolved codes/IDs and UUIDs (filled during validation)
  counselling_code?: string;
  degree_id?: string;
  department_code?: string;
  program_id?: string;
  institution_uuid?: string;
  degree_uuid?: string;
  department_uuid?: string;
  program_uuid?: string;
}

// ============================================================================
// ZOD SCHEMA
// ============================================================================

const semesterRowSchema = z.object({
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
  semester_code: z
    .string()
    .min(2, 'Semester code must be at least 2 characters')
    .max(20, 'Semester code must be 20 characters or less')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Semester code must be uppercase letters, numbers, underscores, or hyphens'
    ),
  semester_name: z
    .string()
    .min(2, 'Semester name must be at least 2 characters')
    .max(255, 'Semester name must be 255 characters or less'),
  semester_type: z.enum(['even', 'odd'], {
    errorMap: () => ({ message: 'Semester type must be "even" or "odd"' })
  }),
  is_active: z.boolean(),
  semester_order: z
    .number()
    .int('Semester order must be an integer')
    .optional(),
  initial_semester: z.boolean(),
  terminal_semester: z.boolean(),
  semester_group: z
    .string()
    .max(50, 'Semester group must be 50 characters or less')
    .optional()
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
 * Parse a single Excel row into a semester object
 */
function parseExcelRow(
  row: ExcelJS.Row,
  rowNumber: number
): { data: ParsedSemesterRow | null; errors: ImportError[] } {
  const errors: ImportError[] = [];

  // Extract cell values (columns A-L) - Now using NAMES instead of codes/IDs
  const institutionName = getCellValue(row.getCell(1));
  const degreeName = getCellValue(row.getCell(2));
  const departmentName = getCellValue(row.getCell(3));
  const programName = getCellValue(row.getCell(4));
  const semesterCode = getCellValue(row.getCell(5));
  const semesterName = getCellValue(row.getCell(6));
  const semesterTypeLabel = getCellValue(row.getCell(7));
  const isActiveLabel = getCellValue(row.getCell(8));
  const semesterOrderStr = getCellValue(row.getCell(9));
  const initialSemesterLabel = getCellValue(row.getCell(10));
  const terminalSemesterLabel = getCellValue(row.getCell(11));
  const semesterGroup = getCellValue(row.getCell(12));

  // Skip completely empty rows
  if (
    !institutionName &&
    !degreeName &&
    !departmentName &&
    !programName &&
    !semesterCode &&
    !semesterName &&
    !semesterTypeLabel
  ) {
    return { data: null, errors: [] };
  }

  // Map dropdown labels to database values
  const semesterType = semesterTypeLabel
    ? mapLabelToValue(semesterTypeLabel, 'semesterType')
    : null;

  // Validate semester type dropdown
  if (semesterTypeLabel && !semesterType) {
    errors.push({
      row: rowNumber,
      field: 'semester_type',
      message: getInvalidLabelError(semesterTypeLabel, 'semesterType', rowNumber)
    });
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

  // Map initial_semester dropdown (default to false if blank)
  let initialSemester = false;
  if (initialSemesterLabel) {
    const initialMapped = mapLabelToValue(initialSemesterLabel, 'yesNo');
    if (initialMapped === null) {
      errors.push({
        row: rowNumber,
        field: 'initial_semester',
        message: getInvalidLabelError(initialSemesterLabel, 'yesNo', rowNumber)
      });
    } else {
      initialSemester = initialMapped === 'true';
    }
  }

  // Map terminal_semester dropdown (default to false if blank)
  let terminalSemester = false;
  if (terminalSemesterLabel) {
    const terminalMapped = mapLabelToValue(terminalSemesterLabel, 'yesNo');
    if (terminalMapped === null) {
      errors.push({
        row: rowNumber,
        field: 'terminal_semester',
        message: getInvalidLabelError(terminalSemesterLabel, 'yesNo', rowNumber)
      });
    } else {
      terminalSemester = terminalMapped === 'true';
    }
  }

  // Parse semester_order (optional)
  let semesterOrder: number | undefined = undefined;
  if (semesterOrderStr) {
    const parsed = parseInt(semesterOrderStr, 10);
    if (isNaN(parsed)) {
      errors.push({
        row: rowNumber,
        field: 'semester_order',
        message: `Semester order must be a number, got "${semesterOrderStr}"`
      });
    } else {
      semesterOrder = parsed;
    }
  }

  // Construct semester object - using NAMES (keep original case, just trim)
  const semesterData: ParsedSemesterRow = {
    institution_name: institutionName.trim(),
    degree_name: degreeName.trim(),
    department_name: departmentName.trim(),
    program_name: programName.trim(),
    semester_code: semesterCode.toUpperCase(),
    semester_name: semesterName,
    semester_type: semesterType || '',
    is_active: isActive,
    semester_order: semesterOrder,
    initial_semester: initialSemester,
    terminal_semester: terminalSemester,
    semester_group: semesterGroup || undefined
  };

  // If there are dropdown validation errors, return early
  if (errors.length > 0) {
    return { data: null, errors };
  }

  // Zod validation
  try {
    semesterRowSchema.parse(semesterData);
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

  return { data: semesterData, errors: [] };
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
        { error: 'Unauthorized', message: 'You must be logged in to import semesters' },
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

    const parsedRows: ParsedSemesterRow[] = [];
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

    const codeMap = new Map<string, number[]>();

    parsedRows.forEach((row, index) => {
      const key = `${row.program_name}|${row.semester_code}`;
      if (!codeMap.has(key)) {
        codeMap.set(key, []);
      }
      codeMap.get(key)!.push(index + 2); // +2 for header row
    });

    const duplicatesInFile = Array.from(codeMap.entries())
      .filter(([_, indices]) => indices.length > 1)
      .map(
        ([key, indices]) =>
          `Semester "${key.split('|')[1]}" in program "${key.split('|')[0]}" appears in rows: ${indices.join(', ')}`
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
        duplicateCodes: duplicatesInFile
      };
      return NextResponse.json(result, { status: 400 });
    }

    // ========================================================================
    // STEP 3: VALIDATE 4-LEVEL FK HIERARCHY & CHECK DUPLICATES IN DATABASE
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
      console.error('[semesters/import] Institution lookup error:', instError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to validate institution names'
        },
        { status: 500 }
      );
    }

    // Create name-to-code and name-to-UUID mappings for institutions
    const institutionNameToCodeMap = new Map<string, string>();
    const institutionNameToIdMap = new Map<string, string>();
    institutions?.forEach((inst) => {
      institutionNameToCodeMap.set(inst.name, inst.counselling_code);
      institutionNameToIdMap.set(inst.name, inst.id);
    });

    const validInstitutionNames = new Set(
      institutions?.map((i) => i.name) || []
    );

    // Fetch all degrees for the institutions (including degree_name for mapping)
    const institutionIds = Array.from(institutionNameToIdMap.values());
    const { data: degrees, error: degreeError } = await supabase
      .from('degrees')
      .select('id, degree_id, degree_name, institution_id')
      .in('institution_id', institutionIds);

    if (degreeError) {
      console.error('[semesters/import] Degrees lookup error:', degreeError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch degrees'
        },
        { status: 500 }
      );
    }

    // Map degrees by institution_id + degree_name (names can repeat across institutions)
    const degreeKeyToIdMap = new Map<string, string>();
    const degreeKeyToCodeMap = new Map<string, string>();
    degrees?.forEach((deg) => {
      const key = `${deg.institution_id}|${deg.degree_name}`;
      degreeKeyToIdMap.set(key, deg.id);
      degreeKeyToCodeMap.set(key, deg.degree_id);
    });

    // Fetch all departments for the degrees (including department_name for mapping)
    const degreeIds = degrees?.map((d) => d.id) || [];
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, department_code, department_name, degree_id')
      .in('degree_id', degreeIds);

    if (deptError) {
      console.error('[semesters/import] Departments lookup error:', deptError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch departments'
        },
        { status: 500 }
      );
    }

    // Map departments by degree_id + department_name (names can repeat across degrees)
    const deptKeyToIdMap = new Map<string, string>();
    const deptKeyToCodeMap = new Map<string, string>();
    departments?.forEach((dept) => {
      const key = `${dept.degree_id}|${dept.department_name}`;
      deptKeyToIdMap.set(key, dept.id);
      deptKeyToCodeMap.set(key, dept.department_code);
    });

    // Fetch all programs for the departments (including program_name for mapping)
    const departmentIds = departments?.map((d) => d.id) || [];
    const { data: programs, error: progError } = await supabase
      .from('programs')
      .select('id, program_id, program_name, department_id')
      .in('department_id', departmentIds);

    if (progError) {
      console.error('[semesters/import] Programs lookup error:', progError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to fetch programs'
        },
        { status: 500 }
      );
    }

    // Map programs by department_id + program_name (names can repeat across departments)
    const progKeyToIdMap = new Map<string, string>();
    const progKeyToCodeMap = new Map<string, string>();
    programs?.forEach((prog) => {
      const key = `${prog.department_id}|${prog.program_name}`;
      progKeyToIdMap.set(key, prog.id);
      progKeyToCodeMap.set(key, prog.program_id);
    });

    // Fetch existing semesters for duplicate checking
    const programIds = programs?.map((p) => p.id) || [];
    const { data: existingSemesters, error: semesterError } = await supabase
      .from('semesters')
      .select('program_id, semester_code')
      .in('program_id', programIds);

    if (semesterError) {
      console.error('[semesters/import] Semesters lookup error:', semesterError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to check existing semesters'
        },
        { status: 500 }
      );
    }

    const existingSemesterKeys = new Set(
      existingSemesters?.map((s) => `${s.program_id}|${s.semester_code}`) || []
    );

    // Validate each row (4-level hierarchy with NAME-based lookup)
    parsedRows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 for header

      // Level 1: Check institution name exists and map to code + UUID
      if (!validInstitutionNames.has(row.institution_name)) {
        validationErrors.push({
          row: rowNumber,
          field: 'institution_name',
          message: `Institution "${row.institution_name}" not found`
        });
        return; // Skip further validation
      }

      const institutionId = institutionNameToIdMap.get(row.institution_name)!;
      const counsellingCode = institutionNameToCodeMap.get(row.institution_name)!;

      // Level 2: Check degree name exists and belongs to institution
      const degreeKey = `${institutionId}|${row.degree_name}`;
      const degreeUuid = degreeKeyToIdMap.get(degreeKey);
      const degreeId = degreeKeyToCodeMap.get(degreeKey);

      if (!degreeUuid || !degreeId) {
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
      const departmentCode = deptKeyToCodeMap.get(deptKey);

      if (!deptUuid || !departmentCode) {
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
      const programId = progKeyToCodeMap.get(progKey);

      if (!progUuid || !programId) {
        validationErrors.push({
          row: rowNumber,
          field: 'program_name',
          message: `Program "${row.program_name}" not found for department "${row.department_name}"`
        });
        return; // Skip further validation
      }

      // Check semester doesn't already exist in database
      const semesterKey = `${progUuid}|${row.semester_code}`;
      if (existingSemesterKeys.has(semesterKey)) {
        validationErrors.push({
          row: rowNumber,
          field: 'semester_code',
          message: `Semester "${row.semester_code}" already exists in program "${row.program_name}"`
        });
        return;
      }

      // Store resolved codes/IDs and UUIDs for database insertion
      row.counselling_code = counsellingCode;
      row.degree_id = degreeId;
      row.department_code = departmentCode;
      row.program_id = programId;
      row.institution_uuid = institutionId;
      row.degree_uuid = degreeUuid;
      row.department_uuid = deptUuid;
      row.program_uuid = progUuid;
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

    const semestersToInsert = parsedRows.map((row) => ({
      institution_id: row.institution_uuid!,
      degree_id: row.degree_uuid!,
      department_id: row.department_uuid!,
      program_id: row.program_uuid!,
      semester_code: row.semester_code,
      semester_name: row.semester_name,
      semester_type: row.semester_type,
      is_active: row.is_active,
      semester_order: row.semester_order || null,
      initial_semester: row.initial_semester,
      terminal_semester: row.terminal_semester,
      semester_group: row.semester_group || null,
      created_by: user.id
    }));

    const { data: insertedSemesters, error: insertError } = await supabase
      .from('semesters')
      .insert(semestersToInsert)
      .select();

    if (insertError) {
      console.error('[semesters/import] Insert error:', insertError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: `Failed to insert semesters: ${insertError.message}`
        },
        { status: 500 }
      );
    }

    // ========================================================================
    // STEP 5: RETURN SUCCESS
    // ========================================================================

    const result: ImportResult = {
      success: true,
      successCount: insertedSemesters?.length || 0,
      errorCount: 0,
      totalRows: parsedRows.length,
      errors: []
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[semesters/import] Unexpected error:', error);
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
