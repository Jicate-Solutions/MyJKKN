-- ============================================================================
-- fn_guard_event_privileged_fields — tier 1 (in-charge roster) becomes
-- event-type aware
-- ----------------------------------------------------------------------------
-- SYMPTOM (2026-09-22): editing a LECTURE on /events (edit dialog, People →
-- Add in-charge) failed with
--   "Only sports.tournaments.manage holders may appoint or remove tournament
--    in-charges (event e3afc542-…)".
-- The event is event_type = 'lecture'. The creator (a staff_counselor) does not
-- hold a SPORTS permission and should not need one to appoint in-charges on
-- their own lecture.
--
-- CAUSE: 20260801001100 fires the guard on EVERY events UPDATE and, in tier 1,
-- accepts only super admin or sports.tournaments.manage — the tournament rule
-- applied to every event type. INSERT is not guarded, so /events/create with
-- in-charges works for the same person, and only the later edit is refused.
--
-- FIX: keep the tournament rule exactly as it was for sports_tournament rows.
-- For every other event type, accept in addition:
--   • the event's creator (created_by = auth.uid()),
--   • the admin / coordinator roles events_auth_update already privileges,
--   • holders of events.logistics.manage (the events-module manage grant).
-- The original hole stays closed: a per-event in-charge who is none of the
-- above still cannot appoint or evict in-charges through events_incharge_update.
-- Tier 2 (institution_id / event_type / created_by) is unchanged.
-- ============================================================================

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
      -- Unchanged: tournaments are controlled by the sports permission only.
      v_allowed := v_super OR v_tmanage;
      IF NOT v_allowed THEN
        RAISE EXCEPTION
          'Only sports.tournaments.manage holders may appoint or remove tournament in-charges (event %)', OLD.id
          USING ERRCODE = '42501';
      END IF;
    ELSE
      v_admin_role := COALESCE(public.get_current_user_role() = ANY (
                        ARRAY['super_admin','admin','administrator','event_coordinator']
                      ), false);
      v_allowed := v_super
                OR v_tmanage
                OR v_admin_role
                OR OLD.created_by = auth.uid()
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
  'BEFORE UPDATE guard on events. Tier 1 (config->incharges): sports_tournament rows need super admin / sports.tournaments.manage; every other event type also accepts the creator, admin/coordinator roles and events.logistics.manage holders. Tier 2: only super admin / admin-coordinator roles / tournament managers may change institution_id, event_type or created_by. service_role (auth.uid() IS NULL) bypasses.';
