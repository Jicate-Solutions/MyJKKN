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
  counselling_code: z.string().min(2, 'Counselling code is required'),
  degree_id: z.string().min(2, 'Degree ID is required'),
  department_code: z.string().min(2, 'Department code is required'),
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

type ProgramRow = z.infer<typeof programRowSchema>;

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
    // Extract values from Excel row (columns A-L)
    const institutionCode = getCellValue(row.getCell(1).value).toUpperCase();
    const degreeId = getCellValue(row.getCell(2).value).toUpperCase();
    const departmentCode = getCellValue(row.getCell(3).value).toUpperCase();
    const programId = getCellValue(row.getCell(4).value);
    const programName = getCellValue(row.getCell(5).value);
    const programTypeValue = getCellValue(row.getCell(6).value);
    const displayName = getCellValue(row.getCell(7).value);
    const programOrderValue = getCellValue(row.getCell(8).value);
    const durationValue = getCellValue(row.getCell(9).value);
    const patternTypeValue = getCellValue(row.getCell(10).value);
    const partTimeValue = getCellValue(row.getCell(11).value);
    const isActiveValue = getCellValue(row.getCell(12).value);

    // Skip empty rows
    if (!institutionCode && !degreeId && !departmentCode && !programId) {
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
      counselling_code: institutionCode,
      degree_id: degreeId,
      department_code: departmentCode,
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
    // VALIDATE INSTITUTIONS EXIST
    // ============================================================

    const counsellingCodes = [
      ...new Set(validPrograms.map((p) => p.counselling_code))
    ];

    const { data: existingInstitutions, error: instCheckError } = await supabase
      .from('institutions')
      .select('counselling_code, id')
      .in('counselling_code', counsellingCodes);

    if (instCheckError) {
      console.error(
        '[programs/import] Error checking institutions:',
        instCheckError
      );
      return NextResponse.json(
        {
          error: 'Failed to validate institutions',
          message: instCheckError.message
        },
        { status: 500 }
      );
    }

    const validCounsellingCodes = new Set(
      existingInstitutions?.map((i) => i.counselling_code) || []
    );

    const counsellingCodeToIdMap = new Map(
      existingInstitutions?.map((i) => [i.counselling_code, i.id]) || []
    );

    // Filter out programs with invalid counselling codes
    const institutionErrors: ImportError[] = [];
    const programsWithValidInstitutions = validPrograms.filter(
      (prog, index) => {
        const rowNumber = index + 2;

        if (!validCounsellingCodes.has(prog.counselling_code)) {
          institutionErrors.push({
            row: rowNumber,
            field: 'counselling_code',
            message: `Row ${rowNumber}: Counselling code "${prog.counselling_code}" not found`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...institutionErrors);

    if (programsWithValidInstitutions.length === 0) {
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
    // VALIDATE DEGREES EXIST AND BELONG TO INSTITUTION
    // ============================================================

    const degreeIds = [
      ...new Set(programsWithValidInstitutions.map((p) => p.degree_id))
    ];

    const { data: existingDegrees, error: degreeCheckError } = await supabase
      .from('degrees')
      .select('degree_id, id, institution_id')
      .in('degree_id', degreeIds);

    if (degreeCheckError) {
      console.error('[programs/import] Error checking degrees:', degreeCheckError);
      return NextResponse.json(
        {
          error: 'Failed to validate degrees',
          message: degreeCheckError.message
        },
        { status: 500 }
      );
    }

    const degreeToIdMap = new Map(
      existingDegrees?.map((d) => [d.degree_id, d.id]) || []
    );

    const degreeToInstitutionMap = new Map(
      existingDegrees?.map((d) => [d.degree_id, d.institution_id]) || []
    );

    // Filter out programs with invalid degree IDs
    const degreeErrors: ImportError[] = [];
    const programsWithValidDegrees = programsWithValidInstitutions.filter(
      (prog, index) => {
        const rowNumber = index + 2;

        if (!degreeToIdMap.has(prog.degree_id)) {
          degreeErrors.push({
            row: rowNumber,
            field: 'degree_id',
            message: `Row ${rowNumber}: Degree ID "${prog.degree_id}" not found`
          });
          return false;
        }

        // Verify degree belongs to the specified institution
        const degreeInstitutionId = degreeToInstitutionMap.get(prog.degree_id);
        const progInstitutionId = counsellingCodeToIdMap.get(prog.counselling_code);

        if (degreeInstitutionId !== progInstitutionId) {
          degreeErrors.push({
            row: rowNumber,
            field: 'degree_id',
            message: `Row ${rowNumber}: Degree "${prog.degree_id}" does not belong to institution "${prog.counselling_code}"`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...degreeErrors);

    if (programsWithValidDegrees.length === 0) {
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
    // VALIDATE DEPARTMENTS EXIST AND BELONG TO DEGREE
    // ============================================================

    const departmentCodes = [
      ...new Set(programsWithValidDegrees.map((p) => p.department_code))
    ];

    // Get departments with their degree_id
    const { data: existingDepartments, error: deptCheckError } = await supabase
      .from('departments')
      .select('department_code, id, degree_id')
      .in('department_code', departmentCodes);

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

    // Create maps for department validation (key: degree_id:department_code)
    const departmentKeyToIdMap = new Map(
      existingDepartments?.map((d) => {
        // Find the degree_id string from our map
        const degreeIdString = Array.from(degreeToIdMap.entries())
          .find(([, uuid]) => uuid === d.degree_id)?.[0];
        return [`${degreeIdString}:${d.department_code}`, d.id];
      }).filter((entry): entry is [string, string] => entry[0] !== 'undefined:' + entry[0].split(':')[1]) || []
    );

    // Filter out programs with invalid departments
    const departmentErrors: ImportError[] = [];
    const programsWithValidDepartments = programsWithValidDegrees.filter(
      (prog, index) => {
        const rowNumber = index + 2;
        const key = `${prog.degree_id}:${prog.department_code}`;

        if (!departmentKeyToIdMap.has(key)) {
          departmentErrors.push({
            row: rowNumber,
            field: 'department_code',
            message: `Row ${rowNumber}: Department "${prog.department_code}" not found for degree "${prog.degree_id}"`
          });
          return false;
        }

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
      const key = `${prog.degree_id}:${prog.department_code}:${prog.program_id}`;
      if (programIdMap.has(key)) {
        const firstRow = programIdMap.get(key)! + 2;
        const currentRow = index + 2;
        allErrors.push({
          row: currentRow,
          field: 'program_id',
          message: `Row ${currentRow}: Program ID "${prog.program_id}" for department "${prog.department_code}" already exists in row ${firstRow}`
        });
      } else {
        programIdMap.set(key, index);
      }
    });

    // Check for existing program IDs in database
    const departmentUUIDs = [...new Set(
      programsWithValidDepartments.map((p) =>
        departmentKeyToIdMap.get(`${p.degree_id}:${p.department_code}`)!
      )
    )];

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

    // Create reverse map from department UUID to degree:dept key
    const deptUuidToKeyMap = new Map(
      Array.from(departmentKeyToIdMap.entries()).map(([key, uuid]) => [uuid, key])
    );

    const existingProgramSet = new Set(
      existingPrograms?.map((p) => {
        const deptKey = deptUuidToKeyMap.get(p.department_id);
        return `${deptKey}:${p.program_id}`;
      }).filter(Boolean) || []
    );

    // Filter out programs with duplicate IDs
    const duplicateErrors: ImportError[] = [];
    const programsToInsert = programsWithValidDepartments.filter(
      (prog, index) => {
        const rowNumber = index + 2;
        const key = `${prog.degree_id}:${prog.department_code}:${prog.program_id}`;

        if (existingProgramSet.has(key)) {
          duplicateErrors.push({
            row: rowNumber,
            field: 'program_id',
            message: `Row ${rowNumber}: Program ID "${prog.program_id}" already exists for department "${prog.department_code}"`
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
      institution_id: counsellingCodeToIdMap.get(prog.counselling_code)!,
      degree_id: degreeToIdMap.get(prog.degree_id)!,
      department_id: departmentKeyToIdMap.get(`${prog.degree_id}:${prog.department_code}`)!,
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
