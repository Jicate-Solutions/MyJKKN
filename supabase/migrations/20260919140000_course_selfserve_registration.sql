-- Self-service course registration: let the PUBLIC apply route provision the
-- participant itself, with no admin approval step.
--
-- Until now a public application could only ever be a 'pending' row. Everything
-- that turns it into a person -- the auth user, the profile, the JKKN ID, the
-- enrolment and its instalment bills -- lived behind
-- /api/courses/applications/[id]/approve, which is withAuth +
-- courses.applications.decide. For a paid course anyone can buy, that review is
-- latency rather than vetting.
--
-- The blocker was never policy, it was IDENTITY: fn_course_approve_application,
-- fn_course_resolve_applicant and fn_issue_jkkn_id all gate on auth.uid(), and
-- an anonymous public request has none, so all three raise 42501. The same
-- class of problem is already on record against the fn_cl_admin_* RPCs.
--
-- Each therefore gains ONE branch for the service-role caller, in the form
-- exec_sql already proves in production:
--
--     auth.role() IS NOT DISTINCT FROM 'service_role'
--
-- current_user is NOT usable for this: inside a SECURITY DEFINER it is the
-- function's OWNER, not the caller.
--
-- THIS CONCEDES NO PRIVILEGE. service_role bypasses RLS on every table and
-- already holds EXECUTE on fn_jkkn_allocate, so it could write an identity row
-- by hand today. The branch exists so these calls go through each function's
-- validation instead of around it.
--
-- WHO may be auto-provisioned is decided in the ROUTE, not here: an email must
-- be present, the package must be priced with instalments, the course must have
-- a free seat, and the applicant must NOT already be somebody MyJKKN knows.
-- Anything else stays 'pending' for a human, exactly as today.
--
-- Apart from the added branch, the three bodies are unchanged.

-- =========================================================================
-- 1. fn_course_resolve_applicant
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_course_resolve_applicant(
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email      text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone      text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_candidates jsonb := '[]'::jsonb;
  v_phone_only jsonb := '[]'::jsonb;
  v_numbers    text[];
  v_pick       jsonb;
BEGIN
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('courses.applications.decide')
    -- Self-service registration (2026-09-19): the public apply route asks this
    -- question through the service-role client, with no session and therefore
    -- no auth.uid(). IS NOT DISTINCT FROM, not `=`: auth.role() is NULL for an
    -- anonymous caller and `=` would make the whole OR chain NULL.
    OR auth.role() IS NOT DISTINCT FROM 'service_role'
  ) THEN
    RAISE EXCEPTION 'Not authorised to resolve course applicants' USING ERRCODE = '42501';
  END IF;

  -- A participants.jkkn.local address is minted by the approval route for
  -- somebody who gave no email at all. It identifies nobody and must never
  -- match anybody, least of all another synthetic address.
  IF v_email IS NOT NULL AND v_email LIKE '%@participants.jkkn.local' THEN
    v_email := NULL;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.rank), '[]'::jsonb)
      INTO v_candidates
      FROM (
        SELECT 1 AS rank,
               'learner'::text                      AS participant_type,
               ji.person_kind                       AS person_kind,
               btrim(ji.jkkn_id)                    AS jkkn_id,
               lp.id                                AS learner_profile_id,
               NULL::uuid                           AS team_member_id,
               (SELECT pr.id FROM public.profiles pr
                 WHERE pr.learner_id = lp.id
                 ORDER BY pr.created_at LIMIT 1)    AS profile_id,
               nullif(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS display_name,
               'learner record'::text               AS matched_on
          FROM public.learners_profiles lp
          JOIN public.jkkn_identities ji
            ON ji.learner_profile_id = lp.id AND ji.retired_at IS NULL
         WHERE lower(btrim(coalesce(lp.student_email, ''))) = v_email
            OR lower(btrim(coalesce(lp.college_email, ''))) = v_email

        UNION ALL

        SELECT 2,
               'staff',
               ji.person_kind,
               btrim(ji.jkkn_id),
               NULL::uuid,
               st.id,
               (SELECT pr.id FROM public.profiles pr
                 WHERE btrim(coalesce(pr.email, '')) <> ''
                   AND lower(btrim(pr.email)) IN (
                         lower(btrim(coalesce(st.institution_email, ''))),
                         lower(btrim(coalesce(st.email, '')))
                       )
                 ORDER BY pr.created_at LIMIT 1),
               nullif(btrim(concat_ws(' ', st.first_name, st.last_name)), ''),
               'staff record'
          FROM public.staff st
          JOIN public.jkkn_identities ji
            ON ji.team_member_id = st.id AND ji.retired_at IS NULL
         WHERE lower(btrim(coalesce(st.institution_email, ''))) = v_email
            OR lower(btrim(coalesce(st.email, ''))) = v_email

        UNION ALL

        SELECT 3,
               'external',
               ji.person_kind,
               btrim(ji.jkkn_id),
               NULL::uuid,
               NULL::uuid,
               pr.id,
               nullif(btrim(pr.full_name), ''),
               'MyJKKN account'
          FROM public.profiles pr
          JOIN public.jkkn_identities ji
            ON ji.profile_id = pr.id AND ji.retired_at IS NULL
         WHERE btrim(coalesce(pr.email, '')) <> ''
           AND lower(btrim(pr.email)) = v_email

        UNION ALL

        SELECT 4,
               'learner',
               ji.person_kind,
               btrim(ji.jkkn_id),
               pr.learner_id,
               NULL::uuid,
               pr.id,
               nullif(btrim(pr.full_name), ''),
               'MyJKKN account'
          FROM public.profiles pr
          JOIN public.jkkn_identities ji
            ON ji.learner_profile_id = pr.learner_id AND ji.retired_at IS NULL
         WHERE pr.learner_id IS NOT NULL
           AND btrim(coalesce(pr.email, '')) <> ''
           AND lower(btrim(pr.email)) = v_email
      ) c;
  END IF;

  SELECT array_agg(DISTINCT x.jkkn_id)
    INTO v_numbers
    FROM jsonb_to_recordset(v_candidates) AS x(jkkn_id text);

  -- phone: a WARNING for the admin, never an automatic link. Only people the
  -- email did NOT already find, so a confirmed match does not nag about itself.
  IF v_phone IS NOT NULL AND length(v_phone) >= 6 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
      INTO v_phone_only
      FROM (
        SELECT 'learner'::text AS kind,
               btrim(ji.jkkn_id) AS jkkn_id,
               nullif(btrim(concat_ws(' ', lp.first_name, lp.last_name)), '') AS display_name
          FROM public.learners_profiles lp
          JOIN public.jkkn_identities ji
            ON ji.learner_profile_id = lp.id AND ji.retired_at IS NULL
         WHERE regexp_replace(coalesce(lp.student_mobile, ''), '\D', '', 'g') = v_phone
           AND (v_numbers IS NULL OR NOT (btrim(ji.jkkn_id) = ANY (v_numbers)))

        UNION ALL

        SELECT 'staff',
               btrim(ji.jkkn_id),
               nullif(btrim(concat_ws(' ', st.first_name, st.last_name)), '')
          FROM public.staff st
          JOIN public.jkkn_identities ji
            ON ji.team_member_id = st.id AND ji.retired_at IS NULL
         WHERE regexp_replace(coalesce(st.phone, ''), '\D', '', 'g') = v_phone
           AND (v_numbers IS NULL OR NOT (btrim(ji.jkkn_id) = ANY (v_numbers)))
      ) w;
  END IF;

  IF v_numbers IS NULL OR array_length(v_numbers, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'matched', false, 'ambiguous', false,
      'participant_type', 'external',
      'candidates', v_candidates, 'phone_only_matches', v_phone_only
    );
  END IF;

  IF array_length(v_numbers, 1) > 1 THEN
    RETURN jsonb_build_object(
      'ok', true, 'matched', true, 'ambiguous', true,
      'jkkn_ids', to_jsonb(v_numbers),
      'candidates', v_candidates, 'phone_only_matches', v_phone_only
    );
  END IF;

  SELECT to_jsonb(c) INTO v_pick
    FROM jsonb_to_recordset(v_candidates)
      AS c(rank int, participant_type text, person_kind text, jkkn_id text,
           learner_profile_id uuid, team_member_id uuid, profile_id uuid,
           display_name text, matched_on text)
   ORDER BY (c.profile_id IS NULL), c.rank
   LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true, 'matched', true, 'ambiguous', false,
    'jkkn_id',            v_numbers[1],
    'person_kind',        v_pick ->> 'person_kind',
    'participant_type',   v_pick ->> 'participant_type',
    'profile_id',         v_pick ->> 'profile_id',
    'learner_profile_id', v_pick ->> 'learner_profile_id',
    'team_member_id',     v_pick ->> 'team_member_id',
    'display_name',       v_pick ->> 'display_name',
    'matched_on',         v_pick ->> 'matched_on',
    'email',              v_email,
    'candidates',         v_candidates,
    'phone_only_matches', v_phone_only
  );
END;
$function$;

-- =========================================================================
-- 2. fn_course_approve_application
-- =========================================================================

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
    -- Self-service registration (2026-09-19): the public apply route provisions
    -- the participant itself, through the service-role client, with no session
    -- and therefore no auth.uid(). The route decides WHO is eligible before it
    -- ever gets here; this branch only makes the call possible.
    OR auth.role() IS NOT DISTINCT FROM 'service_role'
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

-- =========================================================================
-- 3. fn_issue_jkkn_id
-- =========================================================================

CREATE OR REPLACE FUNCTION public.fn_issue_jkkn_id(
  p_person_kind        text,
  p_learner_profile_id uuid DEFAULT NULL,
  p_team_member_id     uuid DEFAULT NULL,
  p_profile_id         uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Two gates, not one — see 20260821070100 for the external_participant
  -- carve-out's rationale. 'associate' gets no carve-out: it is issued only
  -- under the global key (or by the trigger, which does not pass through
  -- here). IS NOT DISTINCT FROM, not `=`: with `=`, a NULL p_person_kind makes
  -- that term NULL, the OR chain evaluates to NULL, and plpgsql treats IF NULL
  -- as false — the gate would pass silently. This form fails closed.
  IF NOT (
    COALESCE(public.is_super_admin(), false)
    OR public.is_admin()
    OR public.user_has_permission('users.jkkn_id.issue')
    OR (
      p_person_kind IS NOT DISTINCT FROM 'external_participant'
      AND public.user_has_permission('courses.applications.decide')
    )
    -- Self-service registration (2026-09-19): reached from the public apply
    -- route via fn_course_approve_application, which runs under the
    -- service-role client and has no auth.uid() to check. Kept exactly as
    -- narrow as the decide carve-out above: external_participant ONLY, so this
    -- can never mint a learner or team_member number.
    OR (
      p_person_kind IS NOT DISTINCT FROM 'external_participant'
      AND auth.role() IS NOT DISTINCT FROM 'service_role'
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to issue a JKKN ID'
      USING ERRCODE = '42501';
  END IF;

  IF p_person_kind IS NULL
     OR p_person_kind NOT IN ('learner','team_member','both','external_participant','associate') THEN
    RAISE EXCEPTION 'person_kind must be learner, team_member, both, external_participant or associate (got %)', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  -- The link shape must match the kind, and the person must actually exist.
  -- The table tolerates an orphaned link (a person record can be removed
  -- years later and the number must survive); issuance does not.
  IF p_person_kind IN ('learner', 'both') THEN
    IF p_learner_profile_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a learner profile', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.learners_profiles WHERE id = p_learner_profile_id) THEN
      RAISE EXCEPTION 'No learner profile %', p_learner_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_learner_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'A % identity must not carry a learner profile', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  IF p_person_kind IN ('team_member', 'both') THEN
    IF p_team_member_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a team member', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_team_member_id) THEN
      RAISE EXCEPTION 'No team member %', p_team_member_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_team_member_id IS NOT NULL THEN
    RAISE EXCEPTION 'A % identity must not carry a team member', p_person_kind
      USING ERRCODE = '22023';
  END IF;

  -- Profile-anchored kinds: external_participant (Course Events, 2026-08-13)
  -- and associate (2026-08-27).
  IF p_person_kind IN ('external_participant', 'associate') THEN
    IF p_profile_id IS NULL THEN
      RAISE EXCEPTION 'A % identity needs a profile', p_person_kind
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id) THEN
      RAISE EXCEPTION 'No profile %', p_profile_id
        USING ERRCODE = '23503';
    END IF;
  ELSIF p_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only an external_participant or associate identity is issued against a profile'
      USING ERRCODE = '22023';
  END IF;

  RETURN public.fn_jkkn_allocate(
    p_person_kind, p_learner_profile_id, p_team_member_id, p_profile_id, auth.uid()
  );
END;
$fn$;

-- Locks restated so a future DROP-and-recreate cannot inherit PUBLIC.
REVOKE ALL ON FUNCTION public.fn_course_resolve_applicant(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_course_resolve_applicant(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_course_approve_application(uuid, uuid, text, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_issue_jkkn_id(text, uuid, uuid, uuid) TO authenticated, service_role;
