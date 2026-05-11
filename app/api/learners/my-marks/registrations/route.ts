/**
 * GET /api/learners/my-marks/registrations
 *
 * Returns the calling student's exam_registrations grouped by semester,
 * enriched with course_mapping (semester_code, course_order, internal_max_mark).
 *
 * Auth model: standard student session. The endpoint:
 *   1. Resolves the student's learner_id + register_number from `profiles` →
 *      `learners_profiles`. Validates lifecycle status (active | graduated).
 *   2. Calls COE /api/v1/registrations with institutions_id + is_regular=true.
 *   3. Server-side filters to (a) caller's register_number ONLY,
 *      and (b) registration_status === 'Approved'.
 *   4. Joins each remaining row to COE /api/v1/course-mapping (per program_code)
 *      to derive semester_code, course_order, internal_max_mark.
 *   5. Groups by semester_code; sorts by semester_index ASC.
 *
 * Security: a student can NEVER see another student's registrations. The
 * register_number filter happens before any data leaves this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionId } from '@/lib/utils/internal-marks/internal-marks-access';
import { StudentValidationService } from '@/lib/services/auth/student-validation-service';
import type {
  MyMarksRegistration,
  MyMarksRegistrationsResponse,
  MyMarksSemesterGroup,
} from '@/types/my-marks';

interface CoeRegistrationRow {
  id: string;
  student_id?: string;
  stu_register_no: string;
  student_name?: string;
  course_code: string;
  course_name?: string;
  course_offering_id?: string;
  program_code: string;
  semester_code?: string;
  registration_status: string;
  is_regular: boolean;
  examination_session_id?: string;
}

interface CoeCourseMappingRow {
  program_code: string;
  semester_code: string;
  course_code: string;
  course_name?: string;
  course_order?: number;
  internal_max_mark?: number;
}

/** "BPHARM-SEM-3" → 3 ; falls back to 0 if no trailing number found. */
function extractSemesterIndex(semesterCode: string | undefined | null): number {
  if (!semesterCode) return 0;
  const match = semesterCode.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function semesterLabelFromIndex(index: number): string {
  if (index <= 0) return 'Semester';
  return `Semester ${ROMAN[index] ?? index}`;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lifecycle gate — only active/graduated students.
    const validation = await StudentValidationService.validateStudentAccess(user.id);
    if (!validation.allowed) {
      return NextResponse.json(
        { error: 'Forbidden', reason: validation.reason },
        { status: 403 }
      );
    }

    const adminClient = createServiceRoleClient();

    // Pull the caller's learner_id, register_number, institution_id.
    const { data: profile } = await adminClient
      .from('profiles')
      .select('learner_id, role')
      .eq('id', user.id)
      .single();

    if (!profile?.learner_id || profile.role !== 'student') {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const { data: learner } = await adminClient
      .from('learners_profiles')
      .select('register_number, institution_id')
      .eq('id', profile.learner_id)
      .single();

    const registerNumber = learner?.register_number;
    const institutionId = learner?.institution_id;

    if (!registerNumber || !institutionId) {
      return NextResponse.json(
        { error: 'Student is missing register_number or institution mapping' },
        { status: 422 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      return NextResponse.json(
        { error: 'Institution not mapped in COE' },
        { status: 404 }
      );
    }

    // COE's /api/v1/registrations REQUIRES examination_session_id, so we
    // first enumerate all exam sessions for the institution, then fan out
    // a registrations call per session in parallel and union the results.
    const client = CoeRestClient.create();

    interface CoeExamSession { id: string; }
    const sessionsRaw = await client.get<
      { data: CoeExamSession[] } | CoeExamSession[]
    >('/api/v1/examination-sessions', { institutions_id: coeInstitutionId });
    const sessions = Array.isArray(sessionsRaw)
      ? sessionsRaw
      : sessionsRaw.data ?? [];

    if (sessions.length === 0) {
      const empty: MyMarksRegistrationsResponse = {
        semesters: [],
        current_semester_code: null,
        exam_session_ids: [],
      };
      return NextResponse.json({ data: empty });
    }

    const perSessionResults = await Promise.all(
      sessions.map(async (session) => {
        try {
          const r = await client.get<
            { data: CoeRegistrationRow[] } | CoeRegistrationRow[]
          >('/api/v1/registrations', {
            institutions_id: coeInstitutionId,
            examination_session_id: session.id,
            limit: '5000',
            is_regular: 'true',
          });
          const rows = Array.isArray(r) ? r : r.data ?? [];
          // Stamp the examination_session_id on each row in case COE doesn't
          // echo it back — we need it for downstream marks lookup.
          return rows.map((row) => ({
            ...row,
            examination_session_id: row.examination_session_id ?? session.id,
          }));
        } catch (err) {
          console.warn(
            `[my-marks/registrations] registrations fetch failed for session ${session.id}:`,
            err
          );
          return [] as CoeRegistrationRow[];
        }
      })
    );
    const allRegs = perSessionResults.flat();

    // Filter to caller's own approved registrations.
    const myRegs = allRegs.filter(
      (r) =>
        r.stu_register_no === registerNumber &&
        r.registration_status === 'Approved'
    );

    if (myRegs.length === 0) {
      const empty: MyMarksRegistrationsResponse = {
        semesters: [],
        current_semester_code: null,
        exam_session_ids: [],
      };
      return NextResponse.json({ data: empty });
    }

    // Fetch course_mapping for every distinct program_code touched. Cached
    // per-program by COE for ~5 min — usually 1 program per student.
    const programCodes = [...new Set(myRegs.map((r) => r.program_code))];
    const mappingsByCourse = new Map<string, CoeCourseMappingRow>();
    await Promise.all(
      programCodes.map(async (programCode) => {
        try {
          const mappingRaw = await client.get<
            { data: CoeCourseMappingRow[] } | CoeCourseMappingRow[]
          >('/api/v1/course-mapping', {
            institutions_id: coeInstitutionId,
            program_code: programCode,
            limit: '500',
          });
          const rows = Array.isArray(mappingRaw) ? mappingRaw : mappingRaw.data ?? [];
          rows.forEach((row) => {
            const key = `${row.program_code}::${row.course_code}`;
            mappingsByCourse.set(key, row);
          });
        } catch (err) {
          console.warn(
            `[my-marks/registrations] course-mapping fetch failed for ${programCode}:`,
            err
          );
        }
      })
    );

    // Enrich + group.
    const groups = new Map<string, MyMarksSemesterGroup>();
    for (const reg of myRegs) {
      const mapKey = `${reg.program_code}::${reg.course_code}`;
      const mapping = mappingsByCourse.get(mapKey);
      const semesterCode = mapping?.semester_code ?? reg.semester_code ?? '';
      if (!semesterCode) continue; // skip orphan rows we can't place

      const semIndex = extractSemesterIndex(semesterCode);
      const enriched: MyMarksRegistration = {
        registration_id: reg.id,
        register_number: reg.stu_register_no,
        course_code: reg.course_code,
        course_name: mapping?.course_name ?? reg.course_name ?? reg.course_code,
        course_offering_id: reg.course_offering_id,
        course_order: mapping?.course_order ?? 999,
        internal_max_mark: mapping?.internal_max_mark ?? 0,
        semester_code: semesterCode,
        semester_label: semesterLabelFromIndex(semIndex),
        semester_index: semIndex,
        program_code: reg.program_code,
        examination_session_id: reg.examination_session_id ?? '',
      };

      let group = groups.get(semesterCode);
      if (!group) {
        group = {
          semester_code: semesterCode,
          semester_label: enriched.semester_label,
          semester_index: semIndex,
          registrations: [],
        };
        groups.set(semesterCode, group);
      }
      group.registrations.push(enriched);
    }

    // Sort: semesters ASC, courses ASC by course_order then code.
    const semesters: MyMarksSemesterGroup[] = [...groups.values()]
      .sort((a, b) => a.semester_index - b.semester_index)
      .map((g) => ({
        ...g,
        registrations: g.registrations.sort(
          (a, b) =>
            a.course_order - b.course_order || a.course_code.localeCompare(b.course_code)
        ),
      }));

    const examSessionIds = [
      ...new Set(myRegs.map((r) => r.examination_session_id).filter(Boolean)),
    ] as string[];

    const response: MyMarksRegistrationsResponse = {
      semesters,
      current_semester_code: semesters[semesters.length - 1]?.semester_code ?? null,
      exam_session_ids: examSessionIds,
    };

    return NextResponse.json({ data: response });
  } catch (error) {
    if (error instanceof CoeApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error('[my-marks/registrations] error:', error);
    return NextResponse.json(
      { error: 'Failed to load your registrations' },
      { status: 500 }
    );
  }
}
