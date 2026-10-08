/**
 * Practical periods (period_mode='practical') keep their sections only inside
 * practical_config.batches[*].section_ids — slot.section_ids is []. Returns the
 * sections of the batches this staff teaches (staff_mapping values are arrays
 * of staff ids), deduped in batch order.
 *
 * Added: 2026-09-23 (BUG-006198) - without a section the faculty My Classes
 * pre-check skipped practical periods, so a marked practical stayed "pending".
 */
export function practicalSectionIdsForStaff(batches: unknown, staffId: string): string[] {
  if (!Array.isArray(batches)) return [];
  const result: string[] = [];
  for (const batch of batches as any[]) {
    const mapping = batch?.staff_mapping;
    if (!mapping || typeof mapping !== 'object') continue;
    const teaches = Object.values(mapping).some(
      (list: any) => Array.isArray(list) && list.includes(staffId)
    );
    if (!teaches || !Array.isArray(batch.section_ids)) continue;
    for (const sid of batch.section_ids) {
      if (typeof sid === 'string' && sid && !result.includes(sid)) result.push(sid);
    }
  }
  return result;
}

type MarkedInfo = { isMarked: boolean; recordId?: string };

/**
 * Marked state for practical periods in the Search Periods view (HOD /
 * principal / admin), from the day's student_attendance rows of each period's
 * timetable. A practical period is marked once EVERY batch in
 * practical_config.batches has saved — i.e. some row holds the slot with
 * `batch_selected.batch_id` equal to that batch. A period with no batches stays
 * unmarked.
 *
 * Not section-keyed on purpose: a batch save can land in a row whose
 * section_id is not one of the batch's sections (II MBA, 13 Jul: SCINVM and FS
 * sit in the row of section 8e292d24, which no batch lists), so looking rows up
 * by batch section misses real saves.
 *
 * Known gap: two batches that save into the SAME row share one slot entry and
 * the later save's batch_selected replaces the earlier one, so the earlier
 * batch reads as unsaved — the period stays "pending", as it always did here.
 *
 * Added: 2026-09-28 (BUG-004733) - practical periods were hard-coded
 * "not marked" here, so an MBA HOD saw every saved specialisation hour as
 * pending.
 */
export function practicalPeriodsMarkedFromRecords(
  periods: Array<{ timetable_slot_id: string; timetable_id: string; practical_config?: any }>,
  records: Array<{ id: string; timetable_id: string; attendance_data: any }>
): Map<string, MarkedInfo> {
  const result = new Map<string, MarkedInfo>();
  for (const period of periods) {
    const slotId = period.timetable_slot_id;
    const batches: any[] = Array.isArray(period.practical_config?.batches)
      ? period.practical_config.batches
      : [];
    const batchIds = batches
      .map((b) => b?.batch_id)
      .filter((id): id is string => typeof id === 'string' && !!id);
    if (batchIds.length === 0) {
      result.set(slotId, { isMarked: false });
      continue;
    }

    const saved = new Set<string>();
    let recordId: string | undefined;
    for (const record of records) {
      if (record.timetable_id !== period.timetable_id) continue;
      const entry = record.attendance_data?.[slotId];
      const students = entry?.students;
      if (!Array.isArray(students) || students.length === 0) continue;
      const batchId = entry?.batch_selected?.batch_id;
      if (typeof batchId === 'string' && batchIds.includes(batchId)) {
        saved.add(batchId);
        recordId ??= record.id;
      }
    }

    const isMarked = batchIds.every((id) => saved.has(id));
    result.set(slotId, isMarked ? { isMarked, recordId } : { isMarked: false });
  }
  return result;
}

const teachesBatch = (batch: any, staffId: string): boolean => {
  const mapping = batch?.staff_mapping;
  if (!mapping || typeof mapping !== 'object') return false;
  return Object.values(mapping).some((list: any) => Array.isArray(list) && list.includes(staffId));
};

/**
 * Learners of the practical batches this staff teaches, deduped in batch order.
 * Returns null when the answer is unknown — the staff teaches no batch, or one
 * of their batches names no learners (a whole-section batch) — so callers keep
 * the old "any learners stored" test instead of guessing.
 *
 * Added: 2026-09-23 (BUG-006204) - every batch of a slot saves under one
 * attendance_data[slot_id] key, so "is this batch marked?" needs the batch's
 * own learners.
 */
export function practicalStudentIdsForStaff(batches: unknown, staffId: string): string[] | null {
  if (!Array.isArray(batches)) return null;
  const own = (batches as any[]).filter((batch) => teachesBatch(batch, staffId));
  if (own.length === 0) return null;
  const result: string[] = [];
  for (const batch of own) {
    const ids = Array.isArray(batch.student_ids) ? batch.student_ids : [];
    if (ids.length === 0) return null;
    for (const id of ids) {
      if (typeof id === 'string' && id && !result.includes(id)) result.push(id);
    }
  }
  return result;
}

/**
 * Whether a stored attendance_data period counts as marked for these learners.
 * With no learner list it is the old test (any learners stored); with one, at
 * least one of THOSE learners must be stored — so Batch B's save no longer
 * reads as Batch A's.
 *
 * Added: 2026-09-23 (BUG-006204)
 */
export function periodMarkedForLearners(
  periodData: unknown,
  learnerIds: string[] | null | undefined
): boolean {
  const p = periodData as any;
  if (!p) return false;
  const stored: any[] = [
    ...(Array.isArray(p.students) ? p.students : []),
    ...(Array.isArray(p.groups)
      ? p.groups.flatMap((g: any) => (Array.isArray(g?.students) ? g.students : []))
      : []),
  ];
  if (stored.length === 0) return false;
  if (!learnerIds || learnerIds.length === 0) return true;
  const wanted = new Set(learnerIds);
  return stored.some((s) => wanted.has(s?.student_id));
}
