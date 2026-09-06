export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

/**
 * GET /api/hr/workload/template
 *
 * Generates a blank .xlsx template for bulk faculty workload import.
 * Columns: staff_email, academic_year, semester, weekly_contact_hours,
 *          weekly_admin_hours, weekly_research_hours, notes
 */
export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();

    // ── Sheet 1: Workload Data ──────────────────────────────────────
    const ws = workbook.addWorksheet('Workload');

    ws.columns = [
      { header: 'Staff Email', key: 'staff_email', width: 32 },
      { header: 'Academic Year', key: 'academic_year', width: 16 },
      { header: 'Semester', key: 'semester', width: 12 },
      { header: 'Weekly Contact Hours', key: 'weekly_contact_hours', width: 22 },
      { header: 'Weekly Admin Hours', key: 'weekly_admin_hours', width: 20 },
      { header: 'Weekly Research Hours', key: 'weekly_research_hours', width: 22 },
      { header: 'Notes', key: 'notes', width: 40 },
    ];

    // Header styling
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 22;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Sample row
    ws.addRow({
      staff_email: 'john.doe@jkkn.ac.in',
      academic_year: '2025-2026',
      semester: 1,
      weekly_contact_hours: 18,
      weekly_admin_hours: 4,
      weekly_research_hours: 6,
      notes: 'Sample row — replace or delete',
    });

    const sampleRow = ws.getRow(2);
    sampleRow.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
    sampleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };

    // Semester dropdown validation (1 or 2)
    for (let r = 2; r <= 100; r++) {
      ws.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"1,2"'],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Invalid Semester',
        error: 'Semester must be 1 or 2',
      };
    }

    // ── Sheet 2: Instructions ───────────────────────────────────────
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.columns = [{ width: 80 }];

    const lines = [
      'INSTRUCTIONS FOR BULK WORKLOAD IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Staff Email: email address matching staff profile in system',
      '   - Academic Year: format YYYY-YYYY (e.g. 2025-2026)',
      '   - Semester: 1 or 2 (use dropdown)',
      '   - Weekly Contact Hours: number (e.g. 18)',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Weekly Admin Hours: number',
      '   - Weekly Research Hours: number',
      '   - Notes: free text',
      '',
      '3. LIMITS:',
      '   - Maximum 1000 rows per file',
      '   - Maximum file size: 5 MB',
      '   - .xlsx format only',
      '',
      '4. TIPS:',
      '   - Delete the sample row before uploading',
      '   - Each row creates one workload record with source "manual"',
      '   - Duplicate staff + year + semester combinations will be flagged as errors',
    ];

    lines.forEach((line, idx) => {
      const row = instrSheet.addRow([line]);
      if (idx === 0) {
        row.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A8A' } };
      } else if (line.match(/^\d+\./)) {
        row.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else {
        row.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=workload-template-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (error) {
    console.error('[hr/workload/template] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate template', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
