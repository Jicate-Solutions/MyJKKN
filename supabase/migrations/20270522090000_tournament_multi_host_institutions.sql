-- ============================================================================
-- Sports tournaments: MULTIPLE host institutions (2026-10-01)
--
-- events.institution_id stays the PRIMARY host — it is the college whose
-- payment account registration fees settle into, and the college that issues
-- the event number (trg_events_stamp_event_number). It is NOT replaced.
--
-- events.host_institution_ids is the FULL host list (primary included). Every
-- institution in it gets the same visibility the primary host already had:
--
--   1. Every RLS policy that reads  <alias>.scope = 'all_jkkn'  as "visible
--      beyond the host" is widened IN PLACE to also admit a caller with
--      institution access to ANY host in the list. Rewritten via ALTER POLICY
--      from the live pg_policies text, so whatever later migrations (e.g. the
--      initplan wrap sweep) did to those policies is preserved, not clobbered
--      by a stale copy from an old migration file.
--   2. A permissive SELECT policy on events lets a co-host college's
--      tournament viewers see the event row itself.
--
-- NULL / empty host_institution_ids = single-host event, behaviour unchanged.
--
-- Run STEP 0 first (read-only preview), then the whole file.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 0 (PREVIEW, read-only) — policies the rewrite in step 3 will touch.
-- Anything listed in the second query mentions all_jkkn in a form the regex
-- does NOT match; review those by hand.
-- ----------------------------------------------------------------------------
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE coalesce(qual, '') || coalesce(with_check, '') ~ '\((\w+\.)?scope = ''all_jkkn''::text\)';
--
-- SELECT schemaname, tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%scope%all_jkkn%'
--   AND NOT (coalesce(qual, '') || coalesce(with_check, '') ~ '\((\w+\.)?scope = ''all_jkkn''::text\)');

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Column + backfill
-- ----------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS host_institution_ids uuid[];

COMMENT ON COLUMN public.events.host_institution_ids IS
  'All host institutions of the event, primary (institution_id) included. '
  'Fees settle into institution_id only; every listed host gets host visibility. '
  'NULL = single host.';

-- Keep the primary host in the list whenever a list exists.
CREATE OR REPLACE FUNCTION public.fn_events_host_ids_include_primary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.host_institution_ids IS NOT NULL THEN
    IF cardinality(NEW.host_institution_ids) = 0 THEN
      NEW.host_institution_ids := NULL;
    ELSIF NEW.institution_id IS NOT NULL
      AND NOT (NEW.institution_id = ANY (NEW.host_institution_ids)) THEN
      NEW.host_institution_ids := array_prepend(NEW.institution_id, NEW.host_institution_ids);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_host_ids_include_primary ON public.events;
CREATE TRIGGER trg_events_host_ids_include_primary
  BEFORE INSERT OR UPDATE OF host_institution_ids, institution_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_events_host_ids_include_primary();

CREATE INDEX IF NOT EXISTS idx_events_host_institution_ids
  ON public.events USING gin (host_institution_ids)
  WHERE host_institution_ids IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Helper: caller has institution access to ANY of the given institutions.
--    Delegates to role_has_institution_access (CAS-aware), so sibling rules
--    stay in one place.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_has_any_institution_access(p_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_ids IS NULL OR cardinality(p_ids) = 0 THEN false
    ELSE EXISTS (
      SELECT 1 FROM unnest(p_ids) AS i(id)
      WHERE public.role_has_institution_access(i.id)
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_has_any_institution_access(uuid[]) TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 3. Widen every "(<alias>.scope = 'all_jkkn')" policy predicate in place:
--      (e.scope = 'all_jkkn'::text)
--   →  ((e.scope = 'all_jkkn'::text) OR fn_has_any_institution_access(e.host_institution_ids))
--    A policy where the alias does not resolve to events (no such column)
--    fails its ALTER; it is skipped with a NOTICE and left untouched.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  pat  constant text := '\((\w+\.)?scope = ''all_jkkn''::text\)';
  repl constant text := '((\1scope = ''all_jkkn''::text) OR public.fn_has_any_institution_access(\1host_institution_ids))';
  new_qual text;
  new_check text;
  stmt text;
  n_ok int := 0;
  n_skip int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE coalesce(qual, '') || coalesce(with_check, '') ~ pat
      -- idempotent: never widen twice
      AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%fn_has_any_institution_access%'
  LOOP
    new_qual  := CASE WHEN r.qual       IS NULL THEN NULL ELSE regexp_replace(r.qual,       pat, repl, 'g') END;
    new_check := CASE WHEN r.with_check IS NULL THEN NULL ELSE regexp_replace(r.with_check, pat, repl, 'g') END;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    BEGIN
      EXECUTE stmt;
      n_ok := n_ok + 1;
    EXCEPTION WHEN others THEN
      n_skip := n_skip + 1;
      RAISE NOTICE 'skipped %.% policy "%": %', r.schemaname, r.tablename, r.policyname, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'multi-host: widened % policies, skipped %', n_ok, n_skip;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Co-host colleges can see the tournament's event row itself.
--    Permissive, so it only ADDS access on top of the existing events policies.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "events_select_co_host_institutions" ON public.events;
CREATE POLICY "events_select_co_host_institutions" ON public.events
  FOR SELECT TO authenticated
  USING (
    host_institution_ids IS NOT NULL
    AND (SELECT user_has_permission('sports.tournaments.view'))
    AND public.fn_has_any_institution_access(host_institution_ids)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- VERIFY
-- ----------------------------------------------------------------------------
-- SELECT tablename, policyname FROM pg_policies
-- WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%fn_has_any_institution_access%'
-- ORDER BY 1, 2;
--
-- ROLLBACK of step 3 is a reverse regexp_replace of `repl` → the original
-- predicate; step 1/2/4 objects can simply be dropped.
