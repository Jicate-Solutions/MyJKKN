-- ============================================================================
-- 20260813100012 — school_fee_generation_preview + school_fee_generate
-- ============================================================================
-- Design: docs/plans/2026-08-13-school-fee-structure-design.md §5.2
--
-- REQUIRES 20260813100011 (school_fee_caller_is_privileged). Apply that first.
--
-- ############################################################################
-- # This is the ONLY function in the module that writes financial records.    #
-- #                                                                           #
-- # Guards, in the order they fire:                                           #
-- #  1. school_fees.generate permission + institution access                  #
-- #  2. plan must be status='active' (drafts and archived are ignored)        #
-- #  3. learner must be lifecycle_status='active' (never graduated/enquiry)   #
-- #  4. EVERY term the plan uses must have a school_term_calendars row with a #
-- #     due_date — a bill with no due date can never be chased or fined, so   #
-- #     the whole class is refused rather than half-billed                    #
-- #  5. only heads whose resolved NET is > 0 become rows                      #
-- #  6. ON CONFLICT DO NOTHING against ux_billing_bills_school_fee_item —     #
-- #     re-running physically cannot double-bill a learner                    #
-- #                                                                           #
-- # It INSERTs into billing_student_bills and never UPDATEs or DELETEs there. #
-- # No existing bill, policy, trigger or function is touched. College and     #
-- # hostel billing are unaffected: every row it writes carries a non-NULL     #
-- # school_fee_plan_id, and nothing outside this module reads that column.    #
-- ############################################################################
--
-- Amounts come from school_fee_resolve_for_learner() — the same RPC the
-- preview screen reads. There is deliberately no second implementation of the
-- concession maths, so what a clerk approves is what gets billed.
-- ============================================================================


-- ============================================================================
-- 1. Preview — per class, what would happen
-- ============================================================================
CREATE OR REPLACE FUNCTION public.school_fee_generation_preview(
    p_institution_id   uuid,
    p_academic_year_id uuid
)
RETURNS TABLE (
    program_id       uuid,
    class_name       text,
    plan_id          uuid,
    plan_name        text,
    version          integer,
    learners         integer,
    already_billed   integer,
    billable         integer,
    status           text,
    year_gross       numeric,
    year_concession  numeric,
    year_net         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT (
        public.school_fee_caller_is_privileged()
        OR (
             public.user_has_permission('school_fees.read')
             AND public.role_has_institution_access(p_institution_id)
           )
    ) THEN
        RAISE EXCEPTION 'not_authorized_for_school_fee_generation' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH classes AS (
        SELECT pr.id AS program_id, pr.program_name
          FROM public.programs pr
         WHERE pr.institution_id = p_institution_id
           AND pr.is_active
    ),
    plans AS (
        SELECT p.id, p.program_id, p.name, p.version
          FROM public.school_fee_plans p
         WHERE p.institution_id   = p_institution_id
           AND p.academic_year_id = p_academic_year_id
           AND p.status           = 'active'
    ),
    -- A plan is only generatable if EVERY term it uses has a calendar row
    -- carrying a due date.
    plan_terms AS (
        SELECT pl.id AS plan_id,
               bool_and(tc.due_date IS NOT NULL) AS all_terms_dated
          FROM plans pl
          JOIN public.school_fee_plan_items i ON i.plan_id = pl.id
          LEFT JOIN public.school_term_calendars tc
                 ON tc.institution_id   = p_institution_id
                AND tc.academic_year_id = p_academic_year_id
                AND tc.term_number      = i.term_number
         GROUP BY pl.id
    ),
    learners AS (
        SELECT lp.id AS learner_id, lp.program_id
          FROM public.learners_profiles lp
         WHERE lp.institution_id   = p_institution_id
           AND lp.academic_year_id = p_academic_year_id
           AND lp.lifecycle_status = 'active'
    ),
    billed AS (
        SELECT b.student_id, b.school_fee_plan_id
          FROM public.billing_student_bills b
         WHERE b.school_fee_plan_id IN (SELECT id FROM plans)
         GROUP BY b.student_id, b.school_fee_plan_id
    ),
    resolved AS (
        SELECT l.program_id,
               l.learner_id,
               (bl.student_id IS NOT NULL) AS is_billed,
               r.payload
          FROM learners l
          JOIN plans pl ON pl.program_id = l.program_id
          LEFT JOIN billed bl
                 ON bl.student_id = l.learner_id
                AND bl.school_fee_plan_id = pl.id
          CROSS JOIN LATERAL (
              SELECT public.school_fee_resolve_for_learner(l.learner_id) AS payload
          ) r
    )
    SELECT c.program_id,
           c.program_name,
           pl.id,
           pl.name,
           pl.version,
           -- Learner count comes from `learners`, NOT from `resolved`.
           -- `resolved` joins learners to plans, so a class with no plan has
           -- zero resolved rows — sourcing the count there would report
           -- "0 learners" for exactly the classes the operator needs to see.
           COALESCE(lc.learners, 0)::integer,
           COALESCE(agg.already, 0)::integer,
           COALESCE(agg.billable, 0)::integer,
           CASE
             WHEN pl.id IS NULL                               THEN 'no_plan'
             WHEN COALESCE(pt.all_terms_dated, false) = false THEN 'no_calendar'
             WHEN COALESCE(lc.learners, 0) = 0                THEN 'no_learners'
             WHEN COALESCE(agg.billable, 0) = 0               THEN 'already_generated'
             ELSE 'ready'
           END,
           COALESCE(agg.gross, 0),
           COALESCE(agg.conc, 0),
           COALESCE(agg.net, 0)
      FROM classes c
      LEFT JOIN plans pl ON pl.program_id = c.program_id
      LEFT JOIN plan_terms pt ON pt.plan_id = pl.id
      LEFT JOIN LATERAL (
          SELECT count(*)::integer AS learners
            FROM learners l
           WHERE l.program_id = c.program_id
      ) lc ON true
      LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE r.is_billed)::integer               AS already,
                 count(*) FILTER (
                   WHERE NOT r.is_billed
                     AND COALESCE((r.payload->>'matched')::boolean, false)
                 )::integer                                                 AS billable,
                 COALESCE(SUM((r.payload->>'year_gross')::numeric)
                          FILTER (WHERE NOT r.is_billed), 0)                AS gross,
                 COALESCE(SUM((r.payload->>'year_concession')::numeric)
                          FILTER (WHERE NOT r.is_billed), 0)                AS conc,
                 COALESCE(SUM((r.payload->>'year_net')::numeric)
                          FILTER (WHERE NOT r.is_billed), 0)                AS net
            FROM resolved r
           WHERE r.program_id = c.program_id
      ) agg ON true
     ORDER BY c.program_name;
END;
$$;

REVOKE ALL ON FUNCTION public.school_fee_generation_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_fee_generation_preview(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.school_fee_generation_preview(uuid, uuid) IS
  'Read-only per-class dry run for school fee generation. Writes nothing. status: ready | no_plan | no_calendar | no_learners | already_generated.';


-- ============================================================================
-- 2. Generate — the only writer
-- ============================================================================
CREATE OR REPLACE FUNCTION public.school_fee_generate(
    p_institution_id   uuid,
    p_academic_year_id uuid,
    p_dry_run          boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller          uuid := auth.uid();
    v_bills_created   integer := 0;
    v_learners        integer := 0;
    v_skipped_plan    integer := 0;
    v_skipped_exist   integer := 0;
    v_plan_ids        uuid[];
    v_breakdown       jsonb;
    v_run_id          uuid;
BEGIN
    IF NOT (
        public.school_fee_caller_is_privileged()
        OR (
             public.user_has_permission('school_fees.generate')
             AND public.role_has_institution_access(p_institution_id)
           )
    ) THEN
        RAISE EXCEPTION 'not_authorized_for_school_fee_generation' USING ERRCODE = '42501';
    END IF;

    -- Per-class picture, straight from the preview so both agree by construction.
    SELECT jsonb_agg(to_jsonb(pv) ORDER BY pv.class_name),
           COALESCE(SUM(pv.learners), 0),
           COALESCE(SUM(pv.already_billed), 0),
           COALESCE(SUM(pv.learners) FILTER (WHERE pv.status IN ('no_plan','no_calendar')), 0)
      INTO v_breakdown, v_learners, v_skipped_exist, v_skipped_plan
      FROM public.school_fee_generation_preview(p_institution_id, p_academic_year_id) pv;

    -- Only classes cleared by every guard may be billed. Read out of the
    -- breakdown just captured rather than calling the preview a second time —
    -- the preview resolves EVERY learner in the school, so a second call would
    -- double the most expensive part of the run.
    SELECT array_agg((e->>'plan_id')::uuid)
      INTO v_plan_ids
      FROM jsonb_array_elements(COALESCE(v_breakdown, '[]'::jsonb)) e
     WHERE e->>'status' = 'ready'
       AND e->>'plan_id' IS NOT NULL;

    IF p_dry_run THEN
        INSERT INTO public.school_fee_generation_runs (
            institution_id, academic_year_id, is_dry_run,
            learners_matched, bills_created, skipped_no_plan, skipped_existing,
            result, run_by)
        VALUES (p_institution_id, p_academic_year_id, true,
                v_learners, 0, v_skipped_plan, v_skipped_exist,
                v_breakdown, v_caller)
        RETURNING id INTO v_run_id;

        RETURN jsonb_build_object(
            'dry_run', true, 'run_id', v_run_id,
            'learners_matched', v_learners, 'bills_created', 0,
            'skipped_no_plan', v_skipped_plan, 'skipped_existing', v_skipped_exist,
            'classes', COALESCE(v_breakdown, '[]'::jsonb));
    END IF;

    IF v_plan_ids IS NULL OR array_length(v_plan_ids, 1) IS NULL THEN
        RETURN jsonb_build_object(
            'dry_run', false, 'bills_created', 0,
            'learners_matched', v_learners,
            'skipped_no_plan', v_skipped_plan, 'skipped_existing', v_skipped_exist,
            'classes', COALESCE(v_breakdown, '[]'::jsonb),
            'note', 'nothing_ready_to_generate');
    END IF;

    -- ---------------------------------------------------------------------
    -- The write. One row per (learner, term, head) with net > 0, exactly the
    -- row shape every other billing path uses — only the three school columns
    -- are additional.
    --
    -- ON CONFLICT infers ux_billing_bills_school_fee_item (partial, hence the
    -- repeated WHERE). Re-running is therefore a no-op rather than a duplicate
    -- charge, which is what makes this safe to retry after a timeout.
    -- ---------------------------------------------------------------------
    WITH candidates AS (
        SELECT lp.id AS learner_id,
               pl.id AS plan_id,
               public.school_fee_resolve_for_learner(lp.id) AS payload
          FROM public.learners_profiles lp
          JOIN public.school_fee_plans pl
            ON pl.program_id       = lp.program_id
           AND pl.institution_id   = lp.institution_id
           AND pl.academic_year_id = lp.academic_year_id
           AND pl.status           = 'active'
         WHERE lp.institution_id   = p_institution_id
           AND lp.academic_year_id = p_academic_year_id
           AND lp.lifecycle_status = 'active'
           AND pl.id = ANY(v_plan_ids)
    ),
    rows_to_write AS (
        SELECT c.learner_id,
               c.plan_id,
               (t->>'term_number')::smallint            AS term_number,
               t->>'term_name'                          AS term_name,
               (t->>'due_date')::date                   AS due_date,
               NULLIF(t->>'fine_effective_date','')::date AS fine_effective_date,
               (h->>'billing_category_id')::uuid        AS category_id,
               h->>'category_name'                      AS category_name,
               (h->>'net')::numeric                     AS net
          FROM candidates c
          CROSS JOIN LATERAL jsonb_array_elements(c.payload->'terms') t
          CROSS JOIN LATERAL jsonb_array_elements(t->'heads') h
         WHERE COALESCE((c.payload->>'matched')::boolean, false)
           AND (h->>'net')::numeric > 0
           AND (t->>'due_date') IS NOT NULL
    ),
    inserted AS (
        INSERT INTO public.billing_student_bills (
            student_id, institution_id, academic_year_id, item_category_id,
            bill_description, due_date, quantity,
            unit_amount, total_amount, tax_amount, final_amount, balance_amount,
            status, remarks, created_by,
            school_fee_plan_id, term_number, fine_effective_date)
        SELECT r.learner_id, p_institution_id, p_academic_year_id, r.category_id,
               r.category_name || ' — ' || r.term_name,
               r.due_date, 1,
               r.net, r.net, 0, r.net, r.net,
               'unpaid',
               'School fee — auto-generated',
               v_caller,
               r.plan_id, r.term_number, r.fine_effective_date
          FROM rows_to_write r
        ON CONFLICT (student_id, school_fee_plan_id, term_number, item_category_id)
            WHERE school_fee_plan_id IS NOT NULL
        DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_bills_created FROM inserted;

    -- Freeze every plan that produced bills. From here, changing the amounts
    -- requires a new version (design §5.3).
    UPDATE public.school_fee_plans
       SET locked_at = COALESCE(locked_at, now())
     WHERE id = ANY(v_plan_ids);

    INSERT INTO public.school_fee_generation_runs (
        institution_id, academic_year_id, is_dry_run,
        learners_matched, bills_created, skipped_no_plan, skipped_existing,
        result, run_by)
    VALUES (p_institution_id, p_academic_year_id, false,
            v_learners, v_bills_created, v_skipped_plan, v_skipped_exist,
            v_breakdown, v_caller)
    RETURNING id INTO v_run_id;

    RETURN jsonb_build_object(
        'dry_run', false, 'run_id', v_run_id,
        'learners_matched', v_learners,
        'bills_created', v_bills_created,
        'skipped_no_plan', v_skipped_plan,
        'skipped_existing', v_skipped_exist,
        'plans_locked', array_length(v_plan_ids, 1),
        'classes', COALESCE(v_breakdown, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.school_fee_generate(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_fee_generate(uuid, uuid, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.school_fee_generate(uuid, uuid, boolean) IS
  'Generates school term bills into billing_student_bills. p_dry_run=true (default) writes only an audit row. Idempotent: ON CONFLICT against ux_billing_bills_school_fee_item means re-running cannot double-bill. Locks every plan it bills from. INSERT-only — never updates or deletes an existing bill.';
