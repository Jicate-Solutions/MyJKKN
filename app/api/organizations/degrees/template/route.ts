// app/api/organizations/degrees/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {

  EXCEL_DEGREE_TYPES,
  EXCEL_IS_ACTIVE
} from '@/lib/utils/mappings/degree-excel-mappings';

/**
 * GET /api/organizations/degrees/template
 *
 * Generates a blank Excel template with dropdown validation for bulk degree creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - Dropdown validation for Institution Code and Degree Type
 * - Lists sheet with reference data
 * - Sample row with placeholder data for guidance
 * - Frozen header row
 * - Professional styling
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
      .order('name');

    if (instError) {
      console.error('[degrees/template] Error fetching institutions:', instError);
      return NextResponse.json(
        { error: 'Failed to fetch institutions', message: instError.message },
        { status: 500 }
      );
    }

    const institutionNames = institutions?.map((i) => i.name).filter(Boolean) || [];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Degrees (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Degrees');

    // Define columns
    worksheet.columns = [
      { header: 'Institution Name', key: 'institution_name', width: 40 },
      { header: 'Degree ID', key: 'degree_id', width: 20 },
      { header: 'Degree Name', key: 'degree_name', width: 40 },
      { header: 'Degree Type', key: 'degree_type', width: 15 },
      { header: 'Display Name', key: 'display_name', width: 30 },
      { header: 'Degree Order', key: 'degree_order', width: 15 },
      { header: 'Is Active', key: 'is_active', width: 12 }
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
      institution_name: institutionNames[0] || institutions?.[0]?.name || 'Sample Institution',
      degree_id: 'BTECH',
      degree_name: 'Bachelor of Technology',
      degree_type: 'UG',
      display_name: 'B.Tech',
      degree_order: 1,
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
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        { font: { size: 9 }, text: 'Replace this row with your actual degree data.\nYou can delete this row after adding your data.' }
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
    listsSheet.addRow(['Institution Name', 'Degree Type', 'Is Active']);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Add dropdown values
    const maxRows = Math.max(
      institutionNames.length,
      EXCEL_DEGREE_TYPES.length,
      EXCEL_IS_ACTIVE.length
    );

    for (let i = 0; i < maxRows; i++) {
      listsSheet.addRow([
        institutionNames[i] || null,
        EXCEL_DEGREE_TYPES[i] || null,
        EXCEL_IS_ACTIVE[i] || null
      ]);
    }

    // Auto-fit columns in Lists sheet
    listsSheet.columns = [{ width: 20 }, { width: 15 }, { width: 12 }];

    // ============================================================
    // DATA VALIDATION (Dropdowns) - Using Lists sheet references
    // This approach prevents Excel from removing validation on file open
    // ============================================================

    // Helper function to convert column number to letter (A, B, C, ..., Z, AA, AB, ...)
    const getColLetter = (colNum: number): string => {
      let letter = '';
      while (colNum > 0) {
        const rem = (colNum - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        colNum = Math.floor((colNum - 1) / 26);
      }
      return letter;
    };

    // Define validation end row (limited to 100 to prevent XML bloat)
    const validationEndRow = 100;

    // Calculate column letters for Lists sheet references
    const institutionNameColLetter = getColLetter(1); // Column A in Lists sheet
    const degreeTypeColLetter = getColLetter(2); // Column B in Lists sheet
    const isActiveColLetter = getColLetter(3); // Column C in Lists sheet

    // Apply validation cell-by-cell using Lists sheet references
    for (let row = 2; row <= validationEndRow; row++) {
      // Column A: Institution Name dropdown - references Lists!A2:A[n]
      if (institutionNames.length > 0) {
        worksheet.getCell(`A${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${institutionNameColLetter}$2:$${institutionNameColLetter}$${institutionNames.length + 1}`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Invalid Input',
          error: `Please select an Institution Name from the dropdown`
        };
      }

      // Column D: Degree Type dropdown - references Lists!B2:B[n]
      worksheet.getCell(`D${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$${degreeTypeColLetter}$2:$${degreeTypeColLetter}$${EXCEL_DEGREE_TYPES.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_DEGREE_TYPES.join(', ')}`
      };

      // Column G: Is Active dropdown - references Lists!C2:C[n]
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
    // INSTRUCTIONS SHEET (Optional)
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');

    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK DEGREE IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Institution Name: Select from dropdown (existing institution)',
      '   - Degree ID: Unique degree identifier (uppercase letters, numbers, underscores, hyphens)',
      '   - Degree Name: Full degree name (e.g., "Bachelor of Technology")',
      '   - Degree Type: Select from dropdown (UG or PG)',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Display Name: Short display name (e.g., "B.Tech")',
      '   - Degree Order: Numeric order for sorting (optional)',
      '   - Is Active: Active/Inactive (defaults to Active if blank)',
      '',
      '3. DATA VALIDATION:',
      '   - Counselling Code has dropdown: ALWAYS use dropdown to select',
      '   - Degree Type has dropdown: Use dropdown to select UG or PG',
      '   - Is Active has dropdown: Use dropdown to select Active or Inactive',
      '   - NEVER type values manually - always use dropdowns',
      '   - Typing manually may cause case-sensitivity errors',
      '',
      '4. FORMATTING:',
      '   - Counselling Code: Select from dropdown (no manual typing)',
      '   - Degree ID: Uppercase with no spaces (e.g., BTECH, MTECH, PHD)',
      '   - Degree Order: Numeric value (e.g., 1, 2, 3)',
      '',
      '5. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '6. IMPORT PROCESS:',
      '   - Fill in your degree data starting from row 2',
      '   - Save the file',
      '   - Upload via the Import button in the Degrees page',
      '   - Review the import results and fix any errors',
      '',
      '7. TIPS:',
      '   - Degree IDs must be unique within each institution',
      '   - Use uppercase for Counselling Code and Degree ID',
      '   - Verify counselling code exists before import',
      '   - Degree order helps sort degrees in lists',
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
        'Content-Disposition': `attachment; filename=degrees-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/degrees/template] Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: 'Failed to generate template',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}
