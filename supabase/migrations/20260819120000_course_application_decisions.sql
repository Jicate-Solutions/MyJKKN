-- =====================================================================
-- Course Events — Phase 4: deciding an application
-- =====================================================================
-- Approving is NOT a status update. It provisions a person: a profile, a
-- JKKN identity, a portal role, an enrollment and the whole instalment
-- bill schedule. Every one of those must land or none of them must, so
-- it is ONE function rather than a sequence of client-side writes that
-- can half-succeed and leave somebody holding a JKKN ID with no
-- enrollment — or an enrollment with no bills, which can never reach a
-- zero balance and so can never become 'confirmed'.
--
-- WHAT THIS FUNCTION DELIBERATELY DOES NOT DO
-- It does not create the auth user. profiles.id must equal auth.uid() in
-- this codebase, and auth.admin.createUser is an admin-API call plpgsql
-- cannot make. The caller (app/api/courses/applications/[id]/approve)
-- creates the auth user first and passes its id in. That split is why
-- p_auth_user_id is a parameter and not something derived here.
--
-- PERMISSIONS
-- The caller needs courses.applications.decide AND — because
-- fn_issue_jkkn_id runs its own check against auth.uid() even when
-- called from inside another SECURITY DEFINER function —
-- users.jkkn_id.issue. Verified at authoring time: all 7 roles holding
-- the former already hold the latter, so no new grant is needed. Do not
-- inline the ID minting to dodge this; one issuer, one number per person.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Approve
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_course_approve_application(
  p_application_id uuid,
  p_auth_user_id   uuid,
  p_email          text,
  p_package_id     uuid DEFAULT NULL,
  p_decision_note  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_app          public.course_applications%ROWTYPE;
  v_package      public.course_packages%ROWTYPE;
  v_profile_id   uuid;
  v_existing_id  uuid;
  v_jkkn_id      text;
  v_issue        jsonb;
  v_role_id      uuid;
  v_enrollment   uuid;
  v_enroll_no    text;
  v_installments int;
  v_bill_count   int;
  v_email        text := nullif(btrim(coalesce(p_email, '')), '');
BEGIN
  IF NOT (
    coalesce(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('courses.applications.decide')
  ) THEN
    RAISE EXCEPTION 'Not authorised to decide course applications'
      USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: two admins approving the same application concurrently
  -- would otherwise both pass the status check and race to create two
  -- enrollments. course_enrollments_person_uniq would catch the second,
  -- but only after an auth user and a JKKN ID had already been minted.
  SELECT * INTO v_app
    FROM public.course_applications
   WHERE id = p_application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No course application %', p_application_id
      USING ERRCODE = '23503';
  END IF;

  IF v_app.status NOT IN ('pending', 'shortlisted') THEN
    RAISE EXCEPTION 'This application is already %. Only a pending or shortlisted application can be approved.', v_app.status
      USING ERRCODE = '22023';
  END IF;

  IF v_app.applicant_type <> 'external' THEN
    RAISE EXCEPTION 'Only external applicants are provisioned this way; % applicants already hold an identity.', v_app.applicant_type
      USING ERRCODE = '22023';
  END IF;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'An email address is required to create the participant''s login'
      USING ERRCODE = '22023';
  END IF;

  -- ── the package prices the enrollment ────────────────────────────────
  -- p_package_id overrides the applicant's choice: an application filed
  -- while no tier was on sale carries package_id NULL, and an admin may
  -- legitimately move somebody to a different tier.
  SELECT * INTO v_package
    FROM public.course_packages
   WHERE id = coalesce(p_package_id, v_app.package_id)
     AND course_event_id = v_app.course_event_id
     AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active package for this course before approving. An enrollment cannot exist without one to price it.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_installments
    FROM public.course_package_installments
   WHERE package_id = v_package.id;

  -- Phase 1 allows a package with no instalments (a draft being built)
  -- and left it to bill generation to refuse one. This is that refusal:
  -- an enrollment with no bills can never reach a zero balance, so the
  -- participant could never become 'confirmed' and never attend.
  IF v_installments = 0 THEN
    RAISE EXCEPTION 'Package "%" has no instalment schedule, so no bills can be raised. Add its instalments before approving anyone onto it.', v_package.name
      USING ERRCODE = '22023';
  END IF;

  -- ── the person ───────────────────────────────────────────────────────
  -- One human, one profile. event_external_participants is upserted BY
  -- PHONE by the public apply route and is shared with the Events module,
  -- so somebody who already took a course — or ran the marathon — is
  -- reused rather than minted again.
  SELECT linked_profile_id INTO v_profile_id
    FROM public.event_external_participants
   WHERE id = v_app.external_participant_id;

  IF v_profile_id IS NULL THEN
    IF p_auth_user_id IS NULL THEN
      RAISE EXCEPTION 'An auth user id is required to create the participant''s profile'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.profiles (
      id, email, full_name, phone_number, role,
      is_external_participant, institution_id, is_active
    )
    VALUES (
      p_auth_user_id, v_email, v_app.applicant_name, v_app.applicant_phone,
      'course_participant', true, NULL, true
    )
    ON CONFLICT (id) DO UPDATE
      SET is_external_participant = true,
          email      = coalesce(public.profiles.email, EXCLUDED.email),
          full_name  = coalesce(public.profiles.full_name, EXCLUDED.full_name)
    RETURNING id INTO v_profile_id;

    UPDATE public.event_external_participants
       SET linked_profile_id = v_profile_id
     WHERE id = v_app.external_participant_id;
  END IF;

  -- ── the JKKN identity ────────────────────────────────────────────────
  -- Looked up BEFORE minting. fn_issue_jkkn_id raises 23505 for a person
  -- who already holds a number ("one number for life"), which is correct
  -- for it and wrong here: a participant taking their SECOND course must
  -- keep the number they already have, not fail the approval.
  SELECT jkkn_id INTO v_jkkn_id
    FROM public.jkkn_identities
   WHERE profile_id = v_profile_id
   LIMIT 1;

  IF v_jkkn_id IS NULL THEN
    v_issue := public.fn_issue_jkkn_id('external_participant', NULL, NULL, v_profile_id);
    v_jkkn_id := v_issue ->> 'jkkn_id';
  END IF;

  -- ── the portal role ──────────────────────────────────────────────────
  SELECT id INTO v_role_id
    FROM public.custom_roles
   WHERE role_key = 'course_participant';

  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (v_profile_id, v_role_id, true, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── the enrollment ───────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_event_id = v_app.course_event_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'This person is already enrolled on this course.'
      USING ERRCODE = '23505';
  END IF;

  v_enroll_no := 'CE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  -- total_payable is a SNAPSHOT, per the column comment: repricing the
  -- package later must never silently re-price people already enrolled.
  INSERT INTO public.course_enrollments (
    course_event_id, institution_id, application_id, package_id,
    participant_type, profile_id, external_participant_id,
    enrollment_number, status, total_payable, total_paid, balance
  )
  VALUES (
    v_app.course_event_id, v_app.institution_id, v_app.id, v_package.id,
    'external', v_profile_id, v_app.external_participant_id,
    v_enroll_no, 'active', v_package.total_amount, 0, v_package.total_amount
  )
  RETURNING id INTO v_enrollment;

  -- ── the bills ────────────────────────────────────────────────────────
  -- Every instalment at once. Due dates on the template are ABSOLUTE
  -- (Phase 1: a cohort course has one schedule everybody pays to), so
  -- there is nothing to recompute per person and no cron to depend on.
  -- bill_number is derived from (enrollment, instalment), which
  -- course_bills_installment_uniq already guarantees is unique.
  INSERT INTO public.course_bills (
    enrollment_id, course_event_id, institution_id, bill_number,
    installment_no, label, total_amount, paid_amount, balance_amount,
    due_date, status
  )
  SELECT
    v_enrollment, v_app.course_event_id, v_app.institution_id,
    'CB-' || upper(substr(replace(v_enrollment::text, '-', ''), 1, 8))
          || '-' || i.installment_no,
    i.installment_no, i.label, i.amount, 0, i.amount, i.due_date, 'pending'
  FROM public.course_package_installments i
  WHERE i.package_id = v_package.id
  ORDER BY i.installment_no;

  GET DIAGNOSTICS v_bill_count = ROW_COUNT;

  -- ── the decision ─────────────────────────────────────────────────────
  -- package_id is written back so the application records the tier the
  -- person was actually enrolled onto, not the one they may have picked.
  UPDATE public.course_applications
     SET status        = 'approved',
         package_id    = v_package.id,
         profile_id    = v_profile_id,
         decided_by    = auth.uid(),
         decided_at    = now(),
         decision_note = p_decision_note
   WHERE id = v_app.id;

  RETURN jsonb_build_object(
    'ok',            true,
    'profile_id',    v_profile_id,
    'jkkn_id',       v_jkkn_id,
    'enrollment_id', v_enrollment,
    'enrollment_no', v_enroll_no,
    'package_name',  v_package.name,
    'total_payable', v_package.total_amount,
    'bill_count',    v_bill_count
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) IS
  'Approves a course application as ONE transaction: profile, JKKN identity, Course Participant role, enrollment and the full instalment bill schedule. The auth user must already exist — profiles.id must equal auth.uid() and plpgsql cannot call the auth admin API, so the route creates it and passes p_auth_user_id.';

-- ---------------------------------------------------------------------
-- 2. Reject
-- ---------------------------------------------------------------------
-- Its own function rather than a client-side UPDATE, so that
-- course_applications_decision_chk (decided_at NOT NULL when rejected)
-- cannot be tripped by a caller that forgets, and so both decisions read
-- the same permission.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_course_reject_application(
  p_application_id uuid,
  p_decision_note  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF NOT (
    coalesce(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('courses.applications.decide')
  ) THEN
    RAISE EXCEPTION 'Not authorised to decide course applications'
      USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
    FROM public.course_applications
   WHERE id = p_application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No course application %', p_application_id
      USING ERRCODE = '23503';
  END IF;

  -- An approved application has already provisioned a person, an
  -- enrollment and bills. Flipping it to rejected here would strand all
  -- three, so unwinding is a withdrawal, not a rejection.
  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'This application is already approved and has an enrollment. Withdraw the enrollment instead of rejecting the application.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.course_applications
     SET status = 'rejected', decided_by = auth.uid(),
         decided_at = now(), decision_note = p_decision_note
   WHERE id = p_application_id;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

COMMENT ON FUNCTION public.fn_course_reject_application(uuid, text) IS
  'Rejects a pending or shortlisted course application. Refuses an already-approved one, whose person, enrollment and bills would be stranded.';

-- ---------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------
-- REVOKE from PUBLIC first: a new function is EXECUTE-able by PUBLIC by
-- default, and these provision identities.
REVOKE ALL ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_course_reject_application(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_course_reject_application(uuid, text) TO authenticated;
