-- Facilitator bulk On-Duty: a staff member holding
-- learners.leave_onduty.apply_bulk raises On-Duty for many learners of their
-- OWN institution at once. Each learner gets a normal leave_onduty_applications
-- row (own department / residency approval chain, attendance stamping, reports
-- all unchanged); leave_onduty_batches only groups them for display and for
-- one-click batch approval.
--
-- Writes go through SECURITY DEFINER RPCs that check auth.uid() themselves.
-- The permission key is NOT granted to any role here: grant it in Role
-- Management (super admin passes the check).

CREATE TABLE IF NOT EXISTS public.leave_onduty_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  leave_type_id  uuid NOT NULL REFERENCES public.learner_leave_types(id),
  title          text NOT NULL CHECK (btrim(title) <> ''),
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_onduty_batches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_lob_institution ON public.leave_onduty_batches (institution_id);
CREATE INDEX IF NOT EXISTS idx_lob_leave_type  ON public.leave_onduty_batches (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_lob_created_by  ON public.leave_onduty_batches (created_by);

ALTER TABLE public.leave_onduty_applications
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.leave_onduty_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loa_batch ON public.leave_onduty_applications (batch_id) WHERE batch_id IS NOT NULL;

-- Read-only via RLS. A caller sees a batch when they created it, hold
-- institution access, or can already see (under applications' own RLS) at
-- least one application in it -- that last branch lets HODs / Principals /
-- learners see the batch title without a broad institution grant.
CREATE POLICY lob_select ON public.leave_onduty_batches
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR (SELECT public.is_super_admin())
    OR (SELECT public.role_has_institution_access(institution_id))
    OR EXISTS (SELECT 1 FROM public.leave_onduty_applications a WHERE a.batch_id = leave_onduty_batches.id)
  );

-- ---------------------------------------------------------------------------
-- fn_lo_bulk_create
-- p_items: [{ "learner_id": uuid, "selected_periods": [text...] }, ...]
-- Returns { batch_id, created, skipped, results: [{learner_id, application_id?, status, reason?}] }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_lo_bulk_create(
  p_leave_type_id   uuid,
  p_title           text,
  p_start_date      date,
  p_end_date        date,
  p_period_type     text,
  p_reason          text,
  p_attachment_url  text,
  p_items           jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_inst    uuid;
  v_type    public.learner_leave_types%ROWTYPE;
  v_batch   uuid;
  v_days    integer;
  v_item    jsonb;
  v_lp      record;
  v_hostel  boolean;
  v_app     uuid;
  v_seeded  integer;
  v_created integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_lid     uuid;
  v_reason  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT ((SELECT public.user_has_permission('learners.leave_onduty.apply_bulk'))
          OR (SELECT public.is_super_admin())) THEN
    RAISE EXCEPTION 'You do not have permission to apply on behalf of learners' USING ERRCODE = '42501';
  END IF;

  SELECT institution_id INTO v_inst FROM public.profiles WHERE id = v_uid AND is_active;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'Your account is not linked to an institution' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Select at least one learner' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 300 THEN
    RAISE EXCEPTION 'A batch can hold at most 300 learners' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Please give the event a name' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Please provide a reason' USING ERRCODE = '22023';
  END IF;
  IF p_period_type NOT IN ('fullday', 'forenoon', 'afternoon') THEN
    RAISE EXCEPTION 'Bulk applications support full day, forenoon or afternoon only' USING ERRCODE = '22023';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Invalid date range' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_type FROM public.learner_leave_types WHERE id = p_leave_type_id;
  IF NOT FOUND OR NOT v_type.is_active OR v_type.category::text <> 'onduty' THEN
    RAISE EXCEPTION 'Please choose an active On-Duty type' USING ERRCODE = '22023';
  END IF;

  v_days := (p_end_date - p_start_date) + 1;
  IF v_type.max_duration_days IS NOT NULL AND v_days > v_type.max_duration_days THEN
    RAISE EXCEPTION '"%" allows at most % day(s); you asked for %', v_type.name, v_type.max_duration_days, v_days
      USING ERRCODE = '22023';
  END IF;
  IF p_period_type IN ('forenoon', 'afternoon') AND NOT v_type.allow_half_day THEN
    RAISE EXCEPTION '"%" does not allow half-day applications', v_type.name USING ERRCODE = '22023';
  END IF;
  IF v_type.advance_notice_hours > 0
     AND (p_start_date - (now() AT TIME ZONE 'Asia/Kolkata')::date) < ceil(v_type.advance_notice_hours / 24.0)::int THEN
    RAISE EXCEPTION '"%" must be applied at least % hour(s) in advance', v_type.name, v_type.advance_notice_hours
      USING ERRCODE = '22023';
  END IF;
  IF v_type.requires_attachment AND btrim(coalesce(p_attachment_url, '')) = '' THEN
    RAISE EXCEPTION '"%" requires a supporting document', v_type.name USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.leave_onduty_batches (institution_id, leave_type_id, title, created_by)
  VALUES (v_inst, p_leave_type_id, btrim(p_title), v_uid)
  RETURNING id INTO v_batch;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_lid := NULLIF(v_item->>'learner_id', '')::uuid;
    v_reason := NULL;

    SELECT lp.id, lp.institution_id, lp.department_id, lp.semester_id, lp.section_id,
           lp.lifecycle_status::text AS lifecycle_status
      INTO v_lp
    FROM public.learners_profiles lp WHERE lp.id = v_lid;

    IF NOT FOUND THEN
      v_reason := 'Learner not found';
    ELSIF v_lp.institution_id IS DISTINCT FROM v_inst THEN
      v_reason := 'Learner belongs to another institution';
    ELSIF v_lp.lifecycle_status IS DISTINCT FROM 'active' THEN
      v_reason := 'Learner is not active';
    ELSIF v_lp.section_id IS NULL OR v_lp.semester_id IS NULL THEN
      v_reason := 'Learner has no section / semester';
    ELSIF EXISTS (
      SELECT 1 FROM public.leave_onduty_applications a
      WHERE a.learner_id = v_lid
        AND a.category::text = 'onduty'
        AND a.status::text IN ('pending', 'approved')
        AND a.start_date <= p_end_date AND a.end_date >= p_start_date
    ) THEN
      v_reason := 'Already has an On-Duty application for these dates';
    ELSE
      SELECT (
          EXISTS (SELECT 1 FROM public.learners_profiles l2
                  JOIN public.accommodation_types at ON at.id = l2.accommodation_type_id
                  WHERE l2.id = v_lid AND lower(at.name) = 'hostel')
          OR EXISTS (SELECT 1 FROM public.hostel_allocations ha
                     JOIN public.profiles p ON p.id = ha.learner_id
                     WHERE p.learner_id = v_lid AND ha.status = 'active')
        ) INTO v_hostel;

      IF v_type.residency::text = 'hostel' AND NOT v_hostel THEN
        v_reason := 'Type is for hostel learners only';
      ELSIF v_type.residency::text = 'day_scholar' AND v_hostel THEN
        v_reason := 'Type is for day scholars only';
      END IF;
    END IF;

    IF v_reason IS NULL THEN
      BEGIN
        INSERT INTO public.leave_onduty_applications (
          learner_id, institution_id, department_id, semester_id, section_id,
          category, sub_category, leave_type_id, start_date, end_date, period_type,
          selected_periods, reason, attachment_url, status, applicable_type,
          current_step, sponsor_id, sponsor_approval_status, sponsor_action_at, batch_id
        ) VALUES (
          v_lid, v_inst, v_lp.department_id, v_lp.semester_id, v_lp.section_id,
          'onduty', v_type.code, v_type.id, p_start_date, p_end_date, p_period_type::public.period_type,
          coalesce(v_item->'selected_periods', '[]'::jsonb), btrim(p_reason), nullif(btrim(coalesce(p_attachment_url, '')), ''),
          'pending', 'individual', 1,
          -- The facilitator is the sponsor: sponsor-gated types are pre-approved.
          CASE WHEN v_type.requires_sponsor_approval THEN v_uid END,
          CASE WHEN v_type.requires_sponsor_approval THEN 'approved' END,
          CASE WHEN v_type.requires_sponsor_approval THEN now() END,
          v_batch
        ) RETURNING id INTO v_app;

        v_seeded := public._fn_lo_seed_steps(v_app);
        IF coalesce(v_seeded, 0) = 0 THEN
          RAISE EXCEPTION 'No approver chain could be built';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_reason := SQLERRM;
        v_app := NULL;
      END;
    END IF;

    IF v_reason IS NULL THEN
      v_created := v_created + 1;
      v_results := v_results || jsonb_build_object('learner_id', v_lid, 'application_id', v_app, 'status', 'created');
    ELSE
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('learner_id', v_lid, 'status', 'skipped', 'reason', v_reason);
    END IF;
  END LOOP;

  IF v_created = 0 THEN
    -- Nothing to group: drop the empty batch instead of leaving it behind.
    DELETE FROM public.leave_onduty_batches WHERE id = v_batch;
    v_batch := NULL;
  END IF;

  RETURN jsonb_build_object('batch_id', v_batch, 'created', v_created, 'skipped', v_skipped, 'results', v_results);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_lo_bulk_create(uuid, text, date, date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_bulk_create(uuid, text, date, date, text, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- fn_lo_decide_batch: approve / reject every application in a batch that the
-- caller can act on at its current step. Others are left untouched (a HOD only
-- moves their own department's learners).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_lo_decide_batch(
  p_batch_id uuid,
  p_action   text,
  p_comments text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_super   boolean := (SELECT public.is_super_admin());
  a         record;
  v_actioned integer := 0;
  v_failed   integer := 0;
  v_other    integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action' USING ERRCODE = '22023';
  END IF;

  FOR a IN
    SELECT app.id,
           (v_super OR EXISTS (
              SELECT 1 FROM public.leave_onduty_approvals ap
              WHERE ap.application_id = app.id
                AND ap.step_order = app.current_step
                AND ap.status = 'pending'
                AND public.fn_lo_can_act(ap.id))) AS can_act
    FROM public.leave_onduty_applications app
    WHERE app.batch_id = p_batch_id
      AND app.status = 'pending'
      AND coalesce(app.current_step, 0) >= 1
    ORDER BY app.created_at
  LOOP
    IF NOT a.can_act THEN
      v_other := v_other + 1;
      CONTINUE;
    END IF;
    BEGIN
      PERFORM public.fn_lo_decide(a.id, p_action, p_comments);
      v_actioned := v_actioned + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('actioned', v_actioned, 'not_yours', v_other, 'failed', v_failed);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_lo_decide_batch(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lo_decide_batch(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
