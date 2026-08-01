-- 2026-07-31: extend validate_learner_semester_year_scope to cover section_id.
--
-- The guard installed by the 2026-07-30 repairs validates degree_id,
-- department_id, semester_id and academic_year_id — but NOT section_id. That
-- gap is exactly why section_id stayed corrupt through both earlier cleanups
-- and only surfaced today via the /learners/profiles section filter.
-- See 20260731100000_repair_learner_section_cross_institution.sql.
--
-- CREATE OR REPLACE rebuilt from the live definition (pg_get_functiondef,
-- 2026-07-31) so the four existing branches are carried forward verbatim.
--
-- Change-gated like every other branch (TG_OP='INSERT' OR the value actually
-- moved OR institution_id moved). Unconditional validation would make the 82
-- rows the repair could not resolve permanently uneditable — including
-- uneditable in order to fix them.
--
-- sections.institution_id is NOT NULL in practice (0 of 618 rows null), so the
-- IS DISTINCT FROM comparison cannot false-positive on a null scope column.

CREATE OR REPLACE FUNCTION public.validate_learner_semester_year_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid;
BEGIN
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.degree_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.degree_id      IS DISTINCT FROM OLD.degree_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT g.institution_id INTO v_inst
      FROM public.degrees g WHERE g.id = NEW.degree_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'degree_id % belongs to institution %, not the learner''s institution %',
        NEW.degree_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.department_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.department_id  IS DISTINCT FROM OLD.department_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT dp.institution_id INTO v_inst
      FROM public.departments dp WHERE dp.id = NEW.department_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'department_id % belongs to institution %, not the learner''s institution %',
        NEW.department_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.semester_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.semester_id     IS DISTINCT FROM OLD.semester_id
          OR NEW.institution_id  IS DISTINCT FROM OLD.institution_id) THEN
    SELECT s.institution_id INTO v_inst
      FROM public.semesters s WHERE s.id = NEW.semester_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'semester_id % belongs to institution %, not the learner''s institution %',
        NEW.semester_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.academic_year_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
          OR NEW.institution_id   IS DISTINCT FROM OLD.institution_id) THEN
    SELECT a.institution_id INTO v_inst
      FROM public.academic_years a WHERE a.id = NEW.academic_year_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'academic_year_id % belongs to institution %, not the learner''s institution %',
        NEW.academic_year_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Added 2026-07-31 — the gap that let the section_id corruption survive.
  IF NEW.section_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.section_id     IS DISTINCT FROM OLD.section_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT sc.institution_id INTO v_inst
      FROM public.sections sc WHERE sc.id = NEW.section_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'section_id % belongs to institution %, not the learner''s institution %',
        NEW.section_id, v_inst, NEW.institution_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
