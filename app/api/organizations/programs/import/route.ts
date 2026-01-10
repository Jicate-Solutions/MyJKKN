// app/api/organizations/programs/import/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  mapLabelToValue,
  PROGRAM_TYPE_MAP,
  PATTERN_TYPE_MAP,
  PART_TIME_MAP,
  IS_ACTIVE_MAP
} from '@/lib/utils/mappings/program-excel-mappings';
import { z } from 'zod';

/**
 * POST /api/organizations/programs/import
 *
 * Imports programs from an Excel file with validation
 *
 * Features:
 * - Validates 3-level hierarchy: Institution → Degree → Department
 * - Validates enum fields: program_type, pattern_type, is_part_time
 * - Checks for duplicate program IDs within departments
 * - Batch processing with detailed error reporting
 */

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const programRowSchema = z.object({
  institution_name: z
    .string()
    .min(2, 'Institution name must be at least 2 characters')
    .max(255, 'Institution name must be at most 255 characters'),
  degree_name: z
    .string()
    .min(2, 'Degree name must be at least 2 characters')
    .max(255, 'Degree name must be at most 255 characters'),
  department_name: z
    .string()
    .min(2, 'Department name must be at least 2 characters')
    .max(255, 'Department name must be at most 255 characters'),
  program_id: z
    .string()
    .min(2, 'Program ID must be at least 2 characters')
    .max(50, 'Program ID must be at most 50 characters'),
  program_name: z
    .string()
    .min(2, 'Program name must be at least 2 characters')
    .max(255, 'Program name must be at most 255 characters'),
  program_type: z.enum(['UG', 'PG', 'Ph.D']).optional().nullable(),
  display_name: z.string().max(255).optional().nullable(),
  program_order: z.number().int().optional().nullable(),
  program_duration_yrs: z.number().optional().nullable(),
  pattern_type: z.enum(['Year', 'Semester']).optional().nullable(),
  is_part_time: z.boolean().optional().nullable(),
  is_active: z.boolean().default(true)
});

interface ParsedProgramRow extends z.infer<typeof programRowSchema> {
  // Resolved fields (filled during validation)
  department_code?: string;
  department_uuid?: string;
  degree_uuid?: string;
  institution_uuid?: string;
}

type ProgramRow = ParsedProgramRow;

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Converts Excel cell value to string
 */
function getCellValue(cell: any): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number') return String(cell);
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell).trim();
}

/**
 * Maps status label to boolean
 */
function mapStatusToBoolean(status: string): boolean {
  if (!status) return true; // Default to active
  const normalized = status.toLowerCase().trim();
  return IS_ACTIVE_MAP[normalized] === 'true';
}

/**
 * Maps part time label to boolean
 */
function mapPartTimeToBoolean(partTime: string): boolean | null {
  if (!partTime) return null;
  const normalized = partTime.toLowerCase().trim();
  const mapped = PART_TIME_MAP[normalized];
  if (mapped === undefined) return null;
  return mapped === 'true';
}

/**
 * Parses a row from Excel and maps values
 */
function parseExcelRow(
  row: any,
  rowNumber: number
): {
  data: Partial<ProgramRow> | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  try {
    // Extract values from Excel row (columns A-L) - NEW: Institution Name and Degree Name added
    const institutionName = getCellValue(row.getCell(1).value); // Column A: Institution Name
    const degreeName = getCellValue(row.getCell(2).value); // Column B: Degree Name
    const departmentName = getCellValue(row.getCell(3).value); // Column C: Department Name
    const programId = getCellValue(row.getCell(4).value); // Column D
    const programName = getCellValue(row.getCell(5).value); // Column E
    const programTypeValue = getCellValue(row.getCell(6).value); // Column F
    const displayName = getCellValue(row.getCell(7).value); // Column G
    const programOrderValue = getCellValue(row.getCell(8).value); // Column H
    const durationValue = getCellValue(row.getCell(9).value); // Column I
    const patternTypeValue = getCellValue(row.getCell(10).value); // Column J
    const partTimeValue = getCellValue(row.getCell(11).value); // Column K
    const isActiveValue = getCellValue(row.getCell(12).value); // Column L

    // Skip empty rows
    if (!institutionName && !degreeName && !departmentName && !programId && !programName) {
      return { data: null, errors: [] };
    }

    // Parse program_type (enum)
    let programType: 'UG' | 'PG' | 'Ph.D' | null = null;
    if (programTypeValue) {
      const mapped = mapLabelToValue(programTypeValue, 'programType');
      if (mapped) {
        programType = mapped as 'UG' | 'PG' | 'Ph.D';
      } else {
        errors.push({
          row: rowNumber,
          field: 'program_type',
          message: `Row ${rowNumber}: Invalid program type "${programTypeValue}". Must be UG, PG, or Ph.D`
        });
      }
    }

    // Parse program_order (optional, integer)
    let programOrder: number | null = null;
    if (programOrderValue) {
      const parsed = parseInt(programOrderValue, 10);
      if (!isNaN(parsed)) {
        programOrder = parsed;
      }
    }

    // Parse duration (optional, decimal)
    let duration: number | null = null;
    if (durationValue) {
      const parsed = parseFloat(durationValue);
      if (!isNaN(parsed)) {
        duration = parsed;
      }
    }

    // Parse pattern_type (enum)
    let patternType: 'Year' | 'Semester' | null = null;
    if (patternTypeValue) {
      const mapped = mapLabelToValue(patternTypeValue, 'patternType');
      if (mapped) {
        patternType = mapped as 'Year' | 'Semester';
      } else {
        errors.push({
          row: rowNumber,
          field: 'pattern_type',
          message: `Row ${rowNumber}: Invalid pattern type "${patternTypeValue}". Must be Year or Semester`
        });
      }
    }

    // Parse is_part_time (boolean)
    const isPartTime = mapPartTimeToBoolean(partTimeValue);
    if (partTimeValue && isPartTime === null) {
      errors.push({
        row: rowNumber,
        field: 'is_part_time',
        message: `Row ${rowNumber}: Invalid part time value "${partTimeValue}". Must be Yes or No`
      });
    }

    // Parse is_active (defaults to true)
    const isActive = mapStatusToBoolean(isActiveValue);

    // If there are parsing errors, return them
    if (errors.length > 0) {
      return { data: null, errors };
    }

    const rowData: Partial<ProgramRow> = {
      institution_name: institutionName.trim(),
      degree_name: degreeName.trim(),
      department_name: departmentName.trim(),
      program_id: programId,
      program_name: programName,
      program_type: programType,
      display_name: displayName || null,
      program_order: programOrder,
      program_duration_yrs: duration,
      pattern_type: patternType,
      is_part_time: isPartTime,
      is_active: isActive
    };

    return { data: rowData, errors };
  } catch (error) {
    errors.push({
      row: rowNumber,
      message: `Failed to parse row: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    });
    return { data: null, errors };
  }
}

/**
 * Validates parsed row data against schema
 */
function validateRowData(
  rowData: Partial<ProgramRow>,
  rowNumber: number
): {
  valid: boolean;
  data: ProgramRow | null;
  errors: ImportError[];
} {
  try {
    const validatedData = programRowSchema.parse(rowData);
    return { valid: true, data: validatedData, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: ImportError[] = error.errors.map((err) => ({
        row: rowNumber,
        field: err.path.join('.'),
        message: `Row ${rowNumber}: ${err.path.join('.')} - ${err.message}`
      }));
      return { valid: false, data: null, errors };
    }

    return {
      valid: false,
      data: null,
      errors: [
        {
          row: rowNumber,
          message: `Row ${rowNumber}: Validation failed - ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        }
      ]
    };
  }
}

// ============================================================================
// MAIN IMPORT HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
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

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        {
          error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)'
        },
        { status: 400 }
      );
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet('Programs');

    if (!worksheet) {
      return NextResponse.json(
        { error: 'Invalid template. Missing "Programs" sheet.' },
        { status: 400 }
      );
    }

    // ============================================================
    // PARSE AND VALIDATE ROWS
    // ============================================================

    const validPrograms: ProgramRow[] = [];
    const allErrors: ImportError[] = [];
    let totalRows = 0;

    // Start from row 2 (skip header)
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      totalRows++;

      // Parse row
      const { data: rowData, errors: parseErrors } = parseExcelRow(
        row,
        rowNumber
      );

      if (parseErrors.length > 0) {
        allErrors.push(...parseErrors);
        return;
      }

      if (!rowData) return; // Empty row

      // Validate row
      const {
        valid,
        data: validatedData,
        errors: validationErrors
      } = validateRowData(rowData, rowNumber);

      if (!valid || !validatedData) {
        allErrors.push(...validationErrors);
        return;
      }

      validPrograms.push(validatedData);
    });

    // If no valid programs, return errors
    if (validPrograms.length === 0) {
      return NextResponse.json<ImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors
        },
        { status: 400 }
      );
    }

    // ============================================================
    // VALIDATE DEPARTMENT NAMES EXIST AND MAP TO IDs/UUIDs
    // ============================================================

    const uniqueDepartmentNames = [
      ...new Set(validPrograms.map((p) => p.department_name))
    ];

    // Fetch departments by name with related info
    const { data: existingDepartments, error: deptCheckError } = await supabase
      .from('departments')
      .select('department_code, department_name, id, degree_id, institution_id')
      .in('department_name', uniqueDepartmentNames);

    if (deptCheckError) {
      console.error('[programs/import] Error checking departments:', deptCheckError);
      return NextResponse.json(
        {
          error: 'Failed to validate departments',
          message: deptCheckError.message
        },
        { status: 500 }
      );
    }

    // Create mappings from department_name to code/UUIDs
    const departmentNameToCodeMap = new Map<string, string>();
    const departmentNameToUuidMap = new Map<string, string>();
    const departmentNameToDegreeUuidMap = new Map<string, string>();
    const departmentNameToInstitutionUuidMap = new Map<string, string>();

    existingDepartments?.forEach((d) => {
      departmentNameToCodeMap.set(d.department_name, d.department_code);
      departmentNameToUuidMap.set(d.department_name, d.id);
      departmentNameToDegreeUuidMap.set(d.department_name, d.degree_id);
      departmentNameToInstitutionUuidMap.set(d.department_name, d.institution_id);
    });

    const validDepartmentNames = new Set(
      existingDepartments?.map((d) => d.department_name) || []
    );

    // Validate and resolve department names to codes/UUIDs
    const departmentErrors: ImportError[] = [];
    const programsWithValidDepartments = validPrograms.filter(
      (prog, index) => {
        const rowNumber = index + 2;

        if (!validDepartmentNames.has(prog.department_name)) {
          departmentErrors.push({
            row: rowNumber,
            field: 'department_name',
            message: `Row ${rowNumber}: Department "${prog.department_name}" not found`
          });
          return false;
        }

        // Resolve department name to code and UUIDs
        prog.department_code = departmentNameToCodeMap.get(prog.department_name);
        prog.department_uuid = departmentNameToUuidMap.get(prog.department_name);
        prog.degree_uuid = departmentNameToDegreeUuidMap.get(prog.department_name);
        prog.institution_uuid = departmentNameToInstitutionUuidMap.get(prog.department_name);

        return true;
      }
    );

    allErrors.push(...departmentErrors);

    if (programsWithValidDepartments.length === 0) {
      return NextResponse.json<ImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors
        },
        { status: 400 }
      );
    }

    // ============================================================
    // CHECK FOR DUPLICATE PROGRAM IDS WITHIN DEPARTMENTS
    // ============================================================

    // Check for duplicates within the import file
    const programIdMap = new Map<string, number>();

    programsWithValidDepartments.forEach((prog, index) => {
      const key = `${prog.department_uuid}:${prog.program_id}`;
      if (programIdMap.has(key)) {
        const firstRow = programIdMap.get(key)! + 2;
        const currentRow = index + 2;
        allErrors.push({
          row: currentRow,
          field: 'program_id',
          message: `Row ${currentRow}: Program ID "${prog.program_id}" for department "${prog.department_name}" already exists in row ${firstRow}`
        });
      } else {
        programIdMap.set(key, index);
      }
    });

    // Check for existing program IDs in database
    const departmentUUIDs = [...new Set(programsWithValidDepartments.map((p) => p.department_uuid!))];

    const { data: existingPrograms, error: checkError } = await supabase
      .from('programs')
      .select('program_id, department_id')
      .in('department_id', departmentUUIDs);

    if (checkError) {
      console.error('[programs/import] Error checking existing programs:', checkError);
      return NextResponse.json(
        {
          error: 'Failed to check for existing programs',
          message: checkError.message
        },
        { status: 500 }
      );
    }

    const existingProgramSet = new Set(
      existingPrograms?.map((p) => `${p.department_id}:${p.program_id}`) || []
    );

    // Filter out programs with duplicate IDs
    const duplicateErrors: ImportError[] = [];
    const programsToInsert = programsWithValidDepartments.filter(
      (prog, index) => {
        const rowNumber = index + 2;
        const key = `${prog.department_uuid}:${prog.program_id}`;

        if (existingProgramSet.has(key)) {
          duplicateErrors.push({
            row: rowNumber,
            field: 'program_id',
            message: `Row ${rowNumber}: Program ID "${prog.program_id}" already exists for department "${prog.department_name}"`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...duplicateErrors);

    // If no programs to insert after duplicate check
    if (programsToInsert.length === 0) {
      return NextResponse.json<ImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors
        },
        { status: 400 }
      );
    }

    // ============================================================
    // INSERT PROGRAMS
    // ============================================================

    const programsWithUUIDs = programsToInsert.map((prog) => ({
      institution_id: prog.institution_uuid!,
      degree_id: prog.degree_uuid!,
      department_id: prog.department_uuid!,
      program_id: prog.program_id,
      program_name: prog.program_name,
      program_type: prog.program_type,
      display_name: prog.display_name,
      program_order: prog.program_order,
      program_duration_yrs: prog.program_duration_yrs,
      pattern_type: prog.pattern_type,
      is_part_time: prog.is_part_time,
      is_active: prog.is_active
    }));

    const { data: insertedPrograms, error: insertError } = await supabase
      .from('programs')
      .insert(programsWithUUIDs)
      .select();

    if (insertError) {
      console.error('[programs/import] Error inserting programs:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to import programs',
          message: insertError.message
        },
        { status: 500 }
      );
    }

    // ============================================================
    // RETURN RESULTS
    // ============================================================

    return NextResponse.json<ImportResult>(
      {
        success: true,
        successCount: insertedPrograms?.length || 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[programs/import] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to import programs', message: errorMessage },
      { status: 500 }
    );
  }
}
