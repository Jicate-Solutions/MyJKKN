/**
 * COE direct-database read client (server-side only).
 *
 * The COE integration normally goes through the REST API (`CoeRestClient`).
 * That REST API is a thin layer in front of the COE Supabase project — and when
 * its API key is unavailable or expired, MyJKKN can still read the same
 * source-of-truth data DIRECTLY from the COE database with its service-role key.
 * This client is that direct path.
 *
 * Env (server-only secrets — never expose to the browser):
 *   COE_SUPABASE_URL
 *   COE_SUPABASE_SERVICE_ROLE_KEY
 *
 * NEVER import this file from client/browser code — it carries a service-role
 * key that bypasses RLS. Every caller MUST scope reads itself (e.g. a student
 * route filters to the caller's own register_number / learner id).
 *
 * Identity bridge (verified live 2026-07-04): the COE and MyJKKN systems SHARE
 * primary keys — COE `institutions_id` == MyJKKN `institution_id`, and COE
 * `cia_marks.student_id` == MyJKKN `learners_profiles.id` (same UUIDs). So COE
 * marks join to MyJKKN learners/attendance with no fuzzy matching.
 *
 * Aggregation note: PostgREST aggregate functions are disabled on the COE
 * project, so this client reads COE's pre-built summary VIEWS
 * (`cia_marks_summary_view`, `final_marks_summary_view`,
 * `examination_session_statistics`) rather than grouping client-side.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** Whether the COE direct-DB credentials are configured. */
export function isCoeDbConfigured(): boolean {
  return Boolean(
    process.env.COE_SUPABASE_URL && process.env.COE_SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Returns a memoized service-role Supabase client for the COE project.
 * Throws if the credentials are not configured — callers that want to fail
 * soft should guard with `isCoeDbConfigured()` first.
 */
export function createCoeDbClient(): SupabaseClient {
  const url = process.env.COE_SUPABASE_URL;
  const key = process.env.COE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'COE DB credentials not configured. Set COE_SUPABASE_URL and ' +
        'COE_SUPABASE_SERVICE_ROLE_KEY in the environment.',
    );
  }
  if (cached) return cached;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'myjkkn-coe-db-reader' } },
  });
  return cached;
}

// ── Shared types ────────────────────────────────────────────────────────────

export interface CoeExaminationSession {
  id: string;
  session_code: string | null;
  session_name: string | null;
  session_status: string | null;
  semester_type: string | null;
  month_year: string | null;
  academic_year_id: string | null;
  exam_start_date: string | null;
  exam_end_date: string | null;
  created_at: string | null;
}

/** One row of `cia_marks_summary_view` — per course × session × faculty. */
export interface CoeCiaCourseSummary {
  institution_code: string | null;
  institution_name: string | null;
  session_code: string | null;
  session_name: string | null;
  program_code: string | null;
  program_name: string | null;
  course_code: string | null;
  course_name: string | null;
  faculty_name: string | null;
  total_entries: number | null;
  draft_count: number | null;
  submitted_count: number | null;
  verified_count: number | null;
  approved_count: number | null;
  locked_count: number | null;
  avg_internal_marks: number | null;
  avg_internal_percentage: number | null;
  max_internal_marks: number | null;
  min_internal_marks: number | null;
  marks_std_deviation: number | null;
}

/** One row of `final_marks_summary_view` — per course × session. */
export interface CoeFinalCourseSummary {
  institution_code: string | null;
  institution_name: string | null;
  session_code: string | null;
  session_name: string | null;
  program_code: string | null;
  program_name: string | null;
  course_code: string | null;
  course_name: string | null;
  total_students: number | null;
  published_count: number | null;
  passed_count: number | null;
  failed_count: number | null;
  avg_internal_percentage: number | null;
  avg_external_percentage: number | null;
  pass_percentage: number | null;
}

/** One row of `examination_session_statistics` — per session × institution. */
export interface CoeSessionStatistics {
  id: string;
  session_code: string | null;
  session_name: string | null;
  session_status: string | null;
  institutions_id: string | null;
  institution_name: string | null;
  academic_year_name: string | null;
  total_students_registered: number | null;
  total_courses_scheduled: number | null;
  total_marks_obtained_count: number | null;
  avg_marks_per_student: number | null;
}

/** A COE institution resolved from a MyJKKN institution id. */
export interface CoeInstitutionRef {
  coeId: string;
  institutionCode: string;
  name: string | null;
  /** ALL MyJKKN institution ids this COE institution maps to (the "split college"
   *  halves). Used to merge attendance across a Self/Aided-style split. */
  myjkknInstitutionIds: string[];
}

// ── Read helpers ──────────────────────────────────────────────────────────────

/**
 * Resolve a MyJKKN institution UUID to its COE institution (id + code) by
 * reading COE's `institutions.myjkkn_institution_ids[]` bridge DIRECTLY from the
 * COE DB. This replaces the REST-based `resolveCoeInstitutionId` for the
 * direct-DB read path — the REST resolver breaks when the COE API key is
 * expired, whereas this does not. Note the CAS fan-out: one COE institution can
 * map to two MyJKKN ids, so a `contains` match is correct.
 */
export async function resolveCoeInstitutionByMyjkknId(
  myjkknInstitutionId: string,
): Promise<CoeInstitutionRef | null> {
  const coe = createCoeDbClient();
  const { data, error } = await coe
    .from('institutions')
    .select('id, institution_code, name, myjkkn_institution_ids')
    .contains('myjkkn_institution_ids', [myjkknInstitutionId])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`COE institutions resolve failed: ${error.message}`);
  if (!data) return null;
  return {
    coeId: data.id as string,
    institutionCode: data.institution_code as string,
    name: (data.name as string) ?? null,
    myjkknInstitutionIds: ((data.myjkkn_institution_ids as string[] | null) ?? []).filter(
      Boolean,
    ),
  };
}

/**
 * Auto-detect the "current" exam term for a COE institution.
 *
 * COE has no is_current/is_active flag and session_status is unreliable (several
 * rows per code: Planned / Registration Open / Results Declared), so we infer it
 * from the exam calendar: the earliest session whose exam window has not yet
 * ended (the ongoing-or-next exam the current teaching semester feeds into). If
 * every session is already over, we fall back to the most recently ended one.
 *
 * This is a best-effort heuristic — the page surfaces which term it picked and
 * lets an admin override, so a wrong guess is visible and correctable.
 */
export interface CoeCurrentTerm {
  session_code: string;
  session_name: string | null;
  exam_start_date: string | null;
  exam_end_date: string | null;
  reason: 'ongoing_or_next' | 'most_recent_past';
}

export async function getCoeCurrentTerm(
  coeInstitutionId: string | undefined,
  today: string,
): Promise<CoeCurrentTerm | null> {
  const sessions = await getCoeExaminationSessions(coeInstitutionId);
  // Collapse to one entry per session_code, keeping the widest window seen.
  const byCode = new Map<
    string,
    { name: string | null; start: string | null; end: string | null }
  >();
  for (const s of sessions) {
    const code = s.session_code;
    if (!code) continue;
    const cur = byCode.get(code);
    if (!cur) {
      byCode.set(code, { name: s.session_name, start: s.exam_start_date, end: s.exam_end_date });
    } else {
      if (s.exam_start_date && (!cur.start || s.exam_start_date < cur.start)) cur.start = s.exam_start_date;
      if (s.exam_end_date && (!cur.end || s.exam_end_date > cur.end)) cur.end = s.exam_end_date;
    }
  }
  const terms = [...byCode.entries()].map(([code, v]) => ({ code, ...v }));

  // Ongoing-or-next: exam window not yet ended, earliest start wins.
  const upcoming = terms
    .filter((t) => t.end && t.end >= today)
    .sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  if (upcoming.length > 0) {
    const t = upcoming[0];
    return {
      session_code: t.code,
      session_name: t.name,
      exam_start_date: t.start,
      exam_end_date: t.end,
      reason: 'ongoing_or_next',
    };
  }
  // Fallback: most recently ended.
  const past = terms
    .filter((t) => t.end)
    .sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''));
  if (past.length > 0) {
    const t = past[0];
    return {
      session_code: t.code,
      session_name: t.name,
      exam_start_date: t.start,
      exam_end_date: t.end,
      reason: 'most_recent_past',
    };
  }
  return null;
}

/** One row of the COE `institutions` bridge, shaped for the REST-compatible
 *  resolver cache in `internal-marks-access`. */
export interface CoeInstitutionBridgeRow {
  id: string;
  institution_code: string;
  name?: string | null;
  myjkkn_institution_ids: string[];
}

/**
 * All COE institutions with their MyJKKN bridge arrays, read DIRECTLY from the
 * COE DB. This is the direct-DB fallback for the REST-based
 * `getCoeInstitutions()` in internal-marks-access — the REST `/api/v1/institutions`
 * call breaks when the COE API key is expired, whereas this does not. Shape is
 * kept compatible with that resolver's in-memory cache entry.
 */
export async function getAllCoeInstitutions(): Promise<CoeInstitutionBridgeRow[]> {
  const coe = createCoeDbClient();
  const { data, error } = await coe
    .from('institutions')
    .select('id, institution_code, name, myjkkn_institution_ids');
  if (error) throw new Error(`COE institutions list read failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    institution_code: r.institution_code as string,
    name: (r.name as string | null) ?? null,
    myjkkn_institution_ids: (r.myjkkn_institution_ids as string[] | null) ?? [],
  }));
}

/**
 * Examination sessions, newest first. Optionally filter to one COE institution.
 */
export async function getCoeExaminationSessions(
  coeInstitutionId?: string,
): Promise<CoeExaminationSession[]> {
  const coe = createCoeDbClient();
  let q = coe
    .from('examination_sessions')
    .select(
      'id, session_code, session_name, session_status, semester_type, month_year, academic_year_id, exam_start_date, exam_end_date, created_at',
    )
    .order('created_at', { ascending: false });
  if (coeInstitutionId) q = q.eq('institutions_id', coeInstitutionId);
  const { data, error } = await q;
  if (error) throw new Error(`COE examination_sessions read failed: ${error.message}`);
  return (data ?? []) as CoeExaminationSession[];
}

/**
 * CIA entry summary per course for a session (from `cia_marks_summary_view`).
 * `sessionCode` is the human session code (e.g. "APRIL-MAY-2026"); optionally
 * narrow to one institution by its COE institution_code (e.g. "CAS").
 */
export async function getCoeCiaSummary(
  sessionCode: string,
  institutionCode?: string,
): Promise<CoeCiaCourseSummary[]> {
  const coe = createCoeDbClient();
  let q = coe
    .from('cia_marks_summary_view')
    .select('*')
    .eq('session_code', sessionCode);
  if (institutionCode) q = q.eq('institution_code', institutionCode);
  const { data, error } = await q;
  if (error) throw new Error(`COE cia_marks_summary_view read failed: ${error.message}`);
  return (data ?? []) as CoeCiaCourseSummary[];
}

/**
 * Final-marks summary per course for a session (from `final_marks_summary_view`).
 */
export async function getCoeFinalSummary(
  sessionCode: string,
  institutionCode?: string,
): Promise<CoeFinalCourseSummary[]> {
  const coe = createCoeDbClient();
  let q = coe
    .from('final_marks_summary_view')
    .select('*')
    .eq('session_code', sessionCode);
  if (institutionCode) q = q.eq('institution_code', institutionCode);
  const { data, error } = await q;
  if (error) throw new Error(`COE final_marks_summary_view read failed: ${error.message}`);
  return (data ?? []) as CoeFinalCourseSummary[];
}

/**
 * The ENTIRE final-marks summary view (every institution × session × course),
 * paged explicitly — the COE PostgREST caps a response at ~1000 rows and the
 * view holds 1,415+ rows (2026-07-26), so an unpaged read silently truncates.
 * Used by the nightly COE pass-percentage mirror cron, which aggregates
 * per-course rows up to institution × session pass percentages. Ordering is
 * pinned so paging is stable.
 */
export async function getCoeFinalSummaryAll(): Promise<CoeFinalCourseSummary[]> {
  const coe = createCoeDbClient();
  const pageSize = 1000;
  const out: CoeFinalCourseSummary[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await coe
      .from('final_marks_summary_view')
      .select(
        'institution_code, institution_name, session_code, session_name, ' +
          'program_code, program_name, course_code, course_name, ' +
          'total_students, published_count, passed_count, failed_count, ' +
          'avg_internal_percentage, avg_external_percentage, pass_percentage',
      )
      .order('institution_code', { ascending: true })
      .order('session_code', { ascending: true })
      .order('course_code', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`COE final_marks_summary_view read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as CoeFinalCourseSummary[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Per-session registration/scheduling statistics for one COE institution. */
export async function getCoeSessionStatistics(
  coeInstitutionId?: string,
): Promise<CoeSessionStatistics[]> {
  const coe = createCoeDbClient();
  let q = coe.from('examination_session_statistics').select('*');
  if (coeInstitutionId) q = q.eq('institutions_id', coeInstitutionId);
  const { data, error } = await q;
  if (error) throw new Error(`COE examination_session_statistics read failed: ${error.message}`);
  return (data ?? []) as CoeSessionStatistics[];
}

/** One COE CIA row per student × course, used to pair internal marks with attendance. */
export interface CoeCiaStudentDetail {
  student_id: string | null;
  student_name: string | null;
  stu_register_no: string | null;
  course_code: string | null;
  course_name: string | null;
  program_code: string | null;
  internal_percentage: number | null;
  total_internal_marks: number | null;
  max_internal_marks: number | null;
  marks_status: string | null;
}

/** One COE declared-result row per student × course (final_marks_detailed_view),
 *  used by the CO/PO attainment loop to compute per-course attainment proxies. */
export interface CoeFinalStudentDetail {
  student_id: string | null;
  course_code: string | null;
  course_name: string | null;
  program_code: string | null;
  internal_marks_obtained: number | null;
  internal_marks_maximum: number | null;
  external_marks_obtained: number | null;
  external_marks_maximum: number | null;
  total_marks_obtained: number | null;
  total_marks_maximum: number | null;
  percentage: number | null;
  is_pass: boolean | null;
}

/**
 * Per-student, per-course declared results for one session + COE institution
 * (from `final_marks_detailed_view`; filtered by `institutions_id` — the view
 * carries the COE institution UUID, not the code). Pages explicitly like
 * `getCoeCiaStudentDetail` (COE PostgREST caps responses at ~1000 rows).
 */
export async function getCoeFinalStudentDetail(
  sessionCode: string,
  coeInstitutionId: string,
): Promise<CoeFinalStudentDetail[]> {
  const coe = createCoeDbClient();
  const cols =
    'student_id, course_code, course_name, program_code, ' +
    'internal_marks_obtained, internal_marks_maximum, ' +
    'external_marks_obtained, external_marks_maximum, ' +
    'total_marks_obtained, total_marks_maximum, percentage, is_pass';
  const pageSize = 1000;
  const out: CoeFinalStudentDetail[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await coe
      .from('final_marks_detailed_view')
      .select(cols)
      .eq('session_code', sessionCode)
      .eq('institutions_id', coeInstitutionId)
      .eq('is_active', true)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`COE final_marks_detailed_view read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as CoeFinalStudentDetail[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/**
 * Per-student, per-course CIA detail for one session + institution.
 *
 * COE PostgREST caps a response at ~1000 rows regardless of the Range header, so
 * this pages explicitly with `.range()` until a short page is returned — a session
 * can hold several thousand student×course rows.
 */
export async function getCoeCiaStudentDetail(
  sessionCode: string,
  institutionCode: string,
): Promise<CoeCiaStudentDetail[]> {
  const coe = createCoeDbClient();
  const cols =
    'student_id, student_name, stu_register_no, course_code, course_name, ' +
    'program_code, internal_percentage, total_internal_marks, max_internal_marks, marks_status';
  const pageSize = 1000;
  const out: CoeCiaStudentDetail[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await coe
      .from('cia_marks_detailed_view')
      .select(cols)
      .eq('session_code', sessionCode)
      .eq('institution_code', institutionCode)
      .eq('is_active', true)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`COE cia_marks_detailed_view read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as CoeCiaStudentDetail[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

// ── Exam IA Audit (2026-07-13) ───────────────────────────────────────────────
// The Registrar's audit joins COE's university-bound records against MyJKKN's
// continuous data. These reads pull the RAW provenance columns the summary
// views hide: who entered each CIA row, when, in which round, and whether the
// attendance component was ever filled — the "as per JKKN data or some other
// data" fingerprint. Server-side only (service creds), scope-gated by the
// caller's fn_exam_audit_access() result in the API route.

/** Raw cia_marks provenance — one row per student × course entry. */
export interface CoeCiaProvenanceRow {
  student_id: string | null;
  program_id: string | null;
  course_id: string | null;
  cia_round: number | null;
  created_by: string | null;
  faculty_id: string | null;
  submission_date: string | null;
  created_at: string | null;
  is_verified: boolean | null;
  is_approved: boolean | null;
  attendance_marks: number | null;
  max_attendance_marks: number | null;
  total_internal_marks: number | null;
  max_internal_marks: number | null;
  internal_percentage: number | null;
}

/** Raw cia_marks provenance for a set of examination_session ids (one code can
 *  span several session rows) within one COE institution. Paged (~1000 cap). */
export async function getCoeCiaProvenance(
  sessionIds: string[],
  coeInstitutionId: string,
): Promise<CoeCiaProvenanceRow[]> {
  if (sessionIds.length === 0) return [];
  const coe = createCoeDbClient();
  const cols =
    'student_id, program_id, course_id, cia_round, created_by, faculty_id, ' +
    'submission_date, created_at, is_verified, is_approved, attendance_marks, ' +
    'max_attendance_marks, total_internal_marks, max_internal_marks, internal_percentage';
  const pageSize = 1000;
  const out: CoeCiaProvenanceRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await coe
      .from('cia_marks')
      .select(cols)
      .in('examination_session_id', sessionIds)
      .eq('institutions_id', coeInstitutionId)
      .eq('is_active', true)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`COE cia_marks read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as CoeCiaProvenanceRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** One exam registration — the universe of students the university expects. */
export interface CoeExamRegistrationRow {
  student_id: string | null;
  student_name: string | null;
  stu_register_no: string | null;
  program_code: string | null;
  course_code: string | null;
  registration_status: string | null;
}

/** Registrations for a session code within one COE institution. Paged. */
export async function getCoeExamRegistrations(
  sessionCode: string,
  coeInstitutionId: string,
): Promise<CoeExamRegistrationRow[]> {
  const coe = createCoeDbClient();
  const cols =
    'student_id, student_name, stu_register_no, program_code, course_code, registration_status';
  const pageSize = 1000;
  const out: CoeExamRegistrationRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await coe
      .from('exam_registrations')
      .select(cols)
      .eq('session_code', sessionCode)
      .eq('institutions_id', coeInstitutionId)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`COE exam_registrations read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as CoeExamRegistrationRow[];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** Program id → code/name bridge for one COE institution. */
export interface CoeProgramRef {
  id: string;
  program_code: string | null;
  program_name: string | null;
}

export async function getCoePrograms(
  coeInstitutionId: string,
): Promise<CoeProgramRef[]> {
  const coe = createCoeDbClient();
  const { data, error } = await coe
    .from('programs')
    .select('id, program_code, program_name')
    .eq('institutions_id', coeInstitutionId);
  if (error) throw new Error(`COE programs read failed: ${error.message}`);
  return (data ?? []) as CoeProgramRef[];
}

/** CIA settings (the assessment RUBRIC: rounds + components + entry windows)
 *  for a set of examination_session ids, read from cia_entry_settings.cia_rounds
 *  — the SAME canonical shape `/api/v1/cia-settings` serves (types/internal-marks
 *  CiaSettings/CiaRound/CiaComponent; consumed by the entry grid, round picker
 *  and my-marks). The table additionally scopes by a program_codes ARRAY, which
 *  the REST shape flattens — carried through here so callers can match programs. */
export type CoeCiaSettingsRow = import('@/types/internal-marks').CiaSettings & {
  program_codes?: string[] | null;
};

export async function getCoeCiaSettings(
  coeInstitutionId: string,
  sessionIds: string[],
): Promise<CoeCiaSettingsRow[]> {
  if (sessionIds.length === 0) return [];
  const coe = createCoeDbClient();
  const { data, error } = await coe
    .from('cia_entry_settings')
    .select('id, setting_name, examination_session_id, program_codes, cia_rounds, use_course_max, is_active')
    .eq('institutions_id', coeInstitutionId)
    .in('examination_session_id', sessionIds)
    .eq('is_active', true);
  if (error) throw new Error(`COE cia_entry_settings read failed: ${error.message}`);
  return (data ?? []) as CoeCiaSettingsRow[];
}
