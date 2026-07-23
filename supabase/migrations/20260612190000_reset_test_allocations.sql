-- =============================================================================
-- Reset TEST room allocations (user decision 2026-06-12)
--
-- The 67 hostel_allocations rows (66 active across Girls Hostel A/C + 1
-- rejected) were test data; operators will start real allocation fresh.
-- All four FK-dependent tables (hostel_deposits, hostel_vacate_requests,
-- hostel_premium_invites, hostel_cleaning_bookings) were verified EMPTY.
--
-- Scope (user decisions):
--   * delete all hostel_allocations + hostel_waitlist rows (backed up first)
--   * free the occupied/reserved beds
--   * clear allocation-stamped room/mess categories for ONLY the learners who
--     had an allocation, then re-run the fee-band write-back so band-derived
--     categories re-stamp (allocation-derived ones disappear)
--   * billing left COMPLETELY untouched (10 hostel bills carry real receipts)
--
-- Restore path: _bak_hostel_allocations_20260612 / _bak_hostel_waitlist_20260612
-- / _bak_learner_categories_20260612 hold the pre-reset rows.
-- =============================================================================

-- 1) Backups ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bak_hostel_allocations_20260612 AS
  SELECT * FROM public.hostel_allocations;

CREATE TABLE IF NOT EXISTS public._bak_hostel_waitlist_20260612 AS
  SELECT * FROM public.hostel_waitlist;

CREATE TABLE IF NOT EXISTS public._bak_learner_categories_20260612 AS
  SELECT lp.id AS learner_id, lp.hostel_category_id, lp.mess_category_id, now() AS backed_up_at
  FROM public.learners_profiles lp
  WHERE EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    JOIN public.profiles p ON p.id = a.learner_id
    WHERE p.learner_id = lp.id
  );

-- 2) Free beds (before deleting allocations so the scope is still derivable) ---
UPDATE public.hostel_beds b
   SET status = 'available', current_occupant_id = NULL
 WHERE b.status IN ('occupied','reserved')
   AND (b.id IN (SELECT bed_id FROM public.hostel_allocations WHERE bed_id IS NOT NULL)
     OR b.id IN (SELECT held_bed_id FROM public.hostel_waitlist WHERE held_bed_id IS NOT NULL));

-- 3) Clear allocation-stamped categories for the allocated learners only -------
UPDATE public.learners_profiles lp
   SET hostel_category_id = NULL, mess_category_id = NULL, updated_at = now()
 WHERE EXISTS (
   SELECT 1 FROM public.hostel_allocations a
   JOIN public.profiles p ON p.id = a.learner_id
   WHERE p.learner_id = lp.id
 );

-- 4) Delete the test rows -------------------------------------------------------
DELETE FROM public.hostel_waitlist;
DELETE FROM public.hostel_allocations;

-- 5) Re-stamp fee-band-derived categories (allocation-derived are gone) ---------
SELECT public.fn_apply_hostel_fee_categories_bulk(NULL);
