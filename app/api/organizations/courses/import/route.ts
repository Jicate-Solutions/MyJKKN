// app/api/organizations/courses/import/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  mapStatusToBoolean,
  getValidationError
} from '@/lib/utils/course-excel-mappings';
import { z } from 'zod';

/**
 * POST /api/organizations/courses/import
 *
 * Imports courses from an Excel file with dropdown validation
 *
 * Features:
 * - Validates each row independently
 * - Checks for duplicate codes before insertion
 * - Batch processing with detailed error reporting
 * - Returns success/failure counts and error details
 * - Validates counselling_code FK relationship
 */

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const courseRowSchema = z.object({
  counselling_code: z.string().min(2, 'Counselling code is required'),
  course_code: z
    .string()
    .min(2, 'Course code must be at least 2 characters')
    .max(50, 'Course code must be at most 50 characters')
    .regex(
      /^[A-Z0-9_-]+$/i,
      'Course code can only contain letters, numbers, underscores, and hyphens'
    ),
  course_name: z
    .string()
    .min(2, 'Course name must be at least 2 characters')
    .max(255, 'Course name must be at most 255 characters'),
  is_active: z.boolean().default(true)
});

type CourseRow = z.infer<typeof courseRowSchema>;

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
 * Parses a row from Excel and maps values
 */
function parseExcelRow(
  row: any,
  rowNumber: number
): {
  data: Partial<CourseRow> | null;
  errors: ImportError[];
} {
  const errors: ImportError[] = [];

  try {
    // Extract values from Excel row
    const institutionCode = getCellValue(row.getCell(1).value).toUpperCase();
    const courseCode = getCellValue(row.getCell(2).value).toUpperCase();
    const courseName = getCellValue(row.getCell(3).value);
    const isActiveValue = getCellValue(row.getCell(4).value);

    // Skip empty rows
    if (!institutionCode && !courseCode) {
      return { data: null, errors: [] };
    }

    // Parse is_active (defaults to true)
    const isActive = mapStatusToBoolean(isActiveValue);

    const rowData: Partial<CourseRow> = {
      counselling_code: institutionCode,
      course_code: courseCode,
      course_name: courseName,
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
  rowData: Partial<CourseRow>,
  rowNumber: number
): {
  valid: boolean;
  data: CourseRow | null;
  errors: ImportError[];
} {
  try {
    const validatedData = courseRowSchema.parse(rowData);
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

    const worksheet = workbook.getWorksheet('Courses');

    if (!worksheet) {
      return NextResponse.json(
        { error: 'Invalid template. Missing "Courses" sheet.' },
        { status: 400 }
      );
    }

    // ============================================================
    // PARSE AND VALIDATE ROWS
    // ============================================================

    const validCourses: CourseRow[] = [];
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

      validCourses.push(validatedData);
    });

    // If no valid courses, return errors
    if (validCourses.length === 0) {
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
      ...new Set(validCourses.map((c) => c.counselling_code))
    ];

    const { data: existingInstitutions, error: instCheckError } = await supabase
      .from('institutions')
      .select('counselling_code, id')
      .in('counselling_code', counsellingCodes);

    if (instCheckError) {
      console.error(
        '[courses/import] Error checking institutions:',
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

    // Filter out courses with invalid counselling codes
    const institutionErrors: ImportError[] = [];
    const coursesWithValidInstitutions = validCourses.filter(
      (course, index) => {
        const rowNumber = index + 2;

        if (!validCounsellingCodes.has(course.counselling_code)) {
          institutionErrors.push({
            row: rowNumber,
            field: 'counselling_code',
            message: `Row ${rowNumber}: Counselling code "${course.counselling_code}" not found`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...institutionErrors);

    if (coursesWithValidInstitutions.length === 0) {
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
    // CHECK FOR DUPLICATE COURSE CODES WITHIN INSTITUTIONS
    // ============================================================

    // Check for duplicates within the import file
    const courseCodeMap = new Map<string, number>();

    coursesWithValidInstitutions.forEach((course, index) => {
      const key = `${course.counselling_code}:${course.course_code}`;
      if (courseCodeMap.has(key)) {
        const firstRow = courseCodeMap.get(key)! + 2;
        const currentRow = index + 2;
        allErrors.push({
          row: currentRow,
          field: 'course_code',
          message: `Row ${currentRow}: Course code "${course.course_code}" for institution "${course.counselling_code}" already exists in row ${firstRow}`
        });
      } else {
        courseCodeMap.set(key, index);
      }
    });

    // Check for existing course codes in database
    const { data: existingCourses, error: checkError } = await supabase
      .from('courses')
      .select('course_code, institution_id')
      .in('institution_id', Array.from(counsellingCodeToIdMap.values()));

    if (checkError) {
      console.error('[courses/import] Error checking existing courses:', checkError);
      return NextResponse.json(
        {
          error: 'Failed to check for existing courses',
          message: checkError.message
        },
        { status: 500 }
      );
    }

    const existingCourseSet = new Set(
      existingCourses?.map(
        (c) =>
          `${
            Array.from(counsellingCodeToIdMap.entries()).find(
              ([, id]) => id === c.institution_id
            )?.[0]
          }:${c.course_code}`
      ) || []
    );

    // Filter out courses with duplicate codes
    const duplicateErrors: ImportError[] = [];
    const coursesToInsert = coursesWithValidInstitutions.filter(
      (course, index) => {
        const rowNumber = index + 2;
        const key = `${course.counselling_code}:${course.course_code}`;

        if (existingCourseSet.has(key)) {
          duplicateErrors.push({
            row: rowNumber,
            field: 'course_code',
            message: `Row ${rowNumber}: Course code "${course.course_code}" already exists for institution "${course.counselling_code}"`
          });
          return false;
        }

        return true;
      }
    );

    allErrors.push(...duplicateErrors);

    // If no courses to insert after duplicate check
    if (coursesToInsert.length === 0) {
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
    // INSERT COURSES
    // ============================================================

    const coursesWithInstitutionIds = coursesToInsert.map((course) => ({
      institution_id: counsellingCodeToIdMap.get(course.counselling_code)!,
      course_code: course.course_code,
      course_name: course.course_name,
      is_active: course.is_active
    }));

    const { data: insertedCourses, error: insertError } = await supabase
      .from('courses')
      .insert(coursesWithInstitutionIds)
      .select();

    if (insertError) {
      console.error('[courses/import] Error inserting courses:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to import courses',
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
        successCount: insertedCourses?.length || 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[courses/import] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to import courses', message: errorMessage },
      { status: 500 }
    );
  }
}
