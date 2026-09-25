-- ─── Tournament in-charge roster: let tournament editors and the creator correct it ─
-- 2026-09-25 (revises tier 1 of 20260801001100_tournament_incharge_privilege_guard.sql)
--
-- Reported: on a tournament's Details page the "Tournament In-charge" chips could
-- not be removed or corrected by the COO or other event staff — a wrongly
-- appointed or rejected in-charge stayed on the event. Tier 1 of
-- fn_guard_event_privileged_fields let ONLY super admin / sports.tournaments.manage
-- change config->'incharges', and useTournamentAccess.canAssignIncharge mirrored
-- that, so everyone else neither saw the × / Add In-charge controls nor could
-- save a change.
--
-- Tier 1 now also admits:
--   * sports.tournaments.edit holders ("Edit Sports Tournaments") — granted from
--     Role Management, so the COO (or any role) gets the fix without code;
--   * the event's creator (OLD.created_by) — they set the roster up originally.
-- Still NOT admitted: a per-event in-charge who holds neither — the escalation
-- the original guard exists to stop (an in-charge appointing more in-charges or
-- evicting whoever appointed them). Tier 2 is unchanged.
--
-- Second blocker, fixed in part 2: the trigger is only reached if RLS lets the
-- UPDATE touch the row, and `events` UPDATE was admitted only by
-- events_auth_update (super admin / creator / same-institution when created_by
-- IS NULL) and events_incharge_update (the in-charges). A tournament editor who
-- neither created the event nor is its in-charge — the COO, whose
-- institution_scope='all' role has no profiles.institution_id — matched no
-- policy, so the save touched 0 rows. events_tournament_editor_update admits
-- sports.tournaments.edit / .manage holders on sports_tournament rows of an
-- institution their role reaches (role_has_institution_access). Other event
-- types are untouched.

-- ── part 2: RLS — tournament editors may UPDATE tournament rows ──
DROP POLICY IF EXISTS events_tournament_editor_update ON public.events;

CREATE POLICY events_tournament_editor_update ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    event_type = 'sports_tournament'
    AND (
      (SELECT public.user_has_permission('sports.tournaments.edit'))
      OR (SELECT public.user_has_permission('sports.tournaments.manage'))
    )
    AND public.role_has_institution_access(institution_id)
  )
  WITH CHECK (
    event_type = 'sports_tournament'
    AND (
      (SELECT public.user_has_permission('sports.tournaments.edit'))
      OR (SELECT public.user_has_permission('sports.tournaments.manage'))
    )
    AND public.role_has_institution_access(institution_id)
  );

COMMENT ON POLICY events_tournament_editor_update ON public.events IS
  'Holders of sports.tournaments.edit / sports.tournaments.manage may update sports_tournament events in institutions their role reaches (e.g. the COO correcting the in-charge roster). Privileged columns stay behind trg_events_guard_privileged_fields.';

-- ── part 1: trigger — who may change config->incharges ──

CREATE OR REPLACE FUNCTION public.fn_guard_event_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_super       boolean;
  v_tmanage     boolean;
  v_admin_role  boolean;
BEGIN
  -- Trusted backend paths (service_role / migrations / cron) have no auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── tier 1: the in-charge roster ──
  IF COALESCE(NEW.config->'incharges', '[]'::jsonb)
       IS DISTINCT FROM COALESCE(OLD.config->'incharges', '[]'::jsonb)
  THEN
    v_super   := COALESCE(public.is_super_admin(), false);
    v_tmanage := COALESCE(public.user_has_permission('sports.tournaments.manage'), false);
    IF NOT (
      v_super
      OR v_tmanage
      OR COALESCE(public.user_has_permission('sports.tournaments.edit'), false)
      OR (OLD.created_by IS NOT NULL AND OLD.created_by = auth.uid())
    ) THEN
      RAISE EXCEPTION
        'Only the event creator or holders of sports.tournaments.edit / sports.tournaments.manage may appoint or remove tournament in-charges (event %)', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── tier 2: tenancy / ownership columns ──
  IF NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.event_type  IS DISTINCT FROM OLD.event_type
     OR NEW.created_by  IS DISTINCT FROM OLD.created_by
  THEN
    v_super      := COALESCE(v_super, public.is_super_admin(), false);
    v_admin_role := public.get_current_user_role() = ANY (
                      ARRAY['super_admin','admin','administrator','event_coordinator']
                    );
    v_tmanage    := COALESCE(v_tmanage,
                             public.user_has_permission('sports.tournaments.manage'), false);
    IF NOT (COALESCE(v_super, false) OR COALESCE(v_admin_role, false) OR COALESCE(v_tmanage, false)) THEN
      RAISE EXCEPTION
        'You may not change the institution, event type or owner of event %', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_event_privileged_fields() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_event_privileged_fields() IS
  'BEFORE UPDATE guard on events. Tier 1: only super admin, sports.tournaments.manage / sports.tournaments.edit holders, or the event creator may change config->incharges (a per-event in-charge alone cannot — blocks privilege escalation). Tier 2: only super admin / admin-coordinator roles / tournament managers may change institution_id, event_type or created_by. service_role (auth.uid() IS NULL) bypasses.';

NOTIFY pgrst, 'reload schema';
