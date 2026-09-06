-- Enforce the leave approval chain in the database, not only in the service.
--
-- WHAT WAS UNENFORCED. LeaveService.assertCanDecide() checks two things: that
-- you are not deciding your own application, and — only when a step names a
-- specific person — that you are that person. A step routed to a ROLE was never
-- checked at all. Since every seeded flow carries approver_role='hr_approver'
-- and approver_user_id=null, authorization collapsed to hr_can_approve_leave():
--
--   is_super_admin() OR (user_has_permission('hr.leave.approve') AND in some org)
--
-- so anyone holding that permission could approve any leave, of any type, for
-- any member of staff in their organization. Configuring "Principal approves
-- Casual Leave" in the new admin UI would have rendered a rule the system does
-- not apply — worse than having no UI, because it reads as control.
--
-- WHY A TRIGGER RATHER THAN THE SERVICE. The service check is bypassable by any
-- direct PostgREST update, and RLS cannot express this: hla_update governs every
-- column, while this rule applies only to the specific transition into approved
-- or rejected. A BEFORE UPDATE OF status trigger is exactly that narrow, and it
-- is the same shape already used by trg_hla_sto_limits and
-- trg_hla_leave_period_cap.
--
-- WHY AN UNKNOWN ROLE KEY MEANS "ANY PERMITTED APPROVER". All 14 seeded leave
-- flows carry approver_role='hr_approver', which is NOT a custom_roles.role_key
-- (the real ones are hod, principal, hr_head, hr_admin, ...). Treating an
-- unrecognised key as a hard requirement would make every pre-existing chain
-- undecidable the moment this lands — every pending application frozen, with no
-- migration path. An unrecognised key is therefore a placeholder meaning "no
-- role restriction", and only a key that genuinely exists in custom_roles is
-- enforced. That also makes the new UI's role picker the only way to create a
-- binding rule, which is the intended behaviour.
--
-- OLD.current_step, not NEW: approveApplication() advances current_step in the
-- same UPDATE that sets the status, so NEW already points past the step being
-- decided.

CREATE OR REPLACE FUNCTION public.hr_trig_leave_enforce_approver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_step   jsonb;
  v_pinned uuid;
  v_role   text;
  v_label  text;
BEGIN
  -- Only the decision transition is policed. Cancel and withdraw are the
  -- applicant's own to make and must not be blocked here.
  IF NEW.status NOT IN ('approved','rejected')
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- No JWT: service-role contexts (cron, webhooks, migrations) have no identity
  -- to check a chain against. Leaving them alone is deliberate — the alternative
  -- is a backfill script that can never approve anything.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.employee_id IN (SELECT unnest(public.fn_my_staff_ids())) THEN
    RAISE EXCEPTION 'You cannot decide on your own leave application.';
  END IF;

  v_step := OLD.approval_chain -> OLD.current_step;
  IF v_step IS NULL THEN
    RETURN NEW;
  END IF;

  v_pinned := NULLIF(v_step->>'approver_user_id', '')::uuid;
  IF v_pinned IS NOT NULL THEN
    IF v_pinned <> v_uid THEN
      RAISE EXCEPTION 'This approval step is assigned to a different approver.';
    END IF;
    RETURN NEW;
  END IF;

  v_role := NULLIF(v_step->>'approver_role', '');
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cr.role_name INTO v_label
  FROM public.custom_roles cr
  WHERE cr.role_key = v_role AND cr.is_active
  LIMIT 1;

  -- Not a real role key -> placeholder, no restriction. See header.
  IF v_label IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND cr.role_key = v_role
  ) THEN
    RAISE EXCEPTION
      'This approval step is reserved for the % role.', v_label;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_hla_approver_gate ON public.hr_leave_applications;
CREATE TRIGGER trg_hla_approver_gate
  BEFORE UPDATE OF status ON public.hr_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.hr_trig_leave_enforce_approver();

-- Which role keys may be offered as approvers, with how many people actually
-- hold each. A role with nobody in it is a step nobody can clear, so the flow
-- editor shows the count rather than letting an admin build a dead end.
--
-- SECURITY DEFINER because custom_roles / user_roles are not readable by an
-- ordinary member of staff; it therefore self-authorizes rather than trusting
-- the caller, per the SECURITY DEFINER rule in this codebase.
CREATE OR REPLACE FUNCTION public.hr_leave_approver_role_options()
RETURNS TABLE (role_key text, role_name text, user_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
BEGIN
  IF NOT public.is_super_admin()
     AND NOT public.user_has_permission('hr.leave.types.manage') THEN
    RAISE EXCEPTION 'Not authorized to list approver roles';
  END IF;

  RETURN QUERY
  SELECT cr.role_key::text, cr.role_name::text, count(ur.user_id)
  FROM public.custom_roles cr
  LEFT JOIN public.user_roles ur ON ur.role_id = cr.id
  WHERE cr.is_active
  GROUP BY cr.role_key, cr.role_name
  ORDER BY cr.role_name;
END $fn$;

REVOKE ALL ON FUNCTION public.hr_leave_approver_role_options() FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_leave_approver_role_options() TO authenticated;
