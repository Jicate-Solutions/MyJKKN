-- ============================================================================
-- COHORT CORE — M7.4: alumni → mentor pool (Phase 7 · MOAT · M4 flywheel)
-- Created: 2026-07-06  (plan: docs/cohort-core/PLAN.md, PHASE 7 · M4 → item 7.4)
-- ============================================================================
-- WHAT: v_cohort_alumni_mentor_pool — the read surface for the alumni flywheel.
--   Lists every GRADUATED cohort member (the moat's human output) as an eligible
--   mentor for a future cohort. Enrolling an alum as a mentor is done through the
--   existing RLS-governed CohortService.createMembership path (member_type='staff',
--   role='mentor') in TS — NOT a new SECURITY DEFINER RPC — so the write inherits
--   the identity + institution authorization already enforced there.
--
-- WHY (PLAN.md M4): "graduates AUTO-eligible as mentors next cohort". A cohort
--   that graduates strong operators can staff its NEXT cohort's mentor bench from
--   its own alumni — the flywheel that compounds the moat: better outcomes →
--   better mentors → better outcomes.
--
-- SECURITY: the view is WITH (security_invoker = true) so it runs under the
--   CALLER's RLS on cohort_memberships + cohorts — a graduate is only visible to
--   someone who can already see that cohort's roster (no cross-tenant leak).
--
-- NOTE on identity: a graduated 'team' member_ref is an sf100 enrollment id (a
--   team, not a person), while a graduated 'student'/'learner'/'staff' member_ref
--   IS a person (profiles/learners_profiles id). is_person flags which is which;
--   the TS enroll helper takes an explicit profile id (the actual human to make a
--   mentor), so the team-vs-person distinction never has to be resolved in SQL.
--
-- TIER: TIER-1 (new view; IDEMPOTENT via CREATE OR REPLACE; DROPS-NOTHING).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_cohort_alumni_mentor_pool
WITH (security_invoker = true) AS
SELECT
  m.id                                   AS membership_id,
  m.cohort_id                            AS source_cohort_id,
  c.kind                                 AS kind,
  c.name                                 AS source_cohort_name,
  c.institution_id                       AS institution_id,
  c.academic_year                        AS academic_year,
  m.member_type                          AS member_type,
  m.member_ref                           AS member_ref,
  (m.member_type IN ('student','learner','staff')) AS is_person,
  m.updated_at                           AS graduated_at,
  -- the captured outcome (if any) so a strong graduate can be prioritised.
  o.outcome_snapshot->>'blended_outcome' AS blended_outcome,
  o.outcome_snapshot->>'lift'            AS lift
FROM public.cohort_memberships m
JOIN public.cohorts c            ON c.id = m.cohort_id
LEFT JOIN public.cohort_outcomes o ON o.membership_id = m.id
WHERE m.status = 'graduated';

COMMENT ON VIEW public.v_cohort_alumni_mentor_pool IS
  'Phase 7 M4 — graduated cohort members eligible as mentors for future cohorts. security_invoker: respects caller RLS. Enroll via CohortService.createMembership(member_type=staff, role=mentor).';

-- Defense-in-depth: the view is security_invoker (anon would see 0 rows via base
-- RLS anyway), but revoke SELECT from anon so the view is not part of the anon
-- surface at all. Authenticated reads are governed by the base tables' RLS.
REVOKE SELECT ON public.v_cohort_alumni_mentor_pool FROM anon;

NOTIFY pgrst, 'reload schema';
