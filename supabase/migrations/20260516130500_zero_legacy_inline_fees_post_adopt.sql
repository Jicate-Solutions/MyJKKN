-- ============================================================================
-- 20260516130500 — Zero legacy inline fee columns for adopted learners
-- ============================================================================
-- Phase 7. After Phase 6 adopted ~347 rows onto the matrix-driven fee_items
-- JSONB, the legacy numeric fee columns (application_fee, tuition_fee, ...)
-- on those same rows still hold their old values. The Finance detail tab in
-- learner-detail.tsx:806-833 renders BOTH fee_items AND the legacy columns
-- additively — so leaving the old numerics in place causes fees to double-show
-- on the detail tab.
--
-- This migration zeros the 9 legacy fee columns on rows that:
--   (a) were in the Phase 6a snapshot (so we have rollback data),
--   (b) are now non-legacy (legacy_fee_mode=false), i.e. successfully adopted,
--   (c) have a non-empty fee_items (resolved fees exist), and
--   (d) actually have at least one non-zero legacy column (avoid no-op UPDATEs
--       and unnecessary trigger fires).
--
-- The snapshot preserves the pre-zeroing values; a single rollback statement
-- (from the snapshot back into learners_profiles) restores them if needed.
-- ============================================================================

UPDATE public.learners_profiles lp
   SET application_fee         = 0,
       university_reg_fee      = 0,
       tuition_fee             = 0,
       hostel_fee              = 0,
       dayscholar_fee          = 0,
       uniform_fee             = 0,
       hospital_training_fee   = 0,
       placement_fee           = 0,
       transport_fee           = 0,
       updated_at              = now()
 WHERE lp.id IN (SELECT id FROM public.learners_profiles_fee_backfill_snapshot_20260516)
   AND lp.legacy_fee_mode = false
   AND jsonb_array_length(lp.fee_items) > 0
   AND (
       COALESCE(lp.application_fee, 0)        > 0 OR
       COALESCE(lp.university_reg_fee, 0)     > 0 OR
       COALESCE(lp.tuition_fee, 0)            > 0 OR
       COALESCE(lp.hostel_fee, 0)             > 0 OR
       COALESCE(lp.dayscholar_fee, 0)         > 0 OR
       COALESCE(lp.uniform_fee, 0)            > 0 OR
       COALESCE(lp.hospital_training_fee, 0)  > 0 OR
       COALESCE(lp.placement_fee, 0)          > 0 OR
       COALESCE(lp.transport_fee, 0)          > 0
   );
