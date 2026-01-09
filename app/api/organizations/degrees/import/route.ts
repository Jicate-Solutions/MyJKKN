// app/api/organizations/degrees/import/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  mapLabelToValue,
  getInvalidLabelError
} from '@/lib/utils/mappings/degree-excel-mappings';

/**
 * POST /api/organizations/degrees/import
 *
 * Bulk import degrees from Excel file with validation
 *
 * Features:
 * - Parses Excel files with 7 columns (Counselling Code, Degree ID, Degree Name, Degree Type, Display Name, Degree Order, Is Active)
 * - Case-insensitive dropdown value mapping
 * - FK validation (counselling_code must exist)
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

interface ParsedDegreeRow {
  counselling_code: string;
  degree_id: string;
  degree_name: string;
  degree_type: string;
  display_name?: string;
  degree_order?: number;
  is_active: boolean;
}

// ============================================================================
// ZOD SCHEMA
// ============================================================================

const degreeRowSchema = z.object({
  counselling_code: z
    .string()
    .min(2, 'Counselling code must be at least 2 characters')
    .max(50, 'Counselling code must be 50 characters or less')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Counselling code must be uppercase letters, numbers, underscores, or hyphens'
    ),
  degree_id: z
    .string()
    .min(2, 'Degree ID must be at least 2 characters')
    .max(50, 'Degree ID must be 50 characters or less')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Degree ID must be uppercase letters, numbers, underscores, or hyphens'
    ),
  degree_name: z
    .string()
    .min(2, 'Degree name must be at least 2 characters')
    .max(255, 'Degree name must be 255 characters or less'),
  degree_type: z.enum(['ug', 'pg'], {
    errorMap: () => ({ message: 'Degree type must be "ug" or "pg"' })
  }),
  display_name: z
    .string()
    .max(100, 'Display name must be 100 characters or less')
    .optional(),
  degree_order: z
    .number()
    .int('Degree order must be an integer')
    .optional(),
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
 * Parse a single Excel row into a degree object
 */
function parseExcelRow(
  row: ExcelJS.Row,
  rowNumber: number
): { data: ParsedDegreeRow | null; errors: ImportError[] } {
  const errors: ImportError[] = [];

  // Extract cell values (columns A-G)
  const institutionCode = getCellValue(row.getCell(1));
  const degreeId = getCellValue(row.getCell(2));
  const degreeName = getCellValue(row.getCell(3));
  const degreeTypeLabel = getCellValue(row.getCell(4));
  const displayName = getCellValue(row.getCell(5));
  const degreeOrderStr = getCellValue(row.getCell(6));
  const isActiveLabel = getCellValue(row.getCell(7));

  // Skip completely empty rows
  if (
    !institutionCode &&
    !degreeId &&
    !degreeName &&
    !degreeTypeLabel &&
    !displayName &&
    !degreeOrderStr &&
    !isActiveLabel
  ) {
    return { data: null, errors: [] };
  }

  // Map dropdown labels to database values
  const degreeType = degreeTypeLabel
    ? mapLabelToValue(degreeTypeLabel, 'degreeType')
    : null;

  // Validate degree type dropdown
  if (degreeTypeLabel && !degreeType) {
    errors.push({
      row: rowNumber,
      field: 'degree_type',
      message: getInvalidLabelError(degreeTypeLabel, 'degreeType', rowNumber)
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

  // Parse degree_order (optional)
  let degreeOrder: number | undefined = undefined;
  if (degreeOrderStr) {
    const parsed = parseInt(degreeOrderStr, 10);
    if (isNaN(parsed)) {
      errors.push({
        row: rowNumber,
        field: 'degree_order',
        message: `Degree order must be a number, got "${degreeOrderStr}"`
      });
    } else {
      degreeOrder = parsed;
    }
  }

  // Construct degree object
  const degreeData: ParsedDegreeRow = {
    counselling_code: institutionCode,
    degree_id: degreeId,
    degree_name: degreeName,
    degree_type: degreeType || '',
    display_name: displayName || undefined,
    degree_order: degreeOrder,
    is_active: isActive
  };

  // If there are dropdown validation errors, return early
  if (errors.length > 0) {
    return { data: null, errors };
  }

  // Zod validation
  try {
    degreeRowSchema.parse(degreeData);
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

  return { data: degreeData, errors: [] };
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
        { error: 'Unauthorized', message: 'You must be logged in to import degrees' },
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

    const parsedRows: ParsedDegreeRow[] = [];
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
      const key = `${row.counselling_code}|${row.degree_id}`;
      if (!codeMap.has(key)) {
        codeMap.set(key, []);
      }
      codeMap.get(key)!.push(index + 2); // +2 for header row
    });

    const duplicatesInFile = Array.from(codeMap.entries())
      .filter(([_, indices]) => indices.length > 1)
      .map(
        ([key, indices]) =>
          `Degree "${key.split('|')[1]}" in institution "${key.split('|')[0]}" appears in rows: ${indices.join(', ')}`
      );

    if (duplicatesInFile.length > 0) {
      const result: ImportResult = {
        success: false,
        successCount: 0,
        errorCount: duplicatesInFile.length,
        totalRows: parsedRows.length,
        errors: duplicatesInFile.map((msg, index) => ({
          row: 0,
          message: msg
        })),
        duplicateCodes: duplicatesInFile
      };
      return NextResponse.json(result, { status: 400 });
    }

    // ========================================================================
    // STEP 3: VALIDATE FOREIGN KEYS & CHECK DUPLICATES IN DATABASE
    // ========================================================================

    const validationErrors: ImportError[] = [];

    // Get all unique counselling codes from parsed rows
    const uniqueCounsellingCodes = [
      ...new Set(parsedRows.map((r) => r.counselling_code))
    ];

    // Fetch all institutions with both counselling_code and id
    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, counselling_code')
      .in('counselling_code', uniqueCounsellingCodes);

    if (instError) {
      console.error('[degrees/import] Institution lookup error:', instError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to validate counselling codes'
        },
        { status: 500 }
      );
    }

    // Create mapping from counselling_code to institution_id
    const counsellingCodeToIdMap = new Map<string, string>();
    institutions?.forEach((inst) => {
      counsellingCodeToIdMap.set(inst.counselling_code, inst.id);
    });

    const validCounsellingCodes = new Set(
      institutions?.map((i) => i.counselling_code) || []
    );

    // Fetch existing degrees for duplicate checking (with institution lookup)
    const institutionIds = Array.from(counsellingCodeToIdMap.values());
    const { data: existingDegrees, error: degreeError } = await supabase
      .from('degrees')
      .select('institution_id, degree_id')
      .in('institution_id', institutionIds);

    if (degreeError) {
      console.error('[degrees/import] Degrees lookup error:', degreeError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: 'Failed to check existing degrees'
        },
        { status: 500 }
      );
    }

    const existingDegreeKeys = new Set(
      existingDegrees?.map((d) => `${d.institution_id}|${d.degree_id}`) || []
    );

    // Validate each row
    parsedRows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 for header

      // Check institution exists
      if (!validCounsellingCodes.has(row.counselling_code)) {
        validationErrors.push({
          row: rowNumber,
          field: 'counselling_code',
          message: `Counselling code "${row.counselling_code}" not found`
        });
        return; // Skip further validation if institution doesn't exist
      }

      // Get institution_id for this counselling_code
      const institutionId = counsellingCodeToIdMap.get(row.counselling_code);

      // Check degree doesn't already exist in database
      const degreeKey = `${institutionId}|${row.degree_id}`;
      if (existingDegreeKeys.has(degreeKey)) {
        validationErrors.push({
          row: rowNumber,
          field: 'degree_id',
          message: `Degree "${row.degree_id}" already exists in institution "${row.counselling_code}"`
        });
      }
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

    const degreesToInsert = parsedRows.map((row) => ({
      institution_id: counsellingCodeToIdMap.get(row.counselling_code)!, // Map counselling_code to institution_id
      degree_id: row.degree_id,
      degree_name: row.degree_name,
      degree_type: row.degree_type,
      display_name: row.display_name || null,
      degree_order: row.degree_order || null,
      is_active: row.is_active,
      created_by: user.id
    }));

    const { data: insertedDegrees, error: insertError } = await supabase
      .from('degrees')
      .insert(degreesToInsert)
      .select();

    if (insertError) {
      console.error('[degrees/import] Insert error:', insertError);
      return NextResponse.json(
        {
          error: 'Database error',
          message: `Failed to insert degrees: ${insertError.message}`
        },
        { status: 500 }
      );
    }

    // ========================================================================
    // STEP 5: RETURN SUCCESS
    // ========================================================================

    const result: ImportResult = {
      success: true,
      successCount: insertedDegrees?.length || 0,
      errorCount: 0,
      totalRows: parsedRows.length,
      errors: []
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[degrees/import] Unexpected error:', error);
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
