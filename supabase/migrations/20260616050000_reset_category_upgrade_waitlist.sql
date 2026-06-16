-- =============================================================================
-- Reset the category-upgrade waiting list (user decision 2026-06-16)
--
-- The whole hostel_waitlist table is currently category-upgrade holds only
-- (entry_kind='upgrade'); there are no normal allocation-queue rows. State at
-- reset time: 72 'waiting' (each holding a 'reserved' bed + a staged
-- learners_profiles.pending_hostel_category_id, no bill) + 33 'declined' (no
-- beds, 8 already-cancelled bills). All 72 active holds are girls -> Premium
-- Room (56 JKKN Dental, 16 JKKN Pharmacy).
--
-- Decision: soft reset of ALL 105 upgrade rows.
--   * release every 'reserved' bed held by a waiting upgrade row
--   * clear the staged pending_hostel_category_id for those learners
--   * cancel any still-unpaid upgrade bill that carries no receipt (no-op here:
--     the 72 have no bill; the 8 declined bills are already 'cancelled')
--   * set the rows' status to 'expired' (rows kept for audit, not deleted)
--   * active hostel_allocations / current room+bed are LEFT UNTOUCHED — only
--     the pending upgrade is dropped; the learner keeps their existing room.
--
-- This is exactly the unwind that fn_cl_expire_upgrade_holds() performs on the
-- hourly cron, applied to all upgrade rows regardless of hold_expires_at.
--
-- Restore path: _bak_hostel_waitlist_reset_20260616 holds every pre-reset row
-- (old status, held_bed_id, hold_expires_at, upgrade_bill_id, target category);
-- _bak_learner_pending_cat_20260616 holds the cleared pending categories.
-- =============================================================================

-- 1) Backups ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._bak_hostel_waitlist_reset_20260616 AS
  SELECT *, now() AS backed_up_at
  FROM public.hostel_waitlist
  WHERE entry_kind = 'upgrade';

CREATE TABLE IF NOT EXISTS public._bak_learner_pending_cat_20260616 AS
  SELECT lp.id AS learner_id, lp.pending_hostel_category_id, now() AS backed_up_at
  FROM public.learners_profiles lp
  WHERE lp.pending_hostel_category_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.hostel_waitlist w
      JOIN public.profiles p ON p.id = w.learner_id
      WHERE p.learner_id = lp.id
        AND w.entry_kind = 'upgrade' AND w.status = 'waiting'
    );

-- 2) Release the beds reserved by waiting upgrade holds ------------------------
UPDATE public.hostel_beds b
   SET status = 'available'
  FROM public.hostel_waitlist w
 WHERE w.entry_kind = 'upgrade' AND w.status = 'waiting'
   AND w.held_bed_id = b.id
   AND b.status = 'reserved';

-- 3) Cancel any still-unpaid upgrade bill with no receipt (mirrors expire) -----
UPDATE public.billing_student_bills bb
   SET status = 'cancelled', updated_at = now()
  FROM public.hostel_waitlist w
 WHERE w.entry_kind = 'upgrade' AND w.status IN ('waiting', 'declined')
   AND w.upgrade_bill_id = bb.id
   AND bb.status = 'unpaid'
   AND NOT EXISTS (SELECT 1 FROM public.billing_receipt_items ri WHERE ri.bill_id = bb.id);

-- 4) Clear the staged pending category for the held learners ------------------
UPDATE public.learners_profiles lp
   SET pending_hostel_category_id = NULL, updated_at = now()
  FROM public.hostel_waitlist w
  JOIN public.profiles p ON p.id = w.learner_id
 WHERE lp.id = p.learner_id
   AND w.entry_kind = 'upgrade' AND w.status = 'waiting'
   AND lp.pending_hostel_category_id = w.target_hostel_category_id;

-- 5) Expire all upgrade rows (kept for audit) --------------------------------
UPDATE public.hostel_waitlist
   SET status = 'expired', updated_at = now()
 WHERE entry_kind = 'upgrade'
   AND status IN ('waiting', 'declined');
