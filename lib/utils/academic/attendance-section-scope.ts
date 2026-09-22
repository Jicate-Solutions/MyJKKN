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

/**
 * Whether the batch or group the user is marking can narrow the roster at all.
 *
 * Added: 2026-09-17 (BUG-006033, BUG-006034 — cluster ad0e2dca, both from JKKN
 * College of Arts and Science (Aided), reported 2026-09-03).
 *
 * A non-major elective is chosen PER LEARNER inside one section: 3 of the 35
 * learners in I B.Sc Commerce "A" took NME-I-SERICULTURE. The timetable can
 * express that in exactly one way — by naming those 3 on the sub-slot
 * (`SubdivisionGroup.student_ids`) or on the practical batch
 * (`BatchDefinition.student_ids`), the fields and pickers added by e57c978c0b
 * on 2026-08-17. Neither report's slot named anybody:
 *
 *   BUG-006033  combined slot, 2 sub-slots, both pointed at section f2cf7de7,
 *               neither carried student_ids       -> 35 listed, 3 belong
 *   BUG-006034  practical slot, 3 batches, all pointed at section 54f6f44a,
 *               none carried student_ids          -> 51 listed, 3 belong
 *               (Batch C's own `estimated_count` says 3)
 *
 * When nobody is named, both code paths skip their narrowing and the whole host
 * section loads. That is the defect, and its shape is precise: a slot divided
 * into several parts whose parts all cover the SAME sections and name NO
 * learners is not a division at all — every part shows the same full roster.
 *
 * This decides only that question. It cannot decide who elected the course:
 * there is no academic course-enrolment table on this database (`course_enrollments`
 * belongs to the public/online-courses module — course_events, packages, payments),
 * so the enrolment set genuinely does not exist anywhere but the timetable slot.
 * The caller's job is therefore to SAY SO, not to guess a narrower roster.
 *
 * Deliberately NOT a refusal. Measured against production on 2026-09-17, active
 * timetables hold 96 practical batches and 32 subdivision groups that narrow
 * nothing, and the last 90 days carry 1,024 marked practical periods and 150
 * marked subdivided periods. Blanking those rosters would take attendance
 * marking away from every one of them, which is the trade this screen has
 * already refused twice in writing (see the 2026-08-06 note in mark/page.tsx and
 * scopeRosterToAcademicYear: a roster slightly too wide beats no roster).
 */
export type RosterDivisionKind = 'practical_batch' | 'subdivision_group';

export interface RosterDivision {
  /** Identity within the slot: `batch_id`, or the sub-slot order as a string. */
  key: string;
  /** What the division is called on screen ("Batch C", "Group B"). */
  label: string;
  /** Learners this division names. Empty or absent means it names nobody. */
  studentIds?: readonly (string | null | undefined)[] | null;
  /** Sections this division covers. */
  sectionIds?: readonly (string | null | undefined)[] | null;
  /** The course this division teaches, when the divisions differ by course. */
  courseId?: string | null;
  /** Headcount the timetable recorded for this division, if it recorded one. */
  expectedCount?: number | null;
}

export type RosterDivisionOutcome =
  /** Names learners — the existing narrowing applies and is authoritative. */
  | 'narrowed_by_learners'
  /** Names nobody, but its own sections set it apart from its siblings. */
  | 'narrowed_by_section'
  /** The only division in the slot: the whole cohort is meant to be here. */
  | 'sole_division'
  /** Names nobody AND shares its sections with a sibling. The defect. */
  | 'narrows_nothing'
  /** The chosen key is not among the divisions; nothing to judge. */
  | 'unknown';

export interface RosterDivisionVerdict {
  outcome: RosterDivisionOutcome;
  /** True only for 'narrows_nothing'. The one flag callers need. */
  narrowsNothing: boolean;
  /** Labels of the siblings that cover exactly the same sections. */
  sharesScopeWith: string[];
  /**
   * True when one of those siblings teaches a DIFFERENT course — the elective
   * shape, where the listed learners are provably not all taking this course.
   * A same-course split lists the right cohort divided the wrong way, so the
   * message can be gentler; both are still reported.
   */
  siblingTeachesAnotherCourse: boolean;
  /** The division's recorded headcount, when it has one. */
  expectedCount: number | null;
}

/** Non-empty string ids, de-duplicated. Mirrors `nonEmpty` above for readonly input. */
function cleanDivisionIds(
  ids: readonly (string | null | undefined)[] | null | undefined
): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0) seen.add(id);
  }
  return Array.from(seen);
}

/** Sorted section key. Order inside the JSONB blob is not stable. */
function sectionScopeKey(
  ids: readonly (string | null | undefined)[] | null | undefined
): string {
  return cleanDivisionIds(ids).sort().join(',');
}

/**
 * Judge whether `chosenKey` narrows the roster within `divisions`.
 *
 * Anything it cannot judge narrows: an unknown key, a single division, a
 * division whose sections differ from every sibling's. Only the exact defect
 * shape — names nobody, and a sibling covers the identical sections — comes
 * back as `narrowsNothing`.
 *
 * A division with no sections at all is judged the same way as one with
 * sections: two parts that both say "no section" are equally indistinguishable,
 * and on this screen a sectionless slot falls back to programme/semester scope
 * (the 2026-08-06 note in mark/page.tsx), which is wider still.
 */
export function assessDivisionRosterScope(
  chosenKey: string | null | undefined,
  divisions: readonly RosterDivision[] | null | undefined
): RosterDivisionVerdict {
  const all = Array.isArray(divisions) ? divisions : [];
  const chosen = chosenKey ? all.find((d) => d.key === chosenKey) : undefined;

  const base = {
    narrowsNothing: false,
    sharesScopeWith: [] as string[],
    siblingTeachesAnotherCourse: false,
    expectedCount:
      typeof chosen?.expectedCount === 'number' ? chosen.expectedCount : null
  };

  if (!chosen) return { ...base, outcome: 'unknown' };
  if (cleanDivisionIds(chosen.studentIds).length > 0) {
    return { ...base, outcome: 'narrowed_by_learners' };
  }
  if (all.length < 2) return { ...base, outcome: 'sole_division' };

  const chosenScope = sectionScopeKey(chosen.sectionIds);
  const siblings = all.filter(
    (d) => d.key !== chosen.key && sectionScopeKey(d.sectionIds) === chosenScope
  );

  if (siblings.length === 0) {
    return { ...base, outcome: 'narrowed_by_section' };
  }

  return {
    ...base,
    outcome: 'narrows_nothing',
    narrowsNothing: true,
    sharesScopeWith: siblings.map((d) => d.label),
    siblingTeachesAnotherCourse: siblings.some(
      (d) => !!d.courseId && !!chosen.courseId && d.courseId !== chosen.courseId
    )
  };
}

/**
 * Should the teacher be told this roster was never narrowed? (BUG-006034)
 *
 * `narrowsNothing` catches only one shape: a division that names nobody AND
 * shares its sections with a sibling. Two more shapes list the whole host
 * section just as silently — a division that is the only one on its period
 * (`sole_division`), and one whose section set happens to be unique
 * (`narrowed_by_section`) — because a section filter that selects the host
 * section narrows nothing either. BUG-006034's "Sericulture Batch C" is the
 * second shape: it names nobody, its own estimated count says 3, and 51 were
 * listed.
 *
 * For those two the section filter cannot be SHOWN to have reduced anything,
 * so the honest test is the one the teacher can see with their own eyes: the
 * timetable says how many it expects, and the roster listed more. Without an
 * expected count there is nothing to compare, and we stay quiet rather than
 * warn on the 96 practical batches and 32 groups that narrow legitimately.
 */
export function shouldWarnUnfilteredRoster(
  verdict: Pick<RosterDivisionVerdict, 'outcome' | 'narrowsNothing' | 'expectedCount'> | null | undefined,
  listed: number | null | undefined
): boolean {
  if (!verdict) return false;
  // A division that names its learners has narrowed the roster by definition,
  // and 'unknown' means no division was chosen at all.
  if (verdict.outcome === 'narrowed_by_learners' || verdict.outcome === 'unknown') {
    return false;
  }
  if (verdict.narrowsNothing) return true;

  const expected = verdict.expectedCount;
  if (typeof expected !== 'number' || !Number.isFinite(expected) || expected <= 0) {
    return false;
  }
  if (typeof listed !== 'number' || !Number.isFinite(listed)) return false;
  return listed > expected;
}

/**
 * Who goes in the save payload when the roster was never narrowed (BUG-006034).
 *
 * Director ruling 2026-09-22, by tap: when the roster is known to be
 * unfiltered, nobody is pre-ticked — the teacher ticks only the learners who
 * actually attended. That is only half the change: both save paths read
 * `attendanceData[id] || 'Present'`, so an untouched learner would still be
 * SAVED as present and the empty tick boxes would be cosmetic.
 *
 * So on an unfiltered roster an untouched learner is omitted from the payload
 * entirely (returns null) rather than defaulted. On every ordinary period the
 * old default stands, because 1,024 marked practical and 150 marked subdivided
 * periods in the last 90 days rely on it and this ruling was about the elective
 * case only.
 */
export function attendanceStatusForSave(
  entry: string | null | undefined,
  rosterUnfiltered: boolean
): 'Present' | 'Absent' | 'OnDuty' | null {
  if (entry === 'Present' || entry === 'Absent' || entry === 'OnDuty') {
    return entry;
  }
  // Anything else (undefined, '', an unknown value) is "not marked".
  return rosterUnfiltered ? null : 'Present';
}

/** The save rows for one roster, dropping the learners nobody marked. */
export function attendanceRowsForSave<T extends { id: string }>(
  roster: readonly T[],
  attendanceData: Readonly<Record<string, string | undefined>>,
  rosterUnfiltered: boolean,
  toRow: (learner: T, status: 'Present' | 'Absent' | 'OnDuty') => Record<string, unknown>
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const learner of roster) {
    const status = attendanceStatusForSave(attendanceData[learner.id], rosterUnfiltered);
    if (status === null) continue;
    rows.push(toRow(learner, status));
  }
  return rows;
}

/**
 * Judge a subdivision group by what actually narrowed the roster (BUG-006033).
 *
 * For a non-practical subdivided period the roster is filtered by
 * `subdivisionStudentIds` from the URL, but the stored sub-slot carries its own
 * `student_ids`. Those two disagree the moment a coordinator fixes the data:
 * the stored group names its learners, an older bookmarked URL does not, and a
 * verdict read off the stored list then says "narrowed by learners" while the
 * whole host section is on screen. The warning would go silent exactly when
 * the office did the right thing.
 *
 * So the chosen group is re-stated with the learner list the ROSTER used. Every
 * other group is left alone — only the chosen one decides this verdict.
 */
export function withUrlNarrowing(
  divisions: readonly RosterDivision[] | null | undefined,
  chosenKey: string | null | undefined,
  urlStudentIds: string | null | undefined
): RosterDivision[] {
  const all = Array.isArray(divisions) ? [...divisions] : [];
  if (!chosenKey) return all;
  // Trimmed here, not in cleanDivisionIds (which the stored path shares): the
  // URL is untrusted text, and the roster filter compares raw ids with
  // `includes`, so a whitespace-only entry matches NO learner. Treating it as a
  // real id would claim a narrowing the roster never performed.
  const fromUrl = cleanDivisionIds(
    typeof urlStudentIds === 'string'
      ? urlStudentIds.split(',').map((id) => id.trim())
      : []
  );
  return all.map((d) =>
    d.key === chosenKey ? { ...d, studentIds: fromUrl } : d
  );
}
