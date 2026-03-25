// app/api/admission/consultants/template/route.ts
// Template download API for consultant import

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { CONSULTANT_TEMPLATE_COLUMNS } from '@/lib/utils/mappings/consultant-excel-mappings';

export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MyJKKN';
    workbook.created = new Date();

    // ============================================
    // MAIN DATA SHEET
    // ============================================
    const dataSheet = workbook.addWorksheet('Consultants', {
      properties: { defaultRowHeight: 20 },
    });

    // Set up columns with headers
    dataSheet.columns = CONSULTANT_TEMPLATE_COLUMNS.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width,
    }));

    // Style header row
    const headerRow = dataSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B6D41' }, // JKKN Green
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Add sample data rows
    const sampleData = [
      {
        name: 'ABC Education Services',
        phone: '9876543210',
        consultant_type: 'external',
        email: 'contact@abcedu.com',
        contact_person: 'John Doe',
        city: 'Chennai',
        state: 'Tamil Nadu',
        country: 'India',
        pincode: '600001',
        tier: 'silver',
        status: 'active',
        geographic_coverage: 'Chennai, Coimbatore, Madurai',
        specializations: 'Engineering, Medical',
      },
      {
        name: 'XYZ Consultants',
        phone: '8765432109',
        consultant_type: 'institutional',
        email: 'info@xyzconsult.in',
        contact_person: 'Jane Smith',
        city: 'Bangalore',
        state: 'Karnataka',
        country: 'India',
        pincode: '560001',
        tier: 'gold',
        status: 'active',
        geographic_coverage: 'Karnataka, Kerala',
        specializations: 'Pharmacy, Allied Health',
      },
      {
        name: 'Alumni Network - Batch 2020',
        phone: '7654321098',
        consultant_type: 'alumni',
        email: 'alumni2020@example.com',
        city: 'Komarapalayam',
        state: 'Tamil Nadu',
        tier: 'bronze',
        status: 'pending_verification',
      },
    ];

    sampleData.forEach(row => {
      dataSheet.addRow(row);
    });

    // Style data rows
    for (let i = 2; i <= dataSheet.rowCount; i++) {
      const row = dataSheet.getRow(i);
      row.font = { italic: true, color: { argb: 'FF666666' } };
      row.alignment = { vertical: 'middle' };
    }

    // Add data validation for enum columns
    const typeOptions = ['external', 'internal', 'institutional', 'alumni', 'student'];
    const tierOptions = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
    const statusOptions = ['active', 'inactive', 'suspended', 'pending_verification', 'contract_expired'];

    // Apply data validation to type column (column 3)
    dataSheet.getColumn(3).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber > 1 && rowNumber <= 100) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${typeOptions.join(',')}"`],
          showErrorMessage: true,
          errorTitle: 'Invalid Type',
          error: 'Please select a valid consultant type',
        };
      }
    });

    // Apply data validation to tier column
    const tierColIndex = CONSULTANT_TEMPLATE_COLUMNS.findIndex(c => c.key === 'tier') + 1;
    if (tierColIndex > 0) {
      dataSheet.getColumn(tierColIndex).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber > 1 && rowNumber <= 100) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${tierOptions.join(',')}"`],
          };
        }
      });
    }

    // Apply data validation to status column
    const statusColIndex = CONSULTANT_TEMPLATE_COLUMNS.findIndex(c => c.key === 'status') + 1;
    if (statusColIndex > 0) {
      dataSheet.getColumn(statusColIndex).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber > 1 && rowNumber <= 100) {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${statusOptions.join(',')}"`],
          };
        }
      });
    }

    // ============================================
    // INSTRUCTIONS SHEET
    // ============================================
    const instructionsSheet = workbook.addWorksheet('Instructions', {
      properties: { defaultRowHeight: 20 },
    });

    instructionsSheet.columns = [
      { header: 'Field', key: 'field', width: 25 },
      { header: 'Required', key: 'required', width: 12 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Valid Values / Format', key: 'format', width: 40 },
    ];

    // Style header
    const instrHeaderRow = instructionsSheet.getRow(1);
    instrHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instrHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B6D41' },
    };
    instrHeaderRow.height = 25;

    // Add instructions for each field
    const instructions = [
      { field: 'Consultant Name*', required: 'Yes', description: 'Name of the consultant or agency', format: 'Text' },
      { field: 'Phone*', required: 'Yes', description: 'Primary contact number', format: '10-digit number' },
      { field: 'Type*', required: 'Yes', description: 'Type of consultant', format: 'external, internal, institutional, alumni, student' },
      { field: 'Email', required: 'No', description: 'Email address', format: 'Valid email address' },
      { field: 'Contact Person', required: 'No', description: 'Name of primary contact person', format: 'Text' },
      { field: 'Alternate Phone', required: 'No', description: 'Secondary contact number', format: '10-digit number' },
      { field: 'Website', required: 'No', description: 'Website URL', format: 'https://example.com' },
      { field: 'Address', required: 'No', description: 'Street address', format: 'Text' },
      { field: 'City', required: 'No', description: 'City name', format: 'Text' },
      { field: 'State', required: 'No', description: 'State/Province', format: 'Text' },
      { field: 'Country', required: 'No', description: 'Country name', format: 'Text (default: India)' },
      { field: 'Pincode', required: 'No', description: 'Postal code', format: '6-digit number' },
      { field: 'Bank Name', required: 'No', description: 'Bank name for payouts', format: 'Text' },
      { field: 'Account Number', required: 'No', description: 'Bank account number', format: 'Number' },
      { field: 'IFSC Code', required: 'No', description: 'Bank IFSC code', format: '11-character code' },
      { field: 'Account Holder', required: 'No', description: 'Name on bank account', format: 'Text' },
      { field: 'PAN Number', required: 'No', description: 'PAN card number', format: 'ABCDE1234F format' },
      { field: 'GST Number', required: 'No', description: 'GSTIN number', format: '15-character GSTIN' },
      { field: 'Geographic Coverage', required: 'No', description: 'Areas covered by consultant', format: 'Comma-separated cities/regions' },
      { field: 'Specializations', required: 'No', description: 'Areas of expertise', format: 'Comma-separated (e.g., Engineering, Medical)' },
      { field: 'Programs Handled', required: 'No', description: 'Programs consultant deals with', format: 'Comma-separated program names' },
      { field: 'Tier', required: 'No', description: 'Performance tier level', format: 'bronze, silver, gold, platinum, diamond' },
      { field: 'Total Leads', required: 'No', description: 'Historical lead count', format: 'Number' },
      { field: 'Conversions', required: 'No', description: 'Historical conversion count', format: 'Number' },
      { field: 'Commission Earned', required: 'No', description: 'Historical commission (INR)', format: 'Number (no currency symbol)' },
      { field: 'Contract Start', required: 'No', description: 'Contract start date', format: 'YYYY-MM-DD or DD/MM/YYYY' },
      { field: 'Contract End', required: 'No', description: 'Contract end date', format: 'YYYY-MM-DD or DD/MM/YYYY' },
      { field: 'Status', required: 'No', description: 'Account status', format: 'active, inactive, suspended, pending_verification' },
      { field: 'Notes', required: 'No', description: 'Additional notes', format: 'Text' },
      { field: 'Tags', required: 'No', description: 'Labels for categorization', format: 'Comma-separated tags' },
    ];

    instructions.forEach(row => {
      instructionsSheet.addRow(row);
    });

    // Highlight required rows
    instructionsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const requiredCell = row.getCell(2);
        if (requiredCell.value === 'Yes') {
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF3CD' }, // Light yellow
          };
        }
      }
    });

    // ============================================
    // GENERATE BUFFER
    // ============================================
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="consultant-import-template.xlsx"',
      },
    });
  } catch (error) {
    console.error('[consultant-template] Error generating template:', error);
    return NextResponse.json(
      { error: 'Failed to generate template' },
      { status: 500 }
    );
  }
}
