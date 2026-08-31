-- =====================================================================
-- Course Events — core: courses, priced packages, installment templates
-- Phase 1 of docs/superpowers/specs/2026-08-13-course-events-design.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. course_events
-- ---------------------------------------------------------------------
-- `status` deliberately has NO 'closed' value. Whether applications are
-- accepted is decided solely by the application_opens_at/closes_at
-- window. Two independent switches governing one behaviour is how intake
-- states drift apart.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_events (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id           uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title                    text NOT NULL,
  slug                     text NOT NULL,
  code                     text,
  description              text,
  mode                     text NOT NULL DEFAULT 'offline'
                             CHECK (mode IN ('offline','online','hybrid')),
  status                   text NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','published','completed','cancelled')),
  start_date               date,
  end_date                 date,
  application_opens_at     timestamptz,
  application_closes_at    timestamptz,
  total_seats              int CHECK (total_seats IS NULL OR total_seats > 0),
  venue_text               text,
  cover_image_url          text,
  year                     int,
  edition_number           int,
  previous_course_event_id uuid REFERENCES public.course_events(id) ON DELETE SET NULL,
  created_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_events_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT course_events_date_order_chk
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT course_events_application_window_chk
    CHECK (application_closes_at IS NULL OR application_opens_at IS NULL
           OR application_closes_at >= application_opens_at),
  CONSTRAINT course_events_slug_uniq UNIQUE (institution_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_course_events_institution
  ON public.course_events (institution_id, status);
CREATE INDEX IF NOT EXISTS idx_course_events_previous
  ON public.course_events (previous_course_event_id)
  WHERE previous_course_event_id IS NOT NULL;

COMMENT ON TABLE public.course_events IS
  'A paid, multi-session learning course conducted by an institution. Open to learners, staff and external participants.';
COMMENT ON COLUMN public.course_events.previous_course_event_id IS
  'Lineage for a course repeated yearly. Set by fn_clone_course_event (Phase 7).';

-- ---------------------------------------------------------------------
-- 2. course_packages — priced tiers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  total_amount    numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency        text NOT NULL DEFAULT 'INR',
  seat_cap        int CHECK (seat_cap IS NULL OR seat_cap > 0),
  sale_opens_at   timestamptz,
  sale_closes_at  timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  display_order   int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_packages_name_uniq UNIQUE (course_event_id, name),
  CONSTRAINT course_packages_sale_window_chk
    CHECK (sale_closes_at IS NULL OR sale_opens_at IS NULL
           OR sale_closes_at >= sale_opens_at)
);

CREATE INDEX IF NOT EXISTS idx_course_packages_event
  ON public.course_packages (course_event_id) WHERE is_active;

COMMENT ON COLUMN public.course_packages.seat_cap IS
  'NULL means unlimited. Waitlisting when a cap is reached is out of scope for v1.';

-- ---------------------------------------------------------------------
-- 3. course_package_installments — the schedule template
-- ---------------------------------------------------------------------
-- Due dates are ABSOLUTE. A cohort course has one schedule everybody
-- pays to; enrollment-relative offsets are explicitly out of scope.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_package_installments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id     uuid NOT NULL REFERENCES public.course_packages(id) ON DELETE CASCADE,
  installment_no smallint NOT NULL CHECK (installment_no >= 1),
  label          text,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  due_date       date NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_package_installments_no_uniq UNIQUE (package_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_course_package_installments_package
  ON public.course_package_installments (package_id, installment_no);

-- ---------------------------------------------------------------------
-- 4. Integrity: installments must sum to the package price
-- ---------------------------------------------------------------------
-- A package whose parts do not add up to its price is the single most
-- damaging thing that can silently ship here: bills would be generated
-- that can never reach a zero balance, so the participant could never
-- become 'confirmed' and could never attend.
--
-- DEFERRABLE INITIALLY DEFERRED so a multi-row edit may pass through an
-- inconsistent state inside a transaction but can never COMMIT one.
--
-- A package with ZERO installments is allowed — it is a draft being
-- built. Bill generation (Phase 4) refuses such a package separately.
-- Rejecting it here would force every package insert to carry its whole
-- schedule in the same statement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_course_package_amounts_chk()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_package_id uuid;
  v_total      numeric(12,2);
  v_sum        numeric(12,2);
  v_count      int;
BEGIN
  -- One function, two triggers: the installments table exposes
  -- package_id, the packages table exposes id.
  IF TG_TABLE_NAME = 'course_packages' THEN
    v_package_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_package_id := COALESCE(NEW.package_id, OLD.package_id);
  END IF;

  SELECT total_amount INTO v_total
    FROM public.course_packages
   WHERE id = v_package_id;

  -- The package itself was deleted in this transaction (ON DELETE
  -- CASCADE removed its installments). Nothing left to reconcile.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0), count(*)
    INTO v_sum, v_count
    FROM public.course_package_installments
   WHERE package_id = v_package_id;

  IF v_count > 0 AND v_sum <> v_total THEN
    RAISE EXCEPTION
      'Course package % has % installments totalling % but its price is %. The schedule must add up to the price.',
      v_package_id, v_count, v_sum, v_total
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$fn$;

COMMENT ON FUNCTION public.fn_course_package_amounts_chk() IS
  'Constraint-trigger body shared by course_packages and course_package_installments: the installment schedule must sum to the package price at COMMIT. Zero installments is permitted (draft package).';

CREATE CONSTRAINT TRIGGER trg_course_package_installments_sum
AFTER INSERT OR UPDATE OR DELETE ON public.course_package_installments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_course_package_amounts_chk();

CREATE CONSTRAINT TRIGGER trg_course_packages_total_sum
AFTER UPDATE OF total_amount ON public.course_packages
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_course_package_amounts_chk();

-- ---------------------------------------------------------------------
-- 5. updated_at maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_courses_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_course_events_touch
  BEFORE UPDATE ON public.course_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_packages_touch
  BEFORE UPDATE ON public.course_packages
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_package_installments_touch
  BEFORE UPDATE ON public.course_package_installments
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
-- Participant-visibility policies are ADDITIVE and are added in
-- 20260813100300 (they reference course_enrollments, which does not
-- exist yet). Until then these tables are staff-only, which is the safe
-- direction to be wrong in.
-- ---------------------------------------------------------------------
ALTER TABLE public.course_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_packages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_package_installments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_events               FROM anon, PUBLIC;
REVOKE ALL ON public.course_packages             FROM anon, PUBLIC;
REVOKE ALL ON public.course_package_installments FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_events               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_packages             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_package_installments TO authenticated;

CREATE POLICY course_events_select ON public.course_events
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_insert ON public.course_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.create'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_update ON public.course_events
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.edit'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.edit'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_events_delete ON public.course_events
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR ((SELECT public.user_has_permission('courses.delete'))
        AND public.role_has_institution_access(institution_id))
  );

-- Packages and installments: read follows courses.view, write follows
-- courses.packages.manage. Installments have no institution_id of their
-- own, so they inherit tenancy through their package.
CREATE POLICY course_packages_select ON public.course_packages
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_packages_manage ON public.course_packages
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_package_installments_select ON public.course_package_installments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  );

CREATE POLICY course_package_installments_manage ON public.course_package_installments
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.packages.manage'))
        AND EXISTS (
          SELECT 1 FROM public.course_packages p
           WHERE p.id = course_package_installments.package_id
             AND public.role_has_institution_access(p.institution_id)))
  );
