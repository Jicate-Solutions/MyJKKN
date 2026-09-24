/**
 * Question-paper visibility scope.
 *
 * Decides how much of a session's papers a user may see, from their roles +
 * staff-plan course allocations. Tiers:
 *   - 'all'     — super_admin / coe / coe_office / principal (whole institution)
 *   - 'program' — hod (their program code(s))
 *   - 'course'  — faculty (only their assigned course codes)
 *
 * A multi-role user takes the HIGHEST tier (e.g. faculty + coe_office → 'all').
 *
 * Course/program membership is resolved purely MyJKKN-side:
 *   auth.uid() → staff.profile_id → staff.id
 *   → staff_plan_courses.staff_id → courses.course_code   (their courses)
 *   → staff_plan_courses → staff_plans.program_id → programs.program_id (their programs)
 *
 * An HOD also approves papers their DEPARTMENT sets for OTHER programs — allied,
 * generic-elective and non-major (NME/EDC) courses, e.g. Zoology's
 * 24UZOGE1 "Generic Elective Zoology-I" taught to I B.Sc Chemistry. Those programs
 * are not among the HOD's own teaching programs, so they are carried separately
 * in `departmentOfferings` and open ONLY those course codes — never the other
 * department's whole program.
 */

import { istToday } from '@/types/internal-marks';

export type QpLevel = 'all' | 'program' | 'course';

export interface QpScope {
  level: QpLevel;
  staffId: string | null;
  /** COE program codes (programs.program_id) the user is tied to. */
  programCodes: string[];
  /** COE course codes (courses.course_code) the user is assigned to teach. */
  courseCodes: string[];
  /**
   * HOD tier only: courses the HOD's department teaches into programs OUTSIDE
   * `programCodes` (allied / generic elective / non-major). Empty for every
   * other tier, and empty unless the caller passed includeDepartmentOfferings.
   */
  departmentOfferings: DepartmentOffering[];
}

/** One (program, semester, course) a department teaches into someone else's program. */
export interface DepartmentOffering {
  programCode: string;
  semesterNumber: number;
  courseCode: string;
}

/** True when the HOD's department teaches into this (program, semester). */
export function isDepartmentOfferedScope(
  scope: Pick<QpScope, 'departmentOfferings'>,
  programCode: string,
  semesterNumber: number
): boolean {
  return (scope.departmentOfferings ?? []).some(
    (o) => o.programCode === programCode && o.semesterNumber === semesterNumber
  );
}

/**
 * Course codes the HOD's department teaches into `programCode` (optionally one
 * semester). Empty when the department teaches nothing there.
 */
export function departmentCourseCodesFor(
  scope: Pick<QpScope, 'departmentOfferings'>,
  programCode: string | undefined,
  semesterNumber?: number | null
): string[] {
  if (!programCode) return [];
  return [
    ...new Set(
      (scope.departmentOfferings ?? [])
        .filter(
          (o) =>
            o.programCode === programCode &&
            (semesterNumber == null || o.semesterNumber === semesterNumber)
        )
        .map((o) => o.courseCode)
    ),
  ];
}

// Leadership that ALWAYS sees everything, even if they also teach (principal &
// friends). super_admin is handled by its flag before we get here.
const VIEW_ALL_ROLES = new Set([
  'principal',
  'administrator',
  'registrar',
  'ceo',
  'coo',
  'cao',
  'cbo',
]);
// CoE-office roles: see everything ONLY if they don't teach; a teaching CoE-office
// user is scoped to their own courses (like a faculty).
const ADMIN_ROLES = new Set(['coe', 'coe_office']);

/** Options that widen which staff_plans count as the user's. */
export interface QpScopeOptions {
  /**
   * MARK ENTRY ONLY. Question papers are authored while teaching is live, so the
   * default "plan is active TODAY" rule fits. CIA marks are keyed in AFTER
   * teaching ends, so that rule locks a faculty out of the very subject they
   * taught while the entry window is still open.
   *
   * Pass the CIA round's assessment period and a plan counts if it overlaps
   * EITHER that period or today. Implemented as one widened overlap test
   * ([min(from, today), max(to, today)]), which can also admit a plan sitting
   * entirely between the two — acceptable, since plans are per-term and the user
   * would hold the course in the same term anyway.
   */
  activeWithin?: { from?: string | null; to?: string | null };
  /**
   * QUESTION PAPERS ONLY. Also resolve `departmentOfferings` for an HOD — the
   * courses their department teaches into OTHER programs. Off by default so a
   * caller that does not honour offerings (mark entry, whose guard checks
   * `programCodes` alone) never has other programs put in front of the user.
   */
  includeDepartmentOfferings?: boolean;
}

/**
 * Resolve the caller's QP scope. `supabase` is a server client (service or RLS —
 * staff_plan_courses/staff reads must be visible to it).
 */
export async function resolveQpScope(
  supabase: any,
  userId: string,
  isSuperAdmin: boolean,
  profileRole: string | null,
  options: QpScopeOptions = {}
): Promise<QpScope> {
  if (isSuperAdmin) {
    return {
      level: 'all',
      staffId: null,
      programCodes: [],
      courseCodes: [],
      departmentOfferings: [],
    };
  }

  // Collect every role_key the user holds (union), not just profiles.role.
  const roleKeys = new Set<string>();
  if (profileRole) roleKeys.add(profileRole);
  try {
    const { data } = await supabase.rpc('get_user_roles_with_details', { p_user_id: userId });
    for (const r of (data ?? []) as any[]) if (r?.role_key) roleKeys.add(r.role_key);
  } catch {
    // fall back to profiles.role only
  }

  const isViewAll = [...roleKeys].some((k) => VIEW_ALL_ROLES.has(k));
  const isHod = roleKeys.has('hod');
  const isAdmin = [...roleKeys].some((k) => ADMIN_ROLES.has(k));

  // Tier priority: leadership (principal…) always all → HOD program → anyone who
  // TEACHES their own courses → CoE-office (non-teaching) all → else course/none.
  const pickLevel = (hasCourses: boolean): QpLevel =>
    isViewAll ? 'all' : isHod ? 'program' : hasCourses ? 'course' : isAdmin ? 'all' : 'course';

  // Resolve the staff record + their active-plan programs/courses FIRST — the tier
  // depends on whether the user actually TEACHES (has course codes).
  const { data: staff } = await supabase
    .from('staff')
    .select('id, department_id')
    .eq('profile_id', userId)
    .maybeSingle();
  const staffId: string | null = staff?.id ?? null;
  if (!staffId) {
    return {
      level: pickLevel(false),
      staffId: null,
      programCodes: [],
      courseCodes: [],
      departmentOfferings: [],
    };
  }

  // Their course + plan ids from staff_plan_courses (keyed on staff.id).
  const { data: spc } = await supabase
    .from('staff_plan_courses')
    .select('course_id, staff_plan_id')
    .eq('staff_id', staffId);
  const allPlanIds = [...new Set((spc ?? []).map((r: any) => r.staff_plan_id).filter(Boolean))];

  // Keep only ACTIVE plans: is_active AND overlapping the qualifying window.
  // Default window is a single day (today) — i.e. the plan must be running now.
  // With options.activeWithin the window widens to also cover the CIA assessment
  // period, so marks can still be entered after teaching has ended.
  const today = istToday();
  const windowStart =
    options.activeWithin?.from && options.activeWithin.from < today
      ? options.activeWithin.from
      : today;
  const windowEnd =
    options.activeWithin?.to && options.activeWithin.to > today ? options.activeWithin.to : today;
  const { data: activePlans } = allPlanIds.length
    ? await supabase
        .from('staff_plans')
        .select('id, program_id')
        .in('id', allPlanIds)
        .eq('is_active', true)
        .lte('start_date', windowEnd)
        .gte('end_date', windowStart)
    : { data: [] as any[] };
  const activePlanIds = new Set((activePlans ?? []).map((p: any) => p.id));
  const programIds = [...new Set((activePlans ?? []).map((p: any) => p.program_id).filter(Boolean))];

  // Course ids only from those active plans.
  const courseIds = [
    ...new Set(
      (spc ?? [])
        .filter((r: any) => activePlanIds.has(r.staff_plan_id))
        .map((r: any) => r.course_id)
        .filter(Boolean)
    ),
  ];

  // Resolve to COURSE CODE (not id) — the COE match keys on course_code, and
  // COE course ids differ from MyJKKN's.
  const [coursesRes, progsRes] = await Promise.all([
    courseIds.length
      ? supabase.from('courses').select('course_code').in('id', courseIds)
      : Promise.resolve({ data: [] as any[] }),
    programIds.length
      ? supabase.from('programs').select('program_id').in('id', programIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const courseCodes = [
    ...new Set((coursesRes.data ?? []).map((c: any) => c.course_code).filter(Boolean)),
  ] as string[];
  const programCodes = [
    ...new Set((progsRes.data ?? []).map((p: any) => p.program_id).filter(Boolean)),
  ] as string[];

  const level = pickLevel(courseCodes.length > 0);
  const departmentOfferings =
    level === 'program' && options.includeDepartmentOfferings
      ? await resolveDepartmentOfferings(
          supabase,
          userId,
          staff?.department_id ?? null,
          new Set(programCodes),
          windowStart,
          windowEnd
        )
      : [];

  return { level, staffId, programCodes, courseCodes, departmentOfferings };
}

/**
 * Courses the HOD's department(s) teach, in active plans, into programs the HOD
 * does not already see in full. Department = the HOD's own staff.department_id
 * (the live source), plus any departments.head_of_department_id pointing at the
 * user (kept for when that column is populated — migrations on main record it as
 * NULL for every department today, so staff.department_id carries the feature).
 *
 * Scope limit: the department is resolved by id only. At CAS, Self-Financing and
 * Aided each carry their own departments row, so staff filed under the OTHER
 * half's department are not scanned here.
 *
 * Reads through the caller's own client, so RLS still applies: if a row is not
 * visible to the HOD the offering is simply absent (fails closed — the same as
 * before this existed). Never throws. A read ERROR also yields no offerings, but
 * is logged, so "the department teaches nothing" and "the read failed" can be
 * told apart in the server logs.
 */
async function resolveDepartmentOfferings(
  supabase: any,
  userId: string,
  ownDepartmentId: string | null,
  ownProgramCodes: Set<string>,
  windowStart: string,
  windowEnd: string
): Promise<DepartmentOffering[]> {
  const warn = (step: string, error: unknown) =>
    console.warn(`[qp-scope] department offerings: ${step} read failed`, { userId, error });
  try {
    const departmentIds = new Set<string>();
    if (ownDepartmentId) departmentIds.add(ownDepartmentId);
    const { data: headed, error: headedErr } = await supabase
      .from('departments')
      .select('id')
      .eq('head_of_department_id', userId);
    if (headedErr) warn('departments', headedErr);
    for (const d of (headed ?? []) as any[]) if (d?.id) departmentIds.add(d.id);
    if (departmentIds.size === 0) return [];

    const { data: deptStaff, error: staffErr } = await supabase
      .from('staff')
      .select('id')
      .in('department_id', [...departmentIds]);
    if (staffErr) warn('staff', staffErr);
    const deptStaffIds = [...new Set((deptStaff ?? []).map((s: any) => s.id).filter(Boolean))];
    if (deptStaffIds.length === 0) return [];

    // Active plans only, filtered IN THE DATABASE through the inner join — never
    // the department's all-time plan history, and no long list of plan ids in
    // the query string.
    const { data: rows, error: spcErr } = await supabase
      .from('staff_plan_courses')
      .select('course_id, staff_plans!inner(id, program_id, semester_id)')
      .in('staff_id', deptStaffIds)
      .eq('staff_plans.is_active', true)
      .lte('staff_plans.start_date', windowEnd)
      .gte('staff_plans.end_date', windowStart);
    if (spcErr) warn('staff_plan_courses', spcErr);
    const activeRows = ((rows ?? []) as any[]).filter((r) => r?.course_id && r?.staff_plans);
    if (activeRows.length >= POSTGREST_ROW_CAP) {
      console.warn('[qp-scope] department offerings: active plan rows hit the row cap', {
        userId,
        rows: activeRows.length,
      });
    }
    if (activeRows.length === 0) return [];

    const courseIds = [...new Set(activeRows.map((r) => r.course_id))];
    const programIds = [
      ...new Set(activeRows.map((r) => r.staff_plans.program_id).filter(Boolean)),
    ];
    const semesterIds = [
      ...new Set(activeRows.map((r) => r.staff_plans.semester_id).filter(Boolean)),
    ];

    const [coursesRes, progsRes, semsRes] = await Promise.all([
      supabase.from('courses').select('id, course_code').in('id', courseIds),
      supabase.from('programs').select('id, program_id').in('id', programIds),
      supabase.from('semesters').select('id, semester_order').in('id', semesterIds),
    ]);
    if (coursesRes.error) warn('courses', coursesRes.error);
    if (progsRes.error) warn('programs', progsRes.error);
    if (semsRes.error) warn('semesters', semsRes.error);
    const courseCodeById = new Map((coursesRes.data ?? []).map((c: any) => [c.id, c.course_code]));
    const programCodeById = new Map((progsRes.data ?? []).map((p: any) => [p.id, p.program_id]));
    const semesterById = new Map((semsRes.data ?? []).map((s: any) => [s.id, s.semester_order]));

    const seen = new Set<string>();
    const offerings: DepartmentOffering[] = [];
    for (const r of activeRows) {
      const plan = r.staff_plans;
      const programCode = programCodeById.get(plan.program_id) as string | undefined;
      // A semester with no semester_order is skipped — the same rule the
      // planned-scopes dropdown applies, so the two never disagree.
      const semesterOrder = semesterById.get(plan.semester_id);
      const courseCode = courseCodeById.get(r.course_id) as string | undefined;
      if (!programCode || semesterOrder == null || !courseCode) continue;
      // Programs the HOD already sees in full need no per-course opening.
      if (ownProgramCodes.has(programCode)) continue;
      const key = `${programCode}:${semesterOrder}:${courseCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      offerings.push({ programCode, semesterNumber: Number(semesterOrder), courseCode });
    }
    return offerings;
  } catch (error) {
    warn('unexpected', error);
    return [];
  }
}

/** PostgREST's default max-rows; a result this long may have been truncated. */
const POSTGREST_ROW_CAP = 1000;
