-- =====================================================================
-- Grievance: route on create, escalate on breach (HOD -> Principal -> Joint MD)
-- Date: 2026-09-28
-- Updated: 2026-10-09 — the "about the Joint MD" tick (Director rulings
--   9 Oct 23:18 and 23:25): column about_joint_md, routing to the Director,
--   hidden from the Joint MD, send-back action (sections 1, 2, 3b, 5, 7, 10-13).
--   NOT applied to production when edited (no ledger row, 9 Oct 23:35).
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
--   Chain position   1 = HOD, 2 = Principal, 3 = the Joint MD (Director ruling
--                    8 Oct 2026; the policy key grievance.escalation.
--                    director_profile_id and the word "Director level" below
--                    are older names for that seat). Level 3 is the ceiling.
--   About the        (ruling 9 Oct 2026 23:18 / 23:25) a complaint the filer
--   Joint MD         ticked "This complaint is about the Joint MD"
--                    (grievance_tickets.about_joint_md) goes to THE DIRECTOR
--                    (policy grievance.escalation.about_joint_md_profile_id)
--                    on create, skipping HOD, Principal and the Joint MD. Not
--                    set / unusable = saved and HELD, unassigned, with the
--                    reason in metadata.about_joint_md_hold. Escalation never
--                    moves it to the Joint MD. The Joint MD cannot read it,
--                    its comments or history (row-level security), never gets
--                    a notice or work item for it, and it is left out of every
--                    count (section 12). The Director or a super admin can
--                    "send it back to the normal path" (section 13).
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

-- The complainant's tick "This complaint is about the Joint MD" (Director
-- ruling 9 Oct 2026 23:18). A real column, not metadata, because row-level
-- security reads it (section 11). Only fn_grievance_send_back_to_normal_path
-- may clear it (section 13).
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS about_joint_md boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.grievance_tickets.about_joint_md IS
  'The complainant ticked "This complaint is about the Joint MD". Such a ticket goes to the Director (policy grievance.escalation.about_joint_md_profile_id), never to the Joint MD; the Joint MD cannot see it, count it or be told about it. Cleared only by fn_grievance_send_back_to_normal_path (the Director or a super admin), which re-routes it the normal way. Migration 20270420090000.';

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
   'Hours the Principal has to act on a grievance escalated to them before it moves up to level 3 (the Joint MD). Clock hours from the moment of escalation.'),
  ('grievance.escalation.level3_hours', 72,
   'Hours level 3 (the Joint MD; for a complaint about the Joint MD, the Director) has to act on an escalated grievance. Level 3 is the top: when this passes the ticket stays where it is and is shown as overdue; nothing moves further.')
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
  'Level 3 of grievance escalation, which is THE JOINT MD (Director ruling 8 Oct 2026; the key keeps its older name). The profile id of the person who receives grievances escalated past the Principal, and every ICC-only, anonymous or about-my-superior complaint once it is overdue. Do NOT put the Director here: complaints about the Joint MD go to the Director through grievance.escalation.about_joint_md_profile_id, and whoever is named here is hidden from those complaints. Can be set per college. Empty or pointing at an inactive or test profile = level 3 is treated as empty and the escalation run reports it.',
  'string', 'major', 'accreditation', true, true, 'published'
FROM public.platform_policies src
WHERE src.policy_key = 'instasolver.complaint.superior_route_to'
  AND src.scope_type = 'global' AND src.scope_id IS NULL AND src.is_active
  AND NOT EXISTS (SELECT 1 FROM public.platform_policies p
                   WHERE p.policy_key = 'grievance.escalation.director_profile_id'
                     AND p.scope_type = 'global' AND p.scope_id IS NULL)
LIMIT 1;

-- Who receives a complaint ABOUT the Joint MD: the Director (ruling 9 Oct
-- 2026 23:18). Seeded from the ONE confirmed, not-deleted auth account for
-- director@jkkn.ac.in that has a profile (the Director's own account in the
-- 30 Sep "Director list" ruling, read the same way 20270520090000 reads it).
-- Anything else (no such account, more than one, or a database without
-- auth.users) seeds an EMPTY value: those complaints are then saved and HELD,
-- visible to super admins other than the Joint MD, until the Director sets it.
-- Never copied from, and never falling back to, the Joint MD's policy above.
DO $seed_about_jmd$
DECLARE
  v_n  integer := 0;
  v_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_policies
              WHERE policy_key = 'grievance.escalation.about_joint_md_profile_id'
                AND scope_type = 'global' AND scope_id IS NULL) THEN
    RETURN;   -- never overwrite a value someone has set
  END IF;

  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*), min(p.id::text)
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
       WHERE lower(trim(u.email)) = 'director@jkkn.ac.in'
         AND u.email_confirmed_at IS NOT NULL
         AND u.deleted_at IS NULL
    $q$ INTO v_n, v_id;
  END IF;
  IF v_n <> 1 THEN
    RAISE NOTICE 'grievance: % verified account(s) for director@jkkn.ac.in; grievance.escalation.about_joint_md_profile_id is seeded EMPTY (complaints about the Joint MD are held for a super admin until it is set).', v_n;
    v_id := '';
  END IF;

  INSERT INTO public.platform_policies
    (policy_key, scope_type, scope_id, value, description, data_type,
     classification, ui_category, is_system, is_active, publication_state)
  VALUES
    ('grievance.escalation.about_joint_md_profile_id', 'global', NULL, to_jsonb(v_id),
     'The profile id of THE DIRECTOR, who receives every complaint the complainant marked "This complaint is about the Joint MD" (ruling 9 Oct 2026). Such a complaint skips HOD, Principal and the Joint MD entirely. Empty, inactive, a test profile, or the same person as the Joint MD = the complaint is saved and HELD (visible to super admins except the Joint MD) until this is set; it is never sent to the Joint MD. Can be set per college.',
     'string', 'major', 'accreditation', true, true, 'published');
END
$seed_about_jmd$;

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
-- 3b) Who holds the Joint MD's seat, and who is the Director
-- ---------------------------------------------------------------------
-- A person-policy value is a uuid string or {"profile_id"|"id": uuid};
-- anything else (empty string, null, junk) names nobody.
CREATE OR REPLACE FUNCTION public.fn_grievance_policy_profile_id(p_value jsonb)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN s.v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN s.v::uuid END
  FROM (SELECT CASE jsonb_typeof(p_value)
                 WHEN 'string' THEN p_value #>> '{}'
                 WHEN 'object' THEN COALESCE(p_value ->> 'profile_id', p_value ->> 'id')
               END AS v) AS s
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_policy_profile_id(jsonb) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_policy_profile_id(jsonb) TO service_role;

-- The Joint MD's seat for one college = every person named by the level-3
-- policy (grievance.escalation.director_profile_id, global or this college)
-- or by the about-my-superior route (instasolver.complaint.superior_route_to,
-- seeded to the Joint MD). A complaint about the Joint MD is hidden from,
-- and never given or notified to, anyone in this set.
CREATE OR REPLACE FUNCTION public.fn_grievance_joint_md_ids(p_institution uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT x.id) FILTER (WHERE x.id IS NOT NULL), '{}'::uuid[])
  FROM (
    SELECT public.fn_grievance_policy_profile_id(pp.value) AS id
    FROM public.platform_policies pp
    WHERE pp.is_active
      AND pp.policy_key IN ('grievance.escalation.director_profile_id', 'instasolver.complaint.superior_route_to')
      AND ((pp.scope_type = 'global' AND pp.scope_id IS NULL)
        OR (pp.scope_type = 'institution' AND pp.scope_id = p_institution))
  ) AS x
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_joint_md_ids(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_joint_md_ids(uuid) TO service_role;

-- The same set, seen from the SIGNED-IN caller: the colleges where the caller
-- holds the Joint MD's seat, with 00000000-0000-0000-0000-000000000000
-- standing for "every college" (a global row). Empty for everybody else, and
-- for a session with no signed-in user. Row-level security and the patched
-- My Desk reader call it (sections 11, 12). No argument, so it can only ever
-- describe the caller.
CREATE OR REPLACE FUNCTION public.fn_grievance_caller_joint_md_scope()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT CASE WHEN pp.scope_type = 'global'
                                          THEN '00000000-0000-0000-0000-000000000000'::uuid
                                          ELSE pp.scope_id END), '{}'::uuid[])
  FROM public.platform_policies pp
  WHERE auth.uid() IS NOT NULL
    AND pp.is_active
    AND pp.policy_key IN ('grievance.escalation.director_profile_id', 'instasolver.complaint.superior_route_to')
    AND ((pp.scope_type = 'global' AND pp.scope_id IS NULL)
      OR (pp.scope_type = 'institution' AND pp.scope_id IS NOT NULL))
    AND public.fn_grievance_policy_profile_id(pp.value) = auth.uid()
$$;
-- ci:allow-secdef-authenticated row-level security on grievance_tickets / _comments / _history calls fn_grievance_caller_joint_md_scope() for EVERY signed-in reader, so it must be executable by authenticated. It takes no argument and only says which colleges the CALLER holds the Joint MD's seat in (empty for everyone else); fn_grievance_ticket_hidden_from_caller(id) only answers true for that same caller on a complaint about her. The one function here that acts, fn_grievance_send_back_to_normal_path, checks is_super_admin() / the Director policy and refuses the Joint MD in its body.
REVOKE EXECUTE ON FUNCTION public.fn_grievance_caller_joint_md_scope() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_caller_joint_md_scope() TO authenticated, service_role;

-- The Director for one complaint about the Joint MD: {to, via, reason}.
-- Read straight from the policy rows (this college first, then global) so no
-- per-user policy row can redirect it. Never the Joint MD: a Director policy
-- that names someone in the Joint MD's seat counts as unset.
CREATE OR REPLACE FUNCTION public.fn_grievance_about_joint_md_target(p_t public.grievance_tickets)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to  uuid;
  v_why text;
BEGIN
  SELECT public.fn_grievance_policy_profile_id(pp.value) INTO v_to
  FROM public.platform_policies pp
  WHERE pp.is_active
    AND pp.policy_key = 'grievance.escalation.about_joint_md_profile_id'
    AND ((pp.scope_type = 'institution' AND pp.scope_id = p_t.institution_id)
      OR (pp.scope_type = 'global' AND pp.scope_id IS NULL))
  ORDER BY CASE pp.scope_type WHEN 'institution' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_to IS NULL THEN
    RETURN jsonb_build_object('to', NULL,
      'reason', 'no_director_set (policy grievance.escalation.about_joint_md_profile_id)');
  END IF;
  IF v_to = ANY (public.fn_grievance_joint_md_ids(p_t.institution_id)) THEN
    RETURN jsonb_build_object('to', NULL, 'reason', 'director_policy_names_the_joint_md');
  END IF;
  v_why := public.fn_grievance_profile_unusable(v_to, array_remove(ARRAY[p_t.raised_by_id, p_t.filed_by], NULL));
  IF v_why IS NOT NULL THEN
    RETURN jsonb_build_object('to', NULL, 'reason', 'director_' || v_why);
  END IF;
  RETURN jsonb_build_object('to', v_to, 'via', 'about_joint_md_policy', 'reason', NULL);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_about_joint_md_target(public.grievance_tickets) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_about_joint_md_target(public.grievance_tickets) TO service_role;

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
    WHEN COALESCE(p_t.about_joint_md, false) THEN 'about_joint_md'   -- first: it outranks every other rule
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

  -- About the Joint MD (ruling 9 Oct 2026): no HOD, no Principal, and level 3
  -- is the DIRECTOR. The Joint MD's policy below is unreachable for it.
  IF COALESCE(p_t.about_joint_md, false) THEN
    IF p_level < 3 THEN
      RETURN jsonb_build_object('level', p_level, 'role', v_role, 'to', NULL,
                                'reason', 'about_joint_md_skips_' || v_role);
    END IF;
    v_raw := public.fn_grievance_about_joint_md_target(p_t);
    RETURN jsonb_build_object('level', 3, 'role', 'the_director', 'to', v_raw -> 'to',
                              'via', v_raw ->> 'via', 'reason', v_raw ->> 'reason');
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

  -- Never tell the Joint MD about a complaint about the Joint MD (ruling
  -- 9 Oct 2026: not a row, not a count, not a notice). Routing already never
  -- picks them; this is the last door.
  IF COALESCE(p_t.about_joint_md, false)
     AND p_to = ANY (public.fn_grievance_joint_md_ids(p_t.institution_id)) THEN
    RETURN NULL;
  END IF;

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
--
-- The normal path, as one function, so "send back to the normal path"
-- (section 13) routes a ticket exactly the way a new one is routed.
-- Returns {assigned_to, auto_route}; writes nothing.
CREATE OR REPLACE FUNCTION public.fn_grievance_initial_route(p_t public.grievance_tickets)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  v_sens := public.fn_grievance_sensitive_reason(p_t);
  IF v_sens IS NOT NULL THEN
    RETURN jsonb_build_object('assigned_to', NULL, 'auto_route',
      jsonb_build_object('assigned_to', NULL, 'level', NULL, 'at', now(),
                         'reason', v_sens || '_not_auto_routed'));
  END IF;

  SELECT lower(c.default_assignee_role) INTO v_cat_role
  FROM public.grievance_categories c WHERE c.id = p_t.category_id;

  v_levels := CASE v_cat_role
                WHEN 'hod'       THEN ARRAY[1, 2]
                WHEN 'principal' THEN ARRAY[2]
                ELSE                  ARRAY[0, 2]   -- 'admin', or not set
              END;

  FOREACH v_lvl IN ARRAY v_levels LOOP
    v_res := public.fn_grievance_level_target(p_t, v_lvl);
    IF v_res ->> 'to' IS NOT NULL THEN
      RETURN jsonb_build_object('assigned_to', v_res -> 'to', 'auto_route',
        jsonb_build_object('assigned_to', (v_res ->> 'to')::uuid, 'level', v_lvl, 'role', v_res ->> 'role',
                           'via', v_res ->> 'via', 'category_role', v_cat_role, 'at', now(),
                           'skipped', v_skipped));
    END IF;
    v_skipped := v_skipped || jsonb_build_array(v_res);
  END LOOP;

  RETURN jsonb_build_object('assigned_to', NULL, 'auto_route',
    jsonb_build_object('assigned_to', NULL, 'level', NULL, 'category_role', v_cat_role,
                       'at', now(), 'skipped', v_skipped));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_initial_route(public.grievance_tickets) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_initial_route(public.grievance_tickets) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_grievance_route_on_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res   jsonb;
  v_route jsonb;
BEGIN
  -- About the Joint MD: always the Director, or HELD with the reason, whatever
  -- assignee the insert named (it can never be left with the Joint MD).
  IF COALESCE(NEW.about_joint_md, false) THEN
    BEGIN
      v_res := public.fn_grievance_level_target(NEW, 3);
    EXCEPTION WHEN OTHERS THEN
      v_res := jsonb_build_object('to', NULL, 'reason', 'routing_error: ' || SQLERRM);
    END;
    NEW.assigned_to := (v_res ->> 'to')::uuid;
    NEW.assigned_at := CASE WHEN NEW.assigned_to IS NULL THEN NULL ELSE now() END;
    NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - 'about_joint_md_hold')
      || jsonb_build_object('auto_route',
           jsonb_build_object('assigned_to', NEW.assigned_to,
                              'level', CASE WHEN NEW.assigned_to IS NULL THEN NULL ELSE 3 END,
                              'role', 'the_director', 'via', v_res ->> 'via',
                              'reason', 'about_joint_md', 'at', now()))
      || CASE WHEN NEW.assigned_to IS NULL
              THEN jsonb_build_object('about_joint_md_hold',
                     jsonb_build_object('reason', v_res ->> 'reason', 'at', now()))
              ELSE '{}'::jsonb END;
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_route := public.fn_grievance_initial_route(NEW);
    NEW.assigned_to := (v_route ->> 'assigned_to')::uuid;
    IF NEW.assigned_to IS NOT NULL THEN
      NEW.assigned_at := now();
    END IF;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object('auto_route', v_route -> 'auto_route');
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

    -- Already with the top level from the moment it was filed (a complaint
    -- about the Joint MD, routed to the Director): nothing is above it.
    IF v_base >= 3 THEN
      v_ceiling := v_ceiling + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'at_ceiling'));
      CONTINUE;
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
      'level', v_lvl, 'role', COALESCE(v_res ->> 'role', CASE v_lvl WHEN 1 THEN 'hod' WHEN 2 THEN 'principal' ELSE 'director' END),
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
           is_emergency, assigned_to, about_joint_md,
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
    -- A complaint about the Joint MD never becomes a work item for the Joint
    -- MD (the unassigned fallback above is the oldest super admin, who may be).
    IF COALESCE(v_griev.about_joint_md, false)
       AND v_target = ANY (public.fn_grievance_joint_md_ids(v_griev.institution_id)) THEN
      CONTINUE;
    END IF;
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
-- 10) About the Joint MD: two rules no write may break
-- ---------------------------------------------------------------------
-- (a) Only the send-back action (section 13) may clear the tick: any other
--     UPDATE that clears it is refused, so an admin edit cannot quietly make
--     the complaint visible to the Joint MD.
-- (b) While the tick is set the ticket can never be given to anyone in the
--     Joint MD's seat — whichever path writes assigned_to (the issues board,
--     the Learners Council route, a console edit).
CREATE OR REPLACE FUNCTION public.fn_grievance_about_joint_md_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.about_joint_md, false) AND NOT COALESCE(NEW.about_joint_md, false)
     AND COALESCE(current_setting('app.grievance_send_back', true), '') <> 'on' THEN
    RAISE EXCEPTION 'This complaint is marked as about the Joint MD. Only the Director or a super admin can send it back to the normal path, with the "Send back to the normal path" button on the complaint.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(NEW.about_joint_md, false) AND NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to = ANY (public.fn_grievance_joint_md_ids(NEW.institution_id)) THEN
    RAISE EXCEPTION 'This complaint is about the Joint MD, so it cannot be given to the Joint MD.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_about_joint_md_guard() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_grievance_about_joint_md_guard ON public.grievance_tickets;
CREATE TRIGGER trg_grievance_about_joint_md_guard
  BEFORE UPDATE ON public.grievance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.fn_grievance_about_joint_md_guard();

-- ---------------------------------------------------------------------
-- 11) About the Joint MD: the Joint MD cannot read it (row-level security)
-- ---------------------------------------------------------------------
-- RESTRICTIVE, so it is ANDed with every existing permissive policy —
-- including is_super_admin() / is_admin(), which the Joint MD may hold.
-- The existing policies are left exactly as they are.
DROP POLICY IF EXISTS grievance_tickets_hide_about_joint_md ON public.grievance_tickets;
CREATE POLICY grievance_tickets_hide_about_joint_md ON public.grievance_tickets
  AS RESTRICTIVE FOR ALL
  USING (NOT about_joint_md
         OR NOT ((SELECT public.fn_grievance_caller_joint_md_scope())
                 && ARRAY[institution_id, '00000000-0000-0000-0000-000000000000'::uuid]));

-- The comments and the history of such a ticket are hidden the same way
-- (grievance_comments_select admits every super admin and admin outright).
-- SECURITY DEFINER because the caller cannot read the ticket any more.
CREATE OR REPLACE FUNCTION public.fn_grievance_ticket_hidden_from_caller(p_ticket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.grievance_tickets t
    WHERE t.id = p_ticket_id
      AND t.about_joint_md
      AND (SELECT public.fn_grievance_caller_joint_md_scope())
          && ARRAY[t.institution_id, '00000000-0000-0000-0000-000000000000'::uuid])
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_ticket_hidden_from_caller(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_ticket_hidden_from_caller(uuid) TO authenticated, service_role;

-- CASE: for everybody who is not the Joint MD (an empty seat list, worked out
-- once per statement) the per-row lookup never runs.
DROP POLICY IF EXISTS grievance_comments_hide_about_joint_md ON public.grievance_comments;
CREATE POLICY grievance_comments_hide_about_joint_md ON public.grievance_comments
  AS RESTRICTIVE FOR ALL
  USING (CASE WHEN cardinality((SELECT public.fn_grievance_caller_joint_md_scope())) = 0 THEN true
              ELSE NOT public.fn_grievance_ticket_hidden_from_caller(ticket_id) END);

DROP POLICY IF EXISTS grievance_history_hide_about_joint_md ON public.grievance_history;
CREATE POLICY grievance_history_hide_about_joint_md ON public.grievance_history
  AS RESTRICTIVE FOR ALL
  USING (CASE WHEN cardinality((SELECT public.fn_grievance_caller_joint_md_scope())) = 0 THEN true
              ELSE NOT public.fn_grievance_ticket_hidden_from_caller(ticket_id) END);

-- ---------------------------------------------------------------------
-- 12) About the Joint MD: no list row and no count through the SECURITY
--     DEFINER readers (they skip row-level security)
-- ---------------------------------------------------------------------
--   fn_my_desk_waiting()   lists every UNASSIGNED ticket, subject included,
--                          to every super admin. A held complaint about the
--                          Joint MD must stay on the desk of the Director and
--                          the other super admins, and leave the Joint MD's:
--                          the patch hides it from the CALLER who holds the
--                          Joint MD's seat only.
--   fn_dashboard_metrics, fn_compute_ohs_for_institution, fn_hod_metrics,
--   fn_compute_dhs_for_user  count tickets into dashboard and leaderboard
--                          scores (the leaderboards are refreshed with nobody
--                          signed in). These leave complaints about the Joint
--                          MD out of the count for EVERYONE: a handful of
--                          tickets, and no count can then reach the Joint MD.
-- Patched IN PLACE, the way 20270520090000 section 7 patches fn_get_policy:
-- the definition the database holds at apply time (pg_get_functiondef) is
-- kept byte for byte, except that every "FROM [public.]grievance_tickets
-- [alias]" becomes "FROM (SELECT * FROM public.grievance_tickets AS __jmd
-- WHERE <rule>) AS <alias>" — a filtered table in the same place, so the
-- surrounding WHERE / JOIN / OR logic is untouched. My Desk was rewritten on
-- 8 Oct (20271008110101) and HR PRs touch it often; re-creating it from a
-- repo copy here would undo whichever of them landed after this was written.
--   * Already patched (the body names about_joint_md) => left alone.
--   * Function missing => NOTICE, nothing to patch.
--   * Function present, mentions grievance_tickets, but no FROM site found,
--     or a DELETE FROM site => ERROR: a person has to look, rather than a
--     count or a row silently reaching the Joint MD.
-- LIMIT: a LATER migration that re-creates one of these functions from a
-- repo copy drops the rule again. Re-applying this section restores it.
DO $patch$
DECLARE
  c_caller CONSTANT text :=
    'NOT (COALESCE(__jmd.about_joint_md, false) AND (SELECT public.fn_grievance_caller_joint_md_scope())'
    || ' && ARRAY[__jmd.institution_id, ''00000000-0000-0000-0000-000000000000''::uuid])';
  c_all    CONSTANT text := 'NOT COALESCE(__jmd.about_joint_md, false)';
  c_kw     CONSTANT text[] := ARRAY['where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'natural',
                                    'on', 'group', 'order', 'limit', 'offset', 'union', 'except', 'intersect',
                                    'having', 'window', 'for', 'using', 'returning', 'into', 'fetch', 'then',
                                    'loop', 'and', 'or', 'as', 'tablesample', 'lateral'];
  r        record;
  v_def    text;
  v_rest   text;
  v_out    text;
  v_before text;
  v_pos    integer;
  v_m      text[];
  v_alias  text;
  v_used   integer;
  v_sites  integer;
  v_seen   text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig, p.proname, w.rule
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    JOIN (VALUES ('fn_my_desk_waiting', 'caller'),
                 ('fn_dashboard_metrics', 'all'),
                 ('fn_compute_ohs_for_institution', 'all'),
                 ('fn_hod_metrics', 'all'),
                 ('fn_compute_dhs_for_user', 'all')) AS w(name, rule) ON w.name = p.proname
    ORDER BY p.proname
  LOOP
    v_seen := v_seen || r.proname::text;
    v_def := pg_get_functiondef(r.oid);
    IF position('about_joint_md' IN v_def) > 0 THEN
      CONTINUE;   -- already patched
    END IF;
    IF v_def !~* 'grievance_tickets' THEN
      RAISE NOTICE 'grievance: % does not read grievance_tickets; nothing to patch.', r.sig;
      CONTINUE;
    END IF;

    v_out := '';
    v_rest := v_def;
    v_sites := 0;
    LOOP
      -- (regexp_match, not regexp_instr: the latter needs PostgreSQL 15)
      v_m := regexp_match(v_rest, '^(.*?)\mFROM\s+(public\.)?grievance_tickets\M', 'i');
      EXIT WHEN v_m IS NULL;
      v_before := v_m[1];
      v_pos := length(v_before) + 1;
      IF v_before ~* '\mDELETE\s+$' THEN
        RAISE EXCEPTION 'grievance: % deletes from grievance_tickets; the about-the-Joint-MD patch only rewrites reads. Compare pg_get_functiondef with main before re-running.', r.sig;
      END IF;
      v_m := regexp_match(substr(v_rest, v_pos),
                          '^(FROM\s+(?:public\.)?grievance_tickets)(\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?', 'i');
      v_alias := lower(v_m[3]);
      IF v_alias IS NULL OR v_alias = ANY (c_kw) THEN
        v_alias := 'grievance_tickets';
        v_used := length(v_m[1]);
      ELSE
        v_used := length(v_m[1]) + length(v_m[2]);
      END IF;
      v_out := v_out || v_before
               || 'FROM (SELECT * FROM public.grievance_tickets AS __jmd WHERE '
               || CASE r.rule WHEN 'caller' THEN c_caller ELSE c_all END
               || ') AS ' || v_alias;
      v_rest := substr(v_rest, v_pos + v_used);
      v_sites := v_sites + 1;
    END LOOP;
    v_out := v_out || v_rest;

    IF v_sites = 0 THEN
      RAISE EXCEPTION 'grievance: % mentions grievance_tickets but has no "FROM grievance_tickets" this patch recognises. Its live body differs from what this migration was written against; compare pg_get_functiondef with main before re-running.', r.sig;
    END IF;
    EXECUTE v_out;
    RAISE NOTICE 'grievance: % now leaves out complaints about the Joint MD (% place(s), rule %).', r.sig, v_sites, r.rule;
  END LOOP;

  IF NOT ('fn_my_desk_waiting' = ANY (v_seen)) THEN
    RAISE NOTICE 'grievance: fn_my_desk_waiting does not exist; nothing to patch.';
  END IF;
END
$patch$;

-- ---------------------------------------------------------------------
-- 13) "Send back to the normal path" (ruling 9 Oct 2026 23:25 (a))
-- ---------------------------------------------------------------------
-- For a complaint ticked "about the Joint MD" by mistake. Only the Director
-- (the person grievance.escalation.about_joint_md_profile_id names for that
-- college) or a super admin — and NEVER anyone in the Joint MD's seat — may
-- do it. It clears the tick, routes the ticket exactly as a new complaint is
-- routed (fn_grievance_initial_route), restarts its escalation from there,
-- tells the new handler, and records who did it (grievance_history + the
-- ticket's metadata). The refusal for "no such complaint" and "not yours to
-- do" is the same sentence, so the answer reveals nothing.
CREATE OR REPLACE FUNCTION public.fn_grievance_send_back_to_normal_path(p_ticket_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_refuse CONSTANT text := 'This complaint does not exist, or only the Director or a super admin can send it back to the normal path.';
  v_uid    uuid := auth.uid();
  v_t      public.grievance_tickets;
  v_was    public.grievance_tickets;
  v_dir    jsonb;
  v_route  jsonb;
  v_to     uuid;
  v_note   text := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not signed in.');
  END IF;

  SELECT * INTO v_t FROM public.grievance_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', c_refuse);
  END IF;
  IF v_uid = ANY (public.fn_grievance_joint_md_ids(v_t.institution_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', c_refuse);
  END IF;
  v_dir := public.fn_grievance_about_joint_md_target(v_t);
  IF NOT (COALESCE(public.is_super_admin(), false) OR v_uid IS NOT DISTINCT FROM (v_dir ->> 'to')::uuid) THEN
    RETURN jsonb_build_object('success', false, 'error', c_refuse);
  END IF;

  IF NOT COALESCE(v_t.about_joint_md, false) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'This complaint is not marked as about the Joint MD, so there is nothing to send back.');
  END IF;
  IF v_t.status IN ('resolved', 'closed') OR v_t.withdrawn_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'This complaint is already closed or withdrawn. Reopen it first, then send it back.');
  END IF;

  v_was := v_t;
  v_t.about_joint_md   := false;
  v_t.assigned_to      := NULL;
  v_t.escalation_level := 0;
  v_route := public.fn_grievance_initial_route(v_t);
  v_to := (v_route ->> 'assigned_to')::uuid;

  PERFORM set_config('app.grievance_send_back', 'on', true);
  UPDATE public.grievance_tickets
     SET about_joint_md      = false,
         assigned_to         = v_to,
         assigned_at         = CASE WHEN v_to IS NULL THEN NULL ELSE now() END,
         escalation_level    = 0,
         escalated_at        = NULL,
         escalation_deadline = NULL,
         metadata = (COALESCE(metadata, '{}'::jsonb) - 'about_joint_md_hold' - 'escalation_blocked')
                    || jsonb_build_object(
                         'auto_route', v_route -> 'auto_route',
                         'about_joint_md_sent_back', jsonb_build_object(
                           'by', v_uid, 'at', now(), 'note', v_note,
                           'previous_assignee', v_was.assigned_to,
                           'previous_level', v_was.escalation_level))
   WHERE id = v_was.id
   RETURNING * INTO v_t;
  PERFORM set_config('app.grievance_send_back', '', true);

  INSERT INTO public.grievance_history (ticket_id, action, old_value, new_value, performed_by)
  VALUES (v_t.id, 'about_joint_md_sent_back',
          'about the Joint MD; with ' || COALESCE(v_was.assigned_to::text, 'nobody (held)'),
          'normal path; with ' || COALESCE(v_to::text, 'nobody yet') || COALESCE('; note: ' || v_note, ''),
          v_uid);

  -- A failed notice never undoes the send-back.
  BEGIN
    PERFORM public.fn_grievance_notify(v_t, v_to, 'assigned',
      COALESCE((v_route -> 'auto_route' ->> 'level')::integer, 0), v_t.sla_deadline,
      'grievance-sent-back:' || v_t.id::text || ':' || floor(extract(epoch FROM now()))::bigint::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'grievance % sent back to % but the notice failed: %', v_t.ticket_number, v_to, SQLERRM;
  END;

  RETURN jsonb_build_object('success', true, 'ticket_number', v_t.ticket_number,
    'assigned_to', v_to, 'level', v_route -> 'auto_route' -> 'level',
    'reason', v_route -> 'auto_route' ->> 'reason');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_send_back_to_normal_path(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_send_back_to_normal_path(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 14) Self-check
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'grievance_tickets'
                    AND column_name = 'about_joint_md') THEN
    RAISE EXCEPTION 'grievance_tickets.about_joint_md was not added';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'grievance_tickets_hide_about_joint_md'
                    AND polrelid = 'public.grievance_tickets'::regclass AND NOT polpermissive) THEN
    RAISE EXCEPTION 'the restrictive policy hiding complaints about the Joint MD was not created';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'fn_my_desk_waiting'
                AND p.prosrc ILIKE '%grievance_tickets%' AND p.prosrc NOT ILIKE '%about_joint_md%') THEN
    RAISE EXCEPTION 'fn_my_desk_waiting still lists complaints about the Joint MD to the Joint MD';
  END IF;
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
