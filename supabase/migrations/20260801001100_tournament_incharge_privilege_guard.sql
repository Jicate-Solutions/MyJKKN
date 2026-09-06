-- ─── Guard: in-charges must not escalate their own privileges ────────────────
-- 2026-07-10 (follow-up to 20260801001000_tournament_incharge_access.sql)
--
-- `events_incharge_update` lets an in-charge UPDATE their event row so they can
-- change status/dates/config.public_scoreboard. Without a guard, that same policy
-- also lets them rewrite config->'incharges' — appointing themselves more
-- in-charges, or evicting the manager who appointed them. Appointing in-charges
-- must stay restricted to sports.tournaments.manage holders.
--
-- NOTE this also closes a PRE-EXISTING hole: the long-standing `events_auth_update`
-- policy lets ANY authenticated user whose profiles.institution_id matches the
-- event update that row, so config->'incharges' was writable far more broadly
-- than by in-charges alone.
--
-- RLS WITH CHECK cannot compare OLD vs NEW, so the invariant is enforced by a
-- BEFORE UPDATE trigger with two tiers:
--   tier 1 — config->'incharges' (who controls the event): super admin or
--            sports.tournaments.manage ONLY.
--   tier 2 — institution_id / event_type / created_by (tenancy + ownership):
--            super admin, the admin/coordinator roles events_auth_update already
--            privileges, or a tournament manager. Deliberately looser than tier 1
--            so existing marathon/induction admin flows keep working.
-- Ordinary status/date/venue edits by an in-charge are untouched.
--
-- Verified 2026-07-10 against the live DB: an unprivileged user (is_super_admin=f,
-- sports.tournaments.manage=f) is blocked (42501) from editing config->'incharges'
-- and still allowed a benign venue_text edit.

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
    IF NOT (v_super OR v_tmanage) THEN
      RAISE EXCEPTION
        'Only sports.tournaments.manage holders may appoint or remove tournament in-charges (event %)', OLD.id
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
  'BEFORE UPDATE guard on events. Tier 1: only super admin / sports.tournaments.manage may change config->incharges (blocks per-event in-charges — and any same-institution user reachable via events_auth_update — from escalating privileges). Tier 2: only super admin / admin-coordinator roles / tournament managers may change institution_id, event_type or created_by. service_role (auth.uid() IS NULL) bypasses.';

DROP TRIGGER IF EXISTS trg_events_guard_privileged_fields ON public.events;
CREATE TRIGGER trg_events_guard_privileged_fields
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_event_privileged_fields();
