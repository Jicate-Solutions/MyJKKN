-- ============================================================================
-- /my-desk — what is waiting on the signed-in person, computed from the queues.
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
--   source         text         'recruitment' | 'refund' | 'leave' | 'meeting_trigger' | 'grievance'
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
--                               the hole 140000 closed; it is never used on its own
--                               here.
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

  everything AS (
    SELECT * FROM recruitment
    UNION ALL SELECT * FROM refund
    UNION ALL SELECT * FROM leave
    UNION ALL SELECT * FROM meeting_trigger
    UNION ALL SELECT * FROM grievance
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
  'Everything waiting on auth.uid() right now, computed live from the module queues (never from notifications). Returns TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamptz, age_days integer, href text), oldest first, capped at 500. source ∈ recruitment | refund | leave | meeting_trigger | grievance; each branch mirrors its module page''s own queue rule (see the migration header of 20261018020000; leave follows fn_leave_step_admits as of 20260831140000, minus its super-admin may-act clause). Zero rows for a missing identity; never raises on a malformed approval_chain.';

-- Lock from anon. Supabase's default privileges grant EXECUTE to anon
-- directly, separate from PUBLIC, so both must be revoked (CLAUDE.md rule).
REVOKE EXECUTE ON FUNCTION public.fn_my_desk_waiting() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_desk_waiting() TO authenticated;
