/**
 * Narrowing a practical period's roster to the learners in the selected batch.
 *
 * Added: 2026-08-17 (BUG-005826).
 *
 * A practical period offers the faculty a batch, and the batch decides who is
 * on the marking screen. Until now a batch could only say WHICH SECTIONS it
 * covers. That works for the case the feature was built for — a Pharmacy lab
 * split where each batch really is a whole section — and fails completely for
 * an allied/elective split, where the division is a per-learner choice made
 * INSIDE one section:
 *
 *   I B.Sc Chemistry, one section, 21 learners
 *     -> 12 chose the Maths allied
 *     ->  9 chose the Zoology allied
 *
 * Pointing the Zoology batch at "the section those 9 are in" names all 21.
 * `assignment_type: 'manual'` was offered in the timetable config UI as
 * "Manual student selection at attendance", but BatchDefinition had nowhere to
 * record the selection, so it behaved identically. Both batches showed everyone.
 *
 * `BatchDefinition.student_ids` closes that, mirroring the field
 * `SubdivisionGroup` has carried since 2025-10-11. This module is the one place
 * that reads it, so the marking screen and any future consumer cannot drift.
 */

/** Which rule produced the roster on screen. */
export type PracticalRosterSource = 'batch_students' | 'unnarrowed';

export interface PracticalBatchRosterResult<T> {
  /** The learners to show. Identical reference to the input when unnarrowed. */
  learners: T[];
  source: PracticalRosterSource;
  /**
   * Configured learner ids with no matching row in the loaded roster. Non-empty
   * means the batch and the enrolment data disagree — surface it, do not repair
   * it here.
   */
  unmatchedIds: string[];
}

function cleanIds(ids: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0) seen.add(id);
  }
  return Array.from(seen);
}

/**
 * Restrict `roster` to the learners a practical batch names.
 *
 * A batch that names nobody returns the roster untouched — that is every
 * section-assigned batch and every batch authored before `student_ids` existed,
 * and their behaviour must not change.
 *
 * A batch that names somebody is authoritative even when the intersection is
 * empty. Widening back to the full roster on a miss is tempting and wrong: it
 * is indistinguishable from having no configuration at all, which is precisely
 * how a 9-learner Zoology lab kept showing 19 names across two bug reports. The
 * caller gets `unmatchedIds` to explain the shortfall instead.
 *
 * Roster order is preserved. The roster arrives ordered by name; re-emitting it
 * in the order the ids happen to sit in the JSONB blob would reshuffle the
 * marking screen whenever someone edited the batch.
 */
export function narrowRosterToPracticalBatch<T extends { id: string }>(
  roster: T[],
  batchStudentIds: readonly (string | null | undefined)[] | null | undefined
): PracticalBatchRosterResult<T> {
  const configured = cleanIds(batchStudentIds);

  if (configured.length === 0) {
    return { learners: roster, source: 'unnarrowed', unmatchedIds: [] };
  }

  const configuredSet = new Set(configured);
  const learners = (roster || []).filter((learner) => configuredSet.has(learner.id));

  const present = new Set(learners.map((learner) => learner.id));
  const unmatchedIds = configured.filter((id) => !present.has(id));

  return { learners, source: 'batch_students', unmatchedIds };
}
