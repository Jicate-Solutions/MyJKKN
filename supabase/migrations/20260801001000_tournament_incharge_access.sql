-- ─── Tournament In-charge access model ───────────────────────────────────────
-- 2026-07-10 (applied via MCP as `tournament_incharge_access`)
-- Per-event "in-charge" users (MyJKKN profiles) get FULL control of their event
-- without holding sports.tournaments.* role permissions. In-charges are stored
-- in events.config->'incharges' as [{"member_id": "<auth uid>", "name": "..."}]
-- (same config-JSONB pattern as public_scoreboard). Committee members get
-- read access to tournament structure (divisions) + task updates; their
-- registration read access already exists (events_reg_committee_member_read).
--
-- API routes additionally call these helpers via RPC to extend their
-- user_has_permission() gates (manage-permission OR in-charge).

-- ── 1. fn_is_event_incharge(event) — is the caller an in-charge of this event? ──
CREATE OR REPLACE FUNCTION public.fn_is_event_incharge(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e,
         jsonb_array_elements(COALESCE(e.config->'incharges', '[]'::jsonb)) AS inc
    WHERE e.id = p_event_id
      AND inc->>'member_id' = auth.uid()::text
  );
$$;

-- Revoke from anon AND PUBLIC — revoking only one is a no-op in Supabase.
REVOKE EXECUTE ON FUNCTION public.fn_is_event_incharge(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_event_incharge(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_is_event_incharge(uuid) IS
  'True when auth.uid() is listed in events.config->incharges for the given event. SECURITY DEFINER so RLS policies and API gates can use it without events read access. Only reveals the caller''s own membership.';

-- ── 2. fn_is_event_committee_member(event) — lead/member of any committee? ──
CREATE OR REPLACE FUNCTION public.fn_is_event_committee_member(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_committees mc
    WHERE mc.event_id = p_event_id
      AND (
        mc.lead_id = auth.uid()
        OR auth.uid() = ANY(mc.member_ids)
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.full_name IS NOT NULL
            AND (p.full_name = mc.lead_name OR p.full_name = ANY(mc.member_names))
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_committee_member(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_is_event_committee_member(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_is_event_committee_member(uuid) IS
  'True when auth.uid() (or their profile full_name) is a lead/member of any committee of the given event. Same matching rules as the events_reg_committee_member_read policy. Only reveals the caller''s own membership.';

-- ── 3. events — in-charges may update their own event (status, config, dates) ──
DROP POLICY IF EXISTS "events_incharge_update" ON public.events;
CREATE POLICY "events_incharge_update" ON public.events
  FOR UPDATE TO authenticated
  USING (public.fn_is_event_incharge(id))
  WITH CHECK (public.fn_is_event_incharge(id));

-- ── 4. tournament_divisions — in-charge full CRUD; committee members read ──
DROP POLICY IF EXISTS "tournament_divisions_incharge_all" ON public.tournament_divisions;
CREATE POLICY "tournament_divisions_incharge_all" ON public.tournament_divisions
  FOR ALL TO authenticated
  USING (public.fn_is_event_incharge(event_id))
  WITH CHECK (public.fn_is_event_incharge(event_id));

DROP POLICY IF EXISTS "tournament_divisions_committee_read" ON public.tournament_divisions;
CREATE POLICY "tournament_divisions_committee_read" ON public.tournament_divisions
  FOR SELECT TO authenticated
  USING (public.fn_is_event_committee_member(event_id));
