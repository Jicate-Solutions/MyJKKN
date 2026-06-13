-- Add semester_name to the category-sync preview so the dialog can filter by
-- Institution / Program / Semester. New OUT column => DROP + CREATE.
-- Body otherwise identical to 20260612220000_preview_hostel_fee_category_sync.sql.

DROP FUNCTION IF EXISTS public.fn_preview_hostel_fee_categories(uuid);
CREATE FUNCTION public.fn_preview_hostel_fee_categories(p_institution uuid DEFAULT NULL)
RETURNS TABLE(
  learner_id uuid,
  learner_name text,
  roll_number text,
  institution_name text,
  program_name text,
  semester_name text,
  quota_name text,
  gender text,
  current_year_fee numeric,
  has_academic_bill boolean,
  is_allocated boolean,
  reason text,
  current_room text,
  new_room text,
  current_mess text,
  new_mess text,
  will_change boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_gender_type text; v_fee numeric; v_has_bill boolean; v_allocated boolean;
  v_room uuid; v_mess uuid; v_new_room uuid; v_new_mess uuid; v_reason text;
BEGIN
  -- Same gate as the bulk sync RPC.
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to preview learner category sync'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT lp.id AS lid,
           NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS lname,
           lp.roll_number AS lroll, lp.gender AS lgender,
           lp.hostel_category_id AS cur_room_id, lp.mess_category_id AS cur_mess_id,
           i.name AS inst_name, p.program_name AS prog_name,
           s.semester_name AS sem_name, q.name AS q_name
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id AND acc.code = 'hostel'
    LEFT JOIN institutions i ON i.id = lp.institution_id
    LEFT JOIN programs p ON p.id = lp.program_id
    LEFT JOIN semesters s ON s.id = lp.semester_id
    LEFT JOIN quotas q ON q.id = lp.quota_id
    WHERE lp.lifecycle_status = 'active'
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
    ORDER BY i.name, p.program_name, lname
  LOOP
    v_gender_type := CASE WHEN lower(r.lgender) LIKE 'm%' THEN 'boys'
                          WHEN lower(r.lgender) LIKE 'f%' THEN 'girls' ELSE NULL END;
    v_has_bill := EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id = r.lid AND b.fee_source = 'academic'
        AND b.status NOT IN ('cancelled','superseded'));
    v_fee := fn_learner_current_year_academic_fee(r.lid);
    v_allocated := EXISTS (
      SELECT 1 FROM hostel_allocations ha
      JOIN profiles pr ON pr.id = ha.learner_id
      WHERE pr.learner_id = r.lid AND ha.status = 'active');

    v_room := NULL; v_mess := NULL;

    IF v_has_bill THEN
      -- Band match + gender-name translation (mirrors fn_apply mig 20260612170000).
      SELECT gv.id INTO v_room
      FROM fn_hostel_learner_room_categories(r.lid) rr
      JOIN hostel_categories bc ON bc.id = rr.category_id
      JOIN hostel_categories gv ON gv.name = bc.name
                               AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      SELECT gv.id INTO v_mess
      FROM fn_hostel_learner_mess_categories(r.lid) mm
      JOIN mess_categories bc ON bc.id = mm.category_id
      JOIN mess_categories gv ON gv.name = bc.name
                             AND gv.type = v_gender_type AND gv.is_active
      LIMIT 1;

      IF v_room IS NOT NULL OR v_mess IS NOT NULL THEN
        v_reason := 'band_match';
      ELSIF v_fee IS NULL THEN
        v_reason := 'classic_default_fee_unknown';
      ELSE
        v_reason := 'classic_default_no_band';
      END IF;

      IF v_room IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT hc.id INTO v_room FROM hostel_categories hc
        WHERE hc.name = 'Classic Room' AND hc.type = v_gender_type AND hc.is_active
        ORDER BY hc.sort_order LIMIT 1;
      END IF;
      IF v_mess IS NULL AND v_gender_type IS NOT NULL THEN
        SELECT mc.id INTO v_mess FROM mess_categories mc
        WHERE mc.name = 'Classic' AND mc.type = v_gender_type AND mc.is_active
        ORDER BY mc.sort_order LIMIT 1;
      END IF;
    ELSE
      v_reason := 'no_academic_bill';
    END IF;

    -- Apply rules: allocation-wins (room) + overwrite-never-wipe.
    v_new_room := CASE WHEN v_allocated THEN r.cur_room_id
                       ELSE COALESCE(v_room, r.cur_room_id) END;
    v_new_mess := COALESCE(v_mess, r.cur_mess_id);

    learner_id        := r.lid;
    learner_name      := r.lname;
    roll_number       := r.lroll;
    institution_name  := r.inst_name;
    program_name      := r.prog_name;
    semester_name     := r.sem_name;
    quota_name        := r.q_name;
    gender            := r.lgender;
    current_year_fee  := v_fee;
    has_academic_bill := v_has_bill;
    is_allocated      := v_allocated;
    reason            := v_reason;
    current_room      := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = r.cur_room_id);
    new_room          := (SELECT hc.name FROM hostel_categories hc WHERE hc.id = v_new_room);
    current_mess      := (SELECT mc.name FROM mess_categories mc WHERE mc.id = r.cur_mess_id);
    new_mess          := (SELECT mc.name FROM mess_categories mc WHERE mc.id = v_new_mess);
    will_change       := (v_new_room IS DISTINCT FROM r.cur_room_id)
                      OR (v_new_mess IS DISTINCT FROM r.cur_mess_id);
    RETURN NEXT;
  END LOOP;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_preview_hostel_fee_categories(uuid) TO authenticated;
