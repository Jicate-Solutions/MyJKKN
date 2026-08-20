-- =====================================================================
-- Course Events — applications (screening gate) and enrollments
-- =====================================================================
-- event_external_participants is REUSED rather than duplicated. It
-- already upserts by phone and already carries linked_profile_id, which
-- is the bridge to a JKKN identity. A course-specific person table would
-- mean the same human who ran the marathon and took the course exists as
-- two unlinked rows. This is a deliberate, named dependency from courses
-- onto an event_* table.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_applications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id         uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  form_id                 uuid REFERENCES public.course_registration_forms(id) ON DELETE SET NULL,
  package_id              uuid REFERENCES public.course_packages(id) ON DELETE SET NULL,
  applicant_type          text NOT NULL CHECK (applicant_type IN ('learner','staff','external')),
  profile_id              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  learner_id              uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
  external_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE SET NULL,
  applicant_name          text NOT NULL,
  applicant_email         text,
  applicant_phone         text NOT NULL,
  custom_fields           jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','shortlisted','approved','rejected','withdrawn')),
  decided_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at              timestamptz,
  decision_note           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- The identity anchor must match the declared type. Written per type
  -- rather than as a blanket num_nonnulls(...) >= 1, because a STAFF
  -- applicant has neither a learner record nor an external-participant
  -- record — only a profile.
  CONSTRAINT course_applications_identity_chk CHECK (
       (applicant_type = 'learner'  AND learner_id              IS NOT NULL)
    OR (applicant_type = 'staff'    AND profile_id              IS NOT NULL)
    OR (applicant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  CONSTRAINT course_applications_decision_chk
    CHECK (status NOT IN ('approved','rejected') OR decided_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_course_applications_event_status
  ON public.course_applications (course_event_id, status);
CREATE INDEX IF NOT EXISTS idx_course_applications_phone
  ON public.course_applications (applicant_phone);

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id         uuid NOT NULL REFERENCES public.course_events(id) ON DELETE RESTRICT,
  institution_id          uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  application_id          uuid UNIQUE REFERENCES public.course_applications(id) ON DELETE SET NULL,
  package_id              uuid NOT NULL REFERENCES public.course_packages(id) ON DELETE RESTRICT,
  participant_type        text NOT NULL CHECK (participant_type IN ('learner','staff','external')),
  -- NOT NULL: identity provisioning runs BEFORE the enrollment insert, in
  -- the same transaction. With a nullable column Postgres treats every
  -- NULL as distinct, so the UNIQUE below would enforce nothing.
  profile_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  learner_id              uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
  external_participant_id uuid REFERENCES public.event_external_participants(id) ON DELETE SET NULL,
  enrollment_number       text UNIQUE,
  status                  text NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','confirmed','payment_overdue',
                                              'withdrawn','completed','cancelled')),
  total_payable           numeric(12,2) NOT NULL CHECK (total_payable >= 0),
  total_paid              numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  balance                 numeric(12,2) NOT NULL,
  refundable_amount       numeric(12,2) NOT NULL DEFAULT 0 CHECK (refundable_amount >= 0),
  refund_status           text CHECK (refund_status IS NULL
                                      OR refund_status IN ('pending_offline','recorded')),
  withdrawn_at            timestamptz,
  withdrawal_reason       text,
  enrolled_at             timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_enrollments_identity_chk CHECK (
       (participant_type = 'learner'  AND learner_id IS NOT NULL)
    OR (participant_type = 'staff'    AND learner_id IS NULL
                                      AND external_participant_id IS NULL)
    OR (participant_type = 'external' AND external_participant_id IS NOT NULL)
  ),
  CONSTRAINT course_enrollments_withdrawal_chk
    CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL),
  CONSTRAINT course_enrollments_person_uniq UNIQUE (course_event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_event_status
  ON public.course_enrollments (course_event_id, status);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_profile
  ON public.course_enrollments (profile_id);

COMMENT ON COLUMN public.course_enrollments.total_payable IS
  'A SNAPSHOT of course_packages.total_amount taken at enrollment. Repricing a package later must never silently re-price people already enrolled.';

CREATE TRIGGER trg_course_applications_touch
  BEFORE UPDATE ON public.course_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_enrollments_touch
  BEFORE UPDATE ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.course_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_applications FROM anon, PUBLIC;
REVOKE ALL ON public.course_enrollments  FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_enrollments  TO authenticated;

CREATE POLICY course_applications_select ON public.course_applications
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.view'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY course_applications_decide ON public.course_applications
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.decide'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.applications.decide'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_enrollments_select ON public.course_enrollments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
    OR profile_id = (SELECT auth.uid())
  );

CREATE POLICY course_enrollments_manage ON public.course_enrollments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.enrollments.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------
-- Additive participant visibility for the tables created earlier
-- ---------------------------------------------------------------------
-- These are SEPARATE policies, not widened admin policies. Multiple
-- PERMISSIVE policies on one command are OR'd, so adding a policy grants
-- exactly this narrow extra read and cannot loosen the admin rule.
--
-- A participant sees the course, packages, installment plan and session
-- schedule for a course they are enrolled on — and nothing else.
-- ---------------------------------------------------------------------
CREATE POLICY course_events_participant_select ON public.course_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.course_event_id = course_events.id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_packages_participant_select ON public.course_packages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.package_id = course_packages.id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_package_installments_participant_select
  ON public.course_package_installments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.package_id = course_package_installments.package_id
       AND e.profile_id = (SELECT auth.uid())
  ));

CREATE POLICY course_sessions_participant_select ON public.course_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_enrollments e
     WHERE e.course_event_id = course_sessions.course_event_id
       AND e.profile_id = (SELECT auth.uid())
  ));
