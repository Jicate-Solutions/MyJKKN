-- ============================================================================
-- 20260509100006 — Trigger: detect matrix-dim changes on learners_profiles
-- ============================================================================
-- Spec §8.4. Fires AFTER UPDATE. Inserts pending_review event when learner's
-- matrix dims change AND non-superseded bills exist AND no pending event already.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_detect_fee_dimension_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed_field         text;
    v_has_active_bills      boolean;
    v_has_pending_event     boolean;
    v_old_structure_id      uuid;
    v_new_structure_id      uuid;
    v_event_id              uuid;
    v_caller                uuid := auth.uid();
BEGIN
    -- Skip if legacy mode (true OR flag itself changed)
    IF NEW.legacy_fee_mode = true OR NEW.legacy_fee_mode IS DISTINCT FROM OLD.legacy_fee_mode THEN
        RETURN NEW;
    END IF;

    -- Detect which dim changed (first match wins; for activity log clarity)
    v_changed_field := CASE
        WHEN NEW.program_id IS DISTINCT FROM OLD.program_id THEN 'program_id'
        WHEN NEW.quota_id IS DISTINCT FROM OLD.quota_id THEN 'quota_id'
        WHEN NEW.community_category_id IS DISTINCT FROM OLD.community_category_id THEN 'community_category_id'
        WHEN NEW.accommodation_type_id IS DISTINCT FROM OLD.accommodation_type_id THEN 'accommodation_type_id'
        WHEN NEW.admission_year_id IS DISTINCT FROM OLD.admission_year_id THEN 'admission_year_id'
        ELSE NULL
    END;

    IF v_changed_field IS NULL THEN
        RETURN NEW;
    END IF;

    -- Skip if no active bills
    SELECT EXISTS (
        SELECT 1 FROM public.billing_student_bills
         WHERE student_id = NEW.id AND status <> 'superseded'
    ) INTO v_has_active_bills;
    IF NOT v_has_active_bills THEN
        RETURN NEW;
    END IF;

    -- Skip if a pending_review event already exists
    SELECT EXISTS (
        SELECT 1 FROM public.admission_fee_change_events
         WHERE learner_id = NEW.id AND status = 'pending_review'
    ) INTO v_has_pending_event;
    IF v_has_pending_event THEN
        RETURN NEW;
    END IF;

    -- Look up old/new fee_structure_ids
    SELECT id INTO v_old_structure_id
      FROM public.admission_fee_structures
     WHERE institution_id        = OLD.institution_id
       AND degree_id             = OLD.degree_id
       AND department_id         = OLD.department_id
       AND programme_id          = OLD.program_id
       AND quota_id              = OLD.quota_id
       AND community_category_id = OLD.community_category_id
       AND accommodation_type_id = OLD.accommodation_type_id
       AND admission_year_id     = OLD.admission_year_id
       AND status = 'active'
     LIMIT 1;

    SELECT id INTO v_new_structure_id
      FROM public.admission_fee_structures
     WHERE institution_id        = NEW.institution_id
       AND degree_id             = NEW.degree_id
       AND department_id         = NEW.department_id
       AND programme_id          = NEW.program_id
       AND quota_id              = NEW.quota_id
       AND community_category_id = NEW.community_category_id
       AND accommodation_type_id = NEW.accommodation_type_id
       AND admission_year_id     = NEW.admission_year_id
       AND status = 'active'
     LIMIT 1;

    -- Insert event row
    INSERT INTO public.admission_fee_change_events (
        learner_id, trigger_field,
        old_program_id, old_quota_id, old_community_category_id,
        old_accommodation_type_id, old_admission_year_id,
        old_fee_structure_id, new_fee_structure_id,
        requested_by
    ) VALUES (
        NEW.id, v_changed_field,
        OLD.program_id, OLD.quota_id, OLD.community_category_id,
        OLD.accommodation_type_id, OLD.admission_year_id,
        v_old_structure_id, v_new_structure_id,
        v_caller
    )
    RETURNING id INTO v_event_id;

    -- Insert event_lines: one per billing_category in old + new structure items
    --   old_amount / new_amount / paid_amount_so_far populated
    INSERT INTO public.admission_fee_change_event_lines (
        event_id, billing_category_id, old_amount, new_amount, paid_amount_so_far
    )
    SELECT
        v_event_id,
        cat_id,
        old_amount,
        new_amount,
        paid
    FROM (
        SELECT cat_id,
               MAX(old_amount) AS old_amount,
               MAX(new_amount) AS new_amount,
               COALESCE(MAX(paid), 0) AS paid
          FROM (
              SELECT fsi.billing_category_id AS cat_id,
                     fsi.amount AS old_amount,
                     NULL::numeric AS new_amount,
                     NULL::numeric AS paid
                FROM public.admission_fee_structure_items fsi
               WHERE fsi.fee_structure_id = v_old_structure_id
              UNION ALL
              SELECT fsi.billing_category_id,
                     NULL::numeric,
                     fsi.amount,
                     NULL::numeric
                FROM public.admission_fee_structure_items fsi
               WHERE fsi.fee_structure_id = v_new_structure_id
              UNION ALL
              -- paid_amount_so_far per category from existing bills
              SELECT b.item_category_id,
                     NULL::numeric,
                     NULL::numeric,
                     b.final_amount - b.balance_amount
                FROM public.billing_student_bills b
               WHERE b.student_id = NEW.id
                 AND b.status <> 'superseded'
                 AND b.item_category_id IS NOT NULL
          ) t
         GROUP BY cat_id
    ) merged;

    -- Note: activity log entry written by service-layer caller per project pattern.
    -- The trigger only writes data; the request-context user (auth.uid) is captured
    -- as requested_by for audit.

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_detect_fee_dimension_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_detect_fee_dimension_change ON public.learners_profiles;
CREATE TRIGGER trg_detect_fee_dimension_change
    AFTER UPDATE ON public.learners_profiles
    FOR EACH ROW EXECUTE FUNCTION public.trigger_detect_fee_dimension_change();
