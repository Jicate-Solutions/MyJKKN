-- Re-sync pending leave approval chains when a flow changes (2026-09-08)
--
-- An application's approval_chain is a SNAPSHOT frozen at apply time, so editing a
-- flow in HR -> Admin -> Leave Types -> "Who approves this" changes nothing for
-- requests already in flight. Today that had to be undone with a one-off migration
-- (20260908_leave_refreeze_pending_chains_onto_current_flows.sql, 590 rows) after
-- MR. VIJAYSABARI S matched the new Allied Health Casual Leave flow but the pending
-- requests still pinned the previous approver. These three functions make it a
-- first-class action the flow editor can offer instead.
--
--   fn_hr_leave_build_chain          the SQL mirror of buildChain()
--   fn_hr_leave_pending_chain_drift  read-only: how many requests would move
--   fn_hr_leave_resync_pending_chains  performs the move
--
-- WHICH REQUESTS A FLOW GOVERNS. The same most-specific-wins rule
-- LeaveService.buildApprovalChain() applies, so the two can never disagree:
--   per-type flow (conditions.leave_type_id set) -> that type in that organisation
--   catch-all     (no leave_type_id)             -> every type in that organisation
--                                                   with no per-type flow of its own
--
-- WHAT IS NEVER TOUCHED
--   * current_step > 0, or any step already carrying a decision. Rebuilding would
--     erase a recorded approval, so those are counted and left alone.
--   * requests whose dates overlap a LOCKED hr_attendance_period.
--     trg_hla_block_locked_period fires on EVERY update of hr_leave_applications,
--     not only on status, and one such row raises P0001 and aborts the statement.
--   * requests whose flow resolves to nobody (build returns NULL) — writing an empty
--     chain would leave a request that no one can ever approve.
--
-- trg_hla_guard_chain_decisions is satisfied because a rebuilt chain carries no
-- decisions. Every other trigger on that table is scoped to status or to the date
-- columns, none of which this writes.
--
-- No BEGIN/COMMIT: scripts/apply-migration-file.mjs refuses transaction control.


-- ---------------------------------------------------------------------------
-- fn_hr_leave_chain_step — the SQL mirror of toChainStep().
--
-- The singular approver_role / approver_user_id fields are still written from the
-- FIRST approver so every legacy reader (the RLS helper's fallback, the inbox
-- containment filter, any report) keeps working on a one-approver step without
-- knowing `approvers` exists. 'hr_approver' is the placeholder for a step naming no
-- role; it matches no custom_roles row, which the gate reads as "any permitted
-- approver". step_type is OMITTED when the source step had none, exactly as
-- toChainStep()'s spread does.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_chain_step(
  p_order      int,
  p_approvers  jsonb,
  p_quorum     text,
  p_escalate   int,
  p_step_type  text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_build_object(
           'step_order',           p_order,
           'approver_role',        COALESCE(p_approvers -> 0 ->> 'approver_role', 'hr_approver'),
           'approver_user_id',     p_approvers -> 0 ->> 'approver_user_id',
           'approvers',            COALESCE(p_approvers, '[]'::jsonb),
           'quorum',               COALESCE(p_quorum, 'any'),
           'decisions',            '[]'::jsonb,
           'status',               'pending',
           'decided_at',           NULL,
           'decided_by',           NULL,
           'comment',              NULL,
           'escalate_after_hours', p_escalate)
         || CASE WHEN p_step_type IS NULL THEN '{}'::jsonb
                 ELSE jsonb_build_object('step_type', p_step_type) END;
$function$;


-- ---------------------------------------------------------------------------
-- fn_hr_leave_build_chain
--
-- THE SQL MIRROR OF buildChain() IN lib/hr/leave/approval-chain.ts. Two builders of
-- one shape that disagree is how the editor's preview ends up showing a chain that
-- is not the one written — the same hazard already documented for
-- fn_leave_step_approvers() vs readApprovers(). WHEN ONE CHANGES, CHANGE THE OTHER.
--
-- Returns NULL when the flow resolves to nobody, which the callers treat as "skip
-- this application" rather than writing an unapprovable empty chain.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_build_chain(
  p_flow_id     uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  f          record;
  v_source   text;
  v_mode     text;
  v_escalate int;
  v_rungs    text[];
  v_drafts   jsonb;
  v_all      jsonb;
  v_fb       jsonb;
BEGIN
  SELECT af.steps, af.escalate_after_hours, af.step_source, af.run_mode,
         af.role_ladder, af.fallback_approver
    INTO f
  FROM public.hr_approval_flows af
  WHERE af.id = p_flow_id AND af.is_active AND af.valid_until IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_source   := COALESCE(f.step_source, 'explicit');
  v_mode     := COALESCE(f.run_mode, 'sequential');
  v_escalate := COALESCE(f.escalate_after_hours, 48);

  IF v_source = 'role_ladder' THEN
    -- The rungs ABOVE this applicant, resolved in Postgres because user_roles and
    -- custom_roles are unreadable by ordinary staff. A ladder draft carries NO
    -- step_type, exactly as buildChain() leaves it undefined; finalStepIndex()
    -- then falls back to the last step.
    v_rungs := public.hr_resolve_leave_ladder(
                 p_employee_id, COALESCE(f.role_ladder, '[]'::jsonb));

    SELECT jsonb_agg(
             jsonb_build_object(
               'order',     r.ord,
               'approvers', jsonb_build_array(jsonb_build_object(
                              'approver_role',    NULLIF(r.rung, ''),
                              'approver_user_id', NULL,
                              'approver_name',    NULL)),
               'quorum',    'any',
               'escalate',  v_escalate)
             ORDER BY r.ord)
      INTO v_drafts
    FROM unnest(COALESCE(v_rungs, ARRAY[]::text[])) WITH ORDINALITY AS r(rung, ord);
  ELSE
    -- Explicit steps pass through UNFILTERED, including a step naming nobody: that
    -- means "any permitted approver" to the database gate, and dropping it here
    -- would silently shorten a live flow.
    SELECT jsonb_agg(
             jsonb_build_object(
               'order',     COALESCE((s.st ->> 'chain_order')::int, s.ord::int),
               'approvers', CASE
                 WHEN jsonb_typeof(s.st -> 'approvers') = 'array'
                  AND jsonb_array_length(s.st -> 'approvers') > 0
                 THEN (
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'approver_role',    NULLIF(x.a ->> 'approver_role', ''),
                              'approver_user_id', NULLIF(x.a ->> 'approver_user_id', ''),
                              'approver_name',    x.a ->> 'approver_name')
                            ORDER BY x.ord)
                   FROM jsonb_array_elements(s.st -> 'approvers') WITH ORDINALITY AS x(a, ord)
                 )
                 ELSE jsonb_build_array(jsonb_build_object(
                        'approver_role',    NULLIF(s.st ->> 'approver_role', ''),
                        'approver_user_id', NULLIF(s.st ->> 'approver_user_id', ''),
                        'approver_name',    s.st ->> 'approver_name'))
               END,
               'quorum',    COALESCE(s.st ->> 'quorum', 'any'),
               'escalate',  COALESCE((s.st ->> 'escalate_after_hours')::int, v_escalate),
               'step_type', s.st ->> 'step_type')
             ORDER BY COALESCE((s.st ->> 'chain_order')::int, s.ord::int))
      INTO v_drafts
    FROM jsonb_array_elements(COALESCE(f.steps, '[]'::jsonb)) WITH ORDINALITY AS s(st, ord);
  END IF;

  -- Nobody above the applicant — the person at the top of the ladder applying for
  -- their own leave. Their request is the one that most needs a named approver, so
  -- it goes to the configured fallback rather than sailing through.
  IF v_drafts IS NULL OR jsonb_array_length(v_drafts) = 0 THEN
    v_fb := f.fallback_approver;
    IF v_fb IS NOT NULL
       AND (NULLIF(v_fb ->> 'approver_role', '') IS NOT NULL
            OR NULLIF(v_fb ->> 'approver_user_id', '') IS NOT NULL) THEN
      v_drafts := jsonb_build_array(jsonb_build_object(
        'order',     1,
        'approvers', jsonb_build_array(jsonb_build_object(
                       'approver_role',    NULLIF(v_fb ->> 'approver_role', ''),
                       'approver_user_id', NULLIF(v_fb ->> 'approver_user_id', ''),
                       'approver_name',    v_fb ->> 'approver_name')),
        'quorum',    'any',
        'escalate',  v_escalate));
    ELSE
      RETURN NULL;
    END IF;
  END IF;

  IF v_mode = 'parallel' THEN
    -- ONE step holding everyone, so current_step keeps its meaning and nothing
    -- downstream needs a second completion rule. Same person or role twice
    -- collapses to one slot.
    WITH flat AS (
      SELECT e.entry, (d.ord * 1000 + e.ord) AS seq
      FROM jsonb_array_elements(v_drafts) WITH ORDINALITY AS d(draft, ord)
      CROSS JOIN LATERAL jsonb_array_elements(d.draft -> 'approvers')
        WITH ORDINALITY AS e(entry, ord)
    ), dedup AS (
      SELECT DISTINCT ON (COALESCE(flat.entry ->> 'approver_user_id', ''),
                          COALESCE(flat.entry ->> 'approver_role', ''))
             flat.entry, flat.seq
      FROM flat
      ORDER BY COALESCE(flat.entry ->> 'approver_user_id', ''),
               COALESCE(flat.entry ->> 'approver_role', ''),
               flat.seq
    )
    SELECT jsonb_agg(dedup.entry ORDER BY dedup.seq) INTO v_all FROM dedup;

    RETURN jsonb_build_array(
      public.fn_hr_leave_chain_step(
        1, v_all, COALESCE(v_drafts -> 0 ->> 'quorum', 'any'), v_escalate, 'final'));
  END IF;

  RETURN (
    SELECT jsonb_agg(
             public.fn_hr_leave_chain_step(
               (d.draft ->> 'order')::int,
               d.draft -> 'approvers',
               d.draft ->> 'quorum',
               (d.draft ->> 'escalate')::int,
               d.draft ->> 'step_type')
             ORDER BY (d.draft ->> 'order')::int)
    FROM jsonb_array_elements(v_drafts) AS d(draft)
  );
END $function$;


-- ---------------------------------------------------------------------------
-- fn_hr_leave_pending_chain_drift — how many requests this flow would move.
-- Read-only, so the editor can show the count and ask before doing anything.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_pending_chain_drift(p_flow_id uuid)
RETURNS TABLE(eligible int, skipped_decided int, skipped_locked int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org  uuid;
  v_type uuid;
BEGIN
  SELECT af.hr_organization_id, (af.conditions ->> 'leave_type_id')::uuid
    INTO v_org, v_type
  FROM public.hr_approval_flows af
  WHERE af.id = p_flow_id
    AND af.flow_for = 'leave_approval'
    AND af.is_active
    AND af.valid_until IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active leave approval flow with id %', p_flow_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT public.user_has_permission('hr.leave.types.manage') THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (v_org = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains for this institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH classified AS (
    SELECT
      public.fn_hr_leave_build_chain(p_flow_id, a.employee_id) AS new_chain,
      a.approval_chain,
      (a.current_step > 0 OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(a.approval_chain, '[]'::jsonb)) s
         WHERE jsonb_array_length(COALESCE(s -> 'decisions', '[]'::jsonb)) > 0)) AS decided,
      EXISTS (
        SELECT 1
        FROM public.staff st
        JOIN public.hr_attendance_periods ap
          ON ap.institution_id = st.institution_id AND ap.status = 'locked'
        WHERE st.id = a.employee_id
          AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
      ) AS locked
    FROM public.hr_leave_applications a
    WHERE a.hr_organization_id = v_org
      AND a.status IN ('pending', 'escalated')
      AND (
        (v_type IS NOT NULL AND a.leave_type_id = v_type)
        OR (v_type IS NULL AND NOT EXISTS (
              SELECT 1 FROM public.hr_approval_flows f2
              WHERE f2.hr_organization_id = v_org
                AND f2.flow_for = 'leave_approval'
                AND f2.is_active
                AND f2.valid_until IS NULL
                AND (f2.conditions ->> 'leave_type_id')::uuid = a.leave_type_id))
      )
  ), drifted AS (
    SELECT * FROM classified
    WHERE new_chain IS NOT NULL AND approval_chain IS DISTINCT FROM new_chain
  )
  SELECT
    count(*) FILTER (WHERE NOT decided AND NOT locked)::int,
    count(*) FILTER (WHERE decided)::int,
    count(*) FILTER (WHERE NOT decided AND locked)::int
  FROM drifted;
END $function$;


-- ---------------------------------------------------------------------------
-- fn_hr_leave_resync_pending_chains — rebuild the chains this flow governs.
-- Same selection as the drift preview above; keep the two in step.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_leave_resync_pending_chains(p_flow_id uuid)
RETURNS TABLE(resynced int, skipped_decided int, skipped_locked int)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_org  uuid;
  v_type uuid;
BEGIN
  SELECT af.hr_organization_id, (af.conditions ->> 'leave_type_id')::uuid
    INTO v_org, v_type
  FROM public.hr_approval_flows af
  WHERE af.id = p_flow_id
    AND af.flow_for = 'leave_approval'
    AND af.is_active
    AND af.valid_until IS NULL;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'No active leave approval flow with id %', p_flow_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_super_admin() THEN
    IF NOT public.user_has_permission('hr.leave.types.manage') THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (v_org = ANY (COALESCE(public.fn_my_hr_organization_ids(), ARRAY[]::uuid[]))) THEN
      RAISE EXCEPTION 'Not authorized to re-sync leave approval chains for this institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH classified AS (
    SELECT
      a.id,
      public.fn_hr_leave_build_chain(p_flow_id, a.employee_id) AS new_chain,
      a.approval_chain,
      (a.current_step > 0 OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(a.approval_chain, '[]'::jsonb)) s
         WHERE jsonb_array_length(COALESCE(s -> 'decisions', '[]'::jsonb)) > 0)) AS decided,
      EXISTS (
        SELECT 1
        FROM public.staff st
        JOIN public.hr_attendance_periods ap
          ON ap.institution_id = st.institution_id AND ap.status = 'locked'
        WHERE st.id = a.employee_id
          AND make_date(ap.period_year, ap.period_month, 1) <= a.end_date
          AND (make_date(ap.period_year, ap.period_month, 1) + interval '1 month')::date > a.start_date
      ) AS locked
    FROM public.hr_leave_applications a
    WHERE a.hr_organization_id = v_org
      AND a.status IN ('pending', 'escalated')
      AND (
        (v_type IS NOT NULL AND a.leave_type_id = v_type)
        OR (v_type IS NULL AND NOT EXISTS (
              SELECT 1 FROM public.hr_approval_flows f2
              WHERE f2.hr_organization_id = v_org
                AND f2.flow_for = 'leave_approval'
                AND f2.is_active
                AND f2.valid_until IS NULL
                AND (f2.conditions ->> 'leave_type_id')::uuid = a.leave_type_id))
      )
  ), drifted AS (
    SELECT * FROM classified
    WHERE new_chain IS NOT NULL AND approval_chain IS DISTINCT FROM new_chain
  ), upd AS (
    UPDATE public.hr_leave_applications a
    SET approval_chain = d.new_chain,
        current_step   = 0,
        updated_at     = now()
    FROM drifted d
    WHERE a.id = d.id AND NOT d.decided AND NOT d.locked
    RETURNING a.id
  )
  SELECT
    (SELECT count(*) FROM upd)::int,
    (SELECT count(*) FROM drifted WHERE decided)::int,
    (SELECT count(*) FROM drifted WHERE NOT decided AND locked)::int;
END $function$;


-- Re-creating a function silently re-grants EXECUTE to PUBLIC, and PUBLIC includes
-- anon. REVOKE first, then grant only what is needed.
REVOKE ALL ON FUNCTION public.fn_hr_leave_build_chain(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_leave_chain_step(int, jsonb, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_leave_pending_chain_drift(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_leave_resync_pending_chains(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_hr_leave_build_chain(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_chain_step(int, jsonb, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_pending_chain_drift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hr_leave_resync_pending_chains(uuid) TO authenticated;
