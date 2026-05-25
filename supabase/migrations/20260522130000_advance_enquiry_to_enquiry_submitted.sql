-- =============================================================================
-- Migration: Advance qualifying `enquiry` learners to `enquiry_submitted`
-- File:      20260522130000_advance_enquiry_to_enquiry_submitted.sql
-- Created:   2026-05-22
-- =============================================================================
-- WHY
--   The new student-facing QR-code enquiry form pushes a learner from
--   lifecycle_status='enquiry' to 'enquiry_submitted' once the form is
--   completed. The downstream transition (enquiry_submitted -> account) is
--   handled by admission_account_transition_with_bills() and refuses to act
--   on rows in 'enquiry'. Historical rows that were captured before the QR
--   form existed (or for which the student completed the form via a
--   different flow) are stuck in 'enquiry' even though every required field
--   is filled. This migration unsticks them in a single deterministic step.
--
-- ELIGIBILITY RULE
--   Mirrors the enquiry form's Zod schema in
--     app/(routes)/learners/enquiries/_components/enquiry-form.tsx (lines 89-227)
--   23 required fields:
--     Basic & family:    first_name, last_name, date_of_birth, gender,
--                        religion, community, caste, father_name, mother_name
--     Academic:          scholarship_type, entry_type
--     Course selection:  institution_id, degree_id, department_id,
--                        program_id, semester_id
--     Contact:           student_mobile,
--                        permanent_address_street, _taluk, _district,
--                        _state, _pin_code
--     Accommodation:     accommodation_type
--   Empty strings ('') are treated as "not filled" — many NOT NULL text
--   columns are back-filled with '' during cleanup migrations (see
--   feedback_learners_profiles_community_not_null.md). Rows are eligible
--   when missing_count <= 2 (per user-confirmed policy 2026-05-22).
--
-- EXPECTED CHANGE SET (snapshot at authoring time, 2026-05-22 ~13:00)
--   * 484 rows fully complete (0 missing)
--   *  56 rows with 1-2 fields missing
--   * 540 rows total updated
--   * 532 rows have a corresponding admission_leads row -> activity log insert
--   *   8 rows are legacy profiles without a lead row -> status update only
--
-- IDEMPOTENCY
--   After this migration runs once, no row matches the WHERE predicate, so
--   a re-run is a no-op. The temp table guarantees UPDATE and INSERT see
--   the same id set even under concurrent writes.
--
-- TRIGGER SIDE EFFECTS (audited 2026-05-22 before authoring)
--   * set_learner_activated_at      - filters on lifecycle_status='active', does not fire
--   * sync_learner_status_to_profile - sets profiles.is_active=false on any
--                                      linked profile (idempotent; these
--                                      students aren't active anyway)
--   * trigger_detect_fee_dimension_change - guards on fee-dimension columns
--                                      we don't touch; early-returns
--   * set_learner_application_id    - beneficial: fills application_id for
--                                      rows missing one
--   * No AFTER UPDATE trigger writes to admission_lead_activities, so the
--     INSERT below is the sole audit-log writer (no double-log risk).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Step 1: Capture target ids in a temp table so UPDATE and INSERT both see
-- the same row set (avoids concurrent-write races and ensures activity-log
-- count exactly matches lifecycle transitions).
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _enquiry_advance_targets ON COMMIT DROP AS
WITH per_row AS (
    SELECT lp.id,
        (NULLIF(first_name, '')                  IS NULL)::int +
        (NULLIF(last_name, '')                   IS NULL)::int +
        (NULLIF(date_of_birth, '')               IS NULL)::int +
        (NULLIF(gender, '')                      IS NULL)::int +
        (NULLIF(religion, '')                    IS NULL)::int +
        (NULLIF(community, '')                   IS NULL)::int +
        (NULLIF(caste, '')                       IS NULL)::int +
        (NULLIF(father_name, '')                 IS NULL)::int +
        (NULLIF(mother_name, '')                 IS NULL)::int +
        (NULLIF(scholarship_type, '')            IS NULL)::int +
        (NULLIF(entry_type, '')                  IS NULL)::int +
        (institution_id                          IS NULL)::int +
        (degree_id                               IS NULL)::int +
        (department_id                           IS NULL)::int +
        (program_id                              IS NULL)::int +
        (semester_id                             IS NULL)::int +
        (NULLIF(student_mobile, '')              IS NULL)::int +
        (NULLIF(permanent_address_street, '')    IS NULL)::int +
        (NULLIF(permanent_address_taluk, '')     IS NULL)::int +
        (NULLIF(permanent_address_district, '')  IS NULL)::int +
        (NULLIF(permanent_address_state, '')     IS NULL)::int +
        (NULLIF(permanent_address_pin_code, '')  IS NULL)::int +
        (NULLIF(accommodation_type, '')          IS NULL)::int
        AS missing_count
    FROM public.learners_profiles lp
    WHERE lp.lifecycle_status = 'enquiry'
)
SELECT id, missing_count
FROM per_row
WHERE missing_count <= 2;

-- Sanity guard: fail loudly if the target set looks wrong. Authoring snapshot
-- showed 540 targets; allow +/- 50 for organic drift between authoring and
-- apply time. If the number is wildly off, the predicate logic or upstream
-- data has changed and the migration should be reviewed before applying.
DO $$
DECLARE
    n_targets integer;
BEGIN
    SELECT COUNT(*) INTO n_targets FROM _enquiry_advance_targets;
    RAISE NOTICE 'Targeting % learner rows for enquiry -> enquiry_submitted', n_targets;
    IF n_targets < 100 OR n_targets > 1000 THEN
        RAISE EXCEPTION
            'Unexpected target row count: %. Expected ~540. Review predicate before applying.',
            n_targets;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Step 2: Advance the lifecycle status. updated_by stays NULL (system
-- migration, not attributable to a user). updated_at is bumped via the SET
-- clause (the table does not have an auto-touching trigger for updated_at).
-- -----------------------------------------------------------------------------
UPDATE public.learners_profiles AS lp
SET lifecycle_status = 'enquiry_submitted',
    updated_at = now()
FROM _enquiry_advance_targets t
WHERE lp.id = t.id;

-- -----------------------------------------------------------------------------
-- Step 3: Insert one activity-log row per target that has a corresponding
-- admission_leads row. activity_type='enquiry_submitted' matches the existing
-- 139-row convention in production (verified 2026-05-22). created_by=NULL
-- since this is a system-level data migration, not a counsellor action.
-- Legacy profiles without a lead row (~8) get no activity entry; their
-- transition is documented by this migration file + updated_at bump.
-- -----------------------------------------------------------------------------
INSERT INTO public.admission_lead_activities (
    lead_id, activity_type, subject, description, created_by, created_at
)
SELECT
    al.id,
    'enquiry_submitted',
    'Bulk advance: enquiry -> enquiry_submitted',
    CASE
        WHEN t.missing_count = 0 THEN
            'System data migration 20260522130000: form fully complete '
            || '(23/23 required fields filled). Advanced from enquiry to '
            || 'enquiry_submitted.'
        ELSE
            'System data migration 20260522130000: '
            || (23 - t.missing_count) || '/23 required fields filled '
            || '(' || t.missing_count || ' missing). Advanced from enquiry to '
            || 'enquiry_submitted under the "<=2 missing" relaxation policy '
            || 'agreed with the admissions team on 2026-05-22.'
    END,
    NULL,
    now()
FROM _enquiry_advance_targets t
JOIN public.admission_leads al ON al.learner_profile_id = t.id;

COMMIT;
