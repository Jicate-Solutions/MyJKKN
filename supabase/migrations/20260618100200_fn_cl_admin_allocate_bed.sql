CREATE OR REPLACE FUNCTION public.fn_cl_admin_allocate_bed(
  p_learner_profile_id uuid,
  p_room_id uuid,
  p_bed_id uuid,
  p_mess_category_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_room       hostel_rooms%ROWTYPE;
  v_bed        hostel_beds%ROWTYPE;
  v_profile    uuid;
  v_inst       uuid;
  v_sem        uuid;
  v_ay         uuid;
  v_tier       uuid;
  v_block      uuid;
  v_mapped     boolean;
  v_accessible boolean;
  v_alloc_id   uuid;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('campus_living.upgrades.manage')) THEN
    RAISE EXCEPTION 'Not authorized to allocate hostel rooms' USING ERRCODE = '42501';
  END IF;

  -- learners_profiles → institution / semester / academic year (mirror auto-allocate fallback)
  SELECT lp.institution_id, lp.semester_id,
         COALESCE(lp.academic_year_id,
           (SELECT id FROM academic_years
             WHERE institution_id = lp.institution_id AND is_active
             ORDER BY start_date DESC LIMIT 1))
    INTO v_inst, v_sem, v_ay
  FROM learners_profiles lp WHERE lp.id = p_learner_profile_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'Learner % not found', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;
  IF v_ay IS NULL THEN RAISE EXCEPTION 'No academic year resolved for this learner' USING ERRCODE = 'P0001'; END IF;

  -- bridge to the profiles.id key hostel_allocations uses
  SELECT id INTO v_profile FROM profiles WHERE learner_id = p_learner_profile_id LIMIT 1;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'No profile bridges learner %', p_learner_profile_id USING ERRCODE = 'P0002'; END IF;

  -- fresh-only
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.learner_id = v_profile AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'Learner already has an active allocation — use Change room/bed instead' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_room FROM hostel_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Room % not found', p_room_id USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_bed FROM hostel_beds WHERE id = p_bed_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bed % not found', p_bed_id USING ERRCODE = 'P0002'; END IF;
  IF v_bed.room_id <> p_room_id THEN RAISE EXCEPTION 'Bed does not belong to the selected room' USING ERRCODE = 'P0001'; END IF;
  v_block := v_room.block_id;

  -- institution access (mirror fn_cl_admin_transfer_allocation)
  SELECT EXISTS (SELECT 1 FROM hostel_block_institutions WHERE block_id = v_block) INTO v_mapped;
  IF v_mapped THEN
    SELECT EXISTS (
      SELECT 1 FROM hostel_block_institutions hbi
      WHERE hbi.block_id = v_block
        AND hbi.institution_id IN (SELECT institution_id FROM get_user_accessible_institutions(auth.uid()))
    ) INTO v_accessible;
    IF NOT v_accessible THEN RAISE EXCEPTION 'No access to the target block''s institution' USING ERRCODE = '42501'; END IF;
  END IF;

  -- bed must be free (dedup on allocation existence, matching auto-allocate)
  IF EXISTS (SELECT 1 FROM hostel_allocations a
             WHERE a.bed_id = p_bed_id AND a.status IN ('active','pending_approval') AND a.check_out_date IS NULL) THEN
    RAISE EXCEPTION 'The selected bed is already occupied' USING ERRCODE = '23505';
  END IF;

  -- standard tier policy (mirror auto-allocate)
  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  ) VALUES (
    v_inst, v_profile, v_block, p_room_id, p_bed_id, v_ay, v_sem,
    'fresh', CURRENT_DATE, 'active', '', '', '',
    v_tier, auth.uid()
  ) RETURNING id INTO v_alloc_id;

  -- occupy the bed (immediate-active per design decision)
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile, updated_at=now() WHERE id = p_bed_id;

  -- room category is synced by trg_allocation_sync_learner_categories; honor an explicit mess pick
  IF p_mess_category_id IS NOT NULL THEN
    UPDATE learners_profiles SET mess_category_id = p_mess_category_id, updated_at = now() WHERE id = p_learner_profile_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'allocation_id', v_alloc_id,
                            'room_id', p_room_id, 'bed_id', p_bed_id, 'block_id', v_block);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.fn_cl_admin_allocate_bed(uuid,uuid,uuid,uuid) TO authenticated;
