/**
 * Which department a HOD / faculty member's timetable list is narrowed to, and
 * whose own timetables must survive that narrowing.
 *
 * WHY THE CREATOR IS KEPT (BUG-005845)
 * A HOD or faculty member's list defaults to their profile department, and the
 * filter bar also writes that same id into the URL on first load. The default
 * is a convenience, not an access rule: `timetables_select_permission` grants
 * SELECT per institution, never per department. But a timetable belongs to the
 * PROGRAM's department, which is often not the creator's own — in a nursing
 * college the teacher sits in a specialty department while the B.Sc. Nursing
 * program sits in another. So the timetable a teacher had just built vanished
 * from their own list the moment they saved it ("it shows 0 rows").
 * Production 2026-09-24: 58 HOD-created and 14 faculty-created timetables live
 * outside their creator's profile department, 59 of them still active.
 *
 * The rule is therefore "my department's timetables, plus any I created". It
 * applies only while the department in force IS the role default. The URL
 * cannot say whether a department id came from the default or from the user
 * picking it, because the filter bar auto-writes the default; comparing the
 * value is the only signal, and a user who picks their own department gets the
 * same answer either way. Any other department the user picks is honoured
 * exactly.
 */
export interface TimetableListScopeInput {
  /** department_id from the URL, if any */
  urlDepartmentId?: string;
  userId?: string;
  profile?: {
    role?: string | null;
    department_id?: string | null;
  } | null;
  isSuperAdmin: boolean;
}

export interface TimetableListScope {
  departmentId?: string;
  /** Also list rows this user created, whatever their department. */
  alsoCreatedBy?: string;
}

export function resolveTimetableListScope({
  urlDepartmentId,
  userId,
  profile,
  isSuperAdmin
}: TimetableListScopeInput): TimetableListScope {
  const roleDefaultDepartmentId =
    !isSuperAdmin &&
    (profile?.role === 'hod' || profile?.role === 'faculty') &&
    profile?.department_id
      ? profile.department_id
      : undefined;

  const departmentId = urlDepartmentId || roleDefaultDepartmentId;

  const alsoCreatedBy =
    departmentId && userId && departmentId === roleDefaultDepartmentId
      ? userId
      : undefined;

  return { departmentId, alsoCreatedBy };
}
