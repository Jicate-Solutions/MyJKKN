/**
 * GET /api/internal-marks/exam-audit/evidence[?format=pdf]
 *
 * Rubric-coverage evidence pack — the one-page document the Registrar/Director
 * hands to the exam cell (Director, 2026-07-14: "1 AND 2 — carry everything,
 * drop nothing"). Enumerates, across every college the caller may audit:
 *   - colleges with NO examination sessions in the exam system at all
 *   - programs with no assessment rubric configured
 *   - rubrics configured but with zero CIA entries
 *   - configured rounds that never happened (e.g. round 2 never entered)
 *   - operator-dump statistics (who entered, how many days, faculty-stamped %)
 *   - JKKN attendance-record coverage per college (the CAS all-no-record gap)
 *
 * SINGLE SOURCE: every program verdict comes from computeExamAuditPrograms —
 * the same computation the audit page renders and the weekly alert fires on —
 * and the findings are derived by deriveEvidenceFindings (pure). The pack can
 * never disagree with the page.
 *
 * Authorization: fn_exam_audit_access() (key academic.internal_marks
 * .exam_audit.view). Colleges outside the caller's scope are not enumerated.
 * Explicit 403 — never a silent redirect (CLAUDE.md #27).
 *
 * ?format=pdf returns the printable document (jsPDF — the module's canonical
 * PDF path, same as the CIA report export); default returns the JSON pack the
 * page renders on screen.
 */

import { NextRequest, NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient } from '@/lib/supabase/server';
import {
  isCoeDbConfigured,
  getAllCoeInstitutions,
  getCoeExaminationSessions,
  getCoeCurrentTerm,
  getCoeExamRegistrations,
  getCoeCiaProvenance,
  getCoeCiaSettings,
  getCoePrograms,
} from '@/lib/services/coe/coe-db-client';
import {
  aggregateAttendanceByStudent,
  computeExamAuditPrograms,
  deriveEvidenceFindings,
} from '@/lib/services/exam-audit/compute';
import {
  resolveExamAuditScope,
  sessionSemesterWindow,
} from '@/lib/utils/internal-marks/exam-audit-access';
import type {
  ExamAuditEvidenceCollege,
  ExamAuditEvidencePack,
} from '@/types/exam-audit';

export const maxDuration = 300;

function istNow(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16);
}

export async function GET(request: NextRequest) {
  try {
    if (!isCoeDbConfigured()) {
      return NextResponse.json(
        { error: 'COE database is not configured on the server.' },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const scope = await resolveExamAuditScope(supabase);
    if (!scope.allowed) {
      return NextResponse.json(
        { error: 'You do not have access to the exam audit — contact your administrator.' },
        { status: 403 },
      );
    }

    // COE-bridged colleges, narrowed to the caller's audit scope.
    const allInstitutions = await getAllCoeInstitutions();
    const inScope = allInstitutions.filter(
      (inst) =>
        scope.isSuper ||
        scope.institutionIds === null ||
        inst.myjkkn_institution_ids.some((id) => scope.institutionIds!.includes(id)),
    );

    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const collegesNoSessions: ExamAuditEvidencePack['colleges_no_sessions'] = [];
    const colleges: ExamAuditEvidenceCollege[] = [];
    let programsFlagged = 0;

    for (const inst of inScope) {
      const sessions = await getCoeExaminationSessions(inst.id);
      if (sessions.length === 0) {
        collegesNoSessions.push({
          institution_code: inst.institution_code,
          name: inst.name ?? null,
        });
        continue;
      }

      // Grade the college on its current term — the same auto-detection the
      // audit page uses (surfaced in the pack so a wrong pick is visible).
      const current = await getCoeCurrentTerm(inst.id, today);
      if (!current) {
        collegesNoSessions.push({
          institution_code: inst.institution_code,
          name: inst.name ?? null,
        });
        continue;
      }
      const sessionRows = sessions.filter((s) => s.session_code === current.session_code);
      const sessionMeta = sessionRows[0];
      const window = sessionSemesterWindow(sessionMeta);

      const [registrations, provenance, programs, ciaSettings, attendanceRes] =
        await Promise.all([
          getCoeExamRegistrations(current.session_code, inst.id),
          getCoeCiaProvenance(sessionRows.map((s) => s.id), inst.id),
          getCoePrograms(inst.id),
          getCoeCiaSettings(inst.id, sessionRows.map((s) => s.id)),
          supabase.rpc('fn_exam_audit_attendance', {
            p_institution_ids: inst.myjkkn_institution_ids,
            p_from: window.from,
            p_to: window.to,
          }),
        ]);
      if (attendanceRes.error) {
        return NextResponse.json(
          { error: `Failed to compute JKKN attendance: ${attendanceRes.error.message}` },
          { status: 500 },
        );
      }
      const attByStudent = aggregateAttendanceByStudent(
        (attendanceRes.data ?? []) as Array<{
          student_id: string;
          present: number;
          total: number;
          protected: number;
        }>,
      );

      const registeredIds = new Set(
        registrations.map((r) => r.student_id).filter((x): x is string => Boolean(x)),
      );
      let withRecord = 0;
      for (const sid of registeredIds) {
        const att = attByStudent.get(sid);
        if (att && att.total > 0) withRecord += 1;
      }

      const computed = computeExamAuditPrograms({
        registrations,
        provenance,
        programs,
        ciaSettings,
      });
      const findings = deriveEvidenceFindings(computed.map(({ row }) => row));
      const flaggedCount =
        findings.no_rubric.length +
        findings.rubric_zero_entries.length +
        findings.rounds_missing.length +
        findings.operator_bulk.length;
      programsFlagged += flaggedCount;

      colleges.push({
        institution_code: inst.institution_code,
        name: inst.name ?? null,
        session_code: current.session_code,
        session_reason: current.reason,
        exam_start_date: current.exam_start_date,
        exam_end_date: current.exam_end_date,
        no_registrations: registrations.length === 0,
        registered_students: registeredIds.size,
        programs_total: computed.filter(({ row }) => row.registered_students > 0).length,
        programs_ok: findings.ok_count,
        attendance:
          registeredIds.size > 0
            ? { with_record: withRecord, no_record: registeredIds.size - withRecord }
            : null,
        findings: {
          no_rubric: findings.no_rubric,
          rubric_empty: findings.rubric_empty,
          rubric_zero_entries: findings.rubric_zero_entries,
          rounds_missing: findings.rounds_missing,
          operator_bulk: findings.operator_bulk,
        },
      });
    }

    const pack: ExamAuditEvidencePack = {
      generated_at: istNow() + ' IST',
      scope: scope.isSuper
        ? 'all colleges (super admin)'
        : `${inScope.length} college${inScope.length === 1 ? '' : 's'} in the caller's audit scope`,
      colleges_no_sessions: collegesNoSessions,
      colleges,
      totals: {
        colleges_reviewed: colleges.length,
        colleges_no_sessions: collegesNoSessions.length,
        programs_flagged: programsFlagged,
      },
    };

    const { searchParams } = new URL(request.url);
    if (searchParams.get('format') === 'pdf') {
      const pdf = buildEvidencePdf(pack);
      return new NextResponse(Buffer.from(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="exam-ia-audit-evidence-pack-${today}.pdf"`,
        },
      });
    }
    return NextResponse.json(pack);
  } catch (error) {
    console.error('[internal-marks/exam-audit/evidence] error:', error);
    return NextResponse.json(
      { error: 'Failed to build the evidence pack.' },
      { status: 500 },
    );
  }
}

// ── PDF (jsPDF + autotable — the module's canonical export path) ─────────────

const FINDING_LABEL: Record<string, string> = {
  no_rubric: 'No rubric',
  rubric_empty: 'Empty rubric (0 marks)',
  rubric_zero_entries: 'Rubric, zero entries',
  rounds_missing: 'Round(s) never happened',
  operator_bulk: 'Operator dump',
};

function buildEvidencePdf(pack: ExamAuditEvidencePack): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const green: [number, number, number] = [11, 109, 65];

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Exam IA Audit — Rubric & Coverage Evidence Pack', 14, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Generated ${pack.generated_at} · scope: ${pack.scope} · for the exam cell`,
    14,
    22,
  );
  doc.text(
    'Every number below is computed from the same source as the live Exam IA Audit page',
    14,
    27,
  );
  doc.text(
    '(exam-system records × JKKN day-one attendance) — the pack cannot disagree with the page.',
    14,
    31,
  );

  let y = 38;

  // 1. Colleges with no exam sessions at all.
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `1. Colleges with NO exam sessions in the exam system (${pack.colleges_no_sessions.length})`,
    14,
    y,
  );
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [['Code', 'College']],
    body:
      pack.colleges_no_sessions.length > 0
        ? pack.colleges_no_sessions.map((c) => [c.institution_code, c.name ?? ''])
        : [['—', 'None — every college has at least one exam session']],
    styles: { fontSize: 8, cellPadding: 1.2 },
    headStyles: { fillColor: green },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // 2. Program findings per college (current term).
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`2. Program findings — current term per college (${pack.totals.programs_flagged})`, 14, y);
  y += 3;
  const findingRows: string[][] = [];
  for (const c of pack.colleges) {
    const groups: Array<[string, typeof c.findings.no_rubric]> = [
      ['no_rubric', c.findings.no_rubric],
      ['rubric_empty', c.findings.rubric_empty],
      ['rubric_zero_entries', c.findings.rubric_zero_entries],
      ['rounds_missing', c.findings.rounds_missing],
      ['operator_bulk', c.findings.operator_bulk],
    ];
    for (const [key, list] of groups) {
      for (const f of list) {
        findingRows.push([
          `${c.institution_code} · ${c.session_code ?? ''}`,
          f.program_code,
          String(f.registered_students),
          FINDING_LABEL[key],
          f.detail,
        ]);
      }
    }
    if (c.no_registrations) {
      findingRows.push([
        `${c.institution_code} · ${c.session_code ?? ''}`,
        '(all)',
        '0',
        'No registrations',
        'sessions exist but the graded term has zero exam registrations — exam-cell follow-up',
      ]);
    }
  }
  autoTable(doc, {
    startY: y,
    head: [['College · session', 'Program', 'Students', 'Finding', 'Detail']],
    body:
      findingRows.length > 0
        ? findingRows
        : [['—', '—', '—', '—', 'No findings — every program follows its rubric']],
    styles: { fontSize: 7.5, cellPadding: 1.2 },
    headStyles: { fillColor: green },
    columnStyles: { 4: { cellWidth: 78 } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // 3. Attendance-record coverage (eligibility is a SEPARATE check from marks).
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('3. JKKN attendance-record coverage (eligibility check, separate from marks)', 14, y);
  y += 3;
  autoTable(doc, {
    startY: y,
    head: [['College', 'Session graded', 'Registered', 'With JKKN record', 'No record']],
    body: pack.colleges.map((c) => [
      c.institution_code,
      c.session_code ?? '—',
      String(c.registered_students),
      String(c.attendance?.with_record ?? 0),
      String(c.attendance?.no_record ?? 0),
    ]),
    styles: { fontSize: 8, cellPadding: 1.2 },
    headStyles: { fillColor: green },
    margin: { left: 14, right: 14 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Internal marks are defined by the assessment rubric (rounds, components, entry windows) — attendance only gates',
    14,
    y,
  );
  doc.text(
    'exam eligibility. "Operator dump" flags where the continuous-assessment trail must be audited in person, not that marks are wrong.',
    14,
    y + 4,
  );

  return doc.output('arraybuffer');
}
