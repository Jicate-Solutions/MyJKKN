-- ============================================================================
-- HR Training — FDP Extended (T5.4)
-- ============================================================================
-- Created: 2026-06-22
-- Spec: specs/hr-module-decomposition-2026-05-09.md §T5.4
-- Builds on: 20260619_hr_training_sessions.sql (T5.3, PR #915)
--
-- SCOPE
-- -----
-- T5.4 extends the T5.3 substrate with FDP-specific fields and workflow.
-- Does NOT create parallel tables — reuses hr_training_sessions for the
-- catalog (category='fdp' + fdp_application_metadata.is_catalog=true) and
-- hr_training_enrollments for the operational application/enrollment rows.
--
-- 1) New columns on hr_training_sessions (all NULLABLE — back-compat with
--    existing T5.3 rows; only set for FDP sessions):
--    - external_faculty_name        text
--    - external_faculty_org         text
--    - sponsoring_body              text (UGC / AICTE / internal / other)
--    - funding_amount               numeric(12,2)
--    - fdp_certificate_template_id  uuid (nullable, future link to certificates)
--    - fdp_application_metadata     jsonb NOT NULL DEFAULT '{}'
--      shape: { is_catalog: bool, application_open_at: ts, application_close_at: ts,
--               requires_hod_approval: bool, requires_director_approval: bool }
--
-- 2) hr_training_enrollments.status CHECK widened to include the FDP
--    application states: applied / hod_approved / director_approved.
--    Existing values preserved (registered/attended/completed/dropped).
--
-- 3) New column hr_training_enrollments.application_log jsonb — append-only
--    audit trail of FDP state transitions, defaults to '[]'.
--
-- TIER classification: TIER-0 (additive-only, no destructive ALTER, no DROP TABLE).
-- All ADD COLUMN guarded by IF NOT EXISTS. CHECK constraint replacement is
-- DROP-IF-EXISTS + ADD — idempotent.
--
-- RLS: inherits hr_training_sessions and hr_training_enrollments policies
-- from T5.3. No new policies needed; HR officers with hr.training.* perms
-- already have access. FDP-specific approvals are application-layer checks
-- (advanceApplication validates role of caller before flipping state).
--
-- Mirrors: T5.3 migration discipline (idempotent ALTERs, SELECT-only smoke).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extend hr_training_sessions with FDP-specific columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_training_sessions
  ADD COLUMN IF NOT EXISTS external_faculty_name        text,
  ADD COLUMN IF NOT EXISTS external_faculty_org         text,
  ADD COLUMN IF NOT EXISTS sponsoring_body              text,
  ADD COLUMN IF NOT EXISTS funding_amount               numeric(12,2),
  ADD COLUMN IF NOT EXISTS fdp_certificate_template_id  uuid,
  ADD COLUMN IF NOT EXISTS fdp_application_metadata     jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hr_training_sessions.external_faculty_name IS
  'T5.4 FDP: name of the external resource person delivering this FDP session.';
COMMENT ON COLUMN public.hr_training_sessions.external_faculty_org IS
  'T5.4 FDP: external faculty home institution (e.g. IIT Madras, IIIT-B).';
COMMENT ON COLUMN public.hr_training_sessions.sponsoring_body IS
  'T5.4 FDP: who is funding this FDP. Free-text but UI offers UGC / AICTE / internal / other.';
COMMENT ON COLUMN public.hr_training_sessions.funding_amount IS
  'T5.4 FDP: budgeted spend in INR for this FDP cohort (resource fee, travel, materials).';
COMMENT ON COLUMN public.hr_training_sessions.fdp_certificate_template_id IS
  'T5.4 FDP: optional link to a certificate template row. NULL until certificate templates table ships.';
COMMENT ON COLUMN public.hr_training_sessions.fdp_application_metadata IS
  'T5.4 FDP: jsonb with { is_catalog, application_open_at, application_close_at, requires_hod_approval, requires_director_approval }. is_catalog=true marks rows that appear in the staff-facing FDP catalog.';

-- ---------------------------------------------------------------------------
-- 2) Widen hr_training_enrollments.status to include FDP application states
-- ---------------------------------------------------------------------------
-- Idempotent: drop the existing CHECK + add the wider one. The constraint
-- name from T5.3 is the auto-generated CHECK on the status column; we look
-- it up by column to be safe across earlier/later schema variations.
DO $widen$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT con.conname
    INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class cls ON cls.oid = con.conrelid
  WHERE cls.relname = 'hr_training_enrollments'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%registered%'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.hr_training_enrollments DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;

  -- (re-)add wider CHECK with FDP application states
  ALTER TABLE public.hr_training_enrollments
    ADD CONSTRAINT hr_training_enrollments_status_check
    CHECK (status IN (
      'registered',
      'attended',
      'completed',
      'dropped',
      -- T5.4 FDP application lifecycle
      'applied',
      'hod_approved',
      'director_approved',
      'rejected'
    ));
END
$widen$;

-- ---------------------------------------------------------------------------
-- 3) Append-only application_log column for FDP audit trail
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_training_enrollments
  ADD COLUMN IF NOT EXISTS application_log jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.hr_training_enrollments.application_log IS
  'T5.4 FDP: append-only audit array. Each entry { ts, from_status, to_status, actor_id, note }. Service layer rewrites the whole jsonb on each transition.';

-- ---------------------------------------------------------------------------
-- 4) Index to support the staff-facing catalog query
--    (category='fdp' AND fdp_application_metadata->>'is_catalog'='true')
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_hr_training_sessions_fdp_catalog
  ON public.hr_training_sessions (category)
  WHERE category = 'fdp';

-- ---------------------------------------------------------------------------
-- 5) Verification — SELECT-only (no INSERT to keep apply idempotent on prod
--    with existing rows). Mirrors the SELECT-only verification pattern locked
--    in feedback_smoke_test_must_include_all_not_null_columns.md.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_col_count int;
  v_app_log_exists boolean;
BEGIN
  -- 5 new columns on hr_training_sessions must exist
  SELECT COUNT(*)
    INTO v_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'hr_training_sessions'
    AND column_name IN (
      'external_faculty_name',
      'external_faculty_org',
      'sponsoring_body',
      'funding_amount',
      'fdp_certificate_template_id',
      'fdp_application_metadata'
    );
  IF v_col_count <> 6 THEN
    RAISE EXCEPTION 'T5.4 verification failed: expected 6 new columns on hr_training_sessions, found %', v_col_count;
  END IF;

  -- application_log column must exist on enrollments
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hr_training_enrollments'
      AND column_name = 'application_log'
  ) INTO v_app_log_exists;
  IF NOT v_app_log_exists THEN
    RAISE EXCEPTION 'T5.4 verification failed: hr_training_enrollments.application_log column missing';
  END IF;

  RAISE NOTICE 'T5.4 FDP extended migration verified: 6 session columns + application_log present';
END
$verify$;
