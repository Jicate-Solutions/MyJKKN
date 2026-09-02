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
-- (fn_leave_step_admits calls fn_my_hr_organization_ids on EVERY call, and the
-- leave queue is ~960 rows), the same predicate is expressed once, set-based,
-- against the helper's own inputs computed a single time.
--
-- ROW CONTRACT (the /my-desk UI lane builds against exactly this):
--   source         text         'recruitment' | 'refund' | 'leave' | 'meeting_trigger' | 'grievance'
--   item_id        uuid         the source row id
--   title          text         one human line (candidate — role; request_number — learner; …)
--   detail         text         WHY it is on this person (named / role / gate / fallback)
--   amount         numeric      money where the queue carries it (refund total); else NULL
--   waiting_since  timestamptz  when it started waiting at THIS step
--   age_days       integer      floor((now() - waiting_since) / 1 day)
--   href           text         the existing module page where the action already lives
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
--   refund          billing_refund_requests.status = 'pending_review' and
--                   fn_refund_assignee_match(stage.assignee_roles, stage.assignee_users, me)
--                   on flow_snapshot->'stages'->current_stage_index — the same
--                   predicate as hla RLS and the stage-action panel on /billing/refunds/[id].
--   leave           hr_leave_my_approval_queue (20260831120000) designated-approver
--                   branch: status IN ('pending','escalated'), the applicant's
--                   hr_organization_id within fn_my_hr_organization_ids() (which is
--                   role_has_institution_access per organisation — a principal never
--                   sees another college), not my own application, and
--                   chain[current_step] names me or a role I actively hold
--                   (fn_leave_step_approvers, exact-case role_key, cr.is_active).
--                   The queue's permissive branches (super admin sees all; an
--                   unconstrained step is visible to every hr.leave.approve holder)
--                   are "may act", not "waiting on me", and are deliberately excluded.
--   meeting_trigger /meetings/triggers: page gate is_super_admin() OR is_admin();
--                   rows with director_decision IS NULL, explanation_deadline < now(),
--                   and status in the console's DECIDABLE set
--                   ('notified','explained','meeting_pending') — a 'booked' row has
--                   no Skip/Meet button, so nothing waits on the Director there.
--   grievance       grievance_tickets with assigned_to IS NULL and status IN
--                   ('open','in_progress'); super admin only (the Director fallback —
--                   /learners-council/issues is where assignment happens).
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
  v_uid       uuid := auth.uid();
  v_is_super  boolean;
  v_is_admin  boolean;
  v_org_ids   uuid[];
  v_staff_ids uuid[];
BEGIN
  -- No identity, no answer. Every branch below is keyed on v_uid, so a NULL
  -- would match nothing anyway — but returning here keeps the helper calls
  -- (fn_my_hr_organization_ids and friends) from running for nobody.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_super  := COALESCE(public.is_super_admin(), false);
  v_is_admin  := COALESCE(public.is_admin(), false);
  -- Computed ONCE. Both are SECURITY DEFINER helpers keyed on auth.uid(); the
  -- leave queue calls them per row, which is the cost this function avoids.
  v_org_ids   := COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]);
  v_staff_ids := COALESCE(public.fn_my_staff_ids(), ARRAY[]::uuid[]);

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
      c.updated_at                                         AS waiting_since,
      '/hr/recruitment/approvals'::text                    AS href
    FROM public.hr_recruitment_candidates c
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(c.approval_chain) = 'array'
         AND jsonb_array_length(c.approval_chain) > 0
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
        THEN r.flow_snapshot -> 'stages' -> r.current_stage_index
      END AS stage
    ) s
    WHERE r.status = 'pending_review'
      AND s.stage IS NOT NULL
      AND public.fn_refund_assignee_match(s.stage -> 'assignee_roles', s.stage -> 'assignee_users', v_uid)
  ),

  -- 3. LEAVE — the designated-approver branch of hr_leave_my_approval_queue,
  --    set-based: same inputs (fn_leave_step_approvers, fn_my_hr_organization_ids,
  --    fn_my_staff_ids, active role_key match) evaluated once instead of per row.
  leave AS (
    SELECT
      'leave'::text                                        AS source,
      a.id                                                 AS item_id,
      COALESCE(NULLIF(trim(COALESCE(st.first_name, '') || ' ' || COALESCE(st.last_name, '')), ''),
               'employee')
        || ' — ' || to_char(a.start_date::date, 'DD Mon')
        || ' to ' || to_char(a.end_date::date, 'DD Mon YYYY')    AS title,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.fn_leave_step_approvers(s.step) e
          WHERE e.approver_user_id = v_uid
        ) THEN 'pinned to you by name'
        ELSE 'you hold role ' || COALESCE((
          SELECT string_agg(DISTINCT e.approver_role, '/')
          FROM public.fn_leave_step_approvers(s.step) e
          WHERE e.approver_role IS NOT NULL
            AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active)
        ), '?')
      END                                                  AS detail,
      NULL::numeric                                        AS amount,
      a.created_at                                         AS waiting_since,
      '/hr/leave/approvals'::text                          AS href
    FROM public.hr_leave_applications a
    LEFT JOIN public.staff st ON st.id = a.employee_id
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(a.approval_chain) = 'array'
        THEN a.approval_chain -> a.current_step
      END AS step
    ) s
    WHERE a.status IN ('pending', 'escalated')
      AND s.step IS NOT NULL
      AND a.hr_organization_id = ANY (v_org_ids)
      AND NOT (a.employee_id = ANY (v_staff_ids))
      AND EXISTS (
        SELECT 1
        FROM public.fn_leave_step_approvers(s.step) e
        WHERE e.approver_user_id = v_uid
           OR (
             e.approver_role IS NOT NULL
             AND e.approver_role IN (SELECT role_key FROM my_roles WHERE is_active)
           )
      )
  ),

  -- 4. MEETING TRIGGER — /meetings/triggers gate + the console's DECIDABLE set.
  meeting_trigger AS (
    SELECT
      'meeting_trigger'::text                              AS source,
      e.id                                                 AS item_id,
      e.metric_key || COALESCE(' — ' || e.subject_label, '') AS title,
      'admin/super_admin gate'::text                       AS detail,
      NULL::numeric                                        AS amount,
      e.explanation_deadline                               AS waiting_since,
      '/meetings/triggers'::text                           AS href
    FROM public.meeting_trigger_events e
    WHERE (v_is_super OR v_is_admin)
      AND e.director_decision IS NULL
      AND e.explanation_deadline < now()
      AND e.status IN ('notified', 'explained', 'meeting_pending')
  ),

  -- 5. GRIEVANCE — unassigned and live; super admin only (Director fallback).
  grievance AS (
    SELECT
      'grievance'::text                                    AS source,
      g.id                                                 AS item_id,
      g.ticket_number || ' — ' || g.subject                AS title,
      'no assignee — Director fallback'::text              AS detail,
      NULL::numeric                                        AS amount,
      g.created_at                                         AS waiting_since,
      '/learners-council/issues'::text                     AS href
    FROM public.grievance_tickets g
    WHERE v_is_super
      AND g.assigned_to IS NULL
      AND g.status IN ('open', 'in_progress')
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
    floor(extract(epoch FROM (now() - COALESCE(x.waiting_since, now()))) / 86400)::integer AS age_days,
    x.href
  FROM everything x
  ORDER BY x.waiting_since ASC NULLS LAST, x.source, x.item_id
  LIMIT 500;
END;
$$;

COMMENT ON FUNCTION public.fn_my_desk_waiting() IS
  'Everything waiting on auth.uid() right now, computed live from the module queues (never from notifications). Returns TABLE(source text, item_id uuid, title text, detail text, amount numeric, waiting_since timestamptz, age_days integer, href text), oldest first, capped at 500. source ∈ recruitment | refund | leave | meeting_trigger | grievance; each branch mirrors its module page''s own queue rule (see the migration header of 20261018020000). Zero rows for a missing identity; never raises on a malformed approval_chain.';

-- Lock from anon. Supabase's default privileges grant EXECUTE to anon
-- directly, separate from PUBLIC, so both must be revoked (CLAUDE.md rule).
REVOKE EXECUTE ON FUNCTION public.fn_my_desk_waiting() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_my_desk_waiting() TO authenticated;
