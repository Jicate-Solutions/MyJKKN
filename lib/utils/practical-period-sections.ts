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
