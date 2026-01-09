// app/api/organizations/institutions/template/route.ts

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import {
  EXCEL_INSTITUTION_TYPES,
  EXCEL_CATEGORIES,
  EXCEL_TIMETABLE_TYPES
} from '@/lib/utils/institution-excel-mappings';

/**
 * GET /api/organizations/institutions/template
 *
 * Generates a blank Excel template with dropdown validation for bulk institution creation
 *
 * Features:
 * - Pre-formatted columns with proper widths
 * - Dropdown validation for Institution Type, Category, and Timetable Type
 * - Lists sheet with reference data
 * - Sample row with placeholder data for guidance
 * - Frozen header row
 * - Bold header formatting
 */
export async function GET(request: NextRequest) {
  try {
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // ============================================================
    // SHEET 1: Institutions (Main Data Sheet)
    // ============================================================
    const worksheet = workbook.addWorksheet('Institutions');

    // Define columns (Note: Code column removed - only Counselling Code is used)
    worksheet.columns = [
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Counselling Code', key: 'counselling_code', width: 20 },
      { header: 'Institution Type', key: 'institution_type', width: 20 },
      { header: 'Category', key: 'category', width: 15 },
      { header: 'Timetable Type', key: 'timetable_type', width: 20 },
      { header: 'Accredited By', key: 'accredited_by', width: 20 },
      { header: 'Address Line 1', key: 'address_line1', width: 30 },
      { header: 'Address Line 2', key: 'address_line2', width: 30 },
      { header: 'Address Line 3', key: 'address_line3', width: 30 },
      { header: 'City', key: 'city', width: 20 },
      { header: 'State', key: 'state', width: 20 },
      { header: 'Country', key: 'country', width: 20 },
      { header: 'Pincode', key: 'pincode', width: 15 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Website', key: 'website', width: 30 },
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
      name: 'Example Institution Name',
      counselling_code: 'COUNS001',
      institution_type: 'Self',
      category: 'UG & PG',
      timetable_type: 'Day Order',
      accredited_by: 'NAAC A+',
      address_line1: '123 Main Street',
      address_line2: 'Building Name',
      address_line3: 'Landmark',
      city: 'City Name',
      state: 'State Name',
      country: 'India',
      pincode: '600001',
      phone: '+91 9876543210',
      email: 'info@example.edu',
      website: 'https://www.example.edu',
      is_active: true
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
        { font: { size: 9 }, text: 'Replace this row with your actual institution data.\nYou can delete this row after adding your data.' }
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
    listsSheet.addRow(['Institution Type', 'Category', 'Timetable Type']);
    listsSheet.getRow(1).font = { bold: true, name: 'Arial', size: 10 };
    listsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' }
    };

    // Add dropdown values
    const maxRows = Math.max(
      EXCEL_INSTITUTION_TYPES.length,
      EXCEL_CATEGORIES.length,
      EXCEL_TIMETABLE_TYPES.length
    );

    for (let i = 0; i < maxRows; i++) {
      listsSheet.addRow([
        EXCEL_INSTITUTION_TYPES[i] || '',
        EXCEL_CATEGORIES[i] || '',
        EXCEL_TIMETABLE_TYPES[i] || ''
      ]);
    }

    // Auto-fit columns in Lists sheet
    listsSheet.columns = [{ width: 20 }, { width: 15 }, { width: 20 }];

    // ============================================================
    // DATA VALIDATION (Dropdowns) - Using inline lists
    // ExcelJS requires: formulae: ['"Value1,Value2,Value3"']
    // with double quotes inside the array for inline list validation
    // ============================================================

    // Define validation end row (limited to 100 to prevent XML bloat)
    const validationEndRow = 100;

    // Create inline list formulas - ExcelJS format requires double-quoted string
    // Format: '"Option1,Option2,Option3"' (double quotes inside single quotes)
    const institutionTypeList = `"${EXCEL_INSTITUTION_TYPES.join(',')}"`;
    const categoryList = `"${EXCEL_CATEGORIES.join(',')}"`;
    const timetableTypeList = `"${EXCEL_TIMETABLE_TYPES.join(',')}"`;

    // Apply validation cell-by-cell (ExcelJS requires this approach)
    // Note: Column letters shifted after removing Code column
    for (let row = 2; row <= validationEndRow; row++) {
      // Column C: Institution Type dropdown (was D before)
      worksheet.getCell(`C${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [institutionTypeList],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_INSTITUTION_TYPES.join(', ')}`
      };

      // Column D: Category dropdown (was E before)
      worksheet.getCell(`D${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [categoryList],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_CATEGORIES.join(', ')}`
      };

      // Column E: Timetable Type dropdown (was F before)
      worksheet.getCell(`E${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [timetableTypeList],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Invalid Input',
        error: `Please select: ${EXCEL_TIMETABLE_TYPES.join(', ')}`
      };
    }

    // ============================================================
    // INSTRUCTIONS SHEET (Optional)
    // ============================================================
    const instructionsSheet = workbook.addWorksheet('Instructions');

    instructionsSheet.columns = [{ width: 80 }];

    const instructions = [
      'INSTRUCTIONS FOR BULK INSTITUTION IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Name: Institution name (minimum 2 characters)',
      '   - Counselling Code: Unique counselling code (uppercase)',
      '   - Institution Type: Select from dropdown (Self, Autonomous, Aided)',
      '   - Category: Select from dropdown (UG, PG, UG & PG)',
      '   - Timetable Type: Select from dropdown (Day Order, Week Order)',
      '   - Accredited By: Accreditation details',
      '   - Address Line 1, City, State, Country, Pincode',
      '   - Phone, Email',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Address Line 2, Address Line 3',
      '   - Website',
      '   - Is Active (defaults to true if blank)',
      '',
      '3. DATA VALIDATION:',
      '   - Institution Type, Category, and Timetable Type have dropdowns',
      '   - ALWAYS use the dropdown to select values',
      '   - Do NOT type values manually to avoid case-sensitivity errors',
      '',
      '4. FORMATTING:',
      '   - Pincode: 6 digits (e.g., 600001)',
      '   - Phone: Include country code (e.g., +91 9876543210)',
      '   - Email: Valid email format',
      '   - Website: Full URL with https://',
      '   - Is Active: true or false',
      '',
      '5. SAMPLE DATA:',
      '   - Row 2 contains sample data for reference',
      '   - Delete or replace the sample row with your actual data',
      '',
      '6. IMPORT PROCESS:',
      '   - Fill in your institution data starting from row 2',
      '   - Save the file',
      '   - Upload via the Import button in the Institutions page',
      '   - Review the import results and fix any errors',
      '',
      '7. TIPS:',
      '   - Counselling Codes must be unique across all institutions',
      '   - Use uppercase for Counselling Code',
      '   - Double-check email and phone formats',
      '   - Verify pincode is exactly 6 digits',
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
        'Content-Disposition': `attachment; filename=institutions-template-${
          new Date().toISOString().split('T')[0]
        }.xlsx`
      }
    });
  } catch (error) {
    console.error('[organizations/institutions/template] Error:', error);
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
