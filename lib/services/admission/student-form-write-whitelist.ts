// lib/services/admission/student-form-write-whitelist.ts
//
// The single security boundary for the student-form write path. The PATCH
// handler iterates only these column names; any field name in the request
// body that is NOT in this list is silently ignored.
//
// Columns explicitly excluded (see FORBIDDEN_COLUMNS): lifecycle_status,
// is_profile_complete, created_by, created_at, application_id, id —
// even a valid token cannot flip these via the student form.
//
// 2026-05-19: institution_id removed from FORBIDDEN and added to the new
// `course` section. The student now picks their institution as part of
// the Course Selection step, with the value pre-filled from the lead
// that the admin-side conversion created. See feedback for context.

export const STUDENT_WRITABLE_COLUMNS = {
  basic: [
    'first_name', 'last_name', 'date_of_birth', 'gender',
    // community/caste TEXT columns are retired — only the FK ids are writable.
    'religion', 'community_category_id', 'caste_id', 'student_photo_url',
    'father_name', 'father_occupation', 'father_mobile',
    'mother_name', 'mother_occupation', 'mother_mobile',
    'annual_income',
  ],
  academic: [
    'tenth_marks', 'twelfth_marks',
    // last_school_id (school_master FK) + school_district come from the
    // Board → District → School cascade; both null/empty for manual entries.
    'last_school', 'last_school_id', 'school_district', 'board_of_study',
    'neet_roll_number', 'neet_score',
    'counseling_applied', 'counseling_number',
    'scholarship_type',
    // Cutoff scores are derived from twelfth_marks.subjects.{physics,
    // chemistry, mathematics, biology, botany, zoology} on the client.
    // Storing them lets the enquiry form / B2A consumers read the same
    // value without recomputing. Students can't fudge these because the
    // formula is fixed and the inputs (subject marks) are visible.
    'engineering_cutoff_marks', 'medical_cutoff_marks',
  ],
  course: [
    // Course Selection step — added 2026-05-19. Cascade is Institution ->
    // Degree -> Program (Department auto-fills from Program). Semester is
    // auto-picked when Entry Type changes (FIRST YEAR / LATERAL ENTRY).
    // 2026-05-21: admission_year_id added. The student form auto-fetches
    // the current-year admission_year row scoped to (institution, program)
    // and renders it as a READ-ONLY field — the value is locked but still
    // submitted with the rest of the course fields so the fee-structure
    // matrix lookup has the right cohort.
    // 2026-07-27: academic_year_id added on the same read-only/auto-fetch
    // pattern (resolved from the institution's active row whose date window
    // contains today).
    // 2026-07-27 (later same day): section_id added too. It was initially left
    // out because section placement is an admission-staff decision — that still
    // holds for LATERAL ENTRY and friends, where the wizard sends nothing and
    // the column stays null. But FIRST YEAR admits go to section "A" of the
    // program's structural Freshers semester, which is a deterministic
    // derivation, not a placement choice. The student sees it read-only and
    // cannot pick a different section: the client only ever submits the id it
    // matched as 'A' under the locked Freshers semester.
    'institution_id', 'degree_id', 'department_id', 'program_id', 'semester_id',
    'section_id',
    'quota_id', 'entry_type', 'admission_year_id', 'academic_year_id',
  ],
  accommodation: [
    // Accommodation step — added 2026-05-19. The "How did you hear about us?"
    // reference fields (reference_type, reference_name, reference_contact) are
    // DELIBERATELY excluded per product spec: students fill the practical
    // accommodation choice; the reference channel is admin-tracked metadata
    // captured during lead intake, not by the student.
    //
    // accommodation_type TEXT is retired — the student form still sends the
    // HOSTEL/DAY SCHOLAR choice as `accommodation_type`, but saveSection resolves
    // it to this institution-scoped FK before the write (see student-form-service).
    'accommodation_type_id',
    // hostel_category_id / mess_category_id REMOVED (20260611190000): the
    // learner's room/mess categories are allocation-derived only — set by
    // trg_allocation_sync_learner_categories when a hostel room allocation
    // becomes active, never picked at admission time.
    // Day-Scholar bus transport (added 2026-05-29). bus_required gates the
    // route + boarding-point selection; routes/stops come from the TMS tables.
    'bus_required', 'transport_route_id', 'transport_stop_id',
  ],
  contact: [
    'student_mobile', 'student_email',
    'permanent_address_street', 'permanent_address_state',
    'permanent_address_district', 'permanent_address_taluk',
    // post_office_id (postal_codes FK) comes from the pincode lookup's
    // optional post-office pick; null when not chosen.
    'permanent_address_pin_code', 'post_office_id',
  ],
} as const;

export type StudentSection = keyof typeof STUDENT_WRITABLE_COLUMNS;

/**
 * Drop any keys in `payload` that aren't in the section's whitelist.
 * Returns a brand-new object — does not mutate input.
 */
export function filterToWhitelist(
  section: StudentSection,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = STUDENT_WRITABLE_COLUMNS[section] as readonly string[];
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (allowed.includes(key)) out[key] = payload[key];
  }
  return out;
}

/**
 * Throw if any of these forbidden keys appear anywhere across all sections —
 * defense in depth against the function being called with the wrong section
 * and a forbidden key slipping through. Never callable with the response.
 */
export const FORBIDDEN_COLUMNS = [
  'lifecycle_status', 'is_profile_complete',
  'created_by', 'created_at', 'application_id', 'id',
] as const;

export function assertNoForbidden(payload: Record<string, unknown>): void {
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_COLUMNS.includes(key as (typeof FORBIDDEN_COLUMNS)[number])) {
      throw new Error(`Forbidden column in student-form payload: ${key}`);
    }
  }
}
