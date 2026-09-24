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
