-- =====================================================================
-- Grievance: route on create, escalate on breach (HOD -> Principal -> Joint MD)
-- Date: 2026-09-28
-- Updated: 2026-10-09 — the "about the Joint MD" tick (Director rulings
--   9 Oct 23:18 and 23:25): column about_joint_md, routing to the Director,
--   hidden from the Joint MD, send-back action (sections 1, 2, 3b, 5, 7, 10-13).
--   NOT applied to production when edited (no ledger row, 9 Oct 23:35).
-- Updated: 2026-10-10 — deep-review fixes (PR #4079): the guard checks "never
--   to the Joint MD" only when the handler changes and refuses setting the
--   tick after filing (section 10); the hiding policies are TO authenticated
--   (11); every read form in the five readers is wrapped and verified (12,
--   14); the hourly run's answer carries no count or row for these (8).
-- Updated: 2026-10-10 — deep review round 2 (PR #4079): RENAMED from
--   20270420090000 to 20271010020000 so it sorts after every migration that
--   (re)defines a reader it patches (20271008110101 rewrote
--   fn_my_desk_waiting); send-back is the Director's alone and gives a fresh
--   SLA (13); the rewriter also repairs schema-qualified column references
--   (12). Never applied anywhere under the old number (no ledger row).
-- Updated: 2026-10-10 — deep review round 3 (PR #4079): THE READER GATE
--   (12b, 14): every function / view / materialized view naming
--   grievance_tickets / _comments / _history must be wrapped or allow-listed
--   with a reason, or the migration fails; THE SWITCH
--   grievance.about_joint_md.hide_from_everyone (2, 3b; default = left out
--   for everyone); get_grievance_sla_stats wrapped and emit_grievance_evidence
--   patched (12); NO held count anywhere — the run reports only whether
--   about-Joint-MD routing is configured (8); escalation never moves a
--   complaint down the chain (8); a held complaint is nobody's work item (9);
--   an empty college row no longer hides the global Director (3b, 13).
-- Updated: 2026-10-10 — deep review round 4 (PR #4079): the configured
--   Director ALWAYS sees these complaints in the patched readers (a held one
--   stays on his My Desk), the Joint MD never, the switch decides only for
--   everyone else; nobody signed in = hidden (fail closed); stored scores
--   and evidence always leave them out (3b, 12); the hourly run handles each
--   ticket in its own sub-transaction and counts failures (8); send-back
--   checks the caller before locking the row (13).
-- Updated: 2026-10-10 — deep review round 5 (PR #4079): one Director
--   resolver (fn_grievance_director_for) that skips a row naming the Joint MD
--   or someone who cannot act; routing metadata is the database's alone (7,
--   10); notices and work items about these complaints name nothing (6, 9);
--   `failed` never counts them (8); a holder who cannot act hands them to the
--   current Director, never the Joint MD, and "configured" means every college
--   has a usable Director (8); they stay in their college unless the Director
--   moves them (10); section 9 is checked against the baseline it came from.
-- Updated: 2026-10-10 — independent review of round 5: notices and work
--   items about these complaints are CONFIDENTIAL — no ticket id anywhere,
--   and RESTRICTIVE policies on notifications / user_notifications let only
--   their recipient see, update or delete them (6, 9, 11b); the hourly run
--   reads its switch without recording a policy_gate_observations row (8); a
--   held one goes to the Director as soon as one resolves, every run (8);
--   send-back leaves only a neutral history line (13).
-- KNOWN OPEN ITEM (parked for the Director, round 2 H2): who holds the Joint
--   MD's seat is read from the policy rows grievance.escalation.
--   director_profile_id and instasolver.complaint.superior_route_to, and who
--   is the Director from grievance.escalation.about_joint_md_profile_id. Any
--   super admin can edit those rows today, so a super admin (the Joint MD
--   included) can move herself out of the seat or redirect the Director.
--   Not locked here. The round-3 switch row is a fourth such row.
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
--                    count (sections 8, 12) — not even complaints held with
--                    nobody handling them are counted. Only the Director
--                    can "send it back to the normal path" (section 13).
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
  'When fn_grievance_escalation_tick last moved this ticket up the chain (HOD -> Principal -> the Joint MD). NULL = never escalated.';
COMMENT ON COLUMN public.grievance_tickets.escalation_deadline IS
  'The deadline of the CURRENT escalation level (now + grievance.escalation.level<N>_hours when it moved up). Passing it moves the ticket up one more level. sla_deadline stays the original SLA.';

-- The complainant's tick "This complaint is about the Joint MD" (Director
-- ruling 9 Oct 2026 23:18). A real column, not metadata, because row-level
-- security reads it (section 11). Only fn_grievance_send_back_to_normal_path
-- may clear it (section 13).
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS about_joint_md boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.grievance_tickets.about_joint_md IS
  'The complainant ticked "This complaint is about the Joint MD". Such a ticket goes to the Director (policy grievance.escalation.about_joint_md_profile_id), never to the Joint MD; the Joint MD cannot see it, count it or be told about it. Cleared only by fn_grievance_send_back_to_normal_path (the Director alone), which re-routes it the normal way. Migration 20271010020000.';

-- ---------------------------------------------------------------------
-- 2) Policies (seeded once; never overwrite a value someone has set)
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT 'grievance.escalation.enabled', 'global', NULL, to_jsonb(true),
  'Master switch for automatic grievance escalation. On: a complaint that passes its deadline unresolved moves up one level (HOD, then Principal, then the Joint MD), is reassigned to that person, who gets an in-app notice and a new deadline. Off: nothing is escalated (overdue tickets are still marked breached). Can be set per college.',
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

-- THE SWITCH (parked card [00:30]; recommended option = true). Who must not
-- see complaints about the Joint MD in the readers that skip row-level
-- security (dashboard / My Desk / leaderboard / SLA-stat counts and lists,
-- NAAC evidence)?
--   true  (recommended): EVERYONE except the Director. They are left out of
--         every count, total, list and scoreboard the patched readers give
--         anybody else.
--   false (the other option): only the Joint MD; everyone else's counts and
--         lists include them.
-- Under BOTH values (deep review round 4): the configured Director always
-- sees them (his My Desk, his dashboard counts, his work item); the Joint MD
-- never does; a reader with nobody signed in (scheduled refreshes, stored
-- scores) leaves them out — fail closed; the stored leaderboard scores
-- (fn_compute_ohs_for_institution, fn_compute_dhs_for_user) and NAAC/UGC
-- evidence always leave them out, because whoever reads those later cannot be
-- checked (fn_grievance_jmd_hidden_for, section 3b).
-- Read from the GLOBAL row only (no per-user or per-college override), at
-- query time: flipping this one row flips every patched reader at once.
-- Service-role readers in the app (B2A, MCP, report cards) leave them out
-- under EITHER value: they cannot prove their viewer is not the Joint MD.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   classification, ui_category, is_system, is_active, publication_state)
SELECT 'grievance.about_joint_md.hide_from_everyone', 'global', NULL, to_jsonb(true),
  'Complaints marked "about the Joint MD": true (recommended) = left out of the counts and lists of everyone except the Director; false = hidden from the Joint MD only. Either way the Director always sees them, the Joint MD never does, readers with nobody signed in leave them out, and stored leaderboard scores, NAAC/UGC evidence and app service-role readers (B2A API, MCP, report cards) always leave them out. Global only.',
  'boolean', 'major', 'accreditation', true, true, 'published'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_policies
                   WHERE policy_key = 'grievance.about_joint_md.hide_from_everyone' AND scope_type = 'global' AND scope_id IS NULL);

-- Who receives a complaint ABOUT the Joint MD: the Director (ruling 9 Oct
-- 2026 23:18). Seeded from the ONE confirmed, not-deleted auth account for
-- director@jkkn.ac.in that has a profile (the Director's own account in the
-- 30 Sep "Director list" ruling, read the same way 20270520090000 reads it).
-- Anything else (no such account, more than one, or a database without
-- auth.users) seeds an EMPTY value: those complaints are then saved and HELD,
-- readable in the complaint list (row-level security) by super admins other
-- than the Joint MD, until the Director sets it; the hourly run reports
-- "about-Joint-MD routing is not configured".
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
    RAISE NOTICE 'grievance: % verified account(s) for director@jkkn.ac.in; grievance.escalation.about_joint_md_profile_id is seeded EMPTY (complaints about the Joint MD are held, unassigned, until it is set).', v_n;
    v_id := '';
  END IF;

  INSERT INTO public.platform_policies
    (policy_key, scope_type, scope_id, value, description, data_type,
     classification, ui_category, is_system, is_active, publication_state)
  VALUES
    ('grievance.escalation.about_joint_md_profile_id', 'global', NULL, to_jsonb(v_id),
     'The profile id of THE DIRECTOR, who receives every complaint the complainant marked "This complaint is about the Joint MD" (ruling 9 Oct 2026). Such a complaint skips HOD, Principal and the Joint MD entirely. Empty, inactive, a test profile, or the same person as the Joint MD = the complaint is saved and HELD (readable in the complaint list by super admins except the Joint MD) until this is set; it is never sent to the Joint MD. Can be set per college.',
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

-- Does the Joint MD's seat for one college RESOLVE: does at least one active
-- seat row (either key above; this college's or the global one) name a
-- profile that exists? When it does not (both settings unset, switched off,
-- or naming nobody), nobody can be hidden FROM, so every rule fails CLOSED:
-- complaints about the Joint MD there are visible only to the Director who
-- would handle them (and to the person who filed them), routing goes only to
-- that Director, and the run reports routing as not configured (panel on
-- 37a9c4fa1c, MEDIUM 2).
CREATE OR REPLACE FUNCTION public.fn_grievance_joint_md_seat_known(p_institution uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = ANY (public.fn_grievance_joint_md_ids(p_institution)))
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_joint_md_seat_known(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_joint_md_seat_known(uuid) TO service_role;

-- The same for every college at once, and for a ticket with no college (the
-- global rows): the comments / history policies' fast path, true whenever the
-- settings are in order, so they look no ticket up.
CREATE OR REPLACE FUNCTION public.fn_grievance_joint_md_seat_known_everywhere()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_grievance_joint_md_seat_known(NULL::uuid)
     AND NOT EXISTS (SELECT 1 FROM public.institutions i
                     WHERE NOT public.fn_grievance_joint_md_seat_known(i.id))
$$;
-- ci:allow-secdef-authenticated the RESTRICTIVE policies on grievance_comments / grievance_history call fn_grievance_joint_md_seat_known_everywhere() once per statement for every signed-in reader; it takes no argument and answers only whether the Joint MD's seat settings resolve in every college — a fact about configuration, never about a complaint.
REVOKE EXECUTE ON FUNCTION public.fn_grievance_joint_md_seat_known_everywhere() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_joint_md_seat_known_everywhere() TO authenticated, service_role;

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
-- ci:allow-secdef-authenticated row-level security on grievance_tickets / _comments / _history calls fn_grievance_caller_joint_md_scope() for EVERY signed-in reader, so it must be executable by authenticated. It takes no argument and only says which colleges the CALLER holds the Joint MD's seat in (empty for everyone else); fn_grievance_ticket_hidden_from_caller(id) only answers true for that same caller on a complaint about her. The one function here that acts, fn_grievance_send_back_to_normal_path, is the Director's alone (the profile grievance.escalation.about_joint_md_profile_id names; no super-admin shortcut) and refuses the Joint MD in its body.
REVOKE EXECUTE ON FUNCTION public.fn_grievance_caller_joint_md_scope() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_caller_joint_md_scope() TO authenticated, service_role;

-- The switch above, as a boolean (missing, or not a boolean = true, the
-- recommended option).
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_hide_from_everyone()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT CASE WHEN jsonb_typeof(pp.value) = 'boolean' THEN (pp.value)::boolean END
                   FROM public.platform_policies pp
                   WHERE pp.policy_key = 'grievance.about_joint_md.hide_from_everyone'
                     AND pp.scope_type = 'global' AND pp.scope_id IS NULL AND pp.is_active
                   LIMIT 1), true)
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_hide_from_everyone() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_jmd_hide_from_everyone() TO service_role;

-- The Director for one college: the profile grievance.escalation.
-- about_joint_md_profile_id names (this college's row first, then the global
-- one). A row is SKIPPED when it names nobody, names someone in the Joint MD's
-- seat, or names someone who cannot act (inactive, login disabled, a test
-- profile): the lookup falls through to the global Director (deep review
-- round 5). NULL = no usable Director: routing is "not configured".
-- p_exclude (the people who filed a complaint) is left out FIRST, so a
-- college Director who filed it falls through to the global Director rather
-- than holding it (panel on 37a9c4fa1c, MEDIUM 6). Only when every Director
-- is left out is the complaint held (a known open item).
CREATE OR REPLACE FUNCTION public.fn_grievance_director_for(p_institution uuid, p_exclude uuid[])
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_grievance_policy_profile_id(pp.value)
  FROM public.platform_policies pp
  WHERE pp.is_active
    AND pp.policy_key = 'grievance.escalation.about_joint_md_profile_id'
    AND ((pp.scope_type = 'institution' AND pp.scope_id = p_institution)
      OR (pp.scope_type = 'global' AND pp.scope_id IS NULL))
    AND public.fn_grievance_policy_profile_id(pp.value) IS NOT NULL
    AND NOT (public.fn_grievance_policy_profile_id(pp.value) = ANY (COALESCE(p_exclude, '{}'::uuid[])))
    AND NOT (public.fn_grievance_policy_profile_id(pp.value) = ANY (public.fn_grievance_joint_md_ids(p_institution)))
    AND public.fn_grievance_profile_unusable(public.fn_grievance_policy_profile_id(pp.value)) IS NULL
  ORDER BY CASE pp.scope_type WHEN 'institution' THEN 1 ELSE 2 END
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_director_for(uuid, uuid[]) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_director_for(uuid, uuid[]) TO service_role;

-- With nobody left out: who the Director of a college IS (permissions,
-- send-back, the patched readers).
CREATE OR REPLACE FUNCTION public.fn_grievance_director_for(p_institution uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_grievance_director_for(p_institution, '{}'::uuid[])
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_director_for(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_director_for(uuid) TO service_role;

-- May the SIGNED-IN caller see a complaint about the Joint MD in this college?
--   1. the caller holds the Joint MD's seat there            -> no, always;
--   2. the seat resolves                                      -> yes (the
--      existing policies decide, exactly as before);
--   3. the seat does NOT resolve (fail closed, MEDIUM 2)      -> only the
--      Director who would handle it (fn_grievance_director_for, the filer
--      left out) and the person who filed it — their own complaint, which
--      they could not even save if this refused them.
-- Nobody signed in -> no.
CREATE OR REPLACE FUNCTION public.fn_grievance_caller_may_see_about_jmd(p_institution uuid, p_raised_by uuid, p_filed_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN (SELECT public.fn_grievance_caller_joint_md_scope())
         && ARRAY[p_institution, '00000000-0000-0000-0000-000000000000'::uuid] THEN false
    WHEN public.fn_grievance_joint_md_seat_known(p_institution) THEN true
    WHEN auth.uid() = p_raised_by OR auth.uid() = p_filed_by THEN true
    WHEN auth.uid() = public.fn_grievance_director_for(p_institution, array_remove(ARRAY[p_raised_by, p_filed_by], NULL)) THEN true
    ELSE false
  END
$$;
-- ci:allow-secdef-authenticated row-level security on grievance_tickets calls fn_grievance_caller_may_see_about_jmd(institution_id, raised_by_id, filed_by) on every complaint about the Joint MD for every signed-in reader; it takes no ticket id and answers only whether the CALLER may see such a complaint in that college (no when she holds the Joint MD's seat; when the seat cannot be resolved, only the Director and the filer).
REVOKE EXECUTE ON FUNCTION public.fn_grievance_caller_may_see_about_jmd(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_caller_may_see_about_jmd(uuid, uuid, uuid) TO authenticated, service_role;

-- Is a complaint about the Joint MD in this college hidden from the CALLER of
-- a patched reader (section 12)? In this order (deep review round 4, H1/M3):
--   1. the caller holds the Joint MD's seat there      -> hidden, always;
--   2. the caller IS that college's Director            -> shown, always (his
--      own desk and counts are his path; the switch never touches them);
--   2b. the Joint MD's seat there does not resolve      -> hidden (fail
--      closed: we cannot tell who she is; MEDIUM 2);
--   3. the switch says "hidden from everyone" (default) -> hidden;
--   4. nobody can be resolved (no signed-in caller: a scheduled refresh, a
--      stored score, the service role)                 -> hidden (fail closed);
--   5. anyone else, under the other option              -> shown.
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_hidden_for(p_institution uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL
         AND (SELECT public.fn_grievance_caller_joint_md_scope())
             && ARRAY[p_institution, '00000000-0000-0000-0000-000000000000'::uuid] THEN true
    WHEN auth.uid() IS NOT NULL
         AND auth.uid() = public.fn_grievance_director_for(p_institution)       THEN false
    WHEN NOT public.fn_grievance_joint_md_seat_known(p_institution)              THEN true
    WHEN public.fn_grievance_jmd_hide_from_everyone()                            THEN true
    WHEN auth.uid() IS NULL                                                      THEN true
    ELSE false
  END
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_hidden_for(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_jmd_hidden_for(uuid) TO service_role;

-- The metadata keys only the database writes (routing, escalation, holds,
-- send-back). Client values under them are dropped on INSERT and ignored on
-- UPDATE (round 5, M4).
CREATE OR REPLACE FUNCTION public.fn_grievance_system_metadata_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['auto_route', 'escalations', 'escalation_blocked', 'escalation_error',
               'about_joint_md_hold', 'about_joint_md_sent_back']
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_system_metadata_keys() FROM anon, authenticated, PUBLIC;

-- A boolean setting read WITHOUT recording a policy_gate_observations row
-- (fn_get_policy, not fn_get_policy_bool), for the hourly run (round 6).
CREATE OR REPLACE FUNCTION public.fn_grievance_policy_flag(p_key text, p_default boolean, p_scope uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(CASE jsonb_typeof(x.v)
                    WHEN 'boolean' THEN (x.v)::boolean
                    WHEN 'string'  THEN lower(x.v #>> '{}') IN ('true', 't', '1', 'yes', 'on')
                  END, p_default)
  FROM (SELECT public.fn_get_policy(p_key, p_scope) AS v) AS x
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_policy_flag(text, boolean, uuid) FROM anon, authenticated, PUBLIC;

-- Records why the hourly run could not process one ticket (round 4, M5).
-- Best effort: a row that refuses even this write keeps its error in the
-- run's `failed` count.
CREATE OR REPLACE FUNCTION public.fn_grievance_tick_record_failure(p_id uuid, p_step text, p_error text, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.grievance_tickets
     SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object('escalation_error', jsonb_build_object('step', p_step, 'error', left(p_error, 500), 'at', p_at))
   WHERE id = p_id;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_tick_record_failure(uuid, text, text, timestamptz) FROM anon, authenticated, PUBLIC;


-- Who handles one complaint about the Joint MD: {to, role, via, reason} —
-- the ICC chair for an ICC-only one (MEDIUM 3), else the Director.
-- fn_grievance_director_for above (policy rows only; no per-user row can
-- redirect it). Never the Joint MD, never someone who cannot act, never the
-- person who filed it.
CREATE OR REPLACE FUNCTION public.fn_grievance_about_joint_md_target(p_t public.grievance_tickets)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exclude uuid[] := array_remove(ARRAY[p_t.raised_by_id, p_t.filed_by], NULL);
  v_jmd     uuid[] := public.fn_grievance_joint_md_ids(p_t.institution_id);
  v_to      uuid;
  v_head    uuid;
  v_why     text;
  v_seen    uuid;
  v_note    text := '';
BEGIN
  -- ICC FIRST (panel on 37a9c4fa1c, MEDIUM 3): under POSH the Internal
  -- Committee is the statutory handler, so an ICC-only complaint follows the
  -- ICC path even when ticked: the college's active ICC chair — never the
  -- Joint MD, never the filer, never someone who cannot act. Every hiding
  -- rule still applies. Only while the Joint MD's seat resolves: otherwise we
  -- cannot tell whether the chair is her, and it goes to the Director (fail
  -- closed, MEDIUM 2). Pending the Director's confirmation on his card.
  IF COALESCE(p_t.is_icc_only, false) THEN
    IF public.fn_grievance_joint_md_seat_known(p_t.institution_id) THEN
      SELECT ac.chair_user_id INTO v_head
      FROM public.accreditation_committees ac
      WHERE ac.institution_id = p_t.institution_id
        AND ac.committee_type = 'icc' AND ac.is_active
        AND ac.chair_user_id IS NOT NULL
      ORDER BY ac.formed_at DESC
      LIMIT 1;
      v_why := public.fn_grievance_profile_unusable(v_head, v_exclude);
      IF v_why IS NULL AND v_head = ANY (v_jmd) THEN
        v_why := 'holds_the_joint_md_seat';
      END IF;
      IF v_why IS NULL THEN
        RETURN jsonb_build_object('to', v_head, 'role', 'icc_chair', 'via', 'icc_chair', 'reason', NULL);
      END IF;
      v_note := 'icc_chair_' || v_why || '; ';
    ELSE
      v_note := 'icc_chair_skipped_joint_md_seat_unresolved; ';
    END IF;
  END IF;

  -- The one resolver (fn_grievance_director_for), the filer left out first
  -- (MEDIUM 6): a college row naming the filer, the Joint MD, or someone who
  -- cannot act falls through to the global Director.
  v_to := public.fn_grievance_director_for(p_t.institution_id, v_exclude);
  IF v_to IS NOT NULL THEN
    RETURN jsonb_build_object('to', v_to, 'role', 'the_director', 'via', 'about_joint_md_policy', 'reason', NULL);
  END IF;

  -- Say why nobody is usable: the first row that names someone at all.
  SELECT public.fn_grievance_policy_profile_id(pp.value) INTO v_seen
  FROM public.platform_policies pp
  WHERE pp.is_active
    AND pp.policy_key = 'grievance.escalation.about_joint_md_profile_id'
    AND ((pp.scope_type = 'institution' AND pp.scope_id = p_t.institution_id)
      OR (pp.scope_type = 'global' AND pp.scope_id IS NULL))
    AND public.fn_grievance_policy_profile_id(pp.value) IS NOT NULL
  ORDER BY CASE pp.scope_type WHEN 'institution' THEN 1 ELSE 2 END
  LIMIT 1;
  IF v_seen IS NULL THEN
    RETURN jsonb_build_object('to', NULL,
      'reason', v_note || 'no_director_set (policy grievance.escalation.about_joint_md_profile_id)');
  END IF;
  IF v_seen = ANY (v_jmd) THEN
    RETURN jsonb_build_object('to', NULL, 'reason', v_note || 'director_policy_names_the_joint_md');
  END IF;
  RETURN jsonb_build_object('to', NULL,
    'reason', v_note || 'director_' || COALESCE(public.fn_grievance_profile_unusable(v_seen, v_exclude), 'unusable'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_about_joint_md_target(public.grievance_tickets) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_about_joint_md_target(public.grievance_tickets) TO service_role;

-- A fresh deadline for whoever a complaint about the Joint MD is handed to,
-- computed the way send-back computes one (section 13): the ticket's SLA
-- hours (else its category's, else 72) through calculate_grievance_sla_deadline
-- when it exists (panel on 37a9c4fa1c, MEDIUM 5).
CREATE OR REPLACE FUNCTION public.fn_grievance_fresh_deadline(p_t public.grievance_tickets)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
  v_due   timestamptz;
BEGIN
  v_hours := GREATEST(COALESCE(p_t.sla_hours,
               (SELECT c.default_sla_hours FROM public.grievance_categories c WHERE c.id = p_t.category_id),
               72), 1);
  IF to_regprocedure('public.calculate_grievance_sla_deadline(uuid,integer,timestamptz)') IS NOT NULL THEN
    v_due := public.calculate_grievance_sla_deadline(p_t.institution_id, v_hours, now());
  END IF;
  RETURN COALESCE(v_due, now() + make_interval(hours => v_hours));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_fresh_deadline(public.grievance_tickets) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_fresh_deadline(public.grievance_tickets) TO service_role;

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
    -- ICC first: the statutory handler (panel on 37a9c4fa1c, MEDIUM 3)
    WHEN COALESCE(p_t.is_icc_only, false)  THEN 'icc_only'
    WHEN COALESCE(p_t.about_joint_md, false) THEN 'about_joint_md'
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
  -- is the DIRECTOR — or, for an ICC-only one, the ICC chair (MEDIUM 3). The
  -- Joint MD's policy below is unreachable for it.
  IF COALESCE(p_t.about_joint_md, false) THEN
    IF p_level < 3 THEN
      RETURN jsonb_build_object('level', p_level, 'role', v_role, 'to', NULL,
                                'reason', 'about_joint_md_skips_' || v_role);
    END IF;
    v_raw := public.fn_grievance_about_joint_md_target(p_t);
    RETURN jsonb_build_object('level', 3, 'role', COALESCE(v_raw ->> 'role', 'the_director'), 'to', v_raw -> 'to',
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
  v_conf  boolean := COALESCE(p_t.about_joint_md, false);
BEGIN
  IF p_to IS NULL THEN RETURN NULL; END IF;

  -- Never tell the Joint MD about a complaint about the Joint MD (ruling
  -- 9 Oct 2026: not a row, not a count, not a notice). Routing already never
  -- picks them; this is the last door.
  IF COALESCE(p_t.about_joint_md, false)
     AND p_to = ANY (public.fn_grievance_joint_md_ids(p_t.institution_id)) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(p_t.about_joint_md, false) THEN
    -- No subject, description or ticket number (deep review round 5, M5):
    -- the link opens it for the Director, whom row-level security lets in.
    v_title := 'A confidential complaint needs your review';
    v_body  := 'A confidential complaint has been sent to you. Please respond by ' || v_when || '. Open this notice to see it.';
  ELSIF p_kind = 'escalated' THEN
    v_title := 'Overdue complaint ' || p_t.ticket_number || ' has moved up to you';
    v_body  := '"' || left(p_t.subject, 120) || '" passed its deadline without being resolved, so it is now yours to act on. Please respond by ' || v_when || '. Open this notice to see it.';
  ELSE
    v_title := 'New complaint ' || p_t.ticket_number || ' is yours to handle';
    v_body  := '"' || left(p_t.subject, 120) || '" was filed and sent to you. Please respond by ' || v_when || '. Open this notice to see it.';
  END IF;

  -- A complaint about the Joint MD (round 6): a CONFIDENTIAL notice. It names
  -- no ticket anywhere — not in the url (the complaints list, where the
  -- Director's own row-level security shows it), not in the targeting or the
  -- metadata, not in the dedupe key (hashed) — and metadata.confidential lets
  -- the RESTRICTIVE policies below show and change it for its recipient only.
  INSERT INTO public.notifications
    (title, body, url, created_by, targeting, priority, category, metadata,
     requires_acknowledgment, expires_at, idempotency_key)
  VALUES
    (v_title, v_body,
     CASE WHEN v_conf THEN '/accreditation/naac/grievance'
          ELSE '/accreditation/naac/grievance/' || p_t.id::text END,
     p_to,
     CASE WHEN v_conf THEN jsonb_build_object('type', 'user', 'user_ids', jsonb_build_array(p_to))
          ELSE jsonb_build_object('type', 'grievance_' || p_kind, 'ticket_id', p_t.id) END,
     CASE WHEN p_kind = 'escalated' AND p_level >= 2 THEN 'urgent' ELSE 'high' END,
     'grievance:' || p_kind,
     CASE WHEN v_conf THEN jsonb_build_object('kind', 'grievance_confidential', 'confidential', true,
                                              'source', 'grievance_escalation')
          ELSE jsonb_build_object('kind', 'grievance_' || p_kind, 'ticket_id', p_t.id,
                                  'ticket_number', p_t.ticket_number, 'level', p_level,
                                  'source', 'grievance_escalation') END,
     false,
     now() + interval '30 days',
     CASE WHEN v_conf THEN 'grievance-confidential:' || md5(p_key) ELSE p_key END)
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
  -- Routing and escalation metadata is written by the database alone (deep
  -- review round 5, M4): whatever the client sent under these keys is dropped
  -- before anything reads it, so a forged auto_route cannot skip routing,
  -- fire the "it is yours" notice, or park the ticket at the ceiling.
  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - public.fn_grievance_system_metadata_keys();

  -- About the Joint MD: always the Director (the ICC chair for an ICC-only
  -- one), or HELD with the reason, whatever assignee the insert named (it can
  -- never be left with the Joint MD).
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
                              'role', COALESCE(v_res ->> 'role', 'the_director'), 'via', v_res ->> 'via',
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
    RAISE WARNING 'grievance % routed to % but the notice failed: %',
      CASE WHEN COALESCE(NEW.about_joint_md, false) THEN 'a confidential complaint' ELSE NEW.ticket_number END,
      NEW.assigned_to, SQLERRM;
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
-- A complaint about the Joint MD is processed like any other (stamped,
-- escalated to the Director) but is left out of EVERY number and of the
-- `tickets` list this answer carries: the cron route shows them on the
-- dispatcher status line and in its logs, which the Joint MD can read as a
-- super admin, and not even a count may reach her (deep review of #4079, M6).
-- Its outcome is on the ticket itself (metadata.escalations /
-- escalation_blocked), which she cannot read.
-- Nothing in this answer counts them — not even complaints held with nobody
-- handling them (round 3, M3: a held count reached super admins through the
-- cron's JSON, status line and logs). Instead the answer says whether
-- about-the-Joint-MD routing is CONFIGURED (a usable Director is named in the
-- global setting): a fact about configuration, never about tickets.
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
  v_show       boolean;
  v_cfg_ok     boolean;
  v_hold_lvl   integer;
  v_failed     integer := 0;
  v_err        text;
  v_nadd       integer;
  v_nfadd      integer;
  v_on_by_college jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'the grievance escalation run is started by the scheduler, not by a person' USING ERRCODE = '42501';
  END IF;

  -- one run at a time: a manual run and the scheduled one cannot interleave
  PERFORM pg_advisory_xact_lock(hashtext('grievance_escalation_tick'));
  -- its writes to routing / escalation metadata are the database's own (M4)
  PERFORM set_config('app.grievance_system_write', 'on', true);

  -- 1) Breach stamping — what the hourly route always did; not switchable.
  --    Complaints about the Joint MD are stamped too, but not counted.
  --    One bad row (a legacy row failing a NOT VALID check, a trigger) must
  --    not cost every college its stamps: if the bulk UPDATE fails, each
  --    ticket is stamped on its own and a failure is recorded on it
  --    (deep review round 4, M5).
  IF v_dry THEN
    SELECT count(*) INTO v_stamped
    FROM public.grievance_tickets
    WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened')
      AND resolved_at IS NULL AND withdrawn_at IS NULL
      AND sla_breached_at IS NULL AND sla_deadline < v_now
      AND NOT COALESCE(about_joint_md, false);
  ELSE
    BEGIN
      WITH stamped AS (
        UPDATE public.grievance_tickets
           SET sla_breached_at = v_now, sla_status = 'breached'
         WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened')
           AND resolved_at IS NULL AND withdrawn_at IS NULL
           AND sla_breached_at IS NULL AND sla_deadline < v_now
        RETURNING about_joint_md
      )
      SELECT count(*) FILTER (WHERE NOT COALESCE(about_joint_md, false)) INTO v_stamped FROM stamped;
    EXCEPTION WHEN OTHERS THEN
      v_stamped := 0;
      FOR v_t IN
        SELECT * FROM public.grievance_tickets
        WHERE status IN ('open', 'in_progress', 'pending_info', 'reopened')
          AND resolved_at IS NULL AND withdrawn_at IS NULL
          AND sla_breached_at IS NULL AND sla_deadline < v_now
      LOOP
        v_show := NOT COALESCE(v_t.about_joint_md, false);
        BEGIN
          UPDATE public.grievance_tickets
             SET sla_breached_at = v_now, sla_status = 'breached'
           WHERE id = v_t.id;
          IF v_show THEN v_stamped := v_stamped + 1; END IF;
        EXCEPTION WHEN OTHERS THEN
          v_err := SQLERRM;
          IF v_show THEN
            v_failed := v_failed + 1;
            v_rows := v_rows || jsonb_build_array(jsonb_build_object(
              'ticket', v_t.ticket_number, 'outcome', 'failed', 'step', 'breach_stamp', 'error', v_err));
          END IF;
          PERFORM public.fn_grievance_tick_record_failure(v_t.id, 'breach_stamp', v_err, v_now);
        END;
      END LOOP;
    END;
  END IF;

  -- The switch is read ONCE per run, per college, through a read that records
  -- nothing (fn_get_policy, not fn_get_policy_bool): policy_gate_observations,
  -- which super admins read, must not count overdue tickets (round 6).
  v_enabled := public.fn_grievance_policy_flag('grievance.escalation.enabled', false, NULL);
  SELECT COALESCE(jsonb_object_agg(i.id::text, public.fn_grievance_policy_flag('grievance.escalation.enabled', false, i.id)), '{}'::jsonb)
    INTO v_on_by_college
  FROM public.institutions i;

  -- 2) Escalation. Each ticket in its own sub-transaction: one that fails is
  --    rolled back alone, recorded on the ticket (metadata.escalation_error)
  --    and counted in `failed`; the run carries on (round 4, M5). A complaint
  --    about the Joint MD that fails is recorded ONLY on its own ticket: not
  --    counted, not listed (round 5, M1).
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
    v_show := NOT COALESCE(v_t.about_joint_md, false);   -- counted and listed only when true (M6)

    -- A complaint about the Joint MD, EVERY run, whatever its deadline or the
    -- switch. Its handler is fn_grievance_about_joint_md_target: the ICC chair
    -- for an ICC-only one (MEDIUM 3), else the Director (the filer left out,
    -- MEDIUM 6). Whenever the holder is NOT that handler — held, the holder
    -- now sits in the Joint MD's seat (a Director named to it), cannot act,
    -- or is anyone else — it is handed to the handler with a FRESH deadline
    -- (MEDIUM 5); with no handler, a holder is taken off it and it is HELD
    -- (MEDIUM 1). Never counted, never listed.
    IF NOT v_show THEN
      BEGIN
        v_res := public.fn_grievance_about_joint_md_target(v_t);
        v_to  := (v_res ->> 'to')::uuid;
        IF v_to IS NOT NULL AND v_t.assigned_to IS DISTINCT FROM v_to THEN
          v_deadline := public.fn_grievance_fresh_deadline(v_t);
          v_event := jsonb_build_object('level', 3, 'role', COALESCE(v_res ->> 'role', 'the_director'),
            'to', v_to, 'via', v_res ->> 'via', 'at', v_now, 'deadline', v_deadline, 'from_level', v_from,
            'previous_assignee', v_t.assigned_to,
            'reason', CASE WHEN v_t.assigned_to IS NULL THEN 'handed_over'
                           WHEN v_t.assigned_to = ANY (public.fn_grievance_joint_md_ids(v_t.institution_id)) THEN 'holder_holds_the_joint_md_seat'
                           WHEN public.fn_grievance_profile_unusable(v_t.assigned_to) IS NOT NULL THEN 'holder_cannot_act'
                           ELSE 'holder_is_not_its_handler' END);
          IF NOT v_dry THEN
            UPDATE public.grievance_tickets
               SET assigned_to = v_to, assigned_at = v_now, escalated_at = v_now,
                   escalation_level = GREATEST(COALESCE(escalation_level, 0), 3),
                   escalation_deadline = v_deadline,
                   metadata = (COALESCE(metadata, '{}'::jsonb) - 'about_joint_md_hold' - 'escalation_blocked' - 'escalation_error')
                              || jsonb_build_object('auto_route', jsonb_build_object(
                                   'assigned_to', v_to, 'level', 3, 'role', COALESCE(v_res ->> 'role', 'the_director'),
                                   'via', v_res ->> 'via', 'reason', 'about_joint_md', 'at', v_now))
                              || jsonb_build_object('escalations',
                                   COALESCE(metadata -> 'escalations', '[]'::jsonb) || jsonb_build_array(v_event))
             WHERE id = v_t.id;
            BEGIN
              PERFORM public.fn_grievance_notify(v_t, v_to,
                CASE WHEN v_t.assigned_to IS NULL THEN 'assigned' ELSE 'escalated' END, 3, v_deadline,
                CASE WHEN v_t.assigned_to IS NULL THEN 'grievance-handed-to-director:' ELSE 'grievance-rerouted:' END
                  || v_t.id::text || ':' || v_to::text);
            EXCEPTION WHEN OTHERS THEN
              UPDATE public.grievance_tickets
                 SET metadata = jsonb_set(metadata, '{escalations,-1,notify_error}', to_jsonb(SQLERRM))
               WHERE id = v_t.id;
            END;
          END IF;
          CONTINUE;
        END IF;
        IF v_to IS NULL AND v_t.assigned_to IS NOT NULL THEN
          -- Nobody can take it: off the holder (who may now be the Joint MD)
          -- and HELD until a handler resolves.
          IF NOT v_dry THEN
            UPDATE public.grievance_tickets
               SET assigned_to = NULL, assigned_at = NULL,
                   metadata = (COALESCE(metadata, '{}'::jsonb) - 'escalation_error')
                              || jsonb_build_object('about_joint_md_hold',
                                   jsonb_build_object('reason', v_res ->> 'reason', 'at', v_now))
                              || jsonb_build_object('escalations',
                                   COALESCE(metadata -> 'escalations', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                                     'level', NULL, 'to', NULL, 'at', v_now, 'from_level', v_from,
                                     'previous_assignee', v_t.assigned_to, 'reason', 'held: ' || COALESCE(v_res ->> 'reason', ''))))
             WHERE id = v_t.id;
          END IF;
          CONTINUE;
        END IF;
        -- With its handler, or held with nobody to take it: carry on below
        -- (at the ceiling, or the block is written once on the ticket).
      EXCEPTION WHEN OTHERS THEN
        IF NOT v_dry THEN
          PERFORM public.fn_grievance_tick_record_failure(v_t.id, 'about_joint_md', SQLERRM, v_now);
        END IF;
        CONTINUE;
      END;
    END IF;

    CONTINUE WHEN v_due IS NULL OR v_due >= v_now;   -- not overdue at its current level

    BEGIN
      IF NOT COALESCE((v_on_by_college ->> v_t.institution_id::text)::boolean, v_enabled) THEN
        IF v_show THEN v_off := v_off + 1; END IF;
        CONTINUE;
      END IF;

      IF v_from >= 3 THEN
        IF v_show THEN
          v_ceiling := v_ceiling + 1;
          v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'at_ceiling'));
        END IF;
        CONTINUE;
      END IF;

      -- Start above the create-time handler, while that person still holds it.
      v_base := v_from;
      IF v_t.assigned_to IS NOT NULL
         AND (v_t.metadata -> 'auto_route' ->> 'assigned_to') = v_t.assigned_to::text
         AND (v_t.metadata -> 'auto_route' ->> 'level') ~ '^[0-9]+$' THEN
        v_base := GREATEST(v_base, (v_t.metadata -> 'auto_route' ->> 'level')::integer);
      END IF;
      -- ...and above whichever chain level the CURRENT holder sits at, however
      -- the ticket reached them (a hand reassignment to the Principal must not
      -- send it back down to the HOD; deep review round 3, M5).
      IF v_t.assigned_to IS NOT NULL AND v_base < 3 THEN
        v_hold_lvl := NULL;
        FOR v_lvl IN REVERSE 3 .. GREATEST(v_base + 1, 1) LOOP
          IF (public.fn_grievance_level_target(v_t, v_lvl) ->> 'to') = v_t.assigned_to::text THEN
            v_hold_lvl := v_lvl;
            EXIT;
          END IF;
        END LOOP;
        v_base := GREATEST(v_base, COALESCE(v_hold_lvl, 0));
      END IF;

      -- Already with the top level from the moment it was filed (a complaint
      -- about the Joint MD, routed to the Director): nothing is above it.
      IF v_base >= 3 THEN
        IF v_show THEN
          v_ceiling := v_ceiling + 1;
          v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'at_ceiling'));
        END IF;
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
        -- Recorded once per level, not every hour.
        IF NOT v_dry AND (v_t.metadata -> 'escalation_blocked' ->> 'from_level') IS DISTINCT FROM v_from::text THEN
          UPDATE public.grievance_tickets
             SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('escalation_blocked',
                   jsonb_build_object('from_level', v_from, 'at', v_now, 'skipped', v_skipped))
           WHERE id = v_t.id;
        END IF;
        IF v_show THEN
          v_no_target := v_no_target + 1;
          v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'no_target', 'skipped', v_skipped));
        END IF;
        CONTINUE;
      END IF;

      v_hours := GREATEST(COALESCE(public.fn_get_policy_int('grievance.escalation.level' || v_lvl || '_hours',
                   CASE v_lvl WHEN 3 THEN 72 ELSE 48 END, v_t.institution_id), 48), 1);
      v_deadline := v_now + make_interval(hours => v_hours);
      v_event := jsonb_build_object(
        'level', v_lvl, 'role', COALESCE(v_res ->> 'role', CASE v_lvl WHEN 1 THEN 'hod' WHEN 2 THEN 'principal' ELSE 'director' END),
        'to', v_to, 'via', v_via, 'at', v_now, 'deadline', v_deadline,
        'from_level', v_from, 'previous_assignee', v_t.assigned_to, 'skipped', v_skipped);
      v_nadd := 0;
      v_nfadd := 0;

      IF NOT v_dry THEN
        UPDATE public.grievance_tickets
           SET escalation_level    = GREATEST(COALESCE(escalation_level, 0), v_lvl),   -- never down
               assigned_to         = v_to,
               assigned_at         = v_now,
               escalated_at        = v_now,
               escalation_deadline = v_deadline,
               metadata = (COALESCE(metadata, '{}'::jsonb) - 'escalation_blocked' - 'escalation_error')
                          || jsonb_build_object('escalations',
                               COALESCE(metadata -> 'escalations', '[]'::jsonb) || jsonb_build_array(v_event))
         WHERE id = v_t.id;
        -- A failed notice never undoes the escalation (or the rest of the run):
        -- it is recorded on the event and counted as notify_failed.
        BEGIN
          v_nid := public.fn_grievance_notify(v_t, v_to, 'escalated', v_lvl, v_deadline,
                     'grievance-escalated:' || v_t.id::text || ':L' || v_lvl || ':' ||
                     floor(extract(epoch FROM v_due))::bigint::text);
          IF v_nid IS NOT NULL THEN v_nadd := 1; END IF;
        EXCEPTION WHEN OTHERS THEN
          v_nfadd := 1;
          UPDATE public.grievance_tickets
             SET metadata = jsonb_set(metadata, '{escalations,-1,notify_error}', to_jsonb(SQLERRM))
           WHERE id = v_t.id;
        END;
      END IF;
      -- Counted only once this ticket's writes went through.
      IF v_show THEN
        v_lv_skipped := v_lv_skipped + jsonb_array_length(v_skipped);
        v_notified   := v_notified + v_nadd;
        v_nfail      := v_nfail + v_nfadd;
        v_escalated  := v_escalated + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'ticket', v_t.ticket_number, 'from_level', v_from, 'to_level', v_lvl, 'to', v_to,
          'outcome', 'escalated', 'skipped', v_skipped));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      IF v_show THEN
        v_failed := v_failed + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'ticket', v_t.ticket_number, 'from_level', v_from, 'outcome', 'failed', 'step', 'escalation', 'error', v_err));
      END IF;
      IF NOT v_dry THEN
        PERFORM public.fn_grievance_tick_record_failure(v_t.id, 'escalation', v_err, v_now);
      END IF;
    END;
  END LOOP;

  -- 3) Is about-the-Joint-MD routing configured? Every active college must
  --    resolve its Joint MD's seat (MEDIUM 2: unresolved = every hiding rule
  --    fails closed) and a usable Director who is not in that seat
  --    (fn_grievance_director_for: college row, then global). A fact about
  --    the settings and profiles only: no ticket is read (round 5, M3).
  v_cfg_ok := NOT EXISTS (
    SELECT 1 FROM public.institutions i
    WHERE COALESCE(i.is_active, true)
      AND (public.fn_grievance_director_for(i.id) IS NULL
           OR NOT public.fn_grievance_joint_md_seat_known(i.id)));

  PERFORM set_config('app.grievance_system_write', '', true);
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
    'failed',            v_failed,
    'about_joint_md_routing_configured', v_cfg_ok,
    'tickets',           v_rows);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_escalation_tick(boolean) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_escalation_tick(boolean) TO service_role;

COMMENT ON FUNCTION public.fn_grievance_escalation_tick(boolean) IS
  'Hourly (via /api/cron/grievance-sla-breach-check): stamps sla_breached_at on newly overdue tickets, then moves each ticket overdue at its current level up ONE chain level (HOD, Principal, the Joint MD), reassigning and notifying. Rules and safety limits: migration 20271010020000_grievance_sla_escalation.sql. Scheduler only.';

-- ---------------------------------------------------------------------
-- 9) fn_generate_unresolved_issue_items — the dead link
-- ---------------------------------------------------------------------
-- Taken from the NEWEST migration that defines it before this one
-- (20261213100000; checked by supabase/tests/grievance/replay_readers.py, which
-- fails the rehearsal if a newer definition appears before or after this file),
-- changed only where this migration needs it: the work item's url
-- (/grievances/<id> never existed; the ticket page is
-- /accreditation/naac/grievance/<id>), and complaints about the Joint MD (only
-- the Director who holds one gets a work item, and it names nothing). The
-- dedupe key is unchanged, so no work item is posted twice across the deploy.
-- So that this can never silently undo a change made to the function after
-- that copy (deep review round 5, M2), the body the database holds is checked
-- first: it must be exactly that baseline, or exactly this migration's own
-- version (a re-apply). Anything else stops the migration with its md5.
-- Baseline check (section 9, round 5 M2):
DO $gen_baseline$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname = 'fn_generate_unresolved_issue_items' AND p.pronargs = 0;
  IF v_md5 IS NOT NULL
     AND v_md5 NOT IN ('89ee6b3aebeb661d74331f3796c5525e',    -- 20261213100000 (baseline)
                       'f0446dfe4139e9fe6a42dee39b9181d4') THEN -- this migration (re-apply)
    RAISE EXCEPTION 'grievance: fn_generate_unresolved_issue_items in this database (md5 %) is neither the 20261213100000 body this migration was written against nor its own version: re-create section 9 from the live body before applying.', v_md5;
  END IF;
END
$gen_baseline$;
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
    -- A complaint about the Joint MD becomes a work item ONLY for the
    -- Director who holds it: never through the unassigned fallback (the
    -- oldest super admin, who may be the Joint MD or anyone else), and never
    -- for anyone in the Joint MD's seat (deep review round 3).
    IF COALESCE(v_griev.about_joint_md, false)
       AND (v_griev.assigned_to IS NULL
            OR v_target IS DISTINCT FROM v_griev.assigned_to
            OR v_target = ANY (public.fn_grievance_joint_md_ids(v_griev.institution_id))) THEN
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
    -- A complaint about the Joint MD: a confidential work item (round 6) with
    -- no ticket id, level, breach or emergency flag, a hashed key, and
    -- action_config.confidential for the recipient-only policies below.
    IF COALESCE(v_griev.about_joint_md, false) THEN
      v_key := 'grievance_confidential:' || md5(v_key);
    END IF;
    v_created := v_created + fn_create_dashboard_work_item(
      v_category, v_priority,
      -- A complaint about the Joint MD: no subject, description or number on
      -- the work item (round 5, M5); the link opens it for the Director.
      CASE WHEN COALESCE(v_griev.about_joint_md, false) THEN 'A confidential complaint needs your review'
           ELSE 'Grievance ' || v_griev.ticket_number || ' — ' || LEFT(v_griev.subject, 80) END,
      CASE WHEN COALESCE(v_griev.about_joint_md, false) THEN 'Open it to see it.'
           ELSE LEFT(v_griev.description, 140) ||
        CASE WHEN v_griev.escalation_level > 0 THEN ' | escalated L' || v_griev.escalation_level::text ELSE '' END ||
        CASE WHEN v_griev.sla_deadline < NOW() THEN ' | SLA breached ' || v_hours_past_sla::text || 'h' ELSE '' END ||
        CASE WHEN v_griev.assigned_to IS NULL THEN ' | UNASSIGNED, routed to Director' ELSE '' END END,
      CASE WHEN COALESCE(v_griev.about_joint_md, false)
        THEN jsonb_build_object('confidential', true, 'url', '/accreditation/naac/grievance')
        ELSE jsonb_build_object(
        'grievance_id',     v_griev.id,
        'ticket_number',    v_griev.ticket_number,
        'escalation_level', v_griev.escalation_level,
        'sla_breached',     (v_griev.sla_deadline < NOW()),
        'is_emergency',     v_griev.is_emergency,
        'unassigned_fallback', v_griev.assigned_to IS NULL,
        'url', '/accreditation/naac/grievance/' || v_griev.id::text
      ) END,
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
-- 10) About the Joint MD: three rules no write may break
-- ---------------------------------------------------------------------
-- (a) Only the send-back action (section 13) may clear the tick: any other
--     UPDATE that clears it is refused, so an admin edit cannot quietly make
--     the complaint visible to the Joint MD.
-- (b) While the tick is set the ticket can never be GIVEN to anyone in the
--     Joint MD's seat — whichever path writes assigned_to (the issues board,
--     the Learners Council route, a console edit). Checked only when the
--     write changes the handler, the college or the tick: a ticket whose
--     handler LATER takes a Joint MD seat must still accept every other
--     write (status, the hourly breach stamp, a comment count), or one such
--     row would stop the escalation run for every college (deep review of
--     #4079, H1).
-- (d) Routing and escalation metadata (auto_route, escalations, ...) is the
--     database's alone: other writers keep the stored values (round 5, M4).
-- (e) A complaint about the Joint MD cannot be moved to another college
--     except by send-back or that college's Director (round 5).
-- (c) The tick can only be set when the complaint is filed (INSERT, where
--     routing sends it to the Director). An UPDATE that sets it is refused
--     for everyone: otherwise a HOD or Principal handling a complaint about
--     THEMSELVES could tick it, hide it from the Joint MD and every count,
--     and keep it (deep review of #4079, H2; desk decision 10 Oct).
CREATE OR REPLACE FUNCTION public.fn_grievance_about_joint_md_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- (d) Routing / escalation metadata is the database's alone (round 5, M4):
  --     an UPDATE from anywhere but the hourly run or send-back keeps the
  --     stored values, whatever it sent.
  IF COALESCE(current_setting('app.grievance_system_write', true), '') <> 'on' THEN
    NEW.metadata := (COALESCE(NEW.metadata, '{}'::jsonb) - public.fn_grievance_system_metadata_keys())
                    || COALESCE((SELECT jsonb_object_agg(e.key, e.value)
                                 FROM jsonb_each(COALESCE(OLD.metadata, '{}'::jsonb)) AS e
                                 WHERE e.key = ANY (public.fn_grievance_system_metadata_keys())), '{}'::jsonb);
  END IF;
  -- (e) A complaint about the Joint MD stays in its college (hiding depends
  --     on it): only send-back or that college's Director may move it
  --     (round 5).
  IF COALESCE(OLD.about_joint_md, false) AND COALESCE(NEW.about_joint_md, false)
     AND OLD.institution_id IS DISTINCT FROM NEW.institution_id
     AND COALESCE(current_setting('app.grievance_send_back', true), '') <> 'on'
     AND auth.uid() IS DISTINCT FROM public.fn_grievance_director_for(OLD.institution_id) THEN
    RAISE EXCEPTION 'This complaint is marked as about the Joint MD. Only the Director can move it to another college.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(OLD.about_joint_md, false) AND NOT COALESCE(NEW.about_joint_md, false)
     AND COALESCE(current_setting('app.grievance_send_back', true), '') <> 'on' THEN
    RAISE EXCEPTION 'This complaint is marked as about the Joint MD. Only the Director can send it back to the normal path, with the "Send back to the normal path" button on the complaint.'
      USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(OLD.about_joint_md, false) AND COALESCE(NEW.about_joint_md, false) THEN
    RAISE EXCEPTION 'A complaint can only be marked as about the Joint MD when it is filed. File a new complaint with the box ticked.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(NEW.about_joint_md, false) AND NEW.assigned_to IS NOT NULL
     AND (OLD.assigned_to    IS DISTINCT FROM NEW.assigned_to
       OR OLD.institution_id IS DISTINCT FROM NEW.institution_id
       OR OLD.about_joint_md IS DISTINCT FROM NEW.about_joint_md)
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
-- TO authenticated: the Joint MD only ever reads signed in, and the two
-- helpers below are not executable by anon. Without it an anonymous read
-- that used to return no rows would fail with "permission denied for
-- function" (deep review of #4079, M5); anon now behaves exactly as before.
-- Fail closed (MEDIUM 2): where the Joint MD's seat cannot be resolved, only
-- the Director who would handle it and its filer see it
-- (fn_grievance_caller_may_see_about_jmd, section 3b). Only ticked rows ever
-- call it.
DROP POLICY IF EXISTS grievance_tickets_hide_about_joint_md ON public.grievance_tickets;
CREATE POLICY grievance_tickets_hide_about_joint_md ON public.grievance_tickets
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT about_joint_md
         OR public.fn_grievance_caller_may_see_about_jmd(institution_id, raised_by_id, filed_by));

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
      AND NOT public.fn_grievance_caller_may_see_about_jmd(t.institution_id, t.raised_by_id, t.filed_by))
$$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_ticket_hidden_from_caller(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_grievance_ticket_hidden_from_caller(uuid) TO authenticated, service_role;

-- CASE: for everybody who is not the Joint MD (an empty seat list, worked out
-- once per statement) the per-row lookup never runs — while every college's
-- seat resolves; otherwise it does, and fails closed (MEDIUM 2).
DROP POLICY IF EXISTS grievance_comments_hide_about_joint_md ON public.grievance_comments;
CREATE POLICY grievance_comments_hide_about_joint_md ON public.grievance_comments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (CASE WHEN cardinality((SELECT public.fn_grievance_caller_joint_md_scope())) = 0
                   AND (SELECT public.fn_grievance_joint_md_seat_known_everywhere()) THEN true
              ELSE NOT public.fn_grievance_ticket_hidden_from_caller(ticket_id) END);

DROP POLICY IF EXISTS grievance_history_hide_about_joint_md ON public.grievance_history;
CREATE POLICY grievance_history_hide_about_joint_md ON public.grievance_history
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (CASE WHEN cardinality((SELECT public.fn_grievance_caller_joint_md_scope())) = 0
                   AND (SELECT public.fn_grievance_joint_md_seat_known_everywhere()) THEN true
              ELSE NOT public.fn_grievance_ticket_hidden_from_caller(ticket_id) END);

-- ---------------------------------------------------------------------
-- 11b) Confidential notices and work items: their recipient only
-- ---------------------------------------------------------------------
-- notifications / user_notifications already let every super admin read all
-- rows (notifications_select_super_admin, "Super admins can manage all user
-- notifications") and update or delete them (notifications_update_admins /
-- _delete_admins). The notice or work item about a complaint about the Joint
-- MD is marked confidential (notifications.metadata.confidential, or
-- action_config.confidential on a work item; sections 6 and 9), and these
-- RESTRICTIVE policies — ANDed with every existing one, which stay exactly
-- as they are — let ONLY the person it targets see, update or delete it.
-- Every other row is untouched; the service role is not subject to them;
-- inserts are not covered (the database writes these rows). The
-- notifications screens (/notifications/admin, the bell) behave as before
-- for every row that is not confidential (deep review round 6, H1).
--
-- Cost (W12 perf proof, 600k rows each, local): on notifications only the two
-- jsonb flags are read for a row that is not confidential; a confidential row
-- checks the canonical user_ids list inline first (the shape sections 6 and 9
-- write; fn_notification_is_for_user answers true for it too) and calls the
-- function only for any other shape. On
-- user_notifications a reader's own row short-circuits on user_id; any other
-- row is shown only when the reader can see its notification and that
-- notification is not confidential — a plain EXISTS under the reader's own
-- notifications RLS, which the planner runs as one hashed lookup for a whole
-- table read (or an index probe for a few rows), never a per-row function
-- call. On main only super admins read other people's rows, and they can see
-- every notification that is not confidential, so nothing else changes.
-- notifications' policies never read user_notifications (no RLS recursion).
DROP POLICY IF EXISTS notifications_confidential_recipient_select ON public.notifications;
CREATE POLICY notifications_confidential_recipient_select ON public.notifications
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (CASE WHEN metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true'
              THEN (targeting -> 'user_ids' ? (SELECT auth.uid())::text)
                   OR public.fn_notification_is_for_user(targeting, (SELECT auth.uid()))
              ELSE true END);
DROP POLICY IF EXISTS notifications_confidential_recipient_update ON public.notifications;
CREATE POLICY notifications_confidential_recipient_update ON public.notifications
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (CASE WHEN metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true'
              THEN (targeting -> 'user_ids' ? (SELECT auth.uid())::text)
                   OR public.fn_notification_is_for_user(targeting, (SELECT auth.uid()))
              ELSE true END)
  WITH CHECK (CASE WHEN metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true'
                   THEN (targeting -> 'user_ids' ? (SELECT auth.uid())::text)
                   OR public.fn_notification_is_for_user(targeting, (SELECT auth.uid()))
                   ELSE true END);
DROP POLICY IF EXISTS notifications_confidential_recipient_delete ON public.notifications;
CREATE POLICY notifications_confidential_recipient_delete ON public.notifications
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (CASE WHEN metadata ->> 'confidential' = 'true' OR action_config ->> 'confidential' = 'true'
              THEN (targeting -> 'user_ids' ? (SELECT auth.uid())::text)
                   OR public.fn_notification_is_for_user(targeting, (SELECT auth.uid()))
              ELSE true END);

DROP POLICY IF EXISTS user_notifications_confidential_recipient_select ON public.user_notifications;
CREATE POLICY user_notifications_confidential_recipient_select ON public.user_notifications
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (CASE WHEN user_id = (SELECT auth.uid()) THEN true
              ELSE EXISTS (SELECT 1 FROM public.notifications n
                           WHERE n.id = user_notifications.notification_id
                             AND (n.metadata ->> 'confidential') IS DISTINCT FROM 'true'
                             AND (n.action_config ->> 'confidential') IS DISTINCT FROM 'true') END);
DROP POLICY IF EXISTS user_notifications_confidential_recipient_update ON public.user_notifications;
CREATE POLICY user_notifications_confidential_recipient_update ON public.user_notifications
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (CASE WHEN user_id = (SELECT auth.uid()) THEN true
              ELSE EXISTS (SELECT 1 FROM public.notifications n
                           WHERE n.id = user_notifications.notification_id
                             AND (n.metadata ->> 'confidential') IS DISTINCT FROM 'true'
                             AND (n.action_config ->> 'confidential') IS DISTINCT FROM 'true') END)
  WITH CHECK (CASE WHEN user_id = (SELECT auth.uid()) THEN true
                   ELSE EXISTS (SELECT 1 FROM public.notifications n
                           WHERE n.id = user_notifications.notification_id
                             AND (n.metadata ->> 'confidential') IS DISTINCT FROM 'true'
                             AND (n.action_config ->> 'confidential') IS DISTINCT FROM 'true') END);
DROP POLICY IF EXISTS user_notifications_confidential_recipient_delete ON public.user_notifications;
CREATE POLICY user_notifications_confidential_recipient_delete ON public.user_notifications
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (CASE WHEN user_id = (SELECT auth.uid()) THEN true
              ELSE EXISTS (SELECT 1 FROM public.notifications n
                           WHERE n.id = user_notifications.notification_id
                             AND (n.metadata ->> 'confidential') IS DISTINCT FROM 'true'
                             AND (n.action_config ->> 'confidential') IS DISTINCT FROM 'true') END);
-- An earlier head of this change called a per-row helper from these policies;
-- they no longer use it, so it goes (after them: they depended on it).
DROP FUNCTION IF EXISTS public.fn_notification_is_confidential(uuid);

-- ---------------------------------------------------------------------
-- 12) About the Joint MD: no list row and no count through the SECURITY
--     DEFINER readers (they skip row-level security)
-- ---------------------------------------------------------------------
--   fn_my_desk_waiting()   lists every UNASSIGNED ticket, subject included,
--   fn_dashboard_metrics,  to every super admin; dashboard, HOD and SLA-stat
--   fn_hod_metrics,        counts. Rule "switch": a complaint about the Joint
--   get_grievance_sla_stats MD is ALWAYS shown to that college's configured
--                          Director (a held one stays on his desk), NEVER to
--                          the Joint MD, hidden from everyone else under the
--                          recommended option (shown under the other), and
--                          hidden when nobody is signed in (fail closed).
--   fn_compute_ohs_for_institution, fn_compute_dhs_for_user  leaderboard
--                          scores, refreshed with nobody signed in and stored:
--                          rule "all", always left out (nobody can check who
--                          reads a stored score later).
-- Patched IN PLACE, the way 20270520090000 section 7 patches fn_get_policy:
-- the definition the database holds at apply time (pg_get_functiondef) is
-- kept byte for byte, except that every READ of grievance_tickets becomes
-- "(SELECT * FROM public.grievance_tickets AS __jmd WHERE <rule>) AS <alias>"
-- — a filtered table in the same place, so the surrounding WHERE / JOIN / OR
-- logic is untouched. My Desk was rewritten on 8 Oct (20271008110101) and HR
-- PRs touch it often; re-creating it (or the other four) from a repo copy
-- here would undo whichever change landed after this was written, so an
-- explicit CREATE OR REPLACE is not safe here.
--
-- A READ is the table named after FROM, after any JOIN, or in a comma list,
-- with or without ONLY, a schema, double quotes, an alias, in any case or
-- spacing (the first version only rewrote "FROM [public.]grievance_tickets",
-- and its check only looked for the word about_joint_md somewhere in the
-- body, so a JOIN could still leak a row or a count: deep review of #4079,
-- H3). Comments are never rewritten. The patch REFUSES — an error, so a
-- person has to look, rather than a row or a count silently reaching the
-- Joint MD — when a body:
--   * writes the table (UPDATE / INSERT INTO / DELETE FROM / anything else),
--   * names it inside a string literal (dynamic SQL it cannot filter), or
--   * names it anywhere it does not recognise as a read.
-- A column qualifier (grievance_tickets.id), %ROWTYPE, or an alias called
-- grievance_tickets is not a read and is left alone; a schema-qualified one
-- (public.grievance_tickets.id) loses its schema, since the wrapped read is
-- named grievance_tickets; a qualifier with no read of that name refuses. Already wrapped reads
-- are recognised, so re-applying this section changes nothing; a function
-- that is missing is a NOTICE. Section 14 then re-reads all five functions
-- and fails the migration if ANY read of the table is left unwrapped.
-- LIMIT: a LATER migration that re-creates one of these functions from a
-- repo copy drops the rule again. Re-applying this section restores it.

-- The lexer the rewriter and the gate share: the body with every comment
-- and every string's contents blanked (code), and the string contents alone
-- (strs). Both keep every character position of the input.
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_mask(p_src text, OUT code text, OUT strs text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $mask$
DECLARE
  v_c     text[] := regexp_split_to_array(COALESCE(p_src, ''), '');
  v_n     integer;
  v_code  text[];
  v_str   text[];
  v_i     integer := 1;
  v_j     integer;
  v_k     integer;
  v_d     integer;
  v_tag   text;
  v_esc   boolean;
BEGIN
  v_n := COALESCE(array_length(v_c, 1), 0);
  IF v_n = 0 THEN
    code := '';
    strs := '';
    RETURN;
  END IF;
  v_code := v_c;
  v_str  := array_fill(' '::text, ARRAY[v_n]);

  WHILE v_i <= v_n LOOP
    IF v_c[v_i] = '-' AND v_c[v_i + 1] IS NOT DISTINCT FROM '-' THEN          -- -- line comment
      WHILE v_i <= v_n AND v_c[v_i] <> E'\n' LOOP
        v_code[v_i] := ' ';
        v_i := v_i + 1;
      END LOOP;
    ELSIF v_c[v_i] = '/' AND v_c[v_i + 1] IS NOT DISTINCT FROM '*' THEN       -- /* block */ (nests)
      v_d := 0;
      LOOP
        EXIT WHEN v_i > v_n;
        IF v_c[v_i] = '/' AND v_c[v_i + 1] IS NOT DISTINCT FROM '*' THEN
          v_d := v_d + 1; v_code[v_i] := ' '; v_code[v_i + 1] := ' '; v_i := v_i + 2;
        ELSIF v_c[v_i] = '*' AND v_c[v_i + 1] IS NOT DISTINCT FROM '/' THEN
          v_d := v_d - 1; v_code[v_i] := ' '; v_code[v_i + 1] := ' '; v_i := v_i + 2;
          EXIT WHEN v_d = 0;
        ELSE
          v_code[v_i] := ' '; v_i := v_i + 1;
        END IF;
      END LOOP;
    ELSIF v_c[v_i] = '''' THEN                                                 -- 'string', E'string'
      v_esc := v_i > 1 AND v_c[v_i - 1] IN ('E', 'e')
               AND (v_i = 2 OR v_c[v_i - 2] !~ '[A-Za-z0-9_$]');
      v_i := v_i + 1;
      LOOP
        EXIT WHEN v_i > v_n;
        IF v_esc AND v_c[v_i] = E'\\' THEN
          v_str[v_i] := v_c[v_i]; v_code[v_i] := ' '; v_i := v_i + 1;
          IF v_i <= v_n THEN v_str[v_i] := v_c[v_i]; v_code[v_i] := ' '; v_i := v_i + 1; END IF;
        ELSIF v_c[v_i] = '''' AND v_c[v_i + 1] IS NOT DISTINCT FROM '''' THEN
          v_code[v_i] := ' '; v_code[v_i + 1] := ' '; v_i := v_i + 2;
        ELSIF v_c[v_i] = '''' THEN
          v_i := v_i + 1;
          EXIT;
        ELSE
          v_str[v_i] := v_c[v_i]; v_code[v_i] := ' '; v_i := v_i + 1;
        END IF;
      END LOOP;
    ELSIF v_c[v_i] = '"' THEN                                                  -- "quoted identifier": kept
      v_i := v_i + 1;
      WHILE v_i <= v_n AND v_c[v_i] <> '"' LOOP v_i := v_i + 1; END LOOP;
      v_i := v_i + 1;
    ELSIF v_c[v_i] = '$' AND (v_i = 1 OR v_c[v_i - 1] !~ '[A-Za-z0-9_$]') THEN  -- $tag$ string $tag$
      v_j := v_i + 1;
      WHILE v_j <= v_n AND v_c[v_j] ~ '[A-Za-z0-9_]' LOOP v_j := v_j + 1; END LOOP;
      IF v_j <= v_n AND v_c[v_j] = '$' AND (v_j = v_i + 1 OR v_c[v_i + 1] !~ '[0-9]') THEN
        v_tag := array_to_string(v_c[v_i:v_j], '');
        v_k := v_j + 1;
        WHILE v_k <= v_n
              AND NOT (v_c[v_k] = '$' AND array_to_string(v_c[v_k:v_k + length(v_tag) - 1], '') = v_tag) LOOP
          v_str[v_k] := v_c[v_k]; v_code[v_k] := ' '; v_k := v_k + 1;
        END LOOP;
        v_i := v_k + length(v_tag);
      ELSE
        v_i := v_i + 1;                                                        -- $1, a lone $
      END IF;
    ELSE
      v_i := v_i + 1;
    END IF;
  END LOOP;

  code := array_to_string(v_code, '');
  strs := array_to_string(v_str, '');
END;
$mask$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_mask(text) FROM anon, authenticated, PUBLIC;

-- The rewriter: one function body in, the same body with every read
-- wrapped out, plus how many reads it wrapped now and how many were already
-- wrapped. Pure text work; raises on anything it cannot vouch for.
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_wrap_reads(
  p_src   text,
  p_rule  text,
  p_label text DEFAULT 'a function',
  OUT body    text,
  OUT wrapped integer,
  OUT already integer)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $wrap$
DECLARE
  c_caller CONSTANT text :=
    'NOT (COALESCE(__jmd.about_joint_md, false) AND (SELECT public.fn_grievance_caller_joint_md_scope())'
    || ' && ARRAY[__jmd.institution_id, ''00000000-0000-0000-0000-000000000000''::uuid])';
  c_all    CONSTANT text := 'NOT COALESCE(__jmd.about_joint_md, false)';
  -- The one the patch uses for what people see: the Director always, the
  -- Joint MD never, the rest as the switch says, nobody-signed-in hidden
  -- (fn_grievance_jmd_hidden_for, section 3b).
  c_switch CONSTANT text :=
    'NOT (COALESCE(__jmd.about_joint_md, false) AND public.fn_grievance_jmd_hidden_for(__jmd.institution_id))';
  c_kw     CONSTANT text[] := ARRAY['where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'natural',
                                    'on', 'group', 'order', 'limit', 'offset', 'union', 'except', 'intersect',
                                    'having', 'window', 'for', 'using', 'returning', 'into', 'fetch', 'then',
                                    'loop', 'and', 'or', 'as', 'tablesample', 'lateral', 'set', 'values',
                                    'select', 'end', 'when', 'else'];
  v_c     text[] := regexp_split_to_array(COALESCE(p_src, ''), '');  -- one element per character
  v_n     integer;
  v_code  text[];   -- the body with comments and string contents blanked (same positions)
  v_str   text[];   -- only the string contents
  v_k     integer;
  v_m     text;
  v_lm    text;
  v_p     integer := 1;
  v_at    integer;
  v_qs    integer;
  v_qe    integer;
  v_rs    integer;
  v_pre   text[];
  v_tok   text;
  v_al    text[];
  v_alias text;
  v_end   integer;
  v_cur   integer := 1;
  v_out   text := '';
  v_qual  integer := 0;   -- column qualifiers grievance_tickets.<col>
  v_named integer := 0;   -- reads (or aliases) named grievance_tickets
BEGIN
  IF p_rule IS NULL OR p_rule NOT IN ('caller', 'all', 'switch') THEN
    RAISE EXCEPTION 'grievance: unknown about-the-Joint-MD rule %', p_rule;
  END IF;
  wrapped := 0;
  already := 0;
  v_n := COALESCE(array_length(v_c, 1), 0);
  IF v_n = 0 THEN
    body := COALESCE(p_src, '');
    RETURN;
  END IF;
  -- 1) Comments and string literals blanked, every position kept.
  SELECT regexp_split_to_array(mk.code, ''), regexp_split_to_array(mk.strs, '')
    INTO v_code, v_str
  FROM public.fn_grievance_jmd_mask(p_src) AS mk;

  -- 2) A name inside a string is dynamic SQL this patch cannot filter.
  IF array_to_string(v_str, '') ~* 'grievance_tickets' THEN
    RAISE EXCEPTION 'grievance: % names grievance_tickets inside a string (dynamic SQL?), which the about-the-Joint-MD patch cannot filter. Compare pg_get_functiondef with main before re-running.', p_label;
  END IF;

  -- 3) Every remaining mention, in order.
  v_m  := array_to_string(v_code, '');
  v_lm := translate(v_m, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');  -- same length, unlike lower()
  LOOP
    v_at := strpos(substr(v_lm, v_p), 'grievance_tickets');
    EXIT WHEN v_at = 0;
    v_at := v_p + v_at - 1;
    v_qs := v_at;
    v_qe := v_at + 16;
    v_p  := v_qe + 1;
    -- part of a longer name (grievance_tickets_archive, my_grievance_tickets)
    CONTINUE WHEN COALESCE(v_code[v_at - 1] ~ '[A-Za-z0-9_$]', false)
               OR COALESCE(v_code[v_qe + 1] ~ '[A-Za-z0-9_$]', false);
    IF v_code[v_at - 1] IS NOT DISTINCT FROM '"' THEN                         -- "grievance_tickets"
      CONTINUE WHEN v_code[v_qe + 1] IS DISTINCT FROM '"';
      v_qs := v_at - 1;
      v_qe := v_qe + 1;
      v_p  := v_qe + 1;
    END IF;

    -- the schema, if any
    v_rs := v_qs;
    v_pre := regexp_match(right(substr(v_m, 1, v_qs - 1), 200), '(("public"|\mpublic)\s*\.\s*)$', 'i');
    IF v_pre IS NOT NULL THEN
      v_rs := v_qs - length(v_pre[1]);
    ELSIF right(substr(v_m, 1, v_qs - 1), 200) ~ '\.\s*$' THEN
      CONTINUE;   -- another schema's table, or a column called grievance_tickets
    END IF;

    -- A column qualifier is not a read. Unqualified (grievance_tickets.id)
    -- it names a read's alias and is left alone (checked below). Schema-
    -- qualified (public.grievance_tickets.id) it would name a table that is no
    -- longer in the FROM list once the read is wrapped, and fail only when the
    -- function runs: the schema is dropped, and that counts as a place still
    -- to fix, so section 14 cannot pass while one is left (round 2, M7).
    IF substr(v_m, v_qe + 1, 200) ~ '^\s*\.' THEN
      IF v_rs < v_qs THEN
        v_out := v_out || array_to_string(v_c[v_cur : v_rs - 1], '');
        v_cur := v_qs;
        wrapped := wrapped + 1;
      ELSE
        v_qual := v_qual + 1;
      END IF;
      CONTINUE;
    END IF;
    -- not a read either: %ROWTYPE
    CONTINUE WHEN substr(v_m, v_qe + 1, 200) ~ '^\s*%';
    -- a read this patch already wrapped
    IF substr(v_m, v_qe + 1, 200) ~* '^\s+AS\s+__jmd\M' THEN
      already := already + 1;
      CONTINUE;
    END IF;

    -- what stands before it: FROM / JOIN / a comma (optionally then ONLY)
    v_pre := regexp_match(right(substr(v_m, 1, v_rs - 1), 300),
                          '([A-Za-z_]+|[,()])(\s*)((?:\monly\s+)?)$', 'i');
    v_tok := lower(v_pre[1]);
    IF v_tok = 'as' THEN          -- an alias named grievance_tickets (this patch's own)
      v_named := v_named + 1;
      CONTINUE;
    END IF;
    IF v_tok IS NULL OR v_tok NOT IN ('from', 'join', ',') THEN
      RAISE EXCEPTION 'grievance: % uses grievance_tickets in a way the about-the-Joint-MD patch does not recognise as a read (after "%"): ...%... Compare pg_get_functiondef with main before re-running.',
        p_label, COALESCE(v_pre[1], ''),
        btrim(regexp_replace(substr(v_m, GREATEST(v_rs - 60, 1), 140), '\s+', ' ', 'g'));
    END IF;
    IF v_tok = 'from' AND right(substr(v_m, 1, v_rs - 1), 300) ~* '\mdelete\s+from\s+(only\s+)?$' THEN
      RAISE EXCEPTION 'grievance: % deletes from grievance_tickets; the about-the-Joint-MD patch only rewrites reads. Compare pg_get_functiondef with main before re-running.', p_label;
    END IF;

    -- its alias, if any
    v_al := regexp_match(substr(v_m, v_qe + 1, 200), '^(\s+(?:AS\s+)?)("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)', 'i');
    IF v_al IS NOT NULL AND NOT (lower(v_al[2]) = ANY (c_kw)) THEN
      v_end   := v_qe + length(v_al[1]) + length(v_al[2]);
      v_alias := array_to_string(v_c[v_end - length(v_al[2]) + 1 : v_end], '');
    ELSE
      v_end   := v_qe;
      v_alias := 'grievance_tickets';
    END IF;
    IF lower(v_alias) IN ('grievance_tickets', '"grievance_tickets"') THEN
      v_named := v_named + 1;
    END IF;

    v_k := v_rs - length(COALESCE(v_pre[3], ''));   -- ONLY, if any, moves inside
    v_out := v_out || array_to_string(v_c[v_cur : v_k - 1], '')
             || '(SELECT * FROM ' || CASE WHEN COALESCE(v_pre[3], '') <> '' THEN 'ONLY ' ELSE '' END
             || 'public.grievance_tickets AS __jmd WHERE '
             || CASE p_rule WHEN 'caller' THEN c_caller WHEN 'all' THEN c_all ELSE c_switch END
             || ') AS ' || v_alias;
    v_cur := v_end + 1;
    v_p   := v_end + 1;
    wrapped := wrapped + 1;
  END LOOP;

  -- grievance_tickets.<col> with no read named grievance_tickets points at a
  -- table outside every wrapped FROM: it cannot be vouched for.
  IF v_qual > 0 AND v_named = 0 THEN
    RAISE EXCEPTION 'grievance: % qualifies a column with grievance_tickets but no read in it is named grievance_tickets, so the about-the-Joint-MD patch cannot vouch for it. Compare pg_get_functiondef with main before re-running.', p_label;
  END IF;

  body := v_out || array_to_string(v_c[v_cur : v_n], '');
END;
$wrap$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_wrap_reads(text, text, text) FROM anon, authenticated, PUBLIC;

-- Re-create one function with its reads wrapped (the live definition, byte
-- for byte, otherwise). Returns how many reads it wrapped now (0 = nothing
-- to do: no reads, or all already wrapped).
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_patch_reader(p_fn regprocedure, p_rule text)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $patchfn$
DECLARE
  v_src text;
  v_def text;
  v_pos integer;
  w     record;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = p_fn;
  SELECT * INTO w FROM public.fn_grievance_jmd_wrap_reads(v_src, p_rule, p_fn::text);
  IF w.wrapped = 0 THEN
    RETURN 0;
  END IF;
  v_def := pg_get_functiondef(p_fn);
  v_pos := strpos(v_def, v_src);
  IF v_pos = 0 THEN
    RAISE EXCEPTION 'grievance: could not find the body of % inside its own definition', p_fn;
  END IF;
  EXECUTE overlay(v_def PLACING w.body FROM v_pos FOR length(v_src));
  RETURN w.wrapped;
END;
$patchfn$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_patch_reader(regprocedure, text) FROM anon, authenticated, PUBLIC;

DO $patch$
DECLARE
  r      record;
  v_n    integer;
  v_seen text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn, p.proname, w.rule
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    -- 'switch' = what a person sees (the Director always, the Joint MD never,
    -- the rest as the switch says); 'all' = stored scores, read later by
    -- people nobody can check: always left out (round 4, M3).
    JOIN (VALUES ('fn_my_desk_waiting', 'switch'),
                 ('fn_dashboard_metrics', 'switch'),
                 ('fn_compute_ohs_for_institution', 'all'),
                 ('fn_hod_metrics', 'switch'),
                 ('fn_compute_dhs_for_user', 'all'),
                 ('get_grievance_sla_stats', 'switch')) AS w(name, rule) ON w.name = p.proname
    ORDER BY p.proname
  LOOP
    v_seen := v_seen || r.proname::text;
    v_n := public.fn_grievance_jmd_patch_reader(r.fn, r.rule);
    IF v_n > 0 THEN
      RAISE NOTICE 'grievance: % now leaves out complaints about the Joint MD (% place(s), rule %).', r.fn, v_n, r.rule;
    END IF;
  END LOOP;

  IF NOT ('fn_my_desk_waiting' = ANY (v_seen)) THEN
    RAISE NOTICE 'grievance: fn_my_desk_waiting does not exist; nothing to patch.';
  END IF;
END
$patch$;

-- emit_grievance_evidence (AFTER UPDATE OF status, on resolve) writes NAAC
-- 7.7.1 / UGC evidence rows that every accreditation screen lists. A
-- complaint about the Joint MD writes none, under either value of the switch:
-- evidence rows are read later by people nobody can check (deep review rounds
-- 3 and 4). Patched IN PLACE like the readers: one
-- guard after the body's first BEGIN, everything else byte for byte.
DO $evidence$
DECLARE
  v_oid oid;
  v_src text;
  v_def text;
  v_mk  record;
  v_m   text[];
  v_new text;
BEGIN
  SELECT p.oid, p.prosrc INTO v_oid, v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname = 'emit_grievance_evidence' AND p.pronargs = 0;
  IF v_oid IS NULL THEN
    RAISE NOTICE 'grievance: emit_grievance_evidence does not exist; nothing to patch.';
    RETURN;
  END IF;
  IF position('about_joint_md' IN v_src) > 0 THEN
    RETURN;   -- already patched
  END IF;
  SELECT * INTO v_mk FROM public.fn_grievance_jmd_mask(v_src);
  v_m := regexp_match(v_mk.code, '^(.*?\mBEGIN\M)', 'i');
  IF v_m IS NULL THEN
    RAISE EXCEPTION 'grievance: emit_grievance_evidence has no BEGIN this patch recognises. Compare pg_get_functiondef with main before re-running.';
  END IF;
  v_new := left(v_src, length(v_m[1]))
           || E'\n  -- A complaint about the Joint MD leaves no accreditation evidence: the'
           || E'\n  -- rows are read later by people nobody can check (migration 20271010020000).'
           || E'\n  IF COALESCE(NEW.about_joint_md, false) THEN'
           || E'\n    RETURN NEW;'
           || E'\n  END IF;'
           || substr(v_src, length(v_m[1]) + 1);
  v_def := pg_get_functiondef(v_oid);
  EXECUTE overlay(v_def PLACING v_new FROM strpos(v_def, v_src) FOR length(v_src));
  RAISE NOTICE 'grievance: emit_grievance_evidence now skips complaints about the Joint MD.';
END
$evidence$;

-- ---------------------------------------------------------------------
-- 12b) THE READER GATE (deep review round 3: three panels in a row each
--      found one more reader that still showed these complaints)
-- ---------------------------------------------------------------------
-- A mechanical check instead of a list of names: EVERY function in every
-- schema (except pg_catalog / information_schema), every view and every
-- materialized view whose text names grievance_tickets, grievance_comments
-- or grievance_history must either
--   * have every read of grievance_tickets wrapped by the filter above, or
--   * be on this allow-list, with the reason it may read them unfiltered.
-- Names in comments do not count; names inside strings do (dynamic SQL).
-- There is no wrapper for grievance_comments / grievance_history: a reader
-- of those must be allow-listed. Section 14 fails this migration on any
-- other reader, and supabase/tests/grievance/30_reader_patch_forms.sql runs
-- the same gate, so a reader added later fails the rehearsal too.
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_reader_allow_list()
RETURNS TABLE (name text, reason text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $allow$
  SELECT * FROM (VALUES
    -- app paths, defined before this migration
    ('fn_track_issue_by_token',               'only the holder of that one ticket''s private code; filer-facing fields of that ticket, no list, no count'),
    ('fn_grievance_raiser_update_guard',      'BEFORE UPDATE guard on the row being written (OLD/NEW); reads no other ticket'),
    ('fn_grievance_raiser_change_allowed',    'compares the two versions of the row it is handed; reads no table'),
    ('emit_grievance_evidence',               'trigger on the resolved row (NEW); patched above to skip complaints about the Joint MD; the name is only its source_table label'),
    -- this migration: the about-the-Joint-MD machinery itself
    ('fn_generate_unresolved_issue_items',    'work item to a ticket''s handler; a complaint about the Joint MD only ever to the Director who holds it (section 9)'),
    ('fn_grievance_escalation_tick',          'the scheduler''s hourly run; leaves these complaints out of every number and row of its answer (section 8)'),
    ('fn_grievance_send_back_to_normal_path', 'the Director''s own action on one ticket (section 13)'),
    ('fn_grievance_ticket_hidden_from_caller','the hiding check row-level security calls (section 11); true/false for one ticket'),
    ('fn_grievance_about_joint_md_guard',     'BEFORE UPDATE guard on the row being written (section 10)'),
    ('fn_grievance_route_on_create',          'BEFORE INSERT routing of the row being written (section 7)'),
    ('fn_grievance_notify_on_create',         'AFTER INSERT notice for the row just written (section 7)'),
    ('fn_grievance_notify',                   'one notice for the ticket it is handed; refuses the Joint MD for these (section 6)'),
    ('fn_grievance_initial_route',            'routing of the ticket row it is handed (section 7)'),
    ('fn_grievance_level_target',             'the person at one chain level for the ticket row it is handed (section 5)'),
    ('fn_grievance_about_joint_md_target',    'the Director for the ticket row it is handed (section 3b)'),
    ('fn_grievance_sensitive_reason',         'classifies the ticket row it is handed (section 4)'),
    ('fn_grievance_system_metadata_keys',     'the list of metadata keys only the database writes; reads no table'),
    ('fn_grievance_tick_record_failure',      'writes the hourly run''s failure onto the one ticket it is handed; returns nothing'),
    ('fn_grievance_jmd_mask',                 'text tool of this gate; reads no table'),
    ('fn_grievance_jmd_wrap_reads',           'text tool of this gate; the names are in its string literals; reads no table'),
    ('fn_grievance_jmd_patch_reader',         'applies the wrapper to a reader; reads no table'),
    ('fn_grievance_jmd_reader_gate',          'this gate; the names are in its string literals; reads no table'),
    ('fn_grievance_jmd_reader_allow_list',    'this allow-list itself; reads no table'),
    -- stacked follow-up (#4316, anonymity + tracking code), when it lands
    ('fn_grievance_scrub_anonymous_filer',    'BEFORE INSERT/UPDATE scrub of the row being written'),
    ('fn_grievance_ticket_by_token',          'only the holder of that one ticket''s private code'),
    ('fn_grievance_track_conversation',       'only the holder of that one ticket''s private code'),
    ('fn_grievance_track_answer',             'only the holder of that one ticket''s private code'),
    ('fn_grievance_track_rate',               'only the holder of that one ticket''s private code')
  ) AS a(name, reason)
$allow$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_reader_allow_list() FROM anon, authenticated, PUBLIC;

-- Every reader that is neither wrapped nor allow-listed, and why.
-- p_extra_allow: names a test rehearsal adds (its own fixtures).
CREATE OR REPLACE FUNCTION public.fn_grievance_jmd_reader_gate(p_extra_allow text[] DEFAULT '{}')
RETURNS TABLE (object text, kind text, problem text)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_catalog
AS $gate$
DECLARE
  r       record;
  v_mk    record;
  v_w     record;
  v_names text[];
BEGIN
  FOR r IN
    SELECT n.nspname::text AS sch, p.proname::text AS name, p.oid::regprocedure::text AS obj,
           CASE WHEN p.prosqlbody IS NOT NULL THEN pg_get_function_sqlbody(p.oid) ELSE p.prosrc END AS src,
           (p.prosqlbody IS NOT NULL) AS atomic, 'function'::text AS k
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND (p.prosrc ~* '(grievance_tickets|grievance_comments|grievance_history)'
           OR (p.prosqlbody IS NOT NULL
               AND pg_get_function_sqlbody(p.oid) ~* '(grievance_tickets|grievance_comments|grievance_history)'))
    UNION ALL
    SELECT v.schemaname::text, v.viewname::text, v.schemaname || '.' || v.viewname, v.definition, false, 'view'
    FROM pg_views v
    WHERE v.schemaname NOT IN ('pg_catalog', 'information_schema')
      AND v.definition ~* '(grievance_tickets|grievance_comments|grievance_history)'
    UNION ALL
    SELECT m.schemaname::text, m.matviewname::text, m.schemaname || '.' || m.matviewname, m.definition, false, 'materialized view'
    FROM pg_matviews m
    WHERE m.definition ~* '(grievance_tickets|grievance_comments|grievance_history)'
  LOOP
    SELECT * INTO v_mk FROM public.fn_grievance_jmd_mask(r.src);
    v_names := ARRAY(SELECT DISTINCT lower(m[1])
                     FROM regexp_matches(v_mk.code || ' ' || v_mk.strs,
                                         '\m(grievance_tickets|grievance_comments|grievance_history)\M', 'gi') AS m);
    CONTINUE WHEN cardinality(v_names) = 0;   -- named in comments only
    CONTINUE WHEN r.sch = 'public' AND r.k = 'function'
              AND (EXISTS (SELECT 1 FROM public.fn_grievance_jmd_reader_allow_list() a WHERE a.name = r.name)
                   OR r.name = ANY (COALESCE(p_extra_allow, '{}')));
    object := r.obj;
    kind   := r.k;
    IF r.k <> 'function' THEN
      problem := 'reads ' || array_to_string(v_names, ', ') || '; views cannot be wrapped — rewrite it over a wrapped function';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF r.atomic THEN
      problem := 'a BEGIN ATOMIC body reads ' || array_to_string(v_names, ', ') || '; the patch cannot wrap it — allow-list it with a reason or rewrite it';
      RETURN NEXT;
      CONTINUE;
    END IF;
    IF v_names && ARRAY['grievance_comments', 'grievance_history'] THEN
      problem := 'reads grievance_comments / grievance_history, which have no wrapper — allow-list it with a reason or remove the read';
      RETURN NEXT;
      CONTINUE;
    END IF;
    BEGIN
      SELECT * INTO v_w FROM public.fn_grievance_jmd_wrap_reads(r.src, 'switch', r.obj);
      IF v_w.wrapped > 0 THEN
        problem := v_w.wrapped || ' read(s) of grievance_tickets without the about-the-Joint-MD filter';
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN raise_exception THEN
      problem := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END;
$gate$;
REVOKE EXECUTE ON FUNCTION public.fn_grievance_jmd_reader_gate(text[]) FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------
-- 13) "Send back to the normal path" (ruling 9 Oct 2026 23:25 (a))
-- ---------------------------------------------------------------------
-- For a complaint ticked "about the Joint MD" by mistake. ONLY the Director —
-- the profile grievance.escalation.about_joint_md_profile_id names for that
-- college (else the global row) — may do it: not a super admin, not the
-- database owner, and never anyone in the Joint MD's seat. If that setting is
-- empty, nobody can (ruling 23:25 (a); deep review of #4079 round 2, M3).
-- It clears the tick, routes the ticket exactly as a new complaint is routed
-- (fn_grievance_initial_route), gives it a FRESH SLA deadline computed the
-- way a new ticket's is (calculate_grievance_sla_deadline over the ticket's
-- sla_hours / its category's default_sla_hours; round 2, M6 — the old
-- deadline had usually passed while it was held, so the next hourly run
-- escalated it at once), restarts its escalation from there, tells the new
-- handler, and records who did it (grievance_history + the ticket's
-- metadata, which keeps the previous deadline and breach stamp). Every
-- refusal ("no such complaint", "not yours to do") is the same 42501 error,
-- so the answer reveals nothing.
CREATE OR REPLACE FUNCTION public.fn_grievance_send_back_to_normal_path(p_ticket_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_refuse CONSTANT text := 'This complaint does not exist, or only the Director can send it back to the normal path.';
  v_uid    uuid := auth.uid();
  v_t      public.grievance_tickets;
  v_was    public.grievance_tickets;
  v_dir    uuid;
  v_route  jsonb;
  v_to     uuid;
  v_hours  integer;
  v_due    timestamptz;
  -- p_note is accepted for the existing caller and deliberately NOT stored:
  -- anything kept on the ticket becomes readable by the Joint MD once the
  -- tick is cleared (round 6).
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not signed in.');
  END IF;

  -- Who may is decided BEFORE the row is locked: a refused caller never
  -- holds a lock on someone else's complaint (round 4).
  SELECT * INTO v_t FROM public.grievance_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', c_refuse USING ERRCODE = '42501';
  END IF;
  -- The Director = fn_grievance_director_for (policy rows only; a college row
  -- naming the Joint MD or someone who cannot act falls through to the
  -- global Director). No super-admin shortcut. Unset = nobody.
  v_dir := public.fn_grievance_director_for(v_t.institution_id);
  IF v_dir IS NULL OR v_uid IS DISTINCT FROM v_dir
     OR v_uid = ANY (public.fn_grievance_joint_md_ids(v_t.institution_id)) THEN
    RAISE EXCEPTION '%', c_refuse USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_t FROM public.grievance_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', c_refuse USING ERRCODE = '42501';
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

  -- A fresh SLA, computed the way a new ticket's is (M6).
  v_hours := GREATEST(COALESCE(v_t.sla_hours,
               (SELECT c.default_sla_hours FROM public.grievance_categories c WHERE c.id = v_t.category_id),
               72), 1);
  IF to_regprocedure('public.calculate_grievance_sla_deadline(uuid,integer,timestamptz)') IS NOT NULL THEN
    v_due := public.calculate_grievance_sla_deadline(v_t.institution_id, v_hours, now());
  END IF;
  v_due := COALESCE(v_due, now() + make_interval(hours => v_hours));

  PERFORM set_config('app.grievance_send_back', 'on', true);
  PERFORM set_config('app.grievance_system_write', 'on', true);
  UPDATE public.grievance_tickets
     SET about_joint_md      = false,
         assigned_to         = v_to,
         assigned_at         = CASE WHEN v_to IS NULL THEN NULL ELSE now() END,
         escalation_level    = 0,
         escalated_at        = NULL,
         escalation_deadline = NULL,
         sla_hours           = v_hours,
         sla_deadline        = v_due,
         sla_breached_at     = NULL,
         sla_status          = 'on_track',
         -- Once the tick is cleared the Joint MD may read this row, so it keeps
         -- NOTHING from its time as a complaint about her (round 6): no hold,
         -- no escalation steps (they name the Director's level), no send-back
         -- marker, no note.
         metadata = (COALESCE(metadata, '{}'::jsonb) - 'about_joint_md_hold' - 'escalation_blocked'
                     - 'escalations' - 'escalation_error' - 'about_joint_md_sent_back')
                    || jsonb_build_object('auto_route', v_route -> 'auto_route')
   WHERE id = v_was.id
   RETURNING * INTO v_t;
  PERFORM set_config('app.grievance_send_back', '', true);
  PERFORM set_config('app.grievance_system_write', '', true);

  -- Neutral words: the Joint MD may read this history line from now on.
  INSERT INTO public.grievance_history (ticket_id, action, old_value, new_value, performed_by)
  VALUES (v_t.id, 'routing_corrected', NULL, 'Routing corrected by the Director', v_uid);

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
DECLARE
  v_gate text;
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
  -- Confidential notices and work items: recipient only (section 11b).
  IF (SELECT count(*) FROM pg_policy
       WHERE polname IN ('notifications_confidential_recipient_select', 'notifications_confidential_recipient_update',
                         'notifications_confidential_recipient_delete', 'user_notifications_confidential_recipient_select',
                         'user_notifications_confidential_recipient_update', 'user_notifications_confidential_recipient_delete')
         AND NOT polpermissive) <> 6 THEN
    RAISE EXCEPTION 'the six recipient-only policies on notifications / user_notifications were not created';
  END IF;
  -- THE READER GATE (section 12b): no function, view or materialized view
  -- anywhere may read grievance_tickets / _comments / _history unless every
  -- read is wrapped or it is allow-listed with a reason.
  SELECT string_agg(g.kind || ' ' || g.object || ': ' || g.problem, E'\n  ') INTO v_gate
  FROM public.fn_grievance_jmd_reader_gate() AS g;
  IF v_gate IS NOT NULL THEN
    RAISE EXCEPTION E'grievance: these read complaints without leaving out the ones about the Joint MD:\n  %\nWrap them (section 12) or allow-list them with a reason (fn_grievance_jmd_reader_allow_list).', v_gate;
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
