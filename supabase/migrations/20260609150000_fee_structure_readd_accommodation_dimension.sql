-- ─── Re-add accommodation_type as an OPTIONAL fee-structure dimension ────────
-- Reverses the matching-logic half of 20260528000008. accommodation_type_id
-- becomes a second optional matching dimension parallel to `gender`:
--   NULL = "Any accommodation" (wildcard); a non-NULL value targets that type.
-- Resolution prefers an accommodation-specific structure, then falls back to a
-- NULL ("Any") structure. Academic-fees-only is preserved: hostel-kind billing
-- categories remain excluded from the item picker, so this cannot reintroduce
-- the campus-living double-billing risk.
--
-- Changes:
--   1. Resolution RPC: add accommodation filter + accommodation-first ORDER BY.
--   2. Overlap trigger: add accommodation bucket-equality so an "Any" and a
--      type-specific structure can coexist, while duplicates still collide.
--
-- NOTE: the RPC body below is rebuilt from the LATEST prior definition
-- (20260605105000_academic_resolution_year_aware), preserving the
-- v_year / fn_learner_year_of_study() year-of-study item filter — NOT the
-- older 20260528000008 body. The separate read-only twin
-- admission_resolve_fee_items_readonly(uuid,int) (20260606100000) is untouched.

-- 1. Resolution RPC — accommodation-aware match (prefer-specific-then-Any).
CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_adjustments       jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(public.fn_learner_year_of_study(p_learner_id), 1);
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

    -- accommodation_type_id is an OPTIONAL match dimension (NULL = Any). Prefer
    -- an accommodation-specific structure, then a gender-specific one, then the
    -- most recently updated, as the deterministic tiebreak. Hostel ROOM/MESS
    -- fees still live in campus-living; this only routes academic/common fees.
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
       AND (afs.accommodation_type_id = v_lead.accommodation_type_id
            OR afs.accommodation_type_id IS NULL)
     ORDER BY afs.accommodation_type_id IS NOT NULL DESC,
              afs.gender IS NOT NULL DESC,
              afs.updated_at DESC
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',   fsi.billing_category_id,
                'category_name', bc.category_name,
                'amount',        fsi.amount,
                'source',        'structure'))
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
               'category_id',   item->>'category_id',
               'category_name', item->>'category_name',
               'amount',        GREATEST(0, (item->>'amount')::numeric
                                  + COALESCE(pc.delta_sum, 0)),
               'source',        item->>'source'))
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
                'category_id',   NULL,
                'category_name', 'Global Adjustment',
                'amount',        v_global_deltas_sum,
                'source',        'adjustment_global'
            )
        );
    END IF;

    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$function$;

-- 2. Overlap-prevention trigger — accommodation bucket-equality added.
CREATE OR REPLACE FUNCTION public._fee_structure_community_no_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_self public.admission_fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO v_self
      FROM public.admission_fee_structures
     WHERE id = NEW.fee_structure_id;

    IF v_self.status = 'archived' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.admission_fee_structure_communities j
          JOIN public.admission_fee_structures fs ON fs.id = j.fee_structure_id
         WHERE j.community_category_id = NEW.community_category_id
           AND j.fee_structure_id <> NEW.fee_structure_id
           AND fs.institution_id        = v_self.institution_id
           AND fs.degree_id             = v_self.degree_id
           AND fs.department_id         = v_self.department_id
           AND fs.programme_id          = v_self.programme_id
           AND fs.quota_id              = v_self.quota_id
           AND fs.admission_year_id     = v_self.admission_year_id
           AND fs.status <> 'archived'
           AND (fs.gender IS NOT DISTINCT FROM v_self.gender
                OR fs.gender IS NULL
                OR v_self.gender IS NULL)
           AND fs.accommodation_type_id IS NOT DISTINCT FROM v_self.accommodation_type_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            MESSAGE = 'Another active fee structure already covers community '
                   || NEW.community_category_id::text
                   || ' for this dimension combination (gender: '
                   || COALESCE(v_self.gender, 'Any')
                   || ', accommodation: '
                   || COALESCE(v_self.accommodation_type_id::text, 'Any')
                   || '). Archive the existing structure first.';
    END IF;

    RETURN NEW;
END;
$function$;
