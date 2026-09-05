-- fn_auto_allocate_classic: correct the batch audit note.
--
-- Companion to 20260905102726_cl_auto_allocation_cohort_widen.sql. This
-- function has NO lifecycle predicate of its own -- it delegates the cohort
-- entirely to fn_auto_allocate_plan -- so it is not part of the widening.
-- What it did have was a hardcoded note written into
-- hostel_allocation_batches.notes claiming "Cohort: lifecycle_status = active
-- only.", which became false the moment the plan widened. That note is a
-- permanent audit record shown to the operator, so leaving it would write a
-- lie into every future batch. It now reads the roster statuses at runtime.
--
-- Separate migration because it is a message change, not a behaviour change:
-- reverting it must not drag the cohort back with it.

-- ---------------------------------------------------------------------------
-- fn_auto_allocate_classic -- correct the audit note
-- ---------------------------------------------------------------------------
-- This function has no lifecycle predicate of its own; it delegates the cohort
-- entirely to fn_auto_allocate_plan. But the note it writes into
-- hostel_allocation_batches.notes claimed "Cohort: lifecycle_status = active
-- only.", which is now false. That note is a permanent audit record shown to
-- the operator, so leaving it would put a lie in the batch history.
CREATE OR REPLACE FUNCTION public.fn_auto_allocate_classic(p_hostel_type text, p_hostel_year_id uuid DEFAULT NULL::uuid, p_strict boolean DEFAULT true, p_institution_id uuid DEFAULT NULL::uuid, p_program_id uuid DEFAULT NULL::uuid, p_semester_id uuid DEFAULT NULL::uuid, p_allow_overflow boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch uuid; v_tier uuid; v_actor uuid := auth.uid();
  v_alloc int := 0; v_skip int := 0; v_overflow int := 0;
  v_year uuid; v_mess uuid; pl record;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('campus_living.allocations.create')) THEN
    RAISE EXCEPTION 'Not authorized to run auto-allocation';
  END IF;

  IF p_hostel_type IS NULL OR p_hostel_type NOT IN ('boys','girls') THEN
    RAISE EXCEPTION 'Hostel type must be boys or girls';
  END IF;

  v_year := COALESCE(p_hostel_year_id, (SELECT id FROM hostel_years WHERE is_current LIMIT 1));
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'No current hostel year is set — mark one under Campus Living → Settings → Hostel Years';
  END IF;

  SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND institution_id IS NULL AND is_active LIMIT 1;
  IF v_tier IS NULL THEN SELECT id INTO v_tier FROM hostel_tier_policy WHERE tier_key='standard' AND is_active LIMIT 1; END IF;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'No standard tier policy found'; END IF;

  INSERT INTO hostel_allocation_batches (block_id, category_id, hostel_year_id, status, created_by)
  VALUES (NULL, NULL, v_year, 'pending_approval', v_actor)
  RETURNING id INTO v_batch;

  FOR pl IN
    SELECT * FROM fn_auto_allocate_plan(
      p_hostel_type, p_strict, p_institution_id, p_program_id, p_semester_id, p_allow_overflow)
  LOOP
    IF pl.plan_bed_id IS NULL THEN v_skip := v_skip + 1; CONTINUE; END IF;
    IF pl.plan_tier = 2 THEN v_overflow := v_overflow + 1; END IF;

    INSERT INTO hostel_allocations (
      institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
      allocation_type, allocation_date, status,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
      tier_id, batch_id, allocated_by, warden_id
    ) VALUES (
      pl.plan_institution_id, pl.plan_profile_id, pl.plan_block_id, pl.plan_room_id, pl.plan_bed_id,
      pl.plan_academic_year_id, pl.plan_semester_id,
      'fresh', CURRENT_DATE, 'pending_approval', '', '', '',
      v_tier, v_batch, v_actor,
      (SELECT user_id FROM user_block_access WHERE block_id = pl.plan_block_id AND revoked_at IS NULL LIMIT 1)
    );

    v_mess := pl.plan_mess_category_id;
    UPDATE learners_profiles
      SET hostel_category_id = pl.plan_room_category_id,
          mess_category_id   = COALESCE(v_mess, mess_category_id),
          updated_at = now()
      WHERE id = pl.plan_lp_id;

    v_alloc := v_alloc + 1;
  END LOOP;

  UPDATE hostel_allocation_batches
    SET allocated_count = v_alloc, skipped_count = v_skip,
        notes = format('%s allocated across all %s blocks (%s physical mode; rules-driven category + mess; block and room decided by the physical-room rules). %s of them overflowed into UNRESERVED rooms of their own category because every room reserved for their cohort was full (%s). %s skipped (no free bed they can occupy / reserved rooms hold no space for them / gender / no academic year). Strict: learners with no rule-resolved room category are excluded. Cohort: lifecycle_status in (%s); learners with no login profile are excluded automatically.',
                       v_alloc, p_hostel_type,
                       CASE WHEN p_strict THEN 'STRICT — only cohorts matching a physical rule' ELSE 'open — rule-free rooms shared' END,
                       v_overflow,
                       CASE WHEN p_allow_overflow THEN 'overflow ON; category never changed, no other cohort''s reserved room used' ELSE 'overflow OFF' END,
                       v_skip,
                       array_to_string(public.fn_cl_roster_statuses(), ', '))
    WHERE id = v_batch;

  RETURN v_batch;
END
$function$;
