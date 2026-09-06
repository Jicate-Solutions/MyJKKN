export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

/**
 * GET /api/hr/recruitment-need/approvals/template
 *
 * Generates a blank .xlsx template for bulk institution program approval import.
 * Columns: institution_name, program_name, body_abbreviation,
 *          sanctioned_faculty_count, approved_intake,
 *          approval_date, renewal_due_date, approval_reference
 */
export async function GET() {
  try {
    const workbook = new ExcelJS.Workbook();

    // ── Sheet 1: Approvals ──────────────────────────────────────────
    const ws = workbook.addWorksheet('Approvals');

    ws.columns = [
      { header: 'Institution Name', key: 'institution_name', width: 36 },
      { header: 'Program Name', key: 'program_name', width: 30 },
      { header: 'Body Abbreviation', key: 'body_abbreviation', width: 22 },
      { header: 'Sanctioned Faculty Count', key: 'sanctioned_faculty_count', width: 26 },
      { header: 'Approved Intake', key: 'approved_intake', width: 18 },
      { header: 'Approval Date', key: 'approval_date', width: 16 },
      { header: 'Renewal Due Date', key: 'renewal_due_date', width: 18 },
      { header: 'Approval Reference', key: 'approval_reference', width: 28 },
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
      institution_name: 'JKKN College of Engineering',
      program_name: 'B.E. Computer Science',
      body_abbreviation: 'AICTE',
      sanctioned_faculty_count: 12,
      approved_intake: 60,
      approval_date: '2025-06-01',
      renewal_due_date: '2026-06-01',
      approval_reference: 'AICTE/2025/ABC123',
    });

    const sampleRow = ws.getRow(2);
    sampleRow.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
    sampleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };

    // ── Sheet 2: Instructions ───────────────────────────────────────
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.columns = [{ width: 80 }];

    const lines = [
      'INSTRUCTIONS FOR BULK APPROVALS IMPORT',
      '',
      '1. REQUIRED FIELDS:',
      '   - Institution Name: must match existing institution name in system',
      '   - Program Name: must match existing program name under that institution',
      '   - Body Abbreviation: regulatory body abbreviation (e.g. AICTE, UGC, DCI)',
      '   - Sanctioned Faculty Count: whole number >= 0',
      '',
      '2. OPTIONAL FIELDS:',
      '   - Approved Intake: number (student intake capacity)',
      '   - Approval Date: YYYY-MM-DD format',
      '   - Renewal Due Date: YYYY-MM-DD format',
      '   - Approval Reference: reference number from regulatory body',
      '',
      '3. LIMITS:',
      '   - Maximum 1000 rows per file',
      '   - Maximum file size: 5 MB',
      '   - .xlsx format only',
      '',
      '4. TIPS:',
      '   - Institution and program names must match EXACTLY as in the system',
      '   - Body abbreviation is case-insensitive (aicte = AICTE)',
      '   - Delete the sample row before uploading',
      '   - Dates must be in YYYY-MM-DD format (e.g. 2025-06-01)',
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
        'Content-Disposition': `attachment; filename=approvals-template-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (error) {
    console.error('[hr/recruitment-need/approvals/template] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate template', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
