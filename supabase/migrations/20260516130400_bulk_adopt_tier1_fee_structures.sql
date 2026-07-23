-- ============================================================================
-- 20260516130400 — Bulk adopt fee structures for admitted+legacy tier1 rows
-- ============================================================================
-- Phase 6b. Iterates the vw_learners_profile_fee_backfill_status view's
-- 'tier1_ready' rows (admitted+legacy with all 8 fee-matrix dims populated
-- and exactly one matching active fee_structure). For each row, flips
-- legacy_fee_mode=false and calls admission_resolve_fee_items_for_lead which
-- writes the resolved fee_items into the row.
--
-- Safety:
--   - Per-row BEGIN/EXCEPTION/END is a subtransaction. If the resolver
--     unexpectedly returns '[]' (e.g. structure archived between view check
--     and call), the row's legacy_fee_mode flip rolls back. Failure is
--     recorded in learners_profile_fee_backfill_failures and the loop
--     continues.
--   - admission_resolve_fee_items_for_lead is SECURITY DEFINER with no
--     permission gate (unlike admission_adopt_structure_for_lead), so it runs
--     fine from this migration's service-role context.
--
-- We deliberately do NOT process tier2_ready (21 rows) here. Tier 2 rows match
-- the structure when quota_id is dropped — i.e. the learner's quota_id != the
-- structure's quota_id. Adopting them would mean ignoring the learner's quota
-- and applying a different one. That's a per-row business decision; finance
-- staff make it via the "Fees Setup Pending" tab in the UI.
-- ============================================================================

DO $$
DECLARE
    r record;
    v_result jsonb;
    v_count  int := 0;
    v_failed int := 0;
BEGIN
    FOR r IN
        SELECT learner_id, matched_structure_id
          FROM public.vw_learners_profile_fee_backfill_status
         WHERE resolution_status = 'tier1_ready'
    LOOP
        BEGIN
            UPDATE public.learners_profiles
               SET legacy_fee_mode = false,
                   updated_at      = now()
             WHERE id = r.learner_id;

            v_result := public.admission_resolve_fee_items_for_lead(r.learner_id);

            IF jsonb_array_length(v_result) = 0 THEN
                -- Race: structure was archived between view classification and
                -- the resolver call. Trigger EXCEPTION handler to roll back
                -- the legacy_fee_mode flip and log the row for manual triage.
                RAISE EXCEPTION 'resolver_no_match_post_view_classification';
            END IF;
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO public.learners_profile_fee_backfill_failures
                (learner_id, resolution_status, matched_structure_id, sqlstate, error_message)
            VALUES (r.learner_id, 'tier1_ready', r.matched_structure_id, SQLSTATE, SQLERRM);
            v_failed := v_failed + 1;
        END;
    END LOOP;

    RAISE NOTICE 'Tier 1 bulk adopt complete: success=%, failed=%', v_count, v_failed;
END $$;
