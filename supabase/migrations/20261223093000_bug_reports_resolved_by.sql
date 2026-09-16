-- ============================================================================
-- Who resolved this bug?
-- ============================================================================
-- TIER: ADDITIVE — 1 nullable column, 1 partial index, 1 trigger, 1 function.
-- No existing row is rewritten and no data is deleted.
--
-- THE GAP
-- -------
-- `bug_reports` records who REPORTED a bug (reporter_user_id) and WHEN it was
-- resolved (resolved_at), but never WHO resolved it. Three developers share one
-- GitHub push identity, so the commit author cannot answer it either. Measured
-- 2026-09-15: 1717 resolved bugs, 0 rows carrying any resolver.
--
-- WHAT THIS ADDS
-- --------------
-- 1. `resolved_by uuid REFERENCES profiles(id) ON DELETE SET NULL` — the person
--    who marked the bug resolved. SET NULL, never CASCADE: removing a profile
--    must not delete bug history.
-- 2. A partial index for "how many did each person resolve" queries.
-- 3. `trg_bug_reports_resolved_by` — the guard that makes the tracking real.
--    Any path that sets status='resolved' WITHOUT resolved_by is REJECTED,
--    including raw SQL run by an agent. Moving off 'resolved' clears
--    resolved_by, so a reopened bug never keeps a stale resolver.
-- 4. `fn_bug_resolver_stats(p_from, p_to)` — per-resolver counts for the admin
--    dashboard, grouped in SQL (a client-side group-by would silently stop at
--    PostgREST's 1000-row cap).
--
-- EXISTING ROWS
-- -------------
-- The 245 resolved bugs with no resolved_at and every other historical row are
-- left exactly as they are: the trigger fires on INSERT/UPDATE only, so old
-- rows keep resolved_by NULL and are reported as "Not recorded".
-- ============================================================================

BEGIN;

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bug_reports.resolved_by IS
  'Profile that marked this bug resolved (UI action or scripts/bug-resolve.mjs). NULL for bugs resolved before 2026-09-16.';

CREATE INDEX IF NOT EXISTS idx_bug_reports_resolved_by
  ON public.bug_reports (resolved_by)
  WHERE resolved_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- The guard: no anonymous resolutions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_reports_enforce_resolved_by()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'resolved' THEN
    -- Carry the existing resolver when an UPDATE touches other columns only.
    IF NEW.resolved_by IS NULL AND TG_OP = 'UPDATE' AND OLD.status = 'resolved' THEN
      NEW.resolved_by := OLD.resolved_by;
    END IF;

    IF NEW.resolved_by IS NULL THEN
      RAISE EXCEPTION
        'bug_reports.resolved_by is required when status = resolved (bug %). Resolve from the admin UI, or run: npm run bug:resolve -- <BUG-ID>',
        COALESCE(NEW.display_id, NEW.id::text)
      USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Any non-resolved status: the resolver no longer applies.
    NEW.resolved_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bug_reports_resolved_by ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_resolved_by
  BEFORE INSERT OR UPDATE OF status, resolved_by ON public.bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_bug_reports_enforce_resolved_by();

-- ----------------------------------------------------------------------------
-- Per-resolver counts for the admin dashboard.
-- Dates are INCLUSIVE calendar days in India time, matching the UI's filter.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_bug_resolver_stats(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  resolved_by uuid,
  resolver_name text,
  resolver_email text,
  resolved_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    br.resolved_by,
    p.full_name AS resolver_name,
    p.email     AS resolver_email,
    count(*)    AS resolved_count
  FROM public.bug_reports br
  LEFT JOIN public.profiles p ON p.id = br.resolved_by
  WHERE br.status = 'resolved'
    AND (p_from IS NULL OR br.resolved_at >= (p_from::timestamp AT TIME ZONE 'Asia/Kolkata'))
    AND (p_to   IS NULL OR br.resolved_at <  ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
  GROUP BY br.resolved_by, p.full_name, p.email
  ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.fn_bug_resolver_stats(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_bug_resolver_stats(date, date) TO authenticated, service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- End-state assertions
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bug_reports' AND column_name = 'resolved_by'
  ) THEN
    RAISE EXCEPTION 'bug_reports.resolved_by missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bug_reports_resolved_by' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_bug_reports_resolved_by missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_bug_resolver_stats'
  ) THEN
    RAISE EXCEPTION 'fn_bug_resolver_stats missing after migration';
  END IF;
END $$;
