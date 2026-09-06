-- Admin-triggered cancel of a waiting/offered upgrade request: full revert (restore original
-- category, free reserved bed, cancel unpaid bill) + mark the request 'cancelled'. The manual
-- twin of fn_cl_expire_upgrade_holds, gated on campus_living.allocations.edit and institution access.
CREATE OR REPLACE FUNCTION public.fn_cl_admin_cancel_upgrade(p_waitlist_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_w hostel_waitlist%ROWTYPE;
  v_lp uuid;
  v_reverted boolean := false;
BEGIN
  IF NOT public.user_has_permission('campus_living.allocations.edit') THEN
    RAISE EXCEPTION 'permission denied: campus_living.allocations.edit' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_w FROM hostel_waitlist WHERE id = p_waitlist_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Waitlist entry not found'; END IF;
  IF v_w.entry_kind <> 'upgrade' THEN RAISE EXCEPTION 'Only upgrade requests can be cancelled here'; END IF;
  IF v_w.status NOT IN ('waiting','offered') THEN RAISE EXCEPTION 'Only an active (waiting/offered) request can be cancelled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_user_accessible_institutions(auth.uid()) g WHERE g.institution_id = v_w.institution_id) THEN
    RAISE EXCEPTION 'You do not have access to this institution''s waitlist' USING ERRCODE='42501';
  END IF;

  SELECT lp.id INTO v_lp FROM profiles p JOIN learners_profiles lp ON lp.id = p.learner_id WHERE p.id = v_w.learner_id;

  IF v_lp IS NOT NULL THEN
    IF v_w.from_hostel_category_id IS NOT NULL THEN
      UPDATE learners_profiles
         SET hostel_category_id = v_w.from_hostel_category_id, pending_hostel_category_id = NULL, updated_at=now()
       WHERE id = v_lp AND hostel_category_id = v_w.target_hostel_category_id;
      v_reverted := FOUND;
    ELSE
      UPDATE learners_profiles SET pending_hostel_category_id = NULL, updated_at=now()
       WHERE id = v_lp AND pending_hostel_category_id = v_w.target_hostel_category_id;
    END IF;
  END IF;

  IF v_w.held_bed_id IS NOT NULL THEN
    UPDATE hostel_beds SET status='available' WHERE id = v_w.held_bed_id AND status='reserved';
  END IF;

  IF v_w.upgrade_bill_id IS NOT NULL THEN
    UPDATE billing_student_bills SET status='cancelled', updated_at=now()
     WHERE id = v_w.upgrade_bill_id AND status='unpaid'
       AND NOT EXISTS (SELECT 1 FROM billing_receipt_items ri WHERE ri.bill_id = v_w.upgrade_bill_id);
  END IF;

  UPDATE hostel_waitlist
     SET status='cancelled', held_room_id=NULL, held_bed_id=NULL, hold_expires_at=NULL, updated_at=now()
   WHERE id = p_waitlist_id;

  RETURN jsonb_build_object('success', true, 'waitlist_id', p_waitlist_id, 'category_reverted', v_reverted);
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_cancel_upgrade(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cl_admin_cancel_upgrade(uuid) TO authenticated;
