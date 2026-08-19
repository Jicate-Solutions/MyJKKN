-- 2026-08-08 PHASE 6 — close the two structural holes that let this whole
-- incident class exist, and add a standing detector so the next one is found by
-- a query instead of by a user noticing a filter return zero.
--
-- HOLE 1 — program_id was NEVER validated. The guard installed 2026-07-31
-- covered degree_id, department_id, semester_id, academic_year_id and (from
-- 20260731100149) section_id. It has never covered program_id at all. That is
-- precisely why the 21 Arts&Sci (Self) M.COM learners kept another college's
-- programme through THREE repair waves: every wave searched for the right
-- semester inside (learner institution, learner program_id), and the program_id
-- itself was the foreign value, so every candidate count came back 0 and the
-- rows were filed as "unresolvable".
--
-- HOLE 2 — only INSTITUTION scope was checked, never PROGRAMME scope. This is
-- the hole the reported bug fell through. KESTER R (DB23029), Dental BDS, held
-- 'Semester IV' / code MPHARM-RA-SEM-4 — JKKN College of Pharmacy's M.Pharm
-- (Regulatory Affairs) row. Institution scope caught that one only because the
-- donor was a different college. Had the donor been another DENTAL programme,
-- the old guard would have waved it straight through — and 25 rows proved
-- exactly that, holding a right-institution/wrong-programme semester.
-- `semesters` and `sections` are programme-scoped by design (Dental has six
-- distinct rows named '1 Year', one per programme), so institution scope alone
-- can never be sufficient.
--
-- WHAT IS DELIBERATELY *NOT* ENFORCED: section.semester_id = learner.semester_id.
-- That one has a legitimate failure mode — a learner is promoted and the
-- section has not moved with them yet — so a hard rule would make ordinary
-- promotion order-dependent and could fail mid-flow. It is surfaced through
-- v_learner_scope_violations instead, where it can be reviewed rather than
-- blocked. (Exactly 1 row group-wide is in that state today, an LTI test
-- fixture.)
--
-- STILL CHANGE-TRIGGERED, ON PURPOSE. Every check fires only when a column that
-- actually participates in it changes (or on INSERT). Unconditional validation
-- would make the 20 known-bad rows uneditable — including uneditable in order to
-- FIX them. Those 20 are 17 [TEST]/LTI fixtures plus 3 'reserved' Pharmacy
-- learners whose true values are an admissions decision.
--
-- NULL-SAFE THROUGHOUT: program_id is nullable (894 learners hold no section,
-- 74 no semester, and the Nattraja CBSE rows hold no programme). A NULL on
-- either side skips the check rather than raising.

CREATE OR REPLACE FUNCTION public.validate_learner_semester_year_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid;
  v_prog uuid;
BEGIN
  IF NEW.institution_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── institution scope ────────────────────────────────────────────────────
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

  -- Added 2026-08-08 — program_id had NO validation of any kind before today.
  IF NEW.program_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.program_id     IS DISTINCT FROM OLD.program_id
          OR NEW.institution_id IS DISTINCT FROM OLD.institution_id) THEN
    SELECT pr.institution_id INTO v_inst
      FROM public.programs pr WHERE pr.id = NEW.program_id;
    IF FOUND AND v_inst IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION
        'program_id % belongs to institution %, not the learner''s institution %',
        NEW.program_id, v_inst, NEW.institution_id
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

  -- ── programme scope (added 2026-08-08) ───────────────────────────────────
  -- Institution scope cannot distinguish 'Semester I of B.Sc CS' from
  -- 'Semester I of B.A. English'. Both are real rows of the right college and
  -- both render the identical label. Only this check separates them.
  IF NEW.semester_id IS NOT NULL AND NEW.program_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.semester_id IS DISTINCT FROM OLD.semester_id
          OR NEW.program_id  IS DISTINCT FROM OLD.program_id) THEN
    SELECT s.program_id INTO v_prog
      FROM public.semesters s WHERE s.id = NEW.semester_id;
    IF FOUND AND v_prog IS DISTINCT FROM NEW.program_id THEN
      RAISE EXCEPTION
        'semester_id % belongs to programme %, not the learner''s programme %',
        NEW.semester_id, v_prog, NEW.program_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.section_id IS NOT NULL AND NEW.program_id IS NOT NULL
     AND (TG_OP = 'INSERT'
          OR NEW.section_id IS DISTINCT FROM OLD.section_id
          OR NEW.program_id IS DISTINCT FROM OLD.program_id) THEN
    SELECT sc.program_id INTO v_prog
      FROM public.sections sc WHERE sc.id = NEW.section_id;
    IF FOUND AND v_prog IS DISTINCT FROM NEW.program_id THEN
      RAISE EXCEPTION
        'section_id % belongs to programme %, not the learner''s programme %',
        NEW.section_id, v_prog, NEW.program_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_learner_semester_year_scope() IS
  'Scope guard for learners_profiles academic FKs. Institution scope: degree, department, program, semester, academic_year, section. Programme scope: semester, section. Change-triggered so pre-existing violations stay editable. Section-vs-semester is intentionally NOT enforced (legitimate promotion drift) — see v_learner_scope_violations.';

-- ---------------------------------------------------------------------------
-- Standing detector. A trigger only guards NEW writes; it can never surface
-- damage already sitting in the table. That gap is the entire reason the
-- 2026-07-30 corruption survived until a user happened to look up one learner.
--
-- security_invoker: the view answers with whatever rows the caller's RLS lets
-- them see, so it does not become a way around institution scoping.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_learner_scope_violations
WITH (security_invoker = true) AS
SELECT lp.id AS learner_id,
       lp.roll_number,
       trim(lp.first_name || ' ' || COALESCE(lp.last_name, '')) AS learner_name,
       lp.lifecycle_status,
       lp.institution_id,
       i.name AS institution_name,
       p.program_name,
       CASE
         WHEN d.id   IS NOT NULL AND d.institution_id   IS DISTINCT FROM lp.institution_id THEN 'degree_wrong_institution'
         WHEN dep.id IS NOT NULL AND dep.institution_id IS DISTINCT FROM lp.institution_id THEN 'department_wrong_institution'
         WHEN p.id   IS NOT NULL AND p.institution_id   IS DISTINCT FROM lp.institution_id THEN 'program_wrong_institution'
         WHEN ay.id  IS NOT NULL AND ay.institution_id  IS DISTINCT FROM lp.institution_id THEN 'academic_year_wrong_institution'
         WHEN sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id THEN 'semester_wrong_institution'
         WHEN sec.id IS NOT NULL AND sec.institution_id IS DISTINCT FROM lp.institution_id THEN 'section_wrong_institution'
         WHEN sem.id IS NOT NULL AND sem.program_id     IS DISTINCT FROM lp.program_id     THEN 'semester_wrong_programme'
         WHEN sec.id IS NOT NULL AND sec.program_id     IS DISTINCT FROM lp.program_id     THEN 'section_wrong_programme'
         ELSE 'section_wrong_semester'
       END AS violation,
       sem.semester_name AS stored_semester_name,
       sem.semester_code AS stored_semester_code,
       sec.section_name  AS stored_section_name,
       lp.updated_at
FROM public.learners_profiles lp
LEFT JOIN public.institutions   i   ON i.id   = lp.institution_id
LEFT JOIN public.degrees        d   ON d.id   = lp.degree_id
LEFT JOIN public.departments    dep ON dep.id = lp.department_id
LEFT JOIN public.programs       p   ON p.id   = lp.program_id
LEFT JOIN public.semesters      sem ON sem.id = lp.semester_id
LEFT JOIN public.sections       sec ON sec.id = lp.section_id
LEFT JOIN public.academic_years ay  ON ay.id  = lp.academic_year_id
WHERE (d.id   IS NOT NULL AND d.institution_id   IS DISTINCT FROM lp.institution_id)
   OR (dep.id IS NOT NULL AND dep.institution_id IS DISTINCT FROM lp.institution_id)
   OR (p.id   IS NOT NULL AND p.institution_id   IS DISTINCT FROM lp.institution_id)
   OR (ay.id  IS NOT NULL AND ay.institution_id  IS DISTINCT FROM lp.institution_id)
   OR (sem.id IS NOT NULL AND sem.institution_id IS DISTINCT FROM lp.institution_id)
   OR (sec.id IS NOT NULL AND sec.institution_id IS DISTINCT FROM lp.institution_id)
   OR (sem.id IS NOT NULL AND lp.program_id IS NOT NULL AND sem.program_id IS DISTINCT FROM lp.program_id)
   OR (sec.id IS NOT NULL AND lp.program_id IS NOT NULL AND sec.program_id IS DISTINCT FROM lp.program_id)
   OR (sec.id IS NOT NULL AND lp.semester_id IS NOT NULL AND sec.semester_id IS DISTINCT FROM lp.semester_id);

COMMENT ON VIEW public.v_learner_scope_violations IS
  'Standing integrity report: learners whose academic FKs fall outside their own institution or programme. Empty is the healthy state. A same-named FK from another college renders correctly in every list, so this view — not the UI — is how that class of corruption is found.';
