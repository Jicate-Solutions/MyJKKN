-- Approving a regularization stamps the attendance day IN THE DATABASE.
--
-- Until now the stamp lived only in the browser: approveRequest() marked the
-- request approved, then best-effort wrote hr_attendance_records from the
-- client, inside a try/catch that swallowed every failure. That made the most
-- important half of an approval the least reliable half — it silently did
-- nothing when the approver had no hr_staff_details row, when the month was
-- closed, when staff RLS hid the embed, and (repeatedly, in testing) when the
-- open browser was still running a bundle from before the last fix. In every
-- case the request read "approved" while the report kept the old verdict.
--
-- This mirrors the module's own precedent: leave approval has recomputed
-- attendance from a SECURITY DEFINER AFTER-UPDATE trigger
-- (tr_recompute_attendance_on_leave_approval) since 20260429000001. A
-- regularization is the same kind of event and now works the same way, so the
-- stamp cannot be skipped by any client, stale or otherwise.
--
-- BEHAVIOUR
--   * fires only on the transition INTO 'approved', like the leave trigger;
--   * existing day  -> UPDATE in place. Punches are preserved unless the
--     request actually proposed new ones (a status-only correction must not
--     blank real biometric times);
--   * no row yet    -> INSERT, resolving hr_organization_id from
--     hr_staff_details and falling back to the staff member's institution
--     (unique per hr_organizations). If neither resolves, skip rather than
--     guess an organisation;
--   * audit-logged into hr_attendance_audit_log, same shape as the leave path;
--   * a CLOSED month still refuses: trg_har_block_locked_period raises P0001,
--     which now aborts the approval itself rather than being swallowed. That is
--     the correct outcome — an approval whose effect cannot land should not be
--     recorded as approved.

CREATE OR REPLACE FUNCTION public.fn_stamp_attendance_on_regularization_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status_id  uuid;
  v_staff      record;
  v_org_id     uuid;
  v_record_id  uuid;
  v_reason     text;
  v_event_id   uuid := gen_random_uuid();
BEGIN
  IF NOT (TG_OP = 'UPDATE'
          AND NEW.status = 'approved'
          AND COALESCE(OLD.status, '') <> 'approved') THEN
    RETURN NEW;
  END IF;

  -- What the day should become: the proposed status, else REGULARIZED.
  v_status_id := NEW.proposed_status_type_id;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id
      FROM public.hr_attendance_status_types
     WHERE code = 'REGULARIZED'
     LIMIT 1;
  END IF;
  IF v_status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.institution_id INTO v_staff
    FROM public.staff s
   WHERE s.id = NEW.employee_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(rc.label, NEW.reason_text, '') INTO v_reason
    FROM (SELECT 1) x
    LEFT JOIN public.hr_regularization_reasons rc ON rc.id = NEW.reason_code_id;

  SELECT id INTO v_record_id
    FROM public.hr_attendance_records
   WHERE employee_id = NEW.employee_id
     AND work_date   = NEW.for_date;

  IF FOUND THEN
    INSERT INTO public.hr_attendance_audit_log (
      attendance_record_id, employee_id, institution_id, actor_id, action,
      before_state, after_state, reason, created_at
    )
    SELECT r.id, r.employee_id, r.institution_id, NEW.approver_id, 'recompute',
           jsonb_build_object('status_type_id', r.status_type_id, 'source', r.source),
           jsonb_build_object('status_type_id', v_status_id, 'source', 'regularization',
                              'event_id', v_event_id, 'regularization_id', NEW.id),
           left('Regularization approved: ' || v_reason, 500),
           now()
      FROM public.hr_attendance_records r
     WHERE r.id = v_record_id;

    UPDATE public.hr_attendance_records
       SET status_type_id = v_status_id,
           source         = 'regularization',
           -- COALESCE, not assignment: a status-only request proposes no times
           -- and must leave the real punches alone.
           in_at          = COALESCE(NEW.proposed_in_at,  in_at),
           out_at         = COALESCE(NEW.proposed_out_at, out_at),
           reconciled_by  = NEW.approver_id,
           reconciled_at  = COALESCE(NEW.approved_at, now()),
           recomputed_from_event_id = v_event_id,
           notes          = left('Regularized: ' || v_reason, 500),
           updated_at     = now()
     WHERE id = v_record_id;

    RETURN NEW;
  END IF;

  -- No row for that day yet — insert one. hr_organization_id is NOT NULL, and
  -- ~197 active staff have no hr_staff_details row, so fall back to the
  -- institution mapping before giving up.
  SELECT d.hr_organization_id INTO v_org_id
    FROM public.hr_staff_details d
   WHERE d.staff_id = NEW.employee_id;

  IF v_org_id IS NULL AND v_staff.institution_id IS NOT NULL THEN
    SELECT o.id INTO v_org_id
      FROM public.hr_organizations o
     WHERE o.institution_id = v_staff.institution_id
     LIMIT 1;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.hr_attendance_records (
    employee_id, hr_organization_id, institution_id, work_date, status_type_id,
    source, in_at, out_at, reconciled_by, reconciled_at,
    recomputed_from_event_id, notes
  ) VALUES (
    NEW.employee_id, v_org_id, v_staff.institution_id, NEW.for_date, v_status_id,
    'regularization', NEW.proposed_in_at, NEW.proposed_out_at,
    NEW.approver_id, COALESCE(NEW.approved_at, now()),
    v_event_id, left('Regularized: ' || v_reason, 500)
  );

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tr_stamp_attendance_on_regularization_approval
  ON public.hr_attendance_regularizations;
CREATE TRIGGER tr_stamp_attendance_on_regularization_approval
  AFTER UPDATE OF status ON public.hr_attendance_regularizations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_stamp_attendance_on_regularization_approval();

COMMENT ON FUNCTION public.fn_stamp_attendance_on_regularization_approval() IS
  'Writes hr_attendance_records when a regularization is approved. Replaces the client-side best-effort stamp in regularization-service.ts, which silently skipped whenever the approver lacked hr_staff_details, the month was closed, or the browser held a stale bundle.';
