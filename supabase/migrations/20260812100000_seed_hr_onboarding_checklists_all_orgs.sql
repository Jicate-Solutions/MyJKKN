-- =====================================================================================
-- Give every HR organisation the cadre onboarding checklists that
-- /api/hr/recruitment/candidates/[id]/onboarding/start looks up by name.
--
-- WHY
--   That route maps candidate.role_category -> a checklist NAME and fetches
--   hr_onboarding_checklists by (hr_organization_id, checklist_name, is_active).
--   hr_onboarding_checklists is per-tenant (hr_organization_id NOT NULL), but the
--   only seed that ever ran (20260627000000_seed_hr_onboarding_checklists_per_role_category)
--   hardcoded JKKN Main Office's id. So 13 of 14 orgs held ZERO checklists and
--   "Start Onboarding" failed with
--     "No active onboarding checklist found for '<name>'. HR Admin must seed checklists first."
--   for every approved candidate outside Main Office.
--
--   Same drift class as 20260810150000_seed_non_teaching_recruitment_flows_all_orgs,
--   and the SAME candidate surfaced both: "ASSISTANT LIBRARIAN - AHS" (JAYAMMAL R,
--   candidate d59daafe) at JKKN College of Allied Health Sciences. That migration
--   unblocked her approval; she then stalled one stage later, here.
--
-- WHAT
--   Cross-joins every org against the 4 cadre checklists Main Office already holds
--   and copies the steps verbatim, so all orgs start from the live Main Office
--   content rather than a re-typed copy. The 4 names are exactly what route.ts's
--   cadreMap can resolve to, plus Supporting Technical for table parity:
--     teaching_faculty / medical -> Teaching Faculty Onboarding
--     non_teaching / contract    -> Non-Technical Administrative Staff Onboarding
--     senior_leadership          -> Administrative Leadership Onboarding
--                                   Supporting Technical Staff Onboarding (parity)
--
--   The four 'Standard Onboarding — X' rows are deliberately NOT propagated: they
--   use the {order,title} step shape and a separate cadre-id lookup path, so they
--   are not reachable from this name-based route.
--
-- PAIRED CODE CHANGE (must ship together)
--   route.ts now filters the lookup by candidate.hr_organization_id. Without it,
--   this seed BREAKS super admins: the tenant-isolation policy is
--   `hr_organization_id = auth_hr_organization_id() OR is_super_admin()`, so a
--   super admin sees all 14 same-named rows and the unscoped .maybeSingle()
--   throws PGRST116. Do not apply this seed against the old route code.
--
-- IDEMPOTENCY
--   The NOT EXISTS guard is keyed on (hr_organization_id, checklist_name) and is
--   the ONLY protection — the table has no unique constraint on that pair. Do not
--   remove it. Re-running inserts nothing.
--
-- SCOPE
--   TIER-0 safe-additive INSERT only. No DDL. No row modifications. No deletes.
-- =====================================================================================

WITH src AS (
  SELECT DISTINCT ON (checklist_name)
         checklist_name,
         steps,
         applies_to_cadre_id
  FROM hr_onboarding_checklists
  WHERE hr_organization_id = 'feb0b6ae-b040-4c21-94e0-d2243155ff5d'::uuid  -- JKKN Main Office
    AND is_active
    AND checklist_name IN (
      'Teaching Faculty Onboarding',
      'Non-Technical Administrative Staff Onboarding',
      'Administrative Leadership Onboarding',
      'Supporting Technical Staff Onboarding'
    )
  ORDER BY checklist_name, valid_from DESC, created_at DESC
)
INSERT INTO hr_onboarding_checklists (
  hr_organization_id, checklist_name, steps, applies_to_cadre_id, is_active
)
SELECT o.id,
       src.checklist_name,
       src.steps,
       -- Cadre ids are per-org; never carry Main Office's across a tenant boundary.
       NULL::uuid,
       true
FROM hr_organizations o
CROSS JOIN src
WHERE NOT EXISTS (
  SELECT 1 FROM hr_onboarding_checklists c
  WHERE c.hr_organization_id = o.id
    AND c.checklist_name     = src.checklist_name
);
