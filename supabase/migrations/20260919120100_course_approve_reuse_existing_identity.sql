-- Applied 2026-09-19 as the second of five migrations in this change.
-- SUPERSEDED the same session by 20260919120400, which corrects the
-- enrollment identity columns against course_enrollments_identity_chk.
-- Kept because it was recorded in supabase_migrations.schema_migrations and
-- the folder must reproduce the log.
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. fn_course_approve_application — reuse the person, do not copy them
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Only the identity block changes. Package validation, the enrollment, the
-- bills and the status update are byte-for-byte as they were.
--
-- Three things to keep in view while reading it:
--
--  • The lookup is now fn_jkkn_id_of('profile', …), NOT a bare profile_id
--    query. That single substitution is the actual fix: fn_jkkn_id_of walks
--    profile → learner link → staff email, so it sees all 7,870 numbers.
--
--  • The ON CONFLICT (id) DO UPDATE SET is_external_participant = true no
--    longer fires against a real staff or learner profile. That write is how a
--    super-admin's profile came to be flagged as an external participant.
--
--  • participant_type is set from the match instead of being hardcoded
--    'external'. The column's CHECK already allowed learner/staff/external,
--    and the resend-credentials route already refuses a non-'external' row —
--    so setting it honestly switches on an existing guard against an admin
--    resetting a staff member's password from the course console.

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

  -- ── who is this? ─────────────────────────────────────────────────────────
  SELECT linked_profile_id INTO v_profile_id
    FROM public.event_external_participants WHERE id = v_app.external_participant_id;

  IF v_profile_id IS NOT NULL THEN
    -- Already bound by an earlier approval. Whether that binding was right is
    -- not this transaction's business; re-deciding it here would move somebody
    -- mid-course. Classify from the PROFILE rather than from a previous
    -- enrollment row, so the answer does not depend on what an earlier, buggier
    -- approval happened to write. Same order of precedence that
    -- tg_jkkn_auto_issue_associate uses.
    v_reused := true;
    SELECT CASE
             WHEN pr.is_external_participant THEN 'external'
             WHEN pr.learner_id IS NOT NULL  THEN 'learner'
             WHEN btrim(coalesce(pr.email, '')) <> '' AND EXISTS (
                    SELECT 1 FROM public.staff st
                     WHERE lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(pr.email))
                        OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(pr.email))
                  ) THEN 'staff'
             ELSE 'external'
           END
      INTO v_participant
      FROM public.profiles pr
     WHERE pr.id = v_profile_id;
    v_participant := coalesce(v_participant, 'external');
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

    IF coalesce((v_match ->> 'matched')::boolean, false)
       AND (v_match ->> 'profile_id') IS NOT NULL THEN
      -- The person already has a MyJKKN login. Reuse it whole: no auth user,
      -- no profile write, no password. Nothing about their record is amended
      -- by taking a course.
      v_profile_id  := (v_match ->> 'profile_id')::uuid;
      v_participant := v_match ->> 'participant_type';
      v_reused      := true;

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
        'course_participant',
        nullif(v_match ->> 'learner_profile_id', '')::uuid,
        NULL, true, true
      )
      ON CONFLICT (id) DO UPDATE
        SET profile_completed = true,
            email      = coalesce(public.profiles.email, EXCLUDED.email),
            full_name  = coalesce(public.profiles.full_name, EXCLUDED.full_name),
            learner_id = coalesce(public.profiles.learner_id, EXCLUDED.learner_id)
      RETURNING id INTO v_profile_id;

      v_participant := v_match ->> 'participant_type';
      v_reused      := true;

    ELSE
      -- A genuine outsider. Unchanged from before.
      IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'An auth user id is required to create the participant''s profile' USING ERRCODE = '22023';
      END IF;

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

      v_participant := 'external';
    END IF;

    UPDATE public.event_external_participants
       SET linked_profile_id = v_profile_id
     WHERE id = v_app.external_participant_id;
  END IF;

  -- ── the identity ─────────────────────────────────────────────────────────
  -- fn_jkkn_id_of, not a bare profile_id lookup. THIS IS THE FIX: it resolves
  -- profile → learner link → staff email, so an existing learner or staff
  -- member is found and keeps the number they already have.
  v_jkkn_id := public.fn_jkkn_id_of('profile', v_profile_id);

  IF v_jkkn_id IS NULL THEN
    v_issue   := public.fn_issue_jkkn_id('external_participant', NULL, NULL, v_profile_id);
    v_jkkn_id := v_issue ->> 'jkkn_id';
  END IF;

  -- The portal role is for people whose ONLY reason to hold an account is this
  -- course. A reused staff member or learner needs nothing: course_enrollments,
  -- course_bills and course_bill_payments all fall back to profile_id =
  -- auth.uid(), so /my-courses works for them off their normal login.
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
    participant_type, profile_id, external_participant_id,
    enrollment_number, status, total_payable, total_paid, balance
  )
  VALUES (
    v_app.course_event_id, v_app.institution_id, v_app.id, v_package.id,
    v_participant, v_profile_id, v_app.external_participant_id,
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

