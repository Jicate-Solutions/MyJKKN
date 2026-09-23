/**
 * Approved holidays (Academic > Leaves, `institution_leaves`) and the timetables
 * they cover.
 *
 * Added: 2026-09-23 (BUG-005985) - extracted from the pending-attendance
 * dashboard (BUG-006141) so My Classes applies the same rule. Before this,
 * regular (weekday-keyed) and batch timetables listed classes on an approved
 * holiday; only cycle timetables skipped it, via get_cycle_for_date.
 */

export interface ApprovedLeaveRow {
  institution_id: string
  start_date: string
  end_date: string
  department_ids: string[] | null
  semester_ids: string[] | null
  section_ids: string[] | null
}

export interface LeaveScopedTimetable {
  institution_id: string
  department_id?: string | null
  semester_id?: string | null
  section_id?: string | null
  section_ids?: string[] | null
  // PostgREST to-one join `sections(id, ...)` - an object, but tolerate an array.
  sections?: { id?: string | null } | { id?: string | null }[] | null
}

const inScope = (ids: string[] | null, id: string | null | undefined) =>
  !ids || ids.length === 0 || (!!id && ids.includes(id))

/**
 * True when an approved leave covers `timetable` on `date` (yyyy-MM-dd).
 * An empty department/semester/section list on the leave means "all".
 */
export function isTimetableOnApprovedLeave(
  timetable: LeaveScopedTimetable,
  date: string,
  leaves: ApprovedLeaveRow[] | null | undefined
): boolean {
  return (leaves ?? []).some((l) => {
    if (l.institution_id !== timetable.institution_id) return false
    if (l.start_date > date || l.end_date < date) return false
    const joined = timetable.sections
    const sectionIds = [
      timetable.section_id,
      ...(timetable.section_ids ?? []),
      ...(Array.isArray(joined) ? joined.map((s) => s?.id) : [joined?.id])
    ].filter(Boolean) as string[]
    return (
      inScope(l.department_ids, timetable.department_id) &&
      inScope(l.semester_ids, timetable.semester_id) &&
      (!l.section_ids?.length || sectionIds.some((id) => l.section_ids!.includes(id)))
    )
  })
}
