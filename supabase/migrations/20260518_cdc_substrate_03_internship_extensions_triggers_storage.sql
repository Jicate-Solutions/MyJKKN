-- =====================================================================
-- CDC (Career Development Centre) — Substrate Migration 3 / 3
-- =====================================================================
-- Date: 2026-05-18
-- Prereq: 20260518_cdc_substrate_02_domain_tables_rls.sql
--
-- Final substrate piece. Establishes the cross-domain wiring:
--   1. Extends internship_external_sites + internship_assignments with
--      internship_type enum (Round 0.1 decision). Relaxes hospital-
--      specific NOT NULLs so corporate internships can coexist with
--      clinical/teaching/pharmacy practice records in the same family.
--      CHECK constraint enforces that hospital cols are NULL when
--      internship_type='corporate_internship'.
--   2. Builds the passed-out → alumni_outcomes bridge trigger (Round
--      0.2 + Round 5.2). Fires when learners_profiles.lifecycle_status
--      transitions into 'graduated' or 'alumni' — both states are the
--      canonical "passed out" markers in the existing enum.
--   3. Provisions the cdc-docs Supabase Storage bucket (private,
--      Round 3.4 attachment policy). RLS on storage.objects restricts
--      writes to cdc_staff.
--   4. Schedules two pg_cron jobs:
--        - cdc_coordinator_overdue_escalation (hourly)
--        - cdc_quarterly_placement_snapshot (1st of Apr/Jul/Oct/Jan)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. INTERNSHIP_TYPE EXTENSION on internship_external_sites + internship_assignments
-- ---------------------------------------------------------------------

-- 1a. Add internship_type to internship_external_sites. Default
--     'clinical_posting' so existing rows get the right value backfilled.
ALTER TABLE public.internship_external_sites
  ADD COLUMN IF NOT EXISTS internship_type public.cdc_internship_type NOT NULL DEFAULT 'clinical_posting';

ALTER TABLE public.internship_assignments
  ADD COLUMN IF NOT EXISTS internship_type public.cdc_internship_type NOT NULL DEFAULT 'clinical_posting';

-- 1b. Relax hospital-specific NOT NULLs (corporate recruiters don't have these).
ALTER TABLE public.internship_external_sites ALTER COLUMN hospital_code             DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN address_line1             DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN city                      DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN district                  DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN state                     DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN pincode                   DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN latitude                  DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN longitude                 DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN geofence_radius_meters    DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN operates_weekends         DROP NOT NULL;
ALTER TABLE public.internship_external_sites ALTER COLUMN ownership_type            DROP NOT NULL;

-- 1c. Add CHECK constraint: hospital-specific cols must be NULL when corporate.
--     Clinical/teaching/pharmacy types are unrestricted (existing rows preserved).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'internship_external_sites_corporate_hospital_cols_null'
  ) THEN
    ALTER TABLE public.internship_external_sites
      ADD CONSTRAINT internship_external_sites_corporate_hospital_cols_null CHECK (
        internship_type <> 'corporate_internship'
        OR (
          hospital_code IS NULL
          AND geofence_radius_meters IS NULL
          AND latitude IS NULL
          AND longitude IS NULL
        )
      );
  END IF;
END $$;

-- 1d. Index on internship_type for fast filtering.
CREATE INDEX IF NOT EXISTS idx_internship_external_sites_internship_type
  ON public.internship_external_sites (internship_type);

CREATE INDEX IF NOT EXISTS idx_internship_assignments_internship_type
  ON public.internship_assignments (internship_type);


-- ---------------------------------------------------------------------
-- 2. PASSED-OUT → ALUMNI_OUTCOMES BRIDGE TRIGGER (Round 0.2 + 5.2)
-- ---------------------------------------------------------------------
-- Fires on learners_profiles.lifecycle_status UPDATE.
-- When the learner transitions INTO 'graduated' or 'alumni' (from any
-- other state), and they have at least one accepted cdc_placements row,
-- copy each accepted placement into alumni_outcomes with
-- outcome_type='employed'.

CREATE OR REPLACE FUNCTION public.fn_cdc_passed_out_to_alumni_bridge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_placement RECORD;
BEGIN
  -- Only fire on transitions INTO a passed-out state from a non-passed-out state.
  IF NEW.lifecycle_status NOT IN ('graduated', 'alumni') THEN
    RETURN NEW;
  END IF;
  IF OLD.lifecycle_status IN ('graduated', 'alumni') THEN
    RETURN NEW;
  END IF;

  -- Copy each accepted placement to alumni_outcomes.
  -- Skip if a duplicate already exists (idempotent re-fire safety).
  -- The graduation_date is set to CURRENT_DATE since learners_profiles
  -- doesn't carry a graduation_date column — the lifecycle_status flip
  -- IS the graduation event timestamp.
  FOR v_placement IN
    SELECT p.*
    FROM public.cdc_placements p
    WHERE p.learner_id = NEW.id
      AND p.status = 'accepted'
  LOOP
    INSERT INTO public.alumni_outcomes (
      learner_id,
      institution_id,
      program_id,
      batch_id,
      graduation_date,
      graduation_year,
      outcome_type,
      outcome_start_date,
      company_name,
      designation,
      city,
      country,
      is_remote,
      data_source,
      verification_status,
      reported_at,
      created_by
    )
    SELECT
      v_placement.learner_id,
      NEW.institution_id,
      NEW.program_id,
      NEW.batch_id,
      CURRENT_DATE,
      EXTRACT(YEAR FROM CURRENT_DATE)::integer,
      'employed'::public.outcome_type,                  -- bare enum name (verified 2026-05-18)
      v_placement.joining_date,
      r.name,
      v_placement.job_role,
      v_placement.job_location,
      COALESCE(r.hq_country, 'India'),
      v_placement.is_remote,
      'cdc_placement_bridge'::varchar,
      'pending'::public.verification_status,            -- bare enum name (verified 2026-05-18)
      now(),
      NEW.updated_by                                    -- audit trail: who triggered the graduation
    FROM public.cdc_recruiters r
    WHERE r.id = v_placement.recruiter_id
      AND NOT EXISTS (
        SELECT 1 FROM public.alumni_outcomes ao
        WHERE ao.learner_id = v_placement.learner_id
          AND ao.company_name = r.name
          AND ao.outcome_start_date IS NOT DISTINCT FROM v_placement.joining_date
      );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_passed_out_to_alumni_bridge ON public.learners_profiles;
CREATE TRIGGER trg_cdc_passed_out_to_alumni_bridge
  AFTER UPDATE OF lifecycle_status ON public.learners_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_passed_out_to_alumni_bridge();


-- ---------------------------------------------------------------------
-- 3. STORAGE BUCKET: cdc-docs (private)
-- ---------------------------------------------------------------------
-- Holds: campus circulars, posters, promo videos, willingness consent
-- forms, offer letters, internship certificates, event photos.
-- Folder layout: cdc-docs/drives/{drive_id}/{filename}
--                cdc-docs/placements/{placement_id}/{filename}
--                cdc-docs/internships/{internship_id}/{filename}
--                cdc-docs/idp/{learner_id}/{filename}

INSERT INTO storage.buckets (id, name, public, created_at)
VALUES ('cdc-docs', 'cdc-docs', false, now())
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: cdc_staff can write; authenticated can read (service layer
-- gates whether the URL is even exposed for each user / view).
DROP POLICY IF EXISTS "cdc_docs_read"    ON storage.objects;
DROP POLICY IF EXISTS "cdc_docs_write"   ON storage.objects;
DROP POLICY IF EXISTS "cdc_docs_update"  ON storage.objects;
DROP POLICY IF EXISTS "cdc_docs_delete"  ON storage.objects;

CREATE POLICY "cdc_docs_read"    ON storage.objects FOR SELECT USING (bucket_id = 'cdc-docs' AND auth.uid() IS NOT NULL);
CREATE POLICY "cdc_docs_write"   ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cdc-docs' AND public.is_cdc_staff());
CREATE POLICY "cdc_docs_update"  ON storage.objects FOR UPDATE USING (bucket_id = 'cdc-docs' AND public.is_cdc_staff()) WITH CHECK (bucket_id = 'cdc-docs' AND public.is_cdc_staff());
CREATE POLICY "cdc_docs_delete"  ON storage.objects FOR DELETE USING (bucket_id = 'cdc-docs' AND public.is_cdc_head_or_super());


-- ---------------------------------------------------------------------
-- 4. PG_CRON JOBS
-- ---------------------------------------------------------------------

-- 4a. Quarterly placement snapshot — 1st of Apr/Jul/Oct/Jan at 02:00.
--     Honors platform_policies.cdc.quarterly_snapshot_enabled toggle.

CREATE OR REPLACE FUNCTION public.fn_cdc_quarterly_placement_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_period text;
BEGIN
  -- Read policy toggle
  SELECT (value)::boolean INTO v_enabled
  FROM public.platform_policies
  WHERE policy_key = 'cdc.quarterly_snapshot_enabled'
    AND scope_type = 'global'
    AND is_active = true
  LIMIT 1;

  IF NOT COALESCE(v_enabled, true) THEN
    RAISE NOTICE 'cdc quarterly snapshot skipped (policy disabled)';
    RETURN;
  END IF;

  v_period := to_char(now(), 'YYYY') || '-Q' || ((EXTRACT(QUARTER FROM now()))::int)::text;

  INSERT INTO public.cdc_placement_snapshots (
    snapshot_at,
    snapshot_period,
    placement_id,
    learner_id,
    drive_id,
    recruiter_id,
    offer_type_id,
    status,
    package_lpa,
    package_inr_total,
    job_role,
    job_location,
    offered_at,
    accepted_at
  )
  SELECT
    now(),
    v_period,
    p.id,
    p.learner_id,
    p.drive_id,
    p.recruiter_id,
    p.offer_type_id,
    p.status,
    p.package_lpa,
    p.package_inr_total,
    p.job_role,
    p.job_location,
    p.offered_at,
    p.accepted_at
  FROM public.cdc_placements p
  ON CONFLICT (placement_id, snapshot_period) DO NOTHING;
END;
$$;

-- Drop any previous schedule with this name, then create.
DO $$
BEGIN
  PERFORM cron.unschedule('cdc_quarterly_placement_snapshot')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cdc_quarterly_placement_snapshot');
EXCEPTION WHEN OTHERS THEN
  -- ignore if unschedule fails (job didn't exist)
  NULL;
END $$;

SELECT cron.schedule(
  'cdc_quarterly_placement_snapshot',
  '0 2 1 1,4,7,10 *',     -- 02:00 on the 1st day of Jan/Apr/Jul/Oct
  $$ SELECT public.fn_cdc_quarterly_placement_snapshot(); $$
);

-- 4b. Coordinator overdue check — hourly DETECTOR only (Sprint 1 scope).
--     Stores overdue drive IDs in a small audit table; Sprint 2 wires
--     the notification dispatcher (in-app + email) to read from it.
--     This keeps the substrate independent of the unfamiliar
--     notifications jsonb-targeting shape we inspected today.

CREATE TABLE IF NOT EXISTS public.cdc_coordinator_overdue_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id     uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  detected_at  timestamptz NOT NULL DEFAULT now(),
  hours_overdue numeric(8,2),
  notified_at  timestamptz,        -- Sprint 2 dispatcher stamps this when it sends
  resolved_at  timestamptz,        -- when the drive transitioned past willingness_open
  CONSTRAINT cdc_coordinator_overdue_log_unique_open
    UNIQUE NULLS NOT DISTINCT (drive_id, notified_at, resolved_at)
);

CREATE INDEX IF NOT EXISTS idx_cdc_coordinator_overdue_log_drive
  ON public.cdc_coordinator_overdue_log (drive_id);
CREATE INDEX IF NOT EXISTS idx_cdc_coordinator_overdue_log_pending
  ON public.cdc_coordinator_overdue_log (detected_at) WHERE notified_at IS NULL;

ALTER TABLE public.cdc_coordinator_overdue_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cdc_coordinator_overdue_log_read"  ON public.cdc_coordinator_overdue_log;
CREATE POLICY "cdc_coordinator_overdue_log_read" ON public.cdc_coordinator_overdue_log
  FOR SELECT USING (public.is_cdc_staff());

CREATE OR REPLACE FUNCTION public.fn_cdc_coordinator_overdue_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_hours integer;
BEGIN
  -- Read the default deadline policy (Director-tweakable in /admin/cdc/policies)
  SELECT (value)::int INTO v_default_hours
  FROM public.platform_policies
  WHERE policy_key = 'cdc.coordinator_willingness_approval_deadline_hours'
    AND scope_type = 'global'
    AND is_active = true
  LIMIT 1;

  v_default_hours := COALESCE(v_default_hours, 48);

  -- Detect overdue drives + write to audit log. No dedup beyond the
  -- unique constraint above — Sprint 2 dispatcher will collapse.
  INSERT INTO public.cdc_coordinator_overdue_log (drive_id, hours_overdue)
  SELECT
    d.id,
    EXTRACT(EPOCH FROM (now() - d.willingness_window_open_at)) / 3600.0
  FROM public.cdc_drives d
  WHERE d.status = 'willingness_open'
    AND d.willingness_window_open_at IS NOT NULL
    AND d.willingness_window_open_at + (COALESCE(d.coordinator_approval_deadline_hours, v_default_hours) * interval '1 hour') < now()
    AND NOT EXISTS (
      SELECT 1 FROM public.cdc_coordinator_overdue_log l
      WHERE l.drive_id = d.id
        AND l.resolved_at IS NULL
    );

  -- Auto-resolve log entries when the drive moved past willingness_open.
  UPDATE public.cdc_coordinator_overdue_log l
  SET resolved_at = now()
  WHERE resolved_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.cdc_drives d
      WHERE d.id = l.drive_id
        AND d.status NOT IN ('draft', 'announced', 'willingness_open')
    );
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cdc_coordinator_overdue_check')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cdc_coordinator_overdue_check');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cdc_coordinator_overdue_check',
  '7 * * * *',     -- every hour at :07 (off the :00 mark to spread load)
  $$ SELECT public.fn_cdc_coordinator_overdue_check(); $$
);


-- ---------------------------------------------------------------------
-- 5. UPDATED_AT TRIGGERS for the master tables that already exist in M1
--    (these were attached in M1; this block is a no-op safety net).
-- ---------------------------------------------------------------------
-- (intentionally empty — M1 handles its own triggers)


COMMIT;
