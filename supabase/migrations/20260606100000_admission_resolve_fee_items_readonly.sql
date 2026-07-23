-- Read-only twin of admission_resolve_fee_items_for_lead(uuid).
--
-- The existing admission_resolve_fee_items_for_lead(uuid) resolves a learner's
-- academic fee items AND writes them to learners_profiles.fee_items (a side
-- effect). Phase 3 needs a dry-run preview, so this function performs the exact
-- same matching + aggregation logic but RETURNS the resolved jsonb array WITHOUT
-- writing anything.
--
-- Differences from the original (intentional):
--   1. Signature is (p_learner_id uuid, p_year_of_study int) — the caller
--      supplies the year-of-study used by the applicability predicate, instead
--      of computing it via fn_learner_year_of_study().
--   2. No UPDATE learners_profiles — the resolved jsonb is RETURNed instead.
--   3. Each returned item carries billing_category_id (the generation RPC needs
--      it for dedup), plus category_name, amount, applies_to and
--      applies_year_of_study. (The original only emits these under the
--      'category_id' key; this twin emits both 'category_id' for shape
--      compatibility and 'billing_category_id' explicitly.)

CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_readonly(
    p_learner_id uuid,
    p_year_of_study int
)
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(p_year_of_study, 1);
BEGIN
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode, gender
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    SELECT afs.id INTO v_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = v_lead.institution_id
       AND afs.degree_id             = v_lead.degree_id
       AND afs.department_id         = v_lead.department_id
       AND afs.programme_id          = v_lead.program_id
       AND afs.quota_id              = v_lead.quota_id
       AND afs.admission_year_id     = v_lead.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = v_lead.community_category_id
           )
       AND (afs.gender = UPPER(v_lead.gender) OR afs.gender IS NULL)
     ORDER BY afs.gender IS NOT NULL DESC
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',           fsi.billing_category_id,
                'billing_category_id',   fsi.billing_category_id,
                'category_name',         bc.category_name,
                'amount',                fsi.amount,
                'applies_to',            fsi.applies_to,
                'applies_year_of_study', fsi.applies_year_of_study,
                'source',                'structure'))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id
       AND (
             fsi.applies_to = 'every_year'
          OR (fsi.applies_to = 'first_year_only' AND v_year = 1)
          OR (fsi.applies_to = 'specific_year'  AND fsi.applies_year_of_study = v_year)
       );

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',           item->>'category_id',
               'billing_category_id',   item->>'billing_category_id',
               'category_name',         item->>'category_name',
               'amount',                GREATEST(0, (item->>'amount')::numeric
                                          + COALESCE(pc.delta_sum, 0)),
               'applies_to',            item->>'applies_to',
               'applies_year_of_study', (item->>'applies_year_of_study')::int,
               'source',                item->>'source'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',           NULL,
                'billing_category_id',   NULL,
                'category_name',         'Global Adjustment',
                'amount',                v_global_deltas_sum,
                'applies_to',            NULL,
                'applies_year_of_study', NULL,
                'source',                'adjustment_global'
            )
        );
    END IF;

    RETURN v_resolved;
END;
$function$;
