// app/api/organizations/courses/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

/**
 * GET /api/organizations/courses/template
 *
 * Generates a blank Excel template with dropdown validation for bulk course creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - Dropdown validation for Institution Code
 * - Lists sheet with reference data
 * - Sample row with placeholder data for guidance
 * - Frozen header row
 * - Bold header formatting
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
      .order('counselling_code');

    if (instError) {
      console.error('[courses/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionCodes = institutions?.map((i) => i.counselling_code).filter(Boolean) || [];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Courses (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Courses');

    // Define columns
    worksheet.columns = [
      { header: 'Counselling Code', key: 'counselling_code', width: 20 },
      { header: 'Course Code', key: 'course_code', width: 20 },
      { header: 'Course Name', key: 'course_name', width: 40 },
      { header: 'Status', key: 'is_active', width: 12 }
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
      fgColor: { argb: 'FF2563EB' } // Modern blue color
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 22;

    // Freeze first row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Add sample row with placeholder data for guidance
    worksheet.addRow({
      counselling_code: institutionCodes[0] || 'COUNS001',
      course_code: 'CS101',
      course_name: 'Introduction to Computer Science',
      is_active: 'Active'
    });

    // Style sample row - Dark text with light yellow background to indicate example
    worksheet.getRow(2).font = {
      name: 'Arial',
      size: 10,
      color: { argb: 'FF1F2937' } // Dark gray text (readable)
    };
    worksheet.getRow(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFBEB' } // Light yellow background
    };
    worksheet.getRow(2).alignment = { vertical: 'middle' };

    // Add a note cell to indicate this is sample data
    const noteCell = worksheet.getCell('A2');
    noteCell.note = {
      texts: [
        {
          font: { bold: true, size: 9, color: { argb: 'FF0000FF' } },
          text: 'Sample Data Row\n'
        },
        {
          font: { size: 9 },
          text: 'Replace this row with your actual course data.\nYou can delete this row after adding your data.'
        }
      ]
    };

    // Apply default font to all data cells (rows 3+)
    for (let row = 3; row <= 100; row++) {
      worksheet.getRow(row).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF374151' } // Dark readable text
      };
    }

    // ============================================================
    // SHEET 2: Lists (Reference Data for Dropdowns)
    // ============================================================
    const listsSheet = workbook.addWorksheet('Lists');

    // Add headers
    listsSheet.addRow(['Institution Code', 'Status']);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Add dropdown values
    const maxRows = Math.max(institutionCodes.length, 2);

    for (let i = 0; i < maxRows; i++) {
      listsSheet.addRow([
        institutionCodes[i] || '',
        i === 0 ? 'Active' : i === 1 ? 'Inactive' : ''
      ]);
    }

    // Auto-fit columns in Lists sheet
    listsSheet.columns = [{ width: 20 }, { width: 12 }];

    // ============================================================
    // DATA VALIDATION (Dropdowns) - Using inline lists
    // ============================================================

    // Define validation end row (limited to 100 to prevent XML bloat)
    const validationEndRow = 100;

    // Create inline list formulas
    const institutionCodeList = `"${institutionCodes.join(',')}"`;
    const statusList = '"Active,Inactive"';

    // Apply validation cell-by-cell
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Institution Code dropdown
      if (institutionCodes.length > 0) {
        worksheet.getCell(`A${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [institutionCodeList],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: `Please select from: ${institutionCodes.slice(0, 5).join(', ')}${institutionCodes.length > 5 ? '...' : ''}`
        };
      }

      // Column D: Status dropdown
      worksheet.getCell(`D${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [statusList],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: 'Please select: Active or Inactive'
      };
    }

    // ============================================================
    // INSTRUCTIONS SHEET (Optional)
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');

    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK COURSE IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Institution Code: Select from dropdown (existing institution)',
      '   - Course Code: Unique course code (e.g., CS101, MATH201)',
      '   - Course Name: Full course name',
      '   - Status: Active or Inactive',
      '',
      '2. DATA VALIDATION:',
      '   - Institution Code has dropdown validation',
      '   - ALWAYS use the dropdown to select values',
      '   - Course Code must be unique within the institution',
      '',
      '3. FORMATTING:',
      '   - Course Code: Alphanumeric (e.g., CS101, MATH-201)',
      '   - Course Name: Descriptive name (2-255 characters)',
      '   - Status: Active or Inactive',
      '',
      '4. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '5. IMPORT PROCESS:',
      '   - Fill in your course data starting from row 2',
      '   - Save the file',
      '   - Upload via the Import button in the Courses page',
      '   - Review the import results and fix any errors',
      '',
      '6. TIPS:',
      '   - Course Codes must be unique within each institution',
      '   - Use consistent naming conventions',
      '   - Verify institution code exists before importing',
      '',
      'For support, contact your system administrator.'
    ];

    instructions.forEach((line, index) => {
      const row = instructionsSheet.addRow([line]);
      if (index === 0) {
        row.font = {
          bold: true,
          size: 14,
          name: 'Arial',
          color: { argb: 'FF1E3A8A' }
        };
      } else if (line.match(/^\d+\./)) {
        row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else {
        row.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // ============================================================
    // HIDE LISTS SHEET (Recommended)
    // ============================================================
    listsSheet.state = 'hidden';

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=courses-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/courses/template] Error:', error);
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
