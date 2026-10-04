-- =====================================================================
-- Events: nobody but an admin may make themselves an in-charge
-- =====================================================================
-- Created: 2026-10-02 — Bugs desk, follow-up to #4128 (W12 desk rule; the
-- Director's line is on his walk queue). HELD Draft.
--
-- #4128 lets only an event's in-charges (and admins) cancel it. Three ways
-- around that existed:
--   1. UPDATE: the event's creator, event_coordinator / admin roles,
--      events.logistics.manage and sports.tournaments.* holders could add
--      THEMSELVES to config->incharges (fn_guard_event_privileged_fields
--      tier 1), then cancel in a second write.
--   2. INSERT: the guard ran on UPDATE only, so a creator could name
--      themselves in-charge when creating the event.
--   3. Type switch: tier 2 lets event_coordinator / sports.tournaments.manage
--      change event_type; #4128 exempts tournaments, marathons and inductions,
--      so a general event could be switched to a marathon, cancelled, and
--      switched back. The reverse works too (W12 review, 2026-10-02): create
--      a sports_tournament (its creator is in-charge by #4127), switch it to
--      a general type, and cancel it as that in-charge. So the rule is
--      two-way: only an admin moves an event INTO or OUT OF those types.
--
-- This file:
--   - CREATE OR REPLACE fn_guard_event_privileged_fields from
--     20270207130000's body (verified equal to production via
--     pg_get_functiondef, 2026-10-02 10:35 IST) plus two blocks: no
--     self-appointment in tier 1, and the type-switch rule after tier 2.
--   - NEW BEFORE INSERT guard fn_guard_event_incharges_on_insert.
--     Exemption: a sports_tournament's own creator (Director 29 Sep, #4127 —
--     trg_events_tournament_creator_incharge adds them automatically).
--   - Admin = is_super_admin() OR is_admin(). service_role (auth.uid() IS
--     NULL) bypasses, as in every events guard.
--
-- Live impact (read-only, 2026-10-02): in the last 120 days 14 of 49
-- non-tournament events had their creator as their own in-charge. After this,
-- those creators must ask an admin to add them.
-- No BEGIN/COMMIT of its own: the operator's apply wraps it.
-- =====================================================================

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

    -- No self-appointment (2026-10-02): only an admin may put themselves on an
    -- event's roster. Removing yourself, or adding others, is unaffected.
    -- A tournament's own creator may re-add themselves (#4127: the creator IS
    -- its in-charge), as the INSERT guard below allows.
    IF NOT (OLD.event_type = 'sports_tournament'
            AND OLD.created_by IS NOT NULL AND OLD.created_by = auth.uid())
       AND EXISTS (
         SELECT 1
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.config->'incharges') = 'array'
                                          THEN NEW.config->'incharges' ELSE '[]'::jsonb END) n
          WHERE n->>'member_id' = auth.uid()::text)
       AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(OLD.config->'incharges') = 'array'
                                          THEN OLD.config->'incharges' ELSE '[]'::jsonb END) o
          WHERE o->>'member_id' = auth.uid()::text)
       AND NOT (COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false))
    THEN
      RAISE EXCEPTION
        'You cannot make yourself an in-charge of event %; ask an admin to add you', OLD.id
        USING ERRCODE = '42501';
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

  -- Type-switch trick (2026-10-02): trg_events_cancel_incharge_or_admin exempts
  -- sports_tournament / marathon / induction (they have their own stop paths).
  -- INTO: a general event switched to a marathon could be cancelled by a
  -- non-in-charge and switched back. OUT OF: a tournament's creator is its
  -- in-charge (#4127), so creating one and switching it to a general type
  -- makes a self-appointed in-charge who can cancel. Both need an admin.
  IF NEW.event_type IS DISTINCT FROM OLD.event_type
     AND (NEW.event_type IN ('sports_tournament', 'marathon', 'induction')
          OR COALESCE(OLD.event_type, '') IN ('sports_tournament', 'marathon', 'induction'))
     AND NOT (COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false))
  THEN
    RAISE EXCEPTION
      'Only an admin may move event % into or out of a tournament, marathon or induction', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_guard_event_privileged_fields() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_event_privileged_fields() IS
  'BEFORE UPDATE guard on events. Tier 1 (config->incharges): sports_tournament rows accept super admin, sports.tournaments.manage / .edit holders and the event creator; every other type accepts super admin, sports.tournaments.manage, admin/coordinator roles, the creator and events.logistics.manage holders. A per-event in-charge alone cannot. Nobody but an admin (is_super_admin / is_admin) may ADD THEMSELVES, except a sports_tournament''s own creator (2026-10-02). Tier 2: only super admin / admin-coordinator roles / tournament managers may change institution_id, event_type or created_by; only an admin may move an event into or out of tournament, marathon or induction (2026-10-02). service_role (auth.uid() IS NULL) bypasses.';

-- ── INSERT: the same rule at creation ──
CREATE OR REPLACE FUNCTION public.fn_guard_event_incharges_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Director 29 Sep (#4127): a tournament's creator IS its in-charge.
  IF NEW.event_type = 'sports_tournament' AND NEW.created_by = auth.uid() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
       SELECT 1
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.config->'incharges') = 'array'
                                        THEN NEW.config->'incharges' ELSE '[]'::jsonb END) n
        WHERE n->>'member_id' = auth.uid()::text)
     AND NOT (COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false))
  THEN
    RAISE EXCEPTION
      'You cannot make yourself an in-charge of a new event; ask an admin to add you'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_guard_event_incharges_on_insert() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_event_incharges_on_insert() IS
  'BEFORE INSERT guard on events (2026-10-02): a non-admin cannot list themselves in config->incharges of a new event. Exempt: a sports_tournament''s own creator (#4127). service_role (auth.uid() IS NULL) bypasses.';

DROP TRIGGER IF EXISTS trg_events_guard_incharges_on_insert ON public.events;
CREATE TRIGGER trg_events_guard_incharges_on_insert
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_event_incharges_on_insert();

-- Assert the end state.
DO $no_self_incharge_assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.events'::regclass
                    AND tgname = 'trg_events_guard_incharges_on_insert') THEN
    RAISE EXCEPTION 'insert guard missing';
  END IF;
  IF has_function_privilege('anon', 'public.fn_guard_event_incharges_on_insert()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_guard_event_privileged_fields()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute an events guard';
  END IF;
  IF position('You cannot make yourself an in-charge' IN
              pg_get_functiondef('public.fn_guard_event_privileged_fields()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'update guard lacks the self-appointment rule';
  END IF;
END
$no_self_incharge_assert$;
