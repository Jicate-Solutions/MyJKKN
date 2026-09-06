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
  regulation_code?: string;
}

interface CoeCourseRow {
  course_code: string;
  /** COE mapped courses expose the name as `course_title`; `course_name` is a fallback. */
  course_title?: string;
  course_name?: string;
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

/**
 * Picks the first "real" course name from candidates — non-empty and not just
 * the course code echoed back (some COE rows store course_title = course_code
 * as a placeholder). Falls back to the code when nothing better exists.
 */
function pickCourseName(courseCode: string, ...candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v && v.toUpperCase() !== courseCode.toUpperCase()) return v;
  }
  return courseCode;
}

/**
 * Runs `fn` over `items` with at most `limit` promises in flight (a worker
 * pool). Prevents bursting COE's per-key rate limit (429) when fanning out one
 * registrations call per exam session on a cold load — the all-at-once
 * `Promise.all` burst is the likely cause of intermittent "no registrations
 * after refresh" in production.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const i = cursor++;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
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
      console.warn(
        `[my-marks/registrations] 404 student-profile: user=${user.id} role=${profile?.role ?? 'null'} learner_id=${profile?.learner_id ?? 'null'}`
      );
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
      console.warn(
        `[my-marks/registrations] 422 incomplete: learner_id=${profile.learner_id} register_number=${registerNumber ?? 'null'} institution_id=${institutionId ?? 'null'}`
      );
      return NextResponse.json(
        { error: 'Student is missing register_number or institution mapping' },
        { status: 422 }
      );
    }

    const coeInstitutionId = await resolveCoeInstitutionId(institutionId);
    if (!coeInstitutionId) {
      console.warn(
        `[my-marks/registrations] 404 institution-not-mapped: register_number=${registerNumber} myjkkn_institution_id=${institutionId} — this MyJKKN institution is not listed in any COE institution's myjkkn_institution_ids array`
      );
      return NextResponse.json(
        {
          error: 'Institution not mapped in COE',
          institution_id: institutionId,
        },
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
    >(
      '/api/v1/examination-sessions',
      { institutions_id: coeInstitutionId },
      { cacheTtlMs: 5 * 60 * 1000 } // institution-level reference data — cache 5 min
    );
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

    // Concurrency-limited fan-out (worker pool) instead of all-at-once
    // Promise.all — bursting one call per session trips COE's per-key 429
    // limit on cold refreshes, which the catch below would swallow to empty.
    let failedSessions = 0;
    const perSessionResults = await mapWithConcurrency(
      sessions,
      4,
      async (session) => {
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
          failedSessions++;
          const status = err instanceof CoeApiError ? err.status : 'ERR';
          console.warn(
            `[my-marks/registrations] registrations fetch failed for session ${session.id} (status ${status}): ${err instanceof Error ? err.message : String(err)}`
          );
          return [] as CoeRegistrationRow[];
        }
      }
    );
    const allRegs = perSessionResults.flat();

    // Filter to caller's own approved registrations.
    const myRegs = allRegs.filter(
      (r) =>
        r.stu_register_no === registerNumber &&
        r.registration_status === 'Approved'
    );

    if (myRegs.length === 0) {
      // Diagnostic: distinguishes "COE returned registrations but none matched
      // this student/status" (data/register_number issue) from "COE returned
      // nothing at all" (likely a 403 on registrations:read or wrong COE
      // instance — the per-session fetch above swallows errors to []).
      const sampleRegNos = [
        ...new Set(allRegs.map((r) => r.stu_register_no).filter(Boolean)),
      ].slice(0, 5);
      console.warn(
        `[my-marks/registrations] no approved regs: register_number=${registerNumber} institution=${institutionId} coeInstitution=${coeInstitutionId} | COE returned ${allRegs.length} reg(s) across ${sessions.length} session(s), ${failedSessions} session fetch(es) FAILED (429/error → likely the cause if >0); sample stu_register_no=[${sampleRegNos.join(', ')}]`
      );
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
    const courseNameByCode = new Map<string, string>();

    // Records a course name into the map, preferring a real title over a
    // placeholder (title === code) and never letting a placeholder clobber a
    // real name already recorded.
    const recordName = (code: string | undefined, rawName: string | undefined) => {
      if (!code) return;
      const name = (rawName ?? '').trim();
      if (!name) return;
      const existing = courseNameByCode.get(code);
      const existingReal = !!existing && existing.toUpperCase() !== code.toUpperCase();
      const newReal = name.toUpperCase() !== code.toUpperCase();
      if (!existing || (newReal && !existingReal)) courseNameByCode.set(code, name);
    };

    // 1) Course mapping per program — gives course placement, the embedded name
    //    when details returns it, AND the regulation_code we use to scope the
    //    courses-catalog fetch below.
    await Promise.all(
      programCodes.map(async (programCode) => {
        try {
          const mappingRaw = await client.get<
            { data: CoeCourseMappingRow[] } | CoeCourseMappingRow[]
          >(
            '/api/v1/course-mapping',
            {
              institutions_id: coeInstitutionId,
              program_code: programCode,
              details: 'true',
              limit: '5000',
            },
            { cacheTtlMs: 5 * 60 * 1000 } // program curriculum — cache 5 min
          );
          const rows = Array.isArray(mappingRaw) ? mappingRaw : mappingRaw.data ?? [];
          rows.forEach((row) => {
            const key = `${row.program_code}::${row.course_code}`;
            const detail = row as CoeCourseMappingRow & {
              course_title?: string;
              course?: { course_title?: string; course_name?: string };
            };
            const mappingName =
              detail.course_name ||
              detail.course_title ||
              detail.course?.course_title ||
              detail.course?.course_name ||
              undefined;
            mappingsByCourse.set(key, { ...row, course_name: mappingName });
            recordName(row.course_code, mappingName);
          });
        } catch (err) {
          console.warn(
            `[my-marks/registrations] course-mapping fetch failed for ${programCode}:`,
            err
          );
        }
      })
    );

    // 2) Course titles live in COE's `courses` master (mapped as `course_title`).
    //    The institution-wide list is huge for multi-department colleges and the
    //    REST endpoint truncates it — dropping some course_codes. So scope the
    //    fetch by the regulation_code(s) seen in the mappings: a small, complete
    //    set guaranteed to include the student's courses. Fall back to
    //    institution-wide only if no regulation could be determined.
    const regulationCodes = [
      ...new Set(
        [...mappingsByCourse.values()]
          .map((m) => m.regulation_code)
          .filter((rc): rc is string => !!rc)
      ),
    ];
    const courseQueries: Array<Record<string, string | undefined>> =
      regulationCodes.length > 0
        ? regulationCodes.map((rc) => ({
            institutions_id: coeInstitutionId,
            regulation_code: rc,
            limit: '10000',
          }))
        : [{ institutions_id: coeInstitutionId, limit: '10000' }];

    await Promise.all(
      courseQueries.map(async (params) => {
        try {
          const coursesRaw = await client.get<
            { data: CoeCourseRow[] } | CoeCourseRow[]
          >('/api/v1/courses', params, { cacheTtlMs: 5 * 60 * 1000 }); // course catalog — cache 5 min
          const rows = Array.isArray(coursesRaw) ? coursesRaw : coursesRaw.data ?? [];
          rows.forEach((c) => recordName(c.course_code, c.course_title || c.course_name));
        } catch (err) {
          console.warn(
            `[my-marks/registrations] courses fetch failed (${params.regulation_code ?? 'institution-wide'}):`,
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
        course_name: pickCourseName(
          reg.course_code,
          mapping?.course_name,
          courseNameByCode.get(reg.course_code),
          reg.course_name
        ),
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

    // Diagnostic: surface any courses whose name still falls back to the code,
    // so a COE title gap is visible in the dev terminal (not silently masked).
    const unresolved = semesters
      .flatMap((s) => s.registrations)
      .filter((r) => r.course_name === r.course_code)
      .map((r) => r.course_code);
    if (unresolved.length > 0) {
      console.warn(
        `[my-marks/registrations] no COE course title for ${unresolved.length} code(s): ${unresolved.join(', ')} — checked course-mapping(details) + courses catalog`
      );
    }

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
      console.warn(
        `[my-marks/registrations] ${error.status} COE-error: ${error.message}`
      );
      // Fail soft on rate-limit so a 429 burst doesn't cascade into a client
      // retry storm — return an empty (no registrations) view instead of erroring.
      if (error.status === 429) {
        const empty: MyMarksRegistrationsResponse = {
          semesters: [],
          current_semester_code: null,
          exam_session_ids: [],
        };
        return NextResponse.json({ data: empty });
      }
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
