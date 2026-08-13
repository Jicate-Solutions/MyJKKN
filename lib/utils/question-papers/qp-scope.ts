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
    return { level: 'all', staffId: null, programCodes: [], courseCodes: [] };
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
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();
  const staffId: string | null = staff?.id ?? null;
  if (!staffId) {
    return { level: pickLevel(false), staffId: null, programCodes: [], courseCodes: [] };
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

  return { level: pickLevel(courseCodes.length > 0), staffId, programCodes, courseCodes };
}
