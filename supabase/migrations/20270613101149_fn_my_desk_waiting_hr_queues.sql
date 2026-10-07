-- ============================================================================
-- /my-desk — the HR queues join "waiting on you", and every row gains due_at.
--
-- Date: 2026-10-01
-- HR staff harness, build step 1 ("one morning brief"), design page
-- artifacts/hr-staff-harness-design-2026-10-01.html, section "The shared
-- mechanics": one list per person on My Desk holding every item waiting on
-- them, oldest first, with its age and its due time.
--
-- WHICH PREDECESSOR. Built on the body of 20261202090000_fn_my_desk_waiting_
-- offer_issued.sql, which is the newest authored definition (added
-- 2026-09-12; 20260908170000, 20261018030000 and 20261018020000 are all
-- older — version prefixes here are a sequence, not a date, see that file's
-- header). The six existing branches (recruitment, refund, leave,
-- meeting_trigger, grievance, offer) are byte-for-byte that body; the ONLY
-- lines added inside them are each branch's `due_at` expression, inserted
-- between its waiting_since and href lines. No existing line changed, so no
-- existing row changes source, title, detail, amount, waiting_since, age or
-- href. __tests__/lib/services/hr/my-desk-hr-queues.test.ts re-derives that
-- claim from the two files.
--
-- WHY DROP + CREATE. Adding a column changes the function's return type, and
-- CREATE OR REPLACE cannot do that ("cannot change return type of existing
-- function"). DROP takes the ACL with it; CREATE hands EXECUTE back to PUBLIC
-- and to the Supabase default grantees. The REVOKE / GRANT at the end restores
-- exactly what the function carried before: the same two statements every
-- earlier version ran, after the same default privileges. Nothing in the
-- database depends on the function (no view, no other function calls it);
-- the one caller is the /my-desk page, through PostgREST.
--
-- ROW CONTRACT — the old eight columns, unchanged and in the same order, then:
--   due_at  timestamptz  the STORED deadline for this item, or NULL when the
--                        queue stores none. Never invented. Appended LAST so a
--                        positional reader of the first eight is unaffected.
--
-- DUE_AT PER SOURCE
--   recruitment / leave / leave_eligibility — the frozen chain step's own
--     escalate_after_hours, counted from when that step began: the previous
--     step's decided_at (both decide paths write it: fn_decide_recruitment_
--     candidate and lib/hr/leave/approval-chain.ts applyDecision), or the
--     submission time for the first step. The design page: "A 72-hour
--     escalation is stored on every step and nothing reads it" / "A 48-hour
--     escalation is stored and editable; no code ever escalates".
--   comp_off — the end of expires_on on the Indian clock (after that the
--     approval trigger refuses the claim).
--   employee_document — the document's own expires_at.
--   everything else — NULL: no deadline is stored. In particular the month
--     close has no close-by date anywhere (the design's "5th working day" is a
--     proposal the HR head has not set), and salary revisions never expire
--     (ruling 11).
--
-- THE ELEVEN NEW SOURCES, AND THE RULE EACH ONE COPIES
-- Rule of the file, unchanged: every predicate MIRRORS a real screen / RPC /
-- policy. Where the screen and the database disagree about who may act, the
-- INTERSECTION is used, so a row never points someone at a page that will not
-- open for them or an act that the database refuses. Where a module lets a
-- person decide their own request, the row is still kept off their own desk.
-- Super-admin "may act" overrides are NOT mirrored where a real owner exists
-- (as the leave branch has always done); where super admins are the ONLY
-- people who can act (the screen is SuperAdminOnly), the rows go to every
-- super admin and the detail says it is a broadcast, as the grievance branch
-- does.
--
-- SUPER ADMINS AND OPERATIONAL QUEUES (coordinator ruling, 2026-10-01, design
-- decision 2: the Director must not get an item-level queue of other people's
-- work). user_has_permission() lets a super admin pass every key, so without
-- a guard every comp-off claim, correction, photo and document in the group
-- would land on the Director's desk. The branches where a super admin only
-- arrives through that bypass therefore carry `NOT v_is_super`: comp_off,
-- regularisation, attendance_close, staff_photo, employee_document,
-- onboarding_step, and the waiting_principal half of salary_revision. The
-- guard is on v_is_super ALONE — a super admin who also holds the specific
-- key through a real role is kept out too. That is deliberate: simple and
-- predictable, one rule rather than a per-role exception nobody can see.
-- Super admins STAY on the branches where they are the actual actor:
-- payroll_period, promotion, termination (SuperAdminOnly screens) and the
-- waiting_director half of salary_revision (the Director's yes or no). The
-- six pre-existing sources are unchanged.
--
--   comp_off            hr_comp_off_credits, status 'pending', credit not
--                       expired. hr.leave.approve AND org in
--                       fn_my_hr_organization_ids() (policy hcoc_update).
--   leave_eligibility   hr_leave_eligibilities, status 'pending'. The leave
--                       branch's own set-based fn_leave_step_admits on the
--                       eligibility's frozen chain (policy
--                       hr_leave_eligibilities_decide).
--   regularisation      hr_attendance_regularizations, status 'pending'.
--                       super admin OR hr.attendance.regularize_approve OR
--                       .approve_team OR .override (UPDATE policy ∩ approvals
--                       screen), included-in-HR gate. Group-wide: the module
--                       has no institution scope, so this is a broadcast.
--   attendance_close    institutions × the last three completed months with
--                       attendance records and no locked period. super admin
--                       OR (hr.attendance.period.manage AND .view), in the
--                       close console's institutions.
--   salary_revision     hr_salary_revision_requests. 'waiting_principal':
--                       .salary_revision.college_check AND the request's
--                       college in fn_my_staff_institution_ids().
--                       'waiting_director': super admin OR
--                       .salary_revision.approve. Never my own pay.
--   payroll_period      hr_payroll_periods not locked. Super admins only —
--                       every screen on the path is SuperAdminOnly. Dormant
--                       path; may be empty.
--   staff_photo         hr_staff_photo_submissions, 'pending'. super admin OR
--                       (hr.staff_photo.review AND role_has_institution_access).
--   employee_document   hr_employee_documents, 'pending', not superseded.
--                       super admin OR (hr.employees.edit AND
--                       role_has_institution_access), included-in-HR gate.
--   promotion           hr_promotion_applications 'submitted' / 'sedc_scored'.
--                       Super admins only (SuperAdminOnly screens).
--   termination         hr_offboarding_cases, termination, open, current step
--                       pending. Super admins only (SuperAdminOnly screen).
--   onboarding_step     hr_recruitment_candidates.role_specific_details.
--                       onboarding_steps, open steps assigned to me by the
--                       complete-step route's own rule, ∩ super admin OR
--                       (hr.recruitment.edit AND .view AND
--                       role_has_institution_access). One row per hire.
--
-- QUEUES DELIBERATELY LEFT OUT (the "who can act" cannot be expressed safely,
-- or nobody can act at all):
--   short time off      ALREADY LISTED. It lives in hr_leave_applications
--                       (request_category 'short_time_off') and the leave
--                       branch has always selected every pending application
--                       with no category filter. A separate source would
--                       count each request twice; moving it out of 'leave'
--                       would change existing rows.
--   leave encashment    No screen can approve one: /hr/leave/encashment is a
--                       request form, the API has GET and POST only, and no
--                       hook calls an approve. A row would be a dead end.
--   attendance          Nothing in the app ever resolves an exception row
--   exceptions          (resolution_status is written only by a one-off
--                       migration and the super-admin purge), so a row could
--                       never clear.
--   HR forms            There is no "your step" rule: the advance route never
--                       checks the step's required_role, the only screen with
--                       the controls is SuperAdminOnly, and every seeded form
--                       has an empty step list.
--   appraisals          The HoD step's write is refused by the table's UPDATE
--                       policy (admin / super admin only), so the HoD who
--                       sees the row cannot complete it; the SEDC and Director
--                       steps have no screen at all.
--
-- THROW-PROOF TIMESTAMPS. Three branches read a timestamp stored as TEXT in
-- jsonb (a chain step's decided_at / acted_at, onboarding_started_at). A bare
-- ::timestamptz raises on a malformed value, and one raise would take every
-- person's whole desk down to "could not check". PostgreSQL 15 has no
-- pg_input_is_valid(), so fn_my_desk_ts_or_null below is the plpgsql
-- EXCEPTION block that turns a bad value into NULL. Not SECURITY DEFINER, and
-- callable by nobody but the function owner.
--
-- NEVER RAISES on a NULL / non-array chain or steps list (jsonb_typeof guards)
-- and returns ZERO ROWS for a missing auth.uid(), as before.
--
-- APPLY-TIME PREFLIGHT. A plpgsql body is not checked against the catalog when
-- it is created; a table or column it names that is missing only fails when
-- the function RUNS — and then it fails for every person, so every desk would
-- read "could not check". Several queues here come from recent migrations
-- (salary revisions 20270519090000, applied 2026-09-30 per its commit; staff
-- photos 20261223091500 / 20261224164500; leave eligibility 20261225100000).
-- Step 0 therefore refuses to apply, loudly and before anything changes, if
-- any relation, column or helper the new body reads is absent. A failed apply
-- is visible to the operator; a broken desk is visible only to its users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight — everything the new body reads must already exist.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('hr_comp_off_credits',           'expires_on'),
      ('hr_leave_eligibilities',        'approval_chain'),
      ('hr_leave_types',                'leave_type_name'),
      ('hr_attendance_regularizations', 'for_date'),
      ('hr_attendance_periods',         'reopened_at'),
      ('hr_attendance_records',         'work_date'),
      ('hr_organizations',              'included_in_hr'),
      ('hr_salary_revision_requests',   'asked_monthly_gross'),
      ('hr_salary_revision_requests',   'is_cut'),
      ('hr_payroll_periods',            'engine_type'),
      ('hr_payroll_period_approvals',   'acted_at'),
      ('hr_staff_photo_submissions',    'submitted_at'),
      ('hr_employee_documents',         'replaces_document_id'),
      ('hr_promotion_applications',     'sedc_reviewed_at'),
      ('hr_offboarding_cases',          'separation_type'),
      ('hr_offboarding_cases',          'termination_approval_chain'),
      ('hr_recruitment_candidates',     'offer_issued_at'),
      ('institutions',                  'name'),
      ('profiles',                      'role'),
      ('staff',                         'profile_id')
    ) AS t(tbl, col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
    ) THEN
      v_missing := v_missing || (r.tbl || '.' || r.col);
    END IF;
  END LOOP;

  FOR r IN
    SELECT * FROM (VALUES
      ('public.fn_leave_step_approvers(jsonb)'),
      ('public.fn_hr_leave_scope_admits(uuid,text)'),
      ('public.fn_my_staff_institution_ids()'),
      ('public.fn_my_staff_ids()'),
      ('public.fn_my_hr_organization_ids()'),
      ('public.fn_my_designated_hr_org_ids()'),
      ('public.role_has_institution_access(uuid)'),
      ('public.user_has_permission(text)'),
      ('public.fn_refund_assignee_match(jsonb,jsonb,uuid)')
    ) AS f(sig)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      v_missing := v_missing || r.sig;
    END IF;
  END LOOP;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'fn_my_desk_waiting HR queues: not applied — missing %', array_to_string(v_missing, ', ')
      USING HINT = 'Apply the migrations that create these first; nothing was changed.';
  END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. The throw-proof text -> timestamptz cast.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_my_desk_ts_or_null(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_text::timestamptz;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.fn_my_desk_ts_or_null(text) IS
  'Text to timestamptz, or NULL when the text is empty or not a valid timestamp. Used by fn_my_desk_waiting to read timestamps stored as text inside jsonb without letting one malformed value raise and blank every desk. PostgreSQL 15 has no pg_input_is_valid(). Not callable by clients.';

REVOKE EXECUTE ON FUNCTION public.fn_my_desk_ts_or_null(text) FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. The desk queue — DROP + CREATE, because the return type grows a column.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_my_desk_waiting();

CREATE FUNCTION public.fn_my_desk_waiting()
 RETURNS TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamp with time zone, age_days integer, href text, due_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid                uuid := (SELECT auth.uid());
  v_is_super           boolean;
  v_is_admin           boolean;
  v_has_leave_perm     boolean;
  v_has_recruit_edit   boolean;
  v_has_recruit_view   boolean;
  v_org_ids            uuid[];
  v_designated_org_ids uuid[];
  v_staff_ids          uuid[];
  -- Added by 20270613101149 for the HR queues. Each is computed ONCE.
  v_today              date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_has_regularise     boolean;
  v_has_period_close   boolean;
  v_has_rev_college    boolean;
  v_can_rev_approve    boolean;
  v_has_photo_review   boolean;
  v_has_emp_edit       boolean;
  v_staff_inst_ids     uuid[];
  v_all_role_keys      text[];
BEGIN
  -- No identity, no answer. Every branch below is keyed on v_uid, so a NULL
  -- would match nothing anyway — but returning here keeps the helper calls
  -- (fn_my_hr_organization_ids and friends) from running for nobody.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_super       := COALESCE(public.is_super_admin(), false);
  v_is_admin       := COALESCE(public.is_admin(), false);
  -- Computed ONCE. All are SECURITY DEFINER helpers keyed on auth.uid(); the
  -- leave rule (fn_leave_step_admits) calls them per row, which is the cost
  -- this function avoids. These four together are the inputs of that rule.
  v_has_leave_perm     := COALESCE(public.user_has_permission('hr.leave.approve'), false);
  -- The recruitment module's own management key — the gate the 'offer' branch
  -- mirrors (see the header). Computed once, like the rest. .view is required
  -- alongside .edit because the row is a LINK into a page every one of whose
  -- screens gates on .view; today the .edit set is a strict subset of the
  -- .view set, so the conjunct removes no row from anyone's desk.
  v_has_recruit_edit   := COALESCE(public.user_has_permission('hr.recruitment.edit'), false);
  v_has_recruit_view   := COALESCE(public.user_has_permission('hr.recruitment.view'), false);
  v_org_ids            := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_designated_org_ids := COALESCE(public.fn_my_designated_hr_org_ids(), ARRAY[]::uuid[]);
  v_staff_ids          := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);

  -- HR queues (20270613101149). user_has_permission() carries its own
  -- super-admin bypass, exactly as the screens and RPCs mirrored below do.
  -- Regularisation: the intersection of the UPDATE policy and the approvals
  -- screen (see the branch).
  v_has_regularise     := COALESCE(public.user_has_permission('hr.attendance.regularize_approve'), false)
                       OR COALESCE(public.user_has_permission('hr.attendance.approve_team'), false)
                       OR COALESCE(public.user_has_permission('hr.attendance.override'), false);
  -- Month close: the lock RPC needs .manage, the close screen needs .view.
  v_has_period_close   := v_is_super
                       OR (COALESCE(public.user_has_permission('hr.attendance.period.manage'), false)
                           AND COALESCE(public.user_has_permission('hr.attendance.period.view'), false));
  v_has_rev_college    := COALESCE(public.user_has_permission('hr.payroll.salary_revision.college_check'), false);
  -- The body of fn_hr_salary_revision_can_approve(), inlined.
  v_can_rev_approve    := v_is_super
                       OR COALESCE(public.user_has_permission('hr.payroll.salary_revision.approve'), false);
  v_has_photo_review   := COALESCE(public.user_has_permission('hr.staff_photo.review'), false);
  v_has_emp_edit       := COALESCE(public.user_has_permission('hr.employees.edit'), false);
  v_staff_inst_ids     := COALESCE(public.fn_my_staff_institution_ids(), ARRAY[]::uuid[]);
  -- The role keys the onboarding complete-step route reads: profiles.role
  -- plus every user_roles -> custom_roles.role_key, as stored (no
  -- is_active filter and no lower(): the route applies neither).
  SELECT COALESCE(array_agg(DISTINCT k.key), ARRAY[]::text[])
    INTO v_all_role_keys
    FROM (
      SELECT p.role::text AS key FROM public.profiles p WHERE p.id = v_uid
      UNION ALL
      SELECT cr.role_key::text FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
       WHERE ur.user_id = v_uid
    ) k
   WHERE k.key IS NOT NULL AND k.key <> '';

  RETURN QUERY
  WITH my_roles AS (
    -- Multi-role, OR-merged. role_key kept in BOTH cases: recruitment matches
    -- lower() (its RPC does), leave matches exact (fn_leave_step_admits does).
    SELECT cr.id AS role_id, cr.role_key, lower(cr.role_key) AS role_key_lc,
           cr.role_name, cr.is_active
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
  ),

  -- 1. RECRUITMENT — mirrors fn_list_my_pending_recruitment(p_user_id).
  recruitment AS (
    SELECT
      'recruitment'::text                                  AS source,
      c.id                                                 AS item_id,
      c.name || ' — ' || c.role_title                      AS title,
      CASE
        WHEN (s.step ->> 'approver_user_id') = v_uid::text THEN 'pinned to you by name'
        ELSE 'you hold role ' || COALESCE(s.step ->> 'approver_role', '?')
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      c.submitted_at                                       AS waiting_since,
      -- due_at (20270613101149): the step's stored escalate_after_hours,
      -- counted from when THIS step began — the previous step's decided_at,
      -- or c.submitted_at for the first step. NULL when the step carries no usable
      -- number. Read through a throw-proof cast: a malformed stamp must not
      -- take the whole desk down.
      CASE
        WHEN (s.step ->> 'escalate_after_hours') ~ '^[0-9]{1,5}$'
        THEN COALESCE(
               CASE WHEN c.current_step > 0
                    THEN public.fn_my_desk_ts_or_null(c.approval_chain -> (c.current_step - 1) ->> 'decided_at')
               END,
               c.submitted_at)
             + make_interval(hours => (s.step ->> 'escalate_after_hours')::int)
      END                                                  AS due_at,
      '/hr/recruitment/approvals'::text                    AS href
    FROM public.hr_recruitment_candidates c
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(c.approval_chain) = 'array'
         AND jsonb_array_length(c.approval_chain) > 0
         AND c.current_step >= 0
        THEN c.approval_chain -> c.current_step
      END AS step
    ) s
    WHERE c.status IN ('submitted', 'pending_approval')
      AND s.step IS NOT NULL
      AND (
        (s.step ->> 'approver_user_id') = v_uid::text
        OR (
          (s.step ->> 'approver_user_id') IS NULL
          AND lower(s.step ->> 'approver_role') IN (SELECT role_key_lc FROM my_roles)
        )
      )
  ),

  -- 2. REFUND — mirrors the stage predicate (fn_refund_assignee_match) that the
  --    refund RLS and stage-action panel already use.
  refund AS (
    SELECT
      'refund'::text                                       AS source,
      r.id                                                 AS item_id,
      r.request_number || ' — '
        || COALESCE(NULLIF(trim(COALESCE(lp.first_name, '') || ' ' || COALESCE(lp.last_name, '')), ''),
                    'learner')                             AS title,
      CASE
        WHEN COALESCE(s.stage -> 'assignee_users' ? v_uid::text, false) THEN 'pinned to you by name'
        ELSE 'you hold role ' || COALESCE((
          SELECT string_agg(mr.role_name, ', ' ORDER BY mr.role_name)
          FROM my_roles mr
          WHERE COALESCE(s.stage -> 'assignee_roles' ? mr.role_id::text, false)
        ), '?')
      END                                                  AS detail,
      r.total_refund_amount                                AS amount,
      COALESCE(r.initiated_at, r.created_at)               AS waiting_since,
      NULL::timestamptz                                    AS due_at,   -- no deadline is stored on a refund stage
      '/billing/refunds'::text                             AS href
    FROM public.billing_refund_requests r
    LEFT JOIN public.learners_profiles lp ON lp.id = r.student_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(r.flow_snapshot -> 'stages') = 'array'
         AND r.current_stage_index >= 0
        THEN r.flow_snapshot -> 'stages' -> r.current_stage_index
      END AS stage
    ) s
    WHERE r.status = 'pending_review'
      AND s.stage IS NOT NULL
      AND public.fn_refund_assignee_match(s.stage -> 'assignee_roles', s.stage -> 'assignee_users', v_uid)
  ),

  -- 3. LEAVE — fn_leave_step_admits (20260831140000) minus its super-admin
  --    "may act" clause, set-based: the same four inputs (hr.leave.approve,
  --    fn_my_hr_organization_ids, fn_my_designated_hr_org_ids, fn_my_staff_ids)
  --    evaluated once above instead of per row. The step is read through
  --    fn_leave_step_approvers exactly as the rule does, so a legacy single
  --    approver step and a multi-approver / ladder step resolve identically.
  --
  --    The scope test (institution/department/rank) CANNOT be hoisted -- it is
  --    per applicant -- so it is a CASE at the very end, entered only for rows
  --    that already matched a role and an organisation.
  leave AS (
    SELECT
      'leave'::text                                        AS source,
      a.id                                                 AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — ' || to_char(a.start_date::date, 'DD Mon')
        || ' to ' || to_char(a.end_date::date, 'DD Mon YYYY')    AS title,
      CASE
        WHEN m.pinned_to_me THEN 'pinned to you by name'
        ELSE 'you hold role ' || m.my_step_roles
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      a.created_at                                         AS waiting_since,
      -- due_at (20270613101149): the step's stored escalate_after_hours,
      -- counted from when THIS step began — the previous step's decided_at,
      -- or a.created_at for the first step. NULL when the step carries no usable
      -- number. Read through a throw-proof cast: a malformed stamp must not
      -- take the whole desk down.
      CASE
        WHEN (s.step ->> 'escalate_after_hours') ~ '^[0-9]{1,5}$'
        THEN COALESCE(
               CASE WHEN a.current_step > 0
                    THEN public.fn_my_desk_ts_or_null(a.approval_chain -> (a.current_step - 1) ->> 'decided_at')
               END,
               a.created_at)
             + make_interval(hours => (s.step ->> 'escalate_after_hours')::int)
      END                                                  AS due_at,
      '/hr/leave/approvals'::text                          AS href
    FROM public.hr_leave_applications a
    LEFT JOIN public.staff st ON st.id = a.employee_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(a.approval_chain) = 'array'
         AND a.current_step >= 0
        THEN a.approval_chain -> a.current_step
      END AS step
    ) s
    CROSS JOIN LATERAL (
      -- One pass over the step's approver entries: am I named, which of the
      -- step's roles do I actively hold (fn_leave_step_admits: exact role_key,
      -- cr.is_active), and -- for the scope test below -- ONE of those role
      -- keys, since every role I hold on this step shares the step.
      SELECT
        COALESCE(bool_or(e.approver_user_id = v_uid), false)           AS pinned_to_me,
        string_agg(DISTINCT e.approver_role, '/')
          FILTER (WHERE e.approver_role IS NOT NULL
                    AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS my_step_roles,
        min(e.approver_role)
          FILTER (WHERE e.approver_role IS NOT NULL
                    AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS scope_role
      FROM public.fn_leave_step_approvers(s.step) e
    ) m
    WHERE a.status IN ('pending', 'escalated')
      AND s.step IS NOT NULL
      AND NOT (a.employee_id = ANY (v_staff_ids))
      AND (
        -- PINNED: an explicit naming, reachable from any institution.
        m.pinned_to_me
        OR (
          -- ROLE: only inside institutions I genuinely reach (140000's rule,
          -- without the is_super_admin() clause — see the header).
          m.my_step_roles IS NOT NULL
          AND (
            (v_has_leave_perm AND a.hr_organization_id = ANY (v_org_ids))
            OR a.hr_organization_id = ANY (v_designated_org_ids)
          )
          -- CASE, not AND: keeps the per-row DEFINER call off every row that
          -- failed the cheap tests above.
          AND CASE
                WHEN v_is_super THEN true
                ELSE public.fn_hr_leave_scope_admits(a.employee_id, m.scope_role)
              END
        )
      )
  ),

  -- 4. MEETING TRIGGER — /meetings/triggers gate + the console's DECIDABLE set,
  --    restricted to rows decidable NOW (deadline passed, already explained, or
  --    no deadline ever stamped). A broadcast: identical for every admin.
  meeting_trigger AS (
    SELECT
      'meeting_trigger'::text                              AS source,
      e.id                                                 AS item_id,
      e.metric_key || COALESCE(' — ' || e.subject_label, '') AS title,
      'admin/super_admin gate — shown to every admin'::text AS detail,
      NULL::numeric                                        AS amount,
      COALESCE(e.explanation_deadline, e.created_at)       AS waiting_since,
      NULL::timestamptz                                    AS due_at,   -- the deadline is the explanation's, already passed
      '/meetings/triggers'::text                           AS href
    FROM public.meeting_trigger_events e
    WHERE (v_is_super OR v_is_admin)
      AND e.director_decision IS NULL
      AND e.status IN ('notified', 'explained', 'meeting_pending')
      AND (
        e.explanation_deadline IS NULL
        OR e.explanation_deadline < now()
        OR e.status = 'explained'
      )
  ),

  -- 5. GRIEVANCE — unassigned and live, exactly as director-signals.ts reads it;
  --    super admin only (Director fallback). A broadcast: identical for every
  --    super admin.
  grievance AS (
    SELECT
      'grievance'::text                                    AS source,
      g.id                                                 AS item_id,
      g.ticket_number || ' — ' || g.subject                AS title,
      'no assignee — Director fallback, shown to every super admin'::text AS detail,
      NULL::numeric                                        AS amount,
      g.created_at                                         AS waiting_since,
      NULL::timestamptz                                    AS due_at,   -- no deadline is stored on a grievance
      '/learners-council/issues'::text                     AS href
    FROM public.grievance_tickets g
    WHERE v_is_super
      AND g.assigned_to IS NULL
      AND g.resolved_at IS NULL
      AND g.withdrawn_at IS NULL
  ),

  -- 6. OFFER — salary agreed, nobody has started onboarding. Not a chain row:
  --    at 'package_fixed' the chain is complete and no approver is derivable,
  --    so this branch asks who may do the NEXT ACT in this college instead.
  --    Gate mirrored: hr.recruitment.edit + .view (the module's own management
  --    key, plus the key every page in the module requires to open at all —
  --    the status route itself enforces nothing beyond authentication; see the
  --    header for what was read and why that was not mirrored literally).
  --    Scoped on hr_organization_id (NOT NULL here), never institution_id:
  --    role_has_institution_access(NULL) is unconditionally TRUE, so scoping on
  --    a nullable institution_id would show the two NULL rows to every .edit
  --    holder in every college.
  offer AS (
    SELECT
      'offer'::text                                        AS source,
      c.id                                                 AS item_id,
      -- role_title is NOT NULL on this table, so a naked concat is safe here
      -- exactly as it is in the recruitment branch above.
      c.name || ' — ' || c.role_title                      AS title,
      -- The detail must not assert something the row's own data contradicts.
      -- SARANYA R (26d) already has an onboarding checklist started — telling
      -- her college "nobody has started onboarding" would be false — and the
      -- two oldest rows have no job linked, so the page that starts onboarding
      -- cannot be reached from them at all. Three states, three sentences.
      CASE
        -- ADDED 2026-09-12, first WHEN so it wins: an offer HAS been issued and
        -- the wait is now on the person, not on us. The three package_fixed
        -- sentences below are unchanged and still the only thing a
        -- package_fixed row can read.
        WHEN c.status = 'offer_issued'
          THEN 'offer issued — waiting for them to join'
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND (c.role_specific_details->>'onboarding_started_at') IS NOT NULL
          THEN 'salary agreed — onboarding started, not finished'
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND c.role_specific_details->>'job_id'
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN 'salary agreed — nobody has started onboarding'
        ELSE 'salary agreed — onboarding not started, and no job is linked'
      END                                                  AS detail,
      -- The agreed figure lives on a package row, not on the candidate.
      NULL::numeric                                        AS amount,
      -- submitted_at, not updated_at: a BEFORE UPDATE trigger resets the latter.
      -- COALESCE added 2026-09-12: once an offer has gone out the clock the desk
      -- shows must restart from THAT day. Without this the queue kept reading
      -- "162 days" and climbing after HR acted, with only one sentence of detail
      -- changed, which reads as "nothing happened" and defeats the queue. Rows
      -- that reached offer_issued before the control existed have a NULL stamp
      -- (no backfill — there is no such moment to record), so they keep their
      -- submitted_at age exactly as before. age_days stays floored at 0.
      COALESCE(c.offer_issued_at, c.submitted_at)          AS waiting_since,
      NULL::timestamptz                                    AS due_at,   -- no deadline is stored for an offer
      -- Point at the page that CAN act. The job workspace gates "Start
      -- Onboarding" on exactly this status. As of 2026-09-12 BOTH pages carry the
      -- Issue Offer control, so neither href dead-ends any more. The link to the
      -- job is a soft JSONB value with no
      -- foreign key, so the uuid shape is required before a path is built —
      -- a junk value falls back rather than producing a broken URL, and a
      -- missing key yields NULL (NULL ~ pattern is NULL, not true).
      -- ~* not ~: Postgres regex matching is case-sensitive and the class is
      -- lowercase-only, so an upper- or mixed-case uuid from any client would
      -- silently take the ELSE branch and route a live candidate to the page
      -- with no control. Nothing constrains the shape of this JSONB value.
      -- jsonb_typeof guard for the same reason every other jsonb read in this
      -- file carries one: the column is NOT NULL but may hold a scalar.
      CASE
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND c.role_specific_details->>'job_id'
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN '/hr/recruitment/approvals/' || (c.role_specific_details->>'job_id')
        ELSE '/hr/recruitment/candidates/' || c.id::text
      END                                                  AS href
    FROM public.hr_recruitment_candidates c
    WHERE v_has_recruit_edit
      AND v_has_recruit_view
      -- WIDENED 2026-09-12: both post-package statuses. 'package_fixed' alone
      -- meant that issuing an offer removed the hire from every desk at the
      -- exact moment someone finally acted on them.
      AND c.status IN ('package_fixed', 'offer_issued')
      -- The SECOND half of workspace-candidates-tab's isPostApproval. Today it
      -- can never fire — onboard-to-staff writes staff_record_id and
      -- status='joined' in ONE update, so 'package_fixed' + staff_record_id is
      -- unreachable, and 0 of 34 candidates carry the key at all. Encoded so
      -- that the branch is the WHOLE gate it claims to mirror rather than half
      -- of it, and so a future partial write cannot strand an uncleanable row.
      AND (jsonb_typeof(c.role_specific_details) <> 'object'
           OR (c.role_specific_details->>'staff_record_id') IS NULL)
      AND c.hr_organization_id = ANY (v_org_ids)
  ),

  -- ==========================================================================
  -- HR QUEUES — added by 20270613101149 (HR staff harness, step 1). Every
  -- branch below copies the "who can act" rule of the screen that owns the
  -- queue, INTERSECTED with the database rule that lets the act succeed, so a
  -- row never links someone to a page that refuses them or an act that fails.
  -- Where a module lets a person act on their own request, the row is still
  -- left off their desk (narrower, never wider). See the migration header for
  -- what each rule was read from.
  -- ==========================================================================

  -- 7. COMP-OFF CLAIMS — hr_comp_off_credits waiting for a decision. The rule
  --    is the table's UPDATE policy hcoc_update (20260912100000):
  --    hr.leave.approve AND hr_organization_id in fn_my_hr_organization_ids(),
  --    not the claimant's own. A claim whose credit has expired cannot be
  --    approved (trg_hcoc_block_expired_approval refuses it; a nightly job
  --    rejects it), so it is not listed. due_at = the end of expires_on on the
  --    Indian clock: the last moment the claim can still be approved.
  comp_off AS (
    SELECT
      'comp_off'::text                                     AS source,
      cc.id                                                AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — worked ' || to_char(cc.worked_date, 'DD Mon YYYY')  AS title,
      'comp-off claim for ' || trim_scale(cc.credit_days)::text
        || CASE WHEN cc.credit_days = 1 THEN ' day' ELSE ' days' END
        || ' — you approve leave here'                     AS detail,
      NULL::numeric                                        AS amount,
      cc.created_at                                        AS waiting_since,
      ((cc.expires_on + 1)::timestamp AT TIME ZONE 'Asia/Kolkata') AS due_at,
      '/hr/leave/approvals?tab=comp-off'::text             AS href
    FROM public.hr_comp_off_credits cc
    LEFT JOIN public.staff st ON st.id = cc.employee_id
    WHERE v_has_leave_perm
      -- NOT a super admin (coordinator ruling, design decision 2: the
      -- Director gets no item-level queue of other people's work). A super
      -- admin reaches this queue only through user_has_permission()'s bypass,
      -- so they are left out — including one who ALSO holds the key through a
      -- real role: the guard is on v_is_super alone, simple and predictable.
      AND NOT v_is_super
      AND cc.status = 'pending'
      AND cc.hr_organization_id = ANY (v_org_ids)
      AND NOT (cc.employee_id = ANY (v_staff_ids))
      AND cc.expires_on >= v_today
  ),

  -- 8. LEAVE ELIGIBILITY — hr_leave_eligibilities at status 'pending'. The
  --    decide policy is fn_is_designated_eligibility_approver(id) =
  --    fn_leave_step_admits(chain[current_step], me, org, employee): the SAME
  --    rule as leave, on the eligibility's own frozen chain. So this is the
  --    leave branch above, set-based, with the same tests — pinned, or an
  --    active role on the step inside an organisation I reach, plus the
  --    per-applicant scope test in CASE — minus its super-admin "may act"
  --    clause, and not my own request.
  leave_eligibility AS (
    SELECT
      'leave_eligibility'::text                            AS source,
      e.id                                                 AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — ' || COALESCE(lt.leave_type_name::text, 'leave type')  AS title,
      CASE
        WHEN m.pinned_to_me THEN 'pinned to you by name'
        ELSE 'you hold role ' || m.my_step_roles
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      e.created_at                                         AS waiting_since,
      CASE
        WHEN (s.step ->> 'escalate_after_hours') ~ '^[0-9]{1,5}$'
        THEN COALESCE(
               CASE WHEN e.current_step > 0
                    THEN public.fn_my_desk_ts_or_null(e.approval_chain -> (e.current_step - 1) ->> 'decided_at')
               END,
               e.created_at)
             + make_interval(hours => (s.step ->> 'escalate_after_hours')::int)
      END                                                  AS due_at,
      '/hr/leave/eligibility'::text                        AS href
    FROM public.hr_leave_eligibilities e
    LEFT JOIN public.staff st ON st.id = e.employee_id
    LEFT JOIN public.hr_leave_types lt ON lt.id = e.leave_type_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(e.approval_chain) = 'array'
         AND e.current_step >= 0
        THEN e.approval_chain -> e.current_step
      END AS step
    ) s
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(bool_or(ea.approver_user_id = v_uid), false)          AS pinned_to_me,
        string_agg(DISTINCT ea.approver_role, '/')
          FILTER (WHERE ea.approver_role IS NOT NULL
                    AND ea.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS my_step_roles,
        min(ea.approver_role)
          FILTER (WHERE ea.approver_role IS NOT NULL
                    AND ea.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS scope_role
      FROM public.fn_leave_step_approvers(s.step) ea
    ) m
    WHERE e.status = 'pending'
      AND s.step IS NOT NULL
      AND NOT (e.employee_id = ANY (v_staff_ids))
      AND (
        m.pinned_to_me
        OR (
          m.my_step_roles IS NOT NULL
          AND (
            (v_has_leave_perm AND e.hr_organization_id = ANY (v_org_ids))
            OR e.hr_organization_id = ANY (v_designated_org_ids)
          )
          AND CASE
                WHEN v_is_super THEN true
                ELSE public.fn_hr_leave_scope_admits(e.employee_id, m.scope_role)
              END
        )
      )
  ),

  -- 9. ATTENDANCE REGULARISATION — hr_attendance_regularizations at
  --    'pending'. There is no chain and no institution scope in this module:
  --    the UPDATE policy admits super admin, is_admin(), regularize_approve,
  --    approve_team or override; the approvals screen admits super admin,
  --    regularize_approve, approve_team, edit or override. The intersection —
  --    super admin, regularize_approve, approve_team, override — is used
  --    (edit alone opens the screen but cannot write; is_admin() alone can
  --    write but the screen does not open). Plus the restrictive
  --    hr_included_gate SELECT policy (fn_hr_staff_institution_included,
  --    inlined), and never my own request. A BROADCAST, like the module:
  --    every holder sees the same rows, and the detail says so.
  regularisation AS (
    SELECT
      'regularisation'::text                               AS source,
      r.id                                                 AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — ' || to_char(r.for_date, 'DD Mon YYYY')     AS title,
      'attendance correction — shown to everyone who approves corrections'::text AS detail,
      NULL::numeric                                        AS amount,
      r.created_at                                         AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      '/hr/attendance/regularize/approvals'::text          AS href
    FROM public.hr_attendance_regularizations r
    LEFT JOIN public.staff st ON st.id = r.employee_id
    WHERE v_has_regularise
      -- NOT a super admin (coordinator ruling, design decision 2: the
      -- Director gets no item-level queue of other people's work). A super
      -- admin reaches this queue only through user_has_permission()'s bypass,
      -- so they are left out — including one who ALSO holds the key through a
      -- real role: the guard is on v_is_super alone, simple and predictable.
      AND NOT v_is_super
      AND r.status = 'pending'
      AND NOT (r.employee_id = ANY (v_staff_ids))
      AND EXISTS (
        SELECT 1
        FROM public.staff s2
        JOIN public.hr_organizations o ON o.institution_id = s2.institution_id
        WHERE s2.id = r.employee_id AND o.included_in_hr
      )
  ),

  -- 10. ATTENDANCE MONTH CLOSE — for whoever may lock a month
  --     (fn_hr_lock_attendance_period: super admin or
  --     hr.attendance.period.manage; the close screen also needs .view), in
  --     the institutions the close console lists (role_has_institution_access
  --     AND included in HR). A row is one of the last three completed months
  --     that has attendance records and is not locked. No close-by date is
  --     stored anywhere, so due_at is NULL and waiting_since is the first day
  --     after the month ended. A period row exists only once someone tries to
  --     lock, so item_id is a stable key derived from institution + month,
  --     not a table id.
  attendance_close AS (
    SELECT
      'attendance_close'::text                             AS source,
      md5('attendance_close:' || i.id::text || ':' || to_char(mo.month_start, 'YYYY-MM'))::uuid AS item_id,
      i.name::text || ' — ' || to_char(mo.month_start, 'Mon YYYY')  AS title,
      CASE
        WHEN ap.reopened_at IS NOT NULL THEN 'month reopened and not locked again'
        ELSE 'month ended and is not locked'
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      ((mo.month_start + interval '1 month')::timestamp AT TIME ZONE 'Asia/Kolkata') AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      '/hr/attendance/close'::text                         AS href
    FROM public.institutions i
    CROSS JOIN LATERAL (
      SELECT (date_trunc('month', v_today::timestamp) - make_interval(months => k))::date AS month_start
      FROM generate_series(1, 3) AS k
    ) mo
    LEFT JOIN public.hr_attendance_periods ap
           ON ap.institution_id = i.id
          AND ap.period_year  = extract(year  FROM mo.month_start)::int
          AND ap.period_month = extract(month FROM mo.month_start)::int
    WHERE v_has_period_close
      -- NOT a super admin (coordinator ruling, design decision 2: the
      -- Director gets no item-level queue of other people's work). A super
      -- admin reaches this queue only through user_has_permission()'s bypass,
      -- so they are left out — including one who ALSO holds the key through a
      -- real role: the guard is on v_is_super alone, simple and predictable.
      AND NOT v_is_super
      AND COALESCE(ap.status, 'open') <> 'locked'
      AND EXISTS (
        SELECT 1 FROM public.hr_organizations o
        WHERE o.institution_id = i.id AND o.included_in_hr
      )
      AND EXISTS (
        SELECT 1 FROM public.hr_attendance_records rr
        WHERE rr.institution_id = i.id
          AND rr.work_date >= mo.month_start
          AND rr.work_date <  (mo.month_start + interval '1 month')::date
      )
      -- CASE, not AND: the per-institution DEFINER call runs only for rows
      -- that already passed the cheap tests.
      AND CASE WHEN v_is_super THEN false ELSE public.role_has_institution_access(i.id) END
  ),

  -- 11. SALARY REVISION — hr_salary_revision_requests (20270519090000).
  --     College check: status 'waiting_principal', exactly the test in
  --     fn_hr_salary_revision_college_decide — .college_check, the request's
  --     college among MY staff colleges (fn_my_staff_institution_ids, not the
  --     wide role scope), and not about my own pay.
  --     Final yes or no: status 'waiting_director', exactly
  --     fn_hr_salary_revision_can_approve() (super admin or .approve), inlined
  --     so this function does not depend on the helper; not my own pay.
  --     amount = the monthly gross asked for, which both screens already show
  --     that reader. Nothing expires (ruling 11), so due_at is NULL.
  salary_revision AS (
    SELECT
      'salary_revision'::text                              AS source,
      q.id                                                 AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — monthly pay revision'                       AS title,
      CASE
        WHEN q.status = 'waiting_principal' THEN 'college check — you check requests for this college'
        ELSE 'final yes or no — Director approval'
      END
        || CASE WHEN q.is_cut THEN ' (asks for a cut)' ELSE '' END  AS detail,
      q.asked_monthly_gross                                AS amount,
      CASE
        WHEN q.status = 'waiting_director' THEN COALESCE(q.principal_decided_at, q.created_at)
        ELSE q.created_at
      END                                                  AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      CASE
        WHEN q.status = 'waiting_principal' THEN '/hr/salary-revisions/college-check'
        ELSE '/hr/salary-revisions/approve'
      END                                                  AS href
    FROM public.hr_salary_revision_requests q
    LEFT JOIN public.staff st ON st.id = q.staff_id
    WHERE NOT (q.staff_id = ANY (v_staff_ids))
      AND (
        -- The college check is operational work: not a super admin (see the
        -- guard note on comp_off). The Director half below KEEPS super
        -- admins — there they are the actual actor.
        (q.status = 'waiting_principal'
         AND NOT v_is_super
         AND v_has_rev_college
         AND q.institution_id = ANY (v_staff_inst_ids))
        OR
        -- Raises for people on the Director list: PR #4190 (draft) adds
        -- platform_policies 'hr.salary_revision.list_member_raise_decider_profile_id',
        -- the one profile allowed to decide such a raise. That key is not on
        -- main, so this half still shows every waiting_director row to every
        -- holder of fn_hr_salary_revision_can_approve(). When #4190 lands, show
        -- a Director-list member's raise only to the profile that row names.
        (q.status = 'waiting_director'
         AND v_can_rev_approve)
      )
  ),

  -- 12. PAYROLL PERIOD — hr_payroll_periods not yet locked. The stage RPC
  --     fn_advance_payroll_period admits a role map (hr_officer / cao /
  --     accounts / chairperson / director) OR super admin OR is_admin(), but
  --     every screen on this path is wrapped in SuperAdminOnly, so the only
  --     people who can actually act are super admins — at every stage. A
  --     BROADCAST to every super admin, said in the detail. Plus the
  --     restrictive hr_included_gate (fn_hr_org_included and
  --     fn_hr_institution_included, inlined). This path is dormant (its pay
  --     scale table is empty) and may return nothing. waiting_since = the
  --     latest stage stamp in hr_payroll_period_approvals, else created_at
  --     (NOT updated_at, which a trigger moves on any edit).
  payroll_period AS (
    SELECT
      'payroll_period'::text                               AS source,
      p.id                                                 AS item_id,
      COALESCE(pi.name::text, 'institution')
        || ' — ' || to_char(make_date(p.period_year, p.period_month, 1), 'Mon YYYY')
        || CASE p.engine_type WHEN 'faculty' THEN ' (teaching)' ELSE ' (non-teaching)' END  AS title,
      'next: '
        || CASE p.status
             WHEN 'draft'                THEN 'prepare'
             WHEN 'prepared'             THEN 'CAO review'
             WHEN 'cao_reviewed'         THEN 'accounts check'
             WHEN 'accounts_verified'    THEN 'chairperson approval'
             WHEN 'chairperson_approved' THEN 'distribute'
             WHEN 'distributed'          THEN 'lock'
             ELSE p.status
           END
        || ' — super admin screen, shown to every super admin'  AS detail,
      NULL::numeric                                        AS amount,
      COALESCE(
        (SELECT max(pa.acted_at) FROM public.hr_payroll_period_approvals pa WHERE pa.period_id = p.id),
        p.created_at)                                      AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      '/hr/admin/payroll/periods/' || p.id::text           AS href
    FROM public.hr_payroll_periods p
    LEFT JOIN public.institutions pi ON pi.id = p.institution_id
    WHERE v_is_super
      AND p.status <> 'locked'
      AND EXISTS (SELECT 1 FROM public.hr_organizations o
                  WHERE o.id = p.hr_organization_id AND o.included_in_hr)
      AND EXISTS (SELECT 1 FROM public.hr_organizations o
                  WHERE o.institution_id = p.institution_id AND o.included_in_hr)
  ),

  -- 13. STAFF PHOTO — hr_staff_photo_submissions at 'pending'. The review
  --     RPC (fn_review_staff_photo_submission, 20261224164500) admits super
  --     admin, is_admin(), or hr.staff_photo.review in an institution I reach;
  --     the screen opens on hr.staff_photo.review. Intersection: super admin,
  --     or the key AND role_has_institution_access(institution_id) — and then
  --     super admins are taken OUT (coordinator ruling, see comp_off). Not my
  --     own photo. No deadline is stored.
  staff_photo AS (
    SELECT
      'staff_photo'::text                                  AS source,
      ps.id                                                AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')                                 AS title,
      'new photo to review — you review photos for this college'::text AS detail,
      NULL::numeric                                        AS amount,
      ps.submitted_at                                      AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      '/hr/staff-photos'::text                             AS href
    FROM public.hr_staff_photo_submissions ps
    LEFT JOIN public.staff st ON st.id = ps.staff_id
    WHERE ps.status = 'pending'
      AND NOT (ps.staff_id = ANY (v_staff_ids))
      -- NOT a super admin (see the guard note on comp_off): the first WHEN
      -- answers false, which also keeps the DEFINER call off their rows.
      AND CASE
            WHEN v_is_super THEN false
            WHEN v_has_photo_review THEN public.role_has_institution_access(ps.institution_id)
            ELSE false
          END
  ),

  -- 14. EMPLOYEE DOCUMENT — hr_employee_documents at verification_status
  --     'pending' that no newer upload replaces (the verify screen drops those
  --     in code; here it is a NOT EXISTS). Verify / reject are direct UPDATEs,
  --     so the UPDATE policy is the rule: super admin, is_admin(), or
  --     hr.employees.edit AND role_has_institution_access(institution_id);
  --     the screen opens on hr.employees.edit. Intersection: super admin, or
  --     the key AND the scope — and then super admins are taken OUT
  --     (coordinator ruling, see comp_off). Plus the restrictive hr_included_gate
  --     (fn_hr_institution_included AND fn_hr_staff_institution_included,
  --     inlined). Not my own document. due_at = the document's own stored
  --     expiry (expires_at), and the detail says that is what it is.
  employee_document AS (
    SELECT
      'employee_document'::text                            AS source,
      d.id                                                 AS item_id,
      d.document_name || ' — '
        || COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
                    'employee')                            AS title,
      CASE
        WHEN d.expires_at IS NOT NULL
          THEN 'uploaded document to verify — the document expires '
               || to_char(d.expires_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
        ELSE 'uploaded document to verify'
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      d.uploaded_at                                        AS waiting_since,
      d.expires_at                                         AS due_at,
      '/hr/documents/verify'::text                         AS href
    FROM public.hr_employee_documents d
    LEFT JOIN public.staff st ON st.id = d.staff_id
    WHERE d.verification_status = 'pending'
      AND NOT (d.staff_id = ANY (v_staff_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.hr_employee_documents nd
        WHERE nd.replaces_document_id = d.id
      )
      AND EXISTS (SELECT 1 FROM public.hr_organizations o
                  WHERE o.institution_id = d.institution_id AND o.included_in_hr)
      AND EXISTS (SELECT 1
                  FROM public.staff s2
                  JOIN public.hr_organizations o ON o.institution_id = s2.institution_id
                  WHERE s2.id = d.staff_id AND o.included_in_hr)
      -- NOT a super admin (see the guard note on comp_off).
      AND CASE
            WHEN v_is_super THEN false
            WHEN v_has_emp_edit THEN public.role_has_institution_access(d.institution_id)
            ELSE false
          END
  ),

  -- 15. PROMOTION — hr_promotion_applications at 'submitted' (waiting for
  --     scoring) or 'sedc_scored' (waiting for the decision). There is no
  --     scoring or decide RPC; both screens are wrapped in SuperAdminOnly, so
  --     only super admins can act, and nothing separates the scorer from the
  --     decider. A BROADCAST to every super admin, said in the detail. Not my
  --     own application. waiting_since = the stamp of the step it is waiting
  --     after (updated_at is moved by a trigger).
  promotion AS (
    SELECT
      'promotion'::text                                    AS source,
      pa.id                                                AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — ' || pa.from_designation_name || ' to ' || pa.to_designation_name  AS title,
      CASE
        WHEN pa.status = 'submitted' THEN 'waiting for scoring'
        ELSE 'scored — waiting for the final decision'
      END
        || ' — super admin screen, shown to every super admin'  AS detail,
      NULL::numeric                                        AS amount,
      CASE
        WHEN pa.status = 'sedc_scored' THEN COALESCE(pa.sedc_reviewed_at, pa.submitted_at)
        ELSE pa.submitted_at
      END                                                  AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      '/hr/admin/promotions/' || pa.id::text               AS href
    FROM public.hr_promotion_applications pa
    LEFT JOIN public.staff st ON st.id = pa.staff_id
    WHERE v_is_super
      AND pa.status IN ('submitted', 'sedc_scored')
      AND NOT (pa.staff_id = ANY (v_staff_ids))
  ),

  -- 16. TERMINATION — hr_offboarding_cases with separation_type
  --     'termination', status 'open', at the first chain step that is not yet
  --     approved, when that step is 'pending' — exactly the review screen's
  --     canApprove. The review screen is SuperAdminOnly and advancing never
  --     compares the step's approver_id to the caller, so the people who can
  --     act are super admins. A BROADCAST to every super admin; a step that
  --     names me says so. Not about me. waiting_since = the previous step's
  --     acted_at, else initiated_at. recommended_last_day is the person's last
  --     day, not a deadline for the step, so due_at is NULL.
  termination AS (
    SELECT
      'termination'::text                                  AS source,
      oc.id                                                AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — '
        || CASE lower(COALESCE(cur.elem ->> 'step', ''))
             WHEN 'sedc'     THEN 'SEDC'
             WHEN 'legal'    THEN 'Legal'
             WHEN 'director' THEN 'Director'
             ELSE COALESCE(NULLIF(initcap(cur.elem ->> 'step'), ''), 'next')
           END
        || ' step'                                         AS title,
      CASE
        WHEN (cur.elem ->> 'approver_id') = v_uid::text THEN 'named on this step'
        ELSE 'super admin screen, shown to every super admin'
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      COALESCE(
        CASE WHEN cur.ord > 1
             THEN public.fn_my_desk_ts_or_null(oc.termination_approval_chain -> (cur.ord - 2)::int ->> 'acted_at')
        END,
        oc.initiated_at)                                   AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      '/hr/admin/terminations/' || oc.id::text || '/review' AS href
    FROM public.hr_offboarding_cases oc
    LEFT JOIN public.staff st ON st.id = oc.staff_id
    CROSS JOIN LATERAL (
      SELECT el.value AS elem, el.ord
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(oc.termination_approval_chain) = 'array'
                  THEN oc.termination_approval_chain
                  ELSE '[]'::jsonb
             END) WITH ORDINALITY AS el(value, ord)
      WHERE COALESCE(el.value ->> 'status', '') <> 'approved'
      ORDER BY el.ord
      LIMIT 1
    ) cur
    WHERE v_is_super
      AND oc.status = 'open'
      AND oc.separation_type = 'termination'
      AND (cur.elem ->> 'status') = 'pending'
      AND NOT (oc.staff_id = ANY (v_staff_ids))
  ),

  -- 17. ONBOARDING STEP — the checklist steps stamped on a hire at
  --     role_specific_details.onboarding_steps (there is no steps table:
  --     /hr/onboarding lists templates only). A step is mine exactly as the
  --     complete-step route (onboarding-complete-step.ts) decides it, minus
  --     its super-admin override:
  --       assigned_user_id set  -> only that person
  --       else assigned_role    -> lower(assigned_role) is one of my role keys
  --                                (profiles.role or any user_roles role_key,
  --                                compared exactly as the route does)
  --       else                  -> I hold hr_officer, hr_head or director_jkkn
  --     INTERSECTED with what lets the write succeed and the screen open:
  --     status approved / package_fixed / offer_issued with no staff record
  --     yet (the job workspace's isPostApproval — 'joined' is allowed by the
  --     route but has no control), and the table's UPDATE + SELECT policies:
  --     super admin, or hr.recruitment.edit AND .view AND
  --     role_has_institution_access(institution_id) — super admins then taken
  --     OUT (coordinator ruling, see comp_off). ONE row per hire: the
  --     earliest open step that is mine, with how many more are mine. The
  --     `offer` branch lists the same hire as a whole for HR; this row is the
  --     step, for its owner. No deadline is stored for a step.
  onboarding_step AS (
    SELECT
      'onboarding_step'::text                              AS source,
      c.id                                                 AS item_id,
      c.name || ' — ' || COALESCE(NULLIF(o.first_step, ''), 'onboarding step')  AS title,
      'onboarding step ' || o.first_ord::text || ' of ' || o.n_steps::text
        || CASE o.first_why
             WHEN 'named' THEN ' — assigned to you by name'
             WHEN 'role'  THEN ' — assigned to your role'
             ELSE ' — unassigned, open to HR'
           END
        || CASE WHEN o.n_mine > 1 THEN ' (' || (o.n_mine - 1)::text || ' more for you)' ELSE '' END  AS detail,
      NULL::numeric                                        AS amount,
      COALESCE(public.fn_my_desk_ts_or_null(c.role_specific_details ->> 'onboarding_started_at'),
               c.submitted_at)                             AS waiting_since,
      NULL::timestamptz                                    AS due_at,
      CASE
        WHEN jsonb_typeof(c.role_specific_details) = 'object'
             AND c.role_specific_details->>'job_id'
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN '/hr/recruitment/approvals/' || (c.role_specific_details->>'job_id')
        ELSE '/hr/recruitment/candidates/' || c.id::text
      END                                                  AS href
    FROM public.hr_recruitment_candidates c
    CROSS JOIN LATERAL (
      SELECT
        count(*)                                                        AS n_mine,
        max(sa.n_steps)                                                 AS n_steps,
        min(sa.ord)                                                     AS first_ord,
        (array_agg(sa.value ->> 'step' ORDER BY sa.ord))[1]             AS first_step,
        (array_agg(
           CASE
             WHEN NULLIF(sa.value ->> 'assigned_user_id', '') IS NOT NULL THEN 'named'
             WHEN NULLIF(sa.value ->> 'assigned_role', '') IS NOT NULL THEN 'role'
             ELSE 'hr'
           END ORDER BY sa.ord))[1]                                     AS first_why
      FROM (
        SELECT el.value, el.ord, count(*) OVER () AS n_steps
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(c.role_specific_details -> 'onboarding_steps') = 'array'
                    THEN c.role_specific_details -> 'onboarding_steps'
                    ELSE '[]'::jsonb
               END) WITH ORDINALITY AS el(value, ord)
      ) sa
      WHERE jsonb_typeof(sa.value) = 'object'
        AND COALESCE(sa.value ->> 'completed', 'false') <> 'true'
        AND CASE
              WHEN NULLIF(sa.value ->> 'assigned_user_id', '') IS NOT NULL
                THEN (sa.value ->> 'assigned_user_id') = v_uid::text
              WHEN NULLIF(sa.value ->> 'assigned_role', '') IS NOT NULL
                THEN lower(sa.value ->> 'assigned_role') = ANY (v_all_role_keys)
              ELSE v_all_role_keys && ARRAY['hr_officer', 'hr_head', 'director_jkkn']::text[]
            END
    ) o
    WHERE c.status IN ('approved', 'package_fixed', 'offer_issued')
      AND (jsonb_typeof(c.role_specific_details) <> 'object'
           OR (c.role_specific_details->>'staff_record_id') IS NULL)
      AND o.n_mine > 0
      -- NOT a super admin (see the guard note on comp_off) — even one named
      -- on a step: the complete-step route lets them act anyway, and a named
      -- super admin is still a super admin.
      AND CASE
            WHEN v_is_super THEN false
            WHEN v_has_recruit_edit AND v_has_recruit_view
              THEN public.role_has_institution_access(c.institution_id)
            ELSE false
          END
  ),

  everything AS (
    SELECT * FROM recruitment
    UNION ALL SELECT * FROM refund
    UNION ALL SELECT * FROM leave
    UNION ALL SELECT * FROM meeting_trigger
    UNION ALL SELECT * FROM grievance
    UNION ALL SELECT * FROM offer
    UNION ALL SELECT * FROM comp_off
    UNION ALL SELECT * FROM leave_eligibility
    UNION ALL SELECT * FROM regularisation
    UNION ALL SELECT * FROM attendance_close
    UNION ALL SELECT * FROM salary_revision
    UNION ALL SELECT * FROM payroll_period
    UNION ALL SELECT * FROM staff_photo
    UNION ALL SELECT * FROM employee_document
    UNION ALL SELECT * FROM promotion
    UNION ALL SELECT * FROM termination
    UNION ALL SELECT * FROM onboarding_step
  )
  SELECT
    x.source,
    x.item_id,
    x.title,
    x.detail,
    x.amount,
    x.waiting_since,
    -- Floored at 0: an 'explained' trigger whose deadline is still ahead is
    -- decidable today, not in negative days.
    GREATEST(0, floor(extract(epoch FROM (now() - COALESCE(x.waiting_since, now()))) / 86400))::integer AS age_days,
    x.href,
    x.due_at
  FROM everything x
  ORDER BY x.waiting_since ASC NULLS LAST, x.source, x.item_id
  LIMIT 500;
END;
$function$;

COMMENT ON FUNCTION public.fn_my_desk_waiting() IS
  'Everything waiting on auth.uid() right now, computed live from the module queues (never from notifications). Returns TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamptz, age_days integer, href text, due_at timestamptz), oldest first, capped at 500. due_at (added by 20270613101149, appended last) is the STORED deadline or NULL — a chain step''s escalate_after_hours counted from when that step began (recruitment, leave, leave_eligibility), a comp-off credit''s expires_on, an employee document''s expires_at; never invented. source ∈ recruitment | refund | leave | meeting_trigger | grievance | offer (the six branches of 20261202090000, byte-identical apart from their due_at line) | comp_off | leave_eligibility | regularisation | attendance_close | salary_revision | payroll_period | staff_photo | employee_document | promotion | termination | onboarding_step (added by 20270613101149). Each branch mirrors the owning screen''s own "who can act" rule intersected with the database rule that lets the act succeed, never the person''s own request; super admins are kept OFF the operational branches they would reach only through user_has_permission''s bypass (comp_off, regularisation, attendance_close, staff_photo, employee_document, onboarding_step, salary_revision at waiting_principal — even if they also hold the key through a real role) and stay on the ones where they are the actor; branches whose only actors are super admins (payroll_period, promotion, termination: SuperAdminOnly screens) and the group-wide regularisation queue are broadcasts and say so in detail. Short time off is already inside leave; leave encashment, attendance exceptions, HR forms and appraisals are left out because nobody can act on them from a screen today (see the 20270613101149 header). Zero rows for a missing identity; never raises on a malformed approval chain, step list or stored timestamp.';

-- The same two statements every earlier version ran. DROP took the old ACL
-- with it; CREATE re-applied the default privileges (PUBLIC, plus Supabase's
-- default grants to anon, authenticated and service_role), so revoking anon
-- and PUBLIC and granting authenticated leaves exactly the grants the function
-- held before this migration (CLAUDE.md rule: lock every SECURITY DEFINER RPC
-- from anon).
REVOKE EXECUTE ON FUNCTION public.fn_my_desk_waiting() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_desk_waiting() TO authenticated;
