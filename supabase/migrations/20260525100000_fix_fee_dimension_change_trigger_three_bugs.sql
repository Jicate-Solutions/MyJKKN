-- ============================================================================
-- 20260525100000 — Fix three bugs in trigger_detect_fee_dimension_change
-- ============================================================================
-- Bug 1: When a pending fee change event already exists and the learner's
--   dimensions change AGAIN, the trigger silently skips. The admin then
--   approves decisions based on stale new_amount values. FIX: update the
--   existing pending event's new_fee_structure_id and re-generate event_lines
--   with correct new amounts.
--
-- Bug 2 (already fixed in 20260507120003 but 04_triggers.sql was stale):
--   Community lookup via junction table (admission_fee_structure_communities).
--
-- Bug 3: When no active bills exist and dimensions change, fee_items on
--   learners_profiles stays stale until the next form submit or account
--   transition. FIX: call admission_resolve_fee_items_for_lead to refresh
--   fee_items immediately, so the profile always reflects the current structure.
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
    v_pending_event_id      uuid;
    v_old_structure_id      uuid;
    v_new_structure_id      uuid;
    v_event_id              uuid;
    v_caller                uuid := auth.uid();
BEGIN
    -- Skip if legacy mode or if legacy_fee_mode itself is what changed
    IF NEW.legacy_fee_mode = true OR NEW.legacy_fee_mode IS DISTINCT FROM OLD.legacy_fee_mode THEN
        RETURN NEW;
    END IF;

    -- Detect which fee-matrix dimension changed (first match wins)
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

    -- ── Bug 3 fix: Always re-resolve fee_items when a dimension changes ──
    -- This ensures the learner profile always shows the correct fee structure,
    -- even if no bills exist yet. The resolve RPC writes to fee_items directly.
    PERFORM public.admission_resolve_fee_items_for_lead(NEW.id);

    -- Check if bills exist — only create/update change events when they do
    SELECT EXISTS (
        SELECT 1 FROM public.billing_student_bills
         WHERE student_id = NEW.id AND status <> 'superseded'
    ) INTO v_has_active_bills;

    IF NOT v_has_active_bills THEN
        -- No bills → fee_items already refreshed above, nothing else to do
        RETURN NEW;
    END IF;

    -- ── Resolve old and new fee structure IDs via community junction ──

    -- OLD structure — match 7 dims + community via junction
    SELECT afs.id INTO v_old_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = OLD.institution_id
       AND afs.degree_id             = OLD.degree_id
       AND afs.department_id         = OLD.department_id
       AND afs.programme_id          = OLD.program_id
       AND afs.quota_id              = OLD.quota_id
       AND afs.accommodation_type_id = OLD.accommodation_type_id
       AND afs.admission_year_id     = OLD.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = OLD.community_category_id
           )
     LIMIT 1;

    -- NEW structure — same shape, learner's NEW dimensions
    SELECT afs.id INTO v_new_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = NEW.institution_id
       AND afs.degree_id             = NEW.degree_id
       AND afs.department_id         = NEW.department_id
       AND afs.programme_id          = NEW.program_id
       AND afs.quota_id              = NEW.quota_id
       AND afs.accommodation_type_id = NEW.accommodation_type_id
       AND afs.admission_year_id     = NEW.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = NEW.community_category_id
           )
     LIMIT 1;

    -- ── Bug 1 fix: If a pending event exists, UPDATE it instead of skipping ──
    SELECT id INTO v_pending_event_id
      FROM public.admission_fee_change_events
     WHERE learner_id = NEW.id AND status = 'pending_review'
     LIMIT 1;

    IF v_pending_event_id IS NOT NULL THEN
        -- Update the existing pending event with the latest change info
        UPDATE public.admission_fee_change_events
           SET trigger_field         = v_changed_field,
               new_fee_structure_id  = v_new_structure_id,
               updated_at            = now()
         WHERE id = v_pending_event_id;

        -- Delete old event lines and regenerate with current amounts
        DELETE FROM public.admission_fee_change_event_lines
         WHERE event_id = v_pending_event_id;

        INSERT INTO public.admission_fee_change_event_lines (
            event_id, billing_category_id, old_amount, new_amount, paid_amount_so_far
        )
        SELECT
            v_pending_event_id,
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
                  -- Old structure items (amounts from the event's stored old_fee_structure_id)
                  SELECT fsi.billing_category_id AS cat_id,
                         fsi.amount AS old_amount,
                         NULL::numeric AS new_amount,
                         NULL::numeric AS paid
                    FROM public.admission_fee_structure_items fsi
                    JOIN public.admission_fee_change_events evt ON evt.id = v_pending_event_id
                   WHERE fsi.fee_structure_id = evt.old_fee_structure_id
                  UNION ALL
                  -- New structure items (from the LATEST new structure)
                  SELECT fsi.billing_category_id,
                         NULL::numeric,
                         fsi.amount,
                         NULL::numeric
                    FROM public.admission_fee_structure_items fsi
                   WHERE fsi.fee_structure_id = v_new_structure_id
                  UNION ALL
                  -- Paid amounts from active bills
                  SELECT b.item_category_id,
                         NULL::numeric,
                         NULL::numeric,
                         b.final_amount - b.balance_amount
                    FROM public.billing_student_bills b
                   WHERE b.student_id = NEW.id
                     AND b.status <> 'superseded'
                     AND b.item_category_id IS NOT NULL
              ) u
             GROUP BY cat_id
        ) g
        WHERE cat_id IS NOT NULL;

        RETURN NEW;
    END IF;

    -- ── No pending event — create a new one ──

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
              SELECT b.item_category_id,
                     NULL::numeric,
                     NULL::numeric,
                     b.final_amount - b.balance_amount
                FROM public.billing_student_bills b
               WHERE b.student_id = NEW.id
                 AND b.status <> 'superseded'
                 AND b.item_category_id IS NOT NULL
          ) u
         GROUP BY cat_id
    ) g
    WHERE cat_id IS NOT NULL;

    RETURN NEW;
END;
$$;
