-- =====================================================================
-- Grievance: route on create, escalate on breach (HOD -> Principal -> Director)
-- Date: 2026-09-28
--
-- WHY (production, read 2026-09-28 08:10 IST):
--   * grievance_tickets: 9 ever filed, 8 open, 6 past sla_deadline, and
--     escalation_level = 0 on every one. assigned_to is NULL on all 8 open
--     tickets: nothing ever read grievance_categories.default_assignee_role,
--     although the new-ticket form tells the filer "Auto-assignee: <role>".
--     Every create path (Learners Council, Insta Solver, /accreditation form,
--     b2a) inserts with no assignee.
--   * The hourly cron /api/cron/grievance-sla-breach-check only stamped
--     sla_breached_at. It told nobody and never raised escalation_level.
--   * fn_generate_unresolved_issue_items linked every work item to
--     /grievances/<id>, a page that does not exist. The ticket page is
--     /accreditation/naac/grievance/<id>.
--
-- THE POLICY (every rule lives here, in the database; the route adds none):
--   Chain position   1 = HOD, 2 = Principal, 3 = Director. Level 3 is the ceiling.
--   On create        a ticket with no assignee goes to its category's
--                    default_assignee_role: 'hod' -> the HOD (else the
--                    Principal); 'principal' -> the Principal; 'admin' (or
--                    anything else) -> the college's single admin-role profile
--                    (else the Principal). The person is told by an in-app
--                    notice. escalation_level stays 0 (not escalated); the
--                    chain position the handler sits at is recorded in
--                    metadata.auto_route.level so escalation starts ABOVE it.
--   On breach        when the current level's deadline passes (level 0:
--                    sla_deadline; level >= 1: escalation_deadline), the ticket
--                    moves to the lowest chain level ABOVE both escalation_level
--                    and the create-time handler's level that has a usable
--                    person: assigned_to = that person, escalation_level = that
--                    level, escalated_at = now, escalation_deadline = now +
--                    grievance.escalation.level<N>_hours, one in-app notice.
--                    At most one level per breach. Levels with nobody are
--                    skipped and the reason is written into the event.
--   Never            resolved / closed / withdrawn tickets; anything above 3.
--   Switch           grievance.escalation.enabled (per college via scope).
--                    Off = no escalation. Breach stamping (what the route
--                    always did) continues regardless.
--   Sensitive        is_icc_only, is_anonymous, and complaints about the
--                    filer's own superior (Insta Solver I8) are NEVER routed
--                    or escalated to a HOD or Principal: they are not
--                    auto-routed on create, and on breach they go straight to
--                    level 3 — for ICC-only, the active ICC committee chair of
--                    the college if one exists, else the Director level.
--   Never to         the person who filed or raised the ticket; an inactive or
--                    login-disabled profile; a test / placeholder profile.
--   Nobody usable    at every level above: the ticket is NOT moved, the reasons
--                    are written ONCE to metadata.escalation_blocked, and the
--                    run's answer counts it as skipped_no_target every hour
--                    until someone fixes the data — never silent.
--   A failed notice  never undoes an escalation or stops the run: it is
--                    written on the event (notify_error) and counted as
--                    notify_failed in the run's answer.
--
-- Rehearsal: supabase/tests/grievance/run.sh (local Postgres).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Two columns: when the ticket last moved up, and that level's own deadline
-- ---------------------------------------------------------------------
-- sla_deadline / sla_breached_at are left alone on purpose: they are the
-- original SLA, the NAAC record, and update_grievance_sla_status recomputes
-- sla_status from sla_deadline on every UPDATE.
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS escalated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_deadline timestamptz;

COMMENT ON COLUMN public.grievance_tickets.escalated_at IS
  'When fn_grievance_escalation_tick last moved this ticket up the chain (HOD -> Principal -> Director). NULL = never escalated.';
COMMENT ON COLUMN public.grievance_tickets.escalation_deadline IS
  'The deadline of the CURRENT escalation level (now + grievance.escalation.level<N>_hours when it moved up). Passing it moves the ticket up one more level. sla_deadline stays the original SLA.';

-- ---------------------------------------------------------------------
-- 2) Policies (seeded once; never overwrite a value someone has set)
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT 'grievance.escalation.enabled', 'global', NULL, to_jsonb(true),
  'Master switch for automatic grievance escalation. On: a complaint that passes its deadline unresolved moves up one level (HOD, then Principal, then Director), is reassigned to that person, who gets an in-app notice and a new deadline. Off: nothing is escalated (overdue tickets are still marked breached). Can be set per college.',
  'boolean', 'major', 'accreditation', true, true, 'published'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies
                   WHERE policy_key = 'grievance.escalation.enabled' AND scope_type = 'global' AND scope_id IS NULL);

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT v.k, 'global', NULL, to_jsonb(v.h), v.d, 'number', 'major', 'accreditation', true, true, 'published'
FROM (VALUES
  ('grievance.escalation.level1_hours', 48,
   'Hours the HOD has to act on a grievance escalated to them before it moves up to the Principal. Clock hours from the moment of escalation.'),
  ('grievance.escalation.level2_hours', 48,
   'Hours the Principal has to act on a grievance escalated to them before it moves up to the Director level. Clock hours from the moment of escalation.'),
  ('grievance.escalation.level3_hours', 72,
   'Hours the Director level has to act on an escalated grievance. Level 3 is the top: when this passes the ticket stays with the Director level and is shown as overdue; nothing moves further.')
) AS v(k, h, d)
WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies p
                   WHERE p.policy_key = v.k AND p.scope_type = 'global' AND p.scope_id IS NULL);

-- The Director level is a named person, not "the oldest super admin": the
-- existing dashboard fallback (fn_resolve_dashboard_target) returns the oldest
-- active super admin platform-wide, which is not the Director, and an ICC or
-- anonymous complaint must never land on the wrong desk by accident. Seeded
-- from the person the Director already chose to receive complaints that go
-- past the chain (instasolver.complaint.superior_route_to). If that row is
-- absent nothing is seeded, and level 3 reports "no Director set" instead.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT 'grievance.escalation.director_profile_id', 'global', NULL, src.value,
  'The profile id of the person who receives grievances escalated to the Director level (level 3), and every ICC-only, anonymous or about-my-superior complaint once it is overdue. Can be set per college. Empty or pointing at an inactive or test profile = the Director level is treated as empty and the escalation run reports it.',
  'string', 'major', 'accreditation', true, true, 'published'
FROM public.platform_policies src
WHERE src.policy_key = 'instasolver.complaint.superior_route_to'
  AND src.scope_type = 'global' AND src.scope_id IS NULL AND src.is_active
  AND NOT EXISTS (SELECT 1 FROM public.platform_policies p
                   WHERE p.policy_key = 'grievance.escalation.director_profile_id'
                     AND p.scope_type = 'global' AND p.scope_id IS NULL)
LIMIT 1;

-- ---------------------------------------------------------------------
-- 3) Who is a test / placeholder profile
-- ---------------------------------------------------------------------
-- Production has no is_test flag. Read 2026-09-28: 46 profiles match the rule
-- below and every one is a test account ("TEST PRINCIPAL", "Test Super Admin",
-- "TEST HOD", test33@ / testing420@ that carry real-looking names, *.local
-- addresses). No real Principal, HOD or super admin matches it.
CREATE OR REPLACE FUNCTION public.fn_grievance_is_placeholder_profile(p_full_name text, p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_full_name, '') ~* '\mtest'                          -- a name word starting with "test"
      OR split_part(lower(COALESCE(p_email, '')), '@', 1) LIKE 'test%'  -- test.hod@, testprincipal@, test33@
      OR lower(COALESCE(p_email, '')) LIKE '%.local'                   -- fresh-admin-…@test.local
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_is_placeholder_profile(text, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_is_placeholder_profile(text, text) TO service_role;

-- NULL = usable; otherwise why not.
CREATE OR REPLACE FUNCTION public.fn_grievance_profile_unusable(p_profile_id uuid, p_exclude uuid[] DEFAULT '{}'::uuid[])
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_profile_id IS NULL                              THEN 'nobody'
    WHEN p_profile_id = ANY (COALESCE(p_exclude, '{}'))    THEN 'filed_this_ticket'
    WHEN p.id IS NULL                                      THEN 'profile_missing'
    WHEN NOT COALESCE(p.is_active, true)                   THEN 'inactive'
    WHEN COALESCE(p.is_login_disabled, false)              THEN 'login_disabled'
    WHEN public.fn_grievance_is_placeholder_profile(p.full_name, p.email) THEN 'test_or_placeholder'
    ELSE NULL
  END
  FROM (SELECT 1) AS one
  LEFT JOIN public.profiles p ON p.id = p_profile_id
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_profile_unusable(uuid, uuid[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_profile_unusable(uuid, uuid[]) TO service_role;

-- ---------------------------------------------------------------------
-- 4) Which tickets skip the HOD and Principal
-- ---------------------------------------------------------------------
-- about_superior: the Insta Solver route marks it (metadata.about_superior,
-- and routing = 'superior_bypass' or route_pending_policy on older rows).
CREATE OR REPLACE FUNCTION public.fn_grievance_sensitive_reason(p_t public.grievance_tickets)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_t.is_icc_only, false)  THEN 'icc_only'
    WHEN COALESCE(p_t.is_anonymous, false) THEN 'anonymous'
    WHEN COALESCE(p_t.metadata ->> 'about_superior', '') = 'true'
      OR COALESCE(p_t.metadata ->> 'routing', '') = 'superior_bypass'
      OR COALESCE(p_t.metadata ? 'route_pending_policy', false)
                                           THEN 'about_superior'
    ELSE NULL
  END
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_sensitive_reason(public.grievance_tickets) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_sensitive_reason(public.grievance_tickets) TO service_role;

-- ---------------------------------------------------------------------
-- 5) The person at one chain level for one ticket
-- ---------------------------------------------------------------------
-- Returns {level, role, to, via, reason}: `to` is a usable profile id, or NULL
-- with `reason` saying why the level is empty. Level 0 is the college admin
-- (create-time routing only). A level with MORE than one candidate and no
-- designated person is EMPTY ("more_than_one_…"): the run never picks one of
-- several people at random — set departments.head_of_department_id to fix it.
CREATE OR REPLACE FUNCTION public.fn_grievance_level_target(p_t public.grievance_tickets, p_level integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      text := CASE p_level WHEN 0 THEN 'admin' WHEN 1 THEN 'hod' WHEN 2 THEN 'principal' WHEN 3 THEN 'director' END;
  v_exclude   uuid[] := array_remove(ARRAY[p_t.raised_by_id, p_t.filed_by], NULL);
  v_sensitive text := public.fn_grievance_sensitive_reason(p_t);
  v_dept      uuid;
  v_head      uuid;
  v_why       text;
  v_note      text := '';
  v_ids       uuid[];
  v_all       integer := 0;
  v_raw       jsonb;
  v_to        uuid;
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('level', p_level, 'role', NULL, 'to', NULL, 'reason', 'no_such_level');
  END IF;

  IF v_sensitive IS NOT NULL AND p_level < 3 THEN
    RETURN jsonb_build_object('level', p_level, 'role', v_role, 'to', NULL,
                              'reason', v_sensitive || '_skips_' || v_role);
  END IF;

  IF p_level = 3 THEN
    -- ICC-only: the college's active ICC committee chair, when there is one.
    IF COALESCE(p_t.is_icc_only, false) THEN
      SELECT ac.chair_user_id INTO v_head
      FROM public.accreditation_committees ac
      WHERE ac.institution_id = p_t.institution_id
        AND ac.committee_type = 'icc' AND ac.is_active
        AND ac.chair_user_id IS NOT NULL
      ORDER BY ac.formed_at DESC
      LIMIT 1;
      v_why := public.fn_grievance_profile_unusable(v_head, v_exclude);
      IF v_why IS NULL THEN
        RETURN jsonb_build_object('level', 3, 'role', 'director', 'to', v_head, 'via', 'icc_chair', 'reason', NULL);
      END IF;
      v_note := 'icc_chair_' || v_why || '; ';
    END IF;

    v_raw := public.fn_get_policy('grievance.escalation.director_profile_id', p_t.institution_id);
    BEGIN
      v_to := CASE WHEN jsonb_typeof(v_raw) = 'string' THEN (v_raw #>> '{}')::uuid
                   WHEN jsonb_typeof(v_raw) = 'object' THEN COALESCE(v_raw ->> 'profile_id', v_raw ->> 'id')::uuid
                   ELSE NULL END;
    EXCEPTION WHEN invalid_text_representation THEN
      v_to := NULL;
    END;
    IF v_to IS NULL THEN
      RETURN jsonb_build_object('level', 3, 'role', 'director', 'to', NULL,
        'reason', v_note || 'no_director_set (policy grievance.escalation.director_profile_id)');
    END IF;
    v_why := public.fn_grievance_profile_unusable(v_to, v_exclude);
    IF v_why IS NULL THEN
      RETURN jsonb_build_object('level', 3, 'role', 'director', 'to', v_to, 'via', 'director_policy', 'reason', NULL);
    END IF;
    RETURN jsonb_build_object('level', 3, 'role', 'director', 'to', NULL, 'reason', v_note || 'director_' || v_why);
  END IF;

  IF p_level = 1 THEN
    v_dept := COALESCE(p_t.department_id,
                       (SELECT pr.department_id FROM public.profiles pr WHERE pr.id = p_t.raised_by_id));
    IF v_dept IS NULL THEN
      RETURN jsonb_build_object('level', 1, 'role', 'hod', 'to', NULL, 'reason', 'no_department');
    END IF;

    -- The designated head first (the campus-walk precedent) ...
    SELECT d.head_of_department_id INTO v_head FROM public.departments d WHERE d.id = v_dept;
    IF v_head IS NOT NULL THEN
      v_why := public.fn_grievance_profile_unusable(v_head, v_exclude);
      IF v_why IS NULL THEN
        RETURN jsonb_build_object('level', 1, 'role', 'hod', 'to', v_head, 'via', 'department_head', 'reason', NULL);
      END IF;
      v_note := 'department_head_' || v_why || '; ';
    END IF;

    -- ... else the one HOD-role holder in that department.
    SELECT array_agg(p.id ORDER BY p.id) FILTER (WHERE public.fn_grievance_profile_unusable(p.id, v_exclude) IS NULL),
           count(*)
      INTO v_ids, v_all
    FROM public.profiles p
    WHERE p.department_id = v_dept
      AND (p.role = 'hod' OR EXISTS (
            SELECT 1 FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p.id AND cr.role_key = 'hod' AND COALESCE(cr.is_active, true)));
  ELSE
    -- level 0 (college admin) or 2 (Principal): the one holder in the college
    SELECT array_agg(p.id ORDER BY p.id) FILTER (WHERE public.fn_grievance_profile_unusable(p.id, v_exclude) IS NULL),
           count(*)
      INTO v_ids, v_all
    FROM public.profiles p
    WHERE p.institution_id = p_t.institution_id
      AND (p.role = v_role OR EXISTS (
            SELECT 1 FROM public.user_roles ur JOIN public.custom_roles cr ON cr.id = ur.role_id
            WHERE ur.user_id = p.id AND cr.role_key = v_role AND COALESCE(cr.is_active, true)));
  END IF;

  IF COALESCE(array_length(v_ids, 1), 0) = 1 THEN
    RETURN jsonb_build_object('level', p_level, 'role', v_role, 'to', v_ids[1], 'via', 'only_' || v_role, 'reason', NULL);
  END IF;
  IF COALESCE(array_length(v_ids, 1), 0) > 1 THEN
    RETURN jsonb_build_object('level', p_level, 'role', v_role, 'to', NULL,
      'reason', v_note || 'more_than_one_' || v_role || ':' || array_length(v_ids, 1));
  END IF;
  RETURN jsonb_build_object('level', p_level, 'role', v_role, 'to', NULL,
    'reason', v_note || 'no_usable_' || v_role ||
      CASE WHEN v_all > 0 THEN ' (' || v_all || ' found: test, inactive or the filer)' ELSE '' END);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_level_target(public.grievance_tickets, integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_level_target(public.grievance_tickets, integer) TO service_role;

-- ---------------------------------------------------------------------
-- 6) One in-app notice (the existing notifications + user_notifications pair)
-- ---------------------------------------------------------------------
-- created_by = the recipient: notifications.created_by is NOT NULL and a
-- machine has no profile; lib/campus-walk/chase-up.ts does the same.
-- The body never carries the filer's name. Idempotent on p_key.
CREATE OR REPLACE FUNCTION public.fn_grievance_notify(
  p_t        public.grievance_tickets,
  p_to       uuid,
  p_kind     text,          -- 'assigned' | 'escalated'
  p_level    integer,
  p_deadline timestamptz,
  p_key      text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nid   uuid;
  v_title text;
  v_body  text;
  v_when  text := COALESCE(to_char(p_deadline AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH24:MI') || ' IST', 'as soon as you can');
BEGIN
  IF p_to IS NULL THEN RETURN NULL; END IF;

  IF p_kind = 'escalated' THEN
    v_title := 'Overdue complaint ' || p_t.ticket_number || ' has moved up to you';
    v_body  := '"' || left(p_t.subject, 120) || '" passed its deadline without being resolved, so it is now yours to act on. Please respond by ' || v_when || '. Open this notice to see it.';
  ELSE
    v_title := 'New complaint ' || p_t.ticket_number || ' is yours to handle';
    v_body  := '"' || left(p_t.subject, 120) || '" was filed and sent to you. Please respond by ' || v_when || '. Open this notice to see it.';
  END IF;

  INSERT INTO public.notifications
    (title, body, url, created_by, targeting, priority, category, metadata,
     requires_acknowledgment, expires_at, idempotency_key)
  VALUES
    (v_title, v_body,
     '/accreditation/naac/grievance/' || p_t.id::text,
     p_to,
     jsonb_build_object('type', 'grievance_' || p_kind, 'ticket_id', p_t.id),
     CASE WHEN p_kind = 'escalated' AND p_level >= 2 THEN 'urgent' ELSE 'high' END,
     'grievance:' || p_kind,
     jsonb_build_object('kind', 'grievance_' || p_kind, 'ticket_id', p_t.id,
                        'ticket_number', p_t.ticket_number, 'level', p_level, 'source', 'grievance_escalation'),
     false,
     now() + interval '30 days',
     p_key)
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_nid;

  IF v_nid IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, notification_id)
    VALUES (p_to, v_nid)
    ON CONFLICT (notification_id, user_id) DO NOTHING;
  END IF;
  RETURN v_nid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_notify(public.grievance_tickets, uuid, text, integer, timestamptz, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_notify(public.grievance_tickets, uuid, text, integer, timestamptz, text) TO service_role;

-- ---------------------------------------------------------------------
-- 7) Routing on create (BEFORE INSERT) + its notice (AFTER INSERT)
-- ---------------------------------------------------------------------
-- Fills assigned_to only when the insert left it empty. Never touches a
-- sensitive ticket (ICC-only, anonymous, about-my-superior — the Insta Solver
-- I8 route assigns those itself, or leaves them unassigned on purpose).
-- A resolution error never loses the complaint: the ticket is saved
-- unassigned and the error is recorded in metadata.auto_route.
CREATE OR REPLACE FUNCTION public.fn_grievance_route_on_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_role text;
  v_levels   integer[];
  v_lvl      integer;
  v_res      jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  v_sens     text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_sens := public.fn_grievance_sensitive_reason(NEW);
  IF v_sens IS NOT NULL THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('auto_route',
      jsonb_build_object('assigned_to', NULL, 'level', NULL, 'at', now(),
                         'reason', v_sens || '_not_auto_routed'));
    RETURN NEW;
  END IF;

  BEGIN
    SELECT lower(c.default_assignee_role) INTO v_cat_role
    FROM public.grievance_categories c WHERE c.id = NEW.category_id;

    v_levels := CASE v_cat_role
                  WHEN 'hod'       THEN ARRAY[1, 2]
                  WHEN 'principal' THEN ARRAY[2]
                  ELSE                  ARRAY[0, 2]   -- 'admin', or not set
                END;

    FOREACH v_lvl IN ARRAY v_levels LOOP
      v_res := public.fn_grievance_level_target(NEW, v_lvl);
      IF v_res ->> 'to' IS NOT NULL THEN
        NEW.assigned_to := (v_res ->> 'to')::uuid;
        NEW.assigned_at := now();
        NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('auto_route',
          jsonb_build_object('assigned_to', NEW.assigned_to, 'level', v_lvl, 'role', v_res ->> 'role',
                             'via', v_res ->> 'via', 'category_role', v_cat_role, 'at', now(),
                             'skipped', v_skipped));
        RETURN NEW;
      END IF;
      v_skipped := v_skipped || jsonb_build_array(v_res);
    END LOOP;

    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('auto_route',
      jsonb_build_object('assigned_to', NULL, 'level', NULL, 'category_role', v_cat_role,
                         'at', now(), 'skipped', v_skipped));
  EXCEPTION WHEN OTHERS THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('auto_route',
      jsonb_build_object('assigned_to', NULL, 'level', NULL, 'at', now(), 'error', SQLERRM));
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_route_on_create() FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.fn_grievance_notify_on_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.fn_grievance_notify(NEW, NEW.assigned_to, 'assigned',
      COALESCE((NEW.metadata -> 'auto_route' ->> 'level')::integer, 0),
      NEW.sla_deadline, 'grievance-assigned:' || NEW.id::text);
  EXCEPTION WHEN OTHERS THEN
    -- A failed notice must never lose the complaint; the dashboard work item
    -- still reaches the assignee.
    RAISE WARNING 'grievance % routed to % but the notice failed: %', NEW.ticket_number, NEW.assigned_to, SQLERRM;
  END;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_notify_on_create() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_grievance_route_on_create ON public.grievance_tickets;
CREATE TRIGGER trg_grievance_route_on_create
  BEFORE INSERT ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_grievance_route_on_create();

DROP TRIGGER IF EXISTS trg_grievance_notify_on_create ON public.grievance_tickets;
CREATE TRIGGER trg_grievance_notify_on_create
  AFTER INSERT ON public.grievance_tickets
  FOR EACH ROW
  WHEN (NEW.assigned_to IS NOT NULL
        AND (NEW.metadata -> 'auto_route' ->> 'assigned_to') = NEW.assigned_to::text)
  EXECUTE FUNCTION public.fn_grievance_notify_on_create();

-- ---------------------------------------------------------------------
-- 8) The hourly run: stamp breaches, then escalate one level per breach
-- ---------------------------------------------------------------------
-- Scheduler only (service role, no signed-in person). p_dry_run = answer what
-- WOULD happen, write nothing.
CREATE OR REPLACE FUNCTION public.fn_grievance_escalation_tick(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dry        boolean := COALESCE(p_dry_run, false);
  v_now        timestamptz := now();
  v_enabled    boolean;
  v_stamped    integer := 0;
  v_escalated  integer := 0;
  v_notified   integer := 0;
  v_no_target  integer := 0;
  v_lv_skipped integer := 0;
  v_ceiling    integer := 0;
  v_off        integer := 0;
  v_nfail      integer := 0;
  v_rows       jsonb := '[]'::jsonb;
  v_t          public.grievance_tickets;
  v_from       integer;
  v_base       integer;
  v_due        timestamptz;
  v_lvl        integer;
  v_res        jsonb;
  v_skipped    jsonb;
  v_to         uuid;
  v_via        text;
  v_hours      integer;
  v_deadline   timestamptz;
  v_event      jsonb;
  v_nid        uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'the grievance escalation run is started by the scheduler, not by a person' USING ERRCODE = '42501';
  END IF;

  -- one run at a time: a manual run and the scheduled one cannot interleave
  PERFORM pg_advisory_xact_lock(hashtext('grievance_escalation_tick'));

  -- 1) Breach stamping — what the hourly route always did; not switchable.
  IF v_dry THEN
    SELECT count(*) INTO v_stamped
    FROM public.grievance_tickets
    WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened')
      AND resolved_at IS NULL AND withdrawn_at IS NULL
      AND sla_breached_at IS NULL AND sla_deadline < v_now;
  ELSE
    UPDATE public.grievance_tickets
       SET sla_breached_at = v_now, sla_status = 'breached'
     WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened')
       AND resolved_at IS NULL AND withdrawn_at IS NULL
       AND sla_breached_at IS NULL AND sla_deadline < v_now;
    GET DIAGNOSTICS v_stamped = ROW_COUNT;
  END IF;

  v_enabled := COALESCE(public.fn_get_policy_bool('grievance.escalation.enabled', false), false);

  -- 2) Escalation
  FOR v_t IN
    SELECT * FROM public.grievance_tickets
    WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened')
      AND resolved_at IS NULL AND withdrawn_at IS NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_from := COALESCE(v_t.escalation_level, 0);
    v_due  := CASE WHEN v_from = 0 THEN v_t.sla_deadline
                   ELSE COALESCE(v_t.escalation_deadline, v_t.sla_deadline) END;
    CONTINUE WHEN v_due IS NULL OR v_due >= v_now;   -- not overdue at its current level

    IF NOT COALESCE(public.fn_get_policy_bool('grievance.escalation.enabled', false, v_t.institution_id), false) THEN
      v_off := v_off + 1;
      CONTINUE;
    END IF;

    IF v_from >= 3 THEN
      v_ceiling := v_ceiling + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'at_ceiling'));
      CONTINUE;
    END IF;

    -- Start above the create-time handler, while that person still holds it.
    v_base := v_from;
    IF v_t.assigned_to IS NOT NULL
       AND (v_t.metadata -> 'auto_route' ->> 'assigned_to') = v_t.assigned_to::text
       AND (v_t.metadata -> 'auto_route' ->> 'level') ~ '^[0-9]+$' THEN
      v_base := GREATEST(v_base, (v_t.metadata -> 'auto_route' ->> 'level')::integer);
    END IF;

    v_skipped := '[]'::jsonb;
    v_to := NULL;
    v_lvl := v_base;
    WHILE v_lvl < 3 LOOP
      v_lvl := v_lvl + 1;
      v_res := public.fn_grievance_level_target(v_t, v_lvl);
      IF v_res ->> 'to' IS NOT NULL THEN
        v_to := (v_res ->> 'to')::uuid;
        v_via := v_res ->> 'via';
        EXIT;
      END IF;
      v_skipped := v_skipped || jsonb_build_array(v_res);
    END LOOP;

    IF v_to IS NULL THEN
      v_no_target := v_no_target + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'no_target', 'skipped', v_skipped));
      -- Recorded once per level, not every hour.
      IF NOT v_dry AND (v_t.metadata -> 'escalation_blocked' ->> 'from_level') IS DISTINCT FROM v_from::text THEN
        UPDATE public.grievance_tickets
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('escalation_blocked',
                 jsonb_build_object('from_level', v_from, 'at', v_now, 'skipped', v_skipped))
         WHERE id = v_t.id;
      END IF;
      CONTINUE;
    END IF;

    v_lv_skipped := v_lv_skipped + jsonb_array_length(v_skipped);
    v_hours := GREATEST(COALESCE(public.fn_get_policy_int('grievance.escalation.level' || v_lvl || '_hours',
                 CASE v_lvl WHEN 3 THEN 72 ELSE 48 END, v_t.institution_id), 48), 1);
    v_deadline := v_now + make_interval(hours => v_hours);
    v_event := jsonb_build_object(
      'level', v_lvl, 'role', CASE v_lvl WHEN 1 THEN 'hod' WHEN 2 THEN 'principal' ELSE 'director' END,
      'to', v_to, 'via', v_via, 'at', v_now, 'deadline', v_deadline,
      'from_level', v_from, 'previous_assignee', v_t.assigned_to, 'skipped', v_skipped);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'ticket', v_t.ticket_number, 'from_level', v_from, 'to_level', v_lvl, 'to', v_to,
      'outcome', 'escalated', 'skipped', v_skipped));

    IF NOT v_dry THEN
      UPDATE public.grievance_tickets
         SET escalation_level    = v_lvl,
             assigned_to         = v_to,
             assigned_at         = v_now,
             escalated_at        = v_now,
             escalation_deadline = v_deadline,
             metadata = (COALESCE(metadata, '{}'::jsonb) - 'escalation_blocked')
                        || jsonb_build_object('escalations',
                             COALESCE(metadata -> 'escalations', '[]'::jsonb) || jsonb_build_array(v_event))
       WHERE id = v_t.id;
      -- A failed notice never undoes the escalation (or the rest of the run):
      -- it is recorded on the event and counted as notify_failed.
      BEGIN
        v_nid := public.fn_grievance_notify(v_t, v_to, 'escalated', v_lvl, v_deadline,
                   'grievance-escalated:' || v_t.id::text || ':L' || v_lvl || ':' ||
                   floor(extract(epoch FROM v_due))::bigint::text);
        IF v_nid IS NOT NULL THEN v_notified := v_notified + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        v_nfail := v_nfail + 1;
        UPDATE public.grievance_tickets
           SET metadata = jsonb_set(metadata, '{escalations,-1,notify_error}', to_jsonb(SQLERRM))
         WHERE id = v_t.id;
      END;
    END IF;
    v_escalated := v_escalated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success',           true,
    'dry_run',           v_dry,
    'enabled',           v_enabled,
    'breached_stamped',  v_stamped,
    'escalated',         v_escalated,
    'notified',          v_notified,
    'notify_failed',     v_nfail,
    'skipped_no_target', v_no_target,
    'levels_skipped',    v_lv_skipped,
    'at_ceiling',        v_ceiling,
    'switched_off',      v_off,
    'tickets',           v_rows);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_escalation_tick(boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_escalation_tick(boolean) TO service_role;

COMMENT ON FUNCTION public.fn_grievance_escalation_tick(boolean) IS
  'Hourly (via /api/cron/grievance-sla-breach-check): stamps sla_breached_at on newly overdue tickets, then moves each ticket overdue at its current level up ONE chain level (HOD, Principal, Director), reassigning and notifying. Rules and safety limits: migration 20270420090000_grievance_sla_escalation.sql. Scheduler only.';

-- ---------------------------------------------------------------------
-- 9) fn_generate_unresolved_issue_items — the dead link
-- ---------------------------------------------------------------------
-- Body identical to production (20261213100000, compared 2026-09-28) except
-- the work item's url: /grievances/<id> never existed; the ticket page is
-- /accreditation/naac/grievance/<id>. The dedupe key is unchanged, so no work
-- item is posted twice across the deploy.
CREATE OR REPLACE FUNCTION public.fn_generate_unresolved_issue_items()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn_issue$
DECLARE
  v_created INT := 0; v_griev RECORD; v_key TEXT; v_target UUID;
  v_priority TEXT; v_hours_past_sla INT;
  v_cfg JSONB;
  v_category TEXT;
  v_statuses TEXT[];
  v_max_age_days INT;
  v_batch_limit INT;
  v_urgent_when_emergency BOOLEAN;
  v_urgent_when_escalation_gte INT;
  v_high_when_escalation_eq INT;
  v_high_when_hours_past_sla_gt INT;
  v_ttl_urgent_hours INT;
  v_ttl_normal_hours INT;
  v_fallback_to_director BOOLEAN;
BEGIN
  v_cfg := fn_get_generator_config('unresolved_issue', '{
    "category": "dashboard:approval",
    "statuses": ["open","assigned","in_progress","escalated"],
    "max_age_days": 90,
    "batch_limit": 50,
    "trigger_conditions": ["sla_deadline_breached","escalation_level_gt_0","is_emergency"],
    "filters": {"withdrawn_at_is_null": true, "resolved_at_is_null": true},
    "priority_overrides": {
      "urgent_when_is_emergency": true,
      "urgent_when_escalation_gte": 2,
      "high_when_escalation_eq": 1,
      "high_when_hours_past_sla_gt": 24
    },
    "ttl_hours": {"urgent_or_escalation_gte_2": 4, "normal": 24},
    "fallback_to_director": true
  }'::jsonb);

  v_category             := COALESCE(v_cfg->>'category', 'dashboard:approval');
  v_statuses             := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'statuses')),
                              ARRAY['open','assigned','in_progress','escalated']
                            );
  v_max_age_days         := COALESCE((v_cfg->>'max_age_days')::INT, 90);
  v_batch_limit          := COALESCE((v_cfg->>'batch_limit')::INT, 50);
  v_urgent_when_emergency      := COALESCE((v_cfg->'priority_overrides'->>'urgent_when_is_emergency')::BOOLEAN, true);
  v_urgent_when_escalation_gte := COALESCE((v_cfg->'priority_overrides'->>'urgent_when_escalation_gte')::INT, 2);
  v_high_when_escalation_eq    := COALESCE((v_cfg->'priority_overrides'->>'high_when_escalation_eq')::INT, 1);
  v_high_when_hours_past_sla_gt := COALESCE((v_cfg->'priority_overrides'->>'high_when_hours_past_sla_gt')::INT, 24);
  v_ttl_urgent_hours     := COALESCE((v_cfg->'ttl_hours'->>'urgent_or_escalation_gte_2')::INT, 4);
  v_ttl_normal_hours     := COALESCE((v_cfg->'ttl_hours'->>'normal')::INT, 24);
  v_fallback_to_director := COALESCE((v_cfg->>'fallback_to_director')::BOOLEAN, true);

  FOR v_griev IN
    SELECT id, ticket_number, subject, description, institution_id,
           priority, status, sla_deadline, sla_status, escalation_level,
           is_emergency, assigned_to,
           CASE WHEN sla_deadline IS NOT NULL
                THEN EXTRACT(EPOCH FROM (NOW() - sla_deadline))/3600
                ELSE 0 END AS hours_past_sla
    FROM public.grievance_tickets
    WHERE status = ANY(v_statuses)
      AND created_at > NOW() - make_interval(days => v_max_age_days)
      AND (sla_deadline < NOW() OR escalation_level > 0 OR is_emergency = TRUE)
      AND withdrawn_at IS NULL
      AND resolved_at IS NULL
    ORDER BY escalation_level DESC NULLS LAST, sla_deadline ASC NULLS LAST
    LIMIT v_batch_limit
  LOOP
    IF v_fallback_to_director THEN
      v_target := COALESCE(v_griev.assigned_to, fn_resolve_dashboard_target(v_griev.institution_id));
    ELSE
      v_target := v_griev.assigned_to;
    END IF;
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours_past_sla := v_griev.hours_past_sla::INT;
    v_priority := CASE
      WHEN v_urgent_when_emergency AND v_griev.is_emergency THEN 'urgent'
      WHEN v_griev.escalation_level >= v_urgent_when_escalation_gte THEN 'urgent'
      WHEN v_griev.escalation_level = v_high_when_escalation_eq THEN 'high'
      WHEN v_hours_past_sla > v_high_when_hours_past_sla_gt THEN 'high'
      ELSE 'normal'
    END;
    -- Dedupe key is production's, unchanged: a new key would double-post
    -- every open ticket for one day across the deploy window.
    -- The url is the real ticket page (2026-09-28); /grievances/<id> never existed.
    v_key := 'grievance_ticket:' || v_griev.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      v_category, v_priority,
      'Grievance ' || v_griev.ticket_number || ' — ' || LEFT(v_griev.subject, 80),
      LEFT(v_griev.description, 140) ||
        CASE WHEN v_griev.escalation_level > 0 THEN ' | escalated L' || v_griev.escalation_level::text ELSE '' END ||
        CASE WHEN v_griev.sla_deadline < NOW() THEN ' | SLA breached ' || v_hours_past_sla::text || 'h' ELSE '' END ||
        CASE WHEN v_griev.assigned_to IS NULL THEN ' | UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object(
        'grievance_id',     v_griev.id,
        'ticket_number',    v_griev.ticket_number,
        'escalation_level', v_griev.escalation_level,
        'sla_breached',     (v_griev.sla_deadline < NOW()),
        'is_emergency',     v_griev.is_emergency,
        'unassigned_fallback', v_griev.assigned_to IS NULL,
        'url', '/accreditation/naac/grievance/' || v_griev.id::text
      ),
      v_target, v_key,
      CASE
        WHEN v_griev.is_emergency OR v_griev.escalation_level >= v_urgent_when_escalation_gte
          THEN v_ttl_urgent_hours
        ELSE v_ttl_normal_hours
      END
    );
  END LOOP;
  RETURN v_created;
END $fn_issue$;

REVOKE ALL ON FUNCTION public.fn_generate_unresolved_issue_items() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10) Self-check
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'grievance_tickets'
                    AND column_name = 'escalation_deadline') THEN
    RAISE EXCEPTION 'grievance_tickets.escalation_deadline was not added';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_grievance_route_on_create'
                    AND tgrelid = 'public.grievance_tickets'::regclass) THEN
    RAISE EXCEPTION 'trg_grievance_route_on_create was not created';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_grievance_escalation_tick(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_grievance_escalation_tick must not be executable by signed-in users';
  END IF;
END $$;
