-- ============================================================================
-- /my-desk — what is waiting on the signed-in person, computed from the queues.
--
-- Date: 2026-09-03
-- Supersedes 20261018020000 (applied to production 2026-09-02). CREATE OR
-- REPLACE of the SAME function, adding a SIXTH source and changing nothing
-- else: the five existing branches below are byte-for-byte the applied text.
--
-- WHAT CHANGED, AND WHY
--   Director decision, 2026-09-03: "On HR's desk as Offer to issue" —
--   explicitly NOT on the Director's desk, and his existing count of 8
--   recruitment rows must not change.
--
--   Seven candidates sit at status 'package_fixed': salary agreed, and the
--   next act un-taken. They are invisible to every branch of this function,
--   and that was deliberate — the recruitment branch's header (kept below,
--   unedited) says why: at 'package_fixed' the approval chain is COMPLETE, so
--   no approver is derivable and nothing can be said to be "waiting on" a
--   named person through the chain. That reasoning is still correct. What it
--   left out is that a real act is still owed: somebody must bring this hire
--   on board. The oldest of the seven has been owed it for 153 days.
--
--   Because no approver is derivable, this branch cannot ask "whose step is
--   this". It asks the only other question the module answers: WHO MAY DO THE
--   NEXT ACT IN THIS COLLEGE. That is a new shape of row on this desk and the
--   'offer' source name keeps it separable from 'recruitment' — the Director's
--   8 pinned recruitment rows are computed by an untouched branch and stay 8.
--
--   THE WORDS ARE NOT THE DIRECTOR'S WORDS, AND THAT IS DELIBERATE.
--   He approved this queue as "Offer to issue". The heading a reader sees is
--   "Hires to bring on board" and the row reads "salary agreed — nobody has
--   started onboarding", because the status this queue names has never
--   happened: hr_recruitment_candidates has carried FOUR statuses in its
--   entire life (pending_approval 17, approved 9, package_fixed 7, joined 1)
--   and 'offer_issued' is not among them — zero rows, ever. Nor is there
--   anywhere to issue one: a grep of app/ for 'offer_issued' finds status
--   COLOURS and read-only groupings and never a control. Naming a desk queue
--   for a step the product does not perform would send its reader looking for
--   a button that has never existed. His DECISION — these seven belong on
--   HR's desk, not his — is carried out exactly. Only the wording moved to
--   the act the product actually supports, which is onboarding.
--
--   The SOURCE VALUE stays 'offer'. It is the row contract of an RPC already
--   applied to production carrying five source strings; renaming one would be
--   a breaking change to the UI lane for a cosmetic gain. The word is only
--   ever read by code — never by a person.
--
-- Original header follows.
--
-- Date: 2026-09-02
-- Director decision 2026-09-02 22:20 IST: scope = My Desk only.
--
-- WHY THIS EXISTS
--   The dashboard's morning brief reads `notifications`; /my-desk reads
--   `director_handovers`. Neither reads the queues where the work actually
--   sits. A hire pinned to a person's uuid for 48 days, a refund whose current
--   stage names them, a leave request whose current step routes to their role,
--   an accountability breach past its explanation deadline, a grievance nobody
--   has picked up — each is discoverable only by opening the module page that
--   owns it. This function answers, for auth.uid() ONLY, "what is waiting on
--   me right now", by re-running each module page's own queue rule.
--
-- RULE OF THE FILE: every predicate below MIRRORS an existing module page.
-- Nothing here invents a private idea of "pending". Where a rule is already a
-- SECURITY DEFINER helper, that helper is reused. Where the helper is per-row
-- (fn_leave_step_admits calls fn_my_hr_organization_ids and
-- fn_my_designated_hr_org_ids on EVERY call, and the leave queue is ~960 rows),
-- the same predicate is expressed once, set-based, against the helper's own
-- inputs computed a single time.
--
-- ROW CONTRACT (the /my-desk UI lane builds against exactly this):
--   source         text         'recruitment' | 'refund' | 'leave' | 'meeting_trigger' | 'grievance' | 'offer'
--   item_id        uuid         the source row id
--   title          text         one human line (candidate — role; request_number — learner; …)
--   detail         text         WHY it is on this person (named / role / gate / fallback)
--   amount         numeric      money where the queue carries it (refund total); else NULL
--   waiting_since  timestamptz  when it started waiting at THIS step
--   age_days       integer      floor((now() - waiting_since) / 1 day), never below 0
--   href           text         the existing module page where the action already lives
--                               (always a site-relative path starting with '/')
-- ORDER BY waiting_since ASC (oldest first). LIMIT 500.
--
-- PER-SOURCE RULE → MODULE PAGE IT MIRRORS
--   recruitment     fn_list_my_pending_recruitment (20260706120100), the RPC behind
--                   /hr/recruitment/approvals "awaiting your action":
--                   status IN ('submitted','pending_approval'), chain[current_step]
--                   pinned to me, or unpinned and routed to a role_key I hold.
--                   `package_fixed` rows are NOT here: the chain is complete at that
--                   status (approvePackage advances approved → package_fixed) and no
--                   approver is derivable from it — the next act is "issue offer".
--                   waiting_since = submitted_at (NOT NULL, set once). NOT updated_at:
--                   a BEFORE UPDATE set_updated_at trigger resets that on any edit,
--                   so it would report a 48-day-old hire as "waiting 0d" after a
--                   note is added.
--   refund          billing_refund_requests.status = 'pending_review' and
--                   fn_refund_assignee_match(stage.assignee_roles, stage.assignee_users, me)
--                   on flow_snapshot->'stages'->current_stage_index — the same
--                   predicate as hla RLS and the stage-action panel on /billing/refunds/[id].
--   leave           fn_leave_step_admits as defined by 20260831140000
--                   (hr_leave_role_step_scoped_to_own_institution), which is what
--                   /hr/leave/approvals resolves waiting_on_me through
--                   (hr_leave_approval_queue → fn_is_designated_leave_approver →
--                   fn_leave_step_admits). status IN ('pending','escalated'), not my
--                   own application, chain[current_step] read via
--                   fn_leave_step_approvers, and then:
--                     PINNED  — approver_user_id = me. Reachable from ANY institution;
--                               naming a person is an explicit act (140000 keeps this
--                               branch unchanged, and so does this file).
--                     ROLE    — approver_role is an active role_key I hold (exact case,
--                               cr.is_active) AND the application's hr_organization_id
--                               is within reach:
--                                 (user_has_permission('hr.leave.approve')
--                                    AND org = ANY(fn_my_hr_organization_ids()))   -- HR-level: group-wide
--                                 OR org = ANY(fn_my_designated_hr_org_ids())      -- everyone else: own institution,
--                                                                                  -- CAS sibling, explicit uia grant
--                               fn_my_hr_organization_ids() alone is the WIDE set
--                               (role_has_institution_access, TRUE for anyone holding
--                               a stray institution_scope='all' role) and is exactly
--                               the hole 140000 closed; the LEAVE rule never uses it
--                               on its own. (2026-09-03: the 'offer' branch does use
--                               it on its own — it is that rule's HR-level clause,
--                               `permission AND wide`, without the designated-org
--                               OR-branch, which would only widen. The exposure is
--                               stated plainly in the offer header below rather than
--                               left for a reader to infer from this line.)
--                   fn_leave_step_admits has a THIRD clause on the role branch —
--                   is_super_admin() — which is deliberately NOT mirrored. A super
--                   admin holding role 'hod' MAY act on every hod-routed step in the
--                   group, but that is the queue's "may act", not "waiting on me";
--                   listing 14 institutions' HOD steps on the Director's desk would be
--                   noise the module page itself does not present as his.
--   meeting_trigger /meetings/triggers: page gate is_super_admin() OR is_admin();
--                   rows with director_decision IS NULL and status in the console's
--                   DECIDABLE set ('notified','explained','meeting_pending') — a
--                   'booked' row has no Skip/Meet button, so nothing waits there —
--                   that are decidable NOW: explanation_deadline has passed, OR the
--                   row is already 'explained' (the console shows Skip/Meet the
--                   moment an explanation lands, deadline or not), OR the deadline
--                   was never stamped (NULL — the console still lists it, so the
--                   Director still decides it). waiting_since = the deadline, or
--                   created_at when there is none. Same rows for EVERY admin /
--                   super admin: a broadcast, and the detail text says so.
--   grievance       grievance_tickets with nobody assigned and still live —
--                   assigned_to IS NULL AND resolved_at IS NULL AND withdrawn_at IS
--                   NULL — the exact predicate of the Director's existing surface,
--                   lib/services/orchestration/director-signals.ts
--                   (unassignedGrievances). No status filter: that file has none, and
--                   a ticket's liveness is carried by resolved_at / withdrawn_at, not
--                   by its status label. Super admin only (the Director fallback —
--                   /learners-council/issues is where assignment happens). Same rows
--                   for every super admin: a broadcast.
--   offer           hr_recruitment_candidates.status = 'package_fixed' — salary
--                   agreed, nobody has started onboarding. NOT a chain row: see
--                   the change note at the top of this file.
--
--                   WHICH GATE THIS MIRRORS, AND WHY.
--                   The transition out of this status is package_fixed →
--                   offer_issued. Read end to end before choosing:
--                     app/api/hr/recruitment/candidates/[id]/status/route.ts
--                       — PATCH. Enforces authentication ONLY: supabase.auth.getUser(),
--                         401 if absent, then straight into the service. There is no
--                         user_has_permission call, no role check, no institution
--                         check anywhere in the file. Whatever narrowing exists is
--                         table RLS on hr_recruitment_candidates, not route code.
--                     lib/services/hr/recruitment-service.ts updateStatus (~line 673)
--                       — enforces only the forward-transition map
--                         { approved: [package_fixed, offer_issued],
--                           package_fixed: [offer_issued],
--                           offer_issued: [joined, no_show, offer_rescinded] }.
--                         A state-machine gate, not an authorization gate.
--                   So the transition itself names no permission, and mirroring it
--                   literally would put these seven rows on the desk of EVERY
--                   authenticated person in the group — 20,000-odd learners included.
--                   That is plainly not the Director's decision ("on HR's desk").
--                   The gate mirrored instead is the recruitment module's own
--                   management permission, the key the module already uses to say
--                   "you administer hiring here" (app/api/hr/recruitment/approval-flows/*
--                   route.ts, and the three /hr/admin/recruitment-approval-flows pages,
--                   all gate on exactly this key):
--                       user_has_permission('hr.recruitment.edit')
--                       AND user_has_permission('hr.recruitment.view')
--                       AND hr_organization_id = ANY (fn_my_hr_organization_ids())
--                   Ten active roles hold .edit in production (read 2026-09-03 from
--                   custom_roles.permissions): recuritment [sic — the live role_key],
--                   hr_manager, school_principal, hr_head, managing_director,
--                   vice_principal, ceo, coo, hr_admin, principal. Nineteen users
--                   hold one of them through user_roles.
--
--                   WHY .view IS ALSO REQUIRED, AND WHAT IT COSTS TODAY: NOTHING.
--                   A desk row is a link into a page, and every page in this module
--                   gates on .view. A person admitted here without .view would be
--                   sent to a screen they cannot open. Checked against the live
--                   catalog 2026-09-03: 13 active roles hold .view, 10 hold .edit,
--                   and the .edit set is a STRICT SUBSET of the .view set — zero
--                   active roles carry .edit without .view (and zero inactive ones
--                   do either). So the extra conjunct removes NO row from anybody's
--                   desk today. It is defence in depth against a future role that
--                   is granted .edit alone, not a fix for a live leak.
--
--                   SCOPED ON hr_organization_id, NEVER institution_id. Two of the
--                   seven live rows (Preethi P, 142d; Sethupriya, 153d) have
--                   institution_id IS NULL and approval_chain NULL. The reason to
--                   avoid institution scoping is NOT that it would drop them — it
--                   would do the opposite, and that is worse:
--                   role_has_institution_access() returns TRUE unconditionally for a
--                   NULL argument (20260521_role_has_institution_access_cas_aware.sql,
--                   first branch: "NULL institution_id: always accessible"), so
--                   scoping on institution_id would show those two rows to EVERY
--                   .edit holder in EVERY college — a widening, not a drop. Scoping
--                   on hr_organization_id (NOT NULL on this table, and feb0b6ae…
--                   JKKN Main Office on both rows) keeps them attached to the office
--                   that owns them. Both routes keep the two rows visible somewhere;
--                   only the org route keeps them visible to the right people.
--
--                   WHAT THE WIDE ORG SET COSTS, SAID OUT LOUD. v_org_ids is
--                   fn_my_hr_organization_ids() — the WIDE set, which resolves
--                   through role_has_institution_access() and is therefore TRUE for
--                   every organisation as soon as the caller holds ANY role with
--                   institution_scope='all'. This branch is the leave rule's
--                   HR-level clause (`permission AND wide`) without the
--                   designated-org OR-branch; adding that branch would only widen,
--                   so it is omitted. The residual exposure: a per-college holder of
--                   .edit (principal, vice_principal, school_principal) who ALSO
--                   carries a stray institution_scope='all' role reads every
--                   college's package_fixed candidate names through this RPC, which
--                   is SECURITY DEFINER and so does not consult the table's RLS.
--                   That is the same exposure every other branch of this function
--                   already carries, it matches the Director's stated intent for
--                   this queue ("HR's desk"), and narrowing it is a decision about
--                   who owns hiring — not one this migration may take on its own.
--
--                   SUPER ADMINS SEE THESE TOO — stated plainly rather than
--                   discovered later. user_has_permission() carries a super-admin
--                   bypass, and fn_my_hr_organization_ids() resolves through
--                   role_has_institution_access(), which is permissive for an
--                   institution_scope='all' role. So a super admin, and anyone
--                   holding managing_director / hr_head / hr_admin / ceo / coo,
--                   reaches all seven. That is the same bypass every other branch
--                   here inherits, and it is the reason 'offer' is a SEPARATE
--                   source value: the Director's recruitment count is computed by
--                   the untouched recruitment branch and is unaffected — verified
--                   at 8 before and after (see the PR body).
--
--                   waiting_since = submitted_at, for the same reason the
--                   recruitment branch uses it: a BEFORE UPDATE set_updated_at
--                   trigger resets updated_at, so updated_at would report a
--                   153-day-old package as "waiting 0d" after any edit.
--                   amount NULL — the agreed figure lives on a package row, not on
--                   the candidate; this branch does not join for it.
--
--                   href POINTS WHERE THE ACTION IS — the JOB WORKSPACE, not the
--                   candidate page. This is the only per-row href in the function:
--                       CASE WHEN role_specific_details->>'job_id' is uuid-shaped
--                            THEN '/hr/recruitment/approvals/' || that job_id
--                            ELSE '/hr/recruitment/candidates/' || id END
--                   Read before choosing, and the two pages do NOT agree:
--                     app/(routes)/hr/recruitment/candidates/[id]/page.tsx ~359-360
--                       canWithdraw  = status IN ('submitted','pending_approval')
--                       canMarkJoined= status IN ('offer_issued','approved')
--                       'package_fixed' is in NEITHER, and the action block renders
--                       only `if (canWithdraw || canMarkJoined)` — so the candidate
--                       page shows a package_fixed candidate NO control at all. It
--                       is a record, and for these seven a dead end.
--                     app/(routes)/hr/recruitment/approvals/[jobId]/_components/
--                     workspace-candidates-tab.tsx ~652
--                       isPostApproval = status IN ('approved','package_fixed',
--                       'offer_issued') AND no role_specific_details.staff_record_id
--                       — and it gates "Start Onboarding" and "Onboard to Staff".
--                       So the job workspace DOES act on exactly this status.
--                       BOTH halves of that gate are mirrored in the WHERE below.
--                       The staff_record_id half cannot fire today:
--                       app/api/hr/recruitment/candidates/[id]/onboard-to-staff/
--                       route.ts ~191 writes { status: 'joined', …
--                       staff_record_id } in ONE update, so 'package_fixed' with a
--                       staff_record_id is unreachable, and 0 of 34 candidates
--                       carry the key at all (checked live 2026-09-03). It is
--                       encoded anyway so this branch is the WHOLE gate rather than
--                       half of it — half a mirror is how a queue acquires a row
--                       nobody can clear.
--
--                   THE SOFT LINK, AND WHY THE CASE IS GUARDED. A candidate is tied
--                   to its job only by role_specific_details->>'job_id' — a JSONB
--                   value with no foreign key (see the comment on useCandidatesForJob
--                   in hooks/hr/use-recruitment.ts). 26 of 34 candidates carry it and
--                   all 26 values are uuid-shaped (checked live 2026-09-03); of the
--                   seven here, FIVE carry one that resolves to an open job (SIVA S,
--                   KAMALESH KUMAR K, SARANYA R, SNEKA S, Anand V) and TWO —
--                   Preethi P and Sethupriya, the two oldest — have an entirely
--                   EMPTY role_specific_details. Because nothing in the database
--                   enforces the shape, the CASE requires the uuid pattern before
--                   building a path: a junk value can never produce a broken URL, it
--                   falls back. ->> on a missing key yields NULL and NULL ~ pattern
--                   is NULL, not true, so the empty rows take the ELSE branch. Both
--                   branches start with '/'.
--
--                   ⚠️ KNOWN PRODUCT GAP, NOT A BUG IN THIS MIGRATION. The two
--                   candidates with no job_id land on the candidate page, which — as
--                   above — carries no control for their status. Their row is still
--                   worth showing: it names two people owed an act for 142 and 153
--                   days that nothing else in the product surfaces. Giving them a
--                   working destination means either back-filling their job_id or
--                   adding a package_fixed control to the candidate page; both are
--                   changes to app/(routes)/hr/**, which this migration does not
--                   touch and for which there is no Director decision.
--
-- INDEX GUARDS. `jsonb -> int` with a NEGATIVE index counts from the END of the
-- array in PostgreSQL, so a corrupt current_step = -1 would silently read the
-- LAST step and could name the wrong approver. Both chain reads require the
-- index to be >= 0.
--
-- NEVER RAISES on a NULL / non-array approval_chain (jsonb_typeof guard) and
-- returns ZERO ROWS (not an error) for a missing or unknown auth.uid().
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_my_desk_waiting()
RETURNS TABLE (
  source        text,
  item_id       uuid,
  title         text,
  detail        text,
  amount        numeric,
  waiting_since timestamptz,
  age_days      integer,
  href          text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid                uuid := auth.uid();
  v_is_super           boolean;
  v_is_admin           boolean;
  v_has_leave_perm     boolean;
  v_has_recruit_edit   boolean;
  v_has_recruit_view   boolean;
  v_org_ids            uuid[];
  v_designated_org_ids uuid[];
  v_staff_ids          uuid[];
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
      -- One pass over the step's approver entries: am I named, and which of
      -- the step's roles do I actively hold (fn_leave_step_admits: exact
      -- role_key, cr.is_active).
      SELECT
        COALESCE(bool_or(e.approver_user_id = v_uid), false)           AS pinned_to_me,
        string_agg(DISTINCT e.approver_role, '/')
          FILTER (WHERE e.approver_role IS NOT NULL
                    AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active))
                                                                        AS my_step_roles
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
      c.submitted_at                                       AS waiting_since,
      -- Point at the page that CAN act. The job workspace gates "Start
      -- Onboarding" on exactly this status; the candidate page renders no
      -- control for it. The link to the job is a soft JSONB value with no
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
      AND c.status = 'package_fixed'
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

  everything AS (
    SELECT * FROM recruitment
    UNION ALL SELECT * FROM refund
    UNION ALL SELECT * FROM leave
    UNION ALL SELECT * FROM meeting_trigger
    UNION ALL SELECT * FROM grievance
    UNION ALL SELECT * FROM offer
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
    x.href
  FROM everything x
  ORDER BY x.waiting_since ASC NULLS LAST, x.source, x.item_id
  LIMIT 500;
END;
$$;

COMMENT ON FUNCTION public.fn_my_desk_waiting() IS
  'Everything waiting on auth.uid() right now, computed live from the module queues (never from notifications). Returns TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamptz, age_days integer, href text), oldest first, capped at 500. source ∈ recruitment | refund | leave | meeting_trigger | grievance | offer; each branch mirrors its module page''s own queue rule (see the migration header of 20261018030000, which supersedes 20261018020000; leave follows fn_leave_step_admits as of 20260831140000, minus its super-admin may-act clause). offer = hr_recruitment_candidates at status package_fixed (salary agreed, nobody has started onboarding; the UI heading is "Hires to bring on board" — the source string stays ''offer'' because it is the applied row contract, and status offer_issued has never been used in production) — no approver is derivable at that status, so the gate mirrored is the module''s own management key hr.recruitment.edit AND hr.recruitment.view, plus BOTH halves of workspace-candidates-tab''s isPostApproval (status AND no role_specific_details.staff_record_id), scoped by fn_my_hr_organization_ids() and NOT by institution_id (role_has_institution_access(NULL) is unconditionally true, so institution scoping would WIDEN the two NULL-institution rows to every college rather than drop them); href is the only per-row one in this function and points at /hr/recruitment/approvals/<job_id> when role_specific_details->>''job_id'' is uuid-shaped (the job workspace gates "Start Onboarding" on this status), else /hr/recruitment/candidates/<id>, which currently carries no control for it — a known product gap. user_has_permission() carries a super-admin bypass, so super admins see these as they do every other branch. Zero rows for a missing identity; never raises on a malformed approval_chain.';

-- Lock from anon. Supabase's default privileges grant EXECUTE to anon
-- directly, separate from PUBLIC, so both must be revoked (CLAUDE.md rule).
REVOKE EXECUTE ON FUNCTION public.fn_my_desk_waiting() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_desk_waiting() TO authenticated;
