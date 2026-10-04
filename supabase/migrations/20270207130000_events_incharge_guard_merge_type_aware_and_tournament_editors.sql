-- ─── fn_guard_event_privileged_fields — merge two concurrent tier-1 fixes ─────
-- 2026-09-25
--
-- Two migrations rewrote this function independently, each with CREATE OR
-- REPLACE of the whole body, so whichever ran last silently dropped the other:
--
--   20260922110000_events_incharge_guard_type_aware.sql (main)
--     non-tournament events: also the creator, admin/coordinator roles and
--     events.logistics.manage holders may change the in-charge roster
--     (lecture creators were being refused).
--
--   20270207094731_tournament_incharge_roster_editable_by_edit_and_creator.sql
--     tournaments: also sports.tournaments.edit holders and the creator
--     (BUG-006177 — the COO could not correct a tournament's in-charges).
--
-- 20270207094731 was applied after 20260922110000 and so reverted the
-- non-tournament rule. This body is the union of both:
--
--   sports_tournament : super admin, sports.tournaments.manage,
--                       sports.tournaments.edit, the event creator
--   every other type  : super admin, sports.tournaments.manage, admin /
--                       administrator / event_coordinator / super_admin role,
--                       the event creator, events.logistics.manage
--
-- A per-event in-charge who is none of the above still cannot appoint or evict
-- in-charges. Tier 2 is unchanged.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

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
  v_allowed     boolean;
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

    IF OLD.event_type = 'sports_tournament' THEN
      v_allowed := v_super
                OR v_tmanage
                OR COALESCE(public.user_has_permission('sports.tournaments.edit'), false)
                OR (OLD.created_by IS NOT NULL AND OLD.created_by = auth.uid());
      IF NOT v_allowed THEN
        RAISE EXCEPTION
          'Only the event creator or holders of sports.tournaments.edit / sports.tournaments.manage may appoint or remove tournament in-charges (event %)', OLD.id
          USING ERRCODE = '42501';
      END IF;
    ELSE
      v_admin_role := COALESCE(public.get_current_user_role() = ANY (
                        ARRAY['super_admin','admin','administrator','event_coordinator']
                      ), false);
      v_allowed := v_super
                OR v_tmanage
                OR v_admin_role
                OR (OLD.created_by IS NOT NULL AND OLD.created_by = auth.uid())
                OR COALESCE(public.user_has_permission('events.logistics.manage'), false);
      IF NOT v_allowed THEN
        RAISE EXCEPTION
          'Only the event''s creator, an events administrator or an events.logistics.manage holder may appoint or remove in-charges (event %)', OLD.id
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- ── tier 2: tenancy / ownership columns (unchanged) ──
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
  'BEFORE UPDATE guard on events. Tier 1 (config->incharges): sports_tournament rows accept super admin, sports.tournaments.manage / .edit holders and the event creator; every other type accepts super admin, sports.tournaments.manage, admin/coordinator roles, the creator and events.logistics.manage holders. A per-event in-charge alone cannot. Tier 2: only super admin / admin-coordinator roles / tournament managers may change institution_id, event_type or created_by. service_role (auth.uid() IS NULL) bypasses.';
