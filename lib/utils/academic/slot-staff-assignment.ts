/**
 * Is this staff member assigned to this timetable slot?
 *
 * Added: 2026-08-10 — reported by MISS. THENMOZHI V (thenmozhi.v@jkkn.ac.in,
 * Staff Counselor, Pharmacology, JKKN College of Pharmacy): "Periods not
 * showing" on /academic/attendance, while the console recorded
 * "Number of periods found: 1". The period was fetched and then hidden.
 *
 * available-periods-cards only renders a period when
 * attendancePermissions.get(slot) === true, and that map is filled by
 * canMarkAttendanceForSlot → isStaffAssignedToSlot. That check read the slot
 * out of `timetables.timetable_data` and then looked for the staff in
 * `slot.staff_members` / `slot.sub_slots[].staff_members`.
 *
 * `staff_members` is not a stored field. It is synthesised by
 * getAvailablePeriodsForDate, which hydrates `staff_ids` against the staff
 * table while building the search results. The rows in the database carry
 * `staff_ids` and `primary_staff_id` and nothing else. Measured on production:
 * of 12,296 slots in active timetables, 12,296 have `staff_ids`, 12,296 have
 * `primary_staff_id`, and 0 have `staff_members`.
 *
 * So the assignment check could never succeed for a standard period, for any
 * staff member, anywhere. Only the practical branch — added later, and written
 * against `practical_config`, which IS stored — could return true. Ordinary
 * faculty never noticed because the caller falls through to a broad
 * role-permission tier that passes for role_key 'faculty'. Anyone relying on
 * being *assigned* rather than *broadly permitted* got a silent denial, and the
 * UI phrased it as "You are not assigned to teach any periods for this class".
 *
 * This predicate reads the fields that are actually persisted, and keeps
 * `staff_members` so it stays correct if handed an already-hydrated slot.
 * It deliberately mirrors the assignment rules that
 * getAvailablePeriodsForDate and getFacultyTodayPeriods already use to decide
 * which periods to SHOW, so that what a user is shown and what they may mark
 * can no longer disagree.
 */

export interface RawSubSlot {
  staff_ids?: unknown;
  staff_members?: unknown;
}

export interface RawTimetableSlot {
  staff_ids?: unknown;
  primary_staff_id?: unknown;
  staff_members?: unknown;
  sub_slots?: unknown;
  period_mode?: unknown;
  practical_config?: unknown;
}

/** `list` is an array containing `id`. */
function idInArray(list: unknown, id: string): boolean {
  return Array.isArray(list) && list.includes(id);
}

/** `list` is an array of hydrated records, one of which has `.id === id`. */
function idInRecordArray(list: unknown, id: string): boolean {
  return (
    Array.isArray(list) &&
    list.some((entry: any) => entry && entry.id === id)
  );
}

/**
 * Practical periods do not use staff_ids at all. Their staff live per batch in
 * practical_config.batches[].staff_mapping — an object keyed by course_id whose
 * values are arrays of staff ids.
 */
function inPracticalBatchStaff(slot: RawTimetableSlot, staffId: string): boolean {
  const config = slot.practical_config as any;
  if (slot.period_mode !== 'practical' || !config) return false;
  if (!Array.isArray(config.batches)) return false;

  return config.batches.some((batch: any) => {
    const mapping = batch?.staff_mapping;
    if (!mapping || typeof mapping !== 'object') return false;
    return Object.values(mapping).some((list) => idInArray(list, staffId));
  });
}

/**
 * Whether `staffId` teaches `slot`.
 *
 * Accepts a slot in either shape: straight out of `timetable_data`
 * (staff_ids / primary_staff_id / practical_config), or hydrated by the
 * search path (staff_members). Returns false for a missing slot or a blank id
 * rather than throwing — callers use this to gate marking, and an exception
 * mid-render would blank the period list entirely.
 */
export function isStaffAssignedToRawSlot(
  slot: RawTimetableSlot | null | undefined,
  staffId: string | null | undefined
): boolean {
  if (!slot || !staffId) return false;

  // Stored assignment on the slot itself.
  if (slot.primary_staff_id === staffId) return true;
  if (idInArray(slot.staff_ids, staffId)) return true;

  // Hydrated assignment, when the caller passes a search-path slot.
  if (idInRecordArray(slot.staff_members, staffId)) return true;

  // Combined classes: each sub-slot carries its own teacher.
  if (Array.isArray(slot.sub_slots)) {
    for (const subSlot of slot.sub_slots as RawSubSlot[]) {
      if (!subSlot) continue;
      if (idInArray(subSlot.staff_ids, staffId)) return true;
      if (idInRecordArray(subSlot.staff_members, staffId)) return true;
    }
  }

  // Practical periods assign per batch.
  if (inPracticalBatchStaff(slot, staffId)) return true;

  return false;
}
