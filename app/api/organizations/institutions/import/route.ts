// app/api/organizations/institutions/import/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  mapLabelToValue,
  getInvalidLabelError
} from '@/lib/utils/institution-excel-mappings';
import { z } from 'zod';

/**
 * POST /api/organizations/institutions/import
 *
 * Imports institutions from an Excel file with dropdown validation
 *
 * Features:
 * - Validates each row independently
 * - Maps display labels to database values (case-insensitive)
 * - Checks for duplicate codes before insertion
 * - Batch processing with detailed error reporting
 * - Returns success/failure counts and error details
 */

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const institutionRowSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  counselling_code: z
    .string()
    .min(2, 'Counselling code must be at least 2 characters')
    .max(50, 'Counselling code must be at most 50 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Counselling code can only contain uppercase letters, numbers, underscores, and hyphens'
    ),
  institution_type: z.enum(['self', 'autonomous', 'aided']),
  category: z.enum(['ug', 'pg', 'ug_pg']),
  timetable_type: z.enum(['day_order', 'week_order']),
  accredited_by: z.string().min(1, 'Accreditation info is required'),
  address_line1: z.string().min(1, 'Address Line 1 is required'),
  address_line2: z.string().optional(),
  address_line3: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  pin_code: z.string().regex(/^\d{6}$/, 'PIN code must be exactly 6 digits'),
  phone: z.string().regex(/^\+?[0-9\s-()]{10,}$/, 'Invalid phone number format'),
  email: z.string().email('Invalid email format'),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  is_active: z.boolean().default(true)
});

type InstitutionRow = z.infer<typeof institutionRowSchema>;

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
 * Detects whether the Excel file uses old format (with Code column) or new format (without Code)
 * Old format: Name, Code, Counselling Code, Institution Type, ... (18 columns)
 * New format: Name, Counselling Code, Institution Type, ... (17 columns)
 */
function detectTemplateFormat(row: any): 'old' | 'new' {
  // Check if column 3 contains a valid institution type (Self, Autonomous, Aided)
  const col3Value = getCellValue(row.getCell(3).value).toLowerCase();
  const validTypes = ['self', 'autonomous', 'aided'];

  if (validTypes.includes(col3Value)) {
    // Column 3 is institution type → NEW format (no Code column)
    return 'new';
  }

  // Check if column 4 contains institution type → OLD format (with Code column at B)
  const col4Value = getCellValue(row.getCell(4).value).toLowerCase();
  if (validTypes.includes(col4Value)) {
    return 'old';
  }

  // Default to new format if can't detect
  return 'new';
}

/**
 * Parses a row from Excel and maps values
 * Supports both old (with Code) and new (without Code) template formats
 */
function parseExcelRow(row: any, rowNumber: number): {
  data: Partial<InstitutionRow> | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  try {
    // Detect template format (old with Code column, or new without)
    const format = detectTemplateFormat(row);
    const hasCodeColumn = format === 'old';

    // Extract values based on detected format
    const name = getCellValue(row.getCell(1).value);

    let counsellingCode: string;
    let institutionTypeLabel: string;
    let categoryLabel: string;
    let timetableTypeLabel: string;
    let accreditedBy: string;
    let addressLine1: string;
    let addressLine2: string;
    let addressLine3: string;
    let city: string;
    let state: string;
    let country: string;
    let pincode: string;
    let phone: string;
    let email: string;
    let website: string;
    let isActiveValue: string;

    if (hasCodeColumn) {
      // OLD FORMAT: Name, Code, Counselling Code, Institution Type, ... (18 columns)
      counsellingCode = getCellValue(row.getCell(3).value).toUpperCase();
      institutionTypeLabel = getCellValue(row.getCell(4).value);
      categoryLabel = getCellValue(row.getCell(5).value);
      timetableTypeLabel = getCellValue(row.getCell(6).value);
      accreditedBy = getCellValue(row.getCell(7).value);
      addressLine1 = getCellValue(row.getCell(8).value);
      addressLine2 = getCellValue(row.getCell(9).value);
      addressLine3 = getCellValue(row.getCell(10).value);
      city = getCellValue(row.getCell(11).value);
      state = getCellValue(row.getCell(12).value);
      country = getCellValue(row.getCell(13).value);
      pincode = getCellValue(row.getCell(14).value);
      phone = getCellValue(row.getCell(15).value);
      email = getCellValue(row.getCell(16).value);
      website = getCellValue(row.getCell(17).value);
      isActiveValue = getCellValue(row.getCell(18).value);
    } else {
      // NEW FORMAT: Name, Counselling Code, Institution Type, ... (17 columns)
      counsellingCode = getCellValue(row.getCell(2).value).toUpperCase();
      institutionTypeLabel = getCellValue(row.getCell(3).value);
      categoryLabel = getCellValue(row.getCell(4).value);
      timetableTypeLabel = getCellValue(row.getCell(5).value);
      accreditedBy = getCellValue(row.getCell(6).value);
      addressLine1 = getCellValue(row.getCell(7).value);
      addressLine2 = getCellValue(row.getCell(8).value);
      addressLine3 = getCellValue(row.getCell(9).value);
      city = getCellValue(row.getCell(10).value);
      state = getCellValue(row.getCell(11).value);
      country = getCellValue(row.getCell(12).value);
      pincode = getCellValue(row.getCell(13).value);
      phone = getCellValue(row.getCell(14).value);
      email = getCellValue(row.getCell(15).value);
      website = getCellValue(row.getCell(16).value);
      isActiveValue = getCellValue(row.getCell(17).value);
    }

    // Skip empty rows
    if (!name && !counsellingCode) {
      return { data: null, errors: [] };
    }

    // Map dropdown labels to database values (case-insensitive)
    const institutionType = mapLabelToValue(
      institutionTypeLabel,
      'institutionType'
    );
    const category = mapLabelToValue(categoryLabel, 'category');
    const timetableType = mapLabelToValue(timetableTypeLabel, 'timetableType');

    // Validate dropdown mappings
    if (!institutionType && institutionTypeLabel) {
      errors.push({
        row: rowNumber,
        field: 'institution_type',
        message: getInvalidLabelError(
          institutionTypeLabel,
          'institutionType',
          rowNumber
        )
      });
    }

    if (!category && categoryLabel) {
      errors.push({
        row: rowNumber,
        field: 'category',
        message: getInvalidLabelError(categoryLabel, 'category', rowNumber)
      });
    }

    if (!timetableType && timetableTypeLabel) {
      errors.push({
        row: rowNumber,
        field: 'timetable_type',
        message: getInvalidLabelError(
          timetableTypeLabel,
          'timetableType',
          rowNumber
        )
      });
    }

    // Parse is_active (defaults to true)
    let isActive = true;
    if (isActiveValue) {
      const normalizedValue = isActiveValue.toLowerCase();
      if (
        normalizedValue === 'false' ||
        normalizedValue === '0' ||
        normalizedValue === 'no'
      ) {
        isActive = false;
      }
    }

    const rowData: Partial<InstitutionRow> = {
      name,
      counselling_code: counsellingCode,
      institution_type: institutionType as any,
      category: category as any,
      timetable_type: timetableType as any,
      accredited_by: accreditedBy,
      address_line1: addressLine1,
      address_line2: addressLine2 || undefined,
      address_line3: addressLine3 || undefined,
      city,
      state,
      country,
      pin_code: pincode,
      phone,
      email,
      website: website || undefined,
      is_active: isActive
    };

    return { data: rowData, errors };
  } catch (error) {
    errors.push({
      row: rowNumber,
      message: `Failed to parse row: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    return { data: null, errors };
  }
}

/**
 * Validates parsed row data against schema
 */
function validateRowData(
  rowData: Partial<InstitutionRow>,
  rowNumber: number
): {
  valid: boolean;
  data: InstitutionRow | null;
  errors: ImportError[];
} {
  try {
    const validatedData = institutionRowSchema.parse(rowData);
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
          message: `Row ${rowNumber}: Validation failed - ${error instanceof Error ? error.message : 'Unknown error'}`
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
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      !file.name.endsWith('.xlsx') &&
      !file.name.endsWith('.xls')
    ) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet('Institutions');

    if (!worksheet) {
      return NextResponse.json(
        { error: 'Invalid template. Missing "Institutions" sheet.' },
        { status: 400 }
      );
    }

    // ============================================================
    // PARSE AND VALIDATE ROWS
    // ============================================================

    const validInstitutions: InstitutionRow[] = [];
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
      const { valid, data: validatedData, errors: validationErrors } =
        validateRowData(rowData, rowNumber);

      if (!valid || !validatedData) {
        allErrors.push(...validationErrors);
        return;
      }

      validInstitutions.push(validatedData);
    });

    // If no valid institutions, return errors
    if (validInstitutions.length === 0) {
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
    // CHECK FOR DUPLICATE COUNSELLING CODES
    // ============================================================

    const counsellingCodes = validInstitutions.map(
      (inst) => inst.counselling_code
    );

    // Check for duplicates within the import file
    const counsellingCodeCounts = new Map<string, number>();

    counsellingCodes.forEach((code) => {
      counsellingCodeCounts.set(code, (counsellingCodeCounts.get(code) || 0) + 1);
    });

    // Find duplicates within the file
    const duplicatesInFile: string[] = [];
    counsellingCodeCounts.forEach((count, code) => {
      if (count > 1) {
        duplicatesInFile.push(
          `Counselling Code "${code}" appears ${count} times in the file`
        );
      }
    });

    if (duplicatesInFile.length > 0) {
      return NextResponse.json<ImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: duplicatesInFile.length,
          totalRows,
          errors: duplicatesInFile.map((msg) => ({
            row: 0,
            message: msg
          })),
          duplicateCodes: duplicatesInFile
        },
        { status: 400 }
      );
    }

    // Check for existing counselling codes in database
    const { data: existingInstitutions, error: checkError } = await supabase
      .from('institutions')
      .select('counselling_code')
      .in('counselling_code', counsellingCodes);

    if (checkError) {
      console.error('[import] Error checking existing codes:', checkError);
      return NextResponse.json(
        { error: 'Failed to check for existing codes', message: checkError.message },
        { status: 500 }
      );
    }

    const existingCounsellingCodes = new Set(
      existingInstitutions?.map((i: any) => i.counselling_code) || []
    );

    // Filter out institutions with duplicate counselling codes
    const duplicateErrors: ImportError[] = [];
    const institutionsToInsert = validInstitutions.filter((inst, index) => {
      const rowNumber = index + 2; // Excel row number (1-indexed + header)

      if (existingCounsellingCodes.has(inst.counselling_code)) {
        duplicateErrors.push({
          row: rowNumber,
          field: 'counselling_code',
          message: `Row ${rowNumber}: Counselling Code "${inst.counselling_code}" already exists in database`
        });
        return false;
      }

      return true;
    });

    allErrors.push(...duplicateErrors);

    // If no institutions to insert after duplicate check
    if (institutionsToInsert.length === 0) {
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
    // INSERT INSTITUTIONS
    // ============================================================

    const institutionsWithMetadata = institutionsToInsert.map((inst) => ({
      ...inst,
      created_by: user.id
    }));

    const { data: insertedInstitutions, error: insertError } = await supabase
      .from('institutions')
      .insert(institutionsWithMetadata)
      .select();

    if (insertError) {
      console.error('[import] Error inserting institutions:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to import institutions',
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
        successCount: insertedInstitutions?.length || 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[import] Unexpected error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to import institutions', message: errorMessage },
      { status: 500 }
    );
  }
}
