// lib/services/proof-record/marks-layer.ts
//
// Verified Skills Record — marks layer (SERVER-ONLY: reads the COE database /
// REST API and the exam-audit verdict snapshots via service role).
//
// The marks a learner sees here are the SAME stored internal-assessment rows
// the My Marks page shows (REST-first with COE-DB fallback, the exact flow of
// app/api/learners/my-marks/cia-view). What this layer ADDS is the integrity
// gate: the program's latest exam-audit verdict (exam_ia_audit_verdicts,
// written weekly by /api/cron/exam-audit-alerts from the SAME compute.ts the
// live Exam IA Audit page uses). Marks never carry the "verified" stamp on
// this record unless that provenance verdict passed — raw COE reads are never
// presented as verified (COE rows are operator-entered; provenance IS the trust).

import { createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { isCoeDbConfigured } from '@/lib/services/coe/coe-db-client';
import { buildStudentCiaViewFromDb } from '@/lib/services/coe/build-student-cia-view';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import type { StudentCiaView, CiaViewSession } from '@/types/my-marks';
import type { ProofMarksLayer, ProofMarksSession } from '@/types/proof-record';

/** COE may return sessions[] or a legacy semesters[] shape — same normalize
 *  rule the my-marks route applies. */
interface RawCiaView {
  student?: StudentCiaView['student'];
  sessions?: CiaViewSession[];
  semesters?: Array<
    Partial<CiaViewSession> & {
      semester_label: string;
      semester_index: number;
      settings?: CiaViewSession['settings'];
      courses?: CiaViewSession['courses'];
    }
  >;
}

function toSessions(raw: RawCiaView): CiaViewSession[] {
  return (
    raw.sessions ??
    (raw.semesters ?? []).map((sem) => ({
      examination_session_id: sem.examination_session_id ?? null,
      session_code: sem.session_code ?? null,
      session_name: sem.session_name ?? null,
      session_status: sem.session_status ?? null,
      semester_code: sem.semester_code ?? null,
      semester_label: sem.semester_label,
      semester_index: sem.semester_index,
      settings: sem.settings ?? [],
      courses: sem.courses ?? [],
    }))
  );
}

async function loadCiaView(
  learnerId: string,
  registerNumber: string,
  coeInstitutionId: string,
): Promise<StudentCiaView | null> {
  try {
    const client = CoeRestClient.create();
    const raw = await client.get<RawCiaView>('/api/v1/student-cia-view', {
      register_number: registerNumber,
      institution_id: coeInstitutionId,
    });
    return {
      student: raw.student ?? {
        student_id: learnerId,
        register_number: registerNumber,
        student_name: null,
        program_code: null,
        grade_system_code: '',
      },
      sessions: toSessions(raw),
    };
  } catch (err) {
    if (err instanceof CoeApiError && err.status === 429) return null; // don't hammer on bursts
    if (isCoeDbConfigured()) {
      try {
        return await buildStudentCiaViewFromDb(learnerId, registerNumber);
      } catch (dbErr) {
        console.error('[proof-record/marks] COE DB fallback failed:', dbErr);
      }
    }
    return null;
  }
}

const PASSING_VERDICT = 'faculty_continuous';

/**
 * Latest exam-audit verdict for this learner's program. Read via service role
 * (the snapshot table's RLS is auditor-scoped; program-level verdicts carry no
 * learner PII and this route is already self-scoped by construction).
 */
async function latestProgramVerdict(
  programCode: string | null,
  institutionId: string,
): Promise<string | null> {
  if (!programCode) return null;
  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('exam_ia_audit_verdicts')
    .select('verdict, computed_at')
    .eq('program_code', programCode)
    .eq('institution_id', institutionId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.verdict ?? null;
}

export async function buildProofMarksLayer(input: {
  learnerId: string;
  registerNumber: string;
  institutionId: string;
}): Promise<ProofMarksLayer> {
  const { learnerId, registerNumber, institutionId } = input;

  // Fail-soft everywhere: the record's other layers must render even when the
  // exam system is unreachable or unconfigured — marks just read 'unavailable'.
  let coeInstitutionId: string | null = null;
  try {
    coeInstitutionId = await resolveCoeInstitutionId(institutionId);
  } catch (err) {
    console.warn('[proof-record/marks] COE institution resolve failed:', err);
  }
  if (!coeInstitutionId) {
    return { status: 'unavailable', program_verdict: null, sessions: [] };
  }

  const view = await loadCiaView(learnerId, registerNumber, coeInstitutionId);
  if (!view) {
    return { status: 'unavailable', program_verdict: null, sessions: [] };
  }

  // Per-course summary: sum the entered rounds' totals against the course's
  // internal max (falling back to the rounds' own maxima). Courses with no
  // entered round at all are dropped — absence renders as absence.
  const sessions: ProofMarksSession[] = (view.sessions ?? [])
    .map((s) => ({
      session_name: s.session_name ?? s.session_code ?? s.semester_label ?? null,
      courses: (s.courses ?? [])
        .filter((c) => (c.rounds ?? []).some((r) => r.has_entries && r.total !== null))
        .map((c) => {
          const entered = (c.rounds ?? []).filter((r) => r.has_entries && r.total !== null);
          const total = entered.reduce((sum, r) => sum + (r.total ?? 0), 0);
          const max =
            c.internal_max_mark ??
            (entered.every((r) => r.max_total !== null)
              ? entered.reduce((sum, r) => sum + (r.max_total ?? 0), 0)
              : null);
          return {
            course_code: c.course_code ?? null,
            course_name: c.course_name ?? null,
            total,
            max,
            pct: max && max > 0 ? Math.round((1000 * total) / max) / 10 : null,
          };
        }),
    }))
    .filter((s) => s.courses.length > 0);

  if (sessions.length === 0) {
    // Honest gate working as designed: no internal-assessment rows exist —
    // the section renders as "not yet on record", never as a fake.
    return { status: 'empty', program_verdict: null, sessions: [] };
  }

  const verdict = await latestProgramVerdict(view.student?.program_code ?? null, institutionId);
  const status =
    verdict === null ? 'pending' : verdict === PASSING_VERDICT ? 'verified' : 'unverified';

  return { status, program_verdict: verdict, sessions };
}
