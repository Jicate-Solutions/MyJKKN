-- ============================================================================
-- Migration: Mentor Federation foundation — faculty.mentees_met (Metric 6)
-- Date: 2026-07-22
-- ============================================================================
-- Federates the SEPARATE mentor.jkkn.ai Supabase (project qcugpxmulslqrqrjycti,
-- "Mentor module-Roja"). "MET mentee" = distinct counseling_sessions.student_id
-- per mentor; mentors.user_id -> users.email -> MyJKKN profiles.email.
-- READ-not-migrate: a nightly sync (separate) upserts the per-profile count
-- into the snapshot below. This file only builds the MyJKKN-side foundation:
-- snapshot table + RLS + calc function + registry row.
--
-- Dedup edge: an email can map to >1 MyJKKN profile (verified 2026-07-22) — the
-- sync must DISTINCT ON (lower(email)) preferring active + faculty. The snapshot
-- key is profile_id, so any collision is resolved BEFORE it reaches this table.
-- ============================================================================

-- 1. Snapshot table — one row per profile, upserted by the nightly federation sync.
CREATE TABLE IF NOT EXISTS public.mentor_signal_snapshot (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email        text NOT NULL,
  mentees_met  integer NOT NULL DEFAULT 0 CHECK (mentees_met >= 0),
  source       text NOT NULL DEFAULT 'mentor.jkkn.ai',
  synced_at    timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentor_signal_snapshot_profile_uniq UNIQUE (profile_id)
);

COMMENT ON TABLE public.mentor_signal_snapshot IS
  'Federated mentees-met signal per MyJKKN profile, synced nightly FROM the mentor app (Supabase qcugpxmulslqrqrjycti). READ-not-migrate. One row per profile; mentees_met = distinct met mentees (>=1 counseling session).';

CREATE INDEX IF NOT EXISTS idx_mentor_signal_snapshot_email
  ON public.mentor_signal_snapshot (lower(email));

-- 2. RLS — cross-tenant mentor data: admins + own row only. The sync writes as
--    service_role (BYPASSRLS), so no INSERT/UPDATE/DELETE policy is granted to
--    authenticated (default-deny on writes).
ALTER TABLE public.mentor_signal_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mentor_signal_snapshot_select ON public.mentor_signal_snapshot;
CREATE POLICY mentor_signal_snapshot_select ON public.mentor_signal_snapshot
  FOR SELECT
  USING (is_super_admin() OR is_admin() OR profile_id = auth.uid());

-- 3. Calc function — mirrors calc_faculty_publications' signature so the OKR
--    metric engine calls it uniformly. SECURITY DEFINER so the engine reads the
--    locked snapshot regardless of caller; returns a single scalar for a KNOWN
--    profile_id (no enumeration). The federated count is cumulative, so the
--    date-range params are accepted for signature-compatibility but not applied
--    in v1.
CREATE OR REPLACE FUNCTION public.calc_faculty_mentees_met(
  p_profile_id     uuid,
  p_institution_id uuid,
  p_start_date     date,
  p_end_date       date
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT mentees_met FROM public.mentor_signal_snapshot WHERE profile_id = p_profile_id),
    0
  )::numeric;
$$;

-- Mandatory anon lock (Supabase default-grants anon EXECUTE on new functions).
REVOKE EXECUTE ON FUNCTION public.calc_faculty_mentees_met(uuid,uuid,date,date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calc_faculty_mentees_met(uuid,uuid,date,date) TO authenticated, service_role;

-- 4. Register the metric (mirrors the faculty.publications registry row).
INSERT INTO public.okr_metric_registry
  (metric_key, display_name, description, module, category, applicable_roles,
   applicable_scopes, requires_context, source_type, source_config, value_type,
   unit, precision, default_baseline, refresh_frequency, cache_duration_seconds,
   chart_type, is_active, is_system, tags)
VALUES
  ('faculty.mentees_met',
   'Mentees Met',
   'Distinct mentees this person has actually met (>=1 counseling session), federated nightly from the mentor app. Assigned-but-never-met does not count.',
   'faculty_appraisal', 'academic',
   ARRAY['faculty','hod'], ARRAY['individual']::metric_scope[],
   '{}'::jsonb, 'db_function', '{"function_name":"calc_faculty_mentees_met"}'::jsonb,
   'count', '', 2, 0, 'daily', 86400, 'line', true, false,
   ARRAY['mentorship','federated'])
ON CONFLICT (metric_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Cron-only upsert for the mentor federation sync. Takes raw [{email,met}] rows
-- from the mentor app, resolves each email to ONE MyJKKN profile (DISTINCT ON
-- lower(email) preferring active + faculty — an email can map to >1 profile),
-- and upserts the per-profile mentees_met. service_role ONLY (cron uses it).
CREATE OR REPLACE FUNCTION public.fn_mentor_signal_sync_upsert(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_count integer;
BEGIN
  WITH incoming AS (
    SELECT lower(x.email) AS email, GREATEST(x.met,0) AS met
    FROM jsonb_to_recordset(p_rows) AS x(email text, met int)
    WHERE x.email IS NOT NULL
  ),
  matched AS (
    SELECT DISTINCT ON (i.email) p.id AS profile_id, p.email, i.met
    FROM incoming i
    JOIN public.profiles p ON lower(p.email) = i.email
    ORDER BY i.email, p.is_active DESC, (p.role = 'faculty') DESC, p.id
  ),
  upserted AS (
    INSERT INTO public.mentor_signal_snapshot (profile_id, email, mentees_met)
    SELECT profile_id, email, met FROM matched
    ON CONFLICT (profile_id) DO UPDATE
      SET mentees_met = EXCLUDED.mentees_met, email = EXCLUDED.email,
          synced_at = now(), updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upserted;
  RETURN v_count;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fn_mentor_signal_sync_upsert(jsonb) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mentor_signal_sync_upsert(jsonb) TO service_role;
