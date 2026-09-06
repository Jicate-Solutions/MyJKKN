/**
 * Guard for section identifiers that arrive from outside the timetable.
 *
 * Added: 2026-08-06 — the "Mark Attendance" screen accepts a `sectionId` URL
 * query param and, for a practical period whose slot carries no section of its
 * own, uses it verbatim as the roster scope. Nothing checked that the section
 * belonged to the timetable being marked, so a Semester V section reached a
 * Semester III lab and produced a complete, confident, wrong roster (the
 * third-year list on a second-year SDC lab).
 *
 * The wrong roster rather than an empty one is the important part:
 * fn_attendance_roster treats section as AUTHORITATIVE and ignores
 * degree/program/semester whenever section ids are supplied (deliberate — see
 * BUG-003249/003250, where drifted denormalised copies were dropping valid
 * learners). So a bad section id cannot be caught downstream. It has to be
 * rejected before it becomes scope.
 */

export type SectionScopeRejection = 'semester_mismatch';

export interface SectionScopeRow {
  id: string;
  semester_id?: string | null;
}

export interface TimetableScopeRow {
  semester_id?: string | null;
  timetable_type?: string | null;
}

export interface SectionScopeVerdict {
  accepted: boolean;
  reason?: SectionScopeRejection;
}

const ACCEPTED: SectionScopeVerdict = { accepted: true };

/**
 * Decide whether `section` may be trusted as the attendance scope for
 * `timetable`.
 *
 * Judges on semester alone. Programme and department are deliberately excluded:
 * fn_attendance_roster already declines to filter on department because faculty
 * teach learners from other departments (subdivision groups, electives), and a
 * wider guard here would turn that supported case into a blank roster — trading
 * this bug for the one it was written to prevent.
 *
 * Anything it cannot judge is accepted. A missing semester on either side is a
 * data gap, not evidence of a mismatch, and refusing on absence would break
 * batch/cycle timetables that carry no semester of their own.
 */
export function verifySectionInTimetableScope(
  section: SectionScopeRow | null | undefined,
  timetable: TimetableScopeRow | null | undefined
): SectionScopeVerdict {
  if (!section || !timetable) return ACCEPTED;

  const sectionSemester = section.semester_id;
  const timetableSemester = timetable.semester_id;

  if (!sectionSemester || !timetableSemester) return ACCEPTED;

  if (sectionSemester !== timetableSemester) {
    return { accepted: false, reason: 'semester_mismatch' };
  }

  return ACCEPTED;
}

/**
 * Where the section used to save attendance came from, most to least
 * authoritative. Logged on the degraded paths so a future report says which
 * tier answered instead of leaving it to be re-derived.
 */
export type AttendanceScopeSource =
  | 'practical_batch'
  | 'context_section'
  | 'url_param'
  | 'slot_sections'
  | 'roster'
  | 'none';

export interface AttendanceScopeInputs {
  /** section_ids of the batch/lab the user picked, for practical periods. */
  practicalSectionIds?: string[] | null;
  /** The single section resolved while building page context. */
  contextSectionId?: string | null;
  /** The `sectionId` URL query param, already vetted by verifySectionInTimetableScope. */
  urlSectionId?: string | null;
  /** section_ids carried by the timetable slot itself (multi-section slots). */
  contextSectionIds?: string[] | null;
  /** section_id of each learner currently on screen. */
  rosterSectionIds?: (string | null | undefined)[] | null;
}

export interface AttendanceSaveScope {
  /** Representative section for the parent attendance record; null if unknown. */
  sectionId: string | null;
  /** Every section in scope. Callers forward this only when length > 1. */
  sectionIds: string[];
  source: AttendanceScopeSource;
}

const NO_SCOPE: AttendanceSaveScope = {
  sectionId: null,
  sectionIds: [],
  source: 'none'
};

function nonEmpty(ids: string[] | null | undefined): string[] | null {
  if (!Array.isArray(ids)) return null;
  const cleaned = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Decide which section attendance is saved against.
 *
 * Added: 2026-08-16 (BUG-005824) — the first four tiers below reproduce the
 * precedence that mark/page.tsx already applied in two duplicated places. The
 * fifth, `roster`, is new and is the fix.
 *
 * A slot may legitimately reach the save with all four original sources empty:
 * `timetable_data` is a JSONB blob, so nothing stops a slot being authored with
 * `section_id` NULL and `section_ids` [], and on a semester-level timetable the
 * parent's own `section_id` is NULL too. 569 such slots exist across 34 active
 * timetables. loadStudents deliberately tolerates this — it falls back to
 * programme/semester scope so the faculty still gets a roster — but the save
 * then refused, discarding work already done and telling the user to "go back
 * and select a section" on a screen with no section control.
 *
 * The roster tier closes that gap without guessing: every learner carries their
 * own `section_id`, and the per-learner write already prefers it. This reads the
 * section that is demonstrably on screen rather than inferring one from
 * programme/semester — inference is what put a third-year roster on a
 * second-year lab (see verifySectionInTimetableScope above), and it would be
 * actively wrong for the 6 affected batch timetables that have several
 * candidate sections.
 *
 * Ordering matters at the practical tier: a practical's roster spans the whole
 * cohort while the batch selection is narrower and authoritative, so the batch
 * must continue to outrank everything.
 */
export function resolveAttendanceSaveScope(
  inputs: AttendanceScopeInputs
): AttendanceSaveScope {
  const practical = nonEmpty(inputs.practicalSectionIds);
  if (practical) {
    return { sectionId: practical[0], sectionIds: practical, source: 'practical_batch' };
  }

  if (inputs.contextSectionId) {
    return {
      sectionId: inputs.contextSectionId,
      sectionIds: [inputs.contextSectionId],
      source: 'context_section'
    };
  }

  if (inputs.urlSectionId) {
    return {
      sectionId: inputs.urlSectionId,
      sectionIds: [inputs.urlSectionId],
      source: 'url_param'
    };
  }

  const slotSections = nonEmpty(inputs.contextSectionIds);
  if (slotSections) {
    return { sectionId: slotSections[0], sectionIds: slotSections, source: 'slot_sections' };
  }

  const roster = nonEmpty(inputs.rosterSectionIds as string[] | null | undefined);
  if (roster) {
    // Sorted, not first-seen: a programme/semester fallback roster can span
    // sections, and learner order is not stable across loads. Without this two
    // saves of the same screen could disagree on the parent record's section.
    const distinct = Array.from(new Set(roster)).sort();
    return { sectionId: distinct[0], sectionIds: distinct, source: 'roster' };
  }

  return NO_SCOPE;
}

export interface PeriodSectionSource {
  sections?: { id?: string | null }[] | null;
  section_ids?: (string | null | undefined)[] | null;
}

/**
 * Pick the section to send to the mark page for a period the user clicked.
 *
 * Added: 2026-08-16 — academic/attendance/page.tsx ranked `searchContext.section_id`
 * (the FILTER PANEL's section) above the period's own section in all three of its
 * navigation paths. Clicking a period from a different semester than the filter
 * therefore sent a foreign section to the mark page, where
 * verifySectionInTimetableScope rejected it and showed "The selected section
 * belongs to a different semester than this timetable and was ignored."
 *
 * That is the same precedence the 2026-08-06 comment in mark/page.tsx blames for
 * putting a Semester V roster on a Semester III lab. The guard was added to catch
 * the consequence; this fixes the cause. The period's own section is what the
 * timetable actually encodes, so it must win.
 *
 * Safe as of the 2026-08-16 backfill: every one of the 12,534 slot→section
 * references across active timetables resolves to a section in the timetable's own
 * semester, so a period's own section can never trip the guard. The filter's
 * section is kept as a last resort for slots that still carry none — a section the
 * guard can vet beats no section at all.
 *
 * Multi-section periods never reach here: handlePeriodSelection routes them to the
 * "mark all sections together" path first, so this cannot override a deliberate
 * choice between sections.
 */
export function resolvePeriodSectionId(
  period: PeriodSectionSource | null | undefined,
  searchContextSectionId: string | null | undefined
): string | undefined {
  const fromSections = period?.sections?.find((s) => !!s?.id)?.id;
  if (fromSections) return fromSections;

  const fromIds = period?.section_ids?.find((id) => !!id);
  if (fromIds) return fromIds;

  // searchContext.section_id is initialised to '', so guard on truthiness.
  return searchContextSectionId || undefined;
}
