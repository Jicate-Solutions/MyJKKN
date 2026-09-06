-- =============================================================================
-- 20260904100000_preview_fee_items_fall_through_when_legacy_snapshot_empty.sql
--
-- The Move-to-Account preview said "No fee structure resolves for this
-- learner's dimensions" for learners the commit would have billed.
--
-- WHAT WAS HAPPENING
-- ------------------
-- admission_compute_fee_items_for_learner (the pure resolver behind the
-- admission_preview_account_bills RPC) short-circuited on legacy_fee_mode =
-- true and returned the learner's fee_items snapshot as is. For a learner born
-- legacy with an EMPTY snapshot that is '[]', so the preview rendered zero rows
-- and the dialog disabled Confirm.
--
-- admission_account_transition_with_bills does NOT do that. Since 20260523140000
-- its legacy branch treats an empty snapshot as "flip to matrix mode and
-- resolve" — so Confirm would have generated the bills the preview denied.
-- The preview and the commit had different legacy branches, which is the one
-- thing the preview exists to prevent (see 20260821220000 §1).
--
-- WHY THOSE LEARNERS ARE LEGACY AT ALL
-- ------------------------------------
-- learners_profiles.legacy_fee_mode defaults to true, and the BEFORE INSERT
-- trigger set_legacy_fee_mode_default only clears it when the institution's
-- admission_settings_per_institution.use_fee_structures flag is on. Five
-- colleges with dozens of active structures still had the flag off, so every
-- self-fill enquiry there was born legacy with fee_items = '[]'. Measured on
-- 2026-09-04: 127 pre-account learners in that state with a matching
-- structure, every one of them blocked in the verification dialog. The flag
-- and the rows are corrected in 20260904100100; this file fixes the resolver
-- so the preview is honest whatever the flag says.
--
-- THE CHANGE
-- ----------
-- One branch. A legacy learner WITH a snapshot still returns it untouched
-- (nothing about historic snapshots changes). A legacy learner with a NULL or
-- empty snapshot now falls through to the matrix — the same items the commit
-- resolves after it flips the flag. Still STABLE, still writes nothing.
--
-- Callers: admission_preview_account_bills (preview) and
-- admission_resolve_fee_items_for_lead (persisting wrapper). The wrapper keeps
-- its own "legacy learners are never rewritten" guard, so a legacy learner's
-- fee_items column is still not written by this path.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.proname='admission_compute_fee_items_for_learner') THEN
    RAISE EXCEPTION 'REFUSING: 20260821220000 has not been applied.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.admission_compute_fee_items_for_learner(p_learner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_legacy            boolean;
    v_snapshot          jsonb;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
    v_year              int := COALESCE(public.fn_learner_year_of_study(p_learner_id), 1);
BEGIN
    SELECT legacy_fee_mode, fee_items INTO v_legacy, v_snapshot
      FROM public.learners_profiles WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    -- A legacy learner WITH a snapshot keeps it; the matrix is not consulted.
    -- A legacy learner with an EMPTY snapshot falls through to the matrix,
    -- which is exactly what admission_account_transition_with_bills does on
    -- Confirm (20260523140000): it flips legacy_fee_mode and resolves. Until
    -- 20260904 this branch returned '[]' for that case, so the preview said
    -- "no fee structure resolves" for a learner the commit would have billed.
    IF v_legacy = true
       AND v_snapshot IS NOT NULL
       AND jsonb_array_length(v_snapshot) > 0 THEN
        RETURN v_snapshot;
    END IF;

    v_structure_id := public.admission_match_fee_structure_for_learner(p_learner_id);
    IF v_structure_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',           fsi.billing_category_id,
                'category_name',         bc.category_name,
                'amount',                fsi.amount,
                'source',                'structure',
                'fee_structure_id',      fsi.fee_structure_id,
                'fee_structure_item_id', fsi.id)
              ORDER BY fsi.sort_order)
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
               'category_name',         item->>'category_name',
               'amount',                GREATEST(0, (item->>'amount')::numeric
                                          + COALESCE(pc.delta_sum, 0)),
               'source',                item->>'source',
               'fee_structure_id',      item->>'fee_structure_id',
               'fee_structure_item_id', item->>'fee_structure_item_id'))
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
                'category_name',         'Global Adjustment',
                'amount',                v_global_deltas_sum,
                'source',                'adjustment_global',
                'fee_structure_id',      NULL,
                'fee_structure_item_id', NULL));
    END IF;

    RETURN v_resolved;
END;
$function$;

COMMENT ON FUNCTION public.admission_compute_fee_items_for_learner(uuid) IS
  'Pure fee-item resolution for a learner — computes, never writes. The persisting wrapper is admission_resolve_fee_items_for_lead. A legacy learner with a non-empty snapshot returns it as is; a legacy learner with an empty snapshot falls through to the matrix, mirroring the auto-resolve in admission_account_transition_with_bills so the preview equals the commit.';

REVOKE ALL ON FUNCTION public.admission_compute_fee_items_for_learner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_compute_fee_items_for_learner(uuid)
  TO authenticated, service_role;
