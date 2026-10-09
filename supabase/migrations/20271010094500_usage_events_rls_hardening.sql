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
--     Satisfied by the new own-row INSERT policy.
--
-- READERS UNDER RLS: only components/CommandPalette/TrendingPages.tsx, which
-- relied on (b). It now calls fn_usage_trending_pages() below: page paths and
-- counts for the caller's own institution, no user ids.
-- Every other reader is SECURITY DEFINER (fn_adoption_sync_usage_events[_core],
-- fn_cac_measured_metrics) or service role (app/api/cron/usage-rollup) — the
-- table owner bypasses RLS, so they are unaffected. Do NOT add FORCE RLS.
-- ============================================================================

BEGIN;

-- (a) blind INSERT → own-row INSERT for signed-in users only
DROP POLICY IF EXISTS "Service role can insert usage_events" ON public.usage_events;
DROP POLICY IF EXISTS "usage_events_insert_own" ON public.usage_events;
CREATE POLICY "usage_events_insert_own" ON public.usage_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

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

-- Trending pages for the command palette — aggregate only, caller's own
-- institution, no user ids.
-- ci:allow-secdef-authenticated every signed-in user may see the top page paths + visit counts of their OWN institution (derived from auth.uid(), not a parameter); no user ids or metadata are returned. Replaces the per-row read TrendingPages.tsx made through the old open policy (b).
CREATE OR REPLACE FUNCTION public.fn_usage_trending_pages(p_days integer DEFAULT 7, p_limit integer DEFAULT 5)
RETURNS TABLE (module text, page_path text, visit_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT min(ue.module)                                              AS module,
         COALESCE(ue.metadata->>'page_path', '/' || ue.module)      AS page_path,
         count(*)                                                    AS visit_count
    FROM public.usage_events ue
   WHERE ue.event_type = 'page_visit'
     AND ue.institution_id = (SELECT p.institution_id FROM public.profiles p WHERE p.id = auth.uid())
     AND ue.created_at >= now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 90))
   GROUP BY 2
   ORDER BY 3 DESC, 2
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

  SELECT string_agg(with_check, ' ') INTO v_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'usage_events' AND cmd = 'INSERT';
  IF v_check IS NULL OR v_check NOT ILIKE '%auth.uid()%' THEN
    RAISE EXCEPTION 'usage_events INSERT policy does not pin user_id to auth.uid(): %', v_check;
  END IF;
END $$;

COMMIT;
