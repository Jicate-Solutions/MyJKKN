-- ============================================================================
-- Migration: 20271008200600_hr_candidate_salary_suggestion_inputs
-- A suggested salary for a CANDIDATE on the hiring screen ("Propose Package").
-- ============================================================================
-- Created: 2026-10-08 - the Director: "Why can't it suggest the salary from pay
--   scale? ... Do all it takes to show up the suggest salary."
--
-- Updated: 2026-10-09 - the Director (9 Oct 05:20): years before JKKN count
--   ONLY when HR writes a CV note saying where they come from (e.g. "CV page
--   2"); a college with no band is named in one plain line. Added
--   prior_experience_source and the college name to the function's output.
--   This file was unapplied and on no other branch when edited.
--
-- Updated: 2026-10-09 - review panel round 1 (still unapplied, edited in
--   place): the band, like the rule, ignores a retired or never-published
--   row; at most one band row and one rule row are read (LIMIT 1); a job
--   title of another HR organisation or a department of another college
--   (left behind when the candidate's college changed) counts as not picked.
--
-- ADD ONLY. Four nullable columns on hr_recruitment_candidates and one
-- read-only function. Nothing is dropped, nothing is backfilled, nobody's pay
-- or package changes. A figure reaches a package only when a person presses
-- "Propose" in the dialog.
--
-- WHY NEW COLUMNS. A candidate today carries only a free-text role_title and
-- no department and no experience, and is not linked to a job. The suggestion
-- needs (a) the OFFICIAL job title the college's pay band is keyed on, (b) the
-- department the Director's amount per year is set for, and (c) the years of
-- experience before JKKN. role_title stays exactly as it is.
--
--   designation_id          → hr_designations(id)   the official job title
--   department_id           → departments(id)        the department hired into
--   prior_experience_years  numeric(4,1), >= 0      NULL = not recorded
--   prior_experience_source text                    the CV note for those years,
--                                                   e.g. "CV page 2". NULL or blank
--                                                   = no note: the years are NOT
--                                                   counted.
--
-- ON DELETE SET NULL on both links: removing a designation or a department
-- must never delete a candidate; the suggestion then says which input is
-- missing.
--
-- THE FIGURE (worked out in TypeScript, lib/hr/candidate-salary-suggestion.ts):
-- band floor for the job title at the candidate's college + HALF the
-- department's amount per year × years before JKKN, counted only when the
-- CV note is written. No years at JKKN (they
-- have not joined), no current pay, never a "pay cut" comparison.
--
-- DEPENDS ON hr_salary_rule_department_rate(jsonb, uuid) and
-- hr_salary_rule_round_to(jsonb) (20270512080000 / 20270512090000). Section 0
-- stops, changing nothing, if either is missing.
-- No inner BEGIN/COMMIT. Idempotent: safe to apply twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. The two pure rule helpers must already be here.
-- ----------------------------------------------------------------------------
DO $check$
BEGIN
  IF to_regprocedure('public.hr_salary_rule_department_rate(jsonb, uuid)') IS NULL
     OR to_regprocedure('public.hr_salary_rule_round_to(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'ABORT: hr_salary_rule_department_rate / hr_salary_rule_round_to are missing. Apply 20270512080000 (or 20270512090000) first.';
  END IF;
END
$check$;

-- ----------------------------------------------------------------------------
-- 1. The four inputs on the candidate
-- ----------------------------------------------------------------------------
ALTER TABLE public.hr_recruitment_candidates
  ADD COLUMN IF NOT EXISTS designation_id uuid
    REFERENCES public.hr_designations(id) ON DELETE SET NULL;

ALTER TABLE public.hr_recruitment_candidates
  ADD COLUMN IF NOT EXISTS department_id uuid
    REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.hr_recruitment_candidates
  ADD COLUMN IF NOT EXISTS prior_experience_years numeric(4,1)
    CONSTRAINT hr_recruitment_candidates_prior_experience_years_check
    CHECK (prior_experience_years >= 0);

ALTER TABLE public.hr_recruitment_candidates
  ADD COLUMN IF NOT EXISTS prior_experience_source text;

COMMENT ON COLUMN public.hr_recruitment_candidates.designation_id IS
  'The official job title (hr_designations) the candidate is hired as; the pay band is looked up by its name. role_title stays the free-text title. Migration 20271008200600.';
COMMENT ON COLUMN public.hr_recruitment_candidates.department_id IS
  'The department the candidate is hired into; picks the Director''s amount per year in hr.salary_suggestion_rule. Migration 20271008200600.';
COMMENT ON COLUMN public.hr_recruitment_candidates.prior_experience_years IS
  'Years of experience before JKKN, one decimal. NULL = not recorded (not counted); 0 = none. Counted in the suggested salary only with prior_experience_source. Migration 20271008200600.';
COMMENT ON COLUMN public.hr_recruitment_candidates.prior_experience_source IS
  'Where the years before JKKN come from, written by HR, e.g. "CV page 2". NULL or blank = no note: the suggested salary does not count the years (the Director, 9 Oct 2026). Migration 20271008200600.';

-- ----------------------------------------------------------------------------
-- 2. hr_candidate_salary_suggestion_inputs(p_candidate_id)
-- ----------------------------------------------------------------------------
-- What the suggestion needs about ONE candidate, for the server route
-- GET /api/hr/recruitment/candidates/<id>/salary-suggestion:
--   - the college's name, the official job title (by name) and the
--     department (id and name);
--   - the years before JKKN and the CV note for them;
--   - the college's pay band (the `hr.pay_scales` row; a retired or
--     never-published row is ignored);
--   - from the rule, ONLY the amount for this department and the rounding
--     step — never the row, never another department's amount. PUBLISHED
--     value only (never draft_value; a never-published row is ignored).
--
-- TWO CHECKS, the same shape as hr_salary_suggestion_inputs():
--   1. user_has_permission('hr.payroll.salary.view') must be TRUE, or RAISE
--      42501 — "IS NOT TRUE", so a NULL answer (anon, no profile) refuses.
--   2. the candidate must be one the caller may already see: exactly the
--      predicate of the hr_recruitment_candidates SELECT policy
--      (super admin, admin, hr.recruitment.view + role_has_institution_access,
--      or the person who submitted the candidate). Each term is written
--      "IS TRUE" so a NULL never admits. All helpers read auth.uid(), the
--      CALLER's JWT subject, not this function's owner.
--
-- READ ONLY. STABLE, no writes.
CREATE OR REPLACE FUNCTION public.hr_candidate_salary_suggestion_inputs(p_candidate_id uuid)
RETURNS TABLE(
  candidate_uuid         uuid,
  institution_id         uuid,
  institution_name       text,
  designation_id         uuid,
  designation            text,
  department_id          uuid,
  department_name        text,
  prior_experience_years numeric,
  prior_experience_source text,
  band                   jsonb,
  rule_rate              numeric,
  rule_round_to          numeric,
  rule_updated_at        timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF public.user_has_permission('hr.payroll.salary.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'hr.payroll.salary.view is required to suggest a salary.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT c.id,
         c.institution_id,
         i.name::text,
         dg.id,
         dg.name::text,
         d.id,
         d.department_name::text,
         c.prior_experience_years,
         c.prior_experience_source,
         bp.value,
         public.hr_salary_rule_department_rate(rg.value, d.id),
         public.hr_salary_rule_round_to(rg.value),
         rg.updated_at
    FROM public.hr_recruitment_candidates c
    LEFT JOIN public.institutions i
           ON i.id = c.institution_id
    -- Only a job title of the candidate's OWN HR organisation and a department
    -- of the candidate's OWN college count. If the candidate's college or HR
    -- organisation changes after these were picked, the stale link reads as
    -- "not picked" (the screen then asks for it again) instead of pairing one
    -- college's band with another college's department amount.
    LEFT JOIN public.hr_designations dg
           ON dg.id = c.designation_id
          AND dg.hr_organization_id = c.hr_organization_id
    LEFT JOIN public.departments d
           ON d.id = c.department_id
          AND d.institution_id = c.institution_id
    -- ONE band row and ONE rule row at most, so the function never returns two
    -- rows for one candidate. platform_policies' unique index
    -- (uq_platform_policies_key_scope) already allows only one per key and
    -- scope; LIMIT 1 keeps that true even if the index were ever missing. A
    -- retired (is_active false) or never-published (draft_only) row is never
    -- used, for the band exactly as for the rule.
    LEFT JOIN LATERAL (
      SELECT b.value
        FROM public.platform_policies b
       WHERE b.policy_key = 'hr.pay_scales'
         AND b.scope_type = 'institution'
         AND b.scope_id = c.institution_id
         AND b.is_active IS NOT FALSE
         AND b.publication_state <> 'draft_only'
       ORDER BY b.updated_at DESC NULLS LAST, b.id
       LIMIT 1
    ) bp ON true
    LEFT JOIN LATERAL (
      SELECT r.value, r.updated_at
        FROM public.platform_policies r
       WHERE r.policy_key = 'hr.salary_suggestion_rule'
         AND r.scope_type = 'global'
         AND r.scope_id IS NULL
         AND r.is_active IS NOT FALSE
         AND r.publication_state <> 'draft_only'
       ORDER BY r.updated_at DESC NULLS LAST, r.id
       LIMIT 1
    ) rg ON true
   WHERE c.id = p_candidate_id
     AND (
           public.is_super_admin() IS TRUE
        OR public.is_admin() IS TRUE
        OR (public.user_has_permission('hr.recruitment.view') IS TRUE
            AND public.role_has_institution_access(c.institution_id) IS TRUE)
        OR (v_uid IS NOT NULL AND c.submitted_by = v_uid)
         );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hr_candidate_salary_suggestion_inputs(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hr_candidate_salary_suggestion_inputs(uuid) TO authenticated;

COMMENT ON FUNCTION public.hr_candidate_salary_suggestion_inputs(uuid) IS
  'Inputs for the suggested salary of one recruitment candidate: college name, official job title, department, years before JKKN and their CV note, the college pay band, and from the group-wide hr.salary_suggestion_rule row only the amount for that department and the rounding step (published value only). Gated on hr.payroll.salary.view (IS NOT TRUE refuses) and on the candidate SELECT policy''s own predicate. Read only. Migration 20271008200600.';

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (down migration):
--   DROP FUNCTION IF EXISTS public.hr_candidate_salary_suggestion_inputs(uuid);
--   ALTER TABLE public.hr_recruitment_candidates
--     DROP COLUMN IF EXISTS prior_experience_source,
--     DROP COLUMN IF EXISTS prior_experience_years,
--     DROP COLUMN IF EXISTS department_id,
--     DROP COLUMN IF EXISTS designation_id;
