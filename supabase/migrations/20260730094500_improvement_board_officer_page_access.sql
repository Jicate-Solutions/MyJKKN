-- 2026-07-30 — The officers who act on a department playbook must be able to reach
-- the page that hosts it, without borrowing a board manager's permission.
--
-- WHAT WENT WRONG
-- Assigning a department role holder is an officer action (CEO / CAO / EAO) held under
-- improvement.area_role.assign, and approving the department policy will be held under
-- improvement.area_policy.approve. Neither key opened the analytics page: every layer
-- gated on improvement.board.manage or improvement.ideas.view. The CAO and both
-- Executive Administrative Officers could not open the page for two days after being
-- granted the assign permission, so in practice the feature was CEO-only.
--
-- That was patched on 2026-07-29 by granting improvement.board.manage to cao and
-- executive_admin_officer. It works, but it is a workaround standing on a false
-- statement: a CAO is not a board manager. Anyone who later revokes that grant for
-- the right reason silently re-creates the lockout.
--
-- WHY THE CLIENT GATE ALONE IS NOT ENOUGH
-- Proven on production as the real CAO user, inside a rolled-back transaction, with
-- board.manage set false and area_role.assign retained:
--
--   board.manage now                          ->  false
--   area_role.assign still                    ->  true
--   is_admin()                                ->  false
--   LAYER 2 departments in picker (want >0)   ->  0
--   LAYER 3 fn_mba_analyst_views              ->  RAISED: not authorized: ...
--
-- So widening only the React gate lands the officer on the manager board with an
-- empty department picker and a hard error -- the same empty page the finding
-- describes, moved one component along. Both server layers are widened here.
--
-- ON THE MONEY VIEWS
-- v_manage in fn_mba_analyst_views also decides whether the caller receives the
-- is_sensitive (financial) views. Admitting the officer keys there is the status quo
-- rather than a widening: all five officers already hold improvement.board.manage and
-- already receive those views today. What changes is that their access survives that
-- grant being revoked. Flagged explicitly because it is a money gate.
--
-- improvement.area_policy.approve is registered and granted by PR #2598. Naming it
-- here is deliberate and harmless: these are OR-chains, so until #2598 lands the
-- clause is false for everyone and nobody's access changes.

-- ---------------------------------------------------------------------------
-- Layer 2 — the department picker. Same shape as before, plus the officer keys.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS improvement_areas_select ON public.improvement_areas;

CREATE POLICY improvement_areas_select ON public.improvement_areas
FOR SELECT USING (
  COALESCE(is_super_admin(), false)
  OR COALESCE(is_admin(), false)
  OR COALESCE(user_has_permission('improvement.board.manage'), false)
  OR COALESCE(user_has_permission('improvement.area_role.assign'), false)
  OR COALESCE(user_has_permission('improvement.area_policy.approve'), false)
  OR (is_active AND COALESCE(user_has_permission('improvement.ideas.view'), false))
);

-- ---------------------------------------------------------------------------
-- Layer 3 — the analytics delivery RPC. Body reproduced verbatim from the live
-- pg_get_functiondef output (md5 c1cd8fc48145fada0ed40f00daff6104) with a single
-- hunk changed, so the restored money gate from PR #2388 cannot be reverted by a
-- stale copy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mba_analyst_views(p_area_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_manage    boolean;
  v_is_assoc  boolean;   -- holds an ACTIVE cohort's learner role (any cohort)
  v_posted    boolean;
  v_can_money boolean;   -- may this caller receive is_sensitive (money) views?
  v_rec       record;
  v_where     text;
  v_rows      jsonb;
  v_views     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- An officer acts on a department playbook from this page: assigning role holders,
  -- approving the department policy. Those are institution-wide actions held under
  -- their own permissions, so page access must not depend on ALSO holding
  -- improvement.board.manage -- granted to the CAO and the Executive Administrative
  -- Officers today only as a workaround, and neither of them is a board manager.
  --
  -- This does admit an officer to the is_sensitive (money) views on the same terms as
  -- a board manager. That is the status quo rather than a widening: all five officers
  -- already hold improvement.board.manage and already receive those views. What
  -- changes is that their access survives that grant being revoked for cause.
  v_manage := is_super_admin() OR is_admin()
              OR user_has_permission('improvement.board.manage')
              OR user_has_permission('improvement.area_role.assign')
              OR user_has_permission('improvement.area_policy.approve');

  -- Gate 1 membership test — CONFIG-DRIVEN (was: cr.role_key = 'mba_associate').
  -- The set of participating cohorts is data in teaching_enterprise_cohorts, so
  -- adding a cohort (CSE Resident, …) no longer edits this function. Only
  -- is_active rows count, which makes the admin screen's activate/deactivate
  -- toggle the kill switch for a cohort's analytics access.
  --
  -- NOTE this reads learner_role_key ONLY. A cohort's faculty_role_key
  -- (e.g. cse_facilitator) deliberately confers NO analytics access through
  -- this gate — see the SECURITY NARROWING note in Part 2.
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND cr.is_active
      AND cr.role_key IN (
        SELECT c.learner_role_key
        FROM teaching_enterprise_cohorts c
        WHERE c.is_active
      )
  ) INTO v_is_assoc;

  -- Gate 1: must hold a participating cohort's learner role, or manage the board.
  IF NOT (v_is_assoc OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: a teaching-enterprise cohort role or improvement.board.manage is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
  ) INTO v_posted;

  -- Gate 2: must be posted to THIS department (managers bypass — they see any).
  IF NOT (v_posted OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: no active posting to this department'
      USING ERRCODE = '42501';
  END IF;

  -- ==== MONEY GATE (restored from PR #2388; see REGRESSION REPAIR header) ====
  -- Per-assignment. A board manager always sees the money views. A posted
  -- cohort learner sees the is_sensitive views ONLY when their active posting to
  -- THIS area has include_financial = true. UNIQUE(associate, area) means at
  -- most one such row. Delete this assignment + the CONTINUE below to ship the
  -- cohort widening on its own.
  v_can_money := v_manage OR EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
      AND p.include_financial
  );
  -- ==== end MONEY GATE ======================================================

  -- Deliver each mapped view with k>=5 small-cell suppression.
  --   The map row IS the allowlist: only view_names present as rows for this
  --   area are ever read, and guard_col comes FROM the row (data-only — adding a
  --   view no longer edits this function).
  FOR v_rec IN
    SELECT view_name, is_sensitive, guard_col
    FROM mba_area_analyst_views
    WHERE area_id = p_area_id
    ORDER BY view_name
  LOOP
    -- ==== MONEY GATE (part 2 of 2) ==========================================
    IF v_rec.is_sensitive AND NOT v_can_money THEN
      CONTINUE;
    END IF;
    -- ==== end MONEY GATE ====================================================

    -- Defense-in-depth: the RPC can only ever read a REAL, EXISTING learning_*
    -- relation. A typo'd, dropped, or non-learning_* map row is skipped — never
    -- errors, never touches an arbitrary relation.
    IF v_rec.view_name !~ '^learning_[a-z0-9_]+$'
       OR to_regclass('public.' || v_rec.view_name) IS NULL THEN
      CONTINUE;
    END IF;

    -- guard_col NULL => no small-cell dimension => rows pass (WHERE TRUE).
    -- else => drop any group whose guard count is below 5. The column named by
    -- guard_col is the suppression dimension chosen per view in
    -- mba_area_analyst_views (the #2449 hardening moved this choice OUT of this
    -- function and INTO the data, so the threshold cannot be bypassed by
    -- adding a view). Preserved here byte-for-byte from the live body.
    IF v_rec.guard_col IS NULL THEN
      v_where := 'TRUE';
    ELSE
      v_where := format('%I >= 5', v_rec.guard_col);
    END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
      v_rec.view_name, v_where
    ) INTO v_rows;

    v_views := v_views || jsonb_build_object(
      'view_name',    v_rec.view_name,
      'is_sensitive', v_rec.is_sensitive,
      'rows',         v_rows
    );
  END LOOP;

  RETURN jsonb_build_object(
    'area_id', p_area_id,
    'views',   v_views
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) TO authenticated;
