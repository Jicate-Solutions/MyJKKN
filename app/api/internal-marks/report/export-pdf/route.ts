import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInternalMarksAccess,
  resolveCoeInstitutionId,
} from '@/lib/utils/internal-marks/internal-marks-access';
import { flattenReportExtraMarks } from '@/lib/utils/internal-marks/flatten-extra-marks';
import type { CiaReportResponse } from '@/types/internal-marks';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await resolveInternalMarksAccess(user.id);

    const { institutionId, examSessionId, courseCode, ciaRound, programCode, roundName } = await request.json();
    if (!institutionId || !examSessionId || !courseCode || !ciaRound) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json({ error: 'Institution not mapped in COE' }, { status: 404 });
    }

    const client = CoeRestClient.create();
    const rawReport = await client.get<CiaReportResponse>('/api/v1/cia-marks/report', {
      institutions_id: coeInstitutionId,
      examination_session_id: examSessionId,
      course_code: courseCode,
      cia_round: String(ciaRound),
      program_code: programCode ?? undefined,
    });
    const reportData = flattenReportExtraMarks(rawReport);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Internal Marks (CIA) Report', doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Course: ${reportData.course.course_code} - ${reportData.course.course_name}`, 14, 25);
    doc.text(`Round: ${roundName || `CIA-${ciaRound}`} | Max: ${reportData.course.internal_max_mark}`, 14, 30);

    const markKeys = [...new Set(reportData.learners.flatMap((l) => Object.keys(l.marks)))];

    autoTable(doc, {
      head: [['S.No', 'Reg No', 'Name', ...markKeys.map((k) => k.replace(/_/g, ' ').toUpperCase()), 'Total', 'In Words']],
      body: reportData.learners.map((l, i) => [
        String(i + 1), l.register_number, l.student_name,
        ...markKeys.map((k) => l.marks[k] != null ? String(l.marks[k]) : '-'),
        String(l.total), l.marks_in_words,
      ]),
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="CIA-Report-${courseCode}-Round${ciaRound}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[internal-marks/export-pdf] error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
