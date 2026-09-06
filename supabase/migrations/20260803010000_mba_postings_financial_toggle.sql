-- Migration: MBA Associate postings — per-assignment financial (money) toggle
-- Date: 2026-08-03
-- Part 2 of the MBA teaching-enterprise team-rotation + faculty + money spec
-- (specs/mba-team-rotation-and-faculty-2026-07-25.md).
--
-- BACKGROUND
--   20260724170000 shipped `fn_mba_analyst_views` — a posted MBA Associate could
--   read EVERY mapped analyst view for their department, INCLUDING the three
--   is_sensitive money views (learning_collection_summary, learning_channel_roi,
--   learning_event_budget_actual). That migration flagged the follow-up:
--   "a per-assignment financial toggle is an easy follow-up."
--
-- WHAT THIS DOES
--   1. Adds `mba_associate_postings.include_financial boolean NOT NULL DEFAULT
--      false`. Existing (and future) postings default to NO money exposure.
--   2. Rewrites `fn_mba_analyst_views` so a posted MBA Associate (not a manager)
--      receives the is_sensitive money views ONLY when their active posting to
--      the requested department has include_financial = true. Non-sensitive
--      views are always returned to anyone who clears the posting gate. Board
--      managers (improvement.board.manage) keep seeing ALL views incl. money —
--      the RPC's manager-bypass is unchanged. k>=5 small-cell suppression and
--      the two-gate structure are preserved.
--
-- The RPC is re-declared with CREATE OR REPLACE; the anon lock-out REVOKE/GRANT
-- is re-asserted in-migration (the secdef-anon CI gate treats a CREATE OR REPLACE
-- of a locked SECDEF function as new).

BEGIN;

-- ============================================================================
-- 1. Per-assignment money toggle. Default false → no money exposure unless a
--    board manager explicitly turns it on for that (associate, department) pair.
-- ============================================================================
ALTER TABLE public.mba_associate_postings
  ADD COLUMN IF NOT EXISTS include_financial boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mba_associate_postings.include_financial IS
  'Per-assignment money gate. When true, a posted MBA Associate may read this department''s is_sensitive (financial) analyst views via fn_mba_analyst_views. Default false — non-sensitive views only. Board managers bypass this and always see money. The rotation scheduler (Part 3) writes false.';

-- ============================================================================
-- 2. Rewrite the delivery RPC with the per-assignment money gate.
--    Guard structure (Gate 1 role, Gate 2 posting, k>=5 suppression) unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_analyst_views(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_manage    boolean;
  v_is_assoc  boolean;
  v_posted    boolean;
  v_can_money boolean;      -- may this caller receive is_sensitive (money) views?
  v_rec       record;
  v_guard_col text;
  v_where     text;
  v_rows      jsonb;
  v_views     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_manage := is_super_admin() OR is_admin()
              OR user_has_permission('improvement.board.manage');

  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND cr.role_key = 'mba_associate'
      AND cr.is_active
  ) INTO v_is_assoc;

  -- Gate 1: must be an MBA Associate or a board manager.
  IF NOT (v_is_assoc OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: MBA Associate role or improvement.board.manage required'
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

  -- Money gate (per-assignment). A board manager always sees the money views.
  -- A posted MBA Associate sees the is_sensitive views ONLY when their active
  -- posting to THIS department has include_financial = true. UNIQUE(associate,
  -- area) means at most one such row.
  v_can_money := v_manage OR EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
      AND p.include_financial
  );

  -- Deliver each mapped view with k>=5 small-cell suppression.
  FOR v_rec IN
    SELECT view_name, is_sensitive
    FROM mba_area_analyst_views
    WHERE area_id = p_area_id
    ORDER BY view_name
  LOOP
    -- Per-assignment money gate: hide is_sensitive views from a posted Associate
    -- whose assignment does not include financials. Managers pass (v_can_money).
    IF v_rec.is_sensitive AND NOT v_can_money THEN
      CONTINUE;
    END IF;

    -- Per-view "underlying individuals" count column. This CASE is ALSO the
    -- allowlist of readable relations: an unknown view_name is skipped, so the
    -- dynamic read can never touch an arbitrary relation.
    --   NULL  => the view has no individual-level count column (event financials);
    --            k>=5 is not applicable, rows pass. The is_sensitive flag + the
    --            posting/money gates are the controls for that view.
    v_guard_col := CASE v_rec.view_name
      WHEN 'learning_admission_funnel'    THEN 'lead_count'        -- leads
      WHEN 'learning_channel_roi'         THEN 'leads'             -- leads
      WHEN 'learning_collection_summary'  THEN 'receipts'          -- receipts (payers)
      WHEN 'learning_conversion_gaps'     THEN 'transition_count'  -- leads transitioning
      WHEN 'learning_event_attendance'    THEN 'registrations'     -- registrants
      WHEN 'learning_event_feedback'      THEN 'responses'         -- respondents
      WHEN 'learning_event_budget_actual' THEN NULL                -- event financials: no individuals
      ELSE '__unknown__'
    END;

    IF v_guard_col = '__unknown__' THEN
      CONTINUE;  -- not an allowlisted analyst view
    END IF;

    IF v_guard_col IS NULL THEN
      v_where := 'TRUE';
    ELSE
      -- Drop any group representing fewer than 5 underlying individuals.
      v_where := format('%I >= 5', v_guard_col);
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
$fn$;

COMMENT ON FUNCTION public.fn_mba_analyst_views(uuid) IS
  'Assignment-scoped delivery of de-identified analyst views for one improvement_area. Guards on mba_associate role + active posting (improvement.board.manage bypasses). is_sensitive (money) views are delivered to a posted Associate ONLY when their active posting has include_financial=true; managers always get money. Applies k>=5 small-cell suppression per view. Returns {area_id, views:[{view_name,is_sensitive,rows[]}]}.';

-- Anon lock-out (Supabase default ALTER DEFAULT PRIVILEGES otherwise grants anon
-- EXECUTE). Re-asserted after CREATE OR REPLACE — the secdef-anon CI gate treats
-- a re-declared locked SECDEF function as new.
REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) TO authenticated;

COMMIT;
