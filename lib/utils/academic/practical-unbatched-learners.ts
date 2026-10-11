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
 * Only learners in a section some batch lists are checked (the union of every
 * batch's `section_ids`), the same rule fn_attendance_roster applies under a
 * section scope: a learner with no `section_id` is skipped there, since such a
 * learner never matches a section. When no batch lists any section, the
 * roster came from the programme/semester fallback and every learner on it is
 * checked.
 *
 * Updated: 2026-10-11 (#4332 review) - limited to the batches' sections and
 * null-section learners skipped under a section scope.
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
  const scopeSections = new Set<string>();
  let anyNamed = false;

  for (const batch of batches as any[]) {
    const sections: unknown[] = Array.isArray(batch?.section_ids) ? batch.section_ids : [];
    const realSections = sections.filter(
      (sid): sid is string => typeof sid === 'string' && !!sid
    );
    realSections.forEach((sid) => scopeSections.add(sid));

    const ids: unknown[] = Array.isArray(batch?.student_ids) ? batch.student_ids : [];
    const realIds = ids.filter((id): id is string => typeof id === 'string' && !!id);
    if (realIds.length > 0) {
      anyNamed = true;
      realIds.forEach((id) => named.add(id));
      continue;
    }
    // A batch with neither learners nor sections loads everybody.
    if (realSections.length === 0) return [];
    realSections.forEach((sid) => wholeSections.add(sid));
  }

  if (!anyNamed) return [];

  return roster.filter((learner) => {
    if (named.has(learner.id)) return false;
    if (scopeSections.size > 0) {
      if (!learner.section_id || !scopeSections.has(learner.section_id)) return false;
      if (wholeSections.has(learner.section_id)) return false;
    }
    return true;
  });
}
