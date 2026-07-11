-- ─── Tournament role-based access helpers ────────────────────────────────────
-- 2026-07-10 (applied via MCP as `tournament_role_access_helpers`)
-- The /events/tournament subtree is gated by RoutePermissionGuard on the route's
-- declared key (sports.tournaments.view). An appointed in-charge, a committee
-- member, or a checked-in volunteer may hold NO such key — they were blocked at
-- the route guard before any per-event authorization ran. These helpers back the
-- guard's `fallbackCheck` seam (same pattern as induction's is_event_coordinator)
-- and extend canViewTournament() server-side.
--
-- All are SECURITY DEFINER but self-authorizing: auth.uid() is hard-coded inside,
-- so no argument can reveal another user's membership.

CREATE OR REPLACE FUNCTION public.fn_is_event_volunteer(p_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_volunteer_checkins v
    WHERE v.event_id = p_event_id AND v.member_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_volunteer(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_event_volunteer(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_is_event_volunteer(uuid) IS
  'True when auth.uid() is a volunteer (event_volunteer_checkins.member_id) of the given event. Self-authorizing: only reveals the caller''s own membership.';

-- Backs RoutePermissionGuard.fallbackCheck for /events/tournament. Entering the
-- module leaks nothing: every page/API still authorizes per event.
CREATE OR REPLACE FUNCTION public.fn_has_any_tournament_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.event_type = 'sports_tournament'
      AND (
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(e.config->'incharges', '[]'::jsonb)) AS inc
          WHERE inc->>'member_id' = auth.uid()::text
        )
        OR EXISTS (
          SELECT 1 FROM public.event_committees mc
          WHERE mc.event_id = e.id
            AND (
              mc.lead_id = auth.uid()
              OR auth.uid() = ANY(mc.member_ids)
              OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid() AND p.full_name IS NOT NULL
                  AND (p.full_name = mc.lead_name OR p.full_name = ANY(mc.member_names))
              )
            )
        )
        OR EXISTS (
          SELECT 1 FROM public.event_volunteer_checkins v
          WHERE v.event_id = e.id AND v.member_id = auth.uid()
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_has_any_tournament_role() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_has_any_tournament_role() TO authenticated;

COMMENT ON FUNCTION public.fn_has_any_tournament_role() IS
  'True when auth.uid() is an in-charge, committee lead/member, or checked-in volunteer of ANY sports_tournament event. Backs RoutePermissionGuard.fallbackCheck so those users can enter the module UI without a sports.tournaments.* key; per-event authorization still applies on every page and API.';
