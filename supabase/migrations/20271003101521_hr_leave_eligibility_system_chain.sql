-- ============================================================================
-- Migration: 20271003101521_hr_leave_eligibility_system_chain
-- Added: 2026-10-01 — nobody approves their own leave eligibility.
-- ============================================================================
--
-- THE HOLE. hr_leave_eligibilities_insert_own checked only that the row was the
-- caller's own, pending, and not granted directly. The APPLICANT therefore
-- wrote approval_chain, current_step and hr_organization_id themselves.
-- fn_is_designated_eligibility_approver reads the approver off that very row,
-- so an applicant could name themselves, then approve through
-- hr_leave_eligibilities_decide (UPDATE ... WITH CHECK (true), any column).
-- Separately, an HR Head named on a flow could approve their own request, and
-- nothing in the database stopped an application for a gated leave type
-- (fn_hr_leave_eligibility_ok was called by the app only).
--
-- THE DIRECTOR'S RULINGS (1 Oct 2026), as built here:
--   1. The SYSTEM builds the chain from the leave type's set flow. A BEFORE
--      INSERT trigger REPLACES whatever the asker sent: system-built chain,
--      current_step 0, status pending, every decided_* / revoked_* field
--      empty, and the request must sit under the asker's own college.
--   2. Steps that would let the asker approve their own request (pinned to
--      them, a role they hold, or any step fn_leave_step_admits admits them
--      on) become ONE step pinned to the Director, marked self_routed. Who
--      that is comes from platform_policies key
--      'hr.leave.eligibility_self_route_profile_id' (global), seeded below
--      from director@jkkn.ac.in. No row, or the person named is no longer on
--      the Director list = the request is refused (fail closed).
--      Only someone on the Director list (platform.the_director_profile_ids,
--      migration 20270520090000) may add, change or remove that row; any
--      other admin is refused. Removing it or switching it off is allowed:
--      that only fails closed.
--   3. No flow set for the type = one step: the HR Head (role step 'hr_head',
--      the same role step the flows use). hr_leave_approver_scopes gives
--      hr_head scope 'group', so an HR Head with every college in reach (the
--      COO) receives these from every college; their own request goes to the
--      Director by rule 2.
--   4. On UPDATE, the applicant can never decide (mirrors "You cannot decide
--      on your own leave application"), and an approver may change only the
--      decision of the current step, current_step, status and decided_* —
--      every other column must stay as it was. The decider must be admitted
--      on the current step and records the decision under their own name.
--      A PENDING request always goes through these checks, whoever the
--      caller is; HR's and super admins' edit powers apply to decided rows
--      only. A Director-routed request's Director step admits only the
--      Director, and once decided HR may only withdraw an approval of it.
--      A decision that moves a request is recorded in full under the
--      decider's name. A decided record is never re-opened, and HR cannot
--      change its approval record; anything HR files for someone else is a
--      request or a plain direct grant (approved, no chain), under HR's own
--      name.
--   5. Every new SECURITY DEFINER function is locked from anon and PUBLIC.
--      Signed-in users cannot DELETE an eligibility record at all.
--   6. Director-routed requests appear on his approval queue (the existing
--      /hr/leave/eligibility "Waiting on you" list, which reads the pinned
--      step). No new email or WhatsApp; the in-app bell is unchanged.
--   7. hr_leave_applications refuses an open or granted application for a
--      gated type unless the person holds an approved eligibility valid over
--      the leave's own dates. Cancelled, withdrawn and rejected rows are never
--      blocked; re-opening one is checked like a new application.
--
-- WHO THE INSERT RULE COVERS. The ruling names a "non-manager insert". The
-- HR Head holds hr.leave.types.manage, so a non-manager-only rule would leave
-- exactly the HR-Head-approves-own-request hole open. The rule therefore
-- splits on WHOSE row it is, not on the caller's key:
--   * someone else's row, by a manager (super admin, or hr.leave.types.manage
--     in that organisation): the person and the leave type must belong to the
--     organisation named on the row, and a row cannot be both pending and a
--     direct grant. A direct grant or a decided row is left as sent, its own
--     valid_from included (HR may record leave already taken); a pending
--     request is built like any other. Default taken 3 Oct 2026 (Director did
--     not answer): a direct grant for someone who could clear a step of the
--     type's own chain is refused; they request it and the Director decides.
--   * someone else's row, by anyone else -> refused (RLS would refuse anyway).
--   * the caller's OWN row -> always a request: the system builds the chain.
--     A direct grant or a non-pending row for oneself is refused for
--     EVERYBODY, super admins included (ruling: nobody).
-- The same holds on UPDATE: nobody may change their own eligibility row (or
-- move someone else's onto themselves), not a manager, not a super admin.
-- The app has no withdraw path for an
-- eligibility request (LeaveEligibilityService has request / decide / grant /
-- revoke only), so nothing legitimate is lost.
--
-- EXISTING ROWS ARE NOT TOUCHED. The Director decides those himself.
--
-- TRIGGER, NOT A REWRITTEN POLICY OR AN EDITED EXISTING TRIGGER. The gate on
-- hr_leave_applications is a NEW small trigger rather than a line added to an
-- existing one: re-creating an existing trigger function from a repo copy can
-- silently revert a fix that exists only in production.
--
-- Safe to run twice. No BEGIN/COMMIT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. What this file builds on must be there. A missing helper would otherwise
--    surface only at the first request, as an error nobody can act on.
-- ----------------------------------------------------------------------------
DO $pre$
DECLARE
  v_need text[] := ARRAY[
    'public.fn_hr_leave_build_chain(uuid,uuid)',
    'public.fn_hr_leave_chain_step(integer,jsonb,text,integer,text)',
    'public.fn_hr_leave_pick_flow_for_group(uuid,uuid,text)',
    'public.fn_hr_staff_group(uuid)',
    'public.fn_leave_step_admits(jsonb,uuid,uuid,uuid)',
    'public.fn_leave_step_approvers(jsonb)',
    'public.fn_my_hr_organization_ids()',
    'public.user_has_permission(text)',
    'public.is_super_admin()',
    'public.fn_is_the_director()'
  ];
  v_sig text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'profiles'
                    AND column_name = 'is_super_admin') THEN
    RAISE EXCEPTION '20271003101521: public.profiles.is_super_admin does not exist.';
  END IF;
  FOREACH v_sig IN ARRAY v_need LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE EXCEPTION '20271003101521: % does not exist; apply the migration that creates it first.', v_sig;
    END IF;
  END LOOP;
END
$pre$;

-- ----------------------------------------------------------------------------
-- 0b. Whose eligibility a row is, kept on the row. Filled at insert from the
--     staff record's linked account, or, for a record with no linked account,
--     the one account whose sign-in email is the record's email or
--     institution email. The own-row and "could they clear a step" checks run
--     against this AND the record's current identity, so unlinking a staff
--     record (or linking it later) cannot hide whose row it is.
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_leave_eligibilities ADD COLUMN IF NOT EXISTS subject_profile_id uuid;

COMMENT ON COLUMN public.hr_leave_eligibilities.subject_profile_id IS
  'Whose eligibility this is, fixed at insert (staff link, else the one account matching the staff email or institution email). Migration 20271003101521.';

-- ----------------------------------------------------------------------------
-- 1. Who decides a request the asker would otherwise decide: the Director.
--    A config row (docs/architecture/config-table-pattern.md), not an email in
--    a function. Seeded the way 20270520090000_the_director_list.sql seeds:
--    the ONE confirmed, not-deleted auth account for the address that has a
--    profile; read from auth.users, never profiles.email (editable, not
--    unique). Zero or several matches => no row and a NOTICE, and every
--    self-routed request is refused until the Director (signed in),
--    service_role or the SQL console adds it. ON CONFLICT DO NOTHING: a re-run never resets an edited row.
-- ----------------------------------------------------------------------------
DO $seed$
DECLARE
  v_n  int;
  v_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.platform_policies
              WHERE policy_key = 'hr.leave.eligibility_self_route_profile_id'
                AND scope_type = 'global' AND scope_id IS NULL) THEN
    RAISE NOTICE 'hr.leave.eligibility_self_route_profile_id already exists; left as it is.';
    RETURN;
  END IF;

  SELECT count(*), min(p.id::text)
    INTO v_n, v_id
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
   WHERE lower(trim(u.email)) = 'director@jkkn.ac.in'
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL;

  IF v_n <> 1 THEN
    RAISE NOTICE 'hr.leave.eligibility_self_route_profile_id NOT seeded: found % confirmed account(s) with a profile for director@jkkn.ac.in, exactly one is needed. Self-routed eligibility requests are refused until the row is added.', v_n;
    RETURN;
  END IF;

  INSERT INTO public.platform_policies
    (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
  VALUES
    ('hr.leave.eligibility_self_route_profile_id', 'global', NULL, to_jsonb(v_id),
     'Profile id of the person who decides a leave eligibility request whose '
     'approval flow would otherwise let the asker approve it themselves '
     '(Director ruling 1 Oct 2026: the Director). Missing row = such requests '
     'are refused.',
     'string', true, true)
  ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO NOTHING;
END
$seed$;

-- The id, only when it names an existing profile that is STILL on the
-- Director list (platform.the_director_profile_ids, migration 20270520090000;
-- the same rule as lane 1's raise decider). Compared as text so a malformed
-- value reads as "no row" (fail closed) instead of raising a cast error.
-- INVOKER: it is only ever called from the trigger below, which runs as the
-- owner.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_eligibility_self_route_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p.id
  FROM public.platform_policies pp
  JOIN public.profiles p ON p.id::text = lower(btrim(pp.value #>> '{}'))
  WHERE pp.policy_key = 'hr.leave.eligibility_self_route_profile_id'
    AND pp.scope_type = 'global'
    AND pp.scope_id IS NULL
    AND pp.is_active
    AND jsonb_typeof(pp.value) = 'string'
    AND EXISTS (
      SELECT 1
      FROM public.platform_policies dl
      WHERE dl.policy_key = 'platform.the_director_profile_ids'
        AND dl.scope_type = 'global'
        AND dl.scope_id IS NULL
        AND dl.is_active
        AND jsonb_typeof(dl.value) = 'array'
        AND dl.value ? p.id::text)
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_eligibility_self_route_profile_id() IS
  'Who decides an eligibility request the asker would otherwise approve themselves: platform_policies hr.leave.eligibility_self_route_profile_id, when it names an existing profile that is still on the Director list. NULL otherwise (such requests are then refused).';

-- Guard on that row: only the Director list may change it. The same WHO rule
-- as the Director list's own guard (20270520090000): someone already on the
-- list, service_role, or a direct database session with no signed-in user
-- (a migration, the SQL console). Any other caller, a super admin included,
-- is refused. Shape: one global row holding one existing profile id.
-- Deleting or switching it off is allowed: such requests are then refused.
CREATE OR REPLACE FUNCTION public.fn_guard_hr_leave_eligibility_self_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_key CONSTANT text := 'hr.leave.eligibility_self_route_profile_id';
  v_role text := auth.role();
BEGIN
  IF NOT (   (TG_OP IN ('INSERT', 'UPDATE') AND NEW.policy_key = c_key)
          OR (TG_OP IN ('UPDATE', 'DELETE') AND OLD.policy_key = c_key)) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- WHO. NULL-safe: a NULL role (direct database session) is tested
  -- explicitly, never let through by accident.
  IF v_role IS NOT NULL AND v_role IS DISTINCT FROM 'service_role' THEN
    IF v_role IS DISTINCT FROM 'authenticated'
       OR public.fn_is_the_director() IS NOT TRUE THEN
      RAISE EXCEPTION 'Only the Director can change who decides leave eligibility requests that would otherwise be approved by the person asking.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' OR NEW.policy_key IS DISTINCT FROM c_key THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- SHAPE.
  IF NEW.scope_type IS DISTINCT FROM 'global' OR NEW.scope_id IS NOT NULL THEN
    RAISE EXCEPTION 'There is one setting for the whole group naming who decides these eligibility requests. It cannot be set for one college, role or person.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(NEW.value) IS DISTINCT FROM 'string'
     OR (NEW.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'hr.leave.eligibility_self_route_profile_id must be one profile id (a JSON string).'
      USING ERRCODE = '22023';
  END IF;
  NEW.value := to_jsonb(lower(NEW.value #>> '{}'));
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (NEW.value #>> '{}')::uuid) THEN
    RAISE EXCEPTION 'No account has the id %.', NEW.value #>> '{}'
      USING ERRCODE = '22023';
  END IF;

  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_hr_leave_eligibility_self_route() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_guard_hr_leave_eligibility_self_route() IS
  'BEFORE trigger on platform_policies for ''hr.leave.eligibility_self_route_profile_id''. '
  'Who: only someone on the Director list, service_role, or a direct DB session with no JWT (42501). '
  'Shape: one global row holding one existing profile id (22023). Delete / switch off allowed (fails '
  'closed). Sets updated_by and updated_at. Ruling 1 Oct 2026. Migration 20271003101521.';

DROP TRIGGER IF EXISTS trg_guard_hr_leave_eligibility_self_route ON public.platform_policies;
CREATE TRIGGER trg_guard_hr_leave_eligibility_self_route
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_hr_leave_eligibility_self_route();

-- ----------------------------------------------------------------------------
-- 2. The chain, built by the database.
--    Same precedence LeaveEligibilityService.buildEligibilityChain used:
--      eligibility flow for this type -> institution eligibility catch-all
--      -> the LEAVE flow (teaching / non-teaching aware).
--    Turned into steps by fn_hr_leave_build_chain, the SQL mirror of
--    buildChain() the re-route RPCs already use. Ruling 3: no flow at all, or a
--    flow that resolves to nobody, = one HR Head step.
--    INVOKER: read through the caller's RLS if called directly; from the
--    trigger it runs as the owner.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_eligibility_build_chain(
  p_hr_org_id     uuid,
  p_leave_type_id uuid,
  p_employee_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_flow  uuid;
  v_chain jsonb;
BEGIN
  SELECT af.id INTO v_flow
  FROM public.hr_approval_flows af
  WHERE af.hr_organization_id = p_hr_org_id
    AND af.flow_for = 'leave_eligibility'
    AND af.is_active
    AND af.valid_until IS NULL
    AND (af.conditions ->> 'leave_type_id' IS NULL
         OR (af.conditions ->> 'leave_type_id')::uuid = p_leave_type_id)
  ORDER BY (af.conditions ->> 'leave_type_id' IS NOT NULL) DESC, af.created_at
  LIMIT 1;

  IF v_flow IS NULL THEN
    v_flow := public.fn_hr_leave_pick_flow_for_group(
                p_hr_org_id, p_leave_type_id, public.fn_hr_staff_group(p_employee_id));
  END IF;

  IF v_flow IS NOT NULL THEN
    v_chain := public.fn_hr_leave_build_chain(v_flow, p_employee_id);
  END IF;

  IF v_chain IS NULL OR jsonb_typeof(v_chain) <> 'array' OR jsonb_array_length(v_chain) = 0 THEN
    v_chain := jsonb_build_array(public.fn_hr_leave_chain_step(
      1,
      jsonb_build_array(jsonb_build_object(
        'approver_role', 'hr_head', 'approver_user_id', NULL, 'approver_name', 'HR Head')),
      'any', 48, 'final'));
  END IF;

  RETURN v_chain;
END
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_eligibility_build_chain(uuid, uuid, uuid) IS
  'The approval chain an eligibility request freezes: eligibility flow for the type, else the eligibility catch-all, else the leave flow; none (or nobody on it) = one HR Head step. The authoritative builder since 2026-10-01; the app no longer sends a chain.';

-- ----------------------------------------------------------------------------
-- 2b. Would this person clear a step of their OWN request themselves?
--     Pinned to them by name; or the step names a role they hold actively AND
--     that role's scope reaches their own record -- the test
--     fn_hr_leave_scope_admits(employee, role) applies when they are the one
--     deciding, restated for a person who is not the caller (HR files and
--     grants for someone else, so auth.uid() is not them):
--       group, institution -> their own record is in reach (their own
--         college); this errs toward routing, never away from it;
--       department -> their record is active and has a department (the
--         approver's departments ARE their own records' departments, see
--         fn_hr_leave_department_ids), and they hold no institution- or
--         group-scope role (the "never a senior colleague" rule).
--     A super admin (profiles.is_super_admin) holding the role reaches it
--     whatever its scope, as in fn_leave_step_admits.
--     So a member holding a department role with no department on their
--     record, or a senior who also holds one, is not routed for that step.
--     Internal (INVOKER, nobody signed in may call it): the triggers below
--     call it as the owner.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_eligibility_step_names(
  p_step        jsonb,
  p_profile_id  uuid,
  p_employee_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT p_profile_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.fn_leave_step_approvers(p_step) a
    WHERE a.approver_user_id = p_profile_id
       OR (a.approver_role IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM public.user_roles ur
             JOIN public.custom_roles cr ON cr.id = ur.role_id
             WHERE ur.user_id = p_profile_id
               AND cr.role_key = a.approver_role
               AND cr.is_active)
           -- A super admin holding the role is admitted on it whatever its
           -- scope (fn_leave_step_admits: is_super_admin() first). Read from
           -- profiles, which is what is_super_admin() reads for the caller,
           -- because here the person is usually not the caller.
           AND (COALESCE((SELECT pr.is_super_admin FROM public.profiles pr WHERE pr.id = p_profile_id), false)
           OR CASE COALESCE((SELECT sc.scope_level FROM public.hr_leave_approver_scopes sc
                               WHERE sc.role_key = a.approver_role), 'institution')
                 WHEN 'department' THEN
                   EXISTS (SELECT 1 FROM public.staff st
                            WHERE st.id = p_employee_id
                              AND st.is_active
                              AND st.department_id IS NOT NULL)
                   AND NOT EXISTS (
                     SELECT 1
                     FROM public.user_roles ur
                     JOIN public.custom_roles cr ON cr.id = ur.role_id AND cr.is_active
                     JOIN public.hr_leave_approver_scopes sc ON sc.role_key = cr.role_key
                     WHERE ur.user_id = p_profile_id
                       AND sc.scope_level IN ('institution', 'group'))
                 ELSE true
               END)));
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_eligibility_step_names(jsonb, uuid, uuid) IS
  'Internal. True when the chain step is pinned to this profile, or names a role it holds actively whose scope (hr_leave_approver_scopes) reaches the person''s own staff record: the person could clear that step of their own request.';

-- Who a staff record is NOW: its linked account, plus every account whose
-- sign-in email is the record's email or institution email (case and spaces
-- ignored), so an unlinked record still has an owner.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_eligibility_person_ids(p_employee_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT x.id ORDER BY x.id), ARRAY[]::uuid[])
  FROM (
    SELECT s.profile_id AS id FROM public.staff s WHERE s.id = p_employee_id
    UNION ALL
    SELECT u.id
    FROM public.staff s
    JOIN auth.users u
      ON lower(btrim(u.email)) IN (lower(btrim(s.email)), lower(btrim(s.institution_email)))
    WHERE s.id = p_employee_id
  ) x
  WHERE x.id IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_eligibility_person_ids(uuid) IS
  'Internal. The accounts a staff record is now: its linked account and the accounts its email or institution email belong to.';

-- The same question for the whole chain this person's request would get,
-- for each of the given accounts. Steps after the last 'final' step are
-- never reached and do not count. True means: their eligibility for this
-- type must go to the Director as a request; HR cannot grant it to them
-- directly.
CREATE OR REPLACE FUNCTION public.fn_hr_leave_eligibility_chain_names_person(
  p_hr_org_id     uuid,
  p_leave_type_id uuid,
  p_employee_id   uuid,
  p_profile_ids   uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $function$
  WITH c AS (
    SELECT t.e, t.o
    FROM jsonb_array_elements(public.fn_hr_leave_eligibility_build_chain(
           p_hr_org_id, p_leave_type_id, p_employee_id)) WITH ORDINALITY AS t(e, o)
  ), f AS (
    SELECT max(c.o) AS last_final FROM c WHERE c.e ->> 'step_type' = 'final'
  )
  SELECT EXISTS (
    SELECT 1
    FROM c CROSS JOIN f CROSS JOIN unnest(COALESCE(p_profile_ids, ARRAY[]::uuid[])) AS p(id)
    WHERE (f.last_final IS NULL OR c.o <= f.last_final)
      AND public.fn_hr_leave_eligibility_step_names(c.e, p.id, p_employee_id));
$function$;

COMMENT ON FUNCTION public.fn_hr_leave_eligibility_chain_names_person(uuid, uuid, uuid, uuid[]) IS
  'Internal. True when a reachable step of the chain this person''s eligibility request would get could be cleared by one of the given accounts of that person (it would be routed to the Director).';

-- ----------------------------------------------------------------------------
-- 3. BEFORE INSERT: the system writes the chain (rulings 1, 2, 3).
--    Built for EVERY pending, non-direct request, whoever files it: the
--    asker's own, or one HR files on someone's behalf. A step the person the
--    request is FOR could clear (fn_hr_leave_eligibility_step_names: pinned
--    to them, or a role they hold whose scope reaches their own record, or
--    any role they hold when they are a super admin) goes to the Director.
--    Steps after the last 'final' step are never reached and are left alone.
--    Several such steps collapse into ONE Director step, at the place of the
--    last of them, final if any of them was. That step carries
--    "self_routed": true, which the UPDATE guard reads.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_leave_eligibility_system_chain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_super   boolean;
  v_manager boolean;
  v_ids     uuid[];
  v_self    boolean;
  v_own_org boolean;
  v_type_org boolean;
  v_chain   jsonb;
  v_admits  boolean[] := ARRAY[]::boolean[];
  v_last    int;
  v_lastfinal int;
  v_final   boolean := false;
  v_out     jsonb := '[]'::jsonb;
  v_step    jsonb;
  v_idx     bigint;
  v_dir     uuid;
BEGIN
  -- Whose row this is, kept on the row (section 0b), for every insert.
  v_ids := public.fn_hr_leave_eligibility_person_ids(NEW.employee_id);
  NEW.subject_profile_id := COALESCE(
    (SELECT s.profile_id FROM public.staff s WHERE s.id = NEW.employee_id),
    CASE WHEN cardinality(v_ids) = 1 THEN v_ids[1] END);

  -- Server jobs and the SQL console carry no signed-in person.
  IF COALESCE(auth.role(), '') = 'service_role' OR v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  v_super   := COALESCE(public.is_super_admin(), false);
  v_manager := v_super OR (
                 COALESCE(public.user_has_permission('hr.leave.types.manage'), false)
                 AND NEW.hr_organization_id = ANY (
                       COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[])));
  v_self    := v_uid = ANY (v_ids);
  v_own_org := EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.hr_organizations o ON o.institution_id = s.institution_id
    WHERE s.id = NEW.employee_id
      AND o.id = NEW.hr_organization_id
  );
  -- hr_leave_types.hr_organization_id is NOT NULL: every type is one
  -- college's own.
  v_type_org := EXISTS (
    SELECT 1 FROM public.hr_leave_types t
    WHERE t.id = NEW.leave_type_id
      AND t.hr_organization_id = NEW.hr_organization_id
  );

  IF NOT v_self THEN
    IF NOT v_manager THEN
      RAISE EXCEPTION 'You can only request eligibility for yourself.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_own_org THEN
      RAISE EXCEPTION 'That team member does not belong to the institution named on this record. Pick their own institution and try again.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_type_org THEN
      RAISE EXCEPTION 'This leave type belongs to another institution. Pick the leave type of the institution named on this record.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.granted_directly AND NEW.status IS NOT DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'A record is either a request (pending) or a direct grant, not both.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.granted_directly OR NEW.status IS DISTINCT FROM 'pending' THEN
      -- A record that resolves to no account cannot be checked for "is this
      -- person an approver", so it is not granted directly (a super admin
      -- excepted). A request for them still works: it goes to the chain.
      IF cardinality(v_ids) = 0 AND NEW.subject_profile_id IS NULL AND NOT v_super THEN
        RAISE EXCEPTION 'This team member''s record is not linked to any account, so it cannot be checked whether they are an approver. File a request for them instead.'
          USING ERRCODE = '42501';
      END IF;
      -- Default taken (Director did not answer, 3 Oct 2026): someone who
      -- could clear a step of this type's chain themselves is not granted
      -- directly. They request it, and the Director decides.
      IF (NEW.granted_directly OR NEW.status = 'approved')
         AND public.fn_hr_leave_eligibility_chain_names_person(
               NEW.hr_organization_id, NEW.leave_type_id, NEW.employee_id, v_ids) THEN
        RAISE EXCEPTION 'This team member is one of the approvers for this leave type, so it cannot be granted to them directly. Ask them to request it; the Director decides.'
          USING ERRCODE = '42501';
      END IF;
      -- Anything HR files for someone else that is not a request is a
      -- direct grant, and only that: no decided request with a chain, no
      -- rejected or revoked row (it could be re-opened later).
      IF NOT (NEW.granted_directly AND NEW.status = 'approved'
              AND COALESCE(NEW.approval_chain, '[]'::jsonb) = '[]'::jsonb
              AND COALESCE(NEW.current_step, 0) = 0) THEN
        RAISE EXCEPTION 'HR can file a request for someone (pending) or grant it directly (approved, with no approval chain); nothing else.'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.decided_by IS NOT NULL AND NEW.decided_by IS DISTINCT FROM v_uid
         OR NEW.revoked_by IS NOT NULL AND NEW.revoked_by IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'A grant is recorded under the name of the person making it.'
          USING ERRCODE = '42501';
      END IF;
      -- HR recording a grant for someone else, kept as sent: its own
      -- valid_from too, so leave already taken (recorded after the fact) can
      -- be covered. Recorded as filed by the caller, whatever was sent.
      NEW.created_by := v_uid;
      RETURN NEW;
    END IF;
    -- A request HR files on someone's behalf: built like any other request.
  ELSE
    -- The caller's own row is always a request. No exemption, not even for a
    -- super admin (Director ruling 1 Oct 2026: nobody).
    IF NEW.granted_directly OR NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'You cannot grant eligibility to yourself. Request it instead; it goes to the approvers set for this leave type.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_own_org THEN
      RAISE EXCEPTION 'An eligibility request can only be filed under your own institution. Reload the page and try again, or contact HR.'
        USING ERRCODE = '42501';
    END IF;
    IF NOT v_type_org THEN
      RAISE EXCEPTION 'This leave type belongs to another institution. Reload the page and try again, or contact HR.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_chain := public.fn_hr_leave_eligibility_build_chain(
               NEW.hr_organization_id, NEW.leave_type_id, NEW.employee_id);

  -- Steps after the last 'final' step are never reached (the final step
  -- grants), so they are left as they are and never routed: the Director's
  -- step can never land after the step that grants.
  SELECT max(t.o)::int INTO v_lastfinal
  FROM jsonb_array_elements(v_chain) WITH ORDINALITY AS t(e, o)
  WHERE t.e ->> 'step_type' = 'final';

  -- Ruling 2, pass 1: which steps could the asker clear?
  -- fn_hr_leave_eligibility_step_names answers for anyone, the caller or
  -- not; for the caller's own request it gives what fn_leave_step_admits
  -- would (is_super_admin() is the same profiles flag it reads).
  FOR v_step, v_idx IN
    SELECT t.e, t.o FROM jsonb_array_elements(v_chain) WITH ORDINALITY AS t(e, o) ORDER BY t.o
  LOOP
    v_admits := v_admits || (
      (v_lastfinal IS NULL OR v_idx <= v_lastfinal)
      AND EXISTS (SELECT 1 FROM unnest(v_ids) AS p(id)
                  WHERE public.fn_hr_leave_eligibility_step_names(v_step, p.id, NEW.employee_id)));
    IF v_admits[v_idx::int] THEN
      v_last  := v_idx::int;
      v_final := v_final OR (v_step ->> 'step_type') = 'final';
      IF v_dir IS NULL THEN
        v_dir := public.fn_hr_leave_eligibility_self_route_profile_id();
        IF v_dir IS NULL OR v_dir = ANY (v_ids) THEN
          RAISE EXCEPTION 'The person this request is for is one of its approvers, and nobody is set to decide it in their place. Please contact HR.'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Pass 2: every such step becomes ONE step pinned to the Director.
  FOR v_step, v_idx IN
    SELECT t.e, t.o FROM jsonb_array_elements(v_chain) WITH ORDINALITY AS t(e, o) ORDER BY t.o
  LOOP
    IF v_admits[v_idx::int] THEN
      IF v_idx <> v_last THEN
        CONTINUE;
      END IF;
      v_step := public.fn_hr_leave_chain_step(
                  COALESCE(NULLIF(v_step ->> 'step_order', '')::int, v_idx::int),
                  jsonb_build_array(jsonb_build_object(
                    'approver_role', NULL, 'approver_user_id', v_dir,
                    'approver_name', 'Director')),
                  'any',
                  COALESCE(NULLIF(v_step ->> 'escalate_after_hours', '')::int, 48),
                  CASE WHEN v_final THEN 'final' ELSE v_step ->> 'step_type' END)
                -- Top level as well: approver_user_id is the Director (set by
                -- fn_hr_leave_chain_step from the entry), approver_name
                -- 'Director'. approver_role stays 'hr_approver': LeaveApprovalStep
                -- types it as a string, and 'hr_approver' is the placeholder
                -- every pinned step carries (lib/hr/leave/approval-chain.ts).
                || jsonb_build_object('self_routed', true, 'approver_name', 'Director');
    END IF;
    v_out := v_out || jsonb_build_array(v_step);
  END LOOP;

  NEW.approval_chain   := v_out;
  NEW.current_step     := 0;
  NEW.status           := 'pending';
  NEW.granted_directly := false;
  NEW.decided_by       := NULL;
  NEW.decided_at       := NULL;
  NEW.decision_note    := NULL;
  NEW.revoked_by       := NULL;
  NEW.revoked_at       := NULL;
  NEW.revoke_reason    := NULL;
  -- A request never carries its own day count or validity: the approval would
  -- apply them as an entitlement override.
  NEW.entitled_days    := NULL;
  NEW.valid_from       := CURRENT_DATE;
  NEW.valid_until      := NULL;
  NEW.created_by       := v_uid;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_hle_system_chain ON public.hr_leave_eligibilities;
CREATE TRIGGER trg_hle_system_chain
  BEFORE INSERT ON public.hr_leave_eligibilities
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_trig_leave_eligibility_system_chain();

-- ----------------------------------------------------------------------------
-- 4. BEFORE UPDATE: never your own, and an approver records a decision only
--    (ruling 4). The shape allowed is exactly what LeaveEligibilityService.
--    decide() writes: the current step's decisions / status / decided_at /
--    decided_by / comment, current_step (stay or +1), status, decided_by,
--    decided_at, decision_note, updated_at.
--    * Your own row (before OR after the change, by staff link, staff email
--      or the owner kept on the row): refused for everybody, super admins
--      included.
--    * A PENDING request, anybody's: only the decide path below. The caller
--      must be admitted by the current step (a super admin may also decide an
--      ordinary step of somebody else's request, never a Director step); a
--      Director step only while the person it names is still the configured
--      decider and on the Director list.
--      HR's edit powers do not apply to a request still being decided.
--    * A DECIDED row (approved / rejected / revoked), a WHITELIST: a super
--      admin, or HR (hr.leave.types.manage in the row's organisation), may
--      (A) withdraw an approval: approved -> revoked under their own name,
--          with a date and a reason, nothing else changed; or
--      (B) adjust a direct grant: its valid_from, valid_until and
--          entitled_days only; widening it is refused for someone a
--          reachable step of the type's chain names.
--      Nothing else, by anybody: no status flips, no re-opening, no edits to
--      a rejected, revoked or requested-and-approved row.
--    * A decision is recorded under the decider's own name: decided_by, the
--      step's decided_by, and every decision entry the caller adds. Entries by
--      other people stay exactly as they were.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_leave_eligibility_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid    uuid := (SELECT auth.uid());
  v_super  boolean;
  v_manager boolean;
  v_who    uuid[];
  v_my     uuid[];
  v_len    int;
  v_final  int;
  v_old    jsonb;
  v_new    jsonb;
  c_decision_keys CONSTANT text[] := ARRAY['decisions', 'status', 'decided_at', 'decided_by', 'comment'];
  c_revoke_cols   CONSTANT text[] := ARRAY['status', 'revoked_by', 'revoked_at', 'revoke_reason', 'updated_at', 'updated_by'];
  c_adjust_cols   CONSTANT text[] := ARRAY['valid_from', 'valid_until', 'entitled_days', 'updated_at', 'updated_by'];
  c_decide_cols   CONSTANT text[] := ARRAY['approval_chain', 'current_step', 'status', 'decided_by', 'decided_at',
                                           'decision_note', 'updated_at', 'updated_by'];
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' OR v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_uid = ANY (public.fn_hr_leave_eligibility_person_ids(OLD.employee_id)
                  || public.fn_hr_leave_eligibility_person_ids(NEW.employee_id))
     OR v_uid IS NOT DISTINCT FROM OLD.subject_profile_id
     OR v_uid IS NOT DISTINCT FROM NEW.subject_profile_id THEN
    RAISE EXCEPTION 'You cannot decide on your own eligibility request.'
      USING ERRCODE = '42501';
  END IF;

  v_super   := COALESCE(public.is_super_admin(), false);
  v_my      := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_manager := v_super OR (
                 COALESCE(public.user_has_permission('hr.leave.types.manage'), false)
                 AND OLD.hr_organization_id = ANY (v_my)
                 AND NEW.hr_organization_id = ANY (v_my));

  IF OLD.status IS DISTINCT FROM 'pending' THEN
    -- A DECIDED row (approved / rejected / revoked). A whitelist: HR (or a
    -- super admin) may change it in exactly two shapes, nothing else.
    IF v_manager THEN
      -- (A) Withdraw an approval, under one's own name, with a date and a
      --     reason; every other column stays as it was. Any approved row,
      --     Director-routed or not.
      IF OLD.status = 'approved'
         AND NEW.status = 'revoked'
         AND NEW.revoked_by IS NOT DISTINCT FROM v_uid
         AND NEW.revoked_at IS NOT NULL
         AND NULLIF(btrim(COALESCE(NEW.revoke_reason, '')), '') IS NOT NULL
         AND (to_jsonb(NEW) - c_revoke_cols) = (to_jsonb(OLD) - c_revoke_cols) THEN
        RETURN NEW;
      END IF;
      -- (B) Adjust a direct grant: its dates and day count only. Widening it
      --     (earlier start, later or no end, more days) is a new grant in
      --     effect, so the direct-grant rule applies: not for someone a
      --     reachable step of the type's chain names.
      IF COALESCE(OLD.granted_directly, false)
         AND OLD.status = 'approved'
         AND NEW.status = 'approved'
         AND (to_jsonb(NEW) - c_adjust_cols) = (to_jsonb(OLD) - c_adjust_cols) THEN
        IF ((NEW.valid_from IS DISTINCT FROM OLD.valid_from)
              AND (NEW.valid_from IS NULL OR OLD.valid_from IS NULL OR NEW.valid_from < OLD.valid_from))
           OR ((NEW.valid_until IS DISTINCT FROM OLD.valid_until)
              AND (NEW.valid_until IS NULL OR (OLD.valid_until IS NOT NULL AND NEW.valid_until > OLD.valid_until)))
           OR ((NEW.entitled_days IS DISTINCT FROM OLD.entitled_days)
              AND (NEW.entitled_days IS NULL OR OLD.entitled_days IS NULL OR NEW.entitled_days > OLD.entitled_days)) THEN
          v_who := public.fn_hr_leave_eligibility_person_ids(OLD.employee_id)
                   || CASE WHEN OLD.subject_profile_id IS NULL THEN ARRAY[]::uuid[]
                           ELSE ARRAY[OLD.subject_profile_id] END;
          IF cardinality(v_who) = 0 AND NOT v_super THEN
            RAISE EXCEPTION 'This team member''s record is not linked to any account, so it cannot be checked whether they are an approver. Their grant cannot be widened directly.'
              USING ERRCODE = '42501';
          END IF;
          IF public.fn_hr_leave_eligibility_chain_names_person(
               OLD.hr_organization_id, OLD.leave_type_id, OLD.employee_id, v_who) THEN
            RAISE EXCEPTION 'This team member is one of the approvers for this leave type, so their grant cannot be widened directly. Ask them to request it; the Director decides.'
              USING ERRCODE = '42501';
          END IF;
        END IF;
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'A decided eligibility record can only be withdrawn (an approval, under your own name, with a reason) or, for a direct grant, have its dates and day count adjusted. Nothing else on it can change.'
      USING ERRCODE = '42501';
  END IF;

  -- A PENDING request, whoever the caller is: the decide path, every check.

  -- A whitelist, like the decided path: every column except the decision
  -- fields must stay as it was, including any column added later.
  IF (to_jsonb(NEW) - c_decide_cols) IS DISTINCT FROM (to_jsonb(OLD) - c_decide_cols)
  THEN
    RAISE EXCEPTION 'An approver can only record a decision; nothing else on the request can change.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'An approver can only approve or reject a request.' USING ERRCODE = '42501';
  END IF;

  v_len := jsonb_array_length(OLD.approval_chain);
  IF jsonb_typeof(NEW.approval_chain) IS DISTINCT FROM 'array'
     OR jsonb_array_length(NEW.approval_chain) <> v_len
     OR NEW.current_step NOT IN (OLD.current_step, OLD.current_step + 1)
     OR NEW.current_step >= v_len THEN
    RAISE EXCEPTION 'An approver can only decide the step the request is waiting on.'
      USING ERRCODE = '42501';
  END IF;

  -- Every other step exactly as it was; the current step changes only in its
  -- decision fields (never who it names).
  IF EXISTS (
       SELECT 1
       FROM jsonb_array_elements(OLD.approval_chain) WITH ORDINALITY AS t(s, i)
       WHERE (t.i - 1) <> OLD.current_step
         AND NEW.approval_chain -> (t.i::int - 1) IS DISTINCT FROM t.s)
     OR ((NEW.approval_chain -> OLD.current_step) - c_decision_keys)
          IS DISTINCT FROM ((OLD.approval_chain -> OLD.current_step) - c_decision_keys)
  THEN
    RAISE EXCEPTION 'An approver can only decide the step the request is waiting on.'
      USING ERRCODE = '42501';
  END IF;

  -- Only someone the current step admits decides it. A super admin may also
  -- decide a step of somebody else's request, but never one routed to the
  -- Director.
  v_old := OLD.approval_chain -> OLD.current_step;
  v_new := NEW.approval_chain -> OLD.current_step;
  IF NOT (COALESCE(public.fn_leave_step_admits(v_old, v_uid, OLD.hr_organization_id, OLD.employee_id), false)
          OR (v_super AND v_old -> 'self_routed' IS DISTINCT FROM 'true'::jsonb)) THEN
    RAISE EXCEPTION 'This request is waiting on someone else.'
      USING ERRCODE = '42501';
  END IF;

  -- A Director step is decided only while the person it names is STILL the
  -- configured decider and still on the Director list.
  IF v_old -> 'self_routed' = 'true'::jsonb
     AND (v_old ->> 'approver_user_id') IS DISTINCT FROM
         public.fn_hr_leave_eligibility_self_route_profile_id()::text THEN
    RAISE EXCEPTION 'The person this step names is no longer the one set to decide such requests. Please contact HR.'
      USING ERRCODE = '42501';
  END IF;

  -- Under your own name only.
  IF NEW.decided_by IS DISTINCT FROM OLD.decided_by AND NEW.decided_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'A decision is recorded under the name of the person making it.'
      USING ERRCODE = '42501';
  END IF;
  IF (v_new -> 'decided_by') IS DISTINCT FROM (v_old -> 'decided_by')
     AND (v_new ->> 'decided_by') IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'A decision is recorded under the name of the person making it.'
      USING ERRCODE = '42501';
  END IF;
  IF (v_new -> 'decisions') IS NOT NULL AND jsonb_typeof(v_new -> 'decisions') <> 'array' THEN
    RAISE EXCEPTION 'A decision is recorded under the name of the person making it.'
      USING ERRCODE = '42501';
  END IF;
  IF (SELECT COALESCE(jsonb_agg(t.d ORDER BY t.o), '[]'::jsonb)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_old -> 'decisions') = 'array'
                                       THEN v_old -> 'decisions' ELSE '[]'::jsonb END)
             WITH ORDINALITY AS t(d, o)
       WHERE (t.d ->> 'by') IS DISTINCT FROM v_uid::text)
     IS DISTINCT FROM
     (SELECT COALESCE(jsonb_agg(t.d ORDER BY t.o), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(v_new -> 'decisions', '[]'::jsonb))
             WITH ORDINALITY AS t(d, o)
       WHERE (t.d ->> 'by') IS DISTINCT FROM v_uid::text)
  THEN
    RAISE EXCEPTION 'A decision is recorded under the name of the person making it, and other people''s decisions stay as they were.'
      USING ERRCODE = '42501';
  END IF;

  -- A decision that moves the request (its status or its step) is the
  -- caller's, in full: the row names them, the decided step names them, and
  -- the step carries a new decision entry of theirs.
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.current_step IS DISTINCT FROM OLD.current_step THEN
    IF NEW.decided_by IS DISTINCT FROM v_uid
       OR (v_new ->> 'decided_by') IS DISTINCT FROM v_uid::text
       OR NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(v_new -> 'decisions', '[]'::jsonb)) AS t(d)
            WHERE t.d ->> 'by' = v_uid::text
              AND NOT (CASE WHEN jsonb_typeof(v_old -> 'decisions') = 'array'
                            THEN v_old -> 'decisions' ELSE '[]'::jsonb END) @> jsonb_build_array(t.d)) THEN
      RAISE EXCEPTION 'A decision that moves a request is recorded in full under the name of the person making it.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Only the step that grants (the last 'final' step, else the last step) may
  -- turn the request approved — the same rule as finalStepIndex().
  IF NEW.status = 'approved' THEN
    SELECT COALESCE(max(t.i)::int - 1, v_len - 1) INTO v_final
    FROM jsonb_array_elements(OLD.approval_chain) WITH ORDINALITY AS t(s, i)
    WHERE t.s ->> 'step_type' = 'final';
    IF OLD.current_step <> v_final THEN
      RAISE EXCEPTION 'Only the last approver on this request can grant it.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_hle_guard_update ON public.hr_leave_eligibilities;
CREATE TRIGGER trg_hle_guard_update
  BEFORE UPDATE ON public.hr_leave_eligibilities
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_trig_leave_eligibility_guard_update();

-- ----------------------------------------------------------------------------
-- 5. The gate, in the database (ruling 7). A gated type needs an approved
--    eligibility for the person the leave is FOR, whoever files it, valid
--    over the leave's OWN dates (valid_from on or before the first day,
--    valid_until empty or on or after the last day).
--    Only a leave that is open or granted is checked: a cancelled, withdrawn
--    or rejected row is never blocked. LeaveService.cancelApplication cancels
--    by INSERTING a clone with status 'cancelled', and that must still work
--    after the eligibility is revoked.
--    UPDATE OF the columns that decide it, so a type, person or date change
--    after filing, or re-opening a closed row (filed 'withdrawn', then set to
--    'pending'), cannot slip past.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_trig_leave_application_eligibility_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_first date;
  v_last  date;
BEGIN
  IF NEW.status IN ('cancelled', 'withdrawn', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, check again when the type, person or dates change, or when a
  -- closed row is re-opened (withdrawn / cancelled / rejected -> pending,
  -- escalated or approved). pending -> approved is not re-checked: a revoke
  -- closes the door, it does not reach back to leave already in flight.
  IF TG_OP = 'UPDATE'
     AND NEW.leave_type_id IS NOT DISTINCT FROM OLD.leave_type_id
     AND NEW.employee_id  IS NOT DISTINCT FROM OLD.employee_id
     AND NEW.start_date   IS NOT DISTINCT FROM OLD.start_date
     AND NEW.end_date     IS NOT DISTINCT FROM OLD.end_date
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND OLD.status IS DISTINCT FROM 'withdrawn'
     AND OLD.status IS DISTINCT FROM 'rejected' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hr_leave_types t
                  WHERE t.id = NEW.leave_type_id AND t.requires_eligibility) THEN
    RETURN NEW;
  END IF;

  v_first := COALESCE(NEW.start_date, CURRENT_DATE);
  v_last  := GREATEST(COALESCE(NEW.end_date, v_first), v_first);

  IF NOT EXISTS (
    SELECT 1
    FROM public.hr_leave_eligibilities e
    WHERE e.employee_id = NEW.employee_id
      AND e.leave_type_id = NEW.leave_type_id
      AND e.status = 'approved'
      AND e.valid_from <= v_first
      AND (e.valid_until IS NULL OR e.valid_until >= v_last)
  ) THEN
    RAISE EXCEPTION '% is only open to team members whose eligibility has been approved for these dates. Request eligibility from the Apply Leave screen first.',
      COALESCE((SELECT t.leave_type_name FROM public.hr_leave_types t WHERE t.id = NEW.leave_type_id),
               'This leave type')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_hla_eligibility_gate ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_eligibility_gate
  BEFORE INSERT OR UPDATE OF leave_type_id, employee_id, start_date, end_date, status ON public.hr_leave_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_trig_leave_application_eligibility_gate();

-- ----------------------------------------------------------------------------
-- 6. Locks. Postgres grants EXECUTE to PUBLIC on every new function and
--    Supabase grants anon directly, so both are named. The trigger functions
--    cannot be called outside a trigger; they are locked the same way so the
--    rule has no exceptions to remember.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_self_route_profile_id() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_self_route_profile_id() TO authenticated, service_role;

-- Nobody deletes an eligibility record from the app: a grant is revoked,
-- a request is decided. Supabase's default privileges may have given
-- signed-in users DELETE when the table was created (20261225100000 granted
-- only SELECT, INSERT, UPDATE but did not take it back), and the manage
-- policy is FOR ALL, so it is taken back here.
REVOKE DELETE ON public.hr_leave_eligibilities FROM authenticated, anon;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_step_names(jsonb, uuid, uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_step_names(jsonb, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_person_ids(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_person_ids(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_chain_names_person(uuid, uuid, uuid, uuid[]) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_chain_names_person(uuid, uuid, uuid, uuid[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_build_chain(uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_leave_eligibility_build_chain(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hr_trig_leave_eligibility_system_chain() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_trig_leave_eligibility_system_chain() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hr_trig_leave_eligibility_guard_update() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_trig_leave_eligibility_guard_update() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.hr_trig_leave_application_eligibility_gate() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_trig_leave_application_eligibility_gate() TO authenticated, service_role;
