-- ============================================================================
-- Drop 'enquiry' from lifecycle_status enum
-- ============================================================================
-- Date:   2026-05-09
-- Why:    The 'enquiry' value was added by the 2026-05-08 student-self-fill
--         plan. Rows landed in lifecycle_status='enquiry' and disappeared from
--         /learners/enquiries (which filters by admitted/pending/account/
--         rejected/waitlisted). Decision: revert. Bridge endpoint now sets
--         'admitted' on insert (app/api/admission/bridge/convert/route.ts).
--
-- Pattern: rename live enum, create fresh enum without 'enquiry', retype every
--          column referencing it via text bridge cast, re-attach defaults +
--          dependents, drop old type. Catalog DELETE on pg_enum is blocked on
--          managed Supabase.
--
-- Idempotent: any stragglers (rows still on 'enquiry' from a long-running API
--   process) are absorbed at the top of the transaction. Acquires a write
--   lock on learners_profiles, so concurrent INSERTs of 'enquiry' wait until
--   COMMIT and then fail with a clear enum-validation error — surfacing the
--   need to restart the API server.
--
-- Dependents handled (drop before retype, recreate verbatim after):
--   * 2 triggers (UPDATE OF lifecycle_status clause):
--       trg_set_learner_activated_at, trg_sync_learner_status_to_profile
--   * 1 RLS policy on student_attendance:
--       student_attendance_select_own_student
--   * 5 indexes with lifecycle_status type-cast WHERE predicates:
--       idx_learners_profiles_readiness_score, idx_learners_active_roster,
--       idx_learners_ai_solution_cleared, idx_lp_seat_analytics, idx_lp_geography
--   * 1 column default ('admitted'::lifecycle_status)
--
-- Plain column indexes without predicates (idx_learners_profiles_lifecycle_status,
-- idx_learners_profiles_institution_lifecycle) are auto-rebuilt by
-- ALTER COLUMN TYPE — no manual recreate needed.
-- ============================================================================

BEGIN;

-- ── 0. Absorb any straggler 'enquiry' rows ──────────────────────────────────
UPDATE learners_profiles
   SET lifecycle_status = 'admitted'
 WHERE lifecycle_status::text = 'enquiry';

-- ── 1. Drop dependents that block ALTER COLUMN TYPE ─────────────────────────

DROP TRIGGER IF EXISTS trg_set_learner_activated_at ON learners_profiles;
DROP TRIGGER IF EXISTS trg_sync_learner_status_to_profile ON learners_profiles;

DROP POLICY IF EXISTS student_attendance_select_own_student ON student_attendance;

DROP INDEX IF EXISTS idx_learners_profiles_readiness_score;
DROP INDEX IF EXISTS idx_learners_active_roster;
DROP INDEX IF EXISTS idx_learners_ai_solution_cleared;
DROP INDEX IF EXISTS idx_lp_seat_analytics;
DROP INDEX IF EXISTS idx_lp_geography;

ALTER TABLE learners_profiles
  ALTER COLUMN lifecycle_status DROP DEFAULT;

-- ── 2. Swap the enum type ───────────────────────────────────────────────────

ALTER TYPE lifecycle_status RENAME TO lifecycle_status_old;

CREATE TYPE lifecycle_status AS ENUM (
  'admitted',
  'pending',
  'approved',
  'account',
  'rejected',
  'waitlisted',
  'active',
  'inactive',
  'exited',
  'graduated',
  'alumni'
);

-- ── 3. Retype every column from old enum to new via text bridge cast ────────

ALTER TABLE learners_profiles
  ALTER COLUMN lifecycle_status TYPE lifecycle_status
  USING lifecycle_status::text::lifecycle_status;

ALTER TABLE learners_profiles_backup_20251223
  ALTER COLUMN lifecycle_status TYPE lifecycle_status
  USING lifecycle_status::text::lifecycle_status;

ALTER TABLE learners_profiles_backup_bpharm_sem8_active
  ALTER COLUMN lifecycle_status TYPE lifecycle_status
  USING lifecycle_status::text::lifecycle_status;

-- ── 4. Re-attach default + dependents ───────────────────────────────────────

ALTER TABLE learners_profiles
  ALTER COLUMN lifecycle_status SET DEFAULT 'admitted'::lifecycle_status;

CREATE TRIGGER trg_set_learner_activated_at
  BEFORE UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW EXECUTE FUNCTION set_learner_activated_at();

CREATE TRIGGER trg_sync_learner_status_to_profile
  AFTER UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW EXECUTE FUNCTION sync_learner_status_to_profile();

CREATE POLICY student_attendance_select_own_student ON student_attendance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'student'::text
        AND p.learner_id IN (
          SELECT learners_profiles.id
          FROM learners_profiles
          WHERE learners_profiles.section_id = student_attendance.section_id
            AND learners_profiles.lifecycle_status = ANY (
              ARRAY['active'::lifecycle_status, 'graduated'::lifecycle_status]
            )
        )
    )
  );

CREATE INDEX idx_learners_profiles_readiness_score
  ON public.learners_profiles USING btree (industry_readiness_score DESC)
  WHERE (lifecycle_status = 'active'::lifecycle_status);

CREATE INDEX idx_learners_active_roster
  ON public.learners_profiles
  USING btree (institution_id, program_id, semester_id, section_id, lifecycle_status)
  WHERE (lifecycle_status = 'active'::lifecycle_status);

CREATE INDEX idx_learners_ai_solution_cleared
  ON public.learners_profiles USING btree (ai_solution_cleared)
  WHERE (lifecycle_status = 'active'::lifecycle_status);

CREATE INDEX idx_lp_seat_analytics
  ON public.learners_profiles
  USING btree (institution_id, program_id, academic_year_id, lifecycle_status)
  WHERE (lifecycle_status = 'active'::lifecycle_status);

CREATE INDEX idx_lp_geography
  ON public.learners_profiles
  USING btree (institution_id, permanent_address_district, permanent_address_taluk)
  WHERE (lifecycle_status = 'active'::lifecycle_status);

-- ── 5. Drop the now-unreferenced old enum type ──────────────────────────────

DROP TYPE lifecycle_status_old;

COMMIT;
