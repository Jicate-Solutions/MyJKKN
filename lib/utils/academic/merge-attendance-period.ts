import type {
  ConsolidatedAttendancePeriod,
  ConsolidatedAttendanceStudent
} from '@/types/attendance';

/**
 * Learners of every batch of this practical slot EXCEPT `ownBatchId`, read from
 * the timetable's current practical_config. Returns null when the slot or its
 * batches cannot be found, which tells the merge it does not know who belongs
 * to whom.
 *
 * Added: 2026-09-23 (BUG-006196)
 */
export function otherBatchStudentIds(
  timetableData: unknown,
  periodKey: string,
  ownBatchId: string
): Set<string> | null {
  if (!timetableData || typeof timetableData !== 'object') return null;
  const slotId = periodKey.split('_group_')[0];
  let found = false;
  const result = new Set<string>();

  for (const day of Object.values(timetableData as Record<string, unknown>)) {
    if (!day || typeof day !== 'object') continue;
    for (const slot of Object.values(day as Record<string, any>)) {
      if (slot?.slot_id !== slotId) continue;
      const batches = slot?.practical_config?.batches;
      if (!Array.isArray(batches)) continue;
      found = true;
      for (const batch of batches) {
        if (!batch || batch.batch_id === ownBatchId || !Array.isArray(batch.student_ids)) continue;
        batch.student_ids.forEach((id: unknown) => typeof id === 'string' && result.add(id));
      }
    }
  }
  return found ? result : null;
}

/**
 * Merges an incoming attendance period into the existing stored period.
 *
 * Practical batches all share one period_id, so a plain replace would let the
 * second batch's save wipe the first batch's students. But a blind union (the
 * behaviour until 2026-09-23) also meant a batch could never drop a learner it
 * had once saved — BUG-006196, a learner moved out of the batch kept coming
 * back on every re-save. So when the other batches' learners are known, keep
 * only THOSE from the stored list and let the incoming list replace the rest.
 * With `otherBatchIds` null (standard period, or batches unknown) the old
 * union is kept.
 */
export function mergeAttendancePeriod(
  existing: ConsolidatedAttendancePeriod | undefined,
  incoming: ConsolidatedAttendancePeriod,
  otherBatchIds: Set<string> | null
): ConsolidatedAttendancePeriod {
  if (!existing) return incoming;

  const kept = (existing.students || []).filter(
    (s) => !otherBatchIds || otherBatchIds.has(s.student_id)
  );
  const studentMap = new Map<string, ConsolidatedAttendanceStudent>(
    kept.map((s) => [s.student_id, s])
  );
  (incoming.students || []).forEach((s) => studentMap.set(s.student_id, s));

  return {
    ...existing,
    ...incoming,
    students: Array.from(studentMap.values())
  };
}
