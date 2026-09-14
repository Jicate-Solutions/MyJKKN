import { createClientSupabaseClient } from '@/lib/supabase/client';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/utils/enhanced-logger';
import { trackUsage } from '@/lib/utils/track-usage';
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';
import type {
  Timetable,
  CreateTimetableDto,
  UpdateTimetableDto,
  TimetableFilters,
  TimetableListResponse,
  TemplateFilters,
  TemplateListResponse,
  CreateTemplateDto,
  UpdateTemplateDto,
  DayOfWeek,
  TimetableData
} from '@/types/academics';
import toast from 'react-hot-toast';

export class TimetableService {
  private static supabase = createClientSupabaseClient();

  // Helper method to check if timetable has attendance marked
  static async hasAttendanceMarked(timetableId: string): Promise<{
    hasAttendance: boolean;
    attendanceCount: number;
    markedPeriods: string[];
  }> {
    try {
      const { data: attendanceRecords, error } = (await this.supabase
        .from('student_attendance')
        .select('id, attendance_data')
        .eq('timetable_id', timetableId)) as {
        data: Array<{ id: string; attendance_data: any }> | null;
        error: any;
      };

      if (error) {
        logger.error('academic/timetables', 'Error checking attendance', error);
        return { hasAttendance: false, attendanceCount: 0, markedPeriods: [] };
      }

      if (!attendanceRecords || attendanceRecords.length === 0) {
        return { hasAttendance: false, attendanceCount: 0, markedPeriods: [] };
      }

      // Collect all periods that have attendance marked
      const markedPeriods = new Set<string>();
      let totalAttendanceCount = 0;

      attendanceRecords.forEach((record) => {
        const attendanceData = record.attendance_data || {};
        Object.keys(attendanceData).forEach((periodId) => {
          if (attendanceData[periodId]?.students?.length > 0) {
            markedPeriods.add(periodId);
            totalAttendanceCount++;
          }
        });
      });

      return {
        hasAttendance: markedPeriods.size > 0,
        attendanceCount: attendanceRecords.length,
        markedPeriods: Array.from(markedPeriods)
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error in hasAttendanceMarked', error);
      return { hasAttendance: false, attendanceCount: 0, markedPeriods: [] };
    }
  }

  // Check if a specific period slot has attendance marked
  static async isPeriodSlotLocked(
    timetableId: string,
    periodId: string,
    day?: string, // For regular mode: day of week, for batch mode: date
    isBatch: boolean = false
  ): Promise<{
    isLocked: boolean;
    attendanceCount: number;
    attendanceDate?: string;
  }> {
    try {
      let attendanceQuery: any = this.supabase
        .from('student_attendance')
        .select('id, attendance_data, attendance_date')
        .eq('timetable_id', timetableId);

      // CRITICAL: Only add date filter for batch mode with valid date format
      // Regular mode passes day of week which CANNOT be used as date filter
      if (isBatch) {
        // Validate date format to prevent SQL errors
        const isValidDate = day && /^\d{4}-\d{2}-\d{2}$/.test(day);
        if (isValidDate) {
          attendanceQuery = attendanceQuery.eq('attendance_date', day);
        } else {
          logger.warn('academic/timetables', 'isPeriodSlotLocked: Batch mode but invalid/missing date', { day });
        }
      }

      const { data: attendanceCheck, error } = (await attendanceQuery) as {
        data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
        error: any;
      };

      if (error) {
        logger.error('academic/timetables', 'Error checking period lock status', error);
        return { isLocked: false, attendanceCount: 0 };
      }

      if (!attendanceCheck || attendanceCheck.length === 0) {
        return { isLocked: false, attendanceCount: 0 };
      }

      // Check if this specific period/slot has attendance marked
      let isLocked = false;
      let attendanceCount = 0;
      let attendanceDate = '';

      for (const record of attendanceCheck) {
        const attendanceData = record.attendance_data || {};

        // Check multiple possible keys for the period
        const possibleKeys = [
          periodId,
          `${day}_${periodId}`, // day_period format
          `slot_${periodId}` // slot_period format
        ];

        for (const key of possibleKeys) {
          if (attendanceData[key] && attendanceData[key].students?.length > 0) {
            isLocked = true;
            attendanceCount = attendanceData[key].students.length;
            attendanceDate = record.attendance_date;
            break;
          }
        }

        if (isLocked) break;
      }

      return {
        isLocked,
        attendanceCount,
        attendanceDate: attendanceDate || undefined
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error checking period slot lock', error);
      return { isLocked: false, attendanceCount: 0 };
    }
  }

  /**
   * ONE ACTIVE TIMETABLE PER SECTION, PER ACADEMIC YEAR.
   *
   * The rule is the SECTION inside the academic year, NOT the date range and
   * NOT the wider hierarchy:
   *   academic_year + section   (+ is_active)
   *
   * Two or more timetables may share an academic year freely — that is the
   * normal case, one per section. What is refused is a SECOND timetable for a
   * section that already has one.
   *
   * WHY THE KEY IS ONLY THESE TWO COLUMNS
   * It used to be seven (institution + academic_year + degree + program +
   * department + semester + section). All six extras are FUNCTIONALLY
   * DETERMINED BY THE SECTION: `sections` carries institution_id, degree_id,
   * program_id, department_id AND semester_id, so a section_id match has
   * already pinned every one of them. Re-asserting a determined column can only
   * narrow a match section_id had already made — never widen it — so the extras
   * were dead weight that could only ever produce a false negative if the two
   * copies of the value drifted apart.
   *
   * SEMESTER IN PARTICULAR IS NOT LOST. A section row belongs to exactly one
   * semester, so "Section A" is a DIFFERENT ROW in Semester III and in
   * Semester IV. Both of that section's timetables therefore live in the same
   * academic year quite happily — they have different section_ids. Verified on
   * production 2026-09-07: across all 202 non-template timetables,
   * sections.semester_id equals timetables.semester_id in 202 cases, with zero
   * divergences and zero sections lacking a semester.
   *
   * Measured the same day: collapsing the key to (academic_year, section) flags
   * exactly one pair — the long-standing "NEW CRRI ZENFORIANZ SECTION - A"
   * duplicate described below, itself a same-semester duplicate. No legitimate
   * row is newly blocked, and 0 of 190 section/year pairs have ever held
   * timetables in two different semesters.
   *
   * SECTIONLESS (semester-level) TIMETABLES ARE A DIFFERENT RULE ENTIRELY.
   * A row with section_id NULL has no section to be identified by, so it
   * compares on the full hierarchy plus the semester — AND on the date range.
   * Applying the section rule to a scope that has no section made the first
   * semester-level timetable of an academic year the only one a department
   * could ever create. Production 2026-09-10, JKKN Dental "4 Year": the
   * year-long "4th Year 2026-2027 DRAVENCOREZ THEORY" (section_id NULL,
   * 2026-01-05 to 2027-01-05) refused every later semester-level timetable in
   * that year, with a message telling the operator to free a section they had
   * never chosen. `timetable_type` defaults to 'semester' and the form
   * recommends it, so this is the path most operators are on.
   *
   * OVERLAP IS THE RIGHT KEY FOR THESE ROWS. A learner's semester-level
   * timetable is resolved by StudentTimetableService.selectBestTimetable, which
   * gathers every candidate and returns the one whose range covers today.
   * Disjoint ranges are therefore unambiguous — each is the answer on its own
   * days. Overlapping ranges are not: one of the two is silently invisible to
   * learners and to attendance, and that is the conflict worth refusing. A
   * missing bound counts as unbounded, so the dateless hole stays shut.
   *
   * OVERLAPPING DATES ARE NOT ENOUGH — THE SECTION SETS MUST INTERSECT TOO.
   * Added 2026-09-11. A semester-level timetable does NOT cover its whole
   * semester; it covers the sections its slots name, and now says so in
   * `timetables.section_ids`. Treating the date range as the entire key made the
   * first timetable of a semester reserve every section in it.
   *
   * That is not an edge case. JKKN Dental's 4th Year BDS semester holds 24
   * sections in three PARALLEL GROUPS — A..H, ADD 4A..ADD 4H, TROIZ A..TROIZ H —
   * and each group needs its own timetable on the SAME academic year and the
   * SAME dates. The live "4th Year 2026-2027 DRAVENCOREZ THEORY" names exactly
   * the eight A..H ids on every slot: 8 of 24 sections, yet it refused the ADD
   * and TROIZ timetables, which share not one section with it. The operator's
   * only way through was eight hand-built section-level rows per group.
   *
   * WHY A DECLARED COLUMN AND NOT THE SLOT JSON. The scope was already derivable
   * from the slots, and both StudentTimetableService and
   * fn_timetable_scheduled_sections do derive it. But this check runs at CREATE
   * time and slots are built AFTERWARDS, in the `[id]` editor. At the only
   * moment the answer is needed there is nothing to read, so the scope has to be
   * declared on the row rather than inferred from data that does not exist yet.
   *
   * AN UNDECLARED SCOPE FAILS CLOSED. A NULL or empty `section_ids` on either
   * side is read as "covers the whole semester", which is exactly the old
   * behaviour: the pair conflicts on dates alone. Failing open would let two
   * genuinely overlapping timetables through and make one of them invisible —
   * the precise outcome this rule exists to prevent. The 2026-09-11 backfill
   * left zero non-template rows undeclared, so this path is a guard, not a
   * routine case.
   *
   * WHY THIS NO LONGER REQUIRES THE DATES TO OVERLAP
   * The previous rule only fired when the new range overlapped an existing one,
   * which left two holes wide open:
   *   1. Different dates, same section → allowed. A section could accumulate any
   *      number of timetables just by shifting the range.
   *   2. Either date missing → the function returned `{exists:false}` before it
   *      queried anything at all.
   * Hole 2 is not hypothetical. Measured on production 2026-08-12, the ONLY
   * duplicate scope in 178 active timetables is academic year 2026-2027,
   * "NEW CRRI ZENFORIANZ SECTION - A", holding both "CRRI 2026 - 2027 ZEN A"
   * (2026-03-09 → 2027-03-09) and a dateless "CRRI" that walked straight past
   * the early return. There were zero legitimate same-section-different-date
   * pairs, so keying on the scope alone costs nothing and closes both holes.
   *
   * REPLACING A SECTION'S TIMETABLE IS STILL POSSIBLE
   * This only considers `is_active = true`, so deactivating the old timetable
   * frees the section immediately. Timetables also auto-deactivate once their
   * end_date passes (20260623180000_timetable_auto_deactivate_on_end_date.sql),
   * so a next-year timetable never collides with a spent one.
   *
   * THIS FUNCTION *IS* THE CONSTRAINT. `timetables` carries no unique or
   * exclusion index — only the `id` primary key — and there is no API route for
   * timetable writes, so every save goes browser → PostgREST through here.
   * Anything that writes the table by another path is unguarded. (That is also
   * why the 23505 handlers in createTimetable/updateTimetable can never fire.)
   */
  static async checkExistingTimetable(data: {
    institution_id: string;
    academic_year_id: string;
    degree_id: string;
    program_id: string;
    department_id: string;
    semester_id: string; // UUID
    section_id?: string; // UUID
    /**
     * Declared section scope of the timetable being created or edited. Only
     * consulted for the semester-level rule; the section rule keys on
     * section_id alone and ignores this. Absent or empty means "whole
     * semester", which reproduces the pre-2026-09-11 behaviour.
     */
    section_ids?: string[];
    start_date?: string;
    end_date?: string;
    /** The timetable being edited — it must never conflict with itself. */
    exclude_timetable_id?: string;
  }): Promise<{
    exists: boolean;
    existingTimetable?: Timetable;
    message?: string;
    /**
     * Which rule fired. The two are not interchangeable and their remedies are
     * opposite — a section conflict is cleared by freeing the section, a
     * semester conflict by moving the dates — so callers must not title both
     * "Section Already Has a Timetable".
     */
    conflictScope?: 'section' | 'semester';
  }> {
    try {
      // The names are EMBEDDED, not selected with '*'. The old code read
      // `existing.semesters?.semester_name` off a `select('*')` result, where
      // that key can never exist — so every message said "Unknown Semester" and
      // silently dropped the section name, the one detail this rule is about.
      let query: any = this.supabase
        .from('timetables')
        .select(
          // section_ids is a plain uuid[], not a FK, so PostgREST cannot embed
          // names for it. Only the ids are fetched here; the overlapping ones
          // are resolved to names below, and only when a conflict actually
          // fires, so the common no-conflict path costs one query as before.
          'id, timetable_name, start_date, end_date, section_ids, semesters(semester_name), sections(section_name)'
        )
        .eq('academic_year_id', data.academic_year_id)
        .eq('is_active', true)
        // Templates share this table. One active template in production carries
        // both an academic year and a section, and with the key narrowed to
        // those two columns it would now refuse the section's real timetable —
        // pointing the operator at a row that is not a timetable at all.
        // `IS NOT TRUE`, not `= false`, so a NULL flag cannot slip one through.
        .not('is_template', 'is', true);

      if (data.section_id) {
        // The section IS the key. Nothing else is added — in particular not
        // semester_id, or a section could hold one timetable per semester of
        // the same year, and not the hierarchy, which the section row already
        // determines.
        query = query.eq('section_id', data.section_id);
      } else {
        // Semester-level timetable: no section to key on, so fall back to the
        // original scope comparison.
        query = query
          .is('section_id', null)
          .eq('institution_id', data.institution_id)
          .eq('degree_id', data.degree_id)
          .eq('program_id', data.program_id)
          .eq('department_id', data.department_id)
          .eq('semester_id', data.semester_id);
      }

      // Excluded in the QUERY, not filtered out of the result. The caller used
      // to compare only the FIRST match's id against its own, so a scope already
      // holding two rows could return the row being edited and wave the genuine
      // duplicate through.
      if (data.exclude_timetable_id) {
        query = query.neq('id', data.exclude_timetable_id);
      }

      const { data: existingTimetables, error } = (await query) as {
        data: Array<{
          id: string;
          start_date: string | null;
          end_date: string | null;
          timetable_name: string;
          section_ids: string[] | null;
          semesters?: { semester_name: string } | { semester_name: string }[];
          sections?: { section_name: string } | { section_name: string }[];
        }> | null;
        error: any;
      };

      if (error) throw error;

      if (!existingTimetables || existingTimetables.length === 0) {
        return { exists: false };
      }

      const isSectionScoped = Boolean(data.section_id);

      // Half-open on purpose: a missing bound is UNBOUNDED on that side, not
      // "no constraint to check". A dateless timetable therefore overlaps
      // everything, which is what keeps the old dateless bypass shut.
      const overlaps = (
        aStart?: string | null,
        aEnd?: string | null,
        bStart?: string | null,
        bEnd?: string | null
      ) => {
        if (aEnd && bStart && aEnd < bStart) return false;
        if (bEnd && aStart && bEnd < aStart) return false;
        return true;
      };

      // The scope of the row being saved. Empty means undeclared, which is read
      // as "the whole semester" — see AN UNDECLARED SCOPE FAILS CLOSED above.
      const incomingScope = new Set(
        (data.section_ids || []).filter(Boolean)
      );

      // Which sections the two rows have in common. An undeclared scope on
      // EITHER side covers everything, so it intersects by definition; there is
      // nothing to name in that case and the caller falls back to the date-only
      // message.
      const sharedSections = (t: { section_ids: string[] | null }): {
        intersects: boolean;
        shared: string[];
      } => {
        const theirs = (t.section_ids || []).filter(Boolean);
        if (incomingScope.size === 0 || theirs.length === 0) {
          return { intersects: true, shared: [] };
        }
        const shared = theirs.filter((id) => incomingScope.has(id));
        return { intersects: shared.length > 0, shared };
      };

      // A section conflict is unconditional — the section is taken and no date
      // range changes that. A semester-level conflict needs BOTH halves: the
      // date ranges must overlap AND the section scopes must intersect. The row
      // REPORTED must satisfy both, because pointing the operator at a spent
      // range, or at a timetable for a group they never touched, sends them to
      // the wrong row.
      let overlappingSections: string[] = [];
      const conflicting = isSectionScoped
        ? existingTimetables
        : existingTimetables.filter(
            (t) =>
              overlaps(data.start_date, data.end_date, t.start_date, t.end_date) &&
              sharedSections(t).intersects
          );

      if (conflicting.length === 0) {
        return { exists: false };
      }

      const existing = conflicting[0];
      if (!isSectionScoped) {
        overlappingSections = sharedSections(existing).shared;
      }

      // PostgREST returns a many-to-one embed as an object, but returns an array
      // when it cannot prove the relationship is to-one. Normalise both.
      const one = <T,>(v: T | T[] | undefined): T | undefined =>
        Array.isArray(v) ? v[0] : v;

      const semesterName =
        one(existing.semesters)?.semester_name || 'this semester';
      const sectionName = one(existing.sections)?.section_name || null;

      // Resolved only once a conflict has actually fired, and only for the ids
      // the two rows share. section_ids is a plain uuid[] with no FK, so there
      // is no embed to ride on and this has to be its own query.
      let overlappingSectionNames: string[] = [];
      if (overlappingSections.length > 0) {
        const { data: sharedRows, error: sharedError } = (await this.supabase
          .from('sections')
          .select('section_name')
          .in('id', overlappingSections)
          .order('section_name')) as {
          data: Array<{ section_name: string }> | null;
          error: any;
        };

        if (sharedError) {
          // A decoration must not erase what it decorates. The clash is real
          // whether or not the names resolve, so log and fall through to the
          // date-led wording rather than failing the check open.
          logger.warn(
            'academic/timetables',
            'Could not resolve the overlapping section names - the conflict message will name dates only',
            { error: sharedError }
          );
        } else {
          overlappingSectionNames = (sharedRows || []).map((s) => s.section_name);
        }
      }

      const formatDate = (dateStr: string | null) =>
        dateStr ? new Date(dateStr).toLocaleDateString() : 'no date set';

      const existingDates = `Existing: "${existing.timetable_name}" (${formatDate(
        existing.start_date
      )} to ${formatDate(existing.end_date)})`;

      // The semester-level conflict now has TWO possible remedies, and the
      // message must name the one that applies. When the shared sections are
      // known, THEY are the clash and unticking them clears it — telling the
      // operator to move the dates would make them shift a whole year's
      // timetable to dodge one section. Only when the scope is undeclared on
      // one side, so the pair collides on dates alone, does the old date-led
      // wording still apply.
      const sharedList =
        overlappingSectionNames.length > 0
          ? overlappingSectionNames.join(', ')
          : null;

      // The two rules get two messages. Telling a semester-level operator that
      // "a section may hold only one" names a field their form never showed and
      // a remedy that cannot work.
      const message = isSectionScoped
        ? // The SECTION leads, and the blocking row's semester follows in
          // parentheses — under the section rule that semester may not be the
          // one being created, and an operator who is not told which semester
          // already holds the slot has no way to find the row they must edit.
          `${
            sectionName
              ? `Section ${sectionName} (${semesterName})`
              : semesterName
          } already has an active timetable for this academic year.

${existingDates}

A section may hold only one active timetable per academic year. Edit that timetable, or deactivate it first if you are replacing it.`
        : sharedList
          ? `${sharedList} already ${
              overlappingSectionNames.length === 1 ? 'is' : 'are'
            } covered by another semester-level timetable over these dates.

${existingDates}

Two semester-level timetables may not cover the same section on the same dates — learners and attendance would only ever see one of them. Untick ${
              overlappingSectionNames.length === 1
                ? 'that section'
                : 'those sections'
            } here, give this timetable dates that do not overlap, or deactivate the existing one. Sections it does not cover are unaffected, so parallel groups in the same semester can each keep their own timetable.`
          : `${semesterName} already has an active semester-level timetable covering these dates.

${existingDates}

That timetable does not declare which sections it covers, so it is treated as covering the whole semester. Open it and choose its sections, give this one a date range that does not overlap, or deactivate it first. Section-level timetables are not affected.`;

      return {
        exists: true,
        existingTimetable: existing as any,
        conflictScope: isSectionScoped ? 'section' : 'semester',
        message
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error checking existing timetable', error);
      throw error;
    }
  }

  static async createTimetable(data: CreateTimetableDto): Promise<Timetable> {
    try {
      // One active timetable per section per academic year — see
      // checkExistingTimetable. Dates are passed for the message only; they no
      // longer decide whether this is a conflict.
      const existingCheck = await this.checkExistingTimetable({
        institution_id: data.institution_id,
        academic_year_id: data.academic_year_id,
        degree_id: data.degree_id,
        program_id: data.program_id,
        department_id: data.department_id,
        semester_id: data.semester_id!, // Use semester_id instead of semester text
        section_id: data.section_id || undefined, // Use section_id instead of section text
        // The declared scope. For a semester-level row this is half the key:
        // two such timetables clash only where their sections intersect.
        section_ids: data.section_ids,
        start_date: data.start_date,
        end_date: data.end_date
      });

      if (existingCheck.exists) {
        toast.error(
          `${
            existingCheck.conflictScope === 'semester'
              ? '⚠️ Dates Clash With an Existing Timetable'
              : '⚠️ Section Already Has a Timetable'
          }\n\n${existingCheck.message}`,
          {
            duration: 8000,
            position: 'top-center',
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FCA5A5',
              maxWidth: '500px',
              whiteSpace: 'pre-line'
            }
          }
        );
        throw new Error(
          existingCheck.message ||
            (existingCheck.conflictScope === 'semester'
              ? 'This semester already has an active semester-level timetable covering these dates.'
              : 'This section already has an active timetable for this academic year.')
        );
      }

      // Proceed with creating the new timetable
      // Create clean data object without any form-only fields
      const {
        institution_id,
        academic_year_id,
        degree_id,
        program_id,
        department_id,
        semester_id,
        section_id,
        section_ids,
        timetable_name,
        is_active,
        is_template,
        template_name,
        template_description,
        template_category,
        template_tags,
        created_from_template_id,
        start_date,
        end_date,
        selected_dates,
        timetable_format,
        timetable_data,
        periods,
        // Updated: 2026-06-10 - School day-wise attendance support
        attendance_mode,
        class_incharge_id
      } = data;

      // Determine timetable type based on section_id
      // Updated: 2025-10-08 - Added support for semester-level timetables
      const timetable_type = section_id ? 'section' : 'semester';

      const timetableData = {
        institution_id,
        academic_year_id,
        degree_id,
        program_id,
        department_id,
        semester_id,
        section_id: section_id || null, // Explicitly null for semester-level
        // The declared section scope. A section-level row derives it from its
        // own section so the column is never a second, drifting source of
        // truth; a semester-level row takes what the form chose. An empty
        // array is normalised to NULL, which reads as "whole semester" and so
        // fails CLOSED in checkExistingTimetable.
        section_ids: section_id
          ? [section_id]
          : section_ids && section_ids.length > 0
            ? section_ids
            : null,
        timetable_name,
        timetable_type, // New field
        is_active: is_active ?? true,
        is_template: is_template ?? false,
        template_name: template_name || null,
        template_description: template_description || null,
        template_category: template_category || null,
        template_tags: template_tags || null,
        created_from_template_id: created_from_template_id || null,
        start_date: start_date || null,
        end_date: end_date || null,
        selected_dates: selected_dates || null,
        timetable_format: timetable_format || 'regular',
        timetable_data: timetable_data || {}, // Provide empty object as default
        periods: periods || [], // Provide empty array as default for periods
        // Updated: 2026-06-10 - Attendance behaviour, authoritative on the row.
        // Defaulted server-side so existing callers stay period_wise.
        attendance_mode: attendance_mode || 'period_wise',
        // class_incharge is required on every timetable, independent of mode.
        class_incharge_id: class_incharge_id || null
      };

      const insertData: any = {
        ...timetableData,
        created_by: (await this.supabase.auth.getUser()).data.user?.id
      };

      const { data: timetable, error } = (await (this.supabase as any)
        .from('timetables')
        .insert([insertData])
        .select('*')
        .single()) as { data: Timetable | null; error: any };

      if (error) {
        logger.error('academic/timetables', 'Error creating timetable', error);
        if (error.code === '23505') {
          toast.error(
            '⚠️ This timetable configuration already exists. Please check your semester and section selection.',
            {
              duration: 5000,
              position: 'top-center'
            }
          );
        } else {
          toast.error('Failed to create timetable. Please try again.', {
            duration: 4000,
            position: 'top-center'
          });
        }
        throw new Error('Failed to create timetable.');
      }

      trackUsage({ module: 'academic/timetables', feature: 'create_timetable', eventType: 'create' });
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const isTemplate = timetable.is_template;
          const name = timetable.timetable_name || timetable.template_name || timetable.id;
          const template = isTemplate
            ? AcademicActivityTemplates.timetableTemplateCreated(name)
            : AcademicActivityTemplates.timetableCreated(name);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: timetable.id,
            resourceName: name,
            description: template.description,
            metadata: {
              sub_type: template.sub_type,
              is_template: timetable.is_template,
              section_id: timetable.section_id,
              semester_id: timetable.semester_id,
              academic_year_id: timetable.academic_year_id,
            },
            institutionId: timetable.institution_id,
          });
        } catch { /* never block */ }
      })();
      return timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error in createTimetable service', error);
      throw error;
    }
  }

  // Updated: 2025-12-11 - Added isSuperAdmin parameter to allow super admins to bypass attendance lock
  static async updateTimetable(
    id: string,
    data: UpdateTimetableDto,
    isSuperAdmin: boolean = false
  ): Promise<Timetable> {
    try {
      // Define fields that are safe to update even when attendance exists
      // Updated: 2025-11-17 - Added periods to safe fields (changing period list doesn't affect existing attendance)
      // Updated: 2025-12-11 - Added start_date, end_date to safe fields (metadata changes don't affect existing attendance)
      const safeFields = [
        'selected_days',
        'selected_dates',
        'timetable_format',
        'timetable_name',
        'start_date',
        'end_date',
        'periods',
        'num_cycles',
        'is_active',
        'is_template',
        'template_name',
        'template_description',
        'template_category',
        'template_tags',
        // Updated: 2026-06-10 - Reassigning the class incharge does not affect
        // already-recorded attendance, so it is safe to edit anytime.
        // NOTE: attendance_mode is deliberately NOT safe — switching modes after
        // attendance exists would orphan period-keyed data, so it stays locked.
        'class_incharge_id'
      ];

      // Updated: 2026-09-11 - `section_ids` is deliberately NOT in safeFields,
      // matching how section_id behaves: dropping a section that already has
      // marked attendance orphans those rows.
      //
      // WIDENING IS NOT THE SAME AS CHANGING. A ninth section joining an
      // existing group mid-year is routine, and adding one takes nothing away
      // from anybody — no attendance row can belong to a section that was not
      // in the old scope. So a new set that is a strict SUPERSET of the stored
      // one is treated as safe, and only a narrowing stays locked. An
      // undeclared old scope means "whole semester", so declaring one for the
      // first time is a narrowing, not a widening, and is correctly refused.
      let sectionScopeIsWideningOnly = false;
      if (data.section_ids !== undefined) {
        const { data: scopeRow, error: scopeError } = (await this.supabase
          .from('timetables')
          .select('section_ids')
          .eq('id', id)
          .single()) as { data: { section_ids: string[] | null } | null; error: any };

        if (scopeError) throw scopeError;

        const before = (scopeRow?.section_ids || []).filter(Boolean);
        const after = new Set((data.section_ids || []).filter(Boolean));
        sectionScopeIsWideningOnly =
          before.length > 0 && before.every((s) => after.has(s));
      }

      // Check if any unsafe fields are being modified
      const updateKeys = Object.keys(data);
      const hasUnsafeChanges = updateKeys.some(
        (key) =>
          !safeFields.includes(key) &&
          !(key === 'section_ids' && sectionScopeIsWideningOnly)
      );

      // First check if this timetable has any attendance records
      const { data: attendanceRecords, error: attendanceCheckError } = (await this.supabase
        .from('student_attendance')
        .select('id')
        .eq('timetable_id', id)
        .limit(1)) as {
        data: Array<{ id: string }> | null;
        error: any;
      };

      if (attendanceCheckError) {
        logger.error('academic/timetables', 'Error checking attendance records', attendanceCheckError);
        throw attendanceCheckError;
      }

      // If attendance records exist, only block unsafe modifications (unless super admin)
      // Super admins can bypass this restriction to make emergency changes
      if (attendanceRecords && attendanceRecords.length > 0 && hasUnsafeChanges && !isSuperAdmin) {
        const errorMessage =
          'Cannot modify this timetable structure because attendance has been marked. Once attendance is recorded, the timetable structure becomes locked to preserve data integrity. You can still update days, dates, and other configuration settings.';

        toast.error(errorMessage, {
          duration: 6000,
          position: 'top-center',
          style: {
            background: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FCA5A5',
            maxWidth: '500px'
          }
        });

        throw new Error(errorMessage);
      }

      // Get current timetable info for conflict checking
      const { data: currentTimetable, error: fetchError } = (await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', id)
        .single()) as {
        data: any | null;
        error: any;
      };

      if (fetchError) throw fetchError;
      if (!currentTimetable) throw new Error('Timetable not found');

      // Build the updated timetable data by merging current with updates
      const updatedTimetableData = {
        institution_id: data.institution_id || currentTimetable.institution_id,
        academic_year_id:
          data.academic_year_id || currentTimetable.academic_year_id,
        degree_id: data.degree_id || currentTimetable.degree_id,
        program_id: data.program_id || currentTimetable.program_id,
        department_id: data.department_id || currentTimetable.department_id,
        semester_id: data.semester_id || currentTimetable.semester_id,
        section_id:
          data.section_id !== undefined
            ? data.section_id
            : currentTimetable.section_id || undefined,
        // `||` would coerce a deliberate [] to the stored value; the edit must
        // be able to say "this covers nothing declared" and have the guard read
        // it as the whole semester, not silently keep the old scope.
        section_ids:
          data.section_ids !== undefined
            ? data.section_ids
            : currentTimetable.section_ids || undefined,
        start_date: data.start_date || currentTimetable.start_date,
        end_date: data.end_date || currentTimetable.end_date
      };

      // Always checked, dates or not. The scope is the rule now, so an edit that
      // moves this timetable onto a section that already has one must be caught
      // even when neither date is set.
      try {
        const existingCheck = await this.checkExistingTimetable({
          ...updatedTimetableData,
          // Self-exclusion happens inside the query — see checkExistingTimetable.
          exclude_timetable_id: id
        });

        if (existingCheck.exists) {
          toast.error(
            `${
              existingCheck.conflictScope === 'semester'
                ? '⚠️ Dates Clash With an Existing Timetable'
                : '⚠️ Section Already Has a Timetable'
            }\n\n${existingCheck.message}`,
            {
              duration: 8000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                maxWidth: '500px',
                whiteSpace: 'pre-line'
              }
            }
          );
          throw new Error(
            existingCheck.message ||
              (existingCheck.conflictScope === 'semester'
                ? 'This semester already has an active semester-level timetable covering these dates.'
                : 'This section already has an active timetable for this academic year.')
          );
        }
      } catch (conflictError) {
        logger.error('academic/timetables', 'Error during conflict checking', conflictError);
        throw conflictError;
      }

      // Filter out undefined values and constraint-related fields
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Only include fields that are explicitly provided and not part of the unique constraint
      // Updated: 2025-10-08 - Added timetable_type to allowed fields
      // Updated: 2025-11-17 - Added periods to allowed fields to fix period configuration save issue
      // Updated: 2026-03-22 - Added num_cycles for cycle-format timetable support
      const allowedFields = [
        'timetable_format',
        'timetable_type',
        'start_date',
        'end_date',
        'selected_dates',
        'timetable_name',
        'selected_days',
        'periods',
        'num_cycles',
        'institution_id',
        'academic_year_id',
        'degree_id',
        'program_id',
        'department_id',
        'semester_id',
        'section_id',
        // Updated: 2026-09-11 - Declared section scope. Gated above: widening is
        // free, narrowing locks once attendance exists.
        'section_ids',
        'is_active',
        'is_template',
        'template_name',
        'template_description',
        'template_category',
        'template_tags',
        // Updated: 2026-06-10 - School day-wise attendance support.
        // attendance_mode is gated as an unsafe change above (locks after the
        // first attendance record); class_incharge_id is freely editable.
        'attendance_mode',
        'class_incharge_id'
      ];

      for (const field of allowedFields) {
        if (data[field as keyof UpdateTimetableDto] !== undefined) {
          updateData[field] = data[field as keyof UpdateTimetableDto];
        }
      }

      const { data: timetable, error } = (await (this.supabase as any)
        .from('timetables')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()) as { data: Timetable | null; error: any };

      if (error) {
        if (error.code === '23505') {
          toast.error(
            '⚠️ Cannot update: This configuration would create a duplicate timetable.\n\nTimetables with overlapping date periods are not allowed for the same semester and section.',
            {
              duration: 5000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B'
              }
            }
          );
        } else {
          toast.error(
            'Failed to update timetable configuration. Please try again.',
            {
              duration: 4000,
              position: 'top-center'
            }
          );
        }
        throw error;
      }

      trackUsage({ module: 'academic/timetables', feature: 'update_timetable', eventType: 'update' });
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const name = timetable.timetable_name || id;
          const template = AcademicActivityTemplates.timetableUpdated(name, Object.keys(data));
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: name,
            description: template.description,
            metadata: { sub_type: template.sub_type, changed_fields: Object.keys(data) },
            institutionId: timetable.institution_id,
          });
        } catch { /* never block */ }
      })();
      toast.success('Timetable configuration saved successfully!', {
        duration: 3000,
        position: 'top-center',
        style: {
          background: '#F0FDF4',
          color: '#166534'
        }
      });
      return timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error updating timetable', error);
      throw error;
    }
  }

  static async deleteTimetable(id: string, showToast = true): Promise<void> {
    try {
      // Pre-fetch timetable name for activity logging before any guard checks
      let timetableNameForLog = id;
      let timetableInstitutionId: string | undefined;
      try {
        const { data: tt } = await TimetableService.supabase
          .from('timetables')
          .select('timetable_name, institution_id')
          .eq('id', id)
          .single();
        timetableNameForLog = tt?.timetable_name || id;
        timetableInstitutionId = tt?.institution_id;
      } catch { /* ignore */ }

      // First check if this timetable has any attendance records
      const { data: attendanceRecords, error: attendanceCheckError } = (await this.supabase
        .from('student_attendance')
        .select('id')
        .eq('timetable_id', id)
        .limit(1)) as {
        data: Array<{ id: string }> | null;
        error: any;
      };

      if (attendanceCheckError) {
        logger.error('academic/timetables', 'Error checking attendance records', attendanceCheckError);
        throw attendanceCheckError;
      }

      // If attendance records exist, prevent deletion
      if (attendanceRecords && attendanceRecords.length > 0) {
        const errorMessage =
          'Cannot delete this timetable because it has associated attendance records. The timetable is being used to track student attendance and must be preserved for record-keeping purposes. You can still edit the timetable if needed.';

        if (showToast) {
          toast.error(errorMessage, {
            duration: 6000,
            position: 'top-center',
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FCA5A5',
              maxWidth: '500px'
            }
          });
        }

        throw new Error(errorMessage);
      }

      // If no attendance records, proceed with deletion
      // With the new JSON-based structure, we only need to delete the timetable record
      // All slots and periods are stored in the timetable_data JSONB column
      const { data: deletedRows, error } = await this.supabase
        .from('timetables')
        .delete()
        .eq('id', id)
        .select('id');

      if (error) throw error;
      // PostgREST returns no error but 0 rows when RLS silently blocks the DELETE.
      // Without this check, a permission-denied delete looks like a success.
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error('You do not have permission to delete this timetable. Please contact your administrator.');
      }

      trackUsage({ module: 'academic/timetables', feature: 'delete_timetable', eventType: 'delete' });
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.timetableDeleted(timetableNameForLog);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: timetableNameForLog,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: timetableInstitutionId,
          });
        } catch { /* never block */ }
      })();
      if (showToast) {
        toast.success('Timetable deleted successfully');
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting timetable', error);
      throw error;
    }
  }

  static async bulkDeleteTimetables(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];
    const hasAttendanceRecords: string[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteTimetable(id, false); // Pass false to suppress individual toasts
        success.push(id);
      } catch (error) {
        logger.error('academic/timetables', `Error deleting timetable ${id}`, error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Check if it's an attendance-related error
        if (errorMessage.includes('attendance records')) {
          hasAttendanceRecords.push(id);
        }

        failed.push({
          id,
          error: errorMessage
        });
      }
    }

    if (hasAttendanceRecords.length > 0) {
      toast.error(
        `Cannot delete ${hasAttendanceRecords.length} timetable(s) because they have associated attendance records. These timetables are being used to track student attendance and must be preserved. You can still edit them if needed.`,
        {
          duration: 6000,
          position: 'top-center',
          style: {
            background: '#FEF2F2',
            color: '#991B1B',
            border: '1px solid #FCA5A5',
            maxWidth: '500px'
          }
        }
      );
    } else if (failed.length > 0) {
      toast.error(
        `Failed to delete ${failed.length} timetable(s). See console for details.`
      );
    }

    return { success, failed };
  }

  // Helper method to get available semesters that have timetables
  static async getAvailableSemesters(institutionId?: string): Promise<
    Array<{
      id: string;
      semester_name: string;
      institution_id: string;
      degree_id: string;
      department_id: string;
      program_id: string;
    }>
  > {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          semester_id,
          semesters:semester_id(id, semester_name, institution_id, degree_id, department_id, program_id)
        `
        )
        .eq('is_active', true)
        .not('semester_id', 'is', null)
        .then((result) => {
          if (result.error) return result;

          // Extract unique semesters
          const uniqueSemesters = new Map();
          result.data?.forEach((item: any) => {
            if (item.semesters) {
              uniqueSemesters.set(item.semesters.id, item.semesters);
            }
          });

          return {
            data: Array.from(uniqueSemesters.values()),
            error: result.error
          };
        });

      if (error) {
        logger.error('academic/timetables', 'Error fetching available semesters', error);
        return [];
      }

      let filteredData = data || [];

      if (institutionId) {
        filteredData = filteredData.filter(
          (sem) => sem.institution_id === institutionId
        );
      }

      return filteredData;
    } catch (error) {
      logger.error('academic/timetables', 'Error in getAvailableSemesters', error);
      return [];
    }
  }

  // Helper method to get available sections that have timetables
  static async getAvailableSections(
    institutionId?: string,
    semesterId?: string
  ): Promise<
    Array<{
      id: string;
      section_name: string;
      institution_id: string;
      semester_id: string;
    }>
  > {
    try {
      let query = this.supabase
        .from('timetables')
        .select(
          `
          section_id,
          sections:section_id(id, section_name, institution_id, semester_id)
        `
        )
        .eq('is_active', true)
        .not('section_id', 'is', null);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      const { data, error } = await query.then((result) => {
        if (result.error) return result;

        // Extract unique sections
        const uniqueSections = new Map();
        result.data?.forEach((item: any) => {
          if (item.sections) {
            uniqueSections.set(item.sections.id, item.sections);
          }
        });

        return {
          data: Array.from(uniqueSections.values()),
          error: result.error
        };
      });

      if (error) {
        logger.error('academic/timetables', 'Error fetching available sections', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('academic/timetables', 'Error in getAvailableSections', error);
      return [];
    }
  }

  static async getTimetables(
    filters: TimetableFilters = {}
  ): Promise<TimetableListResponse> {
    try {
      // Check authentication status first
      const {
        data: { user },
        error: authError
      } = await this.supabase.auth.getUser();

      if (authError) {
        logger.error('academic/timetables', 'Authentication error', authError);
        throw new Error(`Authentication error: ${authError.message}`);
      }

      if (!user) {
        logger.error('academic/timetables', 'No authenticated user found');
        throw new Error('User not authenticated');
      }

      let query = (this.supabase as any).from('timetables').select(
        `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      // Broadened 2026-04-18 — previously search only matched timetable_name,
      // so users searching for mode keywords like "theory" found nothing.
      // Now also searches template_name and template_description.
      if (filters.search) {
        const term = filters.search.replace(/'/g, "''").replace(/[%_]/g, '');
        query = query.or(
          `timetable_name.ilike.%${term}%,template_name.ilike.%${term}%,template_description.ilike.%${term}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.semester) {
        // Frontend sends semester.id (UUID), so filter by semester_id
        query = query.eq('semester_id', filters.semester);
      }

      // FIXED: 2025-11-24 - Section filter was not working because PostgREST cannot filter on joined table fields directly
      // We need to look up the section IDs first, then filter by section_id
      if (filters.section) {
        try {
          // Frontend sends section.section_name (string "A", "B", etc.)
          // We need to convert this to section IDs first
          const sectionsResponse = (await this.supabase
            .from('sections')
            .select('id')
            .eq('section_name', filters.section)) as {
            data: Array<{ id: string }> | null;
            error: any;
          };

          if (sectionsResponse.data && sectionsResponse.data.length > 0) {
            const sectionIds = sectionsResponse.data.map((s) => s.id);
            query = query.in('section_id', sectionIds);
          } else {
            // If no sections found with this name, return empty result
            // by filtering with an impossible condition
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        } catch (sectionError) {
          logger.error('academic/timetables', 'Error fetching section IDs for filter', sectionError);
          // On error, don't apply the filter to avoid breaking the query
        }
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.is_template !== undefined) {
        query = query.eq('is_template', filters.is_template);
      }

      if (filters.timetable_type !== undefined) {
        query = query.eq('timetable_type', filters.timetable_type);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Default order by timetable_name
      query = query.order('timetable_name', { ascending: true });

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/timetables', 'Database query error', { error, message: error.message, details: error.details, hint: error.hint, code: error.code });

        throw new Error(
          `Database error: ${error.message}${
            error.hint ? ` (Hint: ${error.hint})` : ''
          }`
        );
      }

      const result = {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };

      return result;
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching timetables', error);
      throw error;
    }
  }

  static async getTimetable(id: string): Promise<Timetable> {
    // Defense-in-depth DRP guard — Next.js 16 Cache Components emits opaque
    // `%%drp:id:xxxxx%%` placeholders before route params hydrate. Hitting
    // Postgres with one yields `invalid input syntax for type uuid`. Throw
    // a specific marker error so hook callers can treat it as a loading
    // state instead of a user-facing "Invalid timetable ID" toast.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!id || !UUID_RE.test(id)) {
      const isDrp = typeof id === 'string' && id.includes('%%drp:');
      const err = new Error(
        isDrp
          ? 'Timetable id not yet resolved (DRP placeholder)'
          : 'Invalid timetable id format'
      );
      (err as any).code = isDrp ? 'DRP_PLACEHOLDER' : 'INVALID_TIMETABLE_ID';
      throw err;
    }

    try {
      const { data: timetable, error } = (await this.supabase
        .from('timetables')
        .select(
          `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .eq('id', id)
        .single()) as { data: any | null; error: any };

      if (error) throw error;
      if (!timetable) throw new Error('Timetable not found');

      // Updated: 2025-10-08 - For semester-level timetables, fetch all available sections
      // Updated: 2026-08-17 - This used to embed `student_count:students(count)`.
      // There is no `students` table in this database — learners live in
      // `learners_profiles` (FK fk_learners_profiles_section) — so PostgREST
      // could not resolve the embed and failed the ENTIRE sections query. The
      // error was then dropped by `if (!sectionsError && ...)` with no log,
      // leaving available_sections undefined, and the header's
      // `available_sections?.length || 0` reported a confident "0 section(s)"
      // for I B.SC CHEMISTRY — which has a section holding 19 active learners.
      //
      // The headcount is now a SEPARATE query. A decoration must not be able to
      // erase what it decorates: a section whose count failed to load is still a
      // section, and a wrong zero reads as a real answer nobody investigates.
      if (timetable && timetable.timetable_type === 'semester' && timetable.semester_id) {
        const { data: semesterSections, error: sectionsError } = (await this.supabase
          .from('sections')
          .select('id, section_name')
          .eq('semester_id', timetable.semester_id)
          .eq('is_active', true)
          .order('section_name')) as {
          data: any[] | null;
          error: any;
        };

        if (sectionsError) {
          logger.warn(
            'academic/timetables',
            'Could not load available sections for this semester - the header will show 0',
            {
              timetableId: timetable.id,
              semesterId: timetable.semester_id,
              error: sectionsError
            }
          );
        } else if (semesterSections) {
          const sectionIds = semesterSections.map((s: any) => s.id);
          const counts = new Map<string, number>();

          if (sectionIds.length > 0) {
            const { data: learnerRows, error: countError } = (await this.supabase
              .from('learners_profiles')
              .select('section_id')
              .in('section_id', sectionIds)
              // Graduated and exited learners keep their section_id, so an
              // unfiltered count overstates a live class by the whole history
              // of everyone who ever sat in it.
              .eq('lifecycle_status', 'active')) as {
              data: any[] | null;
              error: any;
            };

            if (countError) {
              logger.warn(
                'academic/timetables',
                'Section headcounts unavailable - listing sections without them',
                { timetableId: timetable.id, error: countError }
              );
            } else {
              for (const row of learnerRows || []) {
                if (!row?.section_id) continue;
                counts.set(row.section_id, (counts.get(row.section_id) || 0) + 1);
              }
            }
          }

          // Updated: 2026-09-11 - Still the WHOLE semester, because the edit
          // form needs the full list to offer a widening choice. Each entry now
          // says whether it is inside the timetable's declared scope, so the
          // header can report "8 of 24" instead of a flat 24 that overstates
          // what this timetable actually covers. An undeclared scope means the
          // whole semester, which is the pre-2026-09-11 reading.
          const declaredScope = (timetable.section_ids || []) as string[];
          const scopeIsDeclared = declaredScope.length > 0;

          timetable.available_sections = semesterSections.map((s: any) => ({
            ...s,
            student_count: counts.get(s.id) || 0,
            in_scope: scopeIsDeclared ? declaredScope.includes(s.id) : true
          }));
        }
      }

      // Enrich timetable data with course and staff details
      if (timetable && timetable.timetable_data) {
        const enrichedTimetable = await this.enrichTimetableWithDetails(
          timetable
        );
        return enrichedTimetable;
      }

      return timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching timetable', error);
      throw error;
    }
  }

  // Helper method to enrich timetable data with course and staff details
  private static async enrichTimetableWithDetails(
    timetable: any
  ): Promise<Timetable> {
    try {
      const timetableData = timetable.timetable_data as TimetableData | null;
      if (!timetableData || typeof timetableData !== 'object') {
        return timetable;
      }

      // Extract all unique course IDs and staff IDs from the timetable data
      // Updated: 2025-10-13 - Also extract from sub_slots for subdivided/combined classes
      const courseIds = new Set<string>();
      const staffIds = new Set<string>();

      Object.values(timetableData).forEach((daySlots) => {
        if (daySlots && typeof daySlots === 'object') {
          Object.values(daySlots).forEach((slot) => {
            if (slot && typeof slot === 'object') {
              // Extract from main slot
              if (slot.course_id) {
                courseIds.add(slot.course_id);
              }
              if (slot.staff_ids && Array.isArray(slot.staff_ids)) {
                slot.staff_ids.forEach((staffId: string) =>
                  staffIds.add(staffId)
                );
              }
              if (slot.primary_staff_id) {
                staffIds.add(slot.primary_staff_id);
              }

              // CRITICAL FIX: Also extract from sub_slots (for subdivided and combined classes)
              if (slot.sub_slots && Array.isArray(slot.sub_slots)) {
                slot.sub_slots.forEach((subSlot: any) => {
                  if (subSlot.course_id) {
                    courseIds.add(subSlot.course_id);
                  }
                  if (subSlot.staff_ids && Array.isArray(subSlot.staff_ids)) {
                    subSlot.staff_ids.forEach((staffId: string) =>
                      staffIds.add(staffId)
                    );
                  }
                });
              }
            }
          });
        }
      });

      // Fetch course details with institution filter for RLS
      const coursesMap = new Map();
      if (courseIds.size > 0) {
        const courseIdsArray = Array.from(courseIds);

        const { data: courses, error: coursesError } = (await this.supabase
          .from('courses')
          .select('id, course_name, course_code, institution_id, is_active')
          .in('id', courseIdsArray)
          .eq('institution_id', timetable.institution_id)) as {
          data: Array<{ id: string; course_name: string; course_code: string; institution_id: string; is_active: boolean }> | null;
          error: any;
        };

        if (coursesError) {
          logger.error('academic/timetables', 'Error fetching courses', { error: coursesError, courseIdsArray });
        } else if (courses) {
          courses.forEach((course) => coursesMap.set(course.id, course));
        }
      }

      // Fetch staff details with institution filter for RLS
      const staffMap = new Map();
      if (staffIds.size > 0) {
        const staffIdsArray = Array.from(staffIds);

        // RLS policy has been updated to allow students to view staff

        const { data: staff, error: staffError } = (await this.supabase
          .from('staff')
          .select(
            'id, first_name, last_name, email, phone, staff_id, institution_id'
          )
          .in('id', staffIdsArray)
          .eq('institution_id', timetable.institution_id)) as {
          data: Array<{ id: string; first_name: string; last_name: string; email: string; phone: string; staff_id: string; institution_id: string }> | null;
          error: any;
        };

        if (staffError) {
          logger.error('academic/timetables', 'Error fetching staff', { error: staffError, staffIdsArray, institutionId: timetable.institution_id });
        } else if (staff) {
          staff.forEach((staffMember) =>
            staffMap.set(staffMember.id, staffMember)
          );
        } else {
          logger.warn('academic/timetables', 'No staff data returned for IDs', { staffIdsArray });
        }
      }

      // Enrich the timetable data with actual course and staff objects
      const enrichedTimetableData = { ...timetableData };

      Object.keys(enrichedTimetableData).forEach((day) => {
        const daySlots = enrichedTimetableData[day];
        if (daySlots && typeof daySlots === 'object') {
          Object.keys(daySlots).forEach((periodId) => {
            const slot = daySlots[periodId];
            if (slot && typeof slot === 'object' && !slot.is_break_slot) {
              // Add course details
              if (slot.course_id && coursesMap.has(slot.course_id)) {
                slot.course = coursesMap.get(slot.course_id);
              }

              // Add staff details
              if (slot.staff_ids && Array.isArray(slot.staff_ids)) {
                slot.staff_members = slot.staff_ids
                  .map((staffId: string) => staffMap.get(staffId))
                  .filter(Boolean);
              }

              // Add primary staff details for backward compatibility
              if (
                slot.primary_staff_id &&
                staffMap.has(slot.primary_staff_id)
              ) {
                slot.staff = staffMap.get(slot.primary_staff_id);
              }

              // Updated: 2025-11-07 - Enrich practical_config with course details
              if (slot.period_mode === 'practical' && slot.practical_config) {
                const practicalConfig = slot.practical_config;

                // Enrich available_courses with full course objects
                if (practicalConfig.available_courses && Array.isArray(practicalConfig.available_courses)) {
                  practicalConfig.available_courses = practicalConfig.available_courses.map((courseOption: any) => {
                    const courseId = courseOption.course_id || courseOption;
                    if (typeof courseId === 'string' && coursesMap.has(courseId)) {
                      const courseDetails = coursesMap.get(courseId);
                      return {
                        course_id: courseId,
                        course_name: courseDetails.course_name,
                        course_code: courseDetails.course_code
                      };
                    }
                    return courseOption;
                  }).filter(Boolean);
                }

                // Enrich batches with course details for assigned_courses
                if (practicalConfig.batches && Array.isArray(practicalConfig.batches)) {
                  practicalConfig.batches = practicalConfig.batches.map((batch: any) => {
                    // Keep all batch properties
                    const enrichedBatch = { ...batch };

                    // Enrich assigned_courses if present
                    if (batch.assigned_courses && Array.isArray(batch.assigned_courses)) {
                      // Store both IDs (for functionality) and enriched details (for display)
                      enrichedBatch.assigned_courses = batch.assigned_courses;
                      enrichedBatch.enriched_courses = batch.assigned_courses
                        .map((courseId: string) => {
                          if (coursesMap.has(courseId)) {
                            return coursesMap.get(courseId);
                          }
                          return null;
                        })
                        .filter(Boolean);
                    }

                    return enrichedBatch;
                  });
                }
              }

              // Updated: 2025-10-13 - CRITICAL: Also enrich sub_slots with course and staff objects
              if (slot.sub_slots && Array.isArray(slot.sub_slots) && slot.sub_slots.length > 0) {
                // CRITICAL FIX: Auto-detect if this is a subdivided slot
                // Check if sub_slots have student_ids or group_name (indicators of subdivision)
                const hasSubdivisionData = slot.sub_slots.some((s: any) =>
                  s.student_ids?.length > 0 || s.group_name
                );

                if (hasSubdivisionData && !slot.is_subdivided) {
                  slot.is_subdivided = true;
                  // Set subdivision type if not present
                  if (!slot.subdivision_type) {
                    slot.subdivision_type = 'practical'; // Default
                  }
                  // Set subdivision mode if not present
                  if (!slot.subdivision_mode) {
                    slot.subdivision_mode = 'manual'; // Default
                  }
                }

                slot.sub_slots = slot.sub_slots.map((subSlot: any, index: number) => {
                  // Enrich course
                  if (subSlot.course_id && coursesMap.has(subSlot.course_id)) {
                    subSlot.course = coursesMap.get(subSlot.course_id);
                  }

                  // Enrich staff
                  if (subSlot.staff_ids && Array.isArray(subSlot.staff_ids)) {
                    subSlot.staff_members = subSlot.staff_ids
                      .map((staffId: string) => staffMap.get(staffId))
                      .filter(Boolean);
                  }

                  return subSlot;
                });
              }

              // Set period_id and day_of_week for easier access
              slot.period_id = periodId;
              slot.day_of_week = day;
            }
          });
        }
      });

      // CRITICAL FIX: 2025-11-19 - Handle batch mode timetables with individual date keys
      // Group individual dates under their range markers for grid compatibility
      if (timetable.selected_dates && Array.isArray(timetable.selected_dates) && timetable.selected_dates.length > 0) {
        // Check if timetable_data has individual date keys (legacy format)
        const hasIndividualDates = Object.keys(enrichedTimetableData).some(
          key => !key.startsWith('RANGE:') && /^\d{4}-\d{2}-\d{2}$/.test(key)
        );

        if (hasIndividualDates) {
          const regroupedData: any = {};

          // For each range marker in selected_dates
          timetable.selected_dates.forEach((rangeMarker: string) => {
            if (rangeMarker.startsWith('RANGE:')) {
              const parts = rangeMarker.split(':');
              if (parts.length === 3) {
                const startDate = parts[1];
                const endDate = parts[2];

                // Generate all dates in this range
                const rangeDates: string[] = [];
                const current = new Date(startDate);
                const end = new Date(endDate);

                while (current <= end) {
                  rangeDates.push(current.toISOString().split('T')[0]);
                  current.setDate(current.getDate() + 1);
                }

                // Merge slots from all dates in this range
                // Updated: 2025-12-01 - Fixed to prefer slots with most complete data (most staff)
                const mergedSlots: any = {};
                rangeDates.forEach(date => {
                  if (enrichedTimetableData[date]) {
                    Object.keys(enrichedTimetableData[date]).forEach(periodId => {
                      const currentSlot = enrichedTimetableData[date][periodId];
                      const existingSlot = mergedSlots[periodId];

                      if (!existingSlot) {
                        // No existing slot, use this one
                        mergedSlots[periodId] = currentSlot;
                      } else {
                        // Compare and use the more complete slot (with more staff)
                        const existingStaffCount = existingSlot.staff_ids?.length || 0;
                        const currentStaffCount = currentSlot.staff_ids?.length || 0;

                        if (currentStaffCount > existingStaffCount) {
                          // Current slot has more staff - prefer it
                          mergedSlots[periodId] = currentSlot;
                        }
                        // Also check updated_at if staff counts are equal - prefer newer
                        else if (currentStaffCount === existingStaffCount &&
                                 currentSlot.updated_at && existingSlot.updated_at &&
                                 new Date(currentSlot.updated_at) > new Date(existingSlot.updated_at)) {
                          mergedSlots[periodId] = currentSlot;
                        }
                      }
                    });
                  }
                });

                // Store under range marker
                if (Object.keys(mergedSlots).length > 0) {
                  regroupedData[rangeMarker] = mergedSlots;
                }
              }
            } else {
              // Handle single dates (no range marker)
              if (enrichedTimetableData[rangeMarker]) {
                regroupedData[rangeMarker] = enrichedTimetableData[rangeMarker];
              }
            }
          });

          // Replace enrichedTimetableData with regrouped data
          Object.keys(enrichedTimetableData).forEach(key => {
            delete enrichedTimetableData[key];
          });
          Object.assign(enrichedTimetableData, regroupedData);
        }
      }

      // Create slots array for compatibility with existing code
      // Updated: 2025-11-17 - Fixed for batch mode timetables
      const slots: any[] = [];
      Object.keys(enrichedTimetableData).forEach((dayOrRange) => {
        const daySlots = enrichedTimetableData[dayOrRange];
        if (daySlots && typeof daySlots === 'object') {
          Object.keys(daySlots).forEach((periodId) => {
            const slot = daySlots[periodId];
            if (slot) {
              // For batch mode: dayOrRange is a date range like "RANGE:2025-11-01:2025-11-05"
              // For regular mode: dayOrRange is a day of week like "MONDAY"
              const isBatchMode = dayOrRange.startsWith('RANGE:');

              slots.push({
                ...slot,
                // For batch mode, set slot_date; for regular mode, set day_of_week
                ...(isBatchMode
                  ? { slot_date: dayOrRange }
                  : { day_of_week: dayOrRange }
                ),
                period_id: periodId
              });
            }
          });
        }
      });

      return {
        ...timetable,
        timetable_data: enrichedTimetableData,
        slots: slots
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error enriching timetable with details', error);
      return timetable;
    }
  }

  static async getTimetableSlots(
    timetableId: string,
    day?: DayOfWeek,
    date?: string
  ): Promise<any[]> {
    try {
      if (day || date) {
        const { data, error } = await (this.supabase as any).rpc(
          'get_timetable_slots_for_day_or_date',
          {
            p_timetable_id: timetableId,
            p_day_of_week: day || null,
            p_slot_date: date || null
          }
        );

        if (error) {
          logger.error('academic/timetables', 'Error in getTimetableSlots', error);
          throw error;
        }

        return data.map((item: any) => item.slot);
      } else {
        // New logic to fetch all slots if no day or date is provided
        const { data, error } = await (this.supabase as any).rpc(
          'get_all_timetable_slots',
          {
            p_timetable_id: timetableId
          }
        );

        if (error) {
          logger.error('academic/timetables', 'Error in getTimetableSlots (all)', error);
          throw error;
        }
        return data.map((item: any) => item.slot);
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching timetable slots', error);
      throw error;
    }
  }

  static async getTimetableByDate(
    institutionId: string,
    sectionId: string,
    date: string
  ): Promise<any> {
    try {
      const { data, error } = await (this.supabase as any).rpc('get_timetable_by_date', {
        p_institution_id: institutionId,
        p_section_id: sectionId,
        p_date: date
      });

      if (error) {
        logger.error('academic/timetables', 'Error fetching timetable by date', error);
        throw error;
      }

      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Error in getTimetableByDate', error);
      throw error;
    }
  }

  // NEW: Helper method to format subdivision data for saving (Updated: 2025-10-11)
  // Updated: 2025-10-13 - Fixed to work even when is_subdivided is not yet set
  static formatSubdivisionDataForSlot(
    slotData: any,
    subdivisionConfig?: {
      groups: Array<{
        group_order: number;
        group_name: string;
        course_id: string;
        staff_ids: string[];
        student_ids: string[];
        lab_room?: string;
        max_capacity?: number;
      }>;
      subdivision_type: string;
      subdivision_mode: string;
    }
  ): any {
    // Updated: Don't check slotData.is_subdivided - just check if subdivisionConfig is provided
    if (!subdivisionConfig || !subdivisionConfig.groups || subdivisionConfig.groups.length === 0) {
      return slotData;
    }

    // Convert subdivision groups to sub_slots format
    const subSlots = subdivisionConfig.groups.map((group) => ({
      sub_slot_order: group.group_order,
      course_id: group.course_id,
      staff_ids: group.staff_ids,
      section_ids: slotData.section_ids || [], // Preserve section IDs
      student_ids: group.student_ids, // NEW: Student assignments for this group
      group_name: group.group_name, // NEW: Group name
      lab_room: group.lab_room, // NEW: Lab room
      max_capacity: group.max_capacity, // NEW: Max capacity
      is_break_slot: false,
      break_description: undefined
    }));

    return {
      ...slotData,
      is_combined: false, // Subdivision uses sub_slots but is not "combined class"
      is_subdivided: true,
      subdivision_type: subdivisionConfig.subdivision_type,
      subdivision_mode: subdivisionConfig.subdivision_mode,
      sub_slots: subSlots
    };
  }

  static async updateTimetableSlot(
    timetableId: string,
    day: string,
    periodId: string,
    slotData: any,
    isBatch: boolean = false,
    suppressToast: boolean = false
  ): Promise<any> {
    try {
      // For batch mode, we need to check attendance for the specific date
      // For regular mode, we check for the day/period combination
      let attendanceQuery: any = this.supabase
        .from('student_attendance')
        .select('id, attendance_data, attendance_date')
        .eq('timetable_id', timetableId);

      // IMPORTANT: Only filter by date in batch mode with valid date format
      // Regular mode has day of week (MONDAY, etc.) which cannot be used as date filter
      if (isBatch) {
        // Check if day is a valid date format (YYYY-MM-DD)
        const isValidDate = day && /^\d{4}-\d{2}-\d{2}$/.test(day);
        if (isValidDate) {
          attendanceQuery = attendanceQuery.eq('attendance_date', day);
        } else {
          logger.warn('academic/timetables', 'Batch mode but invalid date format', { day });
        }
      }

      const { data: attendanceCheck, error: checkError } = (await attendanceQuery) as {
        data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
        error: any;
      };

      if (checkError) {
        logger.error('academic/timetables', 'Error checking attendance for slot', checkError);
      }

      // Check if this specific period/slot has attendance marked
      if (attendanceCheck && attendanceCheck.length > 0) {
        let hasAttendance = false;
        let attendanceDate = '';

        for (const record of attendanceCheck) {
          const attendanceData = record.attendance_data || {};

          // Check multiple possible keys for the period
          // Sometimes attendance is stored with period_id, sometimes with slot_id
          const possibleKeys = [
            periodId,
            `${day}_${periodId}`, // day_period format
            `slot_${periodId}` // slot_period format
          ];

          for (const key of possibleKeys) {
            if (
              attendanceData[key] &&
              attendanceData[key].students?.length > 0
            ) {
              hasAttendance = true;
              attendanceDate = record.attendance_date;
              break;
            }
          }

          if (hasAttendance) break;
        }

        if (hasAttendance) {
          const errorMessage = isBatch
            ? `Cannot modify this period slot. Attendance has been marked on ${attendanceDate}. Once attendance is recorded, the period cannot be changed.`
            : `Cannot modify this period slot. Attendance has been marked for it. Once attendance is recorded, the period cannot be changed. Staff changes should be made through the Staff Planning module.`;

          if (!suppressToast) {
            toast.error(errorMessage, {
              duration: 6000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                maxWidth: '500px'
              }
            });
          }

          throw new Error(errorMessage);
        }
      }

      // For batch mode, ensure slot_date is included in slotData
      const processedSlotData = { ...slotData };
      if (isBatch) {
        processedSlotData.slot_date = day; // The day parameter contains the date for batch mode
      }

      const payload: any = {
        p_timetable_id: timetableId,
        p_day_of_week: day,
        p_period_id: periodId,
        p_slot_data: processedSlotData,
        p_is_batch: isBatch
      };

      const { data, error } = await (this.supabase as any).rpc(
        'update_timetable_slot',
        payload
      );

      if (error) {
        logger.error('academic/timetables', 'Error updating timetable slot', error);
        if (!suppressToast) {
          toast.error('Failed to update timetable slot.');
        }
        throw error;
      }

      // Check if RPC returned success: false
      if (data && data.success === false) {
        logger.error('academic/timetables', 'RPC returned failure', data);
        if (!suppressToast) {
          toast.error(data.message || 'Failed to update timetable slot.');
        }
        throw new Error(data.message || 'RPC returned failure');
      }

      if (!suppressToast) {
        toast.success('Timetable slot updated successfully!');
      }
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.timetableSlotUpdated(
            timetableId,
            day || 'unknown',
            periodId || 'slot'
          );
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: timetableId,
            description: template.description,
            metadata: { sub_type: template.sub_type, day, period_id: periodId },
          });
        } catch { /* never block */ }
      })();
      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Error in updateTimetableSlot', error);
      throw error;
    }
  }

  /**
   * Batch update timetable slots for multiple dates in a single atomic operation
   * This eliminates race conditions by updating all dates in ONE database transaction
   *
   * @param timetableId - The timetable ID
   * @param dates - Array of date strings in YYYY-MM-DD format
   * @param periodId - The period ID to update
   * @param slotData - The slot data to apply to all dates
   * @param suppressToast - Whether to suppress toast notifications
   * @returns Promise with update results including success/failure counts
   *
   * Updated: 2025-10-14 - Created to fix concurrent update race conditions
   */
  static async updateTimetableSlotsBatch(
    timetableId: string,
    dates: string[],
    periodId: string,
    slotData: any,
    suppressToast: boolean = false
  ): Promise<{
    success: boolean;
    updated_count: number;
    failed_count: number;
    total_dates: number;
    message: string;
  }> {
    try {
      // Call the new batch RPC function
      const { data, error } = await (this.supabase as any).rpc(
        'update_timetable_slots_batch',
        {
          p_timetable_id: timetableId,
          p_dates: dates,
          p_period_id: periodId,
          p_slot_data: slotData
        }
      );

      if (error) {
        logger.error('academic/timetables', 'Batch update error', error);
        if (!suppressToast) {
          toast.error('Failed to update timetable slots in batch.');
        }
        throw error;
      }

      if (!suppressToast && data?.success) {
        toast.success(
          `Successfully updated ${data.updated_count} of ${data.total_dates} slots!`,
          {
            duration: 3000,
            position: 'top-center',
            style: {
              background: '#F0FDF4',
              color: '#166534'
            }
          }
        );
      }

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.timetableSlotUpdated(
            timetableId,
            `batch(${dates.length} dates)`,
            periodId || 'slot'
          );
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: timetableId,
            description: template.description,
            metadata: { sub_type: template.sub_type, dates, period_id: periodId },
          });
        } catch { /* never block */ }
      })();
      return data;
    } catch (error) {
      logger.error('academic/timetables', 'Error in updateTimetableSlotsBatch', error);
      throw error;
    }
  }

  static async deleteTimetableSlot(
    timetableId: string,
    day: string,
    periodId: string,
    isBatch: boolean = false,
    suppressToast: boolean = false
  ): Promise<void> {
    try {
      // FIX: 2025-12-05 - Handle RANGE format dates for batch timetables
      // RANGE format: "RANGE:YYYY-MM-DD:YYYY-MM-DD" (e.g., "RANGE:2025-12-01:2025-12-11")
      // The timetable_data stores slots under individual date keys, NOT RANGE keys
      // So we need to delete from all individual dates within the range
      if (isBatch && day && day.startsWith('RANGE:')) {
        const parts = day.split(':');
        if (parts.length === 3) {
          const startDate = parts[1];
          const endDate = parts[2];

          // Generate all dates in the range
          const dates: string[] = [];
          const current = new Date(startDate);
          const end = new Date(endDate);

          while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
          }

          // Check attendance for all dates in the range
          const { data: attendanceCheck, error: checkError } = (await this.supabase
            .from('student_attendance')
            .select('id, attendance_data, attendance_date')
            .eq('timetable_id', timetableId)
            .in('attendance_date', dates)) as {
            data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
            error: any;
          };

          if (checkError) {
            logger.error('academic/timetables', 'Error checking attendance for range deletion', checkError);
          }

          // Check if any date in the range has attendance marked
          if (attendanceCheck && attendanceCheck.length > 0) {
            for (const record of attendanceCheck) {
              const attendanceData = record.attendance_data || {};
              const possibleKeys = [
                periodId,
                `${record.attendance_date}_${periodId}`,
                `slot_${periodId}`
              ];

              for (const key of possibleKeys) {
                if (attendanceData[key] && attendanceData[key].students?.length > 0) {
                  const errorMessage = `Cannot delete this period slot. Attendance has been marked for ${attendanceData[key].students.length} students on ${record.attendance_date}. Deleting would lose attendance records.`;

                  if (!suppressToast) {
                    toast.error(errorMessage, {
                      duration: 6000,
                      position: 'top-center',
                      style: {
                        background: '#FEF2F2',
                        color: '#991B1B',
                        border: '1px solid #FCA5A5',
                        maxWidth: '500px'
                      }
                    });
                  }

                  throw new Error(errorMessage);
                }
              }
            }
          }

          // Delete slots for all dates in the range
          // IMPORTANT: Must run sequentially to avoid race condition
          // Each RPC reads current data, deletes one slot, writes back
          // Parallel execution would cause last write to overwrite all previous deletions
          let deletedCount = 0;
          let failedCount = 0;

          for (const date of dates) {
            try {
              const { error } = await (this.supabase as any).rpc('delete_timetable_slot', {
                p_timetable_id: timetableId,
                p_day_of_week: date,
                p_period_id: periodId,
                p_is_batch: true
              });

              if (error) {
                logger.error('academic/timetables', `Failed to delete slot for ${date}`, error);
                failedCount++;
              } else {
                deletedCount++;
              }
            } catch (err) {
              logger.error('academic/timetables', `Error deleting slot for ${date}`, err);
              failedCount++;
            }
          }

          if (failedCount > 0) {
            logger.error('academic/timetables', `${failedCount} slot deletions failed out of ${dates.length}`);
          }

          if (!suppressToast) {
            toast.success('Timetable slot deleted successfully!');
          }
          return;
        }
      }

      // For batch mode, we need to check attendance for the specific date
      // For regular mode, we check for the day/period combination
      let attendanceQuery: any = this.supabase
        .from('student_attendance')
        .select('id, attendance_data, attendance_date')
        .eq('timetable_id', timetableId);

      // IMPORTANT: Only filter by date in batch mode with valid date format
      // Regular mode has day of week (MONDAY, etc.) which cannot be used as date filter
      if (isBatch) {
        // Check if day is a valid date format (YYYY-MM-DD)
        const isValidDate = day && /^\d{4}-\d{2}-\d{2}$/.test(day);
        if (isValidDate) {
          attendanceQuery = attendanceQuery.eq('attendance_date', day);
        } else {
          logger.warn('academic/timetables', 'Delete: Batch mode but invalid date format', { day });
        }
      }

      const { data: attendanceCheck, error: checkError } = (await attendanceQuery) as {
        data: Array<{ id: string; attendance_data: any; attendance_date: string }> | null;
        error: any;
      };

      if (checkError) {
        logger.error('academic/timetables', 'Error checking attendance for slot deletion', checkError);
      }

      // Check if this specific period/slot has attendance marked
      if (attendanceCheck && attendanceCheck.length > 0) {
        let hasAttendance = false;
        let attendanceDate = '';
        let attendanceCount = 0;

        for (const record of attendanceCheck) {
          const attendanceData = record.attendance_data || {};

          // Check multiple possible keys for the period
          // Sometimes attendance is stored with period_id, sometimes with slot_id
          const possibleKeys = [
            periodId,
            `${day}_${periodId}`, // day_period format
            `slot_${periodId}` // slot_period format
          ];

          for (const key of possibleKeys) {
            if (
              attendanceData[key] &&
              attendanceData[key].students?.length > 0
            ) {
              hasAttendance = true;
              attendanceDate = record.attendance_date;
              attendanceCount = attendanceData[key].students.length;
              break;
            }
          }

          if (hasAttendance) break;
        }

        if (hasAttendance) {
          const errorMessage = isBatch
            ? `Cannot delete this period slot. Attendance has been marked for ${attendanceCount} students on ${attendanceDate}. Deleting would lose attendance records.`
            : `Cannot delete this period slot. Attendance has been marked for ${attendanceCount} students. Once attendance is recorded, the period cannot be removed to preserve data integrity.`;

          if (!suppressToast) {
            toast.error(errorMessage, {
              duration: 6000,
              position: 'top-center',
              style: {
                background: '#FEF2F2',
                color: '#991B1B',
                border: '1px solid #FCA5A5',
                maxWidth: '500px'
              }
            });
          }

          throw new Error(errorMessage);
        }
      }

      const { error } = await (this.supabase as any).rpc('delete_timetable_slot', {
        p_timetable_id: timetableId,
        p_day_of_week: day,
        p_period_id: periodId,
        p_is_batch: isBatch
      });

      if (error) {
        logger.error('academic/timetables', 'Error deleting timetable slot', error);
        if (!suppressToast) {
          toast.error('Failed to delete timetable slot.');
        }
        throw error;
      }

      if (!suppressToast) {
        toast.success('Timetable slot deleted successfully!');
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error in deleteTimetableSlot', error);
      throw error;
    }
  }

  static async deleteSlotsForDateRange(
    timetableId: string,
    dateRange: { start: string; end: string },
    periods: { id: string }[]
  ): Promise<void> {
    try {
      // Generate all dates in the range
      const dates: string[] = [];
      const current = new Date(dateRange.start);
      const end = new Date(dateRange.end);

      while (current <= end) {
        dates.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }

      // Delete all slots for each date and period combination
      const deletePromises: Promise<void>[] = [];

      for (const date of dates) {
        for (const period of periods) {
          deletePromises.push(
            this.deleteTimetableSlot(timetableId, date, period.id, true, true) // suppressToast = true
          );
        }
      }

      // Execute all deletions (ignoring failures for non-existent slots)
      await Promise.allSettled(deletePromises);
    } catch (error) {
      logger.error('academic/timetables', 'Error in deleteSlotsForDateRange', error);
      throw error;
    }
  }

  static async deleteSlotsForRemovedDates(
    timetableId: string,
    removedDates: string[],
    periods: { id: string }[]
  ): Promise<void> {
    try {
      // Delete all slots for each removed date and period combination
      const deletePromises: Promise<void>[] = [];

      for (const date of removedDates) {
        for (const period of periods) {
          deletePromises.push(
            this.deleteTimetableSlot(timetableId, date, period.id, true, true) // suppressToast = true
          );
        }
      }

      // Execute all deletions (ignoring failures for non-existent slots)
      await Promise.allSettled(deletePromises);
    } catch (error) {
      logger.error('academic/timetables', 'Error in deleteSlotsForRemovedDates', error);
      throw error;
    }
  }

  static async saveTimetablePeriods(
    timetableId: string,
    periodIds: string[]
  ): Promise<void> {
    try {
      // First, fetch the full period objects from the period IDs
      const { data: periodsData, error: periodsError } = (await this.supabase
        .from('periods')
        .select('*')
        .in('id', periodIds)) as {
        data: Array<{
          id: string;
          period_name: string;
          start_time: string;
          end_time: string;
          is_break: boolean;
          institution_id: string;
        }> | null;
        error: any;
      };

      if (periodsError) {
        logger.error('academic/timetables', 'Error fetching period data', periodsError);
        throw periodsError;
      }

      if (!periodsData) {
        throw new Error('No period data found');
      }

      // Map the periods to the format expected by the timetable
      // and maintain the order of periodIds
      const orderedPeriods = periodIds
        .map((id, index) => {
          const period = periodsData.find((p) => p.id === id);
          if (!period) return null;

          return {
            period_id: period.id,
            period_name: period.period_name,
            start_time: period.start_time,
            end_time: period.end_time,
            is_break: period.is_break,
            sort_order: index,
            institution_id: period.institution_id
          };
        })
        .filter(Boolean); // Remove any null values

      // Save the complete period objects to the timetable
      const { error } = await (this.supabase as any)
        .from('timetables')
        .update({ periods: orderedPeriods })
        .eq('id', timetableId);

      if (error) {
        logger.error('academic/timetables', 'Error saving timetable periods', error);
        throw error;
      }
    } catch (error) {
      logger.error('academic/timetables', 'Error in saveTimetablePeriods', error);
      throw error;
    }
  }

  static async getInstitutionTimetableType(
    timetableId: string
  ): Promise<'day_order' | 'week_order'> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          institution:institution_id(
            timetable_type
          )
        `
        )
        .eq('id', timetableId)
        .single();

      if (error) throw error;

      return (data as any)?.institution?.timetable_type || 'week_order';
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching institution timetable type', error);
      return 'week_order'; // Default fallback
    }
  }

  // Template Operations
  static async saveTimetableAsTemplate(
    timetableId: string,
    templateName: string,
    templateDescription?: string
  ): Promise<void> {
    try {
      // Check if the current timetable exists
      const { error: fetchError } = await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', timetableId)
        .single();

      if (fetchError) throw fetchError;

      // Update the timetable to mark it as a template
      const { error: updateError } = await (this.supabase as any)
        .from('timetables')
        .update({
          is_template: true,
          template_name: templateName,
          template_description: templateDescription || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', timetableId);

      if (updateError) throw updateError;

      toast.success('Timetable saved as template successfully!', {
        duration: 3000,
        position: 'top-center',
        style: {
          background: '#F0FDF4',
          color: '#166534'
        }
      });
    } catch (error) {
      logger.error('academic/timetables', 'Error saving timetable as template', error);
      toast.error('Failed to save as template. Please try again.', {
        duration: 4000,
        position: 'top-center'
      });
      throw error;
    }
  }

  static async createTimetableFromTemplate(
    templateId: string,
    timetableData: CreateTimetableDto
  ): Promise<Timetable> {
    try {
      // Get the template timetable
      const { data: template, error: templateError } = (await this.supabase
        .from('timetables')
        .select('*')
        .eq('id', templateId)
        .eq('is_template', true)
        .single()) as {
        data: any | null;
        error: any;
      };

      if (templateError) throw templateError;

      if (!template) {
        throw new Error('Template not found or is not a valid template');
      }

      // Unconditional. This used to run only `if (start_date && end_date)`,
      // which meant instantiating a template without dates bypassed the rule
      // entirely — a second way into the same duplicate the dateless early
      // return produced.
      const existingCheck = await this.checkExistingTimetable({
        institution_id: timetableData.institution_id,
        academic_year_id: timetableData.academic_year_id,
        degree_id: timetableData.degree_id,
        program_id: timetableData.program_id,
        department_id: timetableData.department_id,
        semester_id: timetableData.semester_id!,
        section_id: timetableData.section_id || undefined,
        section_ids: timetableData.section_ids,
        start_date: timetableData.start_date,
        end_date: timetableData.end_date
      });

      if (existingCheck.exists) {
        toast.error(
          `${
            existingCheck.conflictScope === 'semester'
              ? '⚠️ Dates Clash With an Existing Timetable'
              : '⚠️ Section Already Has a Timetable'
          }\n\n${existingCheck.message}`,
          {
            duration: 8000,
            position: 'top-center',
            style: {
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FCA5A5',
              maxWidth: '500px',
              whiteSpace: 'pre-line'
            }
          }
        );
        throw new Error(
          existingCheck.message ||
            (existingCheck.conflictScope === 'semester'
              ? 'This semester already has an active semester-level timetable covering these dates.'
              : 'This section already has an active timetable for this academic year.')
        );
      }

      // Create new timetable based on template
      const newTimetableData = {
        ...timetableData,
        // Normalised the same way as createTimetable, not left to the spread: a
        // section-level row derives its scope from its own section, and an empty
        // array becomes NULL so it reads as "whole semester" and fails CLOSED.
        // The template's own scope is deliberately NOT copied — a template is a
        // grid shape, and the sections belong to the instance being created.
        section_ids: timetableData.section_id
          ? [timetableData.section_id]
          : timetableData.section_ids && timetableData.section_ids.length > 0
            ? timetableData.section_ids
            : null,
        // Copy template structure
        timetable_format: template.timetable_format,
        periods: template.periods, // Copy periods configuration
        timetable_data: template.timetable_data, // Copy timetable slots
        selected_days: template.selected_days,
        // Ensure it's not marked as template
        is_template: false,
        template_name: undefined,
        template_description: undefined,
        // Add metadata about template origin
        created_from_template_id: templateId,
        created_by: (await this.supabase.auth.getUser()).data.user?.id
      };

      const { data: newTimetable, error: createError } = (await (this.supabase as any)
        .from('timetables')
        .insert([newTimetableData])
        .select('*')
        .single()) as { data: Timetable | null; error: any };

      if (createError) {
        logger.error('academic/timetables', 'Error creating timetable from template', createError);
        if (createError.code === '23505') {
          toast.error(
            '⚠️ This timetable configuration already exists. Please check your semester and section selection.',
            {
              duration: 5000,
              position: 'top-center'
            }
          );
        } else {
          toast.error(
            'Failed to create timetable from template. Please try again.',
            {
              duration: 4000,
              position: 'top-center'
            }
          );
        }
        throw new Error('Failed to create timetable from template.');
      }

      // Update template usage count (optional analytics)
      await (this.supabase as any)
        .from('timetables')
        .update({
          usage_count: ((template as any).usage_count || 0) + 1
        })
        .eq('id', templateId);

      toast.success(
        `Timetable created successfully from template "${
          template.template_name || template.timetable_name
        }"!`,
        {
          duration: 4000,
          position: 'top-center',
          style: {
            background: '#F0FDF4',
            color: '#166534'
          }
        }
      );

      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const sourceName = template.template_name || template.timetable_name || templateId;
          const targetName = newTimetable.timetable_name || newTimetable.id;
          const activityTemplate = AcademicActivityTemplates.timetableCloned(sourceName, targetName);
          await logActivityClient({
            userId: user.id,
            actionType: activityTemplate.actionType,
            resourceType: activityTemplate.resourceType,
            resourceId: newTimetable.id,
            resourceName: targetName,
            description: activityTemplate.description,
            metadata: {
              sub_type: activityTemplate.sub_type,
              source_template_id: templateId,
            },
            institutionId: newTimetable.institution_id,
          });
        } catch { /* never block */ }
      })();
      return newTimetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error creating timetable from template', error);
      throw error;
    }
  }

  static async getTemplates(
    filters: TemplateFilters = {}
  ): Promise<TemplateListResponse> {
    try {
      let query = (this.supabase as any).from('timetables').select(
        `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `,
        { count: 'exact' }
      );

      // Only get templates
      query = query.eq('is_template', true);

      // Apply filters
      if (filters.search) {
        const searchTerm = filters.search.replace(/'/g, "''"); // Escape single quotes for SQL safety
        query = query.or(
          `timetable_name.ilike.%${searchTerm}%,` +
            `template_name.ilike.%${searchTerm}%,` +
            `template_description.ilike.%${searchTerm}%`
        );
      }

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.academic_year_id) {
        query = query.eq('academic_year_id', filters.academic_year_id);
      }

      if (filters.degree_id) {
        query = query.eq('degree_id', filters.degree_id);
      }

      if (filters.program_id) {
        query = query.eq('program_id', filters.program_id);
      }

      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      if (filters.template_category) {
        query = query.eq('template_category', filters.template_category);
      }

      // Filter by template tags (array contains any of the specified tags)
      if (filters.template_tags && filters.template_tags.length > 0) {
        // Use overlaps operator to match any of the provided tags
        query = query.overlaps('template_tags', filters.template_tags);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const start = (page - 1) * limit;

      query = query.range(start, start + limit - 1);

      // Order by template name, then timetable name
      query = query.order('template_name', {
        ascending: true,
        nullsFirst: false
      });
      query = query.order('timetable_name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: data || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching templates', error);
      throw error;
    }
  }

  static async deleteTemplate(id: string): Promise<void> {
    try {
      // First check if this is actually a template
      const { data: template, error: fetchError } = (await this.supabase
        .from('timetables')
        .select('is_template, template_name, timetable_name')
        .eq('id', id)
        .single()) as {
        data: { is_template: boolean; template_name?: string; timetable_name: string } | null;
        error: any;
      };

      if (fetchError) throw fetchError;
      if (!template) throw new Error('Template not found');

      if (!template.is_template) {
        throw new Error('This is not a template timetable');
      }

      // Delete the template
      const { error: deleteError } = await this.supabase
        .from('timetables')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      toast.success(
        `Template "${
          template.template_name || template.timetable_name
        }" deleted successfully`,
        {
          duration: 3000,
          position: 'top-center'
        }
      );
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting template', error);
      toast.error('Failed to delete template. Please try again.', {
        duration: 4000,
        position: 'top-center'
      });
      throw error;
    }
  }

  static async getTemplate(id: string): Promise<Timetable> {
    try {
      const { data, error } = await this.supabase
        .from('timetables')
        .select(
          `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .eq('id', id)
        .eq('is_template', true)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Template not found');

      return data as unknown as Timetable;
    } catch (error) {
      logger.error('academic/timetables', 'Error fetching template', error);
      throw error;
    }
  }

  static async saveAsTemplate(data: CreateTemplateDto): Promise<Timetable> {
    try {
      const templateData = {
        id: randomUUID(),
        institution_id: data.institution_id,
        academic_year_id: data.academic_year_id || null,
        degree_id: data.degree_id || null,
        program_id: data.program_id || null,
        department_id: data.department_id || null,
        semester_id: data.semester_id || null,
        section_id: data.section_id || null,
        timetable_name: data.timetable_name,
        template_name: data.template_name,
        template_description: data.template_description || null,
        template_category: data.template_category || null,
        template_tags: data.template_tags || [],
        timetable_format: data.timetable_format || 'regular',
        periods: data.periods || null,
        timetable_data: data.timetable_data || null,
        selected_days: data.selected_days || [],
        selected_dates: null,
        start_date: null,
        end_date: null,
        is_template: true,
        is_active: true,
        version: 1,
        usage_count: 0,
        created_from_template_id: null,
        created_by: 'system', // You might want to get this from auth context
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: template, error } = (await this.supabase
        .from('timetables')
        .insert(templateData as any)
        .select(
          `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .single()) as { data: Timetable | null; error: any };

      if (error) throw error;

      return template;
    } catch (error) {
      logger.error('academic/timetables', 'Error saving template', error);
      throw error;
    }
  }

  static async updateTemplate(
    id: string,
    data: UpdateTemplateDto
  ): Promise<Timetable> {
    try {
      const updateData = {
        ...data,
        updated_at: new Date().toISOString()
      };

      const { data: template, error } = (await (this.supabase as any)
        .from('timetables')
        .update(updateData)
        .eq('id', id)
        .eq('is_template', true)
        .select(
          `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .single()) as { data: Timetable | null; error: any };

      if (error) throw error;
      if (!template) throw new Error('Template not found');

      return template;
    } catch (error) {
      logger.error('academic/timetables', 'Error updating template', error);
      throw error;
    }
  }

  static async duplicateTemplate(
    id: string,
    newName: string
  ): Promise<Timetable> {
    try {
      // First get the template
      const originalTemplate = await this.getTemplate(id);

      const duplicateData = {
        ...originalTemplate,
        id: randomUUID(),
        template_name: newName,
        timetable_name: newName,
        usage_count: 0,
        created_by: 'system', // You might want to get this from auth context
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Remove computed fields
      delete duplicateData.institution;
      delete duplicateData.academic_year;
      delete duplicateData.degree;
      delete duplicateData.program;
      delete duplicateData.department;

      const { data: template, error } = (await this.supabase
        .from('timetables')
        .insert(duplicateData as any)
        .select(
          `
          *,
          institution:institution_id(id, name, logo_url, entity_type),
          academic_year:academic_year_id(id, academic_year_name),
          degree:degree_id(id, degree_name),
          program:program_id(id, program_name),
          department:department_id(id, department_name),
          semesters:semester_id(id, semester_name),
          sections:section_id(id, section_name)
        `
        )
        .single()) as { data: Timetable | null; error: any };

      if (error) throw error;

      return template;
    } catch (error) {
      logger.error('academic/timetables', 'Error duplicating template', error);
      throw error;
    }
  }

  // Added: 2026-02-28 - Task 2.3: Extracted from conflicts page to service layer
  static async getAllStaffConflicts(): Promise<any[]> {
    const { data, error } = await (this.supabase as any)
      .rpc('get_all_timetable_staff_conflicts');

    if (error) {
      logger.error('academic/timetables', 'Failed to fetch staff conflicts', error);
      throw error;  // Let the caller (page's try/catch) handle the error state
    }
    return data ?? [];
  }

  // Added: 2026-02-28 - Task 2.3: Extracted from conflicts page to service layer
  static async syncStaffAssignment(params: {
    timetableId: string;
    courseId: string;
    oldStaffId: string;
    newStaffId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { error } = await (this.supabase as any)
      .rpc('sync_timetable_staff_assignment', {
        p_timetable_id: params.timetableId,
        p_course_id: params.courseId,
        p_old_staff_id: params.oldStaffId,
        p_new_staff_id: params.newStaffId,
      });

    if (error) {
      logger.error('academic/timetables', 'Failed to sync staff assignment', { params, error });
      return { success: false, error: error.message };
    }
    return { success: true };
  }
}
