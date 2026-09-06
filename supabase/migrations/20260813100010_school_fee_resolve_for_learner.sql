-- ============================================================================
-- 20260813100010 — school_fee_resolve_for_learner + class preview
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §5.1
--
-- READ-ONLY. Writes nothing, creates no bills, touches no billing table. It is
-- the single source of truth for "what does this learner owe this year", read
-- by the generate preview (Phase 7), the plan preview (Phase 5) and the parent
-- portal.
--
-- Contrast with the college resolver admission_resolve_fee_items_for_lead():
--   * that one matches 8 dimensions on admission_year_id (COHORT-locked) and
--     PERSISTS its result into learners_profiles.fee_items
--   * this one matches 3 dimensions on academic_year_id (CURRENT year) and
--     persists nothing
-- Neither function is modified by this migration.
--
-- SECURITY DEFINER + explicit authorization
-- -----------------------------------------
-- The function must read school_fee_plans, concession tables and
-- learners_profiles across RLS, so it runs as definer. That makes the internal
-- permission check load-bearing: without it any authenticated user could read
-- any learner's fee. Three ways in, mirroring the live bill policies:
--   1. super admin / admin
--   2. school_fees.read + institution access to the learner's institution
--   3. the learner themselves (profiles.learner_id link OR email match)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.school_fee_resolve_for_learner(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_learner   record;
    v_plan      record;
    v_allowed   boolean;
    v_result    jsonb;
BEGIN
    SELECT lp.id, lp.institution_id, lp.program_id, lp.academic_year_id,
           lp.lifecycle_status, lp.first_name, lp.last_name, lp.roll_number
      INTO v_learner
      FROM public.learners_profiles lp
     WHERE lp.id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- ---------------------------------------------------------------------
    -- Authorization (see header)
    -- ---------------------------------------------------------------------
    SELECT
        public.is_super_admin()
        OR public.is_admin()
        OR (
             public.user_has_permission('school_fees.read')
             AND public.role_has_institution_access(v_learner.institution_id)
           )
        OR EXISTS (
             SELECT 1
               FROM public.profiles p
              WHERE p.id = auth.uid()
                AND (
                      p.learner_id = p_learner_id
                      OR p.email IN (
                           SELECT lp2.student_email FROM public.learners_profiles lp2 WHERE lp2.id = p_learner_id
                           UNION
                           SELECT lp2.college_email FROM public.learners_profiles lp2 WHERE lp2.id = p_learner_id
                         )
                    )
           )
      INTO v_allowed;

    IF NOT COALESCE(v_allowed, false) THEN
        RAISE EXCEPTION 'not_authorized_for_learner_fee' USING ERRCODE = '42501';
    END IF;

    -- ---------------------------------------------------------------------
    -- The active plan for (institution, class, CURRENT academic year)
    -- ---------------------------------------------------------------------
    IF v_learner.program_id IS NULL OR v_learner.academic_year_id IS NULL THEN
        RETURN jsonb_build_object(
            'matched', false,
            'learner_id', p_learner_id,
            'reason', 'learner_missing_class_or_year');
    END IF;

    SELECT p.id, p.version, p.name, p.locked_at
      INTO v_plan
      FROM public.school_fee_plans p
     WHERE p.institution_id   = v_learner.institution_id
       AND p.program_id       = v_learner.program_id
       AND p.academic_year_id = v_learner.academic_year_id
       AND p.status           = 'active'
     LIMIT 1;

    IF v_plan.id IS NULL THEN
        RETURN jsonb_build_object(
            'matched', false,
            'learner_id', p_learner_id,
            'institution_id', v_learner.institution_id,
            'program_id', v_learner.program_id,
            'academic_year_id', v_learner.academic_year_id,
            'reason', 'no_active_plan');
    END IF;

    -- ---------------------------------------------------------------------
    -- Resolution
    --
    -- Concession order is fixed so re-running generation is stable:
    --   1. sum percent schemes per head, CAP the total at 100%
    --   2. apply the capped percent to every cell of that head
    --   3. subtract flat schemes, spread across that head's terms in
    --      proportion to what each term still carries
    --   4. clamp each cell at 0
    --
    -- Step 3 rounds per cell, so the parts can miss the intended total by a
    -- paisa or two. The residual is pushed onto the LARGEST cell rather than
    -- left to drift — on money, the head total must be exact.
    -- ---------------------------------------------------------------------
    WITH assigned AS (
        SELECT s.id AS scheme_id, s.code, s.name, s.mode, s.value, s.applies_to_all_heads
          FROM public.school_fee_concession_assignments a
          JOIN public.school_fee_concession_schemes s ON s.id = a.scheme_id
         WHERE a.learner_id       = p_learner_id
           AND a.academic_year_id = v_learner.academic_year_id
           AND s.is_active
    ),
    plan_heads AS (
        SELECT DISTINCT billing_category_id
          FROM public.school_fee_plan_items
         WHERE plan_id = v_plan.id
    ),
    -- An all-heads scheme expands across the heads this plan actually has, so
    -- a scheme created before a head existed still covers it.
    scheme_head AS (
        SELECT a.mode, a.value, h.billing_category_id
          FROM assigned a
          JOIN public.school_fee_concession_scheme_heads h ON h.scheme_id = a.scheme_id
         WHERE NOT a.applies_to_all_heads
        UNION ALL
        SELECT a.mode, a.value, ph.billing_category_id
          FROM assigned a
          CROSS JOIN plan_heads ph
         WHERE a.applies_to_all_heads
    ),
    head_conc AS (
        SELECT billing_category_id,
               LEAST(100, COALESCE(SUM(value) FILTER (WHERE mode = 'percent'), 0)) AS pct,
               COALESCE(SUM(value) FILTER (WHERE mode = 'flat'), 0)                AS flat
          FROM scheme_head
         GROUP BY billing_category_id
    ),
    cells AS (
        SELECT i.billing_category_id,
               bc.category_name,
               i.term_number,
               i.amount::numeric               AS gross,
               i.is_one_time,
               i.sort_order,
               COALESCE(hc.pct, 0)             AS pct,
               COALESCE(hc.flat, 0)            AS flat
          FROM public.school_fee_plan_items i
          JOIN public.billing_categories bc ON bc.id = i.billing_category_id
          LEFT JOIN head_conc hc ON hc.billing_category_id = i.billing_category_id
         WHERE i.plan_id = v_plan.id
    ),
    after_pct AS (
        SELECT c.*, round(c.gross * (100 - c.pct) / 100.0, 2) AS pct_net
          FROM cells c
    ),
    head_tot AS (
        SELECT billing_category_id, SUM(pct_net) AS head_net
          FROM after_pct
         GROUP BY billing_category_id
    ),
    flat_split AS (
        SELECT a.*,
               ht.head_net,
               LEAST(a.flat, ht.head_net) AS flat_target,
               CASE
                 WHEN ht.head_net <= 0 OR a.flat <= 0 THEN 0
                 ELSE round(LEAST(a.flat, ht.head_net) * (a.pct_net / ht.head_net), 2)
               END AS flat_cut,
               row_number() OVER (
                 PARTITION BY a.billing_category_id
                 ORDER BY a.pct_net DESC, a.term_number
               ) AS rn
          FROM after_pct a
          JOIN head_tot ht ON ht.billing_category_id = a.billing_category_id
    ),
    flat_fixed AS (
        SELECT f.*,
               CASE
                 WHEN f.rn = 1
                   THEN f.flat_cut + (f.flat_target - SUM(f.flat_cut) OVER (PARTITION BY f.billing_category_id))
                 ELSE f.flat_cut
               END AS flat_final
          FROM flat_split f
    ),
    resolved AS (
        SELECT billing_category_id, category_name, term_number, is_one_time, sort_order,
               gross,
               LEAST(GREATEST(gross - GREATEST(pct_net - flat_final, 0), 0), gross) AS concession,
               GREATEST(pct_net - flat_final, 0)                                    AS net
          FROM flat_fixed
    ),
    per_term AS (
        SELECT r.term_number,
               COALESCE(tc.term_name, 'Term ' || r.term_number) AS term_name,
               tc.due_date,
               tc.fine_effective_date,
               COALESCE(tc.fine_amount, 0) AS fine_amount,
               SUM(r.gross)      AS term_gross,
               SUM(r.concession) AS term_concession,
               SUM(r.net)        AS term_net,
               jsonb_agg(
                 jsonb_build_object(
                   'billing_category_id', r.billing_category_id,
                   'category_name',       r.category_name,
                   'is_one_time',         r.is_one_time,
                   'gross',               r.gross,
                   'concession',          r.concession,
                   'net',                 r.net)
                 ORDER BY r.sort_order, r.category_name
               ) AS heads
          FROM resolved r
          LEFT JOIN public.school_term_calendars tc
                 ON tc.institution_id   = v_learner.institution_id
                AND tc.academic_year_id = v_learner.academic_year_id
                AND tc.term_number      = r.term_number
         GROUP BY r.term_number, tc.term_name, tc.due_date, tc.fine_effective_date, tc.fine_amount
    )
    SELECT jsonb_build_object(
             'matched',            true,
             'learner_id',         p_learner_id,
             'learner_name',       trim(coalesce(v_learner.first_name,'') || ' ' || coalesce(v_learner.last_name,'')),
             'roll_number',        v_learner.roll_number,
             'lifecycle_status',   v_learner.lifecycle_status,
             'institution_id',     v_learner.institution_id,
             'program_id',         v_learner.program_id,
             'academic_year_id',   v_learner.academic_year_id,
             'plan_id',            v_plan.id,
             'plan_name',          v_plan.name,
             'version',            v_plan.version,
             'plan_locked',        (v_plan.locked_at IS NOT NULL),
             -- A term with no calendar row still resolves; the caller decides
             -- whether a NULL due_date is acceptable. Generation refuses it.
             'has_term_calendar',  bool_and(pt.due_date IS NOT NULL),
             'terms', jsonb_agg(
                        jsonb_build_object(
                          'term_number',         pt.term_number,
                          'term_name',           pt.term_name,
                          'due_date',            pt.due_date,
                          'fine_effective_date', pt.fine_effective_date,
                          'fine_amount',         pt.fine_amount,
                          'heads',               pt.heads,
                          'gross',               pt.term_gross,
                          'concession',          pt.term_concession,
                          'net',                 pt.term_net)
                        ORDER BY pt.term_number),
             'year_gross',      SUM(pt.term_gross),
             'year_concession', SUM(pt.term_concession),
             'year_net',        SUM(pt.term_net),
             'concessions_applied', COALESCE(
               (SELECT jsonb_agg(jsonb_build_object(
                         'scheme_id', a.scheme_id, 'code', a.code, 'name', a.name,
                         'mode', a.mode, 'value', a.value,
                         'applies_to_all_heads', a.applies_to_all_heads) ORDER BY a.name)
                  FROM assigned a), '[]'::jsonb)
           )
      INTO v_result
      FROM per_term pt;

    -- A plan with an active status but zero items yields no per_term rows.
    RETURN COALESCE(
        v_result,
        jsonb_build_object(
            'matched', false,
            'learner_id', p_learner_id,
            'plan_id', v_plan.id,
            'reason', 'plan_has_no_items'));
END;
$$;

REVOKE ALL ON FUNCTION public.school_fee_resolve_for_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_fee_resolve_for_learner(uuid) TO authenticated;

COMMENT ON FUNCTION public.school_fee_resolve_for_learner(uuid) IS
  'Read-only. Resolves a school learner''s per-term fee for their CURRENT academic year from the active school_fee_plan, applying concession schemes (percent capped at 100%, then flat spread proportionally, clamped at 0). Persists nothing. Authorization is enforced inside the function because it is SECURITY DEFINER.';


-- ============================================================================
-- school_fee_resolve_preview_for_class — the preview + Phase 7 dry-run source
-- ============================================================================
-- One row per enrolled learner in a class. Calls the per-learner resolver so
-- there is exactly ONE implementation of the concession maths; a second copy
-- here would drift from the one that actually bills.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.school_fee_resolve_preview_for_class(
    p_institution_id   uuid,
    p_program_id       uuid,
    p_academic_year_id uuid
)
RETURNS TABLE (
    learner_id       uuid,
    learner_name     text,
    roll_number      text,
    matched          boolean,
    reason           text,
    year_gross       numeric,
    year_concession  numeric,
    year_net         numeric,
    concession_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_allowed boolean;
BEGIN
    SELECT public.is_super_admin()
        OR public.is_admin()
        OR (
             public.user_has_permission('school_fees.read')
             AND public.role_has_institution_access(p_institution_id)
           )
      INTO v_allowed;

    IF NOT COALESCE(v_allowed, false) THEN
        RAISE EXCEPTION 'not_authorized_for_school_fee_preview' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT lp.id,
           trim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')),
           lp.roll_number,
           COALESCE((r.payload->>'matched')::boolean, false),
           r.payload->>'reason',
           COALESCE((r.payload->>'year_gross')::numeric, 0),
           COALESCE((r.payload->>'year_concession')::numeric, 0),
           COALESCE((r.payload->>'year_net')::numeric, 0),
           COALESCE(jsonb_array_length(r.payload->'concessions_applied'), 0)
      FROM public.learners_profiles lp
      CROSS JOIN LATERAL (
          SELECT public.school_fee_resolve_for_learner(lp.id) AS payload
      ) r
     WHERE lp.institution_id   = p_institution_id
       AND lp.program_id       = p_program_id
       AND lp.academic_year_id = p_academic_year_id
       AND lp.lifecycle_status = 'active'
     ORDER BY lp.roll_number NULLS LAST, lp.first_name;
END;
$$;

REVOKE ALL ON FUNCTION public.school_fee_resolve_preview_for_class(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_fee_resolve_preview_for_class(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.school_fee_resolve_preview_for_class(uuid, uuid, uuid) IS
  'Read-only per-learner fee preview for one class + academic year. Delegates to school_fee_resolve_for_learner so the concession maths has exactly one implementation. Enrolled learners only (lifecycle_status = ''active'').';
