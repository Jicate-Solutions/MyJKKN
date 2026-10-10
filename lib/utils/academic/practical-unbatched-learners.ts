/**
 * Learners of the loaded section(s) who sit in NONE of a practical slot's
 * batches, so they never appear on any batch's marking list.
 *
 * A batch covers a learner when it names them in `student_ids`. A batch that
 * names nobody covers its whole `section_ids` (and, with no sections either,
 * everybody) — that is how such a batch's roster loads today.
 *
 * Returns [] when no batch names any learner: those slots list the whole
 * section and already carry the "no learners are assigned" notice.
 *
 * Added: 2026-10-10 (BUG-006270 follow-up) - V. SUJITHA joined I B.Sc
 * Chemistry after the Generic Elective batches were picked and silently never
 * appeared on any batch's list. Director ruling: batch rosters must never be
 * silently incomplete.
 */
export function learnersInNoPracticalBatch<
  T extends { id: string; section_id?: string | null }
>(roster: T[], batches: unknown): T[] {
  if (!Array.isArray(batches) || batches.length === 0) return [];

  const named = new Set<string>();
  const wholeSections = new Set<string>();
  let anyNamed = false;

  for (const batch of batches as any[]) {
    const ids: unknown[] = Array.isArray(batch?.student_ids) ? batch.student_ids : [];
    const realIds = ids.filter((id): id is string => typeof id === 'string' && !!id);
    if (realIds.length > 0) {
      anyNamed = true;
      realIds.forEach((id) => named.add(id));
      continue;
    }
    const sections: unknown[] = Array.isArray(batch?.section_ids) ? batch.section_ids : [];
    const realSections = sections.filter(
      (sid): sid is string => typeof sid === 'string' && !!sid
    );
    // A batch with neither learners nor sections loads everybody.
    if (realSections.length === 0) return [];
    realSections.forEach((sid) => wholeSections.add(sid));
  }

  if (!anyNamed) return [];

  return roster.filter(
    (learner) =>
      !named.has(learner.id) &&
      !(learner.section_id && wholeSections.has(learner.section_id))
  );
}
