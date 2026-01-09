// app/api/organizations/departments/import/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  mapStatusToBoolean,
  getValidationError
} from '@/lib/utils/mappings/department-excel-mappings';
import { z } from 'zod';

/**
 * POST /api/organizations/departments/import
 *
 * Imports departments from an Excel file with dropdown validation
 *
 * Features:
 * - Validates each row independently
 * - Checks for duplicate codes before insertion
 * - Batch processing with detailed error reporting
 * - Returns success/failure counts and error details
 * - Validates counselling_code and degree_id FK relationships
 */

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const departmentRowSchema = z.object({
  counselling_code: z.string().min(2, 'Counselling code is required'),
  degree_id: z
    .string()
    .min(2, 'Degree ID must be at least 2 characters')
    .max(50, 'Degree ID must be at most 50 characters'),
  department_code: z
    .string()
    .min(2, 'Department code must be at least 2 characters')
    .max(20, 'Department code must be at most 20 characters')
    .regex(
      /^[A-Z0-9_-]+$/i,
      'Department code can only contain letters, numbers, underscores, and hyphens'
    ),
  department_name: z
    .string()
    .min(2, 'Department name must be at least 2 characters')
    .max(255, 'Department name must be at most 255 characters'),
  display_name: z.string().max(255).optional(),
  department_order: z.number().int().optional(),
  is_active: z.boolean().default(true)
});

type DepartmentRow = z.infer<typeof departmentRowSchema>;

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
 * Parses degree ID from format "DEGREE_ID (INSTITUTION)" to just "DEGREE_ID"
 */
function parseDegreeId(degreeValue: string): string {
  // Format: "BTECH (COUNS001)" -> "BTECH"
  const match = degreeValue.match(/^([A-Z0-9_-]+)\s*\(/i);
  if (match) {
    return match[1].trim().toUpperCase();
  }
  // If no parentheses, use as-is
  return degreeValue.toUpperCase();
}

/**
 * Parses a row from Excel and maps values
 */
function parseExcelRow(
  row: any,
  rowNumber: number
): {
  data: Partial<DepartmentRow> | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  try {
    // Extract values from Excel row
    const institutionCode = getCellValue(row.getCell(1).value).toUpperCase();
    const degreeValue = getCellValue(row.getCell(2).value);
    const degreeId = parseDegreeId(degreeValue);
    const departmentCode = getCellValue(row.getCell(3).value).toUpperCase();
    const departmentName = getCellValue(row.getCell(4).value);
    const displayName = getCellValue(row.getCell(5).value);
    const departmentOrderValue = getCellValue(row.getCell(6).value);
    const isActiveValue = getCellValue(row.getCell(7).value);

    // Skip empty rows
    if (!institutionCode && !degreeId && !departmentCode) {
      return { data: null, errors: [] };
    }

    // Parse department_order (optional, integer)
    let departmentOrder: number | undefined = undefined;
    if (departmentOrderValue) {
      const parsed = parseInt(departmentOrderValue, 10);
      if (!isNaN(parsed)) {
        departmentOrder = parsed;
      }
    }

    // Parse is_active (defaults to true)
    const isActive = mapStatusToBoolean(isActiveValue);

    const rowData: Partial<DepartmentRow> = {
      counselling_code: institutionCode,
      degree_id: degreeId,
      department_code: departmentCode,
      department_name: departmentName,
      display_name: displayName || undefined,
      department_order: departmentOrder,
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
  rowData: Partial<DepartmentRow>,
  rowNumber: number
): {
  valid: boolean;
  data: DepartmentRow | null;
  errors: ImportError[];
} {
  try {
    const validatedData = departmentRowSchema.parse(rowData);
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

    const worksheet = workbook.getWorksheet('Departments');

    if (!worksheet) {
      return NextResponse.json(
        { error: 'Invalid template. Missing "Departments" sheet.' },
        { status: 400 }
      );
    }

    // ============================================================
    // PARSE AND VALIDATE ROWS
    // ============================================================

    const validDepartments: DepartmentRow[] = [];
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

      validDepartments.push(validatedData);
    });

    // If no valid departments, return errors
    if (validDepartments.length === 0) {
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
    // VALIDATE COUNSELLING CODES EXIST
    // ============================================================

    const counsellingCodes = [
      ...new Set(validDepartments.map((d) => d.counselling_code))
    ];

    const { data: existingInstitutions, error: instCheckError } = await supabase
      .from('institutions')
      .select('counselling_code, id')
      .in('counselling_code', counsellingCodes);

    if (instCheckError) {
      console.error(
        '[departments/import] Error checking institutions:',
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

    // Filter out departments with invalid counselling codes
    const institutionErrors: ImportError[] = [];
    const departmentsWithValidInstitutions = validDepartments.filter(
      (dept, index) => {
        const rowNumber = index + 2;

        if (!validCounsellingCodes.has(dept.counselling_code)) {
          institutionErrors.push({
            row: rowNumber,
            field: 'counselling_code',
            message: `Row ${rowNumber}: Counselling code "${dept.counselling_code}" not found`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...institutionErrors);

    if (departmentsWithValidInstitutions.length === 0) {
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
    // VALIDATE DEGREE IDS EXIST
    // ============================================================

    const degreeIds = [
      ...new Set(departmentsWithValidInstitutions.map((d) => d.degree_id))
    ];

    const { data: existingDegrees, error: degreeCheckError } = await supabase
      .from('degrees')
      .select('degree_id, id, institution_id')
      .in('degree_id', degreeIds);

    if (degreeCheckError) {
      console.error(
        '[departments/import] Error checking degrees:',
        degreeCheckError
      );
      return NextResponse.json(
        {
          error: 'Failed to validate degrees',
          message: degreeCheckError.message
        },
        { status: 500 }
      );
    }

    // Create maps for degree validation
    const degreeToIdMap = new Map(
      existingDegrees?.map((d) => [d.degree_id, d.id]) || []
    );

    const degreeToInstitutionMap = new Map(
      existingDegrees?.map((d) => [d.degree_id, d.institution_id]) || []
    );

    // Filter out departments with invalid degree IDs or institution mismatches
    const degreeErrors: ImportError[] = [];
    const departmentsWithValidDegrees = departmentsWithValidInstitutions.filter(
      (dept, index) => {
        const rowNumber = index + 2;

        if (!degreeToIdMap.has(dept.degree_id)) {
          degreeErrors.push({
            row: rowNumber,
            field: 'degree_id',
            message: `Row ${rowNumber}: Degree ID "${dept.degree_id}" not found`
          });
          return false;
        }

        // Verify degree belongs to the specified institution
        const degreeInstitutionId = degreeToInstitutionMap.get(dept.degree_id);
        const deptInstitutionId = counsellingCodeToIdMap.get(dept.counselling_code);

        if (degreeInstitutionId !== deptInstitutionId) {
          degreeErrors.push({
            row: rowNumber,
            field: 'degree_id',
            message: `Row ${rowNumber}: Degree "${dept.degree_id}" does not belong to institution "${dept.counselling_code}"`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...degreeErrors);

    if (departmentsWithValidDegrees.length === 0) {
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
    // CHECK FOR DUPLICATE DEPARTMENT CODES WITHIN DEGREES
    // ============================================================

    // Check for duplicates within the import file
    const departmentCodeMap = new Map<string, number>();

    departmentsWithValidDegrees.forEach((dept, index) => {
      const key = `${dept.degree_id}:${dept.department_code}`;
      if (departmentCodeMap.has(key)) {
        const firstRow = departmentCodeMap.get(key)! + 2;
        const currentRow = index + 2;
        allErrors.push({
          row: currentRow,
          field: 'department_code',
          message: `Row ${currentRow}: Department code "${dept.department_code}" for degree "${dept.degree_id}" already exists in row ${firstRow}`
        });
      } else {
        departmentCodeMap.set(key, index);
      }
    });

    // Check for existing department codes in database
    const degreeUUIDs = [...new Set(departmentsWithValidDegrees.map((d) => degreeToIdMap.get(d.degree_id)!))];

    const { data: existingDepartments, error: checkError } = await supabase
      .from('departments')
      .select('department_code, degree_id')
      .in('degree_id', degreeUUIDs);

    if (checkError) {
      console.error('[departments/import] Error checking existing departments:', checkError);
      return NextResponse.json(
        {
          error: 'Failed to check for existing departments',
          message: checkError.message
        },
        { status: 500 }
      );
    }

    const existingDepartmentSet = new Set(
      existingDepartments?.map(
        (d) =>
          `${
            Array.from(degreeToIdMap.entries()).find(
              ([, id]) => id === d.degree_id
            )?.[0]
          }:${d.department_code}`
      ) || []
    );

    // Filter out departments with duplicate codes
    const duplicateErrors: ImportError[] = [];
    const departmentsToInsert = departmentsWithValidDegrees.filter(
      (dept, index) => {
        const rowNumber = index + 2;
        const key = `${dept.degree_id}:${dept.department_code}`;

        if (existingDepartmentSet.has(key)) {
          duplicateErrors.push({
            row: rowNumber,
            field: 'department_code',
            message: `Row ${rowNumber}: Department code "${dept.department_code}" already exists for degree "${dept.degree_id}"`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...duplicateErrors);

    // If no departments to insert after duplicate check
    if (departmentsToInsert.length === 0) {
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
    // INSERT DEPARTMENTS
    // ============================================================

    const departmentsWithUUIDs = departmentsToInsert.map((dept) => ({
      institution_id: counsellingCodeToIdMap.get(dept.counselling_code)!,
      degree_id: degreeToIdMap.get(dept.degree_id)!,
      department_code: dept.department_code,
      department_name: dept.department_name,
      display_name: dept.display_name,
      department_order: dept.department_order,
      is_active: dept.is_active
    }));

    const { data: insertedDepartments, error: insertError } = await supabase
      .from('departments')
      .insert(departmentsWithUUIDs)
      .select();

    if (insertError) {
      console.error('[departments/import] Error inserting departments:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to import departments',
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
        successCount: insertedDepartments?.length || 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[departments/import] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to import departments', message: errorMessage },
      { status: 500 }
    );
  }
}
