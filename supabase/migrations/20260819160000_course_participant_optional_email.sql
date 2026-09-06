-- =====================================================================
-- Course Events — an external participant may have no email address
-- =====================================================================
-- fn_course_approve_application refused a NULL email, on the assumption
-- that a login needs one. Supabase Auth does need an address, but the
-- PARTICIPANT does not need to own it: /auth/login is Google OAuth only,
-- so an external participant never signs in by email regardless. They
-- sign in with their JKKN ID and password through the participant login
-- route, which resolves the ID to whatever auth identity backs it.
--
-- So the address is an implementation detail of Supabase Auth, held on
-- auth.users. When the applicant gave a real one it is stored here too,
-- for contact. When they did not, profiles.email stays NULL rather than
-- carrying the synthetic participants.jkkn.local address the route
-- minted — that value is not an email anyone can be reached at, and a
-- fake address in profiles.email would leak into every screen that
-- displays a person's contact details.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_course_approve_application(
  p_application_id uuid,
  p_auth_user_id   uuid,
  p_email          text DEFAULT NULL,
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
  v_jkkn_id      text;
  v_issue        jsonb;
  v_role_id      uuid;
  v_enrollment   uuid;
  v_enroll_no    text;
  v_installments int;
  v_bill_count   int;
  -- NULL, not '', when absent: profiles.email is nullable and an empty
  -- string would satisfy every `IS NOT NULL` check downstream while
  -- being useless to a human.
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

  IF v_installments = 0 THEN
    RAISE EXCEPTION 'Package "%" has no instalment schedule, so no bills can be raised. Add its instalments before approving anyone onto it.', v_package.name
      USING ERRCODE = '22023';
  END IF;

  SELECT linked_profile_id INTO v_profile_id
    FROM public.event_external_participants
   WHERE id = v_app.external_participant_id;

  IF v_profile_id IS NULL THEN
    IF p_auth_user_id IS NULL THEN
      RAISE EXCEPTION 'An auth user id is required to create the participant''s profile'
        USING ERRCODE = '22023';
    END IF;

    -- profile_completed TRUE, deliberately. It defaults to false, and proxy.ts
    -- redirects any authenticated user whose profile is incomplete to
    -- /auth/complete-profile — a form asking for institution, department and
    -- programme, none of which an external participant has or should supply.
    -- Left at the default, every participant signs in successfully and is
    -- immediately bounced into a form they cannot complete. Their profile IS
    -- complete for what they are: a name, a phone and a role.
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

    UPDATE public.event_external_participants
       SET linked_profile_id = v_profile_id
     WHERE id = v_app.external_participant_id;
  END IF;

  SELECT jkkn_id INTO v_jkkn_id
    FROM public.jkkn_identities
   WHERE profile_id = v_profile_id
   LIMIT 1;

  IF v_jkkn_id IS NULL THEN
    v_issue := public.fn_issue_jkkn_id('external_participant', NULL, NULL, v_profile_id);
    v_jkkn_id := v_issue ->> 'jkkn_id';
  END IF;

  SELECT id INTO v_role_id
    FROM public.custom_roles
   WHERE role_key = 'course_participant';

  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_by)
    VALUES (v_profile_id, v_role_id, true, auth.uid())
    ON CONFLICT DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.course_enrollments
     WHERE course_event_id = v_app.course_event_id AND profile_id = v_profile_id
  ) THEN
    RAISE EXCEPTION 'This person is already enrolled on this course.'
      USING ERRCODE = '23505';
  END IF;

  v_enroll_no := 'CE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

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
  'Approves a course application as ONE transaction: profile, JKKN identity, Course Participant role, enrollment and the full instalment bill schedule. The auth user must already exist (validate_profile_operation enforces it) so the route creates it and passes p_auth_user_id. p_email is OPTIONAL and stored only when the applicant gave a real address — the participant signs in with their JKKN ID, not by email.';

-- ---------------------------------------------------------------------
-- Resolve a JKKN ID to the profile that holds it.
-- ---------------------------------------------------------------------
-- Used by the participant login route, which then reads that profile's
-- auth identity with the service role. SECURITY DEFINER because the
-- caller is UNAUTHENTICATED at that point — they are trying to log in —
-- and jkkn_identities is not readable by anon.
--
-- Returns the profile id ONLY, never the email, never a name. The caller
-- is anonymous and a JKKN ID is six digits: this endpoint is guessable
-- by construction, so it must confirm nothing about the person behind a
-- number. It is also restricted to external participants — staff and
-- learners sign in with Google, and letting their identities resolve
-- here would add a password-guessing surface to accounts that do not
-- otherwise have one.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_participant_jkkn_id(p_jkkn_id text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p.id
    FROM public.jkkn_identities i
    JOIN public.profiles p ON p.id = i.profile_id
   WHERE btrim(i.jkkn_id) = btrim(p_jkkn_id)
     AND i.person_kind = 'external_participant'
     AND p.is_external_participant
     AND p.is_active
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.fn_resolve_participant_jkkn_id(text) IS
  'JKKN ID -> profile id, for the participant login route only. Returns the id alone and only for active external participants, because the caller is unauthenticated and a six-digit ID is guessable.';

-- The login route calls this with the SERVICE ROLE, never from the
-- browser: granting anon would publish a JKKN-ID-to-account oracle.
REVOKE ALL ON FUNCTION public.fn_resolve_participant_jkkn_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_participant_jkkn_id(text) TO service_role;
