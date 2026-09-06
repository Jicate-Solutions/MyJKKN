-- =====================================================================
-- Course Events — registration form builder
-- =====================================================================
-- Modelled on event_registration_forms AFTER its 2026-07-31 fix. In the
-- original events schema, fields hung off a form only via section_id
-- while three separate call sites filtered them by event_id; the moment
-- a second form existed it silently rendered every other form's fields.
-- Here form_id is on the field from the first migration and field_key is
-- unique per FORM, not per course.
--
-- There is deliberately NO fee column on a form. A course's price lives
-- on the PACKAGE the applicant chooses. Two fee sources feeding one
-- payment was rejected in the events module as a genuine hazard.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.course_registration_forms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_event_id uuid NOT NULL REFERENCES public.course_events(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  slug            text NOT NULL,
  description     text,
  display_order   int NOT NULL DEFAULT 0,
  is_enabled      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_registration_forms_slug_uniq UNIQUE (course_event_id, slug),
  CONSTRAINT course_registration_forms_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON COLUMN public.course_registration_forms.is_enabled IS
  'Defaults to FALSE. A new or cloned form must never silently open a second live intake on a running course.';

CREATE TABLE IF NOT EXISTS public.course_registration_form_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.course_registration_forms(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.course_registration_form_fields (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid NOT NULL REFERENCES public.course_registration_forms(id) ON DELETE CASCADE,
  section_id    uuid REFERENCES public.course_registration_form_sections(id) ON DELETE CASCADE,
  field_key     text NOT NULL,
  label         text NOT NULL,
  field_type    text NOT NULL
                  CHECK (field_type IN ('text','textarea','number','email','phone',
                                        'date','select','multiselect','checkbox',
                                        'radio','file')),
  is_required   boolean NOT NULL DEFAULT false,
  options       jsonb NOT NULL DEFAULT '[]'::jsonb,
  placeholder   text,
  help_text     text,
  validation    jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT course_registration_form_fields_key_uniq UNIQUE (form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_course_reg_forms_event
  ON public.course_registration_forms (course_event_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_reg_sections_form
  ON public.course_registration_form_sections (form_id, display_order);
CREATE INDEX IF NOT EXISTS idx_course_reg_fields_form
  ON public.course_registration_form_fields (form_id, display_order);

CREATE TRIGGER trg_course_reg_forms_touch
  BEFORE UPDATE ON public.course_registration_forms
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_reg_sections_touch
  BEFORE UPDATE ON public.course_registration_form_sections
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();
CREATE TRIGGER trg_course_reg_fields_touch
  BEFORE UPDATE ON public.course_registration_form_fields
  FOR EACH ROW EXECUTE FUNCTION public.fn_courses_touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- The PUBLIC application page does NOT read these tables through anon
-- RLS. It goes through a service-role API route (Phase 3), exactly as
-- the events public-register route does. anon holds nothing here.
-- ---------------------------------------------------------------------
ALTER TABLE public.course_registration_forms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registration_form_sections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_registration_form_fields    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.course_registration_forms         FROM anon, PUBLIC;
REVOKE ALL ON public.course_registration_form_sections FROM anon, PUBLIC;
REVOKE ALL ON public.course_registration_form_fields   FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_forms         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_form_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_registration_form_fields   TO authenticated;

CREATE POLICY course_registration_forms_select ON public.course_registration_forms
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND public.role_has_institution_access(institution_id))
  );

CREATE POLICY course_registration_forms_manage ON public.course_registration_forms
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND public.role_has_institution_access(institution_id))
  );

-- Sections and fields inherit tenancy through their form.
CREATE POLICY course_reg_sections_select ON public.course_registration_form_sections
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_sections_manage ON public.course_registration_form_sections
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_sections.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_fields_select ON public.course_registration_form_fields
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.view'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );

CREATE POLICY course_reg_fields_manage ON public.course_registration_form_fields
  FOR ALL TO authenticated
  USING (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  )
  WITH CHECK (
    (SELECT public.is_super_admin()) OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('courses.forms.manage'))
        AND EXISTS (SELECT 1 FROM public.course_registration_forms f
                     WHERE f.id = course_registration_form_fields.form_id
                       AND public.role_has_institution_access(f.institution_id)))
  );
