-- =====================================================================
-- fn_self_leave_upgrade_waitlist: revert the optimistic category flip   2026-06-17
--
-- BUG: when a LEARNER cancels their own upgrade in My Hostel, the function freed
-- the held bed + cancelled the unpaid bill + marked the request 'declined', but
-- never reverted learners_profiles.hostel_category_id. With the optimistic
-- upgrade model (category flips immediately on request), this left the learner
-- stuck on the upgraded category even after cancelling — so My Hostel kept
-- showing the upgrade while the admin waitlist showed it declined (the two views
-- disagreed, and a reload didn't fix it because the DATA was wrong).
--
-- The admin path (fn_cl_admin_cancel_upgrade) already reverts correctly. This
-- brings the learner path to parity: restore from_hostel_category_id (the
-- recorded original) when the learner is still on the target category, else
-- clear any legacy pending flag. Now both cancel paths converge to the same
-- state, so either side reflects the cancellation on refetch.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_self_leave_upgrade_waitlist(p_target_category_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_lp uuid := get_my_learner_id(); v_from uuid; v_found boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Original category recorded on the optimistic flip (latest waiting hold).
  SELECT from_hostel_category_id INTO v_from
    FROM hostel_waitlist
   WHERE learner_id = auth.uid() AND entry_kind='upgrade'
     AND target_hostel_category_id = p_target_category_id AND status='waiting'
     AND from_hostel_category_id IS NOT NULL
   ORDER BY updated_at DESC LIMIT 1;

  -- Release any reserved bed.
  UPDATE hostel_beds b SET status='available'
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.held_bed_id = b.id AND b.status='reserved';

  -- Cancel the unpaid upgrade bill (only if nothing paid against it).
  UPDATE billing_student_bills bb SET status='cancelled', updated_at=now()
    FROM hostel_waitlist w
   WHERE w.learner_id = auth.uid() AND w.entry_kind='upgrade'
     AND w.target_hostel_category_id = p_target_category_id AND w.status='waiting'
     AND w.upgrade_bill_id = bb.id AND bb.status='unpaid'
     AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = bb.id);

  -- Decline the request.
  UPDATE hostel_waitlist
     SET status='declined', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE learner_id = auth.uid() AND entry_kind = 'upgrade'
     AND target_hostel_category_id = p_target_category_id AND status = 'waiting';
  v_found := FOUND;

  -- Revert the optimistic category flip (parity with fn_cl_admin_cancel_upgrade).
  IF v_lp IS NOT NULL THEN
    IF v_from IS NOT NULL THEN
      UPDATE learners_profiles
         SET hostel_category_id = v_from, pending_hostel_category_id = NULL, updated_at=now()
       WHERE id = v_lp AND hostel_category_id = p_target_category_id;
    ELSE
      UPDATE learners_profiles SET pending_hostel_category_id = NULL, updated_at=now()
       WHERE id = v_lp AND pending_hostel_category_id = p_target_category_id;
    END IF;
  END IF;

  RETURN v_found;
END $$;
