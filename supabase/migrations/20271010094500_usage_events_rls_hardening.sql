-- ============================================================================
-- usage_events: only signed-in users can log their OWN events; reading a whole
-- institution's events needs an institution admin.
--
-- WHAT WAS LIVE (read-only, 10 Oct 2027 05:00, Bugs desk) — all three policies
-- granted TO PUBLIC:
--   (a) "Service role can insert usage_events"  FOR INSERT WITH CHECK (true)
--       Despite the name, ANYONE could insert — anon included, with any user_id.
--   (b) "Institution admin can view own institution usage_events"  FOR SELECT
--       USING (institution_id IN (SELECT institution_id FROM profiles
--              WHERE id = auth.uid()))
--       Despite the name, NO admin check: every signed-in user could read every
--       usage event (who, where, search text) of their institution.
--   (c) "Super admin can view all usage_events"  FOR SELECT — kept as is.
-- And anon + authenticated both held INSERT/UPDATE/DELETE/TRUNCATE.
--
-- WRITERS (none needs the blind policy):
--   lib/services/analytics/usage-tracking-service.ts — service role (bypasses
--     RLS); its page-visit / explicit paths are fed by
--     app/api/analytics/usage/events/route.ts, which takes user_id from the
--     session (supabase.auth.getUser), never from the request body.
--   lib/navigation/search-analytics.ts — browser client, user_id = profile.id of
--     the signed-in person (components/CommandPalette/CommandPaletteModal.tsx).
--     Satisfied by the new INSERT policy: own user_id, event_type 'search'
--     only, institution NULL or the caller's own.
--
-- READERS UNDER RLS: only components/CommandPalette/TrendingPages.tsx, which
-- relied on (b). It now calls fn_usage_trending_pages() below: per-MODULE
-- visit counts for the caller's own institution — no paths, no user ids.
-- Every other reader is SECURITY DEFINER (fn_adoption_sync_usage_events[_core],
-- fn_cac_measured_metrics) or service role (app/api/cron/usage-rollup) — the
-- table owner bypasses RLS, so they are unaffected. Do NOT add FORCE RLS.
-- ============================================================================

BEGIN;

-- (a) blind INSERT → own-row INSERT for signed-in users only. The ONLY browser
-- writer is lib/navigation/search-analytics.ts (event_type 'search', the
-- caller's own profile.institution_id or NULL). page_visit and every other
-- event type come from the service-role route, so a browser may not write them
-- — otherwise anyone could forge page visits that fn_usage_trending_pages shows
-- as trending, and pin them to ANOTHER institution's id.
DROP POLICY IF EXISTS "Service role can insert usage_events" ON public.usage_events;
DROP POLICY IF EXISTS "usage_events_insert_own" ON public.usage_events;
CREATE POLICY "usage_events_insert_own" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND event_type = 'search'
    AND (
      institution_id IS NULL
      OR institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    )
  );

-- (b) institution read → institution ADMIN read
DROP POLICY IF EXISTS "Institution admin can view own institution usage_events" ON public.usage_events;
DROP POLICY IF EXISTS "usage_events_select_institution_admin" ON public.usage_events;
CREATE POLICY "usage_events_select_institution_admin" ON public.usage_events
  FOR SELECT TO authenticated
  USING (
    institution_id IS NOT NULL
    AND (SELECT public.is_admin())
    AND public.role_has_institution_access(institution_id)
  );

-- (c) "Super admin can view all usage_events" keeps its USING expression; it is
-- only narrowed from PUBLIC to authenticated (anon has no auth.uid(), so nothing
-- that worked stops working).
ALTER POLICY "Super admin can view all usage_events" ON public.usage_events TO authenticated;

-- Table grants: anon writes nothing; signed-in users may only INSERT (+SELECT
-- under the policies above). service_role keeps everything.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.usage_events FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.usage_events FROM authenticated;

-- Trending modules for the command palette — aggregate only, caller's own
-- institution, no user ids and NO PATHS. Page paths carry record ids and
-- slugs (/students/22CSE001, /staff/john-doe) that no pattern can catch, so
-- the function returns only the TOP-LEVEL module key: the first segment of
-- usage_events.module, which the service-role writer fills for every
-- page_visit row from lib/middleware/url-module-mapper.ts (a MODULE_NAMES
-- value or a top-level slug; the insert is skipped when none maps). The app
-- has no top-level dynamic route, so a top-level key never names a record.
-- The client maps each key to its hub href from lib/navigation/modules.ts and
-- drops unknown keys; no href is ever built from this text.
--   * key must look like a module slug: ^[a-z][a-z0-9-]{0,39}$
--   * a module shows only when 3+ different people visited it in the window.
-- DROP first: the return columns changed while this file was unapplied.
DROP FUNCTION IF EXISTS public.fn_usage_trending_pages(integer, integer);
-- ci:allow-secdef-authenticated every signed-in user may see the top-level module keys + visit counts of their OWN institution (derived from auth.uid(), not a parameter), only for modules 3+ different people visited; no paths, user ids or metadata are returned. Replaces the per-row read TrendingPages.tsx made through the old open policy (b).
CREATE OR REPLACE FUNCTION public.fn_usage_trending_pages(p_days integer DEFAULT 7, p_limit integer DEFAULT 5)
RETURNS TABLE (module text, visit_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.module_key  AS module,
         count(*)      AS visit_count
    FROM (
      SELECT split_part(ue.module, '/', 1) AS module_key,
             ue.user_id
        FROM public.usage_events ue
       WHERE ue.event_type = 'page_visit'
         AND ue.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
         AND ue.created_at >= now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 90))
    ) v
   -- Live proof the slug filter drops no real traffic (read-only, 11 Oct 2026,
   -- page_visit, last 30 days): 350,837 rows, 100% with a slug-shaped top-level
   -- module key, 75 distinct keys (Bugs desk); W12 independently found every
   -- top-level key matches, 30 of the top 60 map in lib/navigation/modules.ts.
   WHERE v.module_key ~ '^[a-z][a-z0-9-]{0,39}$'
   GROUP BY v.module_key
  HAVING count(DISTINCT v.user_id) >= 3
   ORDER BY 2 DESC, 1
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_usage_trending_pages(integer, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_usage_trending_pages(integer, integer) TO authenticated;

-- Self-check: refuse to commit if the hole is still open.
DO $$
DECLARE
  v_bad int;
  v_check text;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'usage_events'
     AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[]);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'usage_events still has % PUBLIC/anon policy(ies)', v_bad;
  END IF;

  IF has_table_privilege('anon', 'public.usage_events', 'INSERT') THEN
    RAISE EXCEPTION 'anon still holds INSERT on usage_events';
  END IF;
  IF has_table_privilege('authenticated', 'public.usage_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.usage_events', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated still holds UPDATE/DELETE on usage_events';
  END IF;

  -- Exactly ONE INSERT policy, ours; a second permissive one would OR in.
  SELECT count(*) INTO v_bad
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'usage_events' AND cmd IN ('INSERT', 'ALL');
  SELECT with_check INTO v_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'usage_events' AND cmd = 'INSERT'
     AND policyname = 'usage_events_insert_own';
  IF v_bad <> 1 OR v_check IS NULL THEN
    RAISE EXCEPTION 'usage_events must have exactly one INSERT policy, usage_events_insert_own (found % INSERT/ALL policies)', v_bad;
  END IF;
  IF v_check NOT ILIKE '%auth.uid()%'
     OR v_check NOT ILIKE '%institution_id%'
     OR v_check NOT ILIKE '%event_type%'
     OR v_check NOT ILIKE '%search%' THEN
    RAISE EXCEPTION 'usage_events_insert_own must pin user_id = auth.uid(), event_type = ''search'' and institution_id (NULL or the caller''s own): %', v_check;
  END IF;
END $$;

COMMIT;
