-- Follow-up to 20260919120100. That migration started writing an honest
-- participant_type ('learner' / 'staff' instead of a hardcoded 'external') but
-- kept passing external_participant_id unconditionally, which violates the
-- table's own identity contract:
--
--   course_enrollments_identity_chk CHECK (
--        (participant_type = 'learner'  AND learner_id IS NOT NULL)
--     OR (participant_type = 'staff'    AND learner_id IS NULL AND external_participant_id IS NULL)
--     OR (participant_type = 'external' AND external_participant_id IS NOT NULL))
--
-- So the type is not a label: it decides which identity column the row carries.
-- A staff enrolment is not an external-participant enrolment and must not point
-- at the event_external_participants row at all; a learner enrolment must carry
-- its learner_id.
--
-- The fix derives the type FROM the identity we actually resolved rather than
-- the other way round, so the row can never disagree with itself:
--
--   learner_id resolved      -> 'learner'
--   staff match, no learner  -> 'staff'
--   otherwise                -> 'external'

CREATE OR REPLACE FUNCTION public.fn_course_approve_application(
  p_application_id uuid,
  p_auth_user_id uuid,
  p_email text DEFAULT NULL::text,
  p_package_id uuid DEFAULT NULL::uuid,
  p_decision_note text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app          public.course_applications%ROWTYPE;
  v_package      public.course_packages%ROWTYPE;
  v_profile_id   uuid;
  v_jkkn_id      text;
  v_issue        jsonb;
  v_role_id      uuid;
  v_enrollment   uuid;
  v_enroll_no    text;
  v_installments int;
  v_bill_count   int;
  v_email        text := nullif(btrim(coalesce(p_email, '')), '');
  v_match        jsonb;
  v_participant  text := 'external';
  v_reused       boolean := false;
  v_matched_name text;
  v_matched_kind text;
  v_is_staff     boolean := false;
  v_learner_id   uuid;
  v_external_id  uuid;
BEGIN
  IF NOT (
    coalesce(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('courses.applications.decide')
  ) THEN
    RAISE EXCEPTION 'Not authorised to decide course applications' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_app FROM public.course_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No course application %', p_application_id USING ERRCODE = '23503';
  END IF;

  IF v_app.status NOT IN ('pending', 'shortlisted') THEN
    RAISE EXCEPTION 'This application is already %. Only a pending or shortlisted application can be approved.', v_app.status
      USING ERRCODE = '22023';
  END IF;

  IF v_app.applicant_type <> 'external' THEN
    RAISE EXCEPTION 'Only external applicants are provisioned this way; % applicants already hold an identity.', v_app.applicant_type
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_package
    FROM public.course_packages
   WHERE id = coalesce(p_package_id, v_app.package_id)
     AND course_event_id = v_app.course_event_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose an active package for this course before approving. An enrollment cannot exist without one to price it.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_installments
    FROM public.course_package_installments WHERE package_id = v_package.id;
  IF v_installments = 0 THEN
    RAISE EXCEPTION 'Package "%" has no instalment schedule, so no bills can be raised. Add its instalments before approving anyone onto it.', v_package.name
      USING ERRCODE = '22023';
  END IF;

  SELECT linked_profile_id INTO v_profile_id
    FROM public.event_external_participants WHERE id = v_app.external_participant_id;

  IF v_profile_id IS NOT NULL THEN
    -- Already bound by an earlier approval. Whether that binding was right is
    -- not this transaction's business; re-deciding it here would move somebody
    -- mid-course. Classify from the PROFILE, not from a previous enrollment
    -- row, so the answer does not depend on what an earlier, buggier approval
    -- happened to write.
    v_reused := true;
    SELECT CASE WHEN pr.is_external_participant THEN NULL ELSE pr.learner_id END,
           (NOT pr.is_external_participant)
             AND btrim(coalesce(pr.email, '')) <> ''
             AND EXISTS (
                   SELECT 1 FROM public.staff st
                    WHERE lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(pr.email))
                       OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(pr.email))
                 )
      INTO v_learner_id, v_is_staff
      FROM public.profiles pr
     WHERE pr.id = v_profile_id;
  ELSE
    v_match := public.fn_course_resolve_applicant(v_email, v_app.applicant_phone);

    IF coalesce((v_match ->> 'ambiguous')::boolean, false) THEN
      RAISE EXCEPTION
        'This email address resolves to more than one person (JKKN IDs %). Approving would guess which of them is applying. Link this application to the right person manually, or use an address that belongs to one of them.',
        (SELECT string_agg(value #>> '{}', ', ') FROM jsonb_array_elements(v_match -> 'jkkn_ids'))
        USING ERRCODE = '22023';
    END IF;

    v_matched_name := v_match ->> 'display_name';
    v_matched_kind := v_match ->> 'person_kind';
    v_learner_id   := nullif(v_match ->> 'learner_profile_id', '')::uuid;
    v_is_staff     := (v_match ->> 'participant_type') = 'staff';

    IF coalesce((v_match ->> 'matched')::boolean, false)
       AND (v_match ->> 'profile_id') IS NOT NULL THEN
      -- The person already has a MyJKKN login. Reuse it whole: no auth user,
      -- no profile write, no password. Nothing about their record is amended
      -- by taking a course.
      v_profile_id := (v_match ->> 'profile_id')::uuid;
      v_reused     := true;

    ELSIF coalesce((v_match ->> 'matched')::boolean, false) THEN
      -- Known person, no login yet — roughly 817 learners have no profile, and
      -- staff with a blank institution_email never get one. Create the LOGIN.
      -- is_external_participant is deliberately NOT set: they are not one.
      IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'An auth user id is required to create the participant''s profile' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.profiles (
        id, email, full_name, phone_number, role,
        learner_id, institution_id, is_active, profile_completed
      )
      VALUES (
        p_auth_user_id, v_email,
        coalesce(v_matched_name, v_app.applicant_name), v_app.applicant_phone,
        'course_participant', v_learner_id, NULL, true, true
      )
      ON CONFLICT (id) DO UPDATE
        SET profile_completed = true,
            email      = coalesce(public.profiles.email, EXCLUDED.email),
            full_name  = coalesce(public.profiles.full_name, EXCLUDED.full_name),
            learner_id = coalesce(public.profiles.learner_id, EXCLUDED.learner_id)
      RETURNING id INTO v_profile_id;

      v_reused := true;

    ELSE
      -- A genuine outsider. Unchanged from before.
      IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'An auth user id is required to create the participant''s profile' USING ERRCODE = '22023';
      END IF;

      v_learner_id := NULL;
      v_is_staff   := false;

      INSERT INTO public.profiles (
        id, email, full_name, phone_number, role,
        is_external_participant, institution_id, is_active, profile_completed
      )
      VALUES (
        p_auth_user_id, v_email, v_app.applicant_name, v_app.applicant_phone,
        'course_participant', true, NULL, true, true
      )
      ON CONFLICT (id) DO UPDATE
        SET is_external_participant = true,
            profile_completed = true,
            email      = coalesce(public.profiles.email, EXCLUDED.email),
            full_name  = coalesce(public.profiles.full_name, EXCLUDED.full_name)
      RETURNING id INTO v_profile_id;
    END IF;

    UPDATE public.event_external_participants
       SET linked_profile_id = v_profile_id
     WHERE id = v_app.external_participant_id;
  END IF;

  -- fn_jkkn_id_of, not a bare profile_id lookup. THIS IS THE FIX: it resolves
  -- profile -> learner link -> staff email, so an existing learner or staff
  -- member is found and keeps the number they already have.
  v_jkkn_id := public.fn_jkkn_id_of('profile', v_profile_id);

  IF v_jkkn_id IS NULL THEN
    v_issue   := public.fn_issue_jkkn_id('external_participant', NULL, NULL, v_profile_id);
    v_jkkn_id := v_issue ->> 'jkkn_id';
  END IF;

  -- Derive the type FROM the identity, never the other way round, so the row
  -- cannot disagree with course_enrollments_identity_chk.
  IF v_learner_id IS NOT NULL THEN
    v_participant := 'learner';
    v_external_id := v_app.external_participant_id;   -- the CHECK permits both
  ELSIF v_is_staff THEN
    v_participant := 'staff';
    v_external_id := NULL;                            -- the CHECK forbids it
  ELSE
    v_participant := 'external';
    v_external_id := v_app.external_participant_id;   -- the CHECK requires it
  END IF;

  -- The portal role is for people whose ONLY reason to hold an account is this
  -- course. A reused staff member or learner needs nothing: course_enrollments,
  -- course_bills and course_bill_payments all fall back to
  -- profile_id = auth.uid(), so /my-courses works off their normal login.
  IF v_participant = 'external' THEN
    SELECT id INTO v_role_id FROM public.custom_roles WHERE role_key = 'course_participant';
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_by)
      VALUES (v_profile_id, v_role_id, true, auth.uid())
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_event_id = v_app.course_event_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'This person is already enrolled on this course.' USING ERRCODE = '23505';
  END IF;

  v_enroll_no := 'CE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  INSERT INTO public.course_enrollments (
    course_event_id, institution_id, application_id, package_id,
    participant_type, profile_id, learner_id, external_participant_id,
    enrollment_number, status, total_payable, total_paid, balance
  )
  VALUES (
    v_app.course_event_id, v_app.institution_id, v_app.id, v_package.id,
    v_participant, v_profile_id, v_learner_id, v_external_id,
    v_enroll_no, 'active', v_package.total_amount, 0, v_package.total_amount
  )
  RETURNING id INTO v_enrollment;

  INSERT INTO public.course_bills (
    enrollment_id, course_event_id, institution_id, bill_number,
    installment_no, label, total_amount, paid_amount, balance_amount, due_date, status
  )
  SELECT
    v_enrollment, v_app.course_event_id, v_app.institution_id,
    'CB-' || upper(substr(replace(v_enrollment::text, '-', ''), 1, 8)) || '-' || i.installment_no,
    i.installment_no, i.label, i.amount, 0, i.amount, i.due_date, 'pending'
  FROM public.course_package_installments i
  WHERE i.package_id = v_package.id
  ORDER BY i.installment_no;

  GET DIAGNOSTICS v_bill_count = ROW_COUNT;

  UPDATE public.course_applications
     SET status = 'approved', package_id = v_package.id, profile_id = v_profile_id,
         decided_by = auth.uid(), decided_at = now(), decision_note = p_decision_note
   WHERE id = v_app.id;

  RETURN jsonb_build_object(
    'ok', true, 'profile_id', v_profile_id, 'jkkn_id', v_jkkn_id,
    'enrollment_id', v_enrollment, 'enrollment_no', v_enroll_no,
    'package_name', v_package.name, 'total_payable', v_package.total_amount,
    'bill_count', v_bill_count,
    'reused_identity', v_reused,
    'participant_type', v_participant,
    'matched_name', v_matched_name,
    'matched_kind', v_matched_kind
  );
END;
$function$;

-- Restates the lock this function already carries live
-- ({authenticated, service_role}, no PUBLIC). Written out because CREATE OR
-- REPLACE preserving an ACL is not the same as the file saying what the ACL is:
-- the next author to DROP and recreate it inherits nothing.
REVOKE EXECUTE ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) TO service_role;
